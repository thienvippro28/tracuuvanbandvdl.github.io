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

  // Đường dẫn 2 file PDF hướng dẫn (đặt file vào thư mục docs/ rồi đổi tên cho khớp)
  GUIDE_USED_BEFORE: 'docs/huong-dan-da-su-dung.pdf',
  GUIDE_NOT_USED_BEFORE: 'docs/huong-dan-chua-su-dung.pdf'
};
