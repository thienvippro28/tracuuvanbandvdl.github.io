# Cổng Gửi Văn Bản — Tra Cứu Pháp Lý (Kênh thay thế Zalo Bot)

Trang web tĩnh có 2 mục:
1. **Mục 01** — Gửi file PDF → tự động upload Google Drive → ghi link vào Google Sheet
   với trạng thái "Mới", sau đó tự chờ tới khi trạng thái đổi thành "Hoàn thành" và
   hiện link Sheet kết quả.
2. **Mục 02** — 2 nút popup:
   - **ĐÃ KẾT BẠN với Bot** → hiện QR để quét gửi file trực tiếp vào khung chat Zalo Bot.
   - **CHƯA KẾT BẠN với Bot** → hiện đầy đủ các bước kết bạn nhóm Zalo + cách dùng Bot.

---

## BƯỚC 1 — Cài đặt Google Apps Script (backend)

Chạy bằng **tài khoản Google Drive của bạn**, người dùng web không cần đăng nhập Google.

1. Mở Google Sheet kết quả (sheet id trong `Code.gs`).
2. Vào **Extensions → Apps Script**.
3. Xoá hết nội dung mặc định trong `Code.gs`, dán toàn bộ nội dung file
   [`Code.gs`](./Code.gs) vào.
4. Kiểm tra lại các hằng số đầu file cho đúng với của bạn:
   ```js
   const DRIVE_FOLDER_ID = '...';
   const SHEET_ID = '...';
   const SHEET_NAME = 'Link Văn Bản (Người dùng nhập link Drive vào)';
   const STATUS_DONE_VALUE = 'Hoàn thành'; // phải khớp đúng dropdown cột B
   ```
5. **Deploy → Manage deployments** (nếu đã từng deploy) → bấm icon bút chì →
   **Version: New version → Deploy**. (Nếu đây là lần đầu, dùng **New deployment**,
   Type: **Web app**, Execute as: **Me**, Who has access: **Anyone**.)
6. Copy **Web app URL** (`https://script.google.com/macros/s/AKfycb.../exec`).

> Luôn dùng **New version** trên deployment cũ khi sửa code, không tạo deployment
> mới, để URL không đổi.

---

## BƯỚC 2 — Cấu hình trang web

Mở `assets/config.js`, điền:
```js
const CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
  RESULT_SHEET_URL: 'https://docs.google.com/spreadsheets/d/.../edit',
  STATUS_DONE_VALUE: 'Hoàn thành',
  ...
};
```

---

## BƯỚC 3 — Đưa lên GitHub Pages

```bash
git init
git add .
git commit -m "Cong gui van ban"
git branch -M main
git remote add origin https://github.com/<ten-tai-khoan>/<ten-repo>.git
git push -u origin main
```

Sau đó: repo → **Settings → Pages** → Source: **main** / **/ (root)** → **Save**.

---

## Cấu trúc thư mục

```
site/
├── index.html                    # Trang chính (2 mục + 2 modal popup)
├── Code.gs                       # Backend Apps Script
├── README.md
└── assets/
    ├── config.js                  # URL Apps Script, link Sheet kết quả, polling
    ├── app.js                      # Logic upload, polling, mở/đóng modal
    └── images/
        ├── qr-bot.png               # QR gửi file (modal "Đã kết bạn")
        └── qr-nhom-zalo.png          # QR tham gia nhóm (modal "Chưa kết bạn")
```

Muốn đổi ảnh QR: thay file cùng tên trong `assets/images/`, giữ đúng tên file.
Muốn sửa nội dung 5 bước hướng dẫn: sửa trực tiếp trong `index.html`, khối
`<div class="modal-overlay" id="modalNoFriend">`.

---

## Vì sao POST dùng `mode: 'no-cors'`?

Apps Script Web App trả response qua một redirect không có header CORS đầy đủ,
nên `fetch()` ở chế độ `cors` bình thường bị trình duyệt chặn dù server đã xử lý
đúng (lỗi `"Failed to fetch"` / `"Không thể kết nối tới máy chủ"`). Để tránh lỗi
này, `app.js` gửi file bằng `mode: 'no-cors'` (không đọc được response trực tiếp),
sau đó **xác minh kết quả thật bằng polling**: hỏi trước dòng trống kế tiếp
(`action=getNextRow`), gửi file, rồi liên tục hỏi `action=checkStatus` cho tới khi
thấy cột A có link (upload xong) và cột B = "Hoàn thành" (xử lý xong).

---

## Cách hoạt động (tóm tắt luồng dữ liệu)

```
Người dùng chọn file PDF trên web
        │
        ▼
GET ?action=getNextRow  -> biết trước dòng sẽ ghi
        │
        ▼
POST (no-cors) file base64 lên Apps Script
        │
        ▼
Apps Script: decode -> tạo file Drive -> share "Anyone with link" ->
             tìm dòng trống cột A -> ghi link (cột A) + "Mới" (cột B)
        │
        ▼
Web bắt đầu polling GET ?action=checkStatus&row=N mỗi vài giây
        │
        ├─ cột A có link?  chưa -> dò dòng kế tiếp
        │                  rồi -> tiếp tục theo dõi đúng dòng
        ▼
        cột B = "Hoàn thành"? chưa -> hiện "Chờ trong ít phút..."
                               rồi  -> hiện link Sheet kết quả, dừng polling
```

Cột C, D, E (Số Văn Bản, Ngày Ban Hành, Zalo ID) **để trống** khi gửi qua kênh
web này, vì chỉ có giá trị khi gửi qua Zalo Bot.

---

## Kiểm tra nhanh sau khi deploy

- Mở Web app URL bằng GET trên trình duyệt → thấy
  `{"success":true,"message":"..."}` là backend sống.
- Mở thêm `<URL>?action=getNextRow` → phải trả về `{"success":true,"row":N}`.
- Gửi thử 1 file PDF nhỏ → kiểm tra Drive folder có file mới, Sheet có dòng mới.
- Đổi thử cột B của dòng đó thành đúng giá trị `STATUS_DONE_VALUE` → web phải
  tự chuyển sang thông báo "Đã xử lý hoàn tất" trong vài giây.
- Lỗi → Apps Script → **Executions** (icon đồng hồ) để xem log.
