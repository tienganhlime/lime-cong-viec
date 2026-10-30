// Trạng thái dùng chung và các thao tác trên công việc
import { FACILITIES } from './config.js';
import { isOpen, addDays, todayStr } from './rules.js';

export const S = {
  db: null, user: null, users: [], templates: [], chains: [], classes: [], students: [], schedules: {}, scheduleKeys: {},
  notifications: [], facility: 'yenhoa', facilities: FACILITIES, navigate: null, rerenderShell: null,
};

export const ROLE_LABEL = { admin: 'Admin', manager: 'Quản lý', cm: 'Chuyên môn', ta: 'Trợ giảng' };
export const GROUP_LABEL = { ta: 'Trợ giảng', cm: 'Chuyên môn', both: 'Cả 2 đội' };
export const isCM = () => ['admin', 'manager', 'cm'].includes(S.user.role);
export const isMgr = () => ['admin', 'manager'].includes(S.user.role);
export const isTA = () => S.user.role === 'ta';
export const facName = (id) => (S.facilities.find((f) => f.id === id) || { name: id }).name;
export const userName = (id) => (S.users.find((u) => u.id === id) || {}).name || '';
export const myGroups = () => (isTA() ? ['ta', 'both'] : ['cm', 'both']);

// Người nhận việc theo nhóm
export function usersOfGroup(g) {
  const act = S.users.filter((u) => !u.disabled);
  if (g === 'ta') return act.filter((u) => u.role === 'ta');
  if (g === 'cm') return act.filter((u) => u.role === 'cm' || u.role === 'manager');
  return act.filter((u) => u.role !== 'admin');
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
export const moveDate = (t, date) => patchTask(t, { date });

/* Làm dở / chưa kịp làm: ghi tiến độ và chuyển sang ngày khác.
   - Việc đang tự chuyển tiếp (carry): giữ nguyên 1 việc, dời ngày, nối tiến độ vào ghi chú.
   - Việc hàng ngày (không tự chuyển tiếp): đóng việc hôm nay ở trạng thái "partial", tạo việc "Làm bù" ở ngày mới. */
export async function postpone(t, date, progress = '') {
  const d = t.date;
  const line = progress.trim() ? `[${d.slice(8)}/${d.slice(5, 7)} · ${S.user.name}] ${progress.trim()}` : '';
  const note = [t.note, line].filter(Boolean).join('\n');
  if (t.carry) return patchTask(t, { date, note, assignee: t.assignee || S.user.id, assigneeName: t.assignee ? t.assigneeName : S.user.name });
  const id = S.db.newId();
  const { id: _omit, ...rest } = t;
  await S.db.batch([
    { op: 'update', col: 'tasks', id: t.id, data: { status: 'partial', open: false, note, doneBy: S.user.id, doneByName: S.user.name, movedTo: date } },
    { op: 'set', col: 'tasks', id, data: {
      ...rest, title: t.title.startsWith('Làm bù: ') ? t.title : `Làm bù: ${t.title}`, date, month: date.slice(0, 7), tplId: '', source: 'makeup', refId: t.id,
      status: 'todo', open: true, carry: true, note: line ? `Từ ${d.slice(8)}/${d.slice(5, 7)}: ${progress.trim()}` : `Chưa kịp làm ngày ${d.slice(8)}/${d.slice(5, 7)}`,
      feedback: '', flagged: false, doneAt: null, doneBy: null, doneByName: '', movedTo: null,
      assignee: t.assignee || S.user.id, assigneeName: t.assignee ? t.assigneeName : S.user.name,
      createdBy: S.user.id, createdAt: Date.now(),
    } },
  ]);
}

export async function approve(t) {
  const next = t.sendCSKH ? 'approved' : 'done';
  await patchTask(t, { status: next, flagged: false, feedback: '' });
  const to = t.doneBy || t.assignee;
  if (to) await notify([to], t.sendCSKH ? `Chuyên môn đã duyệt, hãy gửi CSKH: ${t.title}` : `Chuyên môn đã duyệt: ${t.title}`, `#/today?date=${t.date}&fac=${t.facility}`);
}
export async function requestFix(t, feedback, flag = false) {
  const to = t.doneBy || t.assignee;
  const p = { status: 'fix', feedback: `${S.user.name}: ${feedback}`, flagged: true };
  if (!t.assignee && to) { p.assignee = to; p.assigneeName = userName(to); }
  await patchTask(t, p);
  if (to) await notify([to], `${flag ? 'Công tác bị đánh dấu lỗi' : 'Cần sửa lại'}: ${t.title}. ${feedback}`, `#/today?date=${t.date}&fac=${t.facility}`);
}
export const removeTask = (t) => S.db.remove('tasks', t.id);
export const saveNote = (t, note) => S.db.update('tasks', t.id, { note });

export const taskKey = (t) => `${t.time || 'zz'}|${String(t.order || 0).padStart(5, '0')}|${t.title}`;
export function taskSort(a, b) {
  return (a.time || 'zz').localeCompare(b.time || 'zz') || (a.order || 0) - (b.order || 0) || a.title.localeCompare(b.title);
}

export function isOverdue(t) { return isOpen(t) && t.date < todayStr(); }
export function tomorrow() { return addDays(todayStr(), 1); }
