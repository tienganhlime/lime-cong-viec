// Thẻ công việc dùng chung cho các màn hình
import { h, modal, toast, confirmDlg, fmtDM } from './ui.js';
import { S, isCM, canAct, assignCandidates, GROUP_LABEL, facName, complete, reopen, markNA, moveDate, approve, requestFix,
  removeTask, saveNote, postpone, unclaim, assignTo, claim, isOverdue } from './core.js';
import { todayStr, addDays } from './rules.js';
import { linksFor, linkUrl } from './links.js';

export const expanded = new Set();
const ICON = { todo: '', done: '✓', review: '◔', fix: '!', approved: '✉', na: '–', partial: '◐' };
const STATUS_TEXT = {
  todo: 'Chưa làm', done: 'Đã xong', review: 'Chờ chuyên môn duyệt', fix: 'Cần sửa lại',
  approved: 'Đã duyệt, chờ gửi CSKH', na: 'Không áp dụng', partial: 'Làm dở, đã chuyển sang ngày khác',
};
export const statusText = (s) => STATUS_TEXT[s] || s;

async function run(fn, redraw) {
  try { await fn(); } catch (e) { toast(e.message || 'Có lỗi', 'err'); }
  if (redraw) redraw();
}

export function feedbackModal(t, { flag = false, onDone } = {}) {
  const ta = h('textarea', { rows: 4, placeholder: 'Ghi rõ cần sửa gì, ví dụ: báo cáo thiếu lớp CAM1T, nhận xét chưa đủ ý…' });
  modal({
    title: flag ? 'Đánh dấu công tác lỗi' : 'Yêu cầu sửa lại',
    body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, t.title), ta,
      h('p', { class: 'hint' }, 'Việc sẽ quay lại danh sách của người làm kèm phản hồi này. Khi họ làm xong sẽ tự gửi lại để bạn kiểm tra.')),
    actions: [{ label: 'Hủy', kind: 'ghost' }, {
      label: 'Gửi phản hồi', kind: 'primary',
      onClick: async () => {
        if (!ta.value.trim()) { toast('Hãy nhập nội dung phản hồi', 'err'); return false; }
        await requestFix(t, ta.value.trim(), flag); if (onDone) onDone();
      },
    }],
  });
}

function moveModal(t, redraw) {
  const inp = h('input', { type: 'date', value: addDays(todayStr(), 1), min: todayStr() });
  modal({
    title: 'Dời sang ngày khác',
    body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, t.title), h('label', null, 'Ngày cần làm', inp),
      h('p', { class: 'hint' }, 'Việc sẽ hiện trong checklist ngày đó để người đi làm không bỏ sót.')),
    actions: [{ label: 'Hủy', kind: 'ghost' }, {
      label: 'Dời việc', kind: 'primary',
      onClick: async () => { if (!inp.value) return false; await moveDate(t, inp.value); redraw && redraw(); toast('Đã dời việc sang ' + fmtDM(inp.value)); },
    }],
  });
}

export function editModal(t, redraw) {
  const title = h('input', { type: 'text', value: t.title, disabled: !isCM() });
  const extra = h('textarea', { rows: 2, value: t.extra || '', placeholder: 'Danh sách lớp / ghi chú đi kèm (ví dụ các lớp test hôm nay)' });
  const time = h('input', { type: 'text', value: t.time || '', placeholder: 'Thời gian làm' });
  const desc = h('textarea', { rows: 4, value: t.desc || '', placeholder: 'Hướng dẫn / nội dung chi tiết (để trống = dùng nội dung của mẫu việc)' });
  modal({
    title: 'Sửa việc này', body: h('div', { class: 'stack' },
      h('label', null, 'Tên việc', title), h('label', null, 'Lớp / ghi chú đi kèm', extra), h('label', null, 'Thời gian', time), h('label', null, 'Nội dung chi tiết', desc),
      h('p', { class: 'hint' }, 'Chỉ sửa việc của ngày này. Muốn sửa cho các ngày sau, sửa ở Mẫu việc hoặc Lịch lớp.')),
    actions: [{ label: 'Hủy', kind: 'ghost' }, {
      label: 'Lưu', kind: 'primary',
      onClick: async () => {
        const p = { extra: extra.value.trim(), time: time.value.trim(), desc: desc.value.trim() };
        if (isCM() && title.value.trim()) p.title = title.value.trim();
        await S.db.update('tasks', t.id, p); redraw && redraw(); toast('Đã sửa việc');
      },
    }],
  });
}

export function postponeModal(t, redraw) {
  const inp = h('input', { type: 'date', value: addDays(todayStr(), 1), min: todayStr() });
  const ta = h('textarea', { rows: 4, placeholder: 'Đã làm được gì, còn lại gì, cần lưu ý gì (ví dụ: đã check 5/8 lớp, còn CAM1T, CAM2M, FCE B2A)…' });
  modal({
    title: 'Làm dở / chưa kịp làm: chuyển sang ngày khác',
    body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, t.title), h('label', null, 'Đã làm được đến đâu', ta), h('label', null, 'Làm tiếp ngày', inp),
      h('p', { class: 'hint' }, t.carry ? 'Việc được dời sang ngày đó, kèm ghi chú tiến độ để người sau làm tiếp.'
        : 'Việc hàng ngày hôm nay sẽ được đóng lại là "làm dở", và tạo một việc "Làm bù" ở ngày đã chọn kèm ghi chú tiến độ.')),
    actions: [{ label: 'Hủy', kind: 'ghost' }, {
      label: 'Chuyển việc', kind: 'primary',
      onClick: async () => {
        if (!inp.value) return false;
        await postpone(t, inp.value, ta.value); redraw && redraw(); toast('Đã chuyển sang ' + fmtDM(inp.value));
      },
    }],
  });
}

export function taskCard(t, o = {}) {
  const { redraw, selectable, selected, onSelect, showDate, showFac } = o;
  const mine = t.assignee === S.user.id;
  const open = expanded.has(t.id);
  const overdue = isOverdue(t);
  const carried = o.carriedFrom && t.date < o.carriedFrom;
  const act = (fn) => (e) => { e && e.stopPropagation(); run(fn, redraw); };
  const allowed = canAct(t);

  const tick = h('button', {
    class: 'tick s-' + t.status, type: 'button', disabled: !allowed || t.status === 'na',
    'aria-label': t.status === 'done' ? 'Mở lại việc' : 'Hoàn thành', title: t.status === 'done' ? 'Bấm để mở lại' : 'Bấm để hoàn thành',
    onClick: act(async () => {
      if (t.status === 'done') return reopen(t);
      if (t.status === 'review') { if (isCM()) return approve(t); return; }
      if (t.status === 'na') return;
      await complete(t);
    }),
  }, ICON[t.status]);

  const chips = [
    t.time && h('span', { class: 'chip time' }, t.time),
    showFac && h('span', { class: 'chip' }, facName(t.facility)),
    showDate && h('span', { class: 'chip' }, fmtDM(t.date)),
    carried && h('span', { class: 'chip warn' }, 'Tồn từ ' + fmtDM(t.date)),
    overdue && !carried && h('span', { class: 'chip bad' }, 'Quá hạn'),
    t.needsReview && h('span', { class: 'chip info' }, 'Cần CM duyệt'),
    t.sendCSKH && h('span', { class: 'chip info' }, 'Gửi CSKH'),
    t.status !== 'todo' && t.status !== 'done' && h('span', { class: 'chip st-' + t.status }, STATUS_TEXT[t.status]),
    t.assignee ? h('span', { class: 'chip who' + (mine ? ' me' : '') }, mine ? 'Tôi' : t.assigneeName) : h('span', { class: 'chip ghost' }, 'Chưa có người nhận'),
  ];

  const main = h('div', { class: 'task-main', onClick: () => { open ? expanded.delete(t.id) : expanded.add(t.id); redraw && redraw(); } },
    selectable && h('input', { type: 'checkbox', class: 'sel', checked: !!selected, 'aria-label': 'Chọn việc', onClick: (e) => e.stopPropagation(), onChange: (e) => onSelect && onSelect(t, e.target.checked) }),
    tick,
    h('div', { class: 'task-title' }, h('span', { class: 'tt' }, t.title), t.extra && h('span', { class: 'extra' }, t.extra), h('div', { class: 'chips' }, chips)),
    h('span', { class: 'caret', 'aria-hidden': 'true' }, open ? '▾' : '▸'));

  const card = h('div', { class: `task st-${t.status}${mine ? ' mine' : ''}${overdue ? ' overdue' : ''}${t.flagged ? ' flagged' : ''}`, 'data-id': t.id }, main);
  if (!open) return card;

  const detail = h('div', { class: 'task-detail' });
  if (t.desc || t.source !== 'template') {
    // mô tả của việc tạo từ chuỗi hoặc sự kiện
  }
  const tpl = S.templates.find((x) => x.id === t.tplId);
  const text = t.desc || (tpl && tpl.content) || '';
  if (text) detail.append(h('div', { class: 'desc' }, text));
  if (t.feedback) detail.append(h('div', { class: 'feedback' }, h('b', null, 'Phản hồi: '), t.feedback));
  detail.append(h('div', { class: 'meta' },
    `Nhóm: ${GROUP_LABEL[t.group] || t.group} · Ngày: ${fmtDM(t.date)} · ${facName(t.facility)}`,
    t.doneByName && t.status !== 'todo' ? ` · Làm: ${t.doneByName}` : ''));

  const lk = linksFor(`${t.title} ${text}`, t.facility);
  if (lk.length) detail.append(h('div', { class: 'qlinks' }, h('span', { class: 'muted' }, 'Mở nhanh:'), lk.map((l) => h('a', { class: 'chip lnk', href: linkUrl(l, t.facility), target: '_blank', rel: 'noopener' }, l.label))));

  const note = h('textarea', {
    rows: 2, placeholder: 'Ghi chú / kết quả (ví dụ: đã check các lớp, Ms ok; lớp CAM1T chưa giao bài → đã nhắc)…', value: t.note || '', disabled: !allowed,
    onChange: (e) => saveNote(t, e.target.value).then(() => toast('Đã lưu ghi chú')).catch((er) => toast(er.message, 'err')),
  });
  detail.append(h('label', { class: 'notelab' }, 'Ghi chú', note));

  const btn = (label, kind, fn, dis) => h('button', { class: 'btn sm ' + (kind || ''), type: 'button', disabled: dis, onClick: act(fn) }, label);
  const row = h('div', { class: 'actions' });
  const finishLabel = t.status === 'approved' ? 'Đã gửi CSKH, hoàn tất' : (t.needsReview || t.flagged) ? 'Xong, gửi chuyên môn duyệt' : 'Hoàn thành';
  if ((t.status === 'todo' || t.status === 'fix' || t.status === 'approved') && allowed) row.append(btn(finishLabel, 'primary', () => complete(t)));
  if (t.status === 'review' && isCM()) {
    row.append(btn('Duyệt', 'primary', () => approve(t)));
    row.append(h('button', { class: 'btn sm danger', type: 'button', onClick: () => feedbackModal(t, { onDone: redraw }) }, 'Yêu cầu sửa'));
  }
  if (t.status === 'done' && isCM()) row.append(h('button', { class: 'btn sm danger', type: 'button', onClick: () => feedbackModal(t, { flag: true, onDone: redraw }) }, 'Đánh dấu lỗi / gửi feedback'));
  if (t.status === 'done' && allowed) row.append(btn('Mở lại', 'ghost', () => reopen(t)));
  if ((t.status === 'todo' || t.status === 'fix') && allowed) {
    row.append(h('button', { class: 'btn sm', type: 'button', onClick: () => postponeModal(t, redraw) }, 'Làm dở / chuyển ngày'));
    row.append(h('button', { class: 'btn sm ghost', type: 'button', onClick: () => moveModal(t, redraw) }, 'Dời ngày'));
    row.append(btn('Không áp dụng', 'ghost', () => markNA(t)));
  }
  if (t.status === 'na' && allowed) row.append(btn('Mở lại', 'ghost', () => reopen(t)));
  if (allowed || isCM()) row.append(h('button', { class: 'btn sm ghost', type: 'button', onClick: () => editModal(t, redraw) }, 'Sửa'));
  detail.append(row);

  // phân công
  const cands = assignCandidates(t);
  const sel = h('select', {
    'aria-label': 'Giao cho', value: t.assignee || '',
    onChange: (e) => run(() => assignTo(t, e.target.value), redraw),
  }, h('option', { value: '' }, '— Chưa có người nhận —'), cands.map((u) => h('option', { value: u.id }, u.name + (u.id === S.user.id ? ' (tôi)' : ''))));
  sel.value = t.assignee || '';
  const arow = h('div', { class: 'assign' }, h('span', { class: 'muted' }, 'Giao cho'), sel);
  if (!t.assignee && S.user.role !== 'admin') arow.append(btn('Nhận việc này', 'sm', () => claim(t)));
  if (t.assignee === S.user.id) arow.append(btn('Trả lại', 'ghost', () => unclaim(t)));
  detail.append(arow);

  if (isCM()) {
    detail.append(h('div', { class: 'actions danger-zone' }, h('button', {
      class: 'btn sm ghost danger', type: 'button',
      onClick: async () => { if (await confirmDlg(`Xóa việc "${t.title}" khỏi checklist?`, { okLabel: 'Xóa', danger: true })) run(() => removeTask(t), redraw); },
    }, 'Xóa việc này')));
  }
  card.append(detail);
  return card;
}

// Mở thẻ việc trong cửa sổ (dùng ở checklist tháng, duyệt…)
export function taskModal(t) {
  const holder = h('div');
  const m = modal({ title: t.title, body: holder, wide: true });
  const draw = () => {
    const fresh = (taskModal.live && taskModal.live(t.id)) || t;
    holder.replaceChildren(taskCard(fresh, { redraw: draw, showDate: true, showFac: true }));
    expanded.add(fresh.id);
  };
  expanded.add(t.id);
  draw();
  return { ...m, redraw: draw };
}
