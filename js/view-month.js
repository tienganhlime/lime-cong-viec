import { h, mount, modal, makeRedraw, fmtDM, sortBy, uniq } from './ui.js';
import { S, scoped, facName, GROUP_LABEL, isOverdue, taskKey } from './core.js';
import { taskModal } from './taskui.js';
import { todayStr, addMonths, daysInMonth, pad, dow, DOW_NAMES, monthOf, isOpen } from './rules.js';

const SYMBOL = { done: '✓', todo: '·', review: '◔', fix: '!', approved: '✉', na: '–', partial: '◐' };

export function viewMonth(root, params) {
  const fac = S.facility;
  const ym = params.m || monthOf(todayStr());
  let tasks = []; let reports = [];
  let groupFilter = 'all'; let onlyOpen = false; let q = '';
  const unsubs = [];
  const redraw = makeRedraw(root, render);
  unsubs.push(S.db.subscribe('tasks', scoped([['facility', '==', fac], ['month', '==', ym]]), (r) => { tasks = r; redraw(); }));
  unsubs.push(S.db.subscribe('reports', [['facility', '==', fac], ['month', '==', ym]], (r) => { reports = r; redraw(); }));
  taskModal.live = (id) => tasks.find((t) => t.id === id);
  const nav = (m) => S.navigate(`#/month?m=${m}`);

  function render() {
    const n = daysInMonth(ym);
    const today = todayStr();
    const days = Array.from({ length: n }, (_, i) => `${ym}-${pad(i + 1)}`);
    const rowsMap = new Map();
    for (const t of tasks) {
      if (groupFilter !== 'all' && t.group !== groupFilter && t.group !== 'both') continue;
      if (q && !(t.title + ' ' + (t.extra || '')).toLowerCase().includes(q.toLowerCase())) continue;
      const key = t.tplId || 'x:' + t.title;
      if (!rowsMap.has(key)) rowsMap.set(key, { key, title: t.title, group: t.group, order: t.order || 0, byDay: {} });
      const r = rowsMap.get(key);
      (r.byDay[t.date] = r.byDay[t.date] || []).push(t);
    }
    let rows = [...rowsMap.values()];
    if (onlyOpen) rows = rows.filter((r) => Object.values(r.byDay).flat().some((t) => isOpen(t) || t.status === 'review' || t.status === 'approved'));
    const gRank = { ta: 0, cm: 1, both: 2 };
    rows = sortBy(rows, (r) => gRank[r.group] ?? 3, 'order', 'title');

    // hàng báo cáo cuối ca
    const repByDay = {};
    for (const r of reports) (repByDay[r.date] = repByDay[r.date] || []).push(r);
    const activeDays = new Set(tasks.filter((t) => t.status !== 'na').map((t) => t.date));
    const needRep = (d) => d < today && activeDays.has(d);
    const missing = days.filter((d) => needRep(d) && !repByDay[d]).length;

    const head = h('tr', null, h('th', { class: 'stick' }, 'Công việc'),
      days.map((d) => h('th', { class: 'dcol' + (d === today ? ' today' : '') + (dow(d) >= 6 ? ' wkend' : ''), title: `${DOW_NAMES[dow(d)]} ${fmtDM(d)}` },
        h('a', { href: `#/today?date=${d}` }, Number(d.slice(8))), h('small', null, dow(d) === 7 ? 'CN' : 'T' + (dow(d) + 1)))),
      h('th', { class: 'sumcol' }, 'Xong'));

    const repRow = h('tr', { class: 'rep-line' }, h('td', { class: 'stick' }, 'Báo cáo cuối ca'),
      days.map((d) => {
        const has = repByDay[d];
        const cls = has ? 'ok' : needRep(d) ? 'miss' : '';
        return h('td', {
          class: 'cell ' + cls, title: has ? has.map((r) => r.userName).join(', ') : needRep(d) ? 'Chưa có báo cáo' : '',
          onClick: () => has && modal({
            title: `Báo cáo cuối ca ${fmtDM(d)} · ${facName(fac)}`,
            body: h('div', { class: 'stack' }, has.map((r) => h('div', { class: 'rep-card' },
              h('b', null, r.userName), ` · xong ${r.done}/${r.total}`, r.open ? ` · còn ${r.open} việc` : '', r.review ? ` · ${r.review} chờ duyệt` : '',
              r.note ? h('p', null, r.note) : h('p', { class: 'muted' }, 'Không có ghi chú bàn giao')))),
          }),
        }, has ? '✓' : needRep(d) ? '✗' : '');
      }), h('td', { class: 'sumcol' }, `${days.filter((d) => repByDay[d]).length}/${days.filter((d) => activeDays.has(d) && d <= today).length}`));

    const bodyRows = [];
    let lastG = null;
    for (const r of rows) {
      if (r.group !== lastG) {
        lastG = r.group;
        bodyRows.push(h('tr', { class: 'grp' }, h('td', { colspan: n + 2 }, 'Việc của ' + (GROUP_LABEL[r.group] || r.group))));
      }
      const all = Object.values(r.byDay).flat();
      const doneN = all.filter((t) => t.status === 'done' || t.status === 'na' || t.status === 'partial').length;
      bodyRows.push(h('tr', null,
        h('td', { class: 'stick rowname', title: r.title }, r.title),
        days.map((d) => {
          const ts = r.byDay[d];
          if (!ts) return h('td', { class: 'cell empty' });
          const t = sortBy(ts, taskKey)[0];
          const od = isOverdue(t);
          return h('td', {
            class: `cell s-${t.status}${od ? ' late' : ''}${t.flagged ? ' flag' : ''}`, tabindex: 0, role: 'button',
            title: `${t.assigneeName || 'Chưa có người nhận'}${t.extra ? ' · ' + t.extra : ''}`,
            onClick: () => taskModal(t), onKeydown: (e) => { if (e.key === 'Enter') taskModal(t); },
          }, od && t.status === 'todo' ? '✗' : SYMBOL[t.status]);
        }),
        h('td', { class: 'sumcol' }, `${doneN}/${all.length}`)));
    }

    mount(root, 
      h('div', { class: 'page-head' },
        h('div', null, h('h2', null, 'Checklist tháng'), h('p', { class: 'muted' }, `${facName(fac)} · Tháng ${ym.slice(5)}/${ym.slice(0, 4)}`,
          missing ? h('span', { class: 'chip bad inl' }, `${missing} ngày chưa có báo cáo cuối ca`) : null)),
        h('div', { class: 'date-nav' },
          h('button', { class: 'btn ghost sm', type: 'button', onClick: () => nav(addMonths(ym, -1)) }, '‹'),
          h('strong', null, `${ym.slice(5)}/${ym.slice(0, 4)}`),
          h('button', { class: 'btn ghost sm', type: 'button', onClick: () => nav(addMonths(ym, 1)) }, '›'),
          ym !== monthOf(todayStr()) && h('button', { class: 'btn sm', type: 'button', onClick: () => nav(monthOf(todayStr())) }, 'Tháng này'))),
      h('div', { class: 'toolbar' },
        h('div', { class: 'seg' }, [['all', 'Tất cả'], ['ta', 'Trợ giảng'], ['cm', 'Chuyên môn']].map(([v, l]) =>
          h('button', { class: 'seg-b' + (groupFilter === v ? ' on' : ''), type: 'button', onClick: () => { groupFilter = v; render(); } }, l))),
        h('input', { type: 'search', placeholder: 'Tìm công việc…', value: q, class: 'search', onInput: (e) => { q = e.target.value; redraw(); } }),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: onlyOpen, onChange: (e) => { onlyOpen = e.target.checked; render(); } }), 'Chỉ việc chưa xong')),
      h('div', { class: 'legend' }, [['✓', 'Đã xong'], ['·', 'Chưa làm'], ['✗', 'Quá hạn chưa làm'], ['◔', 'Chờ duyệt'], ['!', 'Cần sửa'], ['✉', 'Chờ gửi CSKH'], ['◐', 'Làm dở, đã chuyển ngày'], ['–', 'Không áp dụng']].map(([s, l]) => h('span', null, h('i', null, s), l))),
      tasks.length ? h('div', { class: 'matrix-wrap' }, h('table', { class: 'matrix' }, h('thead', null, head), h('tbody', null, repRow, bodyRows)))
        : h('div', { class: 'empty-state' }, h('h3', null, 'Tháng này chưa có việc nào'),
          h('p', null, 'Hệ thống tự tạo checklist từ mẫu việc khi mở tháng mới. Quản lý và Chuyên môn có thể tạo thủ công ở mục Mẫu việc → Khởi tạo checklist tháng.')));
  }
  render();
  return () => unsubs.forEach((u) => u());
}
