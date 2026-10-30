import { h, mount, modal, toast, confirmDlg, makeRedraw, fmtDM, fmtDMY, sortBy } from './ui.js';
import { S, isCM, facName } from './core.js';
import { todayStr, addDays, monthOf, DOW_NAMES, dow } from './rules.js';
import {
  DOW_LABEL, classesOf, slotText, slotOn, parsePaste, importReviews, reviewDone, reviewReopen, reviewNote, reviewMove,
  addTestScore, addStudentNote, summarize, normCode,
} from './students.js';

/* ================= Khối "Ôn bài / bù bài" trong màn hình Hôm nay ================= */
export function reviewSection(list, date, redraw) {
  if (!list.length) return null;
  const today = todayStr();
  const byClass = new Map();
  for (const r of sortBy(list, 'classCode', 'studentName')) {
    if (!byClass.has(r.classId)) byClass.set(r.classId, []);
    byClass.get(r.classId).push(r);
  }
  const done = list.filter((r) => r.status === 'done').length;
  const run = async (fn) => { try { await fn(); } catch (e) { toast(e.message || 'Có lỗi', 'err'); } if (redraw) redraw(); };
  const cards = [...byClass.entries()].map(([cid, rows]) => {
    const cls = (S.classes || []).find((c) => c.id === cid);
    const slots = slotOn(cls, date);
    // chỉ hiện nội dung chung ở đầu lớp khi mọi học sinh trong lớp có cùng một nội dung
    const uniq = [...new Set(rows.map((r) => r.content || ''))];
    const shared = rows.length > 1 && uniq.length === 1 && uniq[0] ? uniq[0] : '';
    const studentRows = rows.map((r) => {
      const late = r.date < date;
      const note = h('input', {
        type: 'text', class: 'rv-note', placeholder: 'Nhận xét sau buổi ôn…', value: r.note || '',
        onChange: (e) => reviewNote(r, e.target.value).catch((er) => toast(er.message, 'err')),
      });
      return h('div', { class: 'rv-row s-' + r.status },
        h('div', { class: 'rv-who' }, h('div', { class: 'rv-name' }, h('b', null, r.studentName), h('span', { class: 'chip ' + (r.kind === 'bu' ? 'warn' : '') }, r.kind === 'bu' ? 'Bù bài' : 'Ôn bài'),
          late && h('span', { class: 'chip bad' }, `Từ ${fmtDM(r.date)}`), r.movedCount ? h('span', { class: 'muted' }, ` · đã lùi ${r.movedCount} lần`) : null),
          !shared && r.content ? h('div', { class: 'rv-content sm' }, r.content) : null),
        r.status === 'done'
          ? h('div', { class: 'rv-acts' }, h('span', { class: 'ok-text' }, `✓ Đã ôn${r.doneByName ? ' · ' + r.doneByName : ''}`), r.note ? h('span', { class: 'muted' }, r.note) : null,
            h('button', { class: 'btn ghost sm', type: 'button', onClick: () => run(() => reviewReopen(r)) }, 'Mở lại'))
          : h('div', { class: 'rv-acts' }, note,
            h('button', { class: 'btn primary sm', type: 'button', onClick: () => run(async () => { await reviewDone(r, note.value); toast('Đã ghi: ' + r.studentName + ' đã ôn'); }) }, '✓ Đã ôn'),
            h('button', { class: 'btn sm', type: 'button', title: 'Chuyển sang buổi học kế tiếp của lớp', onClick: () => run(async () => {
              const d = await reviewMove(r, date, 'moved', note.value); toast(`${r.studentName} chuyển sang ${fmtDM(d)}`);
            }) }, 'Chưa ôn → buổi sau'),
            h('button', { class: 'btn ghost sm', type: 'button', title: 'Học sinh vắng, chuyển sang buổi học kế tiếp', onClick: () => run(async () => {
              const d = await reviewMove(r, date, 'absent', note.value || 'Vắng'); toast(`${r.studentName} vắng, chuyển sang ${fmtDM(d)}`);
            }) }, 'Vắng')));
    });
    return h('div', { class: 'rv-card' },
      h('div', { class: 'rv-head' }, h('b', null, cls ? cls.code : rows[0].classCode), cls && h('span', { class: 'muted' }, ` · ${cls.teacher}`),
        slots.length ? h('span', { class: 'chip' }, slots.map((s) => `${s.start}-${s.end} P.${s.room}`).join(', ')) : null),
      shared ? h('div', { class: 'rv-content' }, shared) : null, studentRows);
  });
  return h('section', { class: 'sec' },
    h('div', { class: 'sec-head' }, h('h3', null, 'Ôn bài / bù bài', h('span', { class: 'count' }, `${done}/${list.length}`)),
      date < today ? null : h('span', { class: 'muted' }, 'Cuối ca: học sinh chưa ôn sẽ tự chuyển sang buổi học kế tiếp')), cards);
}

/* ================= Trang "Học sinh" ================= */
export function viewStudents(root, params) {
  const fac = S.facility;
  let tab = params.tab || 'list';
  let students = []; let reviews = [];
  let q = ''; let clsFilter = ''; let onlyWatch = true;
  const unsubs = [];
  const redraw = makeRedraw(root, render);
  unsubs.push(S.db.subscribe('students', [['facility', '==', fac]], (r) => { students = r; S.students = r; redraw(); }));
  // Chỉ nghe 2 tuần gần nhất (cộng 16 ngày tới, là các ngày đã dán danh sách). Bấm "Mở thêm" để xem thêm từng 2 tuần cũ hơn.
  const wins = []; let nWin = 0;
  const winDates = (k) => {
    const today = todayStr();
    return k === 0 ? Array.from({ length: 30 }, (_, i) => addDays(today, i - 13)) : Array.from({ length: 14 }, (_, i) => addDays(today, -14 * k - 13 + i));
  };
  const openWindow = () => {
    const k = nWin++;
    wins[k] = [];
    unsubs.push(S.db.subscribe('reviews', [['facility', '==', fac], ['date', 'in', winDates(k)]], (r) => { wins[k] = r; reviews = wins.flat(); redraw(); }));
  };
  openWindow();
  let pasteText = ''; let pasteDate = todayStr(); let parsed = null;

  const stats = (sid) => {
    const rs = reviews.filter((r) => r.studentId === sid && (r.kind === 'on' || r.kind === 'bu'));
    return { done: rs.filter((r) => r.status === 'done').length, pending: rs.filter((r) => r.status === 'pending').length, moved: rs.reduce((a, r) => a + (r.movedCount || 0), 0) };
  };

  async function profile(st) {
    // hồ sơ: đọc toàn bộ lịch sử của riêng học sinh này (chỉ khi mở hồ sơ)
    let all = reviews.filter((r) => r.studentId === st.id);
    try { all = await S.db.getAll('reviews', [['studentId', '==', st.id]]); } catch (e) { /* dùng dữ liệu đã tải */ }
    const rs = sortBy(all, (r) => r.date).reverse();
    const hist = [];
    for (const r of rs) {
      for (const e of r.history || []) hist.push({ date: e.date, text: e.result === 'done' ? 'Đã ôn' : e.result === 'absent' ? 'Vắng, chuyển buổi sau' : 'Chưa ôn, chuyển buổi sau', note: e.note, by: e.byName, content: r.content, kind: r.kind });
      if (r.kind === 'test') hist.push({ date: r.date, text: `Test: ${r.score ?? ''}`, note: r.note, by: r.doneByName, kind: 'test' });
      else if (r.kind === 'note') hist.push({ date: r.date, text: 'Nhận xét', note: r.note, by: r.doneByName, kind: 'note' });
      else if (r.status === 'pending') hist.push({ date: r.date, text: `Chờ ${r.kind === 'bu' ? 'bù bài' : 'ôn bài'}`, note: '', content: r.content, kind: r.kind, pending: true });
    }
    hist.sort((a, b) => b.date.localeCompare(a.date));
    const sc = h('input', { type: 'text', placeholder: 'Điểm test (vd 8/10)', class: 'rv-score' });
    const nt = h('input', { type: 'text', placeholder: 'Nhận xét / ghi chú…', class: 'rv-note' });
    modal({
      title: `${st.name} · ${st.classCode}`, wide: true,
      body: h('div', { class: 'stack' },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.watch, onChange: (e) => S.db.update('students', st.id, { watch: e.target.checked }) }), 'Đang theo dõi (học sinh yếu, test hàng tuần)'),
        h('div', { class: 'row-actions' }, nt, h('button', { class: 'btn sm', type: 'button', onClick: async () => { if (!nt.value.trim()) return; await addStudentNote(st, todayStr(), nt.value.trim()); nt.value = ''; toast('Đã lưu nhận xét'); } }, 'Lưu nhận xét')),
        h('div', { class: 'row-actions' }, sc, h('button', { class: 'btn sm', type: 'button', onClick: async () => { if (!sc.value.trim()) return; await addTestScore(st, todayStr(), sc.value.trim(), ''); sc.value = ''; toast('Đã ghi điểm test'); } }, 'Ghi điểm test hôm nay')),
        h('div', { class: 'rv-hist' }, hist.length ? hist.map((x) => h('div', { class: 'rv-h' },
          h('b', null, fmtDMY(x.date)), ' · ', x.text, x.by ? h('span', { class: 'muted' }, ` · ${x.by}`) : null,
          x.note ? h('div', { class: 'muted' }, x.note) : null, x.content ? h('div', { class: 'rv-content sm' }, x.content.split('\n')[0].slice(0, 160)) : null))
          : h('p', { class: 'muted' }, 'Chưa có lịch sử.'))),
      actions: [{ label: 'Đóng', kind: 'primary' }],
    });
  }

  function listTab() {
    const cls = classesOf(fac);
    let rows = students.filter((s) => (!onlyWatch || s.watch) && (!clsFilter || s.classId === clsFilter) && (!q || s.name.toLowerCase().includes(q.toLowerCase())));
    rows = sortBy(rows, 'classCode', 'name');
    const reportBtn = h('button', { class: 'btn', type: 'button', disabled: !rows.length, onClick: async () => {
      const groups = new Map();
      for (const s of rows) { if (!groups.has(s.classId)) groups.set(s.classId, []); groups.get(s.classId).push(s); }
      if (!(await confirmDlg(`Tạo ${groups.size} việc "Soạn báo cáo phụ huynh 2 tuần" (mỗi lớp 1 việc, kèm tóm tắt 14 ngày gần nhất của từng học sinh)?`, { okLabel: 'Tạo việc' }))) return;
      const today = todayStr(); const ops = [];
      for (const [cid, list] of groups) {
        const c = (S.classes || []).find((x) => x.id === cid);
        ops.push({ op: 'set', col: 'tasks', id: S.db.newId(), data: {
          facility: fac, date: today, month: monthOf(today), title: `Soạn báo cáo phụ huynh 2 tuần: lớp ${c ? c.code : list[0].classCode}`, extra: '', time: '',
          desc: 'Soạn văn báo cáo phụ huynh cho các học sinh đang theo dõi. Tóm tắt 14 ngày gần nhất:\n\n' + list.map((s) => summarize(s, reviews, today)).join('\n\n'),
          group: 'ta', tplId: '', source: 'adhoc', refId: '', status: 'todo', open: true, carry: true, assignee: null, assigneeName: '', note: '', feedback: '',
          needsReview: true, sendCSKH: true, flagged: false, order: 900, createdBy: S.user.id, createdAt: Date.now() } });
      }
      await S.db.batch(ops); toast(`Đã tạo ${ops.length} việc báo cáo phụ huynh`);
    } }, 'Tạo việc báo cáo phụ huynh 2 tuần');
    return h('div', { class: 'stack' },
      h('div', { class: 'toolbar wrap' },
        h('select', { onChange: (e) => { clsFilter = e.target.value; render(); } }, h('option', { value: '' }, 'Tất cả lớp'), cls.map((c) => h('option', { value: c.id, selected: c.id === clsFilter }, c.code))),
        h('input', { type: 'search', class: 'search', placeholder: 'Tìm học sinh…', value: q, onInput: (e) => { q = e.target.value; redraw(); } }),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: onlyWatch, onChange: (e) => { onlyWatch = e.target.checked; render(); } }), 'Chỉ học sinh đang theo dõi'), reportBtn),
      rows.length ? h('div', { class: 'matrix-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, ['Học sinh', 'Lớp', 'Đã ôn', 'Đang chờ', 'Lần lùi buổi', ''].map((t) => h('th', null, t)))),
        h('tbody', null, rows.map((s) => { const x = stats(s.id); return h('tr', { class: 'clickable', tabindex: 0, onClick: () => profile(s), onKeydown: (e) => { if (e.key === 'Enter') profile(s); } },
          h('td', null, h('b', null, s.name), s.tag ? h('span', { class: 'muted' }, ` (${s.tag})`) : null), h('td', null, s.classCode), h('td', null, x.done), h('td', null, x.pending ? h('span', { class: 'chip warn' }, x.pending) : 0), h('td', null, x.moved), h('td', null, s.watch ? '👁' : '')); }))))
        : h('div', { class: 'empty-state' }, h('h3', null, 'Chưa có học sinh nào'), h('p', null, 'Dán danh sách ôn bài / bù bài ở thẻ bên cạnh, học sinh sẽ tự được thêm vào đây.')));
  }

  function pasteTab() {
    const existing = new Set(reviews.map((r) => r.id));
    const ta = h('textarea', { rows: 10, placeholder: 'Dán từ Google Sheets (cột: ngày, lớp - GV, tên học sinh, nội dung ôn) hoặc gõ mỗi dòng:\nCAM1T | Minh Anh, Gia Bảo | Ôn Unit 3\n\nCó thể gõ dòng ngày riêng như "Thứ 5 (29/10)" để áp dụng cho các lớp bên dưới.', value: pasteText, onInput: (e) => { pasteText = e.target.value; } });
    const dateIn = h('input', { type: 'date', value: pasteDate, onChange: (e) => { pasteDate = e.target.value; } });
    let preview = null;
    if (parsed) {
      const ok = parsed.filter((i) => i.cls);
      preview = h('div', { class: 'stack' },
        h('p', null, h('b', null, `${ok.reduce((a, i) => a + i.students.length, 0)} học sinh`), ` của ${ok.length} nhóm sẽ được thêm.`, parsed.length > ok.length ? h('span', { class: 'chip bad inl' }, `${parsed.length - ok.length} dòng chưa nhận ra lớp`) : null),
        parsed.map((it) => {
          const sel = h('select', { onChange: (e) => { it.cls = (S.classes || []).find((c) => c.id === e.target.value) || null; render(); } }, h('option', { value: '' }, '— chọn lớp —'),
            classesOf(fac).map((c) => h('option', { value: c.id, selected: it.cls && it.cls.id === c.id }, c.code)));
          const sl = it.cls ? slotOn(it.cls, it.date) : [];
          return h('div', { class: 'rv-card' }, h('div', { class: 'rv-head' }, h('b', null, `${DOW_NAMES[dow(it.date)]} ${fmtDM(it.date)}`), ' · ', it.classRaw, ' → ', sel,
            it.cls && !sl.length ? h('span', { class: 'chip warn' }, 'Lớp không học ngày này') : null),
          h('div', null, it.students.map((s) => h('span', { class: 'chip' }, s.name + (s.tag ? ` (${s.tag})` : '')))), it.content ? h('div', { class: 'rv-content sm' }, it.content) : null); }),
        h('button', { class: 'btn primary', type: 'button', disabled: !ok.length, onClick: async () => {
          const r = await importReviews(parsed, fac, existing);
          toast(`Đã thêm ${r.added} lượt ôn bài vào checklist${r.skipped ? `, bỏ qua ${r.skipped} lượt đã có` : ''}`); parsed = null; pasteText = ''; render();
        } }, 'Thêm vào checklist theo ngày lớp học'));
    }
    return h('div', { class: 'stack' },
      h('p', { class: 'muted' }, 'Cuối tuần xin danh sách ôn bài / bù bài của từng lớp rồi dán vào đây. Học sinh sẽ hiện trong checklist ngày đúng ngày lớp học.'),
      h('label', null, 'Ngày mặc định (khi dòng dán không ghi ngày)', dateIn), ta,
      h('div', { class: 'row-actions' }, h('button', { class: 'btn', type: 'button', onClick: () => { parsed = parsePaste(pasteText, pasteDate, fac); if (!parsed.length) toast('Chưa nhận ra dòng nào. Kiểm tra lại cột lớp và tên học sinh.', 'err'); render(); } }, 'Phân tích danh sách')),
      preview);
  }

  function classModal(c) {
    const draft = c ? JSON.parse(JSON.stringify(c)) : { facility: fac, code: '', teacher: '', slots: [] };
    const code = h('input', { type: 'text', value: draft.code, placeholder: 'Mã lớp, vd CAM1T' });
    const teacher = h('input', { type: 'text', value: draft.teacher, placeholder: 'Giáo viên' });
    const slotsBox = h('div', { class: 'stack' });
    const drawSlots = () => slotsBox.replaceChildren(...draft.slots.map((s, i) => h('div', { class: 'row-actions' },
      h('select', { onChange: (e) => { s.dow = Number(e.target.value); } }, [1, 2, 3, 4, 5, 6, 7].map((d) => h('option', { value: d, selected: d === s.dow }, DOW_NAMES[d]))),
      h('input', { type: 'time', value: s.start, onChange: (e) => { s.start = e.target.value; } }), h('input', { type: 'time', value: s.end, onChange: (e) => { s.end = e.target.value; } }),
      h('input', { type: 'text', value: s.room || '', placeholder: 'Phòng', class: 'rv-room', onInput: (e) => { s.room = e.target.value; } }),
      h('button', { class: 'btn ghost sm', type: 'button', onClick: () => { draft.slots.splice(i, 1); drawSlots(); } }, 'Xóa'))));
    drawSlots();
    modal({
      title: c ? `Sửa lớp ${c.code}` : 'Thêm lớp', body: h('div', { class: 'stack' }, code, teacher, h('h4', null, 'Buổi học trong tuần'), slotsBox,
        h('button', { class: 'btn sm', type: 'button', onClick: () => { draft.slots.push({ dow: 1, start: '18:00', end: '20:00', room: '' }); drawSlots(); } }, '+ Thêm buổi')),
      actions: [{ label: 'Hủy', kind: 'ghost' }, ...(c ? [{ label: 'Xóa lớp', kind: 'danger', onClick: async () => { if (!(await confirmDlg(`Xóa lớp ${c.code}?`, { danger: true }))) return false; await S.db.remove('classes', c.id); } }] : []), {
        label: 'Lưu', kind: 'primary', onClick: async () => {
          if (!code.value.trim()) { toast('Nhập mã lớp', 'err'); return false; }
          const id = c ? c.id : `${fac}_${normCode(code.value)}`;
          await S.db.set('classes', id, { facility: fac, code: code.value.trim(), teacher: teacher.value.trim(), slots: draft.slots });
          toast('Đã lưu lớp');
        } }],
    });
  }

  function tkbTab() {
    const cls = sortBy(classesOf(fac), 'code');
    return h('div', { class: 'stack' },
      h('p', { class: 'muted' }, 'Thời khóa biểu dùng để xếp học sinh vào đúng ngày học của lớp và tìm buổi học kế tiếp khi chưa ôn xong.'),
      isCM() && h('div', { class: 'row-actions' }, h('button', { class: 'btn sm', type: 'button', onClick: () => classModal(null) }, '+ Thêm lớp'),
        h('button', { class: 'btn ghost sm', type: 'button', onClick: async () => {
          if (!(await confirmDlg('Nạp lại thời khóa biểu mẫu (từ 11/10/2026)? Các lớp trùng mã sẽ bị ghi đè.', { okLabel: 'Nạp lại' }))) return;
          await S.db.loadClasses(); toast('Đã nạp thời khóa biểu mẫu');
        } }, 'Nạp thời khóa biểu mẫu')),
      cls.length ? h('div', { class: 'matrix-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['Lớp', 'Giáo viên', 'Lịch học', ''].map((t) => h('th', null, t)))),
        h('tbody', null, cls.map((c) => h('tr', null, h('td', null, h('b', null, c.code)), h('td', null, c.teacher), h('td', null, (c.slots || []).map((s) => `${DOW_LABEL[s.dow]} ${s.start}-${s.end}${s.room ? ' P.' + s.room : ''}`).join(' · ')),
          h('td', null, isCM() && h('button', { class: 'btn ghost sm', type: 'button', onClick: () => classModal(c) }, 'Sửa')))))))
        : h('div', { class: 'empty-state' }, h('h3', null, 'Chưa có thời khóa biểu'), h('p', null, 'Bấm "Nạp thời khóa biểu mẫu" hoặc thêm lớp thủ công.')));
  }

  function render() {
    const tabs = [['list', 'Học sinh'], ['paste', 'Dán danh sách ôn bài / bù bài'], ['tkb', 'Thời khóa biểu']];
    mount(root,
      h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Học sinh'), h('p', { class: 'muted' }, `${facName(fac)} · theo dõi ôn bài, bù bài, nhận xét và test hàng tuần`))),
      h('p', { class: 'muted' }, `Đang hiển thị lượt ôn bài từ ${fmtDM(winDates(nWin - 1)[0])} trở đi. `, h('button', { class: 'btn ghost sm', type: 'button', onClick: () => { openWindow(); render(); } }, 'Mở thêm 2 tuần trước')),
      h('div', { class: 'seg' }, tabs.map(([v, l]) => h('button', { class: 'seg-b' + (tab === v ? ' on' : ''), type: 'button', onClick: () => { tab = v; render(); } }, l))),
      tab === 'list' ? listTab() : tab === 'paste' ? pasteTab() : tkbTab());
  }
  render();
  return () => unsubs.forEach((u) => u());
}
