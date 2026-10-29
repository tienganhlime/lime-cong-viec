import { h, mount, makeRedraw, fmtDM, sortBy } from './ui.js';
import { S, facName, taskKey, approve } from './core.js';
import { taskCard, feedbackModal, expanded } from './taskui.js';

export function viewReview(root) {
  let tasks = [];
  const unsub = S.db.subscribe('tasks', [['status', 'in', ['review', 'fix', 'approved']]], (r) => { tasks = r; redraw(); });
  const redraw = makeRedraw(root, render);

  function render() {
    const by = (s) => sortBy(tasks.filter((t) => t.status === s), 'date', taskKey);
    const review = by('review'); const fix = by('fix'); const appr = by('approved');
    const sec = (title, list, empty, hint) => h('section', { class: 'sec' },
      h('div', { class: 'sec-head' }, h('h3', null, title, h('span', { class: 'count' }, list.length)), hint && h('span', { class: 'muted' }, hint)),
      list.length ? list.map((t) => reviewCard(t)) : h('p', { class: 'empty' }, empty));

    function reviewCard(t) {
      const wrap = h('div', { class: 'review-item' }, taskCard(t, { redraw, showDate: true, showFac: true }));
      if (t.status === 'review') {
        wrap.append(h('div', { class: 'review-actions' },
          h('button', { class: 'btn primary sm', type: 'button', onClick: async () => { await approve(t); } }, t.sendCSKH ? 'Duyệt, để trợ giảng gửi CSKH' : 'Duyệt'),
          h('button', { class: 'btn danger sm', type: 'button', onClick: () => feedbackModal(t, { onDone: redraw }) }, 'Yêu cầu sửa'),
          h('span', { class: 'muted' }, `${t.doneByName || t.assigneeName || ''} · ${facName(t.facility)} · ${fmtDM(t.date)}`)));
      }
      return wrap;
    }

    mount(root, 
      h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Chờ duyệt'), h('p', { class: 'muted' }, 'Việc trợ giảng đã làm xong và cần chuyên môn kiểm tra. Duyệt xong, việc quay về trợ giảng để làm tiếp phần còn lại (ví dụ gửi CSKH).'))),
      sec('Chờ chuyên môn duyệt', review, 'Không có việc nào chờ duyệt.'),
      sec('Đang yêu cầu sửa', fix, 'Không có việc nào đang cần sửa.', 'Trợ giảng sửa xong sẽ tự gửi lại ở mục trên'),
      sec('Đã duyệt, chờ trợ giảng gửi CSKH', appr, 'Không có việc nào đang chờ gửi CSKH.'));
  }
  render();
  return () => unsub();
}
