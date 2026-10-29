// Tiện ích giao diện dùng chung
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  let value;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'value') value = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'readOnly') el[k] = true;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  const add = (x) => {
    if (x == null || x === false) return;
    if (Array.isArray(x)) x.forEach(add);
    else el.append(x instanceof Node ? x : document.createTextNode(String(x)));
  };
  kids.forEach(add);
  if (value !== undefined) el.value = value;
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

// Thay nội dung của một vùng, tự bỏ các phần tử rỗng (null/false/undefined)
export function mount(root, ...kids) {
  root.replaceChildren(...kids.flat(Infinity).filter((x) => x != null && x !== false));
}

export function toast(msg, kind = '') {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: 'toast ' + kind }, msg);
  box.append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

export function modal({ title, body, actions = [], wide = false }) {
  const overlay = h('div', { class: 'overlay' });
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const btns = actions.map((a) => h('button', {
    class: 'btn ' + (a.kind || ''),
    type: 'button',
    onClick: async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { const r = a.onClick ? await a.onClick({ close }) : undefined; if (r !== false && !a.keepOpen) close(); }
      catch (err) { toast(err.message || String(err), 'err'); }
      finally { b.disabled = false; }
    },
  }, a.label));
  const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'modal-head' }, h('h3', null, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Đóng', onClick: close }, '×')),
    h('div', { class: 'modal-body' }, body),
    btns.length ? h('div', { class: 'modal-foot' }, btns) : null);
  overlay.append(box);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  const first = box.querySelector('input,textarea,select');
  if (first) setTimeout(() => first.focus(), 30);
  return { close, el: box };
}

export function confirmDlg(text, { okLabel = 'Đồng ý', danger = false, title = 'Xác nhận' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title, body: h('p', null, text),
      actions: [
        { label: 'Hủy', kind: 'ghost', onClick: () => { done = true; resolve(false); } },
        { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: () => { done = true; resolve(true); } },
      ],
    });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el) && !done) { done = true; resolve(false); obs.disconnect(); } });
    obs.observe(document.body, { childList: true });
  });
}

// Vẽ lại an toàn: nếu người dùng đang gõ trong ô nhập thì đợi họ gõ xong
export function makeRedraw(root, fn) {
  let pending = false;
  let timer = null;
  const run = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const a = document.activeElement;
      if (a && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'radio') { pending = true; return; }
      pending = false; fn();
    }, 30);
  };
  root.addEventListener('focusout', () => { if (pending) setTimeout(run, 80); });
  return run;
}

export const fmtDM = (s) => `${s.slice(8)}/${s.slice(5, 7)}`;
export const fmtDMY = (s) => `${s.slice(8)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
export const initials = (name) => (name || '?').trim().split(/\s+/).slice(-1)[0].slice(0, 1).toUpperCase();
export const uniq = (a) => [...new Set(a)];
export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export function sortBy(arr, ...keys) {
  return [...arr].sort((a, b) => {
    for (const k of keys) {
      const x = typeof k === 'function' ? k(a) : a[k]; const y = typeof k === 'function' ? k(b) : b[k];
      if (x < y) return -1; if (x > y) return 1;
    }
    return 0;
  });
}
