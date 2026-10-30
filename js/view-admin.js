import { h, mount, toast, modal, confirmDlg, makeRedraw, sortBy, fmtDM } from './ui.js';
import { S, isMgr, isCM, ROLE_LABEL, GROUP_LABEL, facName } from './core.js';
import { generateMonth, scheduleText, todayStr, monthOf, addMonths, DOW_NAMES, daysInMonth } from './rules.js';
import { USERNAME_RE, normUsername, errMsg, isFirebase } from './db.js';

/* ====================== MẪU VIỆC ====================== */
export function ruleText(r) {
  if (!r) return '';
  if (r.type === 'daily') return 'Hàng ngày';
  if (r.type === 'weekly') return 'Thứ: ' + (r.dow || []).map((d) => DOW_NAMES[d]).join(', ');
  if (r.type === 'monthly') return 'Ngày ' + (r.days || []).join(', ') + (r.months && r.months.length ? ` (tháng ${r.months.join(', ')})` : '');
  if (r.type === 'weekstart') return 'Đầu mỗi tuần';
  return 'Không tự sinh';
}

export async function generateFor(ym, facilities) {
  const existing = await S.db.getAll('tasks', [['month', '==', ym]]);
  const ids = new Set(existing.map((t) => t.id));
  const gen = generateMonth({ templates: S.templates, schedules: S.schedules, facilities, ym, existingIds: ids, by: S.user.id, cutoff: todayStr(), users: S.users });
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
      months.add(o.month);
      const sc = scheduleText(t, fac, o.date, schedules);
      if (sc.skip) { if (o.status === 'todo') { ops.push({ op: 'update', col: 'tasks', id: o.id, data: { status: 'na', open: false, note: 'Lịch lớp đã đổi: ngày này không còn việc' } }); removed++; } }
      else if (sc.text !== o.extra && (o.status === 'todo' || o.status === 'fix')) { ops.push({ op: 'update', col: 'tasks', id: o.id, data: { extra: sc.text } }); changed++; }
    }
  }
  let added = 0;
  for (const ym of [...new Set([monthOf(from), ...[...S.gen || []].map((g) => g.slice(4)).filter((m) => m >= monthOf(from))])]) {
    const ids = new Set(olds.map((o) => o.id));
    const gen = generateMonth({ templates: tpls, schedules, facilities: [fac], ym, existingIds: ids, by: S.user.id, cutoff: from, users: S.users });
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
  const rtype = h('select', null, [['daily', 'Hàng ngày'], ['weekly', 'Theo thứ trong tuần'], ['monthly', 'Theo ngày trong tháng'], ['weekstart', 'Đầu mỗi tuần'], ['none', 'Không tự sinh (chỉ tạo khi cần)']].map(([v, l]) => h('option', { value: v }, l)));
  rtype.value = t.rule.type || 'none';
  const dows = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ d, el: h('input', { type: 'checkbox', checked: (t.rule.dow || []).includes(d) }) }));
  const dowWrap = h('div', { class: 'checks' }, dows.map((x) => h('label', { class: 'check' }, x.el, DOW_NAMES[x.d])));
  const days = h('input', { type: 'text', placeholder: 'Ví dụ: 5, 20', value: (t.rule.days || []).join(', ') });
  const months = h('input', { type: 'text', placeholder: 'Để trống = mọi tháng; ví dụ: 1, 8', value: (t.rule.months || []).join(', ') });
  const wDow = h('div', { class: 'stack' }, h('div', { class: 'lab' }, 'Chọn thứ'), dowWrap);
  const wDay = h('div', { class: 'stack' }, h('label', null, 'Ngày trong tháng', days), h('label', null, 'Chỉ các tháng', months));
  const sync = () => { wDow.classList.toggle('hidden', rtype.value !== 'weekly'); wDay.classList.toggle('hidden', rtype.value !== 'monthly'); };
  rtype.addEventListener('change', sync); sync();
  const time = h('input', { type: 'text', placeholder: 'Ví dụ: Sáng 7h30; chiều tối 16h30', value: t.time || '' });
  const content = h('textarea', { rows: 5, placeholder: 'Hướng dẫn chi tiết cách làm', value: t.content || '' });
  const review = h('input', { type: 'checkbox', checked: !!t.needsReview });
  const csk = h('input', { type: 'checkbox', checked: !!t.sendCSKH });
  const facs = S.facilities.map((f) => ({ f, el: h('input', { type: 'checkbox', checked: (t.facilities || []).includes(f.id) }) }));
  const keySel = h('select', null, h('option', { value: '' }, 'Không (dùng chung cho mọi ngày)'),
    Object.entries(S.scheduleKeys).map(([k, v]) => h('option', { value: k }, 'Theo lịch lớp: ' + v.label)));
  keySel.value = t.scheduleKey || '';
  const cms = S.users.filter((u) => u.role === 'cm' && !u.disabled);
  const asg = cms.map((u) => ({ u, el: h('input', { type: 'checkbox', checked: (t.assignees || []).includes(u.id) }) }));
  const perClass = h('input', { type: 'checkbox', checked: !!t.perClass });
  const asgBox = h('div', { class: 'stack' }, h('div', { class: 'lab' }, 'Giao cho (chỉ áp dụng đội Chuyên môn; không chọn ai = việc chung, ai làm cũng được)'),
    h('div', { class: 'checks' }, asg.length ? asg.map((x) => h('label', { class: 'check' }, x.el, x.u.name)) : h('span', { class: 'muted small' }, 'Chưa có tài khoản Chuyên môn')),
    h('div', { class: 'checks' }, h('label', { class: 'check' }, perClass, 'Ghi kèm "Lớp phụ trách" của từng người vào việc')),
    h('p', { class: 'muted small' }, 'Chọn nhiều người = mỗi người nhận một việc riêng, hiện đỏ nếu quá hạn. Chỉ áp dụng cho các ngày được tạo từ lần sau.'));
  const syncAsg = () => asgBox.classList.toggle('hidden', group.value !== 'cm');
  group.addEventListener('change', syncAsg); syncAsg();
  modal({
    title: tpl ? 'Sửa mẫu việc' : 'Thêm mẫu việc', wide: true,
    body: h('div', { class: 'stack' },
      h('label', null, 'Tên công việc *', name),
      h('div', { class: 'grid2' }, h('label', null, 'Đội thực hiện', group), h('label', null, 'Giờ làm', time)),
      h('label', null, 'Kiểu lặp', rtype), wDow, wDay,
      h('label', null, 'Gắn với lịch lớp (danh sách lớp hiện kèm trong việc)', keySel),
      asgBox,
      h('label', null, 'Hướng dẫn chi tiết', content),
      h('div', null, h('div', { class: 'lab' }, 'Áp dụng ở cơ sở'), h('div', { class: 'checks' }, facs.map((x) => h('label', { class: 'check' }, x.el, x.f.name)))),
      h('div', { class: 'checks' }, h('label', { class: 'check' }, review, 'Cần chuyên môn duyệt sau khi làm xong'), h('label', { class: 'check' }, csk, 'Sau khi duyệt, trợ giảng gửi CSKH'))),
    actions: [{ label: 'Hủy', kind: 'ghost' }, {
      label: 'Lưu mẫu', kind: 'primary',
      onClick: async () => {
        if (!name.value.trim()) { toast('Hãy nhập tên công việc', 'err'); return false; }
        const rule = { type: rtype.value };
        if (rule.type === 'weekly') rule.dow = dows.filter((x) => x.el.checked).map((x) => x.d);
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
          assignees: group.value === 'cm' ? asg.filter((x) => x.el.checked).map((x) => x.u.id) : [], perClass: group.value === 'cm' && perClass.checked,
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
export function viewSchedules(root) {
  let fac = S.facility; let key = Object.keys(S.scheduleKeys)[0];
  let draft = null;
  const redraw = makeRedraw(root, render);
  const unsub = S.db.subscribe('meta', [], () => redraw());

  function load() {
    const src = (S.schedules[fac] && S.schedules[fac][key]) || {};
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
        h('select', { onChange: (e) => { fac = e.target.value; load(); render(); } }, S.facilities.map((f) => h('option', { value: f.id, selected: f.id === fac }, f.name))),
        h('select', { onChange: (e) => { key = e.target.value; load(); render(); } }, Object.entries(S.scheduleKeys).map(([id, v]) => h('option', { value: id, selected: id === key }, v.label)))),
      h('div', { class: 'panel' }, h('div', { class: 'stack' }, inputs,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn primary', type: 'button', onClick: async () => {
          const clean = {}; for (const [a, b] of Object.entries(draft)) if (String(b).trim()) clean[a] = String(b).trim();
          const data = JSON.parse(JSON.stringify(S.schedules || {})); data[fac] = data[fac] || {}; data[fac][key] = clean;
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
  const classes = h('input', { type: 'text', value: u && u.classes || '', placeholder: 'Chỉ cho Chuyên môn. Ví dụ: PET, CLC A1E, CLC A1F' });
  modal({
    title: u ? 'Sửa tài khoản' : 'Tạo tài khoản',
    body: h('div', { class: 'stack' }, h('label', null, 'Họ tên', name), h('label', null, 'Tên đăng nhập', un), !u && h('label', null, 'Mật khẩu ban đầu', pw), h('label', null, 'Vai trò', role), h('label', null, 'Lớp phụ trách (chuyên môn)', classes)),
    actions: [{ label: 'Hủy', kind: 'ghost' }, {
      label: 'Lưu', kind: 'primary',
      onClick: async () => {
        if (!name.value.trim()) { toast('Hãy nhập họ tên', 'err'); return false; }
        try {
          if (u) await S.db.update('users', u.id, { name: name.value.trim(), role: role.value, classes: classes.value.trim() });
          else {
            const uname = normUsername(un.value);
            if (!USERNAME_RE.test(uname)) { toast('Tên đăng nhập gồm 3–30 ký tự: chữ thường, số, dấu . _ -', 'err'); return false; }
            if (pw.value.length < 6) { toast('Mật khẩu cần ít nhất 6 ký tự', 'err'); return false; }
            const stale = S.users.find((x) => x.username === uname);
            if (stale && stale.disabled) await S.db.update('users', stale.id, { username: `${uname}_cu_${Date.now().toString(36)}` });
            await S.db.createUser(uname, pw.value, { name: name.value.trim(), role: role.value, classes: classes.value.trim() });
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
            h('button', { class: 'btn ghost', type: 'button', onClick: async () => { if (await confirmDlg('Nạp lại toàn bộ mẫu việc, chuỗi việc và lịch lớp từ bảng gốc? Các chỉnh sửa mẫu bạn đã làm sẽ bị ghi đè.', { okLabel: 'Nạp lại', danger: true })) { await S.db.loadSeed(); toast('Đã nạp lại mẫu việc'); } } }, 'Nạp lại mẫu việc từ bảng gốc'),
            !isFirebase && h('button', { class: 'btn ghost danger', type: 'button', onClick: async () => { if (await confirmDlg('Xóa toàn bộ dữ liệu chạy thử và bắt đầu lại?', { okLabel: 'Xóa hết', danger: true })) S.db.resetDemo(); } }, 'Xóa dữ liệu chạy thử'))))) : null);
  }
  render();
  return () => unsub();
}
