// Tiny DOM helpers. Text is always inserted as text nodes, never as HTML,
// so user data cannot inject markup.

const FORBIDDEN_ATTRS = new Set(['style', 'innerhtml', 'outerhtml', 'srcdoc']);

/**
 * h("button", { class: "btn", on: { click: fn }, "aria-label": "x" }, "Label", otherNode)
 * Children may be strings, numbers, nodes, arrays (flattened) or null/false (skipped).
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    const lower = key.toLowerCase();
    if (lower.startsWith('on') && key !== 'on') throw new Error(`attribute ${key} is not allowed`);
    if (FORBIDDEN_ATTRS.has(lower)) throw new Error(`attribute ${key} is not allowed`);
    if (key === 'class') el.className = value;
    else if (key === 'on') for (const [ev, fn] of Object.entries(value)) el.addEventListener(ev, fn);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

let idCounter = 0;
export const nextId = (prefix = 'id') => `${prefix}-${++idCounter}`;

/** Labelled form control: returns { field, input }. */
export function field(label, input, hint = null) {
  if (!input.id) input.id = nextId('f');
  const hintEl = hint ? h('p', { class: 'hint', id: `${input.id}-hint` }, hint) : null;
  if (hintEl) input.setAttribute('aria-describedby', hintEl.id);
  const field = h('div', { class: 'field' }, h('label', { for: input.id }, label), input, hintEl);
  return { field, input };
}

let toastTimer;
/** Short message in an aria-live region (#toast stays in the DOM; CSS hides it when empty). */
export function toast(message, { error = false } = {}) {
  const region = document.getElementById('toast');
  if (!region) return;
  window.clearTimeout(toastTimer);
  region.textContent = '';
  region.classList.toggle('error', error);
  // Setting the text after a short delay makes screen readers announce repeated messages.
  window.setTimeout(() => {
    region.textContent = message;
  }, 30);
  toastTimer = window.setTimeout(() => {
    region.textContent = '';
  }, error ? 7000 : 4000);
}

/** Copies text to the clipboard. Returns true on success. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Offers a text file as download. */
export function downloadText(filename, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const link = h('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Hostname of a URL for display ("www." removed); '' if it cannot be parsed. */
export function displayHost(href) {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
