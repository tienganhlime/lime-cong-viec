// Logic theo dõi học sinh: thời khóa biểu, dán danh sách ôn bài / bù bài, thao tác từng buổi
import { S, notify } from './core.js';
import { addDays, dow, ymd, parseYmd } from './rules.js';

export const DOW_LABEL = { 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7', 7: 'CN' };
export const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '');
export const normCode = (s) => {
  let t = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  t = t.replace(/^(3?)CLCCAM/, '$1CLC').replace(/^3?ODRY/, (m) => m.replace('ODRY', 'DORY'));
  return t;
};
export const slotText = (c) => (c.slots || []).map((s) => `${DOW_LABEL[s.dow]} ${s.start}-${s.end}`).join(' · ');

export const classesOf = (fac) => (S.classes || []).filter((c) => c.facility === fac);
export function findClass(fac, raw) {
  const n = normCode(String(raw || '').split(/\s[-–]\s|\s*-\s*(?=Ms|Mr|MS|Mis)/)[0]);
  if (!n) return null;
  const list = classesOf(fac);
  return list.find((c) => normCode(c.code) === n) || list.find((c) => normCode(c.code) === n.replace(/^3/, '')) || list.find((c) => '3' + normCode(c.code) === n) || null;
}
/** Ngày học kế tiếp của lớp, sau ngày `after` (không tính ngày đó). Lớp chưa có lịch thì +7 ngày. */
export function nextClassDate(cls, after) {
  const days = new Set((cls && cls.slots || []).map((s) => s.dow));
  if (!days.size) return addDays(after, 7);
  for (let i = 1; i <= 7; i++) { const d = addDays(after, i); if (days.has(dow(d))) return d; }
  return addDays(after, 7);
}
export const slotOn = (cls, date) => (cls && cls.slots || []).filter((s) => s.dow === dow(date));

/* ------------ Phân tích nội dung dán ------------ */
const DATE_RE = /^(?:(?:thứ\s*\d|chủ nhật|cn|sáng chủ nhật|tối chủ nhật|mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s*)?\(?\s*(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\s*\)?\s*$/i;
const CLASS_RE = /(DORY|CAM|CLC|GRAM|PET|FCE|ODRY)/i;
function toDate(m, defDate) {
  const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : defDate.slice(0, 4);
  return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}
function splitNames(text) {
  return String(text || '').split(/[,;\n]|\s+và\s+/i).map((x) => x.trim()).filter(Boolean).map((x) => {
    const tag = (x.match(/\(([^)]*)\)/) || [])[1];
    return { name: x.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim(), tag: tag ? tag.trim() : '' };
  }).filter((x) => x.name && !/^0$/.test(x.name));
}
/** Trả về [{date, classRaw, cls, students:[{name,tag}], content}] */
export function parsePaste(text, defDate, fac) {
  const items = [];
  let date = defDate; let classRaw = ''; let cur = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let cols = line.split('\t');
    if (cols.length === 1 && line.includes('|')) cols = line.split('|');
    cols = cols.map((c) => c.trim());
    const nonEmpty = cols.filter(Boolean);
    if (!nonEmpty.length) continue;
    if (nonEmpty.length === 1) {
      const dm = nonEmpty[0].match(DATE_RE);
      if (dm) { date = toDate(dm, defDate); classRaw = ''; cur = null; continue; }
    }
    let rest = [];
    let touched = false; let gotClass = false;
    for (const c of cols) {
      if (!c) continue;
      const dm = c.match(DATE_RE);
      if (dm && !touched && !gotClass) { date = toDate(dm, defDate); touched = true; classRaw = ''; continue; }
      if (CLASS_RE.test(c) && c.length < 45 && !/https?:/.test(c) && !gotClass && !rest.length) { classRaw = c; gotClass = true; cur = null; continue; }
      rest.push(c);
    }
    if (!rest.length) continue;
    if (!classRaw) continue;
    const looksNames = (t) => t.length < 70 && !/[:]/.test(t) && !/https?:/.test(t) && !/\d/.test(t.replace(/\(.*?\)/g, ''));
    let students = []; let content = '';
    if (rest.length === 1) {
      if (looksNames(rest[0])) students = splitNames(rest[0]);
      else if (cur) { cur.content = [cur.content, rest[0]].filter(Boolean).join('\n'); continue; }
      else content = rest[0];
    } else { students = splitNames(rest[0]); content = rest.slice(1).join('\n'); }
    if (!students.length && !content) continue;
    cur = { date, classRaw, cls: findClass(fac, classRaw), students, content };
    items.push(cur);
  }
  return items.filter((i) => i.students.length);
}

/* ------------ Ghi dữ liệu ------------ */
const kindOf = (content) => (/\bbù\b|\bbvn\b|\bbtvn\b/i.test(content || '') ? 'bu' : 'on');
export const reviewId = (fac, date, classKey, name) => `${fac}_${date}_${classKey}_${slug(name)}`;

export async function importReviews(items, fac, existingIds) {
  const ops = []; let added = 0; let skipped = 0;
  const studentIds = new Set((S.students || []).map((s) => s.id));
  for (const it of items) {
    if (!it.cls) continue;
    const ck = normCode(it.cls.code);
    for (const st of it.students) {
      const sid = `${fac}_${ck}_${slug(st.name)}`;
      const rid = reviewId(fac, it.date, ck, st.name);
      if (existingIds.has(rid)) { skipped++; continue; }
      if (!studentIds.has(sid)) {
        studentIds.add(sid);
        ops.push({ op: 'set', col: 'students', id: sid, data: { facility: fac, classId: it.cls.id, classCode: it.cls.code, name: st.name, tag: st.tag, watch: true, createdAt: Date.now(), createdBy: S.user.id } });
      }
      ops.push({ op: 'set', col: 'reviews', id: rid, data: {
        facility: fac, date: it.date, classId: it.cls.id, classCode: it.cls.code, studentId: sid, studentName: st.name, kind: kindOf(it.content),
        content: it.content || '', status: 'pending', note: '', history: [], createdBy: S.user.id, createdByName: S.user.name, createdAt: Date.now(),
      } });
      existingIds.add(rid); added++;
    }
  }
  await S.db.batch(ops);
  return { added, skipped };
}

const histEntry = (date, result, note) => ({ date, result, note: note || '', by: S.user.id, byName: S.user.name, at: Date.now() });
export const reviewDone = (r, note) => S.db.update('reviews', r.id, {
  status: 'done', note: note ?? r.note ?? '', doneBy: S.user.id, doneByName: S.user.name, doneAt: Date.now(),
  history: [...(r.history || []), histEntry(r.date, 'done', note ?? r.note)],
});
export const reviewReopen = (r) => S.db.update('reviews', r.id, { status: 'pending', doneBy: null, doneByName: '', doneAt: null });
export const reviewNote = (r, note) => S.db.update('reviews', r.id, { note });
export function moveOp(r, from, reason = 'moved', note = '') {
  const cls = (S.classes || []).find((c) => c.id === r.classId);
  const next = nextClassDate(cls, from > r.date ? from : r.date);
  return { op: 'update', col: 'reviews', id: r.id, data: {
    date: next, status: 'pending', note: '', movedCount: (r.movedCount || 0) + 1,
    history: [...(r.history || []), histEntry(r.date, reason, note || r.note)],
  }, next };
}
export async function reviewMove(r, from, reason, note) {
  const op = moveOp(r, from, reason, note);
  await S.db.update('reviews', r.id, op.data);
  return op.next;
}
export const addTestScore = (student, date, score, note) => S.db.add('reviews', {
  facility: student.facility, date, classId: student.classId, classCode: student.classCode, studentId: student.id, studentName: student.name,
  kind: 'test', content: '', score, status: 'done', note: note || '', history: [], doneBy: S.user.id, doneByName: S.user.name, createdAt: Date.now(),
});
export const addStudentNote = (student, date, note) => S.db.add('reviews', {
  facility: student.facility, date, classId: student.classId, classCode: student.classCode, studentId: student.id, studentName: student.name,
  kind: 'note', content: '', status: 'done', note, history: [], doneBy: S.user.id, doneByName: S.user.name, createdAt: Date.now(),
});

/** Văn bản tóm tắt 14 ngày gần nhất của một học sinh, dùng làm nguyên liệu soạn báo cáo phụ huynh. */
export function summarize(student, reviews, today) {
  const from = addDays(today, -14);
  const rows = reviews.filter((r) => r.studentId === student.id && r.date >= from && r.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const dm = (d) => `${d.slice(8)}/${d.slice(5, 7)}`;
  const lines = rows.map((r) => {
    if (r.kind === 'test') return `${dm(r.date)} · Test: ${r.score ?? ''}${r.note ? ' · ' + r.note : ''}`;
    if (r.kind === 'note') return `${dm(r.date)} · Ghi chú: ${r.note}`;
    const st = r.status === 'done' ? 'Đã ôn' : r.movedCount ? 'Chuyển buổi sau' : 'Chưa ôn';
    return `${dm(r.date)} · ${r.kind === 'bu' ? 'Bù bài' : 'Ôn bài'}: ${st}${r.content ? ' (' + r.content.split('\n')[0].slice(0, 80) + ')' : ''}${r.note ? ' · ' + r.note : ''}`;
  });
  return `${student.name}: ${lines.length ? '\n  ' + lines.join('\n  ') : 'chưa có buổi nào trong 14 ngày'}`;
}
export { notify, ymd, parseYmd };
