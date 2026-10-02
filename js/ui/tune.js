// Fine-tune: real marks, chapter length, your answer, pin and drop.

import { h, marks, whole, pct } from './dom.js';
import { picture, pinPrice } from '../model.js';
import { KNOW_ORDER, masteryNow, KNOW } from '../engine.js';
import { newId } from '../store.js';
import { KNOW_LABEL } from './setup.js';

export function tune(app) {
  const exam = app.exam();
  if (!exam) { app.go(''); return null; }

  const summary = h('p', { class: 'summary-line', role: 'status' });
  const list = h('div', { class: 'tune-list' });

  function paintSummary() {
    const pic = picture(app.exam(), app.now());
    summary.textContent = `Forecast with this plan: about ${whole(pic.p.after)} of ${whole(pic.p.total)}.`;
    for (const el of list.querySelectorAll('[data-price]')) {
      const c = app.exam().chapters.find((x) => x.id === el.dataset.price);
      el.textContent = c && c.pin > 0 ? `This pin costs about ${marks(pinPrice(app.exam(), app.now(), c.id))} marks of forecast.` : '';
    }
  }
  const change = (fn) => { app.update(fn, false); paintSummary(); };

  function paintList() {
    const e = app.exam();
    list.replaceChildren(...e.chapters.map((c, i) => {
      const live = typeof c.m === 'number' && Math.abs(c.m - (KNOW[c.know] ?? -1)) > 0.01;
      const edit = (fn) => change((x) => fn(x.chapters.find((y) => y.id === c.id)));
      return h('fieldset', { class: 'tune-card' + (c.drop ? ' dropped' : '') },
        h('legend', { class: 'sr' }, `Chapter ${i + 1}: ${c.name}`),
        h('input', { class: 'tune-name', type: 'text', value: c.name, maxlength: 80, 'aria-label': 'Chapter name',
          onchange: (ev) => edit((y) => { y.name = ev.target.value.trim() || y.name; }) }),
        h('div', { class: 'tune-grid' },
          h('label', null, h('span', null, 'Marks'), h('input', { type: 'number', inputmode: 'decimal', min: 0, max: 500, step: 'any', value: c.marks ?? '', placeholder: 'equal',
            onchange: (ev) => edit((y) => { const v = parseFloat(ev.target.value); if (v > 0) y.marks = Math.min(500, v); else delete y.marks; }) })),
          h('label', null, h('span', null, 'Length'), h('select', { onchange: (ev) => edit((y) => { y.size = ev.target.value; delete y.tau; }) },
            [['S', 'Short'], ['M', 'Medium'], ['L', 'Long']].map(([v, t]) => h('option', { value: v, selected: c.size === v }, t)))),
          h('label', null, h('span', null, 'Right now'), h('select', { onchange: (ev) => { edit((y) => { y.know = ev.target.value; delete y.m; delete y.tau; }); paintList(); } },
            KNOW_ORDER.map((k) => h('option', { value: k, selected: c.know === k }, KNOW_LABEL[k]))))),
        live ? h('p', { class: 'fine' }, `After your closed-book checks: about ${pct(masteryNow(c))}.`) : null,
        h('div', { class: 'tune-flags' },
          h('span', { class: 'stepper' },
            h('span', { class: 'stepper-label' }, 'Pin'),
            h('button', { class: 'btn small', type: 'button', disabled: !c.pin, 'aria-label': `One pinned block less on ${c.name}`, onclick: () => { edit((y) => { y.pin = Math.max(0, (y.pin || 0) - 1); }); paintList(); } }, '−'),
            h('output', { class: 'stepper-value' }, c.pin ? `${c.pin} × 25 min` : 'none'),
            h('button', { class: 'btn small', type: 'button', disabled: c.drop, 'aria-label': `One pinned block more on ${c.name}`, onclick: () => { edit((y) => { y.pin = Math.min(12, (y.pin || 0) + 1); }); paintList(); } }, '+')),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: c.drop, onchange: (ev) => { edit((y) => { y.drop = ev.target.checked; if (y.drop) y.pin = 0; }); paintList(); } }), ' Drop: not in my exam'),
          e.chapters.length > 1 ? h('button', { class: 'link', type: 'button', onclick: () => { change((x) => { x.chapters = x.chapters.filter((y) => y.id !== c.id); if (x.current?.chapterId === c.id) x.current = null; }); paintList(); } }, 'Delete') : null),
        h('p', { class: 'fine price', 'data-price': c.id }));
    }),
    h('button', { class: 'btn', type: 'button', onclick: () => { change((x) => { x.chapters.push({ id: newId(), name: `Chapter ${x.chapters.length + 1}`, size: 'M', know: 'bits', pin: 0, drop: false, minutes: 0 }); }); paintList(); } }, '+ Add a chapter'));
    paintSummary();
  }
  paintList();

  return h('section', { class: 'screen tune' },
    h('h1', null, 'Fine-tune'),
    h('p', { class: 'lead' }, 'Set real marks and lengths if you know them. Pin a chapter your teacher said is coming. Drop one that is not in your exam.'),
    summary, list,
    h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/plan' }, 'Back to the plan')));
}
