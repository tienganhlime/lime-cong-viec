import { h, mount, modal, toast, fmtDM, fmtDMY, makeRedraw, sortBy } from './ui.js';
import { S, isCM, isMgr, isTA, myGroups, facName, usersOfGroup, claimMany, postpone, patchTask, notify, notifyGroup, taskKey, GROUP_LABEL } from './core.js';
import { taskCard } from './taskui.js';
import { reviewSection } from './view-students.js';
import { moveOp } from './students.js';
import { todayStr, addDays, isOpen, DOW_NAMES, dow, monthOf, addMonths, generateMonth } from './rules.js';

/* ---------- Thêm việc phát sinh / định kỳ ---------- */
export function addTaskModal({ date = todayStr(), onDone } = {}) {
  const title = h('input', { type: 'text', placeholder: 'Tên công việc', maxlength: 200 });
  const desc = h('textarea', { rows: 2, placeholder: 'Mô tả chi tiết (không bắt buộc)' });
  const dateIn = h('input', { type: 'date', value: date });
  const facBoxes = S.facilities.map((f) => ({ f, el: h('input', { type: 'checkbox', checked: f.id === S.facility }) }));
  const groupSel = h('select', null,
    h('option', { value: 'ta' }, 'Đội Trợ giảng'), h('option', { value: 'cm' }, 'Đội Chuyên môn'), h('option', { value: 'both' }, 'Cả 2 đội'));
  groupSel.value = isTA() ? 'ta' : 'cm';
  const who = h('select', null);
  const fillWho = () => {
    who.replaceChildren(h('option', { value: '' }, '— Chưa giao cho ai —'),
      usersOfGroup(groupSel.value).map((u) => h('option', { value: u.id }, u.name)));
  };
  fillWho(); groupSel.addEventListener('change', fillWho);
  const repSel = h('select', null,
    h('option', { value: 'none' }, 'Không lặp (việc phát sinh)'), h('option', { value: 'weekly' }, 'Hàng tuần'), h('option', { value: 'monthly' }, 'Hàng tháng'));
  const dowBoxes = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ d, el: h('input', { type: 'checkbox' }) }));
  const dowWrap = h('div', { class: 'checks hidden' }, dowBoxes.map((x) => h('label', { class: 'check' }, x.el, DOW_NAMES[x.d])));
  const mdays = h('input', { type: 'text', placeholder: 'Ngày trong tháng, ví dụ: 5, 20', class: 'hidden' });
  const review = h('input', { type: 'checkbox' });
  repSel.addEventListener('change', () => {
    dowWrap.classList.toggle('hidden', repSel.value !== 'weekly');
    mdays.classList.toggle('hidden', repSel.value !== 'monthly');
  });
  const body = h('div', { class: 'stack' },
    h('label', null, 'Tên công việc *', title),
    h('label', null, 'Mô tả', desc),
    h('div', { class: 'grid2' }, h('label', null, 'Ngày cần làm', dateIn), h('label', null, 'Giao cho đội', groupSel)),
    h('label', null, 'Giao đích danh (không bắt buộc)', who),
    h('div', null, h('div', { class: 'lab' }, 'Cơ sở'), h('div', { class: 'checks' }, facBoxes.map((x) => h('label', { class: 'check' }, x.el, x.f.name)))),
    h('label', null, 'Lặp lại', repSel), dowWrap, mdays,
    h('label', { class: 'check' }, review, 'Cần chuyên môn duyệt sau khi làm xong'));
  modal({
    title: 'Thêm công việc', body,
    actions: [{ label: 'Hủy', kind: 'ghost' }, {
      label: 'Thêm việc', kind: 'primary',
      onClick: async () => {
        const name = title.value.trim();
        const facs = facBoxes.filter((x) => x.el.checked).map((x) => x.f.id);
        if (!name) { toast('Hãy nhập tên công việc', 'err'); return false; }
        if (!facs.length) { toast('Chọn ít nhất một cơ sở', 'err'); return false; }
        if (!dateIn.value) { toast('Chọn ngày cần làm', 'err'); return false; }
        const group = groupSel.value;
        const assignee = who.value || null;
        const assigneeName = assignee ? (S.users.find((u) => u.id === assignee) || {}).name : '';
        const mk = (fac, d, extra = {}) => ({
          facility: fac, date: d, month: monthOf(d), title: name, extra: '', time: '', desc: desc.value.trim(), group,
          tplId: '', source: 'adhoc', refId: '', status: 'todo', open: true, carry: true, assignee, assigneeName: assigneeName || '', note: '', feedback: '',
          needsReview: review.checked, sendCSKH: false, flagged: false, order: 900, createdBy: S.user.id, createdAt: Date.now(), ...extra,
        });
        const ops = [];
        if (repSel.value === 'none') {
          for (const f of facs) ops.push({ op: 'set', col: 'tasks', id: S.db.newId(), data: mk(f, dateIn.value) });
        } else {
          const rule = repSel.value === 'weekly'
            ? { type: 'weekly', dow: dowBoxes.filter((x) => x.el.checked).map((x) => x.d) }
            : { type: 'monthly', days: mdays.value.split(/[,;\s]+/).map(Number).filter((n) => n >= 1 && n <= 31) };
          if ((rule.dow && !rule.dow.length) || (rule.days && !rule.days.length)) { toast('Hãy chọn thứ hoặc ngày lặp lại', 'err'); return false; }
          const tpl = {
            id: S.db.newId(), order: 900, name, group, repeatText: repSel.value === 'weekly' ? 'Hàng tuần' : 'Hàng tháng',
            scheduleText: 'Do người dùng thêm', rule, auto: true, time: '', content: desc.value.trim(), needsReview: review.checked,
            reviewText: review.checked ? 'Có' : 'Không', sendCSKH: false, facilities: facs, note: '', source: 'user', createdBy: S.user.id,
          };
          ops.push({ op: 'set', col: 'templates', id: tpl.id, data: tpl });
          const gen = generateMonth({ templates: [tpl], schedules: {}, facilities: facs, ym: dateIn.value.slice(0, 7), by: S.user.id })
            .filter((g) => g.data.date >= dateIn.value);
          for (const g of gen) ops.push({ op: 'set', col: 'tasks', id: g.id, data: { ...g.data, open: true, carry: true, desc: desc.value.trim(), assignee, assigneeName: assigneeName || '', source: 'adhoc' } });
        }
        await S.db.batch(ops);
        const where = facs.map(facName).join(', ');
        const text = `Việc phát sinh mới: ${name} (${where}, ${fmtDM(dateIn.value)})`;
        if (assignee) await notify([assignee], `${S.user.name} giao cho bạn: ${name} (${fmtDM(dateIn.value)})`, `#/today?date=${dateIn.value}&fac=${facs[0]}`);
        await notifyGroup(group, text, `#/today?date=${dateIn.value}&fac=${facs[0]}`);
        toast('Đã thêm công việc');
        if (onDone) onDone();
      },
    }],
  });
}

/* ---------- Kết thúc ca: cập nhật checklist và báo cáo ---------- */
function reportModal({ date, fac, mine, existing, revs = [] }) {
  const revDone = revs.filter((r) => r.status === 'done').length;
  const revPend = revs.filter((r) => r.status === 'pending');
  const moveRev = h('input', { type: 'checkbox', checked: true });
  const total = mine.filter((t) => t.status !== 'na' && t.status !== 'partial').length;
  const done = mine.filter((t) => t.status === 'done').length;
  const review = mine.filter((t) => t.status === 'review').length;
  const openT = mine.filter((t) => isOpen(t) || t.status === 'approved');
  const note = h('textarea', { rows: 3, placeholder: 'Ghi chú bàn giao cho ca sau (việc dở dang, lưu ý với giáo viên/học sinh…)', value: existing ? existing.note : '' });
  const dates = new Map(); const prog = new Map();
  const rows = openT.map((t) => {
    const inp = h('input', { type: 'date', min: todayStr(), onChange: (e) => dates.set(t.id, e.target.value) });
    const pg = h('input', { type: 'text', placeholder: 'Đã làm được đến đâu / còn gì…', class: 'rep-prog', onInput: (e) => prog.set(t.id, e.target.value) });
    return h('div', { class: 'rep-row' }, h('div', { class: 'rep-title' }, t.title, t.extra && h('span', { class: 'extra' }, t.extra)), pg,
      h('label', { class: 'rep-date' }, 'Làm tiếp ngày', inp));
  });
  modal({
    title: 'Kết thúc ca & cập nhật checklist', wide: true,
    body: h('div', { class: 'stack' },
      h('div', { class: 'sumline' }, h('b', null, `${done}/${total}`), ' việc của bạn đã xong', review ? ` · ${review} việc chờ duyệt` : '', openT.length ? ` · ${openT.length} việc chưa xong` : ' · không còn việc tồn'),
      openT.length ? h('div', null, h('p', { class: 'hint' }, 'Việc chưa xong (kể cả việc hàng ngày) sẽ tự chuyển sang ngày làm việc tiếp theo dưới dạng việc "Làm bù". Ghi rõ đã làm được đến đâu và chọn ngày nếu muốn làm vào ngày khác.'), rows) : null,
      revs.length ? h('div', { class: 'stack' }, h('div', { class: 'sumline' }, h('b', null, `${revDone}/${revs.length}`), ' lượt ôn bài / bù bài đã xong', revPend.length ? ` · ${revPend.length} chưa ôn` : ''),
        revPend.length ? h('label', { class: 'check' }, moveRev, `Chuyển ${revPend.length} học sinh chưa ôn sang buổi học kế tiếp của lớp (${revPend.slice(0, 4).map((r) => r.studentName).join(', ')}${revPend.length > 4 ? '…' : ''})`) : null) : null,
      h('label', null, 'Ghi chú bàn giao', note)),
    actions: [{ label: 'Để sau', kind: 'ghost' }, {
      label: 'Nộp báo cáo', kind: 'primary',
      onClick: async () => {
        const ops = [];
        const next = addDays(date, 1);
        for (const t of openT) {
          if (t.status === 'approved') continue;
          const d = dates.get(t.id) || (t.carry ? '' : next);
          const pr = (prog.get(t.id) || '').trim();
          if (!d && !pr) continue;
          if (!t.carry || d) await postpone(t, d || t.date, pr);
          else await S.db.update('tasks', t.id, { note: [t.note, `[${date.slice(8)}/${date.slice(5, 7)} · ${S.user.name}] ${pr}`].filter(Boolean).join('\n') });
        }
        if (revPend.length && moveRev.checked) for (const r of revPend) { const o = moveOp(r, date, 'moved', r.note || 'Chưa kịp ôn trong ca'); delete o.next; ops.push(o); }
        ops.push({
          op: 'set', col: 'reports', id: `${fac}_${date}_${S.user.id}`,
          data: { facility: fac, date, month: date.slice(0, 7), uid: S.user.id, userName: S.user.name, role: S.user.role, total, done, review, open: openT.length, reviewDone: revDone, reviewMoved: moveRev.checked ? revPend.length : 0, note: note.value.trim(), at: Date.now() },
        });
        await S.db.batch(ops);
        toast('Đã nộp báo cáo cuối ca');
      },
    }],
  });
}

/* ---------- Màn hình Hôm nay ---------- */
export function viewToday(root, params) {
  const fac = S.facility;
  let date = params.date || todayStr();
  let dayTasks = []; let carry = []; let reports = []; let dayRev = []; let pendRev = [];
  const selected = new Set();
  let grp = isMgr() ? 'all' : (isTA() ? 'ta' : 'cm');
  let showOthers = false;
  const unsubs = [];
  const redraw = makeRedraw(root, render);

  const go = (d) => S.navigate(`#/today?date=${d}`);
  const subscribe = () => {
    unsubs.push(S.db.subscribe('reviews', [['facility', '==', fac], ['date', '==', date]], (r) => { dayRev = r; redraw(); }));
    unsubs.push(S.db.subscribe('reviews', [['facility', '==', fac], ['status', '==', 'pending']], (r) => { pendRev = r; redraw(); }));
    unsubs.push(S.db.subscribe('tasks', [['facility', '==', fac], ['date', '==', date]], (r) => { dayTasks = r; redraw(); }));
    unsubs.push(S.db.subscribe('tasks', [['facility', '==', fac], ['carry', '==', true], ['open', '==', true]], (r) => { carry = r; redraw(); }));
    const m = monthOf(date);
    unsubs.push(S.db.subscribe('reports', [['facility', '==', fac], ['month', 'in', [m, addMonths(m, -1)]]], (r) => { reports = r; redraw(); }));
  };
  subscribe();

  function list() {
    const ids = new Set(dayTasks.map((t) => t.id));
    const carried = date >= todayStr() ? carry.filter((t) => t.date < date && !ids.has(t.id)) : [];
    const all = [...dayTasks, ...carried];
    return all.filter((t) => grp === 'all' || t.group === grp || t.group === 'both');
  }

  function revList() {
    const ids = new Set(dayRev.map((r) => r.id));
    const late = date >= todayStr() ? pendRev.filter((r) => r.date < date && !ids.has(r.id)) : [];
    return [...dayRev.filter((r) => r.kind === 'on' || r.kind === 'bu'), ...late];
  }

  function render() {
    const all = list();
    const revs = revList();
    const today = todayStr();
    const mine = sortBy(all.filter((t) => t.assignee === S.user.id), taskKey);
    const free = sortBy(all.filter((t) => !t.assignee), taskKey);
    const others = sortBy(all.filter((t) => t.assignee && t.assignee !== S.user.id), taskKey);
    const relevantTotal = all.filter((t) => t.status !== 'na' && t.status !== 'partial');
    const doneN = relevantTotal.filter((t) => t.status === 'done').length;
    const pct = relevantTotal.length ? Math.round((doneN / relevantTotal.length) * 100) : 0;
    const myReport = reports.find((r) => r.id === `${fac}_${date}_${S.user.id}`);
    const prev = sortBy(reports.filter((r) => r.date < date && r.note), (r) => r.date).pop();

    const card = (t, extra = {}) => taskCard(t, { redraw, carriedFrom: date, ...extra });
    const sec = (title, count, kids, extra) => h('section', { class: 'sec' },
      h('div', { class: 'sec-head' }, h('h3', null, title, h('span', { class: 'count' }, count)), extra), kids);

    const sel = free.filter((t) => selected.has(t.id));
    const freeActions = h('div', { class: 'row-actions' },
      h('button', { class: 'btn sm', type: 'button', disabled: !sel.length, onClick: async () => { await claimMany(sel); selected.clear(); toast(`Đã nhận ${sel.length} việc`); } }, `Nhận việc đã chọn (${sel.length})`),
      h('button', { class: 'btn sm primary', type: 'button', disabled: !free.length || S.user.role === 'admin', onClick: async () => { await claimMany(free); selected.clear(); toast(`Đã nhận ${free.length} việc vào checklist của bạn`); } }, 'Nhận tất cả'));

    mount(root, 
      h('div', { class: 'page-head' },
        h('div', null, h('h2', null, date === today ? 'Hôm nay' : 'Checklist ngày'), h('p', { class: 'muted' }, `${DOW_NAMES[dow(date)]}, ${fmtDMY(date)} · ${facName(fac)}`)),
        h('div', { class: 'date-nav' },
          h('button', { class: 'btn ghost sm', type: 'button', onClick: () => go(addDays(date, -1)), 'aria-label': 'Ngày trước' }, '‹'),
          h('input', { type: 'date', value: date, onChange: (e) => e.target.value && go(e.target.value) }),
          h('button', { class: 'btn ghost sm', type: 'button', onClick: () => go(addDays(date, 1)), 'aria-label': 'Ngày sau' }, '›'),
          date !== today && h('button', { class: 'btn sm', type: 'button', onClick: () => go(today) }, 'Hôm nay'))),
      h('div', { class: 'toolbar' },
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Lọc theo đội' }, [['all', 'Tất cả'], ['ta', 'Việc Trợ giảng'], ['cm', 'Việc Chuyên môn']].map(([v, l]) =>
          h('button', { class: 'seg-b' + (grp === v ? ' on' : ''), type: 'button', onClick: () => { grp = v; render(); } }, l))),
        h('div', { class: 'progress', title: `${doneN}/${relevantTotal.length} việc đã xong` }, h('div', { class: 'bar' }, h('span', { style: { width: pct + '%' } })), h('span', null, `${doneN}/${relevantTotal.length} xong`)),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn', type: 'button', onClick: () => addTaskModal({ date }) }, '+ Thêm việc'),
          S.user.role !== 'admin' && h('button', { class: 'btn primary', type: 'button', onClick: () => reportModal({ date, fac, mine: all.filter((t) => t.assignee === S.user.id && t.date === date || t.assignee === S.user.id && t.date < date), existing: myReport, revs }) }, myReport ? 'Cập nhật báo cáo cuối ca' : 'Kết thúc ca & báo cáo'))),
      myReport && h('div', { class: 'banner ok' }, `Bạn đã nộp báo cáo cuối ca lúc ${new Date(myReport.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}.`),
      prev && h('div', { class: 'banner' }, h('b', null, `Bàn giao từ ca ngày ${fmtDM(prev.date)} (${prev.userName}): `), prev.note),
      reviewSection(revs, date, redraw),
      sec('Việc của tôi', mine.length, mine.length ? mine.map((t) => card(t)) : h('p', { class: 'empty' }, free.length ? 'Bạn chưa nhận việc nào. Chọn việc ở danh sách bên dưới rồi bấm Nhận, hoặc bấm Nhận tất cả.' : 'Chưa có việc nào.')),
      sec('Chưa có người nhận', free.length, free.length ? free.map((t) => card(t, { selectable: true, selected: selected.has(t.id), onSelect: (x, on) => { on ? selected.add(x.id) : selected.delete(x.id); redraw(); } })) : h('p', { class: 'empty' }, 'Tất cả việc đã có người nhận.'), free.length ? freeActions : null),
      others.length ? h('section', { class: 'sec' },
        h('div', { class: 'sec-head' }, h('h3', null, 'Người khác đang làm', h('span', { class: 'count' }, others.length)),
          h('button', { class: 'btn ghost sm', type: 'button', onClick: () => { showOthers = !showOthers; redraw(); } }, showOthers ? 'Ẩn' : 'Hiện')),
        showOthers ? others.map((t) => card(t)) : null) : null);
  }

  render();
  return () => unsubs.forEach((u) => u());
}
