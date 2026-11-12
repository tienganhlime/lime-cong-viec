// Trạng thái dùng chung và các thao tác trên công việc
import { FACILITIES } from './config.js';
import { isOpen, addDays, todayStr, workDows, nextWorkDay, dow } from './rules.js';

export const S = {
  db: null, user: null, users: [], templates: [], chains: [], classes: [], students: [], schedules: {}, scheduleKeys: {},
  notifications: [], facility: 'yenhoa', facilities: FACILITIES, navigate: null, rerenderShell: null,
};

export const ROLE_LABEL = { admin: 'Admin', manager: 'Quản lý', cm: 'Chuyên môn', ta: 'Trợ giảng' };
export const GROUP_LABEL = { ta: 'Trợ giảng', cm: 'Chuyên môn', both: 'Cả 2 đội' };
export const isCM = () => ['admin', 'manager', 'cm'].includes(S.user.role);
export const isMgr = () => ['admin', 'manager'].includes(S.user.role);
export const isTA = () => S.user.role === 'ta';
/** Trợ giảng chỉ được đọc việc của đội TA hoặc chung; chuyên môn đọc tất cả. */
export const scoped = (where) => (S.user && S.user.role === 'ta' ? [...where, ['group', 'in', ['ta', 'both']]] : where);
export const facName = (id) => (S.facilities.find((f) => f.id === id) || { name: id }).name;
export const userName = (id) => (S.users.find((u) => u.id === id) || {}).name || '';
export const myGroups = () => (isTA() ? ['ta', 'both'] : ['cm', 'both']);

// Người nhận việc theo nhóm
export function usersOfGroup(g) {
  const act = S.users.filter((u) => !u.disabled);
  if (g === 'ta') return act.filter((u) => u.role === 'ta' || u.role === 'admin');
  if (g === 'cm') return act.filter((u) => u.role === 'cm' || u.role === 'manager' || u.role === 'admin');
  return act;
}

// Những người có thể được giao một việc
export function assignCandidates(task) {
  const list = usersOfGroup(task.group);
  if (isTA()) return list.filter((u) => u.role === 'ta');
  return list;
}

export function canAct(t) {
  if (isCM()) return true;
  return !t.assignee || t.assignee === S.user.id;
}

// Đã bỏ chuông thông báo (đỡ tốn lượt đọc/ghi). Giữ hàm để các nơi gọi cũ không lỗi.
export async function notify() { /* không làm gì */ }
export const notifyGroup = (group, text, link) => notify(usersOfGroup(group).map((u) => u.id), text, link);

function buildPatch(p) {
  const out = { ...p };
  if (out.status !== undefined) out.open = isOpen({ status: out.status });
  if (out.date) out.month = out.date.slice(0, 7);
  return out;
}
export const patchTask = (t, p) => S.db.update('tasks', t.id, buildPatch(p));

export const claim = (t, uid = S.user.id) => patchTask(t, { assignee: uid, assigneeName: userName(uid) || S.user.name });
export const unclaim = (t) => patchTask(t, { assignee: null, assigneeName: '' });

export async function claimMany(tasks, uid = S.user.id) {
  const name = userName(uid) || S.user.name;
  await S.db.batch(tasks.map((t) => ({ op: 'update', col: 'tasks', id: t.id, data: { assignee: uid, assigneeName: name } })));
}

export async function assignTo(t, uid) {
  if (!uid) return unclaim(t);
  await claim(t, uid);
  if (uid !== S.user.id) await notify([uid], `${S.user.name} giao cho bạn: ${t.title}`, `#/today?date=${t.date}&fac=${t.facility}`);
}

export async function complete(t) {
  const base = { doneAt: Date.now(), doneBy: S.user.id, doneByName: S.user.name };
  if (t.status === 'fix') base.taLog = [...(t.taLog || []), fbEntry('resubmit', 'Làm lại và gửi duyệt')];
  if (!t.assignee) { base.assignee = S.user.id; base.assigneeName = S.user.name; }
  if (t.status === 'approved') return patchTask(t, { ...base, status: 'done' });
  if (t.needsReview || t.flagged) {
    await patchTask(t, { ...base, status: 'review' });
    await notifyGroup('cm', `${S.user.name} gửi duyệt: ${t.title}`, '#/review');
    return;
  }
  return patchTask(t, { ...base, status: 'done' });
}
export const reopen = (t) => patchTask(t, { status: 'todo', doneAt: null });
export const markNA = (t) => patchTask(t, { status: 'na' });
/** Dời ngày = làm trễ deadline: giữ ngày gốc (origDate) để việc vẫn bị bôi đỏ cho chuyên môn kiểm tra. */
/** Người nhận khi dời ngày: undefined = giữ nguyên; '' = để trống cho người làm hôm sau (KPI ngày cũ vẫn tính người cũ); uid = giao cho người đó. */
function reassign(t, uid) {
  if (uid === undefined) return {};
  const who = uid ? { assignee: uid, assigneeName: userName(uid) } : { assignee: null, assigneeName: '' };
  const prev = t.assignee || t.doneBy || null;
  return { ...who, ...(prev && prev !== uid ? { origAssignee: t.origAssignee || prev, origAssigneeName: t.origAssigneeName || userName(prev) || t.assigneeName || '' } : {}) };
}
export const moveDate = (t, date, uid) => patchTask(t, { ...reassign(t, uid), date, month: date.slice(0, 7), origDate: t.origDate || t.date,
  moveLog: [...(t.moveLog || []), { from: t.date, to: date, by: S.user.id, byName: S.user.name, at: Date.now() }] });
/** Sửa ngày = việc bị sinh sai ngày (chuyên môn sửa, kể cả ngày đã qua): không tính trễ, xóa mốc ngày gốc. */
export const fixDate = (t, date) => S.db.update('tasks', t.id, { date, month: date.slice(0, 7), origDate: null,
  dateFix: [...(t.dateFix || []), { from: t.date, to: date, by: S.user.id, byName: S.user.name, at: Date.now() }] });

/* Làm dở / chưa kịp làm: ghi tiến độ và chuyển sang ngày khác.
   - Việc đang tự chuyển tiếp (carry): giữ nguyên 1 việc, dời ngày, nối tiến độ vào ghi chú.
   - Việc hàng ngày (không tự chuyển tiếp): đóng việc hôm nay ở trạng thái "partial", tạo việc "Làm bù" ở ngày mới. */
export async function postpone(t, date, progress = '', uid) {
  const d = t.date;
  const line = progress.trim() ? `[${d.slice(8)}/${d.slice(5, 7)} · ${S.user.name}] ${progress.trim()}` : '';
  const note = [t.note, line].filter(Boolean).join('\n');
  if (t.carry) return patchTask(t, { ...(uid === undefined ? { assignee: t.assignee || S.user.id, assigneeName: t.assignee ? t.assigneeName : S.user.name } : reassign(t, uid)), origDate: t.origDate || t.date, date, month: date.slice(0, 7), note });
  const id = S.db.newId();
  const { id: _omit, ...rest } = t;
  await S.db.batch([
    { op: 'update', col: 'tasks', id: t.id, data: { status: 'partial', open: false, note, doneBy: S.user.id, doneByName: S.user.name, movedTo: date } },
    { op: 'set', col: 'tasks', id, data: {
      ...rest, title: t.title.startsWith('Làm bù: ') ? t.title : `Làm bù: ${t.title}`, date, month: date.slice(0, 7), tplId: '', source: 'makeup', refId: t.id,
      status: 'todo', open: true, carry: true, note: line ? `Từ ${d.slice(8)}/${d.slice(5, 7)}: ${progress.trim()}` : `Chưa kịp làm ngày ${d.slice(8)}/${d.slice(5, 7)}`,
      feedback: '', flagged: false, doneAt: null, doneBy: null, doneByName: '', movedTo: null,
      ...(uid === undefined ? { assignee: t.assignee || S.user.id, assigneeName: t.assignee ? t.assigneeName : S.user.name }
        : { assignee: uid || null, assigneeName: uid ? userName(uid) : '', origAssignee: t.assignee || S.user.id, origAssigneeName: t.assignee ? t.assigneeName : S.user.name }),
      createdBy: S.user.id, createdAt: Date.now(),
    } },
  ]);
}

export async function approve(t) {
  const next = t.sendCSKH ? 'approved' : 'done';
  const own = !t.assignee && t.doneBy ? { assignee: t.doneBy, assigneeName: t.doneByName || userName(t.doneBy) } : {};
  await patchTask(t, { status: next, flagged: false, feedback: '', ...own });
  const to = t.doneBy || t.assignee;
  if (to) await notify([to], t.sendCSKH ? `Chuyên môn đã duyệt, hãy gửi CSKH: ${t.title}` : `Chuyên môn đã duyệt: ${t.title}`, `#/today?date=${t.date}&fac=${t.facility}`);
}
/** Lịch sử phản hồi: chuyên môn ghi vào feedbackLog, trợ giảng ghi vào taLog (để biết phản hồi được sửa trước hay sau khi trợ giảng làm). */
export const fbEntry = (action, text) => ({ at: Date.now(), by: S.user.id, byName: S.user.name, action, text: text || '' });

/** Nhật ký phản hồi hiện có; phản hồi cũ (chưa có nhật ký) được đưa vào làm dòng đầu để không bị mất. */
export const fbBase = (t) => (t.feedbackLog && t.feedbackLog.length ? t.feedbackLog : (t.feedback ? [{ at: 1, by: '', byName: 'Phản hồi cũ', action: 'legacy', text: t.feedback }] : []));

export async function requestFix(t, feedback, flag = false) {
  const to = t.doneBy || t.assignee;
  const p = { status: 'fix', feedback: `${S.user.name}: ${feedback}`, flagged: true, feedbackLog: [...fbBase(t), fbEntry(flag ? 'flag' : 'request', feedback)] };
  if (!t.assignee && to) { p.assignee = to; p.assigneeName = userName(to); }
  await patchTask(t, p);
  if (to) await notify([to], `${flag ? 'Công tác bị đánh dấu lỗi' : 'Cần sửa lại'}: ${t.title}. ${feedback}`, `#/today?date=${t.date}&fac=${t.facility}`);
}
export const removeTask = (t) => S.db.remove('tasks', t.id);
export const saveNote = (t, note) => S.db.update('tasks', t.id, { note });

/** Thứ tự theo thời gian: "Đầu ca/đầu ngày" lên trước, giờ cụ thể theo giờ, việc không ghi giờ ở giữa, "Cuối ca/cuối ngày" xuống cuối. */
export function timeRank(time) {
  const x = String(time || '').toLowerCase().trim();
  if (!x) return 5000;
  if (/đầu/.test(x)) return 0;
  if (/cuối/.test(x)) return 9000;
  const m = x.match(/(\d{1,2})\s*[h:g]\s*(\d{0,2})/);
  if (m) return 100 + Number(m[1]) * 60 + Number(m[2] || 0);
  return 5000;
}
export const taskKey = (t) => `${String(timeRank(t.time)).padStart(5, '0')}|${String(t.order || 0).padStart(5, '0')}|${t.title}`;
export function taskSort(a, b) {
  return timeRank(a.time) - timeRank(b.time) || (a.order || 0) - (b.order || 0) || a.title.localeCompare(b.title);
}

/** Mẫu việc của một việc. Đối chiếu theo tên để không lấy nhầm hướng dẫn của mẫu khác khi mã mẫu bị đánh số lại. */
export function tplOf(t) {
  if (!t.tplId) return null;
  const title = String(t.title || '').replace(/ \(ca (sáng|chiều|tối)\)$/, '');
  const byId = S.templates.find((x) => x.id === t.tplId);
  if (byId && byId.name === title) return byId;
  const byName = S.templates.find((x) => x.name === title);
  if (byName) return byName;
  return byId && Number(String(byId.id).slice(1)) < 81 ? byId : null;
}
/** Việc hàng ngày sinh nhầm vào ngày cơ sở không có lớp, chưa ai đụng tới: coi như không tồn tại (không bôi đỏ, không tính). */
export function isGhost(t) {
  if (t.status !== 'todo' || t.note || t.assignee || t.source !== 'template') return false;
  const tpl = tplOf(t);
  if (!tpl || !tpl.rule || tpl.rule.type !== 'daily') return false;
  const W = workDows(S.classes, t.facility);
  return !!W && !W.has(dow(t.date));
}
export function isOverdue(t) {
  if (isGhost(t)) return false;
  // việc đã bị dời ngày vì làm trễ: vẫn đỏ theo ngày gốc cho tới khi xong
  if (isOpen(t) && t.origDate && t.origDate < todayStr() && nextWorkDay(t.origDate, workDows(S.classes, t.facility)) < todayStr()) return true;
  if (!isOpen(t) || t.date >= todayStr()) return false;
  // ngày cơ sở không có lớp: việc làm ở ngày có lớp kế tiếp, chỉ quá hạn khi ngày đó đã qua
  const W = workDows(S.classes, t.facility);
  return nextWorkDay(t.date, W) < todayStr();
}
/** Tự đẩy việc chưa xong của các ngày trước sang ngày làm việc hôm nay, ở dạng CHƯA GIAO AI (không cần trợ giảng bấm kết thúc ca).
 *  Người hôm trước vẫn được ghi (origAssignee + origDate) để tính KPI / bôi đỏ. Chạy tối đa 1 lần/ngày/thiết bị, chỉ đọc vài truy vấn theo ngày. */
export async function rollOver(fac) {
  const today = todayStr();
  const W = workDows(S.classes, fac);
  if (!W || !W.has(dow(today))) return 0;
  const grp = isCM() ? 'cm' : 'ta';
  const mk = `lime_roll_${fac}_${grp}`;
  let last = ''; try { last = localStorage.getItem(mk) || ''; } catch { /* không có localStorage */ }
  if (last === today) return 0;
  let from = last ? addDays(last, 1) : addDays(today, -1);
  if (from < addDays(today, -7)) from = addDays(today, -7);
  const ops = []; const seen = new Set();
  for (let d = from; d < today; d = addDays(d, 1)) {
    const ts = await S.db.getAll('tasks', scoped([['facility', '==', fac], ['date', '==', d]]));
    for (const t of ts) {
      if (seen.has(t.id) || t.status !== 'todo' || isGhost(t) || (t.origDate && t.origDate < addDays(today, -14))) continue;
      seen.add(t.id);
      const prev = t.assignee || null;
      ops.push({ op: 'update', col: 'tasks', id: t.id, data: {
        assignee: null, assigneeName: '', date: today, month: today.slice(0, 7), rolled: true, open: true, carry: true,
        origDate: t.origDate || t.date,
        ...(prev ? { origAssignee: t.origAssignee || prev, origAssigneeName: t.origAssigneeName || t.assigneeName || userName(prev) } : {}),
        moveLog: [...(t.moveLog || []), { from: t.date, to: today, by: 'auto', byName: 'Tự động chuyển cuối ngày', at: Date.now() }],
      } });
    }
  }
  // việc tự chuyển tiếp (carry) cũ hơn cửa sổ: cũng bỏ người nhận cũ, giữ tên để tính KPI
  const carryOld = await S.db.getAll('tasks', scoped([['facility', '==', fac], ['carry', '==', true], ['open', '==', true]]));
  for (const t of carryOld) {
    if (seen.has(t.id) || t.status !== 'todo' || t.date >= today || !t.assignee || isGhost(t)) continue;
    ops.push({ op: 'update', col: 'tasks', id: t.id, data: { assignee: null, assigneeName: '', origAssignee: t.origAssignee || t.assignee, origAssigneeName: t.origAssigneeName || t.assigneeName,
      origDate: t.origDate || t.date, rolled: true } });
  }
  if (ops.length) await S.db.batch(ops);
  try { localStorage.setItem(mk, today); } catch { /* bỏ qua */ }
  return ops.length;
}
export function tomorrow() { return addDays(todayStr(), 1); }
