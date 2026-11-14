#!/bin/zsh
# Builds a self-contained installer folder + zip (default: ~/Desktop/OMQM-Lite-Installer[.zip]).
# It bundles this Mac's Node.js so the target Mac needs nothing installed. Same chip type only (Apple silicon / Intel).
set -euo pipefail
SRC="${0:A:h}"
OUT="${1:-$HOME/Desktop/OMQM-Lite-Installer}"
NODE="$(command -v node)" || { echo "Cần Node.js trên máy này để đóng gói."; exit 1; }
rm -rf -- "$OUT" "$OUT.zip"
mkdir -p "$OUT/runtime"
rsync -a "$SRC/taskpane.html" "$SRC/taskpane.css" "$SRC/server.mjs" "$SRC/manifest.xml" "$SRC/assets" "$SRC/lib" "$SRC/src" \
	"$SRC/install.sh" "$SRC/uninstall.sh" "$SRC/Cai-dat-OMQM-Lite.command" "$SRC/Go-OMQM-Lite.command" "$OUT/"
cp "$NODE" "$OUT/runtime/node"; chmod 755 "$OUT/runtime/node"
[[ -f "$SRC/HUONG-DAN-OMQM-Lite.docx" ]] || { echo "Thiếu HUONG-DAN-OMQM-Lite.docx (chạy tools/build-guide.py)"; exit 1; }
cp "$SRC/HUONG-DAN-OMQM-Lite.docx" "$OUT/"
cat > "$OUT/README.txt" <<TXT
OM/QM Lite – add-in Excel cho Mac (thay cho Excel OM/QM)
=========================================================
Hơn 100 mô hình: dự báo, quy hoạch tuyến tính, tồn kho, hàng đợi, PERT/CPM, tài chính, chất lượng...
Kết quả ra sheet mới dưới dạng công thức Excel thật.

CÀI ĐẶT (một lần, khoảng 2 phút)
1. Giải nén file .zip.
2. Bấm đúp "Cai-dat-OMQM-Lite.command".
   - Nếu macOS báo "không thể xác minh nhà phát triển": bấm chuột phải vào file -> Open -> Open.
   - Khi macOS hỏi mật khẩu máy: nhập mật khẩu (chỉ một lần, để tin cậy chứng chỉ cục bộ).
3. Thoát hẳn Excel (Cmd+Q) rồi mở lại.
4. Trong Excel: Home -> Add-ins -> Developer Add-ins -> OM/QM Lite.
   Sau đó nút OM/QM Lite hiện ngay trên tab Home.

DÙNG NHANH
1. Bấm nút OM/QM Lite -> chọn hoặc tìm mô hình (gõ không dấu: "du bao", "ton kho", "hang doi").
2. Tick "Điền sẵn ví dụ" -> "Tạo bảng nhập trên sheet mới".
3. Sửa các ô màu vàng thành số liệu của bạn -> bấm "Giải". Kết quả ra sheet "KQ ...".
   Ô xanh là công thức Excel thật; sửa ô vàng là tự tính lại. Add-in không bao giờ xoá hay ghi đè sheet có sẵn.

TÀI LIỆU
- HUONG-DAN-OMQM-Lite.docx : hướng dẫn đầy đủ (cài đặt, cách dùng, danh mục mô hình, mẹo nhập số liệu, xử lý sự cố). Mở bằng Word.

YÊU CẦU
- macOS 12 trở lên, Excel cho Mac, có internet khi dùng (tải thư viện Office.js của Microsoft).
- Gói này dùng đúng loại chip của máy tạo gói (Apple silicon hoặc Intel).

GỠ CÀI ĐẶT: bấm đúp "Go-OMQM-Lite.command", rồi mở lại Excel.
CẬP NHẬT: giải nén gói mới, bấm đúp "Cai-dat-OMQM-Lite.command" lần nữa.

Dịch vụ nền chỉ lắng nghe ở 127.0.0.1 (chính máy này) cổng 47310. Chứng chỉ tạo riêng cho máy bạn, hạn 10 năm.
Nhật ký cài đặt: ~/Library/Logs/omqm-lite-install.log
TXT
(cd "$OUT/.." && ditto -c -k --keepParent "$OUT" "$OUT.zip")
echo "Đã tạo: $OUT"; du -sh "$OUT" "$OUT.zip" | awk '{print "  "$1"  "$2}'
