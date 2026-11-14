# OM/QM Lite

Add-in Excel (Office.js) thay cho Excel OM/QM v5 trên Mac. Đủ 29 module của danh mục gốc, cộng thêm module Tài chính cho môn Phân tích định lượng (khoảng 105 mô hình).

## Cách dùng
1. Mở Excel. Lần đầu sau khi mở: **Home → Add-ins → Developer Add-ins → OM/QM Lite** (sau đó nút OM/QM Lite hiện ở tab Home).
2. Chọn hoặc tìm mô hình (gõ không cần dấu: "du bao", "ton kho", "hang doi").
3. **Tạo bảng nhập trên sheet mới** → điền ô màu vàng (tick "Điền sẵn ví dụ" để có số liệu mẫu).
4. **Giải** → kết quả ra sheet mới "KQ …". Ô xanh là công thức Excel thật: sửa ô vàng là tự tính lại. Ô có ghi chú "tính sẵn" thì bấm Giải lại sau khi sửa.
Add-in không bao giờ xoá hay ghi đè sheet có sẵn. Nhập sai thì ô lỗi được chọn sẵn.
- Mỗi mô hình có dòng hướng dẫn cách nhập ngay dưới tiêu đề bước 1.
- Thanh **Tất cả / POM / QM** ở màn hình chính lọc danh mục theo bộ menu (phân loại gần đúng theo POM-QM).
- Cây quyết định được vẽ trên sheet (hình vuông = quyết định, tròn = ngẫu nhiên, đường đậm = lựa chọn tốt nhất) và xem trước ngay trong pane.

## Các module
Hoạch định & dự báo: Dự báo (15 mô hình, gồm trung bình giản đơn, san bằng trên chuỗi khử mùa, hồi quy có ANOVA/kiểm định t, F/khoảng tin cậy/khoảng dự báo/hệ số co dãn), Hoạch định tổng hợp · Tối ưu hoá: QH tuyến tính (độ nhạy, đồ thị, bảng lặp), QH nguyên, QH mục tiêu, Vận tải, Phân công, Mạng (cây khung, đường ngắn nhất, luồng cực đại) · Ra quyết định: Bảng quyết định / cây quyết định / tồn kho một kỳ / xác suất hậu nghiệm Bayes / xác suất từ bảng tần suất, Trò chơi, Markov · Tài chính: Hoà vốn, NPV/IRR, **Giá trị thời gian của tiền** (lãi suất thực/danh nghĩa, niên kim, khoản trả đều, lịch trả nợ, tìm lãi suất trả góp, so sánh dự án với đồ thị NPV, chọn thiết bị, mua hay thuê, dự án có khấu hao và thuế) · Dự án: PERT/CPM (AON, AOA, crashing, ngân sách) · Tồn kho & vận hành: Tồn kho (8), Cỡ lô, MRP, Hàng đợi (9), Lập lịch, Cân bằng dây chuyền, Bố trí mặt bằng, Địa điểm, Đường cong học tập, Năng suất, Đo lường công việc · Chất lượng: Kiểm soát chất lượng (6), Độ tin cậy · Thống kê: Thống kê & phân phối, Mô phỏng.

## Cài đặt độc lập
```
./install.sh        # cài / cập nhật
./uninstall.sh      # gỡ
```
- Cài vào `~/Library/Application Support/OMQM-Lite` (có Node riêng), server HTTPS cục bộ cổng 47310 tự chạy khi đăng nhập (LaunchAgent `com.omqmlite.server`, log `~/Library/Logs/omqm-lite.log`).
- Manifest: `~/Library/Containers/com.microsoft.Excel/Data/Documents/wef/omqm-lite.manifest.xml`. Khi đổi manifest phải tăng `<Version>` (Excel lưu bản cũ theo Id + phiên bản).
- Chứng chỉ localhost phải được tin cậy một lần (`sudo security add-trusted-cert …`, install.sh in lệnh nếu cần). Hết hạn ngày in ra khi cài; khi đó chạy `./install.sh --new-cert`.
- Pane tải Office.js từ máy chủ Microsoft nên cần có mạng.

## Phát triển
- `npm test` — kiểm thử phần tính toán và báo cáo (136 test, đối chiếu giá trị giáo trình và vét cạn).
- Tự kiểm tra trong Excel: tạo file rỗng `.selftest` trong thư mục server (bản cài: `~/Library/Application Support/OMQM-Lite/app`), mở pane trong workbook **trống**; add-in chạy mọi mô hình với ví dụ mẫu, so từng ô công thức Excel với số JavaScript và ghi `selftest.log`. Nội dung file là bộ lọc theo tên mô hình (ví dụ `decision.tree`); khi nội dung file đổi, pane tự tải lại và chạy lại. **Xoá `.selftest` khi xong.**
- Cấu trúc: `lib/` thuật toán thuần; `src/core/` bố cục báo cáo, định dạng, đọc/ghi workbook; `src/modules/` mỗi module khai báo bảng nhập, parse, solve, summary, report; `docs/audit.html` báo cáo audit.
