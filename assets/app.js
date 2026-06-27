(function () {
  'use strict';

  // ============ DOM refs ============
  const uploadBox = document.getElementById('uploadBox');
  const fileInput = document.getElementById('fileInput');
  const sendBtn = document.getElementById('sendBtn');
  const statusLine = document.getElementById('statusLine');
  const scanTrack = document.getElementById('scanTrack');

  const guideToggle = document.getElementById('guideToggle');
  const guideSub = document.getElementById('guideSub');
  const btnHasFriend = document.getElementById('btnHasFriend');
  const btnNoFriend = document.getElementById('btnNoFriend');
  const modalHasFriend = document.getElementById('modalHasFriend');
  const modalNoFriend = document.getElementById('modalNoFriend');

  let selectedFile = null;
  let pollTimer = null;

  // ============ Guide toggle + modals (Mục 02) ============
  guideToggle.addEventListener('click', function () {
    guideSub.classList.toggle('open');
    guideToggle.textContent = guideSub.classList.contains('open')
      ? 'Ẩn các phương án'
      : 'Xem phương án chi tiết';
  });

  btnHasFriend.addEventListener('click', function () {
    openModal(modalHasFriend);
  });
  btnNoFriend.addEventListener('click', function () {
    openModal(modalNoFriend);
  });

  document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
    // đóng khi bấm nút X
    overlay.querySelectorAll('[data-close]').forEach(function (btn) {
      btn.addEventListener('click', function () { closeModal(overlay); });
    });
    // đóng khi bấm ra ngoài modal-box
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal(overlay);
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(closeModal);
    }
  });

  function openModal(overlay) {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(overlay) {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ============ Upload box interactions ============
  uploadBox.addEventListener('click', function () {
    fileInput.click();
  });

  uploadBox.addEventListener('dragover', function (e) {
    e.preventDefault();
    uploadBox.classList.add('drag');
  });
  uploadBox.addEventListener('dragleave', function () {
    uploadBox.classList.remove('drag');
  });
  uploadBox.addEventListener('drop', function (e) {
    e.preventDefault();
    uploadBox.classList.remove('drag');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files[0]) {
      handleFile(fileInput.files[0]);
    }
  });

  function handleFile(file) {
    if (file.type !== 'application/pdf') {
      setStatus('Chỉ nhận file PDF. Vui lòng chọn lại.', 'err');
      return;
    }
    const maxBytes = (CONFIG.MAX_FILE_SIZE_MB || 25) * 1024 * 1024;
    if (file.size > maxBytes) {
      setStatus('File vượt quá ' + CONFIG.MAX_FILE_SIZE_MB + 'MB. Vui lòng chọn file nhỏ hơn.', 'err');
      return;
    }

    stopPolling();
    selectedFile = file;
    setStatus('', '');

    uploadBox.classList.add('has-file');
    uploadBox.innerHTML =
      '<span class="file-icon">PDF</span>' +
      '<span class="file-name">' + escapeHtml(file.name) + '</span>';

    sendBtn.disabled = false;
  }

  // ============ Send button ============
  sendBtn.addEventListener('click', function () {
    if (!selectedFile) return;

    if (!CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.indexOf('http') !== 0) {
      setStatus('Chưa cấu hình địa chỉ máy chủ (APPS_SCRIPT_URL). Vui lòng liên hệ quản trị trang.', 'err');
      return;
    }

    const fileBeingSent = selectedFile;
    sendBtn.disabled = true;
    scanTrack.classList.add('active');
    setStatus('Đang tải file lên...', '');

    // BƯỚC 1: hỏi trước dòng trống kế tiếp bằng GET JSON bình thường.
    getNextRow()
      .then(function (rowData) {
        if (!rowData || !rowData.success) {
          throw new Error(rowData && rowData.error ? rowData.error : 'Không lấy được số dòng kế tiếp.');
        }
        const expectedRow = rowData.row;

        // BƯỚC 2: gửi file bằng no-cors. Apps Script Web App trả response
        // qua một redirect không có header CORS, nên fetch() ở mode 'cors'
        // bình thường sẽ bị trình duyệt chặn và báo lỗi "Failed to fetch"
        // dù server đã nhận và xử lý đúng. Dùng 'no-cors' để request luôn
        // được gửi đi; đổi lại không đọc được response trực tiếp nên xác
        // minh kết quả thật bằng polling ngay sau đây.
        return fileToBase64(fileBeingSent).then(function (base64) {
          return fetch(CONFIG.APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              fileBase64: base64,
              fileName: fileBeingSent.name,
              mimeType: fileBeingSent.type || 'application/pdf'
            })
          }).then(function () {
            return expectedRow;
          });
        });
      })
      .then(function (expectedRow) {
        scanTrack.classList.remove('active');
        setStatus('Đã gửi thành công. Văn bản đã được đưa vào hàng chờ xử lý.', 'ok');
        resetUploadBox();
        startPolling(expectedRow);
      })
      .catch(function (err) {
        scanTrack.classList.remove('active');
        setStatus('Không thể kết nối tới máy chủ. Vui lòng thử lại sau.', 'err');
        sendBtn.disabled = false;
      });
  });

  function getNextRow() {
    const url = CONFIG.APPS_SCRIPT_URL + '?action=getNextRow';
    return fetch(url).then(function (res) { return res.json(); });
  }

  // ============ Polling trạng thái cột B ============
  // Polling vừa xác nhận việc ghi đã thật sự xảy ra (cột A có link, không còn
  // trống), vừa chờ tới khi cột B = "Hoàn thành". Vì POST dùng no-cors nên
  // đây là cách duy nhất để biết chắc upload có thành công hay không.
  function startPolling(expectedRow) {
    if (!expectedRow) return;

    stopPolling();

    const intervalMs = (CONFIG.POLL_INTERVAL_SECONDS || 5) * 1000;
    const timeoutMs = (CONFIG.POLL_TIMEOUT_MINUTES || 10) * 60 * 1000;
    const startedAt = Date.now();
    const doneValue = (CONFIG.STATUS_DONE_VALUE || 'Hoàn thành').trim();

    let currentRow = expectedRow;
    let sawLinkWritten = false; // đã thấy cột A có dữ liệu ở dòng đang theo dõi chưa

    appendWaitingMessage();

    pollTimer = setInterval(function () {
      if (Date.now() - startedAt > timeoutMs) {
        stopPolling();
        setStatus(
          'Đã gửi văn bản nhưng việc xử lý đang lâu hơn dự kiến. Vui lòng vào Sheet kết quả để kiểm tra trực tiếp: ' + CONFIG.RESULT_SHEET_URL,
          'err'
        );
        return;
      }

      checkStatus(currentRow)
        .then(function (data) {
          if (!data || !data.success) return; // lỗi tạm thời, thử lại lượt sau

          if (!sawLinkWritten) {
            if (data.link && data.link.trim() !== '') {
              sawLinkWritten = true;
            } else {
              // Dòng đoán trước vẫn trống -> có thể có người khác vừa ghi
              // chen vào trước, dò thêm 1 dòng kế tiếp ở lượt poll sau.
              currentRow = currentRow + 1;
              return;
            }
          }

          const current = (data.status || '').trim();
          if (current === doneValue) {
            stopPolling();
            showDoneMessage();
          }
        })
        .catch(function () {
          // lỗi mạng tạm thời -> bỏ qua, sẽ thử lại ở lượt poll kế tiếp
        });
    }, intervalMs);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function checkStatus(row) {
    const url = CONFIG.APPS_SCRIPT_URL + '?action=checkStatus&row=' + encodeURIComponent(row);
    return fetch(url).then(function (res) { return res.json(); });
  }

  function appendWaitingMessage() {
    statusLine.innerHTML =
      '<span class="ok">Đã gửi thành công. Văn bản đã được đưa vào hàng chờ xử lý.</span><br>' +
      '<span class="waiting-dot">Chờ trong ít phút...</span>';
    statusLine.classList.remove('err');
  }

  function showDoneMessage() {
    statusLine.innerHTML =
      '<span class="ok">Đã xử lý hoàn tất. Vui lòng vào đường link này để xem nội dung kết quả:</span><br>' +
      '<a class="result-link" href="' + CONFIG.RESULT_SHEET_URL + '" target="_blank" rel="noopener">' +
      CONFIG.RESULT_SHEET_URL + '</a>';
  }

  function resetUploadBox() {
    selectedFile = null;
    fileInput.value = '';
    uploadBox.classList.remove('has-file');
    uploadBox.innerHTML = 'Bấm để chọn file, hoặc kéo thả file PDF vào đây';
    sendBtn.disabled = true;
  }

  function setStatus(msg, kind) {
    statusLine.textContent = msg;
    statusLine.classList.remove('ok', 'err');
    if (kind) statusLine.classList.add(kind);
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const result = reader.result;
        const base64 = result.substring(result.indexOf(',') + 1);
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
