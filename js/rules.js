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

export function generateMonth({ templates, schedules, facilities, ym, existingIds, by, cutoff }) {
  const out = [];
  const n = daysInMonth(ym);
  for (const fac of facilities) {
    for (let d = 1; d <= n; d++) {
      const date = `${ym}-${pad(d)}`;
      for (const t of templates) {
        if (!t.auto || !t.rule || t.rule.type === 'none') continue;
        if (t.facilities && !t.facilities.includes(fac)) continue;
        if (!ruleMatches(t.rule, date)) continue;
        const sc = scheduleText(t, fac, date, schedules);
        if (sc.skip) continue;
        const id = `${fac}_${date}_${t.id}`;
        if (existingIds && existingIds.has(id)) continue;
        if (cutoff && date < cutoff) continue; // ngày đã qua trước khi tạo checklist: không tạo (đỡ ghi dữ liệu thừa)
        out.push({
          id,
          data: {
            facility: fac, date, month: ym, title: t.name, extra: sc.text, time: t.time || '',
            group: t.group, tplId: t.id, source: 'template', status: 'todo', open: true,
            carry: !(t.rule.type === 'daily' && !t.scheduleKey),
            assignee: null, assigneeName: '', note: '', feedback: '',
            needsReview: !!t.needsReview, sendCSKH: !!t.sendCSKH, flagged: false,
            order: t.order || 0, createdBy: by || '', createdAt: Date.now(),
          },
        });
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
