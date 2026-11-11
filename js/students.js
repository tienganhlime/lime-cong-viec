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

/** Tách nội dung "A // 4/11 B // 5/11 C" thành từng ngày: mỗi ngày một nội dung. Đoạn đầu không ghi ngày lấy ngày mặc định. */
export function splitByDate(content, defDate) {
  const txt = String(content || '').trim();
  // Điểm tách: "//" hoặc ";" hoặc xuống dòng, NGAY TRƯỚC một ngày hợp lệ dạng "14/11" "14/11:" "thứ 6 14/11"
  const DATE_AT = '(?:thứ\\s*\\d\\s*|cn\\s*)?\\(?\\d{1,2}\\s*\\/\\s*\\d{1,2}(?:\\s*\\/\\s*\\d{2,4})?\\)?\\s*[:\\-–]?\\s+\\S';
  const splitter = new RegExp('\\s*(?:\\s\\/\\/\\s|;\\s|\\n)\\s*(?=' + DATE_AT + ')', 'i');
  const segs = txt.split(splitter).map((x) => x.trim()).filter(Boolean);
  if (segs.length < 2 && !new RegExp('^' + DATE_AT, 'i').test(txt)) return [{ date: defDate, content: txt }];
  const head = new RegExp('^(?:thứ\\s*\\d\\s*|cn\\s*)?\\(?(\\d{1,2})\\s*\\/\\s*(\\d{1,2})(?:\\s*\\/\\s*(\\d{2,4}))?\\)?\\s*[:\\-–]?\\s+([\\s\\S]+)$', 'i');
  const out = [];
  segs.forEach((sg) => {
    const m = sg.match(head);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 31 && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
      const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : defDate.slice(0, 4);
      out.push({ date: `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`, content: m[4].trim() });
    } else if (!out.length) out.push({ date: defDate, content: sg });
    else out[out.length - 1].content += ' ; ' + sg;
  });
  const merged = [];
  for (const o of out) { const f = merged.find((x) => x.date === o.date); if (f) f.content += '\n' + o.content; else merged.push(o); }
  return merged;
}

/** Tách các lượt ôn bài cũ (một dòng chứa nhiều ngày) thành từng ngày riêng. */
export async function splitExistingReviews(fac) {
  const all = await S.db.getAll('reviews', [['facility', '==', fac], ['status', '==', 'pending']]);
  const have = new Set(all.map((r) => r.id)); const ops = []; let n = 0;
  for (const r of all) {
    if (!['on', 'bu'].includes(r.kind) || r.track) continue;
    if (!r.content) { if (r.kind === 'on' && r.track === undefined && !r.fromSchedule) ops.push({ op: 'update', col: 'reviews', id: r.id, data: { track: true } }); continue; }
    const parts = splitByDate(r.content, r.date);
    if (parts.length < 2) {
      // ôn bài không có lịch ngày: chuyển sang theo dõi liên tục
      if (r.kind === 'on' && r.track === undefined && !r.fromSchedule && !r.ended) ops.push({ op: 'update', col: 'reviews', id: r.id, data: { track: true } });
      continue;
    }
    const ck = normCode(r.classCode);
    parts.forEach((pt, i) => {
      if (i === 0) { ops.push({ op: 'update', col: 'reviews', id: r.id, data: { date: pt.date, content: pt.content, fromSchedule: true } }); return; }
      const rid = reviewId(fac, pt.date, ck, r.studentName);
      if (have.has(rid)) { const ex = ops.find((o) => o.id === rid); if (ex && ex.op === 'set') ex.data.content += '\n' + pt.content; return; }
      have.add(rid); n++;
      ops.push({ op: 'set', col: 'reviews', id: rid, data: { ...r, id: undefined, fromSchedule: true, date: pt.date, content: pt.content, history: [], movedCount: 0, createdAt: Date.now(), createdBy: S.user.id, createdByName: S.user.name } });
    });
  }
  ops.forEach((o) => { if (o.data && 'id' in o.data) delete o.data.id; });
  if (ops.length) await S.db.batch(ops);
  return n;
}

/* ------------ Ghi dữ liệu ------------ */
const kindOf = (content) => (/\bbù\b|\bbvn\b|\bbtvn\b/i.test(content || '') ? 'bu' : 'on');
export const reviewId = (fac, date, classKey, name) => `${fac}_${date}_${classKey}_${slug(name)}`;

export async function importReviews(items, fac, existingIds) {
  // mỗi ngày một nội dung riêng (nội dung tồn ngày trước nằm ở dòng riêng, ôn trước)
  items = items.flatMap((it) => {
    const k = it.kind || kindOf(it.content);
    if (it.track || !it.content || k === 'test' || k === 'note') return [it];
    const parts = splitByDate(it.content, it.date);
    // Ôn bài (học sinh yếu) mặc định là theo dõi liên tục đến khi bấm kết thúc; có lịch ghi rõ từng ngày thì đi theo lịch; bù bài chỉ 1-2 buổi
    const single = parts.length === 1 && parts[0].date === it.date;
    return parts.map((pt) => { const kind = it.kind || kindOf(pt.content); return { ...it, date: pt.date, content: pt.content, kind, track: it.track !== undefined ? it.track : (single && kind === 'on'), sched: !single }; });
  });
  const ops = []; let added = 0; let skipped = 0;
  const studentIds = new Set((S.students || []).map((s) => s.id));
  for (const it of items) {
    if (!it.cls) continue;
    const ck = normCode(it.cls.code);
    for (const st of it.students) {
      // tên đã được gộp (viết sai chính tả / thiếu họ) thì dùng đúng học sinh đã gộp vào
      const al = (S.students || []).find((s) => s.classId === it.cls.id && (s.aliases || []).includes(slug(st.name)));
      if (al) st = { ...st, name: al.name };
      const sid = al ? al.id : `${fac}_${ck}_${slug(st.name)}`;
      const rid = reviewId(fac, it.date, ck, st.name);
      const dup = ops.find((o) => o.id === rid);
      if (dup) { if (it.content && !dup.data.content.includes(it.content)) dup.data.content = [dup.data.content, it.content].filter(Boolean).join('\n'); continue; }
      if (existingIds.has(rid)) { skipped++; continue; }
      if (!studentIds.has(sid)) {
        studentIds.add(sid);
        ops.push({ op: 'set', col: 'students', id: sid, data: { facility: fac, classId: it.cls.id, classCode: it.cls.code, name: st.name, tag: st.tag, watch: true, createdAt: Date.now(), createdBy: S.user.id } });
      }
      ops.push({ op: 'set', col: 'reviews', id: rid, data: {
        facility: fac, date: it.date, classId: it.cls.id, classCode: it.cls.code, studentId: sid, studentName: st.name, kind: it.kind || kindOf(it.content), ...(it.track ? { track: true } : {}), ...(it.sched ? { fromSchedule: true } : {}),
        content: it.content || '', status: 'pending', note: '', history: [], createdBy: S.user.id, createdByName: S.user.name, createdAt: Date.now(),
      } });
      existingIds.add(rid); added++;
    }
  }
  await S.db.batch(ops);
  return { added, skipped };
}

/** Gộp học sinh `from` (tên sai / trùng) vào `into`: chuyển toàn bộ lịch sử ôn bù sang học sinh đúng, các lần dán sau tự nhận đúng tên. */
export async function mergeStudents(from, into) {
  const fr = await S.db.getAll('reviews', [['studentId', '==', from.id]]);
  const ir = await S.db.getAll('reviews', [['studentId', '==', into.id]]);
  const ops = [];
  for (const r of fr) {
    const twin = ['on', 'bu'].includes(r.kind) && ir.find((x) => x.date === r.date && x.kind === r.kind && x.classId === r.classId);
    if (twin) {
      if (r.content && !String(twin.content || '').includes(r.content)) ops.push({ op: 'update', col: 'reviews', id: twin.id, data: { content: [twin.content, r.content].filter(Boolean).join('\n') } });
      ops.push({ op: 'update', col: 'reviews', id: r.id, data: { studentId: into.id, studentName: into.name, status: 'done', merged: true, note: `Đã gộp vào ${into.name}` } });
    } else ops.push({ op: 'update', col: 'reviews', id: r.id, data: { studentId: into.id, studentName: into.name } });
  }
  ops.push({ op: 'update', col: 'students', id: into.id, data: { aliases: [...new Set([...(into.aliases || []), slug(from.name), ...(from.aliases || [])])], watch: !!(into.watch || from.watch) } });
  ops.push({ op: 'update', col: 'students', id: from.id, data: { mergedInto: into.id, watch: false } });
  await S.db.batch(ops);
  return fr.length;
}

const histEntry = (date, result, note) => ({ date, result, note: note || '', by: S.user.id, byName: S.user.name, at: Date.now() });
export const reviewDone = (r, note) => S.db.update('reviews', r.id, {
  status: 'done', note: note ?? r.note ?? '', doneBy: S.user.id, doneByName: S.user.name, doneAt: Date.now(),
  history: [...(r.history || []), histEntry(r.date, 'done', note ?? r.note)],
});
/** Mục theo dõi liên tục: ghi đã ôn buổi này rồi sang buổi học kế tiếp, cho đến khi bấm kết thúc theo dõi. */
export async function reviewSession(r, from, note) {
  const op = moveOp(r, from, 'done', note);
  await S.db.update('reviews', r.id, { ...op.data, movedCount: r.movedCount || 0 });
  return op.next;
}
export const reviewEnd = (r, note) => S.db.update('reviews', r.id, {
  status: 'done', ended: true, note: note ?? r.note ?? '', doneBy: S.user.id, doneByName: S.user.name, doneAt: Date.now(),
  history: [...(r.history || []), histEntry(r.date, 'done', (note ?? r.note ?? '') + ' (kết thúc theo dõi)')],
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
