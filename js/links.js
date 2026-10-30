// Thư viện liên kết nhanh. Muốn thêm / sửa link: sửa danh sách LINKS bên dưới (url hoặc urls theo cơ sở).
// Link nào để trống '' thì không hiện nút. Từ khóa (kw) dùng để tự gắn link vào công việc có nội dung phù hợp.
const FB = 'https://www.facebook.com/';
const SHEET_MAIN = 'https://docs.google.com/spreadsheets/d/1NfVqQDsi40TRhRLD6-PiV0mcgdFFHoXNjr8qW-8-tW8/edit';
export const LINK_GROUPS = [
  ['chat', 'Nhóm chat và nơi đăng tin'], ['sheet', 'Bảng theo dõi'], ['doc', 'Thư mục và tài liệu'],
];
export const LINKS = [
  { id: 'teachers_fb', g: 'chat', label: 'Nhóm Facebook LIME SCHOOL TEACHERS', url: FB + 'groups/379264489524833/', kw: /LIME SCHOOL TEACHERS|lịch test|danh sách (các )?lớp test|bài viết/i },
  { id: 'test_sched', g: 'sheet', label: 'Lịch test các lớp', url: SHEET_MAIN + '?gid=814661461#gid=814661461', kw: /lịch test|lớp test|lớp chuyển cấp|chuyên cấp|chuyển cấp/i },
  { id: 'gv_mess', g: 'chat', label: 'Mess LIME GIÁO VIÊN', url: 'https://m.me/j/AbauOXUa0-RTsTl_/', kw: /LIME GIÁO VIÊN|nhắc giáo viên|nhắc GV|BTVN/i },
  { id: 'gv_fb', g: 'chat', label: 'Nhóm Facebook LIME GIÁO VỤ', url: FB + 'groups/263881084669351/', kw: /GIÁO VỤ/i },
  { id: 'gv_all', g: 'chat', label: 'Mess giáo vụ toàn trung tâm', url: 'https://m.me/j/AbZSURHFcJnyw-4Y/', kw: /GIÁO VỤ/i },
  { id: 'gv_tk', g: 'chat', label: 'Mess giáo vụ Trung Kính', urls: { yenhoa: 'https://m.me/j/AbaefVaP87C-VENu/' }, kw: /GIÁO VỤ/i },
  { id: 'gv_th', g: 'chat', label: 'Mess trợ lý Trung Hòa', urls: { trunghoa: 'https://m.me/j/AbY2WT3EM-300oId/' }, kw: /GIÁO VỤ/i },
  { id: 'ta_mess', g: 'chat', label: 'Mess nhóm Lime trợ giảng', url: 'https://m.me/j/AbbKFJO2F_8hkSkg/', kw: null },
  { id: 'cm_mess', g: 'chat', label: 'Mess nhóm Lime chuyên môn', url: 'https://m.me/j/AbaGBBmsl5zbNAQC/', kw: /nhóm Chuyên môn|Lime Giảng viên/i },
  { id: 'cm_fb', g: 'chat', label: 'Facebook Lime Chuyên Môn', url: FB + 'groups/343571899912543', kw: /nhóm Chuyên môn/i },
  { id: 'khan', g: 'sheet', label: 'Bảng Chuyên môn, Khan Kids', url: 'https://docs.google.com/spreadsheets/d/161gcY9MUy1vAht7NteGjN6g7ERGDAmxwAdTIIu95oc4/edit?usp=sharing', kw: /Khan ?Kids/i },
  { id: 'limevoice', g: 'sheet', label: 'Danh sách + thống kê Lime Voice / Khan Kids các lớp', url: SHEET_MAIN + '?gid=1671063321#gid=1671063321', kw: /Lime ?Voice|Khan ?Kids/i },
  { id: 'early', g: 'sheet', label: 'Danh sách học sinh cần đến sớm ôn bài', url: 'https://docs.google.com/spreadsheets/d/1N_elv71lOs3U_rmtKgz9RWxiMd5wEVgL-DVC6L8rplc/edit?gid=1053818338#gid=1053818338', kw: /ôn (bù )?bài|bù bài|đến sớm/i },
  { id: 'watch', g: 'sheet', label: 'Danh sách học sinh cần theo dõi (mới, chuyển ngang)', url: 'https://docs.google.com/spreadsheets/d/19kYWdlsLszzbztQhQo0B3f-9SdaKQM6DOnpS7fd6fRs/edit?usp=sharing', kw: /học sinh mới|chuyển ngang|chuyển lớp|theo dõi/i },
  { id: 'overage', g: 'sheet', label: 'Học sinh học vượt tuổi, miễn bài tập', url: 'https://docs.google.com/spreadsheets/d/1zEsO69jVs1_XbQmTDE5lhGWRm0BtJP-E_6qivO7qwxI/edit?usp=sharing', kw: /vượt tuổi/i },
  { id: 'score', g: 'sheet', label: 'File nhập điểm test của cơ sở', urls: {
    yenhoa: 'https://docs.google.com/spreadsheets/d/12uHyhetZz7QiQVJrCv0oewE7Pi-UygpUwoTr4XmPyYw/edit?usp=sharing',
    trunghoa: 'https://docs.google.com/spreadsheets/d/1a6Y2b60fpZChlxEWxx2Bo8mVc7gF03eXirHPLWfq0Bg/edit?usp=sharing' }, kw: /nhập điểm|điểm test|điểm bài/i },
  { id: 'comment', g: 'sheet', label: 'Bảng nhận xét test (Excel)', url: 'https://docs.google.com/spreadsheets/d/1bt9avQUqWDaSrKiDkbNvk-y03VrpYNr99OmPl_4XpAA/edit?usp=sharing', kw: /nhận xét (test|Excel)|bảng nhận xét|file nhận xét/i },
  { id: 'kpi', g: 'sheet', label: 'Bảng KPI giáo viên / KPI tháng', url: 'https://docs.google.com/spreadsheets/d/1AZ20MCIP3px1OSvEZGMzKZ4Ojz0UgxuEm0yzXG3k9ro/edit?usp=sharing', kw: /KPI/i },
  { id: 'cvps', g: 'sheet', label: 'CVPS (công việc phát sinh)', url: FB + 'photo?fbid=3936189940032251&set=gm.1095298292150067&idorvanity=721609559518944', kw: /CVPS/i },
  { id: 'btvn', g: 'doc', label: 'Folder BTVN', url: 'https://drive.google.com/drive/folders/19XXucECYwNKtyiUnW9niQ9Vw9vMQOv2R?usp=drive_link', kw: /BTVN/i },
  { id: 'slide', g: 'doc', label: 'Folder slide dạy các khối', url: 'https://drive.google.com/drive/folders/1MbX9g3ckK8Rv-f6vkJyBt1b624m_LVn7?usp=drive_link', kw: /slide/i },
  { id: 'handout', g: 'doc', label: 'Handout cần sửa / folder handout', url: FB + 'photo/?fbid=3934833000120700&set=gm.1374920969959175&idorvanity=379264489524833', kw: /handout/i },
  { id: 'review_doc', g: 'doc', label: 'Tài liệu ôn bài', urls: {
    yenhoa: 'https://docs.google.com/document/d/1qmPnW-YdjikXj8GtBRZkgWMiKTFDPsh8j5MC9hBEbDs/edit?usp=sharing',
    trunghoa: 'https://docs.google.com/document/d/1Is38RtVUqKPCfcw8Ch0-yQTXI5EYMYzrE2yBju_h1_I/edit?usp=sharing' }, kw: /ôn bài|Nội dung ôn/i },
  { id: 'print', g: 'doc', label: 'Folder tài liệu cần in', url: 'https://drive.google.com/drive/folders/18pZS3njje-ooSuUFB__aujgAj-bkL2bE?usp=drive_link', kw: /cần in|in tài liệu/i },
  { id: 'testdoc', g: 'doc', label: 'Đề test các khóa', url: 'https://drive.google.com/drive/folders/1EDyJZ-jlm_LiF2GxrUBcadij8RyHs5Rk?usp=sharing', kw: /file test|nội dung bài kiểm tra|hướng dẫn giáo viên test|link hướng dẫn/i },
  { id: 'syllabus', g: 'doc', label: 'Syllabus', url: 'https://drive.google.com/drive/folders/14V12K_PFVCHvOrD6xutWvdz7t8GI5nqW?usp=sharing', kw: /syllabus/i },
  { id: 'circle', g: 'doc', label: 'Speaking Circle time', url: 'https://docs.google.com/spreadsheets/d/1G5Y4QasazvcC56-c5n4yjw0a4bQfZTeGEzjiNFxW8Bk/edit?usp=sharing', kw: /Circle time/i },
  { id: 'circle_doc', g: 'doc', label: 'Tài liệu Circle time', url: 'https://drive.google.com/drive/folders/1m3cI4ECuyNfHW9eJ7QqcUL2p6o9fYRxA?usp=drive_link', kw: /Circle time/i },
  { id: 'video', g: 'doc', label: 'Link video theo syllabus + phiếu chấm video', url: 'https://docs.google.com/spreadsheets/d/1-i_YKu9NCj6rsY3qWh5TVmuFaijiaobJVB8e3r_wgOc/edit?usp=sharing', kw: /video|phiếu chấm/i },
  { id: 'event', g: 'doc', label: 'Sự kiện Challenge (mẫu timeline)', url: 'https://docs.google.com/spreadsheets/d/16GBYzsZyCs5yhPy6JFDNPeV_2yO7R-VfH4oQr-YGN9w/edit?gid=1845672515#gid=1845672515', kw: /sự kiện/i },
];

export const linkUrl = (l, fac) => (l.urls ? l.urls[fac] || '' : l.url || '');
export const linksFor = (text, fac) => LINKS.filter((l) => l.kw && l.kw.test(text) && linkUrl(l, fac));
