import { LINKS, LINK_GROUPS, linkUrl } from './links.js';
import { createDb, errMsg, isFirebase, USERNAME_RE, normUsername } from './db.js';
import { S, ROLE_LABEL, isCM, facName } from './core.js';
import { h, mount, toast, modal, sortBy, fmtDM } from './ui.js';
import { todayStr, monthOf, addMonths } from './rules.js';
import { viewToday } from './view-today.js';
import { viewMonth } from './view-month.js';
import { viewReview } from './view-review.js';
import { viewChains } from './view-chains.js';
import { viewStats } from './view-stats.js';
import { viewStudents } from './view-students.js';
import { viewTemplates, viewSchedules, viewUsers, generateFor } from './view-admin.js';

const root = document.getElementById('app');
let cleanup = null;
let globalUnsubs = [];
let loaded = { templates: false, meta: false };
let genRunning = false;
let reviewCount = 0;
let seenNotif = null;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } },
};

/* ---------------- Đăng nhập ---------------- */
function showLogin(msg) {
  stopAll();
  const err = h('div', { class: 'form-err', role: 'alert' }, msg || '');
  const un = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'none', placeholder: 'Tên đăng nhập', required: true });
  const pw = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Mật khẩu', required: true });
  const form = h('form', { class: 'login-form', onSubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    try { start(await S.db.login(un.value, pw.value)); } catch (er) { err.textContent = errMsg(er); btn.disabled = false; }
  } }, h('label', null, 'Tên đăng nhập', un), h('label', null, 'Mật khẩu', pw), err, h('button', { class: 'btn primary block', type: 'submit' }, 'Đăng nhập'));

  const demo = !isFirebase ? h('div', { class: 'demo-box' },
    h('b', null, 'Chế độ chạy thử'), h('p', null, 'Chưa kết nối Firebase nên dữ liệu chỉ nằm trong trình duyệt này. Chọn nhanh một vai trò để xem thử (mật khẩu 123456):'),
    h('div', { class: 'chips-row' }, S.db.demoUsers().map((u) => h('button', { class: 'chip-btn', type: 'button', onClick: async () => { start(await S.db.loginAs(u.id)); } }, h('b', null, u.name), h('span', null, ROLE_LABEL[u.role]))))) : null;

  const first = isFirebase ? h('details', { class: 'first-run' }, h('summary', null, 'Lần đầu sử dụng? Tạo tài khoản Admin'),
    (() => {
      const n = h('input', { type: 'text', placeholder: 'Họ tên Admin' }); const u = h('input', { type: 'text', placeholder: 'Tên đăng nhập (chữ thường, số)', autocapitalize: 'none' }); const p = h('input', { type: 'password', placeholder: 'Mật khẩu (ít nhất 6 ký tự)' });
      const e2 = h('div', { class: 'form-err' });
      return h('div', { class: 'stack' }, n, u, p, e2, h('button', { class: 'btn', type: 'button', onClick: async (ev) => {
        e2.textContent = '';
        const uname = normUsername(u.value);
        if (!n.value.trim() || !USERNAME_RE.test(uname) || p.value.length < 6) { e2.textContent = 'Nhập đủ họ tên, tên đăng nhập (3–30 ký tự chữ thường/số) và mật khẩu từ 6 ký tự'; return; }
        ev.currentTarget.disabled = true;
        try { start(await S.db.firstAdmin(uname, p.value, n.value.trim())); }
        catch (er) { e2.textContent = (er.code || '').includes('permission') ? 'Hệ thống đã có Admin. Hãy đăng nhập bằng tài khoản được cấp.' : errMsg(er); ev.currentTarget.disabled = false; }
      } }, 'Tạo Admin và nạp mẫu việc'));
    })()) : null;

  root.replaceChildren(h('main', { class: 'login' },
    h('div', { class: 'login-card' }, h('div', { class: 'brand big' }, h('span', { class: 'logo' }, 'L'), h('div', null, h('h1', null, 'LIME Checklist'), h('p', null, 'Quản lý công tác đội Trợ giảng và Chuyên môn'))),
      form, demo, first)));
  setTimeout(() => un.focus(), 50);
}

/* ---------------- Khởi động sau đăng nhập ---------------- */
function stopAll() {
  if (cleanup) { cleanup(); cleanup = null; }
  globalUnsubs.forEach((u) => u()); globalUnsubs = [];
  loaded = { templates: false, meta: false }; seenNotif = null; reviewCount = 0;
}

function start(user) {
  stopAll();
  S.user = user;
  const f = store.get('lime_fac');
  if (f && S.facilities.some((x) => x.id === f)) S.facility = f;
  S.navigate = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
  const sub = (col, where, cb) => globalUnsubs.push(S.db.subscribe(col, where, cb));
  sub('users', [], (r) => { S.users = r; });
  sub('templates', [], (r) => { S.templates = sortBy(r, 'order'); loaded.templates = true; autoGen(); });
  sub('chains', [], (r) => { S.chains = sortBy(r, 'id'); });
  sub('classes', [], (r) => { S.classes = r; });
  sub('meta', [], (r) => {
    const sch = r.find((x) => x.id === 'schedules');
    S.schedules = sch ? sch.data || {} : {}; S.scheduleKeys = sch ? sch.keys || {} : {};
    S.gen = new Set(r.filter((x) => x.id.startsWith('gen_')).map((x) => x.id));
    loaded.meta = true; autoGen();
  });
  sub('notifications', [['toUid', '==', user.id]], (r) => {
    const sorted = sortBy(r, (n) => -(n.createdAt || 0));
    if (seenNotif) for (const n of sorted) if (!seenNotif.has(n.id) && !n.read) toast('🔔 ' + n.text);
    seenNotif = new Set(sorted.map((n) => n.id));
    S.notifications = sorted; drawBell();
  });
  if (isCM()) sub('tasks', [['status', '==', 'review']], (r) => { reviewCount = r.length; drawNav(); });
  renderShell();
  route();
}

async function autoGen() {
  if (genRunning || !loaded.templates || !loaded.meta || !S.templates.length || !S.user) return;
  const today = todayStr(); const ym = monthOf(today);
  const todo = [ym];
  if (Number(today.slice(8)) >= 25) todo.push(addMonths(ym, 1));
  for (const m of todo) {
    if (S.gen && S.gen.has('gen_' + m)) continue;
    genRunning = true;
    try {
      const n = await generateFor(m, S.facilities.map((f) => f.id));
      await S.db.set('meta', 'gen_' + m, { at: Date.now(), by: S.user.id, count: n });
      if (n) toast(`Đã tự tạo checklist tháng ${m.slice(5)}/${m.slice(0, 4)} (${n} việc)`);
    } catch (e) { console.error('Tự tạo checklist lỗi', e); }
    genRunning = false;
  }
}

/* ---------------- Khung giao diện ---------------- */
const NAV = [
  ['today', 'Hôm nay', () => true], ['month', 'Checklist tháng', () => true], ['review', 'Chờ duyệt', isCM],
  ['students', 'Học sinh', () => true], ['chains', 'Chuỗi việc & sự kiện', () => true], ['stats', 'Thống kê', isCM], ['templates', 'Mẫu việc', isCM],
  ['schedules', 'Lịch lớp', isCM], ['users', 'Tài khoản', isCM],
];
function linksModal() {
  const q = h('input', { type: 'search', placeholder: 'Tìm liên kết…', class: 'search' });
  const box = h('div', { class: 'stack' });
  const draw = () => {
    const k = q.value.trim().toLowerCase();
    box.replaceChildren(...LINK_GROUPS.map(([g, name]) => {
      const items = LINKS.filter((l) => l.g === g && linkUrl(l, S.facility) && (!k || l.label.toLowerCase().includes(k)));
      return items.length ? h('section', null, h('h4', null, name), h('div', { class: 'linklist' }, items.map((l) => h('a', { href: linkUrl(l, S.facility), target: '_blank', rel: 'noopener' }, l.label)))) : null;
    }).filter(Boolean));
  };
  q.addEventListener('input', draw); draw();
  modal({ title: `Liên kết nhanh · ${facName(S.facility)}`, wide: true, body: h('div', { class: 'stack' }, q, box), actions: [{ label: 'Đóng', kind: 'primary' }] });
}
const VIEWS = { today: viewToday, month: viewMonth, review: viewReview, students: viewStudents, chains: viewChains, stats: viewStats, templates: viewTemplates, schedules: viewSchedules, users: viewUsers };

let navEl; let bellEl; let main;

function renderShell() {
  navEl = h('nav', { class: 'nav', 'aria-label': 'Menu chính' });
  bellEl = h('div', { class: 'bell-wrap' });
  main = h('main', { id: 'view', class: 'view' });
  const facSeg = h('div', { class: 'seg fac', role: 'group', 'aria-label': 'Cơ sở đang làm việc' }, S.facilities.map((f) =>
    h('button', { class: 'seg-b' + (S.facility === f.id ? ' on' : ''), type: 'button', onClick: () => { S.facility = f.id; store.set('lime_fac', f.id); renderShell(); route(); } }, f.name)));
  const demoSel = !isFirebase ? h('select', { class: 'role-switch', 'aria-label': 'Đổi vai trò (chạy thử)', onChange: async (e) => { await S.db.loginAs(e.target.value); location.reload(); } },
    S.db.demoUsers().map((u) => h('option', { value: u.id, selected: u.id === S.user.id }, `${ROLE_LABEL[u.role]}: ${u.name}`))) : null;
  const userBtn = h('button', { class: 'user-btn', type: 'button', onClick: userMenu }, h('span', { class: 'avatar' }, (S.user.name || '?').trim().slice(0, 1).toUpperCase()), h('span', { class: 'uname' }, S.user.name, h('small', null, ROLE_LABEL[S.user.role])));
  mount(root,
    h('header', { class: 'topbar' }, h('a', { class: 'brand', href: '#/today' }, h('span', { class: 'logo' }, 'L'), h('span', { class: 'bname' }, 'LIME Checklist')),
      facSeg, h('div', { class: 'spacer' }), h('button', { class: 'btn ghost sm', type: 'button', onClick: linksModal }, '🔗 Liên kết'), demoSel, bellEl, userBtn),
    navEl, !isFirebase ? h('div', { class: 'demo-strip' }, 'Chế độ chạy thử: dữ liệu chỉ lưu trong trình duyệt này. Kết nối Firebase để dùng chung giữa nhiều người.') : null, main);
  drawNav(); drawBell();
}

function curRoute() {
  const hash = location.hash.replace(/^#\/?/, '') || 'today';
  const [name, qs] = hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { name, params };
}

function drawNav() {
  if (!navEl) return;
  const { name } = curRoute();
  navEl.replaceChildren(...NAV.filter(([, , ok]) => ok()).map(([id, label]) =>
    h('a', { href: '#/' + id, class: 'nav-a' + (name === id ? ' on' : '') }, label, id === 'review' && reviewCount ? h('span', { class: 'badge' }, reviewCount) : null)));
}

function drawBell() {
  if (!bellEl) return;
  const unread = S.notifications.filter((n) => !n.read);
  const btn = h('button', { class: 'bell', type: 'button', 'aria-label': `Thông báo, ${unread.length} chưa đọc`, onClick: (e) => { e.stopPropagation(); togglePanel(); } },
    h('svg', { viewBox: '0 0 24 24', width: 22, height: 22, 'aria-hidden': 'true' }, h('path', { d: 'M12 3a6 6 0 0 0-6 6v3.6L4.3 16.5a1 1 0 0 0 .9 1.5h13.6a1 1 0 0 0 .9-1.5L18 12.6V9a6 6 0 0 0-6-6Zm0 19a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 22Z', fill: 'currentColor' })),
    unread.length ? h('span', { class: 'badge' }, unread.length > 99 ? '99+' : unread.length) : null);
  bellEl.replaceChildren(btn);
}

function togglePanel() {
  const old = document.getElementById('bell-panel');
  if (old) { old.remove(); return; }
  const list = S.notifications.slice(0, 30);
  const panel = h('div', { id: 'bell-panel', class: 'bell-panel', role: 'dialog', 'aria-label': 'Thông báo' },
    h('div', { class: 'bp-head' }, h('b', null, 'Thông báo'),
      h('button', { class: 'btn ghost sm', type: 'button', onClick: async () => { await S.db.batch(S.notifications.filter((n) => !n.read).map((n) => ({ op: 'update', col: 'notifications', id: n.id, data: { read: true } }))); panel.remove(); } }, 'Đánh dấu đã đọc hết')),
    list.length ? list.map((n) => h('button', { class: 'bp-item' + (n.read ? '' : ' unread'), type: 'button', onClick: async () => {
      if (!n.read) await S.db.update('notifications', n.id, { read: true });
      panel.remove(); if (n.link) S.navigate(n.link);
    } }, h('span', null, n.text), h('small', null, new Date(n.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })))) : h('p', { class: 'empty' }, 'Chưa có thông báo.'));
  bellEl.append(panel);
  setTimeout(() => document.addEventListener('click', function close(e) { if (!panel.contains(e.target)) { panel.remove(); document.removeEventListener('click', close); } }), 0);
}

function userMenu() {
  const a = h('input', { type: 'password', placeholder: 'Mật khẩu mới (ít nhất 6 ký tự)', autocomplete: 'new-password' });
  modal({
    title: S.user.name,
    body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, `${ROLE_LABEL[S.user.role]} · ${S.user.username}`), h('label', null, 'Đổi mật khẩu', a)),
    actions: [
      { label: 'Đăng xuất', kind: 'ghost danger', onClick: async () => { await S.db.logout(); S.user = null; showLogin(); } },
      { label: 'Đổi mật khẩu', kind: 'primary', onClick: async () => {
        if (a.value.length < 6) { toast('Mật khẩu cần ít nhất 6 ký tự', 'err'); return false; }
        try { await S.db.changePassword(a.value); toast('Đã đổi mật khẩu'); } catch (e) { toast(errMsg(e), 'err'); return false; }
      } },
    ],
  });
}

/* ---------------- Điều hướng ---------------- */
function route() {
  if (!S.user || !main) return;
  const { name, params } = curRoute();
  const def = NAV.find(([id]) => id === name);
  if (!def || !def[2]()) { location.hash = '#/today'; return; }
  if (params.fac && S.facilities.some((f) => f.id === params.fac) && params.fac !== S.facility) {
    S.facility = params.fac; store.set('lime_fac', params.fac); renderShell();
  }
  if (cleanup) { cleanup(); cleanup = null; }
  drawNav();
  const holder = h('div');
  main.replaceChildren(holder);
  try { cleanup = VIEWS[name](holder, params); } catch (e) { console.error(e); holder.append(h('div', { class: 'banner bad' }, 'Không mở được màn hình này: ' + e.message)); }
  window.scrollTo(0, 0);
  const t = main.querySelector('h2'); if (t) document.title = `${t.textContent} · LIME Checklist`;
}
window.addEventListener('hashchange', route);

/* ---------------- Khởi chạy ---------------- */
(async function boot() {
  root.replaceChildren(h('div', { class: 'boot' }, 'Đang tải…'));
  try {
    S.db = await createDb();
    S.db.onError((e) => { console.error(e); toast(errMsg(e), 'err'); });
    const user = await S.db.init();
    if (user) start(user); else showLogin();
  } catch (e) {
    console.error(e);
    root.replaceChildren(h('div', { class: 'boot err' }, h('h2', null, 'Không kết nối được'), h('p', null, errMsg(e)),
      h('p', { class: 'muted' }, 'Kiểm tra lại cấu hình Firebase trong js/config.js và kết nối mạng.')));
  }
}());
