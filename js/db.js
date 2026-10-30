import { FIREBASE_CONFIG } from './config.js';

export const isFirebase = !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey);
const FB_VER = '10.12.2';
const emailOf = (u) => `${String(u).trim().toLowerCase()}@lime.local`;
export const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
export const normUsername = (u) => String(u || '').trim().toLowerCase();

export function errMsg(e) {
  const c = (e && e.code) || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return 'Sai tên đăng nhập hoặc mật khẩu';
  if (c.includes('too-many-requests')) return 'Thử quá nhiều lần, hãy đợi vài phút rồi thử lại';
  if (c.includes('email-already-in-use')) return 'Tên đăng nhập này đã tồn tại';
  if (c.includes('weak-password')) return 'Mật khẩu cần ít nhất 6 ký tự';
  if (c.includes('permission-denied')) return 'Bạn không có quyền thực hiện thao tác này';
  if (c.includes('network')) return 'Mất kết nối mạng';
  if (c.includes('requires-recent-login')) return 'Hãy đăng xuất, đăng nhập lại rồi đổi mật khẩu';
  if (c.includes('operation-not-allowed')) return 'Chưa bật đăng nhập Email/Password trong Firebase Authentication';
  return (e && e.message) || 'Có lỗi xảy ra';
}

const seedUrl = () => new URL('../data/seed.json', import.meta.url).href;

async function writeSeed(db) {
  const seed = await (await fetch(seedUrl(), { cache: 'no-store' })).json();
  const ops = [];
  for (const t of seed.templates) ops.push({ op: 'set', col: 'templates', id: t.id, data: t });
  for (const c of seed.chains) ops.push({ op: 'set', col: 'chains', id: c.id, data: c });
  ops.push({ op: 'set', col: 'meta', id: 'schedules', data: { data: seed.schedules, keys: seed.scheduleKeys } });
  await db.batch(ops);
  await writeClasses(db);
  return seed;
}
async function writeClasses(db) {
  try {
    const cls = await (await fetch(new URL('../data/classes.json', import.meta.url).href, { cache: 'no-store' })).json();
    await db.batch(cls.map((c) => ({ op: 'set', col: 'classes', id: c.id, data: { facility: c.facility, code: c.code, teacher: c.teacher, slots: c.slots } })));
  } catch (e) { console.warn('Không nạp được thời khóa biểu mẫu', e); }
}

/* ====================== CHẾ ĐỘ CHẠY THỬ ====================== */
function demoDb() {
  const KEY = 'lime_demo_v1';
  const SESSION = 'lime_demo_session';
  const COLS = ['users', 'tasks', 'templates', 'chains', 'events', 'notifications', 'evaluations', 'reports', 'meta', 'classes', 'students', 'reviews'];
  let S = null;
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* bỏ qua */ }
  let fresh = false;
  if (!S) { S = {}; fresh = true; }
  for (const c of COLS) S[c] = S[c] || {};
  const subs = new Set();
  let current = null;
  let saveTimer = null;
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* hết dung lượng: bỏ qua */ } }, 150);
  };
  const match = (d, where) => (where || []).every(([f, op, v]) => (op === '==' ? d[f] === v : op === 'in' ? v.includes(d[f]) : true));
  const rows = (col, where) => Object.entries(S[col]).map(([id, d]) => ({ id, ...d })).filter((d) => match(d, where));
  const fire = (col) => {
    for (const s of subs) if (s.col === col) { const r = rows(col, s.where); queueMicrotask(() => s.cb(r)); }
  };
  const uid = () => 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  const db = {
    mode: 'demo',
    newId: uid,
    onError: () => {},
    async init() {
      if (fresh) {
        const mk = (username, name, role) => ({ username, name, role, disabled: false, createdAt: Date.now(), pw: '123456' });
        S.users.u_admin = mk('admin', 'Admin', 'admin');
        S.users.u_quanly = mk('quanly', 'Quản lý Hương', 'manager');
        S.users.u_cm1 = mk('cm1', 'Chuyên môn Mai', 'cm');
        S.users.u_cm2 = mk('cm2', 'Chuyên môn Ruby', 'cm');
        S.users.u_ta1 = mk('ta1', 'Trợ giảng Lan', 'ta');
        S.users.u_ta2 = mk('ta2', 'Trợ giảng Hà', 'ta');
        await writeSeed(db);
        persist();
        fresh = false;
      }
      const id = sessionStorage.getItem(SESSION);
      if (id && S.users[id] && !S.users[id].disabled) current = { id, ...S.users[id] };
      return current;
    },
    demoUsers() { return rows('users').filter((u) => !u.disabled); },
    async login(username, pw) {
      const u = rows('users').find((x) => x.username === normUsername(username));
      if (!u || u.pw !== pw) throw new Error('Sai tên đăng nhập hoặc mật khẩu');
      if (u.disabled) throw new Error('Tài khoản đã bị khóa');
      current = u; sessionStorage.setItem(SESSION, u.id); return u;
    },
    async loginAs(id) { const u = { id, ...S.users[id] }; current = u; sessionStorage.setItem(SESSION, id); return u; },
    async logout() { current = null; sessionStorage.removeItem(SESSION); },
    async firstAdmin() { throw new Error('Chế độ chạy thử đã có sẵn tài khoản'); },
    async changePassword(pw) { S.users[current.id].pw = pw; persist(); },
    async createUser(username, password, data) {
      const un = normUsername(username);
      if (rows('users').some((u) => u.username === un)) throw new Error('Tên đăng nhập này đã tồn tại');
      const id = uid();
      S.users[id] = { ...data, username: un, pw: password, disabled: false, createdAt: Date.now() };
      persist(); fire('users'); return id;
    },
    subscribe(col, where, cb) {
      const s = { col, where, cb }; subs.add(s);
      queueMicrotask(() => cb(rows(col, where)));
      return () => subs.delete(s);
    },
    async getAll(col, where) { return rows(col, where); },
    async get(col, id) { return S[col][id] ? { id, ...S[col][id] } : null; },
    async add(col, data) { const id = uid(); S[col][id] = { ...data }; persist(); fire(col); return id; },
    async set(col, id, data) { S[col][id] = { ...data }; persist(); fire(col); },
    async update(col, id, patch) { if (!S[col][id]) return; S[col][id] = { ...S[col][id], ...patch }; persist(); fire(col); },
    async remove(col, id) { delete S[col][id]; persist(); fire(col); },
    async batch(ops) {
      const touched = new Set();
      for (const o of ops) {
        touched.add(o.col);
        if (o.op === 'set') S[o.col][o.id] = { ...o.data };
        else if (o.op === 'update') { if (S[o.col][o.id]) S[o.col][o.id] = { ...S[o.col][o.id], ...o.data }; }
        else if (o.op === 'delete') delete S[o.col][o.id];
      }
      persist(); touched.forEach(fire);
    },
    async loadSeed() { return writeSeed(db); },
    async loadClasses() { return writeClasses(db); },
    async resetDemo() { try { localStorage.removeItem(KEY); sessionStorage.removeItem(SESSION); } catch (e) { /* bỏ qua */ } location.reload(); },
  };
  return db;
}

/* ====================== FIREBASE THẬT ====================== */
async function firebaseDb() {
  const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
  const [A, AU, F] = await Promise.all([
    import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js'),
  ]);
  const app = A.initializeApp(FIREBASE_CONFIG);
  const auth = AU.getAuth(app);
  const fs = F.getFirestore(app);
  let current = null;
  let errHandler = () => {};
  const d = (col, id) => F.doc(fs, col, id);

  async function loadProfile(u) {
    const snap = await F.getDoc(d('users', u.uid));
    if (!snap.exists()) { await AU.signOut(auth); throw new Error('Tài khoản chưa được cấp quyền. Hãy nhờ Quản lý tạo tài khoản trong mục Tài khoản.'); }
    const data = snap.data();
    if (data.disabled) { await AU.signOut(auth); throw new Error('Tài khoản đã bị khóa'); }
    current = { id: u.uid, ...data };
    return current;
  }

  const db = {
    mode: 'firebase',
    newId: () => F.doc(F.collection(fs, 'tasks')).id,
    onError: (fn) => { errHandler = fn; },
    init() {
      return new Promise((resolve) => {
        let first = true;
        AU.onAuthStateChanged(auth, async (u) => {
          if (!first) return;
          first = false;
          if (!u) return resolve(null);
          try { resolve(await loadProfile(u)); } catch (e) { resolve(null); }
        });
      });
    },
    async login(username, pw) {
      const cred = await AU.signInWithEmailAndPassword(auth, emailOf(username), pw);
      return loadProfile(cred.user);
    },
    async logout() { current = null; await AU.signOut(auth); },
    async firstAdmin(username, password, name) {
      const cred = await AU.createUserWithEmailAndPassword(auth, emailOf(username), password);
      await F.setDoc(d('users', cred.user.uid), { username: normUsername(username), name, role: 'admin', disabled: false, createdAt: Date.now() });
      await F.setDoc(d('meta', 'setup'), { at: Date.now(), by: cred.user.uid });
      current = { id: cred.user.uid, username: normUsername(username), name, role: 'admin' };
      await writeSeed(db);
      return current;
    },
    async changePassword(pw) { await AU.updatePassword(auth.currentUser, pw); },
    async createUser(username, password, data) {
      const un = normUsername(username);
      // dùng app phụ để không bị đăng xuất người đang thao tác
      const sec = A.initializeApp(FIREBASE_CONFIG, 'sec' + Date.now());
      try {
        const sauth = AU.getAuth(sec);
        const cred = await AU.createUserWithEmailAndPassword(sauth, emailOf(un), password);
        await F.setDoc(d('users', cred.user.uid), { ...data, username: un, disabled: false, createdAt: Date.now() });
        await AU.signOut(sauth);
        return cred.user.uid;
      } finally { await A.deleteApp(sec); }
    },
    subscribe(col, where, cb) {
      let q = F.collection(fs, col);
      if (where && where.length) q = F.query(q, ...where.map((w) => F.where(w[0], w[1], w[2])));
      return F.onSnapshot(q, (s) => cb(s.docs.map((x) => ({ id: x.id, ...x.data() }))), (e) => { console.error(col, e); errHandler(e, col); });
    },
    async getAll(col, where) {
      let q = F.collection(fs, col);
      if (where && where.length) q = F.query(q, ...where.map((w) => F.where(w[0], w[1], w[2])));
      return (await F.getDocs(q)).docs.map((x) => ({ id: x.id, ...x.data() }));
    },
    async get(col, id) { const s = await F.getDoc(d(col, id)); return s.exists() ? { id, ...s.data() } : null; },
    async add(col, data) { return (await F.addDoc(F.collection(fs, col), data)).id; },
    async set(col, id, data) { await F.setDoc(d(col, id), data); },
    async update(col, id, patch) { await F.updateDoc(d(col, id), patch); },
    async remove(col, id) { await F.deleteDoc(d(col, id)); },
    async batch(ops) {
      for (let i = 0; i < ops.length; i += 400) {
        const b = F.writeBatch(fs);
        for (const o of ops.slice(i, i + 400)) {
          const ref = d(o.col, o.id);
          if (o.op === 'set') b.set(ref, o.data);
          else if (o.op === 'update') b.update(ref, o.data);
          else if (o.op === 'delete') b.delete(ref);
        }
        await b.commit();
      }
    },
    async loadSeed() { return writeSeed(db); },
    async loadClasses() { return writeClasses(db); },
  };
  return db;
}

export async function createDb() { return isFirebase ? firebaseDb() : demoDb(); }
