/**
 * BACKEND NHẬN FILE PDF TỪ TRANG WEB -> UPLOAD GOOGLE DRIVE -> GHI GOOGLE SHEET
 * --------------------------------------------------------------------------
 * Cách cài đặt (làm 1 lần):
 * 1. Mở Google Sheet "Tra Cứu Pháp Lý Các Văn Bản Basic"
 *    (sheet id: 13N1nYKQmwbZZJtRM6iOuw1qLYpG4BGdhu5WPCXUEGaw)
 * 2. Vào Extensions > Apps Script
 * 3. Xoá nội dung mặc định trong Code.gs, dán toàn bộ nội dung file này vào.
 * 4. Bấm Deploy > New deployment
 *    - Type: Web app
 *    - Execute as: Me (tài khoản của bạn) <-- quan trọng, để dùng quyền Drive của bạn
 *    - Who has access: Anyone
 * 5. Bấm Deploy, cấp quyền (Authorize access) khi được hỏi.
 * 6. Copy "Web app URL" -> dán vào file assets/config.js bên trang web (APPS_SCRIPT_URL).
 *
 * Nếu sau này bạn sửa code này, phải Deploy > Manage deployments > sửa
 * deployment hiện tại (chọn version mới) để URL không bị đổi.
 */

// ====== CẤU HÌNH (đổi nếu cần) ======
const DRIVE_FOLDER_ID = '1v7wU6w3rUr5nyWoC6bGeahSDCx6E1hvV';
const SHEET_ID = '1a7rzk2j_Zw2qxrg78O70sYBTAZnvMRjDUsZ5NZI1SvM';
const SHEET_NAME = 'Link Văn Bản (Người dùng nhập link Drive vào)';
const STATUS_VALUE = 'Mới'; // giá trị dropdown mặc định khi mới nhận file
const STATUS_DONE_VALUE = 'Hoàn thành'; // giá trị dropdown khi xử lý xong, web sẽ chờ tới khi thấy giá trị này
const STATUS_COLUMN = 2; // cột B
const LINK_COLUMN = 1; // cột A

/**
 * Nhận request POST (multipart form chứa file PDF), xử lý, trả về JSON.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: 'Không nhận được dữ liệu gửi lên.' });
    }

    // Frontend gửi JSON (base64) thay vì multipart/form-data, vì Apps Script
    // xử lý base64-trong-JSON ổn định hơn nhiều so với việc tự ghép multipart.
    const body = JSON.parse(e.postData.contents);
    const base64Data = body.fileBase64;
    const fileName = body.fileName || ('VanBan_' + new Date().getTime() + '.pdf');
    const mimeType = body.mimeType || 'application/pdf';

    if (!base64Data) {
      return jsonResponse({ success: false, error: 'Không nhận được dữ liệu file.' });
    }

    // 1. Decode base64 -> blob
    const decoded = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decoded, mimeType, fileName);

    // 2. Upload lên Google Drive folder chỉ định
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const driveFile = folder.createFile(blob);

    // 3. Share "Anyone with the link can view"
    driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // 4. Lấy link xem file
    const fileUrl = driveFile.getUrl(); // dạng https://drive.google.com/file/d/<id>/view?usp=drivesdk

    // 5. Append vào Sheet (dòng trống tiếp theo ở cột A) + set cột B = "Mới"
    const rowNumber = appendLinkToSheet(fileUrl);

    return jsonResponse({
      success: true,
      fileUrl: fileUrl,
      fileId: driveFile.getId(),
      fileName: fileName,
      row: rowNumber
    });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message || String(err) });
  }
}

/**
 * Ghi link vào dòng trống đầu tiên ở cột A, set cột B = "Mới".
 * Trả về số dòng vừa ghi.
 */
function appendLinkToSheet(fileUrl) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000); // chờ tối đa 20s nếu có request khác đang ghi

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      throw new Error('Không tìm thấy sheet tên: ' + SHEET_NAME);
    }

    const targetRow = findNextEmptyRow(sheet);

    // Ghi cột A = link
    sheet.getRange(targetRow, LINK_COLUMN).setValue(fileUrl);

    // Ghi cột B = "Mới" (giữ đúng giá trị dropdown đã thiết lập sẵn bằng Data Validation)
    sheet.getRange(targetRow, STATUS_COLUMN).setValue(STATUS_VALUE);

    return targetRow;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Tìm dòng trống đầu tiên ở cột A (bắt đầu từ dòng 2, sau header).
 * Dùng chung cho cả việc ghi thật (appendLinkToSheet) và đoán trước
 * (handleGetNextRow) để 2 nơi luôn nhất quán cùng 1 logic.
 */
function findNextEmptyRow(sheet) {
  const lastRow = sheet.getLastRow();
  const colAValues = sheet.getRange(1, LINK_COLUMN, Math.max(lastRow, 1), 1).getValues();

  let targetRow = -1;
  for (let i = 1; i < colAValues.length; i++) { // i=1 -> dòng 2 (bỏ header dòng 1)
    if (!colAValues[i][0] || colAValues[i][0].toString().trim() === '') {
      targetRow = i + 1; // chuyển index 0-based -> số dòng thật
      break;
    }
  }
  if (targetRow === -1) {
    targetRow = lastRow + 1; // không có dòng trống ở giữa -> ghi xuống cuối
  }
  if (targetRow < 2) {
    targetRow = 2; // tối thiểu là dòng 2 (dòng 1 là header)
  }
  return targetRow;
}

/**
 * doGet hỗ trợ 2 việc:
 * 1. Không có param gì -> kiểm tra nhanh server còn sống không.
 * 2. ?action=checkStatus&row=<số dòng> -> trả về giá trị hiện tại của cột B
 *    (Trạng Thái) tại dòng đó, để frontend polling chờ tới khi "Hoàn thành".
 */
function doGet(e) {
  const action = e && e.parameter ? e.parameter.action : null;

  if (action === 'checkStatus') {
    return handleCheckStatus(e);
  }
  if (action === 'getNextRow') {
    return handleGetNextRow(e);
  }

  return jsonResponse({ success: true, message: 'Apps Script Web App đang hoạt động.' });
}

/**
 * Trả về số dòng trống kế tiếp ở cột A, KHÔNG ghi gì cả — chỉ để frontend
 * biết trước nó sẽ rơi vào dòng nào, trước khi POST file lên bằng no-cors
 * (no-cors không cho đọc response của POST, nên phải biết trước số dòng
 * bằng một lượt GET riêng).
 */
function handleGetNextRow(e) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      return jsonResponse({ success: false, error: 'Không tìm thấy sheet tên: ' + SHEET_NAME });
    }
    const row = findNextEmptyRow(sheet);
    return jsonResponse({ success: true, row: row });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message || String(err) });
  }
}

/**
 * Đọc giá trị cột A (link) và cột B (Trạng Thái) tại dòng được hỏi.
 * Trả thêm cột A để frontend tự xác minh đúng dòng (phòng trường hợp hiếm
 * có 2 người gửi cùng lúc khiến số dòng đoán trước bị lệch 1 dòng).
 */
function handleCheckStatus(e) {
  try {
    const row = parseInt(e.parameter.row, 10);
    if (!row || row < 2) {
      return jsonResponse({ success: false, error: 'Số dòng không hợp lệ.' });
    }

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      return jsonResponse({ success: false, error: 'Không tìm thấy sheet tên: ' + SHEET_NAME });
    }

    const link = sheet.getRange(row, LINK_COLUMN).getValue();
    const status = sheet.getRange(row, STATUS_COLUMN).getValue();

    return jsonResponse({
      success: true,
      row: row,
      link: link ? link.toString() : '',
      status: status ? status.toString() : ''
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message || String(err) });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
