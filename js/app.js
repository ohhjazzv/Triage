// Wiring: saved state, the address bar, and which screen is showing.

import { load, save, cleanExam, decodeShare } from './store.js';
import { h } from './ui/dom.js';
import { home } from './ui/home.js';
import { setup, timeScreen } from './ui/setup.js';
import { planScreen } from './ui/plan.js';
import { study } from './ui/study.js';
import { beat } from './ui/beat.js';
import { tune } from './ui/tune.js';
import { sure } from './ui/sure.js';
import { after } from './ui/after.js';
import { exams } from './ui/exams.js';
import { share } from './ui/share.js';

// Some browsers block storage (strict private modes). Triage then keeps everything in memory for this tab.
function openStorage() {
  try { const s = window.localStorage; s.getItem('triage-v1'); return { storage: s, kept: true }; }
  catch {
    const mem = new Map();
    return { kept: false, storage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); } } };
  }
}
const { storage, kept } = openStorage();

const main = document.getElementById('main');
const live = document.getElementById('live');
let leaving = [];          // things to stop when the screen changes (timers)

const app = {
  state: load(storage),
  draft: null,             // an exam being set up, not saved yet
  shared: null,            // an exam that arrived by class link, waiting for a yes

  /** The time, as this exam sees it. (The sample exam runs on its own clock.) */
  now(exam = app.exam()) { return new Date(Date.now() + (exam?.clockOffset || 0)); },
  exam() { return app.state.exams.find((e) => e.id === app.state.active) || null; },
  save() { if (!save(storage, app.state)) app.say('Could not save. Your browser storage may be full or blocked.'); },

  /** Change the active exam, save, and redraw. */
  update(fn, redraw = true) { const e = app.exam(); if (!e) return; fn(e); app.save(); if (redraw) app.render(); },

  addExam(raw, makeActive = true) {
    const e = cleanExam(raw);
    if (!e) return null;
    app.state.exams.unshift(e);
    if (makeActive) app.state.active = e.id;
    app.save();
    return e;
  },

  go(route) {
    const target = '#/' + route;
    if (location.hash === target) app.render(); else location.hash = target;
  },

  onLeave(fn) { leaving.push(fn); },
  say(text) { live.textContent = ''; setTimeout(() => { live.textContent = text; }, 30); },
  render,
};

const ROUTES = Object.assign(Object.create(null), {
  '': home, setup, time: timeScreen, plan: planScreen, study, beat, tune, sure, after, exams, share,
});

function render() {
  for (const fn of leaving) { try { fn(); } catch { /* a timer that is already gone */ } }
  leaving = [];

  // A class link looks like  #x=....  It stays in the address bar, so it still works after a refresh.
  const hash = location.hash || '';
  const viaLink = hash.startsWith('#x=');
  if (viaLink) app.shared = decodeShare(hash.slice(3));

  const [name = '', arg] = viaLink ? ['shared'] : hash.replace(/^#\/?/, '').split('/');
  let view = ROUTES[name];
  if (name === 'shared') view = (a) => exams(a, { shared: true });
  if (!view) view = home;

  let el;
  try { el = view(app, arg); }
  catch (err) {
    console.error(err);
    el = h('section', { class: 'screen' },
      h('h1', null, 'Something went wrong on this screen.'),
      h('p', null, 'Your saved exams are safe. Go back to the start and try again.'),
      h('p', null, h('a', { class: 'btn', href: '#/exams' }, 'My exams')));
  }
  if (!el) return;                       // the view sent us somewhere else
  // If the keyboard was in use, keep it somewhere sensible: on the new screen's heading.
  const hadFocus = !!document.activeElement && document.activeElement !== document.body;
  main.replaceChildren(el);
  document.body.dataset.route = name || 'home';
  window.scrollTo(0, 0);
  const h1 = el.querySelector('h1');
  if (h1 && hadFocus) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
  document.title = (h1 ? h1.textContent + ' · ' : '') + 'Triage';
}

// ----- theme -----
function applyTheme() {
  const t = app.state.settings.theme;
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
document.getElementById('theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  app.state.settings.theme = dark ? 'light' : 'dark';
  app.save(); applyTheme();
});
applyTheme();

window.addEventListener('hashchange', render);
// If another tab changes the saved data, pick it up.
window.addEventListener('storage', (e) => { if (e.key === 'triage-v1') { app.state = load(storage); render(); } });
if (!kept) document.getElementById('save-note').hidden = false;

// "Skip to content" moves the keyboard to the screen. (Left alone, its #main would look like an address to the router.)
document.querySelector('.skip')?.addEventListener('click', (e) => { e.preventDefault(); main.focus(); });

// The sample exam runs on its own clock. Once that clock passes its exam, the sample has had its day:
// clear it, so a returning visitor gets the start page and not "after the exam" for a test they never sat.
{
  const stale = app.state.exams.filter((e) => e.sample && e.at && app.now(e) >= new Date(e.at));
  if (stale.length) {
    app.state.exams = app.state.exams.filter((e) => !stale.includes(e));
    if (!app.exam()) app.state.active = app.state.exams[0]?.id ?? null;
    app.save();
  }
}
// Opening Triage with an exam already saved goes straight to its plan. The logo always leads to the start page.
if (!location.hash && app.exam()) { try { history.replaceState(null, '', location.pathname + location.search + '#/plan'); } catch { /* some embedded views do not allow it; the start page is fine */ } }
render();

// Works offline after the first visit.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is a bonus */ }); });
}
