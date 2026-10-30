import { h, mount, toast, confirmDlg, fmtDM, fmtDMY, makeRedraw, sortBy } from './ui.js';
import { S, isMgr, facName, ROLE_LABEL } from './core.js';
import { todayStr, addDays, dow, monthOf, pad, daysInMonth, isOpen, DOW_NAMES } from './rules.js';

function monthsBetween(a, b) {
  const out = []; let [y, m] = a.slice(0, 7).split('-').map(Number);
  const end = b.slice(0, 7);
  for (let i = 0; i < 14; i++) { const k = `${y}-${pad(m)}`; out.push(k); if (k >= end) break; m++; if (m > 12) { m = 1; y++; } }
  return out;
}

const STATS_CACHE = new Map();

export function viewStats(root) {
  const today = todayStr();
  const weekStart = (d) => addDays(d, -(dow(d) - 1));
  let from = weekStart(today); let to = addDays(weekStart(today), 6);
  let facSel = 'all'; let withCM = false; let preset = 'week';
  let tasks = []; let reports = []; let evals = []; let loading = false;
  let selTA = '';
  const redraw = makeRedraw(root, render);

  // Thống kê không cần realtime: đọc một lần, nhớ kết quả 5 phút, chỉ đọc lại khi bấm "Tải lại"
  let seq = 0;
  async function load(force = false) {
    const ms = monthsBetween(from, to);
    const key = `${facSel}|${ms.join(',')}`;
    const hit = STATS_CACHE.get(key);
    if (!force && hit && Date.now() - hit.at < 5 * 60000) { tasks = hit.tasks; reports = hit.reports; render(); return; }
    const my = ++seq; loading = true; render();
    const w = [['month', 'in', ms]];
    if (facSel !== 'all') w.unshift(['facility', '==', facSel]);
    try {
      const [t, r] = await Promise.all([S.db.getAll('tasks', w), S.db.getAll('reports', w)]);
      if (my !== seq) return;
      tasks = t; reports = r; STATS_CACHE.set(key, { at: Date.now(), tasks: t, reports: r });
    } catch (e) { toast(e.message || 'Không tải được thống kê', 'err'); }
    loading = false; render();
  }
  async function loadEvals() {
    try {
      evals = selTA ? await S.db.getAll('evaluations', [['taUid', '==', selTA]])
        : await S.db.getAll('evaluations', [], { orderBy: ['createdAt', 'desc'], limit: 40 });
    } catch (e) { evals = []; }
    render();
  }
  const resub = () => load();
  load(); loadEvals();

  const setPreset = (p) => {
    preset = p;
    if (p === 'day') { from = today; to = today; }
    if (p === 'week') { from = weekStart(today); to = addDays(from, 6); }
    if (p === 'prevweek') { from = addDays(weekStart(today), -7); to = addDays(from, 6); }
    if (p === 'month') { from = `${monthOf(today)}-01`; to = `${monthOf(today)}-${pad(daysInMonth(monthOf(today)))}`; }
    load();
  };

  function render() {
    const people = S.users.filter((u) => !u.disabled && (u.role === 'ta' || (withCM && (u.role === 'cm'))));
    const inRange = tasks.filter((t) => t.date >= from && t.date <= to && t.status !== 'na' && t.status !== 'partial');
    const rows = people.map((u) => {
      const mine = inRange.filter((t) => t.assignee === u.id);
      const done = mine.filter((t) => t.status === 'done').length;
      const rep = reports.filter((r) => r.uid === u.id && r.date >= from && r.date <= to).length;
      return {
        u, assigned: mine.length, done,
        review: mine.filter((t) => t.status === 'review').length,
        fix: mine.filter((t) => t.flagged || t.status === 'fix').length,
        late: mine.filter((t) => isOpen(t) && t.date < today).length,
        rep, pct: mine.length ? Math.round((done / mine.length) * 100) : 0,
      };
    });
    const unassignedOpen = inRange.filter((t) => !t.assignee && isOpen(t) && t.date <= today).length;
    const maxA = Math.max(1, ...rows.map((r) => r.assigned));

    // theo ngày
    const days = []; for (let d = from; d <= to && days.length < 62; d = addDays(d, 1)) days.push(d);
    const perDay = days.map((d) => ({ d, counts: people.map((u) => inRange.filter((t) => t.date === d && t.assignee === u.id && t.status === 'done').length) }));

    const sumT = h('table', { class: 'tbl stat' }, h('thead', null, h('tr', null,
      ['Người làm', 'Được giao', 'Đã xong', 'Hoàn thành', 'Chờ duyệt', 'Bị phản hồi/lỗi', 'Quá hạn', 'Báo cáo cuối ca'].map((x) => h('th', null, x)))),
      h('tbody', null, rows.map((r) => h('tr', null,
        h('td', null, h('b', null, r.u.name), h('div', { class: 'muted small' }, ROLE_LABEL[r.u.role])),
        h('td', null, r.assigned, h('div', { class: 'mini' }, h('span', { style: { width: (r.assigned / maxA) * 100 + '%' } }))),
        h('td', null, r.done),
        h('td', null, h('span', { class: 'pill ' + (r.pct >= 90 ? 'good' : r.pct >= 60 ? 'mid' : 'low') }, r.pct + '%')),
        h('td', null, r.review), h('td', null, r.fix), h('td', null, r.late ? h('span', { class: 'chip bad inl' }, r.late) : 0), h('td', null, r.rep)))));

    const dayT = h('div', { class: 'scroll' }, h('table', { class: 'tbl stat compact' }, h('thead', null, h('tr', null, h('th', null, 'Ngày'), people.map((u) => h('th', null, u.name.split(' ').slice(-1)[0])))),
      h('tbody', null, perDay.map((r) => h('tr', null, h('td', null, `${DOW_NAMES[dow(r.d)]} ${fmtDM(r.d)}`), r.counts.map((c) => h('td', { class: c ? '' : 'muted' }, c)))))));

    const taOptions = S.users.filter((u) => !u.disabled && u.role === 'ta');
    const shown = evals;
    const evList = sortBy(shown, (e) => -(e.createdAt || 0)).slice(0, 40);
    const noteIn = h('textarea', { rows: 3, placeholder: 'Nhận xét, ghi chú về trợ giảng (cả đội Chuyên môn cùng xem được; trợ giảng không thấy)…' });
    const taSel = h('select', null, h('option', { value: '' }, '— Chọn trợ giảng —'), taOptions.map((u) => h('option', { value: u.id }, u.name)));
    taSel.value = selTA;
    const rateSel = h('select', null, h('option', { value: '' }, 'Chưa chấm'), [5, 4, 3, 2, 1].map((n) => h('option', { value: n }, `${n}/5`)));

    mount(root, 
      h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Thống kê & đánh giá'), h('p', { class: 'muted' }, `${fmtDMY(from)} – ${fmtDMY(to)} · ${facSel === 'all' ? 'Cả 2 cơ sở' : facName(facSel)}`))),
      h('div', { class: 'toolbar wrap' },
        h('div', { class: 'seg' }, [['day', 'Hôm nay'], ['week', 'Tuần này'], ['prevweek', 'Tuần trước'], ['month', 'Tháng này']].map(([v, l]) => h('button', { class: 'seg-b' + (preset === v ? ' on' : ''), type: 'button', onClick: () => setPreset(v) }, l))),
        h('label', { class: 'inline' }, 'Từ', h('input', { type: 'date', value: from, onChange: (e) => { from = e.target.value || from; if (to < from) to = from; preset = ''; } })),
        h('label', { class: 'inline' }, 'đến', h('input', { type: 'date', value: to, onChange: (e) => { to = e.target.value || to; if (to < from) from = to; preset = ''; } })),
        h('button', { class: 'btn sm', type: 'button', onClick: () => load() }, 'Xem'),
        h('button', { class: 'btn ghost sm', type: 'button', title: 'Đọc lại dữ liệu mới nhất', onClick: () => load(true) }, 'Tải lại'),
        h('select', { onChange: (e) => { facSel = e.target.value; load(); } }, h('option', { value: 'all' }, 'Cả 2 cơ sở'), S.facilities.map((f) => h('option', { value: f.id, selected: f.id === facSel }, f.name))),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: withCM, onChange: (e) => { withCM = e.target.checked; render(); } }), 'Gồm cả Chuyên môn')),
      loading ? h('div', { class: 'banner' }, 'Đang tải số liệu…') : null,
      unassignedOpen ? h('div', { class: 'banner warn' }, `${unassignedOpen} việc đến hạn nhưng chưa có người nhận hoặc chưa làm.`) : null,
      h('section', { class: 'sec' }, h('div', { class: 'sec-head' }, h('h3', null, 'Tổng hợp theo người')), people.length ? h('div', { class: 'scroll' }, sumT) : h('p', { class: 'empty' }, 'Chưa có tài khoản trợ giảng.')),
      h('section', { class: 'sec' }, h('div', { class: 'sec-head' }, h('h3', null, 'Số việc đã xong theo ngày')), people.length ? dayT : null),
      h('section', { class: 'sec' }, h('div', { class: 'sec-head' }, h('h3', null, 'Đánh giá & ghi chú về trợ giảng'), h('span', { class: 'muted' }, 'Chỉ Chuyên môn và Quản lý xem được')),
        h('div', { class: 'panel' }, h('div', { class: 'stack' },
          h('div', { class: 'grid3' }, h('label', null, 'Trợ giảng', taSel), h('label', null, 'Điểm', rateSel), h('span')),
          noteIn,
          h('div', { class: 'row-actions' }, h('button', { class: 'btn primary', type: 'button', onClick: async () => {
            if (!taSel.value) return toast('Chọn trợ giảng cần ghi chú', 'err');
            if (!noteIn.value.trim()) return toast('Hãy nhập nội dung', 'err');
            await S.db.add('evaluations', {
              taUid: taSel.value, taName: (S.users.find((u) => u.id === taSel.value) || {}).name || '', text: noteIn.value.trim(),
              rating: rateSel.value ? Number(rateSel.value) : null, authorUid: S.user.id, authorName: S.user.name, createdAt: Date.now(),
            });
            selTA = taSel.value; toast('Đã lưu ghi chú'); await loadEvals();
          } }, 'Lưu ghi chú'),
          h('label', { class: 'inline' }, 'Lọc xem', h('select', { onChange: (e) => { selTA = e.target.value; loadEvals(); } }, h('option', { value: '' }, 'Tất cả trợ giảng'), taOptions.map((u) => h('option', { value: u.id, selected: u.id === selTA }, u.name))))),
          evList.length ? evList.map((e) => h('div', { class: 'eval' },
            h('div', { class: 'eval-head' }, h('b', null, e.taName), e.rating ? h('span', { class: 'pill mid' }, e.rating + '/5') : null,
              h('span', { class: 'muted small' }, `${e.authorName} · ${new Date(e.createdAt).toLocaleDateString('vi-VN')}`),
              (e.authorUid === S.user.id || isMgr()) && h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Xóa ghi chú', onClick: async () => { if (await confirmDlg('Xóa ghi chú này?', { okLabel: 'Xóa', danger: true })) { await S.db.remove('evaluations', e.id); loadEvals(); } } }, '×')),
            h('p', null, e.text))) : h('p', { class: 'empty' }, 'Chưa có ghi chú nào.')))));
  }
  render();
  return () => { seq++; };
}
