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
# ---- Lịch test + báo cáo + soạn văn tháng 11/2026 (key 'report', riêng từng tháng: report@YYYY-MM) ----
setc('t88', name='Test học sinh + báo cáo + soạn văn (theo lịch chia lớp trong tháng)')
T['t88']['content'] = 'Làm theo lịch chia lớp của ngày hôm nay (ghi ở dòng bên dưới tên việc): test học sinh, báo cáo kiến thức (L1) hoặc báo cáo KT sách vở (L2), soạn văn. Các lớp còn thiếu thì hoàn thành nốt. Ghi rõ lớp nào đã xong, lớp nào còn thiếu vào ghi chú; gửi chuyên môn duyệt rồi gửi CSKH.'
L1 = 'Test học sinh + Báo cáo kiến thức + soạn văn L1: '
L2 = 'Test học sinh + Báo cáo KT sách vở + soạn văn L2: '
def yh(day, lab, txt): return (str(day), lab + txt)
yenhoa = {}
w1 = {2: 'CLC A2E, DORY1M', 3: 'DORY0Y, CAM1T', 4: 'CAM2M, CAM1R', 5: 'DORY0X, GRAM1A', 6: 'DORY2H, CAM2N', 7: '(Sáng) CAM1S, (Tối) CLC A1F', 8: '(Sáng) DORY1K, (Chiều) CLC A2D, (Tối) CAM2P'}
w2 = {9: 'PET B1 và các lớp còn thiếu', 10: 'CLC A1E, CAM2Q', 11: 'CLC A2G, FCE B2A', 12: 'CLC A1E và các lớp còn thiếu', 13: 'Các lớp còn thiếu', 14: 'Các lớp còn thiếu', 15: 'Các lớp còn thiếu'}
for k, v in w1.items(): yenhoa[str(k)] = L1 + v; yenhoa[str(k + 14)] = L2 + v
for k, v in w2.items(): yenhoa[str(k)] = L1 + v; yenhoa[str(k + 14)] = (L2.replace('Test học sinh + Báo cáo KT', 'Test học sinh + Hoàn thành các báo cáo KT') if k >= 13 else L2) + v
trunghoa = {}
bc = {5: ('L1', '3DORY2D, 3CAM1V'), 6: ('L1', 'FCE B2'), 7: ('L1', '3CLC A2H'), 8: ('L1', '3CLC A2F'), 10: ('L1', '3DORY0T'), 11: ('L1', '3DORY02R'), 12: ('L1', '3CLC A2K, 3CAM2F'), 13: ('L1', '3DORY0Z'), 14: ('L1', '3DORY02S'), 15: ('L1', '3DORY3B, 3CAM2E'),
      19: ('L2', '3DORY2D, 3CAM1V'), 20: ('L2', 'FCE B2'), 21: ('L2', '3CLC A2H'), 22: ('L2', '3CLC A2F'), 24: ('L2', '3DORY0T'), 25: ('L2', '3DORY0Z, 3DORY02R'), 26: ('L2', '3CLC A2K, 3CAM2F'), 27: ('L2', '3DORY0Z'), 28: ('L2', '3DORY02S'), 29: ('L2', '3DORY3B, 3CAM2E')}
for day in range(1, 31):
    if day in (2, 9, 16, 23, 30): continue  # thứ 2: Trung Hòa không có lớp
    if day in bc: lv, cl = bc[day]; trunghoa[str(day)] = f'Test học sinh + soạn văn + báo cáo {lv}: {cl}'
    else: trunghoa[str(day)] = 'Test học sinh + soạn văn (hôm nay không có lớp báo cáo)'
d['schedules']['yenhoa']['report@2026-11'] = yenhoa
d['schedules']['trunghoa']['report@2026-11'] = trunghoa
json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('ok')


# Lịch test Trung Hòa: bỏ 3CAM3A, đổi 3DORY0S -> 3DORY02S
import json as _j
_d=_j.load(open(__import__('sys').argv[1]))
_t=_d['schedules']['trunghoa']['test']
_t.pop('5',None); _t['6']='3DORY02S, 3DORY0T'
_j.dump(_d,open(__import__('sys').argv[1],'w'),ensure_ascii=False,indent=1)
