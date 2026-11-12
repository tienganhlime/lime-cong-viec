import { h, mount, toast, modal, confirmDlg, makeRedraw, sortBy, fmtDM } from './ui.js';
import { S, tplOf, isMgr, isCM, ROLE_LABEL, GROUP_LABEL, facName } from './core.js';
import { generateMonth, workDows, isWorkDay, nextWorkDay, scheduleText, todayStr, monthOf, addMonths, DOW_NAMES, daysInMonth, dow } from './rules.js';
import { PEOPLE, LEFT, tplPlan } from './assign.js';
import { USERNAME_RE, normUsername, errMsg, isFirebase } from './db.js';

/** Áp phân công chuyên môn: lớp phụ trách + cơ sở làm việc của từng người, người làm của từng mẫu việc, khóa tài khoản người đã nghỉ,
    rồi tạo lại các việc chuyên môn chưa làm từ hôm nay. Việc đã làm hoặc đã ghi chú được giữ nguyên. */
export async function applyCmAssignment() {
  const byName = {}; for (const u of S.users) byName[u.username] = u;
  const missing = Object.keys(PEOPLE).filter((k) => !byName[k]);
  if (missing.length) { toast('Chưa có tài khoản: ' + missing.join(', '), 'err'); return; }
  const today = todayStr(); const facs = S.facilities.map((f) => f.id);
  const idOf = (un) => byName[un].id;
  const ops = [];
  const patchU = {};
  for (const [un, p] of Object.entries(PEOPLE)) { patchU[idOf(un)] = { classCodes: p.classes, cmFacilities: p.cmFacilities, cmType: p.type, nick: p.nick }; }
  for (const un of LEFT) if (byName[un]) patchU[idOf(un)] = { disabled: true };
  for (const [id, data] of Object.entries(patchU)) ops.push({ op: 'update', col: 'users', id, data });
  // việc của người đã nghỉ: xóa các việc chưa làm từ hôm nay
  const del = [];
  for (const un of LEFT) {
    if (!byName[un]) continue;
    for (const t of await S.db.getAll('tasks', [['assignee', '==', idOf(un)]])) if (t.status === 'todo' && !t.note && t.date >= today) del.push({ op: 'delete', col: 'tasks', id: t.id });
  }
  const tpls = S.templates.filter((t) => t.group === 'cm').map((t) => {
    const plan = tplPlan(t.id);
    const x = { ...t, perClass: false, rotate: !!plan.rotate };
    if (plan.assignees) { x.assignees = plan.assignees.map(idOf); delete x.assigneesByFac; }
    else { x.assigneesByFac = Object.fromEntries(Object.entries(plan.byFac).map(([f, l]) => [f, l.map(idOf)])); x.assignees = []; }
    if (plan.rotate) { x.rule = { type: 'daily' }; x.repeatText = 'Hàng ngày (chia đều các lớp trong 2 tuần)'; x.auto = true; x.weekendShifts = false; }
    return x;
  });
  for (const t of tpls) ops.push({ op: 'update', col: 'templates', id: t.id, data: { assignees: t.assignees, assigneesByFac: t.assigneesByFac || null, perClass: false, rotate: t.rotate, rule: t.rule, repeatText: t.repeatText, auto: t.auto, ...(t.rotate ? { weekendShifts: false } : {}) } });
  await S.db.batch(ops);
  // xóa các việc chuyên môn tự sinh chưa làm từ hôm nay (kể cả bản theo người của lần phân công cũ), rồi sinh lại
  for (const t of tpls.filter((x) => x.auto && x.rule && x.rule.type !== 'none')) {
    for (const fac of facs) {
      for (const o of await S.db.getAll('tasks', [['facility', '==', fac], ['tplId', '==', t.id]])) if (o.date >= today && o.status === 'todo' && !o.note && o.source === 'template') del.push({ op: 'delete', col: 'tasks', id: o.id });
    }
  }
  if (del.length) await S.db.batch(del);
  const users = S.users.map((u) => (patchU[u.id] ? { ...u, ...patchU[u.id] } : u));
  const add = [];
  for (const g of S.gen || []) {
    const ym = g.slice(4);
    if (ym < monthOf(today)) continue;
    const existing = await S.db.getAll('tasks', [['month', '==', ym]]);
    const gen = generateMonth({ templates: tpls, schedules: S.schedules, facilities: facs, ym, existingIds: new Set(existing.map((x) => x.id)), by: S.user.id, cutoff: today, users, classes: S.classes });
    for (const x of gen) add.push({ op: 'set', col: 'tasks', id: x.id, data: x.data });
  }
  if (add.length) await S.db.batch(add);
  toast(`Đã phân công xong: xóa ${del.length} việc cũ chưa làm, tạo ${add.length} việc mới`);
}

/** Dọn việc đã sinh vào ngày cơ sở không có lớp (từ đầu tháng trước đến hết tháng sau): việc hàng ngày chưa làm thì xóa, việc khác dời sang ngày có lớp kế tiếp. */
export async function cleanNonWorkDays() {
  const today = todayStr(); const from = `${addMonths(monthOf(today), -1)}-01`; const to = `${addMonths(monthOf(today), 1)}-31`;
  let removed = 0; let moved = 0; const ops = [];
  for (const f of S.facilities) {
    const W = workDows(S.classes, f.id);
    if (!W) continue;
    const dates = []; for (let d = from; d <= to; d = addDays(d, 1)) if (!isWorkDay(d, W) && d.slice(8, 10) <= '31') dates.push(d);
    for (let i = 0; i < dates.length; i += 30) {
      const ts = await S.db.getAll('tasks', [['facility', '==', f.id], ['date', 'in', dates.slice(i, i + 30)]]);
      for (const t of ts) {
        if (t.status !== 'todo' || t.note) continue;
        const tpl = t.tplId && S.templates.find((x) => x.id === t.tplId);
        if (t.source === 'template' && tpl && tpl.rule && tpl.rule.type === 'daily') { ops.push({ op: 'delete', col: 'tasks', id: t.id }); removed++; }
        else { const nd = nextWorkDay(t.date, W); ops.push({ op: 'update', col: 'tasks', id: t.id, data: { date: nd, month: nd.slice(0, 7) } }); moved++; }
      }
    }
  }
  if (ops.length) await S.db.batch(ops);
  return { removed, moved };
}

/** Dọn việc trùng: cùng cơ sở + ngày + tên việc + mẫu, việc thừa chưa ai đụng tới (chưa làm, không ghi chú, không người nhận) thì xóa, giữ lại việc có tiến độ. */
export async function cleanDuplicateTasks() {
  const ym = monthOf(todayStr()); const ops = []; let removed = 0;
  for (const f of S.facilities) for (const m of [ym, addMonths(ym, 1)]) {
    const ts = await S.db.getAll('tasks', [['facility', '==', f.id], ['month', '==', m]]);
    const groups = new Map();
    for (const t of ts) { const k = `${t.date}|${t.title}|${t.group}|${t.source}|${t.shift || ''}|${t.assignee || ''}`; (groups.get(k) || groups.set(k, []).get(k)).push(t); }
    const rank = (t) => (t.status !== 'todo' ? 3 : 0) + (t.note ? 2 : 0) + (t.assignee ? 1 : 0) + (t.parts && Object.keys(t.parts).length ? 2 : 0);
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => rank(b) - rank(a));
      for (const t of list.slice(1)) if (t.status === 'todo' && !t.note && !(t.parts && Object.keys(t.parts).length)) { ops.push({ op: 'delete', col: 'tasks', id: t.id }); removed++; }
    }
  }
  if (ops.length) await S.db.batch(ops);
  return removed;
}

/** Sửa các việc cũ bị gắn nhầm mẫu (do mã mẫu bị đánh số lại): đối chiếu theo tên việc, chuyển về đúng mẫu. */
export async function fixStaleTemplateLinks() {
  const ids = S.templates.map((t) => t.id).filter((id) => Number(id.slice(1)) >= 81);
  const found = [];
  for (let i = 0; i < ids.length; i += 10) found.push(...(await S.db.getAll('tasks', [['tplId', 'in', ids.slice(i, i + 10)]])));
  const byName = new Map(S.templates.map((t) => [t.name, t]));
  const moves = []; const keep = new Set();
  for (const t of found) {
    const want = byName.get(String(t.title).replace(/ \(ca (sáng|chiều|tối)\)$/, ''));
    if (want && want.id !== t.tplId) moves.push({ t, want }); else keep.add(t.id);
  }
  const dels = []; const sets = []; let relinked = 0;
  for (const { t, want } of moves) {
    const nid = t.id.includes(`_${t.tplId}`) ? t.id.replace(`_${t.tplId}`, `_${want.id}`) : t.id;
    const { id: _o, ...rest } = t;
    if (nid === t.id || keep.has(nid)) { sets.push({ op: 'update', col: 'tasks', id: t.id, data: { tplId: want.id, order: want.order || 0 } }); relinked++; continue; }
    dels.push({ op: 'delete', col: 'tasks', id: t.id });
    sets.push({ op: 'set', col: 'tasks', id: nid, data: { ...rest, tplId: want.id, order: want.order || 0 } });
  }
  if (dels.length || sets.length) await S.db.batch([...dels, ...sets]);
  return { checked: found.length, moved: moves.length, relinked };
}

/* ====================== MẪU VIỆC ====================== */
export function ruleText(r) {
  if (!r) return '';
  if (r.type === 'daily') return 'Hàng ngày';
  if (r.type === 'biweekly') return `2 tuần 1 lần, ${(r.dow || []).map((d) => DOW_NAMES[d]).join(', ')} (từ ${r.anchor ? fmtDM(r.anchor) : '?'})`;
  if (r.type === 'weekly') return 'Thứ: ' + (r.dow || []).map((d) => DOW_NAMES[d]).join(', ');
  if (r.type === 'monthly') return 'Ngày ' + (r.days || []).join(', ') + (r.months && r.months.length ? ` (tháng ${r.months.join(', ')})` : '');
  if (r.type === 'weekstart') return 'Đầu mỗi tuần';
  return 'Không tự sinh';
}

export async function generateFor(ym, facilities) {
  const existing = await S.db.getAll('tasks', [['month', '==', ym]]);
  const ids = new Set(existing.map((t) => t.id));
  const gen = generateMonth({ templates: S.templates, schedules: S.schedules, facilities, ym, existingIds: ids, by: S.user.id, cutoff: todayStr(), users: S.users, classes: S.classes });
  await S.db.batch(gen.map((g) => ({ op: 'set', col: 'tasks', id: g.id, data: g.data })));
  return gen.length;
}

/** Áp dụng lịch lớp mới vào các việc đã tạo từ hôm nay trở đi (sửa danh sách lớp, thêm ngày mới, bỏ ngày không còn). */
export async function syncSchedule(fac, key, schedules) {
  const from = todayStr();
  const tpls = S.templates.filter((t) => t.scheduleKey === key && t.auto && t.rule && t.rule.type !== 'none' && (!t.facilities || t.facilities.includes(fac)));
  if (!tpls.length) return { changed: 0, added: 0, removed: 0 };
  const olds = [];
  for (const t of tpls) olds.push(...(await S.db.getAll('tasks', [['facility', '==', fac], ['tplId', '==', t.id]])));
  const ops = []; let changed = 0; let removed = 0;
  const months = new Set();
  for (const t of tpls) {
    for (const o of olds.filter((x) => x.tplId === t.id && x.date >= from)) {
      if (tplOf(o) !== t) continue; // việc cũ bị gắn nhầm mẫu (lệch số): không đụng, chờ "Sửa liên kết"
      months.add(o.month);
      const sc = scheduleText(t, fac, o.date, schedules);
      if (o.title !== t.name && o.status !== 'na' && !o.shift) ops.push({ op: 'update', col: 'tasks', id: o.id, data: { title: t.name } }); // mẫu đã đổi tên
      if (sc.skip) { if (o.status === 'todo') { ops.push({ op: 'update', col: 'tasks', id: o.id, data: { status: 'na', open: false, note: 'Lịch lớp đã đổi: ngày này không còn việc' } }); removed++; } }
      else if (sc.text !== o.extra && (o.status === 'todo' || o.status === 'fix')) { ops.push({ op: 'update', col: 'tasks', id: o.id, data: { extra: sc.text } }); changed++; }
    }
  }
  let added = 0;
  for (const ym of [...new Set([monthOf(from), ...[...S.gen || []].map((g) => g.slice(4)).filter((m) => m >= monthOf(from))])]) {
    const ids = new Set(olds.map((o) => o.id));
    const gen = generateMonth({ templates: tpls, schedules, facilities: [fac], ym, existingIds: ids, by: S.user.id, cutoff: from, users: S.users, classes: S.classes });
    for (const g of gen) { ops.push({ op: 'set', col: 'tasks', id: g.id, data: g.data }); added++; }
  }
  if (ops.length) await S.db.batch(ops);
  return { changed, added, removed };
}

function templateModal(tpl) {
  const t = tpl ? JSON.parse(JSON.stringify(tpl)) : { name: '', group: 'ta', rule: { type: 'daily' }, auto: true, facilities: S.facilities.map((f) => f.id), content: '', time: '', needsReview: false, sendCSKH: false };
  const name = h('input', { type: 'text', value: t.name });
  const group = h('select', null, ['ta', 'cm', 'both'].map((g) => h('option', { value: g }, GROUP_LABEL[g])));
  group.value = t.group;
  const rtype = h('select', null, [['daily', 'Hàng ngày'], ['weekly', 'Theo thứ trong tuần'], ['biweekly', '2 tuần 1 lần (chọn thứ + ngày bắt đầu)'], ['monthly', 'Theo ngày trong tháng'], ['weekstart', 'Đầu mỗi tuần'], ['none', 'Không tự sinh (chỉ tạo khi cần)']].map(([v, l]) => h('option', { value: v }, l)));
  rtype.value = t.rule.type || 'none';
  const dows = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ d, el: h('input', { type: 'checkbox', checked: (t.rule.dow || []).includes(d) }) }));
  const dowWrap = h('div', { class: 'checks' }, dows.map((x) => h('label', { class: 'check' }, x.el, DOW_NAMES[x.d])));
  const days = h('input', { type: 'text', placeholder: 'Ví dụ: 5, 20', value: (t.rule.days || []).join(', ') });
  const months = h('input', { type: 'text', placeholder: 'Để trống = mọi tháng; ví dụ: 1, 8', value: (t.rule.months || []).join(', ') });
  const anchor = h('input', { type: 'date', value: t.rule.anchor || '' });
  const wAnchor = h('label', null, 'Tuần đầu tiên làm việc này (chọn một ngày trong tuần đó, các tuần sau cách 2 tuần)', anchor);
  const wDow = h('div', { class: 'stack' }, h('div', { class: 'lab' }, 'Chọn thứ'), dowWrap, wAnchor);
  const wDay = h('div', { class: 'stack' }, h('label', null, 'Ngày trong tháng', days), h('label', null, 'Chỉ các tháng', months));
  const sync = () => { wDow.classList.toggle('hidden', rtype.value !== 'weekly' && rtype.value !== 'biweekly'); wAnchor.classList.toggle('hidden', rtype.value !== 'biweekly'); wDay.classList.toggle('hidden', rtype.value !== 'monthly'); };
  rtype.addEventListener('change', sync); sync();
  const time = h('input', { type: 'text', placeholder: 'Ví dụ: Sáng 7h30; chiều tối 16h30', value: t.time || '' });
  const content = h('textarea', { rows: 5, placeholder: 'Hướng dẫn chi tiết cách làm', value: t.content || '' });
  const review = h('input', { type: 'checkbox', checked: !!t.needsReview });
  const csk = h('input', { type: 'checkbox', checked: !!t.sendCSKH });
  const facs = S.facilities.map((f) => ({ f, el: h('input', { type: 'checkbox', checked: (t.facilities || []).includes(f.id) }) }));
  const keySel = h('select', null, h('option', { value: '' }, 'Không (dùng chung cho mọi ngày)'),
    Object.entries(S.scheduleKeys).map(([k, v]) => h('option', { value: k }, 'Theo lịch lớp: ' + v.label)));
  keySel.value = t.scheduleKey || '';
  const sch = scheduleBox(() => keySel.value);
  keySel.addEventListener('change', () => sch.draw());
  const cms = S.users.filter((u) => (u.role === 'cm' || u.role === 'manager') && !u.disabled);
  const asg = cms.map((u) => ({ u, el: h('input', { type: 'checkbox', checked: (t.assignees || []).includes(u.id) }) }));
  const wk = h('input', { type: 'checkbox', checked: t.weekendShifts == null ? (t.group === 'cm' && t.rule.type === 'daily' && !t.scheduleKey) : !!t.weekendShifts });
  const rot = h('input', { type: 'checkbox', checked: !!t.rotate });
  const perClass = h('input', { type: 'checkbox', checked: !!t.perClass });
  const asgBox = h('div', { class: 'stack' }, h('div', { class: 'lab' }, 'Giao cho (chỉ áp dụng đội Chuyên môn; không chọn ai = việc chung, ai làm cũng được)'),
    h('div', { class: 'checks' }, asg.length ? asg.map((x) => h('label', { class: 'check' }, x.el, x.u.name)) : h('span', { class: 'muted small' }, 'Chưa có tài khoản Chuyên môn')),
    h('div', { class: 'checks' }, h('label', { class: 'check' }, perClass, 'Ghi kèm tất cả "Lớp phụ trách" của người đó vào việc'), h('label', { class: 'check' }, rot, 'Chia đều các lớp phụ trách trong 2 tuần (mỗi ngày ghi 1-2 lớp cần kiểm tra hôm nay)')),
    h('p', { class: 'muted small' }, 'Chọn nhiều người = mỗi người nhận một việc riêng, hiện đỏ nếu quá hạn. Chỉ áp dụng cho các ngày được tạo từ lần sau.'));
  const syncAsg = () => asgBox.classList.toggle('hidden', group.value !== 'cm');
  group.addEventListener('change', syncAsg); syncAsg();
  modal({
    title: tpl ? 'Sửa mẫu việc' : 'Thêm mẫu việc', wide: true,
    body: h('div', { class: 'stack' },
      h('label', null, 'Tên công việc *', name),
      h('div', { class: 'grid2' }, h('label', null, 'Đội thực hiện', group), h('label', null, 'Giờ làm', time)),
      h('label', null, 'Kiểu lặp', rtype), wDow, wDay,
      h('label', null, 'Gắn với lịch lớp (danh sách lớp hiện kèm trong việc)', keySel), sch.box,
      asgBox,
      h('div', { class: 'checks' }, h('label', { class: 'check' }, wk, 'Thứ 7 / Chủ nhật: lặp lại theo ca (sáng, chiều, tối) cho các lớp của từng ca')),
      h('label', null, 'Hướng dẫn chi tiết', content),
      h('div', null, h('div', { class: 'lab' }, 'Áp dụng ở cơ sở'), h('div', { class: 'checks' }, facs.map((x) => h('label', { class: 'check' }, x.el, x.f.name)))),
      h('div', { class: 'checks' }, h('label', { class: 'check' }, review, 'Cần chuyên môn duyệt sau khi làm xong'), h('label', { class: 'check' }, csk, 'Sau khi duyệt, trợ giảng gửi CSKH'))),
    actions: [{ label: 'Hủy', kind: 'ghost' }, {
      label: 'Lưu mẫu', kind: 'primary',
      onClick: async () => {
        if (!name.value.trim()) { toast('Hãy nhập tên công việc', 'err'); return false; }
        const rule = { type: rtype.value };
        if (rule.type === 'weekly' || rule.type === 'biweekly') rule.dow = dows.filter((x) => x.el.checked).map((x) => x.d);
        if (rule.type === 'biweekly') { rule.anchor = anchor.value; if (!rule.anchor) { toast('Hãy chọn tuần bắt đầu cho việc 2 tuần 1 lần', 'err'); return false; } }
        if (rule.type === 'monthly') {
          rule.days = days.value.split(/[,;\s]+/).map(Number).filter((n) => n >= 1 && n <= 31);
          const ms = months.value.split(/[,;\s]+/).map(Number).filter((n) => n >= 1 && n <= 12);
          if (ms.length) rule.months = ms;
        }
        if ((rule.dow && !rule.dow.length) || (rule.days && !rule.days.length)) { toast('Hãy chọn thứ hoặc ngày lặp lại', 'err'); return false; }
        const key = keySel.value;
        const data = {
          ...t, name: name.value.trim(), group: group.value, rule, auto: rule.type !== 'none', time: time.value.trim(), content: content.value.trim(),
          needsReview: review.checked, reviewText: review.checked ? 'Có' : 'Không', sendCSKH: csk.checked,
          facilities: facs.filter((x) => x.el.checked).map((x) => x.f.id), repeatText: ruleText(rule), scheduleKey: key || null,
          scheduleMode: key ? (S.scheduleKeys[key] || {}).mode : null,
          assignees: group.value === 'cm' ? asg.filter((x) => x.el.checked).map((x) => x.u.id) : [], assigneesByFac: group.value === 'cm' && !asg.some((x) => x.el.checked) ? (t.assigneesByFac || null) : null, perClass: group.value === 'cm' && perClass.checked, rotate: group.value === 'cm' && rot.checked, weekendShifts: wk.checked,
        };
        if (!data.scheduleKey) { delete data.scheduleKey; delete data.scheduleMode; }
        if (tpl) await S.db.set('templates', tpl.id, data);
        else { const id = S.db.newId(); data.id = id; data.order = 800; data.source = 'manager'; await S.db.set('templates', id, data); }
        toast('Đã lưu mẫu việc');
      },
    }],
  });
}

export function viewTemplates(root) {
  let q = ''; let g = 'all';
  const redraw = makeRedraw(root, render);
  const unsub = S.db.subscribe('templates', [], () => redraw());
  const months = [monthOf(todayStr()), addMonths(monthOf(todayStr()), 1)];
  let genMonth = months[0]; const genFacs = new Set(S.facilities.map((f) => f.id));

  function render() {
    let list = S.templates.filter((t) => (g === 'all' || t.group === g) && (!q || t.name.toLowerCase().includes(q.toLowerCase())));
    list = sortBy(list, (t) => ({ ta: 0, cm: 1, both: 2 }[t.group] ?? 3), 'order');
    const genBox = h('div', { class: 'panel' }, h('div', { class: 'stack' },
      h('h3', null, 'Khởi tạo checklist tháng'),
      h('p', { class: 'muted' }, 'Hệ thống tự tạo việc từ các mẫu bên dưới. Bấm tạo để bổ sung những việc còn thiếu (việc đã có và đang làm dở không bị ghi đè).'),
      h('div', { class: 'toolbar wrap' },
        h('select', { onChange: (e) => { genMonth = e.target.value; } }, months.map((m) => h('option', { value: m }, `Tháng ${m.slice(5)}/${m.slice(0, 4)}`))),
        S.facilities.map((f) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: genFacs.has(f.id), onChange: (e) => { e.target.checked ? genFacs.add(f.id) : genFacs.delete(f.id); } }), f.name)),
        h('button', { class: 'btn primary', type: 'button', onClick: async (e) => {
          if (!genFacs.size) return toast('Chọn ít nhất một cơ sở', 'err');
          e.currentTarget.disabled = true;
          try { const n = await generateFor(genMonth, [...genFacs]); toast(n ? `Đã tạo thêm ${n} việc` : 'Không có việc nào cần bổ sung'); }
          catch (er) { toast(errMsg(er), 'err'); } finally { e.currentTarget.disabled = false; }
        } }, 'Tạo việc còn thiếu'))));
    mount(root, 
      h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Mẫu việc'), h('p', { class: 'muted' }, `${S.templates.length} mẫu. Sửa mẫu sẽ áp dụng cho các lần tạo checklist sau.`)),
        h('button', { class: 'btn primary', type: 'button', onClick: () => templateModal(null) }, '+ Thêm mẫu')),
      genBox,
      h('div', { class: 'toolbar wrap' },
        h('div', { class: 'seg' }, [['all', 'Tất cả'], ['ta', 'Trợ giảng'], ['cm', 'Chuyên môn'], ['both', 'Cả 2']].map(([v, l]) => h('button', { class: 'seg-b' + (g === v ? ' on' : ''), type: 'button', onClick: () => { g = v; render(); } }, l))),
        h('input', { type: 'search', class: 'search', placeholder: 'Tìm mẫu việc…', value: q, onInput: (e) => { q = e.target.value; redraw(); } })),
      h('div', { class: 'scroll' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['Công việc', 'Đội', 'Lịch sinh việc', 'Duyệt', ''].map((x) => h('th', null, x)))),
        h('tbody', null, list.map((t) => h('tr', null,
          h('td', null, h('b', null, t.name), t.time && h('div', { class: 'muted small' }, t.time), t.scheduleKey && h('div', { class: 'muted small' }, 'Theo lịch lớp từng cơ sở')),
          h('td', null, GROUP_LABEL[t.group]),
          h('td', null, t.rule && t.rule.type !== 'none' ? ruleText(t.rule) : h('span', { class: 'muted' }, 'Tạo khi cần'), t.scheduleText && h('div', { class: 'muted small clamp' }, t.scheduleText)),
          h('td', null, t.needsReview ? 'Có' : ''),
          h('td', { class: 'right' }, h('button', { class: 'btn ghost sm', type: 'button', onClick: () => templateModal(t) }, 'Sửa'),
            h('button', { class: 'btn ghost sm danger', type: 'button', onClick: async () => { if (await confirmDlg(`Xóa mẫu "${t.name}"? Các việc đã tạo trong checklist vẫn giữ nguyên.`, { okLabel: 'Xóa', danger: true })) S.db.remove('templates', t.id); } }, 'Xóa'))))))));
  }
  render();
  return () => unsub();
}

/* ====================== LỊCH LỚP ====================== */
function scheduleLabels(k) {
  return k.mode === 'monthday' ? Array.from({ length: 31 }, (_, i) => [String(i + 1), `Ngày ${i + 1}`])
    : k.mode === 'weekidx' ? [1, 2, 3, 4, 5].map((i) => [String(i), `Tuần ${i} của tháng`])
      : DOW_NAMES.slice(1).map((n, i) => [String(i + 1), n]);
}
async function saveSchedule(fac, key, draft) {
  const clean = {}; for (const [a, b] of Object.entries(draft)) if (String(b).trim()) clean[a] = String(b).trim();
  const data = JSON.parse(JSON.stringify(S.schedules || {})); data[fac] = data[fac] || {}; data[fac][key] = clean;
  await S.db.set('meta', 'schedules', { data, keys: S.scheduleKeys });
  toast('Đã lưu lịch lớp.');
  if (await confirmDlg('Áp dụng lịch mới vào các việc đã tạo từ hôm nay trở đi? (Sửa danh sách lớp, thêm ngày mới, bỏ ngày không còn việc.)', { okLabel: 'Áp dụng', title: 'Lịch lớp đã đổi' })) {
    const r = await syncSchedule(fac, key, data);
    toast(`Đã cập nhật ${r.changed} việc, thêm ${r.added}, bỏ ${r.removed}`);
  }
}
/** Bảng sửa lịch lớp ngay trong màn hình sửa mẫu việc: chọn cơ sở, sửa từng tuần / thứ / ngày. */
function scheduleBox(getKey) {
  const box = h('div', { class: 'stack sch-box' });
  let fac = S.facility; let draft = {};
  const draw = () => {
    const key = getKey();
    box.classList.toggle('hidden', !key);
    if (!key) return;
    draft = { ...((S.schedules[fac] && S.schedules[fac][key]) || {}) };
    const k = S.scheduleKeys[key] || { mode: 'weekday' };
    mount(box,
      h('div', { class: 'lab' }, 'Nội dung từng ' + (k.mode === 'weekidx' ? 'tuần trong tháng' : k.mode === 'monthday' ? 'ngày trong tháng' : 'thứ') + ' (ví dụ tuần 1: khối DORY3, tuần 2: khối DORY4)'),
      h('select', { onChange: (e) => { fac = e.target.value; draw(); } }, S.facilities.map((f) => h('option', { value: f.id, selected: f.id === fac }, f.name))),
      scheduleLabels(k).map(([id, lab]) => h('label', { class: 'sch-row' }, h('span', null, lab),
        h('input', { type: 'text', value: draft[id] || '', placeholder: 'Để trống nếu không có việc', onInput: (e) => { draft[id] = e.target.value; } }))),
      h('div', { class: 'row-actions' }, h('button', { class: 'btn primary sm', type: 'button', onClick: () => saveSchedule(fac, getKey(), draft).catch((e) => toast(e.message, 'err')) }, 'Lưu nội dung này'),
        h('span', { class: 'hint' }, 'Lưu riêng cho cơ sở đang chọn. Đổi cơ sở để sửa cơ sở kia.')));
  };
  draw();
  return { box, draw };
}

/** Đối chiếu mọi lịch lớp (test, báo cáo…) với thời khóa biểu: lớp có học đúng thứ của ngày đó không, mã lớp có tồn tại không. Chỉ dùng dữ liệu đã tải, không tốn lượt đọc. */
export function checkSchedules() {
  const norm = (s) => String(s).replace(/\s+/g, '').toUpperCase();
  const out = [];
  for (const f of S.facilities) {
    const cls = (S.classes || []).filter((c) => c.facility === f.id);
    const known = new Map(cls.map((c) => [norm(c.code), c]));
    for (const [skey, tbl] of Object.entries((S.schedules || {})[f.id] || {})) {
      const [base, ym0] = skey.split('@'); const mode = (S.scheduleKeys[base] || {}).mode;
      if (mode === 'weekidx') continue;
      const label = (S.scheduleKeys[base] || {}).label || base;
      for (const [k, text] of Object.entries(tbl || {})) {
        let dw; let when;
        if (mode === 'monthday') { const ym = ym0 || monthOf(todayStr()); const date = `${ym}-${String(k).padStart(2, '0')}`; dw = dow(date); when = fmtDM(date); }
        else { dw = Number(k); when = DOW_NAMES[dw]; }
        const t = norm(text);
        // chỉ lịch gắn với ngày học của lớp (test, chấm video) mới phải trùng buổi học; lịch báo cáo / hỗ trợ / ôn bù là phân công nên không bắt buộc
        if (['test', 'video'].includes(base)) for (const c of cls) if (t.includes(norm(c.code)) && !(c.slots || []).some((s) => s.dow === dw))
          out.push(`${f.name} · ${label} · ${when} (${DOW_NAMES[dw]}): lớp ${c.code} không có buổi học ngày này (lớp học ${(c.slots || []).map((s) => DOW_NAMES[s.dow]).join(', ')})`);
        for (const m of String(text).matchAll(/\b3?(?:CLC|CAM|DORY|GRAM|PET|FCE)\s?[A-Z]?\d[A-Z0-9]*\b/gi))
          if (![...known.keys()].some((kk) => kk.includes(norm(m[0])) || norm(m[0]).includes(kk))) out.push(`${f.name} · ${label} · ${when}: mã lớp "${m[0]}" không có trong thời khóa biểu`);
      }
    }
  }
  return [...new Set(out)];
}

export function viewSchedules(root) {
  let fac = S.facility; let key = Object.keys(S.scheduleKeys)[0];
  let draft = null; let scope = ''; // '' = mọi tháng; 'YYYY-MM' = chỉ riêng tháng đó (lịch theo ngày trong tháng)
  const skey = () => ((S.scheduleKeys[key] || {}).mode === 'monthday' && scope ? `${key}@${scope}` : key);
  const scopeOpts = () => { const m0 = monthOf(todayStr()); return ['', m0, addMonths(m0, 1), addMonths(m0, 2)]; };
  const redraw = makeRedraw(root, render);
  const unsub = S.db.subscribe('meta', [], () => redraw());

  function load() {
    const src = (S.schedules[fac] && S.schedules[fac][skey()]) || {};
    draft = { ...src };
  }
  function render() {
    if (!key) key = Object.keys(S.scheduleKeys)[0];
    if (!draft) load();
    const k = S.scheduleKeys[key] || { mode: 'weekday', label: '' };
    const labels = k.mode === 'monthday'
      ? Array.from({ length: 31 }, (_, i) => [String(i + 1), `Ngày ${i + 1}`])
      : k.mode === 'weekidx' ? [1, 2, 3, 4, 5].map((i) => [String(i), `Tuần ${i} của tháng`])
        : DOW_NAMES.slice(1).map((n, i) => [String(i + 1), n]);
    const inputs = labels.map(([id, lab]) => h('label', { class: 'sch-row' }, h('span', null, lab),
      h('input', { type: 'text', value: draft[id] || '', placeholder: 'Để trống nếu không có việc ngày này', onInput: (e) => { draft[id] = e.target.value; } })));
    mount(root, 
      h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Lịch lớp'), h('p', { class: 'muted' }, 'Danh sách lớp theo thứ hoặc theo ngày của từng cơ sở. Hệ thống dùng lịch này để tự điền lớp vào các việc như test, chấm video, đếm Limevoice, báo cáo + soạn văn.'))),
      h('div', { class: 'toolbar wrap' },
        h('button', { class: 'btn', type: 'button', onClick: () => { const r = checkSchedules(); modal({ title: 'Kiểm tra lịch lớp với thời khóa biểu', wide: true, body: r.length ? h('div', { class: 'stack' }, h('p', null, `Có ${r.length} chỗ cần xem lại:`), h('ul', null, r.map((x) => h('li', null, x)))) : h('p', null, 'Tất cả lớp trong các lịch đều có buổi học đúng ngày và mã lớp đều có trong thời khóa biểu.'), actions: [{ label: 'Đóng', kind: 'primary' }] }); } }, 'Kiểm tra lịch với thời khóa biểu'),
        h('select', { onChange: (e) => { fac = e.target.value; load(); render(); } }, S.facilities.map((f) => h('option', { value: f.id, selected: f.id === fac }, f.name))),
        h('select', { onChange: (e) => { key = e.target.value; scope = ''; load(); render(); } }, Object.entries(S.scheduleKeys).map(([id, v]) => h('option', { value: id, selected: id === key }, v.label))),
        k.mode === 'monthday' ? h('select', { title: 'Lịch này áp dụng cho', onChange: (e) => { scope = e.target.value; load(); render(); } }, scopeOpts().map((m) => h('option', { value: m, selected: m === scope }, m ? `Riêng tháng ${m.slice(5)}/${m.slice(0, 4)}` : 'Mọi tháng'))) : null),
      h('div', { class: 'panel' }, h('div', { class: 'stack' }, inputs,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn primary', type: 'button', onClick: async () => {
          const clean = {}; for (const [a, b] of Object.entries(draft)) if (String(b).trim()) clean[a] = String(b).trim();
          const data = JSON.parse(JSON.stringify(S.schedules || {})); data[fac] = data[fac] || {}; data[fac][skey()] = clean;
          await S.db.set('meta', 'schedules', { data, keys: S.scheduleKeys });
          toast('Đã lưu lịch lớp.');
          if (await confirmDlg('Áp dụng lịch mới vào các việc đã tạo từ hôm nay trở đi? (Sửa danh sách lớp, thêm ngày mới, bỏ ngày không còn việc.)', { okLabel: 'Áp dụng', title: 'Lịch lớp đã đổi' })) {
            const r = await syncSchedule(fac, key, data);
            toast(`Đã cập nhật ${r.changed} việc, thêm ${r.added}, bỏ ${r.removed}`);
          }
        } }, 'Lưu lịch lớp'),
        h('span', { class: 'hint' }, 'Sau khi lưu, hệ thống hỏi có áp dụng lịch mới vào các việc đã tạo từ hôm nay trở đi không (ví dụ lịch test bị lùi). Từng việc cũng có nút "Sửa" để chỉnh riêng một ngày.')))));
  }
  render();
  return () => unsub();
}

/* ====================== TÀI KHOẢN ====================== */
const canManageRole = (r) => (r === 'ta' ? isCM() : r === 'cm' ? isMgr() : S.user.role === 'admin');
const roleChoices = () => ['ta', 'cm', 'manager', 'admin'].filter(canManageRole);

function userModal(u) {
  const name = h('input', { type: 'text', value: u ? u.name : '', placeholder: 'Họ và tên hiển thị' });
  const un = h('input', { type: 'text', value: u ? u.username : '', placeholder: 'chữ thường, số, dấu . _ -', disabled: !!u, autocapitalize: 'none' });
  const pw = h('input', { type: 'text', placeholder: 'Ít nhất 6 ký tự', autocomplete: 'off' });
  const role = h('select', null, roleChoices().map((r) => h('option', { value: r }, ROLE_LABEL[r])));
  if (u) role.value = u.role;
  const cmType = h('select', null, h('option', { value: '' }, '—'), h('option', { value: 'hc' }, 'Chuyên môn hành chính'), h('option', { value: 'ht' }, 'Chuyên môn học thuật'));
  cmType.value = (u && u.cmType) || '';
  const codes = [...new Set([...S.classes.map((c) => c.code), ...((u && u.classCodes) || [])])].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  const have = new Set((u && u.classCodes) || []);
  const clsBoxes = codes.map((c) => ({ c, el: h('input', { type: 'checkbox', checked: have.has(c) }) }));
  const classes = h('div', { class: 'checks' }, clsBoxes.length ? clsBoxes.map((x) => h('label', { class: 'check' }, x.el, x.c)) : h('span', { class: 'muted small' }, 'Chưa có danh sách lớp (vào tab Học sinh > Thời khóa biểu)'));
  const pickedCodes = () => clsBoxes.filter((x) => x.el.checked).map((x) => x.c);
  modal({
    title: u ? 'Sửa tài khoản' : 'Tạo tài khoản',
    body: h('div', { class: 'stack' }, h('label', null, 'Họ tên', name), h('label', null, 'Tên đăng nhập', un), !u && h('label', null, 'Mật khẩu ban đầu', pw), h('label', null, 'Vai trò', role), h('label', null, 'Loại chuyên môn (để lọc thống kê)', cmType), h('div', null, h('div', { class: 'lab' }, 'Lớp phụ trách (chỉ cho Chuyên môn/Quản lý trực tiếp làm việc; tick để chọn)'), classes)),
    actions: [{ label: 'Hủy', kind: 'ghost' }, {
      label: 'Lưu', kind: 'primary',
      onClick: async () => {
        if (!name.value.trim()) { toast('Hãy nhập họ tên', 'err'); return false; }
        try {
          if (u) await S.db.update('users', u.id, { name: name.value.trim(), role: role.value, classCodes: pickedCodes(), cmType: cmType.value });
          else {
            const uname = normUsername(un.value);
            if (!USERNAME_RE.test(uname)) { toast('Tên đăng nhập gồm 3–30 ký tự: chữ thường, số, dấu . _ -', 'err'); return false; }
            if (pw.value.length < 6) { toast('Mật khẩu cần ít nhất 6 ký tự', 'err'); return false; }
            const stale = S.users.find((x) => x.username === uname);
            if (stale && stale.disabled) await S.db.update('users', stale.id, { username: `${uname}_cu_${Date.now().toString(36)}` });
            await S.db.createUser(uname, pw.value, { name: name.value.trim(), role: role.value, classCodes: pickedCodes(), cmType: cmType.value });
            toast(`Đã tạo tài khoản ${uname}. Hãy gửi tên đăng nhập và mật khẩu cho người dùng.`);
          }
        } catch (e) { toast(errMsg(e), 'err'); return false; }
      },
    }],
  });
}

export function viewUsers(root) {
  const redraw = makeRedraw(root, render);
  const unsub = S.db.subscribe('users', [], () => redraw());
  function render() {
    const list = sortBy(S.users.filter((u) => canManageRole(u.role) || true), (u) => ({ admin: 0, manager: 1, cm: 2, ta: 3 }[u.role]), 'name');
    mount(root, 
      h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Tài khoản'), h('p', { class: 'muted' }, 'Quản lý và Chuyên môn tạo, sửa, khóa tài khoản Trợ giảng. Quản lý quản lý thêm tài khoản Chuyên môn.')),
        h('button', { class: 'btn primary', type: 'button', onClick: () => userModal(null) }, '+ Tạo tài khoản')),
      h('div', { class: 'scroll' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['Họ tên', 'Đăng nhập', 'Vai trò', 'Trạng thái', ''].map((x) => h('th', null, x)))),
        h('tbody', null, list.map((u) => {
          const can = canManageRole(u.role) && u.id !== S.user.id;
          return h('tr', { class: u.disabled ? 'off' : '' },
            h('td', null, h('b', null, u.name), u.id === S.user.id && h('span', { class: 'chip inl' }, 'Bạn')),
            h('td', null, u.username), h('td', null, ROLE_LABEL[u.role]), h('td', null, u.disabled ? 'Đã khóa' : 'Đang hoạt động'),
            h('td', { class: 'right' }, can && [
              h('button', { class: 'btn ghost sm', type: 'button', onClick: () => userModal(u) }, 'Sửa'),
              h('button', { class: 'btn ghost sm ' + (u.disabled ? '' : 'danger'), type: 'button', onClick: async () => {
                if (u.disabled) { await S.db.update('users', u.id, { disabled: false }); toast('Đã mở khóa'); return; }
                if (await confirmDlg(`Khóa tài khoản "${u.name}"? Người này sẽ không đăng nhập được nữa, dữ liệu công việc cũ vẫn giữ.`, { okLabel: 'Khóa', danger: true })) { await S.db.update('users', u.id, { disabled: true }); toast('Đã khóa tài khoản'); }
              } }, u.disabled ? 'Mở khóa' : 'Xóa / khóa')]));
        })))),
      S.user.role === 'admin' ? h('section', { class: 'sec' }, h('div', { class: 'sec-head' }, h('h3', null, 'Hệ thống')),
        h('div', { class: 'panel' }, h('div', { class: 'stack' },
          h('p', { class: 'muted' }, isFirebase ? 'Đang kết nối Firebase thật.' : 'Đang chạy ở chế độ chạy thử: dữ liệu chỉ nằm trong trình duyệt này.'),
          h('div', { class: 'row-actions' },
            h('button', { class: 'btn', type: 'button', onClick: async () => { if (await confirmDlg('Áp phân công chuyên môn mới? Hồng nghỉ: khóa tài khoản và xóa việc chưa làm của Hồng. Việc hành chính mỗi cơ sở 1 người (Yên Hòa: Liễu, Trung Hòa: Mai Phương), việc học thuật và việc riêng giao theo từng người. Các việc chuyên môn chưa làm từ hôm nay được tạo lại. Việc đã làm hoặc đã ghi chú giữ nguyên.', { okLabel: 'Áp phân công' })) await applyCmAssignment(); } }, 'Áp phân công chuyên môn theo file'),
            h('button', { class: 'btn', type: 'button', onClick: async () => { if (await confirmDlg('Dọn các việc đã sinh vào ngày cơ sở không có lớp (ví dụ thứ 2 ở Trung Hòa)? Việc hàng ngày chưa làm sẽ bị xóa, việc khác dời sang ngày có lớp kế tiếp. Việc đã làm hoặc đã ghi chú giữ nguyên.', { okLabel: 'Dọn' })) { try { const r = await cleanNonWorkDays(); toast(`Đã xóa ${r.removed} việc, dời ${r.moved} việc`); } catch (e) { toast(e.message || 'Có lỗi', 'err'); } } } }, 'Dọn việc ở ngày cơ sở không có lớp'),
            h('button', { class: 'btn', type: 'button', onClick: async () => { if (await confirmDlg('Tìm các việc bị trùng (cùng cơ sở, ngày, tên) trong tháng này và tháng sau, xóa bản thừa chưa ai làm / chưa ghi chú? Việc có tiến độ luôn được giữ lại.', { okLabel: 'Dọn' })) { try { toast(`Đã xóa ${await cleanDuplicateTasks()} việc trùng`); } catch (e) { toast(e.message || 'Có lỗi', 'err'); } } } }, 'Dọn việc bị trùng'),
            h('button', { class: 'btn ghost', type: 'button', title: 'Dùng khi hướng dẫn trong thẻ việc bị lệch sang việc khác', onClick: async () => { if (await confirmDlg('Rà các việc cũ của trợ giảng bị gắn nhầm hướng dẫn / mẫu việc khác và sửa lại cho đúng theo tên việc? (Chỉ đọc các việc thuộc mẫu số 81 trở lên.)', { okLabel: 'Sửa liên kết' })) { try { const r = await fixStaleTemplateLinks(); toast(`Đã rà ${r.checked} việc, sửa ${r.moved} việc`); } catch (e) { toast(e.message || 'Có lỗi', 'err'); } } } }, 'Sửa liên kết việc cũ bị lệch hướng dẫn'),
            h('button', { class: 'btn ghost', type: 'button', onClick: async () => { if (await confirmDlg('Nạp lại toàn bộ mẫu việc, chuỗi việc và lịch lớp từ bảng gốc? Các chỉnh sửa mẫu bạn đã làm sẽ bị ghi đè.', { okLabel: 'Nạp lại', danger: true })) { await S.db.loadSeed(); await new Promise((r) => setTimeout(r, 1500)); const m = await S.db.get('meta', 'schedules'); let n = 0; for (const f of S.facilities) { const r = await syncSchedule(f.id, 'report', (m && m.data) || {}); n += r.changed + r.added + r.removed; } toast(`Đã nạp lại mẫu việc, cập nhật ${n} việc báo cáo + soạn văn theo lịch mới`); } } }, 'Nạp lại mẫu việc từ bảng gốc'),
            !isFirebase && h('button', { class: 'btn ghost danger', type: 'button', onClick: async () => { if (await confirmDlg('Xóa toàn bộ dữ liệu chạy thử và bắt đầu lại?', { okLabel: 'Xóa hết', danger: true })) S.db.resetDemo(); } }, 'Xóa dữ liệu chạy thử'))))) : null);
  }
  render();
  return () => unsub();
}
