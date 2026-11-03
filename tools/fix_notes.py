# -*- coding: utf-8 -*-
# Chạy sau build_seed.py: sửa tên / nội dung hướng dẫn của một số mẫu việc bị lệch hoặc trỏ tới sheet Excel
import json, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'data/seed.json'
d = json.load(open(p, encoding='utf-8'))
T = {t['id']: t for t in d['templates']}
def setc(i, c=None, name=None):
    if c is not None: T[i]['content'] = c
    if name is not None: T[i]['name'] = name
setc('t07', name='Kiểm tra danh sách học sinh cần test trong ngày của trợ giảng (có làm chưa? có đủ chưa?)')
setc('t15', name='Học sinh Test: cập nhật hàng ngày và kiểm tra lại vào một thứ cố định trong tuần')
setc('t23', "Công tác 5 ngày trước ngày khai giảng (ghi rõ ngày + tên lớp ngay khi có thông tin lớp khai giảng): 1. Xin vào Zalo lớp. 2. Xin lesson plan (LP) của giáo viên. 3. Kiểm tra đã gửi giáo viên toàn bộ hệ thống tài liệu chưa (syllabus, file sách, link nghe, folder BTVN, link Speaking Circle time, yêu cầu vở viết, học sinh vượt tuổi được miễn giảm bài tập). 4. Kiểm tra lại công tác của trợ giảng và giáo viên với học sinh vượt tuổi / cần lưu ý. 5. Lập mã Khan Kids gửi giáo viên và CSKH, cập nhật vào bảng Chuyên môn, Khan Kids.")
setc('t24', "Học buổi 1 và buổi 2 (ghi đúng ngày học): sau 1 ngày hỏi giáo viên tình hình lớp thế nào: tính cách học sinh, độ tiếp thu, cần hỗ trợ thêm gì không, giáo viên giao bài có cẩn thận không, đã có video quay mẫu chưa.")
setc('t25', "Sau 2 buổi học: kiểm tra tài khoản Khan Kids (giáo viên giao bài chưa, học sinh làm chưa); tình hình bài tập (cả bài KHAN và Video); tình hình sách vở (đủ sách và vở ghi không, biết dùng chưa; hỏi CSKH học sinh mua sách chưa, nhắn giáo viên động viên học sinh mua sách để học).")
setc('t26', "Buổi học thứ 6: hướng dẫn giáo viên quay video sau 1 tháng và xin nhận xét lớp luôn cho sớm. Ghi rõ ngày học buổi thứ 6 ngay từ khi có lịch lớp khai giảng.")
setc('t28', "Kết thúc theo dõi 1 tháng: rà soát toàn bộ công tác với lớp mới: video 1 tháng đủ chưa, nhận xét đủ chưa, Khan Kids / bài tập / sách vở, phản hồi của phụ huynh.")
setc('t31', "Chuẩn bị họp phụ huynh (xem các bước trong mục Chuỗi việc & sự kiện > Lớp chuyển cấp độ + họp phụ huynh): trao đổi với giáo viên về nội dung bài kiểm tra cuối cùng và hình thức quay video; hướng dẫn giáo viên họp PH và gửi tài liệu họp; cùng giáo viên thống nhất ngày quay video (báo Marketing, Quản lý, CSKH, Vận hành); order Marketing Certificate (kiểm tra trước ngày họp PH đã phát chưa); xin nhận xét cuối khóa và gửi Alice check (làm trước họp 3 buổi học).")
setc('t32', "Dự trù nhân sự buổi họp + xếp phòng, báo LIME GIÁO VỤ; thay đổi phòng học (nếu có), nhờ Vận hành nhắc thêm giáo viên khi giáo viên đến. Lịch dạy trong buổi họp và test học sinh dự phòng nếu có học sinh không dự họp. Chi tiết các mốc trước giờ họp xem Chuỗi việc & sự kiện > Lớp chuyển cấp độ + họp phụ huynh.")
setc('t92', "Mỗi sự kiện có timeline các đầu việc theo ngày; khi tải timeline lên thì việc tự đẩy về checklist từng đội. Dùng mục Chuỗi việc & sự kiện > Up timeline sự kiện (mẫu ví dụ: sự kiện Hồ Gươm).")
setc('t39', name='Kiểm tra tình hình làm handout (circle time) + key của TG (thứ 2 hàng tuần)')
json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('ok')
