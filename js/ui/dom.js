// Tiny helpers for building the screens. No framework.

/**
 * h('button', { class: 'btn', onclick: fn }, 'Start')
 * Attributes starting with "on" become event listeners. null and false children are skipped.
 */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'vars') for (const [name, val] of Object.entries(v)) el.style.setProperty(name, val);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'open') el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  add(el, kids);
  return el;
}

function add(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

/** 2.5 -> "2.5", 3.04 -> "3", 0.04 -> "0" */
export function marks(x, digits = 1) {
  const v = Math.round(x * 10 ** digits) / 10 ** digits;
  return String(Object.is(v, -0) ? 0 : v);
}

/** A gain in marks, always with one decimal: "1.0", "2.5". */
export const gain = (x) => (Math.round(x * 10) / 10).toFixed(1);

/** Whole marks for forecasts: "about 29". */
export const whole = (x) => String(Math.round(x));

/** "27–31", or just "29" when both ends round to the same number. */
export function span(low, high) {
  const a = Math.round(low), b = Math.round(high);
  return a === b ? String(a) : `${a}–${b}`;
}

export const pct = (m) => Math.round(m * 100) + '%';

export const plural = (n, word, many) => `${n} ${n === 1 ? word : (many || word + 's')}`;

/** A labelled field: <label><span>Label</span><input></label> */
export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'field-hint' }, hint) : null);
}

/** Copy text. Falls back to a visible box the student can select by hand. */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const ta = h('textarea', { class: 'sr', readonly: true }); ta.value = text;
    document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    return ok;
  } catch { return false; }
}
