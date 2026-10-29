import { h, mount, toast, modal, confirmDlg, fmtDM, fmtDMY, makeRedraw, sortBy } from './ui.js';
import { S, isCM, facName, notifyGroup, GROUP_LABEL } from './core.js';
import { buildChainTasks, addDays, parseYmd, ymd, todayStr, monthOf } from './rules.js';

const CARRY = (d) => ({ ...d, open: true, carry: true });
const GROUP_PARSE = (s) => {
  const x = (s || '').toLowerCase().replace(/\s+/g, '');
  if (/^(tg|trợgiảng|ta)$/.test(x)) return 'ta';
  if (/^(cm|chuyênmôn)$/.test(x)) return 'cm';
  if (/^(cả2|cả2đội|both|all|tất cả)$/.test(x)) return 'both';
  return null;
};

// Đọc timeline dán vào: "dd/mm/yyyy | Việc | TG/CM/Cả 2" hoặc "D-7 | Việc | CM" (tính từ ngày sự kiện)
export function parseTimeline(text, eventDate) {
  const rows = []; const errors = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    let parts = line.includes('\t') ? line.split('\t') : line.includes('|') ? line.split('|') : line.includes(';') ? line.split(';') : line.split(',');
    parts = parts.map((p) => p.trim());
    if (parts.length >= 4 && !line.includes('\t') && !line.includes('|') && !line.includes(';')) parts = [parts[0], parts.slice(1, -1).join(', '), parts[parts.length - 1]];
    const [d, title, g] = parts;
    if (!title) { errors.push(`Dòng ${i + 1}: thiếu tên việc`); return; }
    let date = null;
    let m = d.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
    if (m) {
      const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : (eventDate ? Number(eventDate.slice(0, 4)) : new Date().getFullYear());
      date = `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    } else if ((m = d.match(/^[Dd]\s*([+-]\s*\d+)?$/))) {
      if (!eventDate) { errors.push(`Dòng ${i + 1}: cần nhập ngày diễn ra sự kiện để tính ${d}`); return; }
      date = addDays(eventDate, m[1] ? Number(m[1].replace(/\s+/g, '')) : 0);
    } else if (/^(ngày|date|thời gian|stt)$/i.test(d)) return; // dòng tiêu đề
    else { errors.push(`Dòng ${i + 1}: không đọc được ngày "${d}"`); return; }
    if (Number.isNaN(parseYmd(date).getTime())) { errors.push(`Dòng ${i + 1}: ngày không hợp lệ`); return; }
    const group = GROUP_PARSE(g) || 'both';
    rows.push({ date, title, group, desc: '' });
  });
  return { rows, errors };
}

export function viewChains(root, params) {
  let tab = params.tab || 'chain';
  let history = [];
  const unsub = S.db.subscribe('events', [], (r) => { history = r; redraw(); });
  const redraw = makeRedraw(root, render);

  // trạng thái các form
  const cf = { chainId: null, label: '', anchor: todayStr(), facs: new Set([S.facility]), steps: [] };
  const ef = { name: '', date: todayStr(), facs: new Set([S.facility]), text: '', desc: '' };

  function loadChain(id) {
    cf.chainId = id;
    const c = S.chains.find((x) => x.id === id);
    cf.steps = c ? c.steps.map((s) => ({ ...s, on: true })) : [];
  }

  async function pushTasks(items, kind, name, extraMeta) {
    const evId = S.db.newId();
    const ops = [];
    let count = 0;
    for (const it of items) {
      for (const d of it.docs) { ops.push({ op: 'set', col: 'tasks', id: d.id, data: CARRY({ ...d.data, refId: evId, source: kind }) }); count++; }
    }
    ops.push({ op: 'set', col: 'events', id: evId, data: { kind, name, count, createdBy: S.user.id, createdByName: S.user.name, createdAt: Date.now(), ...extraMeta } });
    await S.db.batch(ops);
    return { evId, count };
  }

  function chainForm() {
    const c = S.chains.find((x) => x.id === cf.chainId);
    const chainSel = h('select', { onChange: (e) => { loadChain(e.target.value); render(); } },
      h('option', { value: '' }, '— Chọn loại chuỗi việc —'), S.chains.map((x) => h('option', { value: x.id }, x.name)));
    chainSel.value = cf.chainId || '';
    const preview = c ? h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Ngày'), h('th', null, 'Công việc'), h('th', null, 'Đội'))),
      h('tbody', null, cf.steps.map((s, i) => {
        const date = cf.anchor ? addDays(cf.anchor, Number(s.off) || 0) : '';
        return h('tr', { class: s.on ? '' : 'off' },
          h('td', null, h('input', { type: 'checkbox', checked: s.on, onChange: (e) => { s.on = e.target.checked; render(); } })),
          h('td', null, date ? fmtDM(date) : '', h('div', { class: 'muted small' }, s.off === 0 ? 'đúng mốc' : s.off > 0 ? `+${s.off} ngày` : `${s.off} ngày`)),
          h('td', null, h('b', null, s.title), s.desc && h('div', { class: 'muted small clamp' }, s.desc)),
          h('td', null, GROUP_LABEL[s.group] || s.group, s.needsReview ? h('span', { class: 'chip info inl' }, 'Cần duyệt') : null));
      }))) : null;
    return h('div', { class: 'stack' },
      h('p', { class: 'muted' }, 'Chọn loại chuỗi, nhập tên lớp/học sinh và ngày mốc. Hệ thống tự tính ngày từng bước và đẩy việc về checklist của đội phụ trách.'),
      h('div', { class: 'grid3' },
        h('label', null, 'Loại chuỗi', chainSel),
        h('label', null, c ? c.anchor : 'Ngày mốc', h('input', { type: 'date', value: cf.anchor, onChange: (e) => { cf.anchor = e.target.value; render(); } })),
        h('label', null, 'Tên lớp / học sinh', h('input', { type: 'text', placeholder: 'Ví dụ: CAM1S', value: cf.label, onInput: (e) => { cf.label = e.target.value; } }))),
      h('div', null, h('div', { class: 'lab' }, 'Cơ sở'), h('div', { class: 'checks' }, S.facilities.map((f) =>
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: cf.facs.has(f.id), onChange: (e) => { e.target.checked ? cf.facs.add(f.id) : cf.facs.delete(f.id); } }), f.name)))),
      c && h('p', { class: 'hint' }, c.desc),
      preview,
      c && h('div', { class: 'row-actions' }, h('button', {
        class: 'btn primary', type: 'button',
        onClick: async (e) => {
          const label = cf.label.trim();
          const steps = cf.steps.filter((s) => s.on);
          if (!label) return toast('Hãy nhập tên lớp / học sinh', 'err');
          if (!cf.anchor) return toast('Hãy chọn ngày mốc', 'err');
          if (!cf.facs.size) return toast('Chọn ít nhất một cơ sở', 'err');
          if (!steps.length) return toast('Chưa chọn bước nào', 'err');
          const facs = [...cf.facs];
          const items = [{ docs: buildChainTasks({ steps, label, anchor: cf.anchor, facilities: facs, by: S.user.id, newId: S.db.newId }) }];
          e.currentTarget.disabled = true;
          try {
            const { count } = await pushTasks(items, 'chain', `${c.name}: ${label}`, { chainId: c.id, label, anchor: cf.anchor, facilities: facs });
            await notifyGroup('both', `Có chuỗi việc mới: ${c.name} · ${label} (${count} việc)`, '#/month');
            toast(`Đã đẩy ${count} việc về checklist`);
            cf.label = ''; render();
          } catch (er) { toast(er.message, 'err'); } finally { e.currentTarget && (e.currentTarget.disabled = false); }
        },
      }, 'Đẩy các việc về checklist')));
  }

  function eventForm() {
    if (!isCM()) return h('p', { class: 'empty' }, 'Chỉ Quản lý và Chuyên môn tạo được sự kiện.');
    const sample = S.chains.find((x) => x.id === 'c5');
    const preview = h('div', { class: 'stack' });
    const drawPreview = () => {
      const parsed = parseTimeline(ef.text, ef.date);
      mount(preview,
        parsed.errors.length ? h('div', { class: 'banner bad' }, parsed.errors.slice(0, 5).map((x) => h('div', null, x))) : null,
        parsed.rows.length ? h('div', { class: 'scroll' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Ngày'), h('th', null, 'Công việc'), h('th', null, 'Đội'))),
          h('tbody', null, sortBy(parsed.rows, 'date').map((r) => h('tr', null, h('td', null, fmtDMY(r.date)), h('td', null, r.title), h('td', null, GROUP_LABEL[r.group])))))) : null,
        parsed.rows.length ? h('p', { class: 'hint' }, `${parsed.rows.length} đầu việc × ${ef.facs.size} cơ sở = ${parsed.rows.length * ef.facs.size} việc sẽ được đẩy về checklist.`) : null);
      return parsed;
    };
    const ta = h('textarea', { rows: 8, placeholder: '12/11/2026 | Tạo bộ câu hỏi theo chủ đề | CM\nD-7 | Chốt đăng ký lần 1 | CM\nD-1 | Chuẩn bị thẻ và in tài liệu | TG', value: ef.text, onInput: (e) => { ef.text = e.target.value; drawPreview(); } });
    const fileIn = h('input', { type: 'file', accept: '.csv,.txt,.tsv', class: 'hidden', onChange: async (e) => {
      const f = e.target.files[0]; if (!f) return; ef.text = (ef.text ? ef.text + '\n' : '') + (await f.text()); ta.value = ef.text; drawPreview();
    } });
    const el = h('div', { class: 'stack' },
      h('p', { class: 'muted' }, 'Dán timeline sự kiện (có thể copy trực tiếp từ Google Sheets) hoặc tải file .csv/.txt. Mỗi dòng gồm: Ngày | Công việc | Đội (TG, CM hoặc Cả 2). Có thể ghi ngày theo mốc, ví dụ D-7 là 7 ngày trước sự kiện.'),
      h('div', { class: 'grid2' },
        h('label', null, 'Tên sự kiện', h('input', { type: 'text', value: ef.name, placeholder: 'Ví dụ: Ngày hội Hồ Gươm', onInput: (e) => { ef.name = e.target.value; } })),
        h('label', null, 'Ngày diễn ra', h('input', { type: 'date', value: ef.date, onChange: (e) => { ef.date = e.target.value; drawPreview(); } }))),
      h('div', null, h('div', { class: 'lab' }, 'Cơ sở'), h('div', { class: 'checks' }, S.facilities.map((f) =>
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: ef.facs.has(f.id), onChange: (e) => { e.target.checked ? ef.facs.add(f.id) : ef.facs.delete(f.id); drawPreview(); } }), f.name)))),
      ta,
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn ghost sm', type: 'button', onClick: () => fileIn.click() }, 'Tải file timeline'),
        sample && h('button', { class: 'btn ghost sm', type: 'button', onClick: () => {
          ef.text = sample.steps.map((s) => `D${s.off === 0 ? '' : (s.off > 0 ? '+' : '') + s.off} | ${s.title} | ${s.group === 'cm' ? 'CM' : s.group === 'ta' ? 'TG' : 'Cả 2'}`).join('\n'); ta.value = ef.text; drawPreview();
        } }, 'Dùng mẫu sự kiện Hồ Gươm'), fileIn),
      preview,
      h('div', { class: 'row-actions' }, h('button', {
        class: 'btn primary', type: 'button',
        onClick: async (e) => {
          const parsed = parseTimeline(ef.text, ef.date);
          if (!ef.name.trim()) return toast('Hãy nhập tên sự kiện', 'err');
          if (!parsed.rows.length) return toast('Chưa có dòng timeline hợp lệ', 'err');
          if (!ef.facs.size) return toast('Chọn ít nhất một cơ sở', 'err');
          const facs = [...ef.facs];
          const steps = parsed.rows.map((r) => ({ title: r.title, group: r.group, date: r.date, desc: '' }));
          const items = [{ docs: buildChainTasks({ steps, label: ef.name.trim(), anchor: ef.date, facilities: facs, by: S.user.id, newId: S.db.newId, source: 'event' }) }];
          const btn = e.currentTarget; btn.disabled = true;
          try {
            const { count } = await pushTasks(items, 'event', ef.name.trim(), { date: ef.date, facilities: facs });
            await notifyGroup('both', `Sự kiện mới: ${ef.name.trim()} (${count} việc đã đẩy về checklist)`, '#/month');
            toast(`Đã đẩy ${count} việc của sự kiện về checklist các đội`);
            ef.text = ''; ef.name = ''; render();
          } catch (er) { toast(er.message, 'err'); btn.disabled = false; }
        },
      }, 'Đẩy việc về checklist các đội')));
    drawPreview();
    return el;
  }

  function historyList() {
    const list = sortBy(history, (e) => -(e.createdAt || 0));
    if (!list.length) return h('p', { class: 'empty' }, 'Chưa có chuỗi việc hoặc sự kiện nào.');
    return h('div', { class: 'stack' }, list.slice(0, 40).map((e) => h('div', { class: 'hist' },
      h('div', null, h('b', null, e.name), h('div', { class: 'muted small' }, `${e.kind === 'event' ? 'Sự kiện' : 'Chuỗi việc'} · ${e.count} việc · ${e.createdByName || ''} · ${new Date(e.createdAt).toLocaleDateString('vi-VN')}`)),
      isCM() && h('button', { class: 'btn ghost sm danger', type: 'button', onClick: async () => {
        if (!(await confirmDlg(`Hủy "${e.name}"? Các việc chưa làm của nó sẽ bị xóa khỏi checklist, việc đã làm vẫn giữ lại.`, { okLabel: 'Hủy sự kiện', danger: true }))) return;
        const ts = await S.db.getAll('tasks', [['refId', '==', e.id]]);
        const del = ts.filter((t) => t.status === 'todo').map((t) => ({ op: 'delete', col: 'tasks', id: t.id }));
        del.push({ op: 'delete', col: 'events', id: e.id });
        await S.db.batch(del); toast(`Đã xóa ${del.length - 1} việc chưa làm`);
      } }, 'Hủy'))));
  }

  function render() {
    if (!cf.chainId && S.chains.length) loadChain(S.chains[0].id);
    const tabs = [['chain', 'Tạo từ chuỗi việc'], ['event', 'Up timeline sự kiện'], ['hist', 'Đã tạo']];
    mount(root, 
      h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Chuỗi việc & sự kiện'), h('p', { class: 'muted' }, 'Khai báo một lần, hệ thống tự đẩy các đầu việc về đúng ngày và đúng đội.'))),
      h('div', { class: 'seg tabs' }, tabs.map(([v, l]) => h('button', { class: 'seg-b' + (tab === v ? ' on' : ''), type: 'button', onClick: () => { tab = v; render(); } }, l))),
      h('div', { class: 'panel' }, tab === 'chain' ? chainForm() : tab === 'event' ? eventForm() : historyList()));
  }
  render();
  return () => unsub();
}
