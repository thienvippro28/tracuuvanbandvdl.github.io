// ============================================================
// CẤU HÌNH TRANG WEB
// ============================================================
// Sau khi bạn Deploy Google Apps Script (xem hướng dẫn trong Code.gs),
// dán "Web app URL" vào biến dưới đây rồi push lại lên GitHub.
//
// Ví dụ URL có dạng:
// https://script.google.com/macros/s/AKfycb.................../exec
// ============================================================

const CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbz8vBdSn9DC5q85wrFD68QhRMIVfKVOnXkUk4Hz-2f2IPa869dMHyhpXLahCzYfDgy4/exec',

  // Giới hạn dung lượng file PDF (MB) - chặn ở phía trình duyệt trước khi gửi đi
  MAX_FILE_SIZE_MB: 25,

  // Link Google Sheet để người dùng xem kết quả sau khi xử lý xong
  RESULT_SHEET_URL: 'https://docs.google.com/spreadsheets/d/1a7rzk2j_Zw2qxrg78O70sYBTAZnvMRjDUsZ5NZI1SvM/edit?gid=0#gid=0',

  // Giá trị trạng thái coi là "đã xử lý xong" (phải khớp đúng chữ trong dropdown cột B)
  STATUS_DONE_VALUE: 'Hoàn thành',

  // Polling: cứ bao nhiêu giây hỏi lại trạng thái 1 lần, và tối đa chờ bao lâu thì dừng
  POLL_INTERVAL_SECONDS: 5,
  POLL_TIMEOUT_MINUTES: 25
};
