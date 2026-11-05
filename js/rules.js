// Bộ sinh việc: hàm thuần, không phụ thuộc giao diện hay Firebase.
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const dow = (s) => { const d = parseYmd(s).getDay(); return d === 0 ? 7 : d; }; // 1=Thứ 2 ... 7=Chủ nhật
export const daysInMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
export const monthOf = (date) => date.slice(0, 7);
export const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
export const todayStr = () => ymd(new Date());
export const DOW_NAMES = ['', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

export const ROTATE_ANCHOR = '2026-11-02';
export const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
export const SHIFTS = ['sáng', 'chiều', 'tối'];
const SHIFT_ID = { sáng: 's', chiều: 'c', tối: 't' };
export const shiftOf = (start) => { const h = Number(String(start).split(':')[0]); return h < 12 ? 'sáng' : h < 17 ? 'chiều' : 'tối'; };

export function ruleMatches(rule, date) {
  if (!rule) return false;
  const d = Number(date.slice(8));
  const m = Number(date.slice(5, 7));
  switch (rule.type) {
    case 'daily': return true;
    case 'weekly': return (rule.dow || []).includes(dow(date));
    case 'monthly': {
      if (rule.months && rule.months.length && !rule.months.includes(m)) return false;
      const last = daysInMonth(date.slice(0, 7));
      return (rule.days || []).some((x) => x === d || (x > last && d === last));
    }
    case 'biweekly': { // 2 tuần 1 lần: các thứ đã chọn, tính từ tuần của ngày bắt đầu
      if (!(rule.dow || []).includes(dow(date)) || !rule.anchor) return false;
      const wk = (x) => Math.floor((parseYmd(addDays(x, -(dow(x) - 1))) - 0) / 86400000 / 7 + 0.0001);
      return (wk(date) - wk(rule.anchor)) % 2 === 0 && date >= rule.anchor;
    }
    case 'weekstart': return dow(date) === 1 || d === 1; // đầu tuần (thứ 2) hoặc mùng 1
    default: return false;
  }
}

// Tuần thứ mấy trong tháng (tuần 1 là tuần chứa mùng 1, tính từ thứ 2)
export function weekIndex(date) {
  const d = Number(date.slice(8));
  const first = dow(date.slice(0, 8) + '01');
  return Math.floor((d - 1 + (first - 1)) / 7) + 1;
}

// Lịch lớp theo cơ sở: schedules[facility][key] = { "1": "...", ... }
export function scheduleText(tpl, fac, date, schedules) {
  if (!tpl.scheduleKey) return { skip: false, text: '' };
  const s = schedules && schedules[fac] && schedules[fac][tpl.scheduleKey];
  // cơ sở chưa nhập lịch lớp thì chưa sinh việc này (nhập ở mục Lịch lớp)
  if (!s || !Object.keys(s).length) return { skip: true, text: '' };
  const k = tpl.scheduleMode === 'monthday' ? String(Number(date.slice(8)))
    : tpl.scheduleMode === 'weekidx' ? String(weekIndex(date)) : String(dow(date));
  const v = s[k];
  if (!v) return { skip: true, text: '' };
  return { skip: false, text: v };
}

/** Các thứ (1..7) có lớp học của một cơ sở. Trả về null nếu chưa có dữ liệu lớp (coi như ngày nào cũng làm việc). */
export function workDows(classes, fac) {
  const set = new Set();
  for (const c of classes || []) if (c.facility === fac) for (const s of c.slots || []) set.add(s.dow);
  return set.size ? set : null;
}
export const isWorkDay = (date, set) => !set || set.has(dow(date));
/** Ngày làm việc kế tiếp (kể cả chính ngày đó nếu có lớp). */
export function nextWorkDay(date, set) {
  let d = date;
  for (let i = 0; i < 8; i++) { if (isWorkDay(d, set)) return d; d = addDays(d, 1); }
  return date;
}

export function generateMonth({ templates, schedules, facilities, ym, existingIds, by, cutoff, users = [], classes = [] }) {
  const out = [];
  const n = daysInMonth(ym);
  for (const fac of facilities) {
    const W = workDows(classes, fac);
    const seen = new Set();
    for (let d = 1; d <= n; d++) {
      const baseDate = `${ym}-${pad(d)}`;
      for (const t of templates) {
        if (!t.auto || !t.rule || t.rule.type === 'none') continue;
        if (t.facilities && !t.facilities.includes(fac)) continue;
        if (!ruleMatches(t.rule, baseDate)) continue;
        const sc = scheduleText(t, fac, baseDate, schedules);
        if (sc.skip) continue;
        // Cơ sở không có lớp ngày hôm đó thì không có ca làm việc: việc hàng ngày bỏ qua, việc khác dời sang ngày có lớp kế tiếp
        let date = baseDate;
        if (!isWorkDay(baseDate, W)) { if (t.rule.type === 'daily') continue; date = nextWorkDay(baseDate, W); }
        if (cutoff && date < cutoff) continue; // ngày đã qua trước khi tạo checklist: không tạo (đỡ ghi dữ liệu thừa)
        // Thứ 7 / CN có nhiều ca (sáng/chiều/tối): việc hàng ngày lặp lại theo ca, mỗi ca ghi các lớp của ca đó
        const wantShift = t.weekendShifts === true || (t.weekendShifts == null && t.group === 'cm' && t.rule.type === 'daily' && !t.scheduleKey);
        let shifts = [null];
        if (wantShift && dow(date) >= 6 && classes.length) {
          const byShift = {};
          for (const c of classes) {
            if (c.facility !== fac) continue;
            for (const s of c.slots || []) if (s.dow === dow(date)) { const k = shiftOf(s.start); (byShift[k] = byShift[k] || new Set()).add(c.code); }
          }
          const ks = SHIFTS.filter((k) => byShift[k]);
          if (ks.length) shifts = ks.map((k) => ({ key: k, codes: byShift[k] }));
        }
        for (const sh of shifts) {
        // Việc chuyên môn giao theo người; hành chính thì mỗi cơ sở một người (assigneesByFac)
        const ids = (t.assigneesByFac && t.assigneesByFac[fac]) || t.assignees || [];
        const people = t.group === 'cm' ? ids.map((uid) => users.find((u) => u.id === uid)).filter((u) => u && !u.disabled && (!u.cmFacilities || !u.cmFacilities.length || u.cmFacilities.includes(fac))) : [];
        const targets = people.length ? people : [null];
        const facCodes = new Set(classes.filter((c) => c.facility === fac).map((c) => c.code));
        for (const u of targets) {
          const id = (u ? `${fac}_${date}_${t.id}_${u.id}` : `${fac}_${date}_${t.id}`) + (sh ? `_${SHIFT_ID[sh.key]}` : '');
          if ((existingIds && existingIds.has(id)) || seen.has(id)) continue;
          // Lớp ghi kèm: chỉ khi thật sự cần
          const mine = u && u.classCodes ? u.classCodes.filter((c) => facCodes.has(c)) : [];
          let own = [];
          if (t.rotate && u) {
            // chia đều các lớp phụ trách trong chu kỳ 14 ngày: mỗi ngày kiểm tra 1-2 lớp, hết chu kỳ là đủ lớp
            const days = []; const start = addDays(ROTATE_ANCHOR, Math.floor(daysBetween(ROTATE_ANCHOR, date) / 14) * 14);
            for (let i = 0; i < 14; i++) { const x = addDays(start, i); if (isWorkDay(x, W)) days.push(x); }
            const pos = days.indexOf(date);
            own = pos < 0 || !days.length ? [] : mine.filter((_, k) => k % days.length === pos);
            if (!own.length) continue; // hôm nay không phải kiểm tra lớp nào
          } else if (sh) {
            own = u ? (mine.length ? mine.filter((c) => sh.codes.has(c)) : []) : [...sh.codes];
            if (u && mine.length && !own.length) continue; // ca này người đó không có lớp
          } else if (t.perClass === true && u) own = mine;
          seen.add(id);
          out.push({
            id,
            data: {
              facility: fac, date, month: date.slice(0, 7), title: sh ? `${t.name} (ca ${sh.key})` : t.name, extra: [sc.text, own.join(', ')].filter(Boolean).join(' · '), time: t.time || '', ...(sh ? { shift: sh.key } : {}),
              group: t.group, tplId: t.id, source: 'template', status: 'todo', open: true,
              carry: u ? true : !(t.rule.type === 'daily' && !t.scheduleKey),
              assignee: u ? u.id : null, assigneeName: u ? u.name : '', note: '', feedback: '',
              needsReview: !!t.needsReview, sendCSKH: !!t.sendCSKH, flagged: false,
              order: t.order || 0, createdBy: by || '', createdAt: Date.now(),
            },
          });
        }
        }
      }
    }
  }
  return out;
}

// steps: [{off, group, title, desc, needsReview}]
export function buildChainTasks({ steps, label, anchor, facilities, by, newId, source = 'chain', refId = '' }) {
  const out = [];
  for (const fac of facilities) {
    steps.forEach((s, i) => {
      const date = s.date || addDays(anchor, Number(s.off) || 0);
      out.push({
        id: newId(),
        data: {
          facility: fac, date, month: monthOf(date),
          title: `${label}: ${s.title}`, extra: '', time: '', desc: s.desc || '',
          group: s.group || 'cm', tplId: '', source, refId, status: 'todo',
          assignee: null, assigneeName: '', note: '', feedback: '',
          needsReview: !!s.needsReview, sendCSKH: false, flagged: false,
          order: 1000 + i, createdBy: by || '', createdAt: Date.now(),
        },
      });
    });
  }
  return out;
}

export const STATUS_LABEL = {
  todo: 'Chưa làm', done: 'Đã xong', na: 'Không áp dụng', review: 'Chờ duyệt',
  fix: 'Cần sửa', approved: 'Đã duyệt, chờ gửi CSKH',
};
// Việc còn dang dở (tự đẩy sang ngày sau)
export const isOpen = (t) => t.status === 'todo' || t.status === 'fix';
