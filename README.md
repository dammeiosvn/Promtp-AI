# Prompt AI

Kho prompt cá nhân chạy trên **GitHub Pages**, dùng như webclip trên iPhone. Chạm một câu lệnh để gửi **nguyên văn** sang phím tắt **Prompt AI**.

Giao diện kế thừa [Bundle-ID](https://github.com/dammeiosvn/Bundle-ID): nền `#5C5C5C`, màu chữ, bóng nổi, ô tìm kiếm và bảng thao tác. Mỗi hàng hiện tên prompt và hai dòng xem trước; có ghim yêu thích, xem toàn văn, tìm kiếm không dấu và lọc thư mục.

## Thêm prompt

Tạo thư mục bất kỳ trong repo, thêm các tệp **`.txt` lưu bằng UTF-8**, rồi commit vào `main`:

```text
prompt tạo ảnh/Ảnh cưới Khmer.txt
prompt tạo ảnh/Indonesia/Hoàng gia Java.txt
prompt viết code/Rà soát JavaScript.txt
Dịch văn bản.txt
```

- **Tên tệp** → tên hiển thị, bỏ `.txt`; dấu `_` và `-` được đổi thành khoảng trắng.
- **Đường dẫn thư mục** → nhóm prompt; tệp ngoài thư mục thuộc nhóm **Chung**.
- **Nội dung tệp** → văn bản đầu vào của phím tắt, giữ nguyên xuống dòng, Unicode, emoji và ký tự đặc biệt.
- Quét thư mục con tự động, nhận cả `.TXT`. Tệp rỗng và thư mục hạ tầng (`scripts`, `tests`, `icons`, `assets`, `_site`, `node_modules`, thư mục bắt đầu bằng dấu chấm) được bỏ qua.

Mỗi lần push vào `main`, GitHub Actions tự tạo danh mục `prompts.json` và triển khai trang. **Không phải sửa HTML, JSON hay khai báo tên thư mục.** Nếu Pages xuất bản trực tiếp nhánh `main`, webclip tự quét repo public qua GitHub API và đọc các tệp `.txt`; không cần danh mục build.

Sau khi triển khai xong, mở lại webclip: nếu kho có prompt được thêm, sửa hoặc xóa, **popup cập nhật xuất hiện giữa màn hình**, kèm số thay đổi. Bấm **Cập nhật** để dùng kho mới; **Lát nữa** giữ kho đang dùng. Nút ↻ ở đầu trang mở lại popup khi còn bản chờ cập nhật. Bản webclip mới cũng dùng popup này, không có nút cập nhật ở cuối danh sách.

Bộ quét chỉ tải lại nội dung các tệp đã đổi và lưu kho prompt trên thiết bị. Cách đọc trực tiếp repo public chịu giới hạn API của GitHub; dùng workflow build bên dưới để tránh phụ thuộc API. Nếu API tạm lỗi, kho đã lưu vẫn mở được.

## Kết nối Shortcuts

Tạo phím tắt mang đúng tên **Prompt AI**. Dùng biến **Đầu vào phím tắt** làm văn bản cho các bước xử lý phía sau:

```text
shortcuts://run-shortcut?name=Prompt%20AI&input=text&text=<văn bản đã mã hóa URL>
```

Webclip gửi **toàn bộ nội dung `.txt`**, không thêm tên tệp hay tên nhóm, không đóng gói JSON và không dùng clipboard. URL được chuẩn bị sẵn trước thao tác chạm để mở Shortcuts trực tiếp. Xem [tài liệu URL scheme của Apple](https://support.apple.com/en-vn/guide/shortcuts/apd624386f42/ios).

Phần hỏi thêm dữ liệu, chọn ảnh, gọi AI/API, dịch, sửa code và trả kết quả được xây trong phím tắt. Webclip không chứa khóa API.

## Bật GitHub Pages lần đầu

1. Vào **Settings → Pages → Build and deployment → Source → GitHub Actions**.
2. Vào **Actions → Build and deploy Prompt AI → Run workflow** nếu lần chạy đầu xảy ra trước khi Pages được bật.
3. Khi triển khai thành công, mở [Prompt AI](https://dammeiosvn.github.io/Promtp-AI/) bằng Safari.
4. **Chia sẻ → Thêm vào Màn hình chính**, hoặc dùng **Cài webclip bằng cấu hình** trong bảng hướng dẫn trên trang.

Repo private cần gói GitHub hỗ trợ Pages cho repo private (ví dụ GitHub Pro). Trang Pages thông thường vẫn công khai dù repo private; các prompt trong danh mục triển khai có thể được đọc bởi người truy cập trang. Xem [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

Nếu dùng tên miền riêng, đặt Repository variable **`PAGES_BASE_URL`** bằng URL HTTPS của trang. Cấu hình webclip sẽ dùng URL này. Mặc định là `https://dammeiosvn.github.io/Promtp-AI/`.

## Webclip / PWA

- Chế độ độc lập, thanh trạng thái trong suốt, vùng an toàn cho tai thỏ/Dynamic Island và thanh Home.
- Biểu tượng PNG 180/192/512 px, manifest dùng đường dẫn tương đối đúng phạm vi repo Pages.
- Service worker lưu giao diện và toàn bộ kho prompt để mở ngoại tuyến sau lần tải đầu; tác vụ AI trong phím tắt có thể vẫn cần mạng.
- Mở kho đã chấp nhận từ bộ nhớ thiết bị trước, rồi kiểm tra bản mới khi mở/đưa app về trước (cách lần kiểm tra trước ít nhất 60 giây), khi bấm ↻ và mỗi 5 phút lúc app đang hiển thị. Lần đầu chưa có kho sẽ tải trực tiếp, không báo cập nhật giả.
- Bản mới được tải trước và chờ trong popup; chỉ thay kho sau khi bấm **Cập nhật**. Bỏ qua popup không làm mất bản kho đã chấp nhận khi mở lại. Thay đổi mã giao diện không bị tính nhầm thành prompt mới; lỗi mạng giữ kho cũ.
- Yêu thích lưu theo đường dẫn tệp trên thiết bị; đổi tên hoặc di chuyển tệp sẽ đổi định danh ghim.
- Tệp `Prompt-AI.mobileconfig` được tạo khi build: một webclip toàn màn hình, có biểu tượng, cho phép gỡ; không chứa Wi-Fi, VPN, DNS hay quản lý thiết bị. Cấu hình không ký số.
- Safari có thể dọn bộ nhớ ngoại tuyến khi thiếu dung lượng; sau đó cần mở có mạng một lần để lưu lại.

## Chạy và kiểm tra tại máy

Không có phụ thuộc npm hay Python bên ngoài. Cần Node.js 22+ và Python 3.10+:

```bash
node --test tests/*.test.js
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/build.py
python3 -m http.server 8080 --directory _site
```

Mở `http://localhost:8080`. Khuyến nghị dùng workflow GitHub Actions: danh mục được tạo sẵn, tải nhanh và không phụ thuộc GitHub API. Xuất trực tiếp nhánh `main` cũng hỗ trợ tự nhận prompt khi repo public.

`index.html`, `style.css`, `app.js`, `core.js`, `sw.js` là mã giao diện; `scripts/build.py` quét prompt và tạo `_site/`. Thư mục `_site/` là bản build, không commit. Nội dung prompt chỉ được chèn vào giao diện bằng `textContent`, không thực thi HTML/script bên trong tệp.

Độ dài URL thực tế phụ thuộc Safari/iOS. Mã không cắt nội dung prompt; với tệp đặc biệt dài, cần thử luồng nhận trên iPhone. Hiện không có giới hạn URL phổ quát được Apple công bố trong tài liệu trên.

