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
  const guideUsed = document.getElementById('guideUsed');
  const guideNotUsed = document.getElementById('guideNotUsed');

  let selectedFile = null;
  let pollTimer = null;

  // ============ Guide links (Mục 02) ============
  guideUsed.href = CONFIG.GUIDE_USED_BEFORE;
  guideNotUsed.href = CONFIG.GUIDE_NOT_USED_BEFORE;

  guideToggle.addEventListener('click', function () {
    guideSub.classList.toggle('open');
    guideToggle.textContent = guideSub.classList.contains('open')
      ? 'Ẩn tài liệu hướng dẫn'
      : 'Xem tài liệu hướng dẫn';
  });

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

    sendBtn.disabled = true;
    scanTrack.classList.add('active');
    setStatus('Đang tải file lên...', '');

    fileToBase64(selectedFile)
      .then(function (base64) {
        return fetch(CONFIG.APPS_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            fileBase64: base64,
            fileName: selectedFile.name,
            mimeType: selectedFile.type || 'application/pdf'
          })
        });
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        scanTrack.classList.remove('active');
        if (data && data.success) {
          // Giai đoạn 1: upload xong
          setStatus('Đã gửi thành công. Văn bản đã được đưa vào hàng chờ xử lý.', 'ok');
          resetUploadBox();
          // Bắt đầu chờ tới khi cột B chuyển thành "Hoàn thành"
          startPolling(data.row);
        } else {
          setStatus('Gửi không thành công: ' + (data && data.error ? data.error : 'lỗi không xác định.'), 'err');
          sendBtn.disabled = false;
        }
      })
      .catch(function (err) {
        scanTrack.classList.remove('active');
        setStatus('Không thể kết nối tới máy chủ. Vui lòng thử lại sau.', 'err');
        sendBtn.disabled = false;
      });
  });

  // ============ Polling trạng thái cột B ============
  function startPolling(row) {
    if (!row) return;

    stopPolling();

    const intervalMs = (CONFIG.POLL_INTERVAL_SECONDS || 5) * 1000;
    const timeoutMs = (CONFIG.POLL_TIMEOUT_MINUTES || 10) * 60 * 1000;
    const startedAt = Date.now();
    const doneValue = (CONFIG.STATUS_DONE_VALUE || 'Hoàn thành').trim();

    // Giai đoạn 2: thông báo đang chờ xử lý
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

      checkStatus(row)
        .then(function (data) {
          if (!data || !data.success) return; // bỏ qua lỗi tạm thời, thử lại lượt sau
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
        // result dạng "data:application/pdf;base64,XXXXX" -> chỉ lấy phần sau dấu phẩy
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
