# Builds HUONG-DAN-OMQM-Lite.docx (user guide shipped in the installer zip).
# Needs python-docx:  python3 -m venv /tmp/v && /tmp/v/bin/pip install python-docx && /tmp/v/bin/python tools/build-guide.py
import sys, pathlib
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'HUONG-DAN-OMQM-Lite.docx')
GREEN = RGBColor(0x1D, 0x6B, 0x48)
d = Document()
for s in d.sections:
    s.left_margin = s.right_margin = Cm(2.2); s.top_margin = s.bottom_margin = Cm(2)
st = d.styles['Normal']; st.font.name = 'Calibri'; st.font.size = Pt(11)
st.element.rPr.rFonts.set(qn('w:eastAsia'), 'Calibri')
for n, sz in (('Heading 1', 18), ('Heading 2', 14), ('Heading 3', 12)):
    h = d.styles[n]; h.font.name = 'Calibri'; h.font.size = Pt(sz); h.font.bold = True; h.font.color.rgb = GREEN
    h.element.rPr.rFonts.set(qn('w:eastAsia'), 'Calibri')

def shade(cell, hexcolor):
    tcPr = cell._tc.get_or_add_tcPr(); sh = OxmlElement('w:shd')
    sh.set(qn('w:val'), 'clear'); sh.set(qn('w:color'), 'auto'); sh.set(qn('w:fill'), hexcolor); tcPr.append(sh)

def P(text='', bold=False, italic=False, style=None, size=None):
    p = d.add_paragraph(style=style); r = p.add_run(text); r.bold = bold; r.italic = italic
    if size: r.font.size = Pt(size)
    p.paragraph_format.space_after = Pt(4); return p
def B(text, lvl=0):
    p = d.add_paragraph(style='List Bullet'); p.paragraph_format.left_indent = Cm(0.8 + 0.6 * lvl); p.paragraph_format.space_after = Pt(2)
    if '**' in text:
        for i, part in enumerate(text.split('**')):
            r = p.add_run(part); r.bold = i % 2 == 1
    else: p.add_run(text)
def N(text):
    p = d.add_paragraph(style='List Number'); p.paragraph_format.space_after = Pt(3)
    for i, part in enumerate(text.split('**')):
        r = p.add_run(part); r.bold = i % 2 == 1
def NOTE(text, color='FFF6DD'):
    t = d.add_table(rows=1, cols=1); t.style = 'Table Grid'; c = t.rows[0].cells[0]; shade(c, color)
    c.text = ''; r = c.paragraphs[0].add_run(text); r.font.size = Pt(10.5); d.add_paragraph().paragraph_format.space_after = Pt(2)
def TABLE(head, rows, widths=None):
    t = d.add_table(rows=1, cols=len(head)); t.style = 'Table Grid'
    for i, h in enumerate(head):
        c = t.rows[0].cells[i]; c.text = ''; r = c.paragraphs[0].add_run(h); r.bold = True; r.font.color.rgb = RGBColor(255, 255, 255); shade(c, '1D6B48')
    for row in rows:
        cells = t.add_row().cells
        for i, v in enumerate(row):
            cells[i].text = ''; r = cells[i].paragraphs[0].add_run(v); r.font.size = Pt(10)
    if widths:
        for row in t.rows:
            for i, w in enumerate(widths): row.cells[i].width = Cm(w)
    d.add_paragraph().paragraph_format.space_after = Pt(2)

# ---- Cover
t = d.add_paragraph(); t.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = t.add_run('OM/QM Lite'); r.bold = True; r.font.size = Pt(32); r.font.color.rgb = GREEN
t = d.add_paragraph(); t.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = t.add_run('Hướng dẫn cài đặt và sử dụng'); r.font.size = Pt(18)
t = d.add_paragraph(); t.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = t.add_run('Add-in Excel cho Mac thay thế Excel OM/QM · hơn 100 mô hình định lượng · kết quả là công thức Excel thật'); r.italic = True
P()

d.add_heading('1. OM/QM Lite là gì?', 1)
P('OM/QM Lite là add-in chạy ngay trong Microsoft Excel trên Mac. Bạn chọn một mô hình (dự báo, quy hoạch tuyến tính, tồn kho, hàng đợi, PERT/CPM, tài chính…), điền số liệu vào bảng màu vàng, bấm Giải, và kết quả được ghi ra một sheet mới kèm bảng, công thức, biểu đồ.')
B('**Đủ bộ mô hình** của Excel OM/QM v5 (29 nhóm, khoảng 105 mô hình) và thêm nhóm Tài chính / giá trị thời gian của tiền, hồi quy có kiểm định thống kê, xác suất hậu nghiệm Bayes.')
B('**Kết quả là công thức Excel thật** (ô xanh): sửa ô vàng thì kết quả tự tính lại, bạn có thể kiểm tra từng bước.')
B('**An toàn cho file của bạn**: không bao giờ xoá hay ghi đè sheet có sẵn; mỗi lần Giải tạo sheet mới.')
B('**Chạy độc lập**: cài một lần, lần sau mở Excel là dùng được, không cần Terminal, không cần bật server.')

d.add_heading('2. Yêu cầu', 1)
B('MacBook dùng macOS 12 trở lên, Microsoft Excel cho Mac (Microsoft 365 hoặc Excel 2021/2024).')
B('Gói cài đặt này đi kèm Node.js riêng cho đúng loại chip của máy tạo gói. Nếu gói tạo trên máy Apple silicon (M1/M2/M3/M4) thì chỉ cài được trên Mac Apple silicon. Với Mac Intel cần gói khác.')
B('Có kết nối internet khi dùng (add-in tải thư viện Office.js từ Microsoft). Dữ liệu của bạn không rời khỏi máy.')
B('Biết mật khẩu đăng nhập máy Mac (hỏi đúng một lần khi cài).')

d.add_heading('3. Cài đặt (làm một lần, khoảng 2 phút)', 1)
N('**Giải nén** file zip (bấm đúp vào file .zip). Được thư mục OMQM-Lite-Installer. Có thể đặt thư mục ở bất kỳ đâu (Desktop, Downloads…).')
N('Trong thư mục, **bấm đúp “Cai-dat-OMQM-Lite.command”**.')
B('Nếu macOS báo “không thể xác minh nhà phát triển” hoặc “không mở được”: **bấm chuột phải** vào file → chọn **Open** (Mở) → bấm **Open** lần nữa. Chỉ cần làm một lần.', 1)
B('Nếu macOS vẫn chặn: vào System Settings → Privacy & Security, kéo xuống và bấm “Open Anyway”.', 1)
N('Khi hộp thoại hỏi mật khẩu hiện ra, **nhập mật khẩu máy Mac** của bạn. Bước này giúp máy tin cậy chứng chỉ cục bộ để Excel mở được add-in. Chỉ làm một lần.')
N('Khi hiện thông báo **“Đã cài xong OM/QM Lite”**, bấm OK. Cửa sổ Terminal có thể tự mở và có thể đóng lại.')
N('**Thoát hẳn Excel** (Cmd + Q) nếu đang mở, rồi mở lại Excel.')
N('Trong Excel: **Home → Add-ins → Developer Add-ins → OM/QM Lite**. Từ đó nút **OM/QM Lite** (biểu tượng cột xanh) xuất hiện ngay trên tab Home ở bên phải; lần sau chỉ cần bấm nút này.')
NOTE('Mẹo: nếu không thấy mục “Developer Add-ins”, hãy thoát hẳn Excel (Cmd+Q) rồi mở lại. Excel chỉ đọc danh sách add-in lúc khởi động.')

d.add_heading('4. Dùng lần đầu: ví dụ 5 phút', 1)
P('Ví dụ: dự báo nhu cầu bằng san bằng hàm mũ.')
N('Mở một file Excel (có thể là file trống). Bấm nút **OM/QM Lite** trên tab Home, thanh bên (pane) mở ra bên phải.')
N('Gõ vào ô tìm kiếm: **du bao** (gõ không dấu cũng được). Chọn **San bằng hàm mũ**.')
N('Tick **“Điền sẵn ví dụ”** rồi bấm **Tạo bảng nhập trên sheet mới**. Một sheet mới xuất hiện với bảng số liệu mẫu màu vàng.')
N('Sửa các ô vàng thành số liệu của bạn (hoặc giữ nguyên để xem thử). Chỉnh tham số (ví dụ hệ số α) ngay trong pane.')
N('Bấm **Giải**. Sheet mới “KQ …” hiện ra gồm bảng dự báo, các chỉ số sai số (MAD, MSE, MAPE, tracking signal) và biểu đồ.')
N('Đổi một con số ở ô vàng: các ô công thức xanh tự tính lại. Với ô có ghi chú “tính sẵn”, hãy bấm Giải lại.')

d.add_heading('5. Giao diện và quy ước màu', 1)
TABLE(['Thành phần', 'Ý nghĩa'], [
    ['Ô tìm kiếm', 'Gõ tên mô hình, có hoặc không dấu: “ton kho”, “hang doi”, “pert”, “npv”.'],
    ['Bộ lọc Tất cả / POM / QM', 'Lọc danh mục theo bộ menu của POM-QM gốc (phân loại gần đúng).'],
    ['Danh mục theo nhóm', 'Hoạch định & dự báo, Tối ưu hoá, Ra quyết định, Tài chính, Dự án, Tồn kho & vận hành, Chất lượng, Thống kê.'],
    ['Ô vàng', 'Ô nhập liệu: bạn điền số hoặc chữ vào đây.'],
    ['Ô xanh lá / ô công thức', 'Kết quả tính bằng công thức Excel thật, tự cập nhật khi sửa ô vàng.'],
    ['Ô ghi chú “tính sẵn”', 'Giá trị do add-in tính (ví dụ lời giải simplex). Sửa số liệu xong hãy bấm Giải lại.'],
    ['Thẻ kết quả trong pane', 'Tóm tắt kết quả chính ngay khi giải xong; cây quyết định có xem trước hình vẽ.'],
    ['Dòng hướng dẫn', 'Dưới tiêu đề bước 1 của mỗi mô hình có một dòng chỉ cách nhập.'],
], [4.5, 12])

d.add_heading('6. Quy trình chung cho mọi mô hình', 1)
N('**Chọn mô hình** trong danh mục hoặc ô tìm kiếm.')
N('**Chọn kích thước** (số dòng, số biến, số ràng buộc… nếu mô hình có) và tham số, rồi bấm **Tạo bảng nhập trên sheet mới**. Tick “Điền sẵn ví dụ” để có số liệu mẫu từ giáo trình.')
N('**Điền ô vàng** trên sheet vừa tạo. Có thể dán dữ liệu từ nơi khác. Dòng trống ở cuối bảng được bỏ qua với các bảng dữ liệu theo kỳ.')
N('**Bấm Giải**. Kết quả ghi ra sheet mới, không đụng sheet khác.')
N('Muốn giải lại với số khác: sửa ô vàng rồi bấm Giải; add-in tạo sheet kết quả mới (đổi tên “KQ …” thành tên bạn muốn).')
P('Nếu nhập sai (ô trống, chữ thay vì số, dữ liệu không hợp lệ), add-in hiện thông báo tiếng Việt và tự chọn đúng ô bị lỗi để bạn sửa.')

d.add_heading('6b. Lưu bài, mở lại bài và xuất PDF', 2)
B('**Lưu bài (.json)**: dưới bước 1 của mỗi mô hình. Lưu tên mô hình, tham số và dữ liệu đang nhập vào file .json (thường nằm ở thư mục Tải xuống). Nếu không thấy file, sao chép nội dung hiện ra bên dưới và dán vào một file .json.')
B('**Mở bài (.json)**: chọn file đã lưu (hoặc dán nội dung). Add-in tạo lại bảng nhập với đúng dữ liệu và tham số; bấm Giải để tính lại. Dùng để gửi bài cho bạn bè hoặc giảng viên.')
B('**Chuẩn bị in / xuất PDF**: sau khi Giải, trong thẻ kết quả. Add-in đặt sheet kết quả khổ A4 và vừa chiều ngang. Sau đó bấm Cmd+P → PDF → Lưu dạng PDF.')
B('File Excel (.xlsx) đã chứa đủ sheet nhập và sheet kết quả: lưu file Excel là mở lại sửa được. Muốn xuất HTML dùng File → Save As → Web Page.')

d.add_heading('7. Danh mục mô hình', 1)
P('Dưới đây là toàn bộ nhóm và mô hình. Mỗi mô hình có ví dụ mẫu và dòng hướng dẫn nhập.')
CAT = [
 ('Hoạch định & dự báo', [
  ('Dự báo (15 mô hình)', 'Naive, trung bình giản đơn, trung bình trượt (có / không trọng số), san bằng hàm mũ, xu hướng tuyến tính, san bằng có xu hướng (α, β), san bằng trên chuỗi khử mùa vụ, chỉ số mùa vụ, phân rã nhân / cộng, hồi quy đơn và bội, dự báo từ phương trình có sẵn, phân tích sai số. Hồi quy có bảng ANOVA, giá trị p, F, khoảng tin cậy, khoảng dự báo, hệ số co dãn.'),
  ('Hoạch định tổng hợp', 'Tối ưu bằng LP, chiến lược đuổi theo nhu cầu, chiến lược sản xuất đều.')]),
 ('Tối ưu hoá', [
  ('Quy hoạch tuyến tính', 'Simplex; phân tích độ nhạy; đồ thị 2 biến; bảng lặp từng bước.'),
  ('Quy hoạch nguyên & hỗn hợp', 'Nguyên, nhị phân, hỗn hợp bằng nhánh cận.'),
  ('Quy hoạch mục tiêu', 'Nhiều mục tiêu theo thứ tự ưu tiên.'),
  ('Vận tải', 'Vogel, góc tây bắc, chi phí nhỏ nhất.'),
  ('Phân công', 'Thuật toán Hungary.'),
  ('Mạng', 'Cây khung nhỏ nhất, đường đi ngắn nhất, luồng cực đại.')]),
 ('Ra quyết định', [
  ('Phân tích quyết định', 'Bảng quyết định (Maximax, Maximin, Laplace, Hurwicz, Savage, EMV, EVPI); cây quyết định vẽ trên sheet; xác suất hậu nghiệm Bayes; xác suất từ bảng tần suất; tồn kho một kỳ.'),
  ('Lý thuyết trò chơi', 'Điểm yên ngựa, chiến lược hỗn hợp.'),
  ('Chuỗi Markov', 'n bước, trạng thái dừng, trạng thái hấp thụ.')]),
 ('Tài chính', [
  ('Hoà vốn', 'Hoà vốn chi phí-doanh thu, điểm giao nhau chi phí giữa các phương án, hoà vốn nhiều sản phẩm.'),
  ('Đầu tư', 'NPV, IRR.'),
  ('Giá trị thời gian của tiền', 'Lãi suất thực / danh nghĩa, giá trị tương lai / hiện tại, niên kim, khoản trả đều, lịch trả nợ, lãi suất trả góp, so sánh dự án (NPV, IRR, hoàn vốn, đồ thị NPV), chọn thiết bị, mua hay thuê, dự án có khấu hao và thuế.')]),
 ('Dự án', [
  ('PERT/CPM', 'AON và AOA; 3 ước lượng thời gian; xác suất hoàn thành; rút ngắn dự án (crashing); ngân sách theo lịch sớm / muộn.')]),
 ('Tồn kho & vận hành', [
  ('Tồn kho (8 mô hình)', 'EOQ, nhận hàng dần, cho phép thiếu hàng, chiết khấu theo số lượng, điểm đặt hàng lại (chuẩn / rời rạc), ABC, Kanban.'),
  ('Cỡ lô, MRP', 'Cỡ lô cho nhu cầu không đều; MRP nhiều cấp theo cây BOM.'),
  ('Hàng đợi (9 mô hình)', 'M/M/1, M/D/1, M/G/1, M/Ek/1, M/M/s, hệ thống hữu hạn, nguồn khách hữu hạn.'),
  ('Lập lịch, Cân bằng dây chuyền, Bố trí mặt bằng', 'SPT/EDD/Slack…, Johnson hai máy; 5 quy tắc cân bằng dây chuyền; gán phòng ban vào vị trí.'),
  ('Địa điểm', 'Chấm điểm theo trọng số, trọng tâm vận chuyển, chi phí-sản lượng.'),
  ('Đường cong học tập, Năng suất, Đo lường công việc', 'Thời gian và tỷ lệ học tập; năng suất đa yếu tố; nghiên cứu thời gian, cỡ mẫu, lấy mẫu công việc.')]),
 ('Chất lượng', [
  ('Kiểm soát chất lượng', 'Biểu đồ p, x̄-R, c; kế hoạch lấy mẫu chấp nhận; đường OC, AOQ; Cp, Cpk.'),
  ('Độ tin cậy', 'Hệ thống nối tiếp, song song, số linh kiện dự phòng.')]),
 ('Thống kê', [
  ('Thống kê & phân phối', 'Chuẩn, chuẩn ngược, nhị thức, Poisson, mũ, thống kê mô tả.'),
  ('Mô phỏng', 'Monte Carlo từ bảng xác suất.')]),
]
for g, items in CAT:
    d.add_heading(g, 3)
    TABLE(['Module', 'Gồm'], [[a, b] for a, b in items], [4.5, 12])

d.add_heading('8. Mẹo nhập số liệu theo từng dạng bài', 1)
B('**Dự báo**: mỗi kỳ một dòng, theo thứ tự thời gian, cột “Nhu cầu” là số thực tế. Với mô hình mùa vụ, kỳ đầu phải là mùa 1; số kỳ nên là bội số của độ dài mùa.')
B('**Hồi quy**: cột đầu là Y, các cột sau là X. Muốn dự báo cho giá trị X mới, nhập vào ô tham số tương ứng trong pane. Mức tin cậy mặc định 95%.')
B('**Quy hoạch tuyến tính**: dòng đầu là hệ số hàm mục tiêu, mỗi dòng sau là một ràng buộc với dấu (≤, ≥, =) và vế phải; mọi biến ≥ 0. Chọn Max hoặc Min ở tham số trong pane.')
B('**Vận tải / Phân công**: mỗi dòng là một nguồn (chi phí đơn vị đến từng đích rồi lượng cung), dòng “Cầu” ghi lượng cầu. Cung khác cầu thì add-in tự thêm nguồn / đích giả. Phân công: số người khác số việc cũng tự thêm dòng / cột giả.')
B('**PERT/CPM**: mỗi dòng là một hoạt động: mã, các hoạt động tiền nhiệm (mã cách nhau bằng dấu phẩy, để trống nếu bắt đầu ngay), thời gian (hoặc a, m, b).')
B('**Tài chính**: đọc dòng hướng dẫn dưới tiêu đề bước 1 để biết đơn vị của từng ô (lãi suất mỗi kỳ hay mỗi năm, số kỳ). Dòng tiền âm là chi ra, dương là thu về. Với bài toán mua trả góp, chọn đúng mô hình “Tìm lãi suất của khoản vay trả góp”.')
B('**Cây quyết định**: nhập dạng bảng nhánh: Từ nút, Đến nút, Tên nhánh, Xác suất, Giá trị trên nhánh (nút gốc là nút không có nhánh đi vào; xác suất các nhánh ra khỏi nút ngẫu nhiên cộng bằng 1). Xem trước hình vẽ ngay trong pane; trên sheet cây được vẽ bằng hình (hình vuông là quyết định, hình tròn là ngẫu nhiên, đường đậm là lựa chọn tốt nhất).')

d.add_heading('9. Câu hỏi thường gặp / xử lý sự cố', 1)
TABLE(['Vấn đề', 'Cách xử lý'], [
 ['Không thấy “OM/QM Lite” trong Developer Add-ins', 'Thoát hẳn Excel (Cmd+Q), mở lại. Nếu vẫn không có: chạy lại “Cai-dat-OMQM-Lite.command”.'],
 ['Pane trắng hoặc báo lỗi chứng chỉ / “không thể kết nối”', 'Chạy lại “Cai-dat-OMQM-Lite.command” (nhập mật khẩu khi được hỏi). Nếu đã cài hơn 10 năm: cài lại để tạo chứng chỉ mới.'],
 ['macOS chặn file .command', 'Chuột phải vào file → Open → Open. Hoặc System Settings → Privacy & Security → Open Anyway.'],
 ['Báo “Không chạy được Node.js đi kèm”', 'Gói được tạo cho loại chip khác (Apple silicon ↔ Intel). Nhờ người gửi tạo gói đúng loại chip của máy bạn.'],
 ['Nhấn Giải báo lỗi ở một ô', 'Ô lỗi đã được chọn sẵn: xem nội dung thông báo tiếng Việt (thiếu số, nhập chữ, ràng buộc sai…) rồi sửa.'],
 ['Kết quả không đổi sau khi sửa số', 'Các ô công thức xanh tự cập nhật. Ô có ghi chú “tính sẵn” thì bấm Giải lại.'],
 ['Cần nhiều sheet kết quả cùng lúc', 'Mỗi lần Giải tạo sheet “KQ …” mới. Đổi tên sheet để quản lý.'],
 ['Cần gỡ cài đặt', 'Bấm đúp “Go-OMQM-Lite.command”, rồi khởi động lại Excel.'],
 ['Muốn cập nhật phiên bản mới', 'Giải nén gói mới và bấm đúp “Cai-dat-OMQM-Lite.command” lần nữa: tự ghi đè bản cũ, không cần nhập lại mật khẩu.'],
 ['Có cần internet?', 'Có, để tải Office.js của Microsoft. Dữ liệu và phép tính nằm trên máy bạn.'],
], [6, 10.5])
P('Nhật ký cài đặt nằm ở ~/Library/Logs/omqm-lite-install.log, nhật ký dịch vụ ở ~/Library/Logs/omqm-lite.log. Gửi hai file này khi cần hỗ trợ.', size=10)

d.add_heading('10. Thông tin kỹ thuật ngắn', 1)
B('Cài vào ~/Library/Application Support/OMQM-Lite. Một dịch vụ nền (LaunchAgent “com.omqmlite.server”) phục vụ giao diện add-in tại https://localhost:47310, chỉ lắng nghe trên chính máy này và tự chạy mỗi lần đăng nhập.')
B('Chứng chỉ localhost được tạo riêng cho từng máy, hạn 10 năm; private key không nằm trong gói cài đặt.')
B('Gỡ cài đặt xoá dịch vụ, manifest Excel và bản cài; chứng chỉ “OM-QM Lite localhost” trong Keychain có thể xoá thêm bằng Keychain Access.')
B('Phạm vi và giới hạn: add-in dùng để học tập và giải bài tập định lượng. Kết quả nên được đối chiếu với đề bài; các mô hình chưa có trong danh mục (ví dụ mạng độ tin cậy tổng quát) chưa được hỗ trợ.')

d.save(OUT); print('saved', OUT)
