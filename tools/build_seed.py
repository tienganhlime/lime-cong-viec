# -*- coding: utf-8 -*-
# Sinh web/data/seed.json từ bảng mẫu đã chốt (build_templates.py) + quy tắc lặp
import importlib.util, json, os, sys

spec = importlib.util.spec_from_file_location("bt", "/tmp/build_templates.py")
bt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bt)

ROWS, CHAINS = bt.ROWS, bt.CHAINS
assert len(ROWS) == 90 and len(CHAINS) == 36

D = {"type": "daily"}
N = {"type": "none"}
def W(*d): return {"type": "weekly", "dow": list(d)}
def M(*d, months=None):
    r = {"type": "monthly", "days": list(d)}
    if months: r["months"] = months
    return r

# Thứ tự khớp với ROWS (50 Chuyên môn, 38 Trợ giảng, 2 Cả 2). dow: 1=Thứ 2 ... 7=Chủ nhật
RULES = [
 # --- Chuyên môn 1..50
 D, D, D, D, W(3), D, D, D, D,             # 1-9
 M(15, 22, 29), M(28, months=[8, 1]), W(1), M(30), N, D, N, N, N, # 10-18
 W(1), N, M(5), M(6), N, N, N, N, N, N, N, # 19-29
 M(25), N, N, N, M(25), M(15, 18, 20, 22), # 30-35
 W(1), W(3), W(3), W(1),                   # 36-39
 M(3), M(2, 26), M(5), M(4), M(4), M(5), M(10), M(28), M(7), M(28), N,  # 40-50
 # --- Trợ giảng 51..88
 M(1, 2, 3), D, D, D, D, D, D, D, D, # 51-59
 D, N, D, D, D, D, D, D, D, D, D,    # 60-70 (61 Tổng hợp slide: không tự sinh)
 D, W(7), N, M(7), N, N, W(1, 2), W(5, 6), M(1), N, N, N, # 71-82
 W(3, 4, 5), N, M(1, 2, 3), M(*range(5, 32)), N, D,       # 83-88
 # --- Cả 2: 89-90
 N, N,
]
assert len(RULES) == 90, len(RULES)
WS = {"type": "weekstart"}
# các việc do lịch lớp từng cơ sở quyết định ngày nào có việc: quy tắc = mỗi ngày, bộ lọc = lịch lớp
for _i in (51, 67, 70, 71, 77, 83, 86):
    RULES[_i - 1] = D
RULES[82 - 1] = WS

SCHED_KEYS = {
    51: ("summary", "monthday"),
    67: ("support", "weekday"),
    70: ("test", "weekday"),
    71: ("video", "weekday"),
    77: ("limevoice", "weekday"),
    82: ("flashcard", "weekidx"),
    83: ("askReview", "weekday"),
    86: ("report", "monthday"),
}

GROUP = {"Chuyên môn": "cm", "Trợ giảng": "ta", "Cả 2": "both"}

templates = []
for i, r in enumerate(ROWS, start=1):
    name, grp, rep, duyet, lich, gio, noidung, ghichu = r
    t = {
        "id": "t%02d" % i,
        "order": i,
        "name": name,
        "group": GROUP[grp],
        "repeatText": rep,
        "scheduleText": lich,
        "rule": RULES[i - 1],
        "auto": RULES[i - 1]["type"] != "none",
        "time": gio,
        "content": noidung,
        "needsReview": duyet.startswith("Có"),
        "reviewText": duyet,
        "sendCSKH": i == 86,
        "facilities": ["yenhoa", "trunghoa"],
        "note": ghichu,
    }
    if i in SCHED_KEYS:
        t["scheduleKey"], t["scheduleMode"] = SCHED_KEYS[i]
    templates.append(t)

# ---- chuỗi
TITLES = [
 "Trước khai giảng: Zalo lớp, LP giáo viên, tài liệu, mã Khan Kids",
 "Xin giáo viên nhận xét buổi 1",
 "Xin giáo viên nhận xét buổi 2",
 "Sau 2 buổi: kiểm tra Khan Kids, bài tập, sách vở",
 "Học sinh mới từ buổi 3: kiểm tra việc làm bài tập",
 "Buổi 6: hướng dẫn quay video, xin nhận xét lớp",
 "Kiểm tra video test và nhận xét của giáo viên",
 "Kết thúc theo dõi 1 tháng: rà soát công tác lớp mới",
 "Theo dõi lớp CAM mới sau 2,5 tháng: test cả lớp",
 "Lên nội dung ôn bù bài, date lịch test lại",
 "Test lại sau 6 buổi ôn, hỏi giáo viên",
 "Kiểm tra công tác học sinh mới từ buổi 3",
 "Học thử buổi 1 / 2: hỏi giáo viên, kết luận chuyển lớp",
 "Kết thúc 8 buổi đầu: xin nhận xét, test, chữa nhận xét",
 "Chuẩn bị test: gửi nội dung, hướng dẫn giáo viên, phiếu test nói",
 "Cập nhật danh sách lớp test lên nhóm LIME SCHOOL TEACHERS",
 "Kiểm tra file test (online với phiếu offline)",
 "Ngày test: nhắc giáo viên, chấm bài, nhập điểm",
 "Xin giáo viên điểm test (sau 1 tuần)",
 "Xin file nhận xét test (sau 2 tuần)",
 "Kết thúc lớp test: đánh giá mức độ tiếp thu, biện pháp",
 "Kiểm tra lớp chuyển cấp độ đã học Unit cuối chưa",
 "Chuẩn bị họp phụ huynh",
 "Dự trù nhân sự buổi họp + xếp phòng",
 "Xin nhận xét cuối khóa, gửi Alice check",
 "Sau họp: báo cáo kết quả, giải pháp, gửi PH tóm tắt",
 "Sau 2 buổi đầu khóa mới: Khan Kids, bài tập, sách vở",
 "Tạo bộ câu hỏi chủ đề sự kiện",
 "Media đăng video truyền thông",
 "Chốt đăng ký lần 1, tổng hợp nội dung luyện tập gửi PH",
 "Tìm nhân sự cho sự kiện",
 "Chốt đăng ký lần cuối",
 "Họp và gửi tài liệu cho nhân sự",
 "Chuẩn bị thẻ, in tài liệu",
 "CSKH gửi PH địa điểm sự kiện",
 "Sự kiện diễn ra",
]
OFFS = [-5, 1, 4, 5, 7, 14, 28, 30, 75,
        0, 14, 7, 2, 28,
        -20, -14, -7, 0, 7, 14, 15,
        -21, -14, -1, -14, 1, 7,
        -12, -10, -7, -6, -4, -3, -2, -2, 0]
GROUPS = ["cm"] * 9 + ["ta", "ta", "cm", "cm", "cm"] + ["cm", "cm", "ta", "ta", "cm", "cm", "cm"] + ["cm"] * 6 + ["cm"] * 8 + ["both"]
assert len(TITLES) == len(OFFS) == len(GROUPS) == 36, (len(TITLES), len(OFFS), len(GROUPS))

CHAIN_META = [
 ("c1", "Lớp khai giảng", "Ngày khai giảng", "Mỗi lớp mới, theo dõi từ trước khai giảng đến 2,5 tháng"),
 ("c2", "Học sinh mới / chuyển lớp", "Ngày nhận danh sách học sinh", "Ôn bù bài, test lại, theo dõi 8 buổi đầu"),
 ("c3", "Lớp test", "Ngày test", "Chuẩn bị test, ngày test, xin điểm và nhận xét"),
 ("c4", "Lớp chuyển cấp độ + họp phụ huynh", "Ngày họp phụ huynh", "Chuẩn bị, tổ chức, sau họp, sau 2 buổi đầu khóa mới"),
 ("c5", "Sự kiện (mẫu: Hồ Gươm)", "Ngày diễn ra sự kiện", "Mẫu timeline sự kiện, sửa lại theo từng sự kiện"),
]
chains = []
for ci, (cid, cname, anchor, desc) in enumerate(CHAIN_META, start=1):
    steps = []
    for k, c in enumerate(CHAINS):
        if c[0].startswith("%d." % ci):
            steps.append({
                "title": TITLES[k],
                "off": OFFS[k],
                "group": GROUPS[k],
                "desc": c[5],
                "needsReview": c[6].startswith("Có"),
                "who": c[4],
            })
    chains.append({"id": cid, "name": cname, "anchor": anchor, "desc": desc, "steps": steps})
assert [len(c["steps"]) for c in chains] == [9, 5, 7, 6, 9]

# ---- lịch lớp Yên Hòa
report = {}
L1 = {5: "DORY2H, CAM2N", 6: "CLC A2E, DORY1M", 7: "DORY0Y, CAM1T", 8: "CAM2M, CAM1R", 9: "DORY0X, GRAM1A",
      10: "CAM1S, PET B1", 11: "CLC A1F, DORY1K", 12: "CLC A1E, CAM2Q", 13: "CAM2P, FCE B2A", 14: "CLC A2G, CLC A2D"}
L2 = {15: "DORY0X, GRAM1A", 16: "DORY2H, DORY1M", 17: "CAM2M, CAM1T", 18: "CLC A2G, CAM2P", 19: "CLC A2E, PET B1",
      20: "CLC A1E, CAM2Q", 21: "FCE B2A, CAM1R", 22: "Các lớp thứ 5 nếu chưa hoàn thành",
      23: "CAM2N, CLC A2D", 24: "CLC A1F, CAM1S và các lớp thứ 7 nếu chưa hoàn thành",
      25: "DORY0Y và các lớp Chủ nhật nếu chưa hoàn thành"}
for d, v in L1.items(): report[str(d)] = "Lần 1: " + v
for d, v in L2.items(): report[str(d)] = "Lần 2: " + v
for d in range(26, 32): report[str(d)] = "Hoàn thành các báo cáo + soạn văn còn thiếu"

yenhoa = {
 "support": {"1": "DORY1M, PET", "2": "CAM1T, CAM2Q", "3": "CLC A2G, CAM2M, CAM1R", "4": "PET, CLC A1D, GRAM1A",
             "5": "CAM1N, DORY1M", "6": "Sáng: CAM1T, CAM2M. Tối: GRAM1A, CAM2Q",
             "7": "Sáng: CAM1N. Chiều: CLC A2G. Tối: CLC A1D, CAM1R"},
 "test": {"1": "DORY1M, CAM1S", "2": "CAM2Q, DORY0Y", "3": "CAM2M, CLC A2G", "4": "DORY0X, PET", "5": "CAM2N, CLC A1E",
          "6": "Sáng: CLC A1F, CAM1T. Tối: CLC A2E, GRAM1A",
          "7": "Sáng: DORY1K, DORY2H. Chiều: FCE B2A, CLC A2D. Tối: CAM2P, CAM1R"},
 "video": {"1": "DORY1M, CAM1S, CLC A1F", "2": "DORY0Y, CLC A1E", "3": "CAM1P, FCE B2A", "4": "PET, DORY0X, CLC A1D",
           "5": "DORY2H, CAM1N", "6": "Sáng: CAM2M, CAM1T. Tối: CLC A2E, GRAM1A, CAM2Q",
           "7": "Sáng: DORY1K. Chiều: CLC A2G, CLC A2D. Tối: CAM1R"},
 "limevoice": {"1": "DORY1M, CAM1R, DORY0Y, DORY0X, CAM2Q, CAM1P, FCE B2A, PET, CLC A1D, CLC A1E",
               "2": "CAM1S, CAM1T, DORY1K, DORY2H, CAM1N, CAM2M, CLC A1F, CLC A2D, CLC A2E, CLC A2G"},
 "summary": {"1": "DORY1M, CAM1R, DORY0Y, DORY0X, FCE B2A, PET, CLC A1D",
             "2": "CAM2Q, CAM1P, CAM1N, CAM2M, CLC A1E, CLC A1F, CLC A2E",
             "3": "CAM1S, CAM1T, DORY1K, DORY2H, CLC A2D, CLC A2G"},
 "askReview": {
   "3": "Ms Rosie: CLC A2D. Ms Lia: DORY2H, CAM1R. Ms Rachel: CAM1N, CAM2Q, CLC A1F, CLC A2G. Ms Aimee: CLC A1E, CAM2M, CLC A2E. Mr Nathan: DORY1M. Ms Helen: DORY0Y",
   "4": "Ms Summer: CAM1S, DORY1K. Ms Annie: GRAM1A, CAM1T. Ms Alice: FCE B2A, CLC A1D. Ms Mia: DORY0X. Ms Ruby: PET B1, CAM1P",
   "5": "Ms Mia: DORY0X. Ms Ruby: PET B1, CAM1P"},
 "flashcard": {"1": "DORY3", "2": "DORY4", "3": "CAM1", "4": "CAM2", "5": "DORY0"},
 "report": report,
}

report_th = {}
_th = [
 (8, "L1: 3DORY2D, 3CLC A2K"), (9, "L1: 3DORY3B, FCE"), (10, "L1: 3CAM1V"), (11, "L1: 3DORY0T, FCE S1"),
 (12, "L1: 3CAM2E"), (13, "L1: 3CAM3A"), (14, "L1: 3DORY02R"), (15, "L1: 3CLC A2H"), (16, "L1: 3CLC A2F"),
 (17, "L1: 3DORY0S, 3CAM2F"), (18, "L2: 3DORY2D, 3CLC A2K"), (20, "L2: 3DORY3B, FCE"), (21, "L2: 3CAM1V"),
 (22, "L2: 3DORY0T, FCE S1"), (23, "L2: 3CAM2E"), (24, "L2: 3CAM3A"), (25, "L2: 3DORY02R"),
 (26, "L2: 3CLC A2H"), (27, "L2: 3DORY0S"), (28, "L2: 3CAM2F"),
]
for d, v in _th: report_th[str(d)] = "Báo cáo + soạn văn " + v
for d in (29, 30, 31): report_th[str(d)] = "Hoàn thành các báo cáo còn lại còn thiếu"

trunghoa = {
 "support": {"2": "3CAM1V", "3": "3DORY02R, 3CLC A2H", "4": "3CAM1V, 3CLC A2K, 3CAM2F",
             "7": "Tối: 3CAM2F, 3DORY02R, 3CLC A2K"},
 "test": {"2": "3CAM1V, 3DORY2D", "3": "3DORY02R, 3CLC A2H", "4": "3CLC A2K, 3CAM2F", "5": "3CAM3A",
          "6": "3DORY0S, 3DORY0T", "7": "Sáng: 3CLC A2F. Tối: 3CAM2E, 3DORY3B"},
 "video": {"2": "3CAM1V, 3DORY0T", "3": "3CAM2E, 3CLC A2H", "4": "3CAM2F, 3DORY2D, 3DORY3B",
           "5": "FCE B2, 3CLC A2F, 3DORY0Z", "6": "3DORY0S", "7": "Sáng: 3CAM3A. Tối: 3CLC A2K, 3DORY02R"},
 "limevoice": {"2": "Các lớp Trung Hòa (đếm video của tuần trước)", "3": "Các lớp Trung Hòa (đếm video của tuần trước)"},
 "summary": {"1": "Các lớp Trung Hòa", "2": "Các lớp Trung Hòa", "3": "Các lớp Trung Hòa"},
 "askReview": {"5": "Xin trực tiếp các Ms có lớp; còn lại nhắn tin hotline cho các Ms",
               "6": "Xin trực tiếp các Ms có lớp; còn lại nhắn tin hotline cho các Ms",
               "7": "Xin trực tiếp các Ms có lớp sáng Chủ nhật; còn lại nhắn tin hotline cho các Ms"},
 "flashcard": {"1": "DORY3", "2": "DORY4", "3": "CAM1", "4": "CAM2", "5": "CAM3"},
 "report": report_th,
}

scheduleKeys = {
 "support": {"label": "Lớp cần hỗ trợ (lớp đông, theo thứ)", "mode": "weekday"},
 "test": {"label": "Test học sinh hàng tuần (theo thứ)", "mode": "weekday"},
 "video": {"label": "Chấm video theo thứ", "mode": "weekday"},
 "limevoice": {"label": "Đếm Limevoice (theo thứ)", "mode": "weekday"},
 "summary": {"label": "Tổng kết Limevoice + Khan Kids (theo ngày trong tháng)", "mode": "monthday"},
 "askReview": {"label": "Xin danh sách ôn bù bài tuần sau (theo thứ)", "mode": "weekday"},
 "flashcard": {"label": "Kiểm tra folder tranh/thẻ chữ (theo tuần trong tháng)", "mode": "weekidx"},
 "report": {"label": "Báo cáo + soạn văn: lịch theo ngày trong tháng", "mode": "monthday"},
}

seed = {
 "version": 1,
 "facilities": [{"id": "yenhoa", "name": "Yên Hòa"}, {"id": "trunghoa", "name": "Trung Hòa"}],
 "templates": templates,
 "chains": chains,
 "scheduleKeys": scheduleKeys,
 "schedules": {"yenhoa": yenhoa, "trunghoa": trunghoa},
}

out = sys.argv[1]
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    json.dump(seed, f, ensure_ascii=False, indent=1)
print("templates", len(templates), "auto", sum(1 for t in templates if t["auto"]), "chains", [len(c["steps"]) for c in chains])
