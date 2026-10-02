// After the exam: the catch-up list, and the forecast against real marks.

import { h, marks, whole, pct, copyText } from './dom.js';
import { fillMarks, masteryNow, CEIL } from '../engine.js';
import { fmtDay, fmtTime } from '../time.js';
import { newDraft } from './setup.js';

const DAY = 24 * 60 * 60 * 1000;

/** Chapters that ended below "Most", biggest gap in marks first, one per day after the exam. */
export function catchUp(exam, from) {
  const chapters = fillMarks(exam.chapters, exam.total).filter((c) => !c.drop && masteryNow(c) < 0.6);
  chapters.sort((a, b) => b.marks * (CEIL - masteryNow(b)) - a.marks * (CEIL - masteryNow(a)));
  return chapters.map((c, i) => ({ id: c.id, name: c.name, marks: c.marks, m: masteryNow(c), date: new Date(from.getTime() + (i + 1) * DAY) }));
}

const forecastOf = (exam) => (typeof exam.forecast === 'number' ? exam.forecast
  : fillMarks(exam.chapters, exam.total).reduce((a, c) => a + c.marks * masteryNow(c), 0));
const totalOf = (exam) => fillMarks(exam.chapters, exam.total).reduce((a, c) => a + c.marks, 0);

export function after(app) {
  const exam = app.exam();
  if (!exam) { app.go(''); return null; }
  const now = app.now(exam);
  const examAt = exam.at ? new Date(exam.at) : now;
  const passed = now >= examAt;
  const list = catchUp(exam, passed ? now : examAt);
  const forecast = forecastOf(exam), total = totalOf(exam);

  const copied = h('span', { class: 'fine', role: 'status' });
  const asText = () => `Catch-up list: ${exam.name}\n` + list.map((c) => `${fmtDay(c.date)} - ${c.name} (${marks(c.marks)} marks)`).join('\n');

  // Forecast against real marks, across every exam that has a result.
  const history = app.state.exams.filter((e) => e.result).map((e) => ({ name: e.name, forecast: forecastOf(e), real: e.result.marks, total: totalOf(e) }));
  const ratios = history.filter((x) => x.forecast > 0).map((x) => x.real / x.forecast).sort((a, b) => a - b);
  const typical = ratios.length >= 2 ? ratios[Math.floor(ratios.length / 2)] : null;

  const input = h('input', { type: 'number', inputmode: 'decimal', min: 0, max: Math.ceil(total), step: 'any', value: exam.result ? exam.result.marks : '', 'aria-label': `Your real marks out of ${whole(total)}` });
  const saveResult = () => {
    const v = parseFloat(input.value);
    if (!(v >= 0)) return;
    app.update((e) => { e.result = { marks: Math.min(v, total) }; e.forecast = forecast; e.done = true; });
  };

  let verdict = null;
  if (exam.result) {
    const diff = exam.result.marks - Math.round(forecast);
    verdict = h('p', { class: 'big' }, `Forecast: about ${whole(forecast)}. Real: ${marks(exam.result.marks)}. `,
      Math.abs(diff) < 0.5 ? 'Triage was right on it.' : `Triage was ${marks(Math.abs(diff))} ${diff > 0 ? 'too low' : 'too high'}.`);
  }

  return h('section', { class: 'screen after' },
    h('p', { class: 'kicker' }, passed ? `${fmtDay(examAt, now)}, ${fmtTime(examAt)}` : 'Marked as over'),
    h('h1', null, `${exam.name}: after the exam`),

    h('h2', null, 'Catch-up list'),
    list.length
      ? h('div', null,
        h('p', null, 'These are the chapters you left or only half knew. One a day, biggest gap first, so tonight\'s skip does not become a hole later.'),
        h('ol', { class: 'rows' }, list.map((c) => h('li', { class: 'row' },
          h('div', { class: 'row-main' }, h('span', { class: 'row-name' }, c.name), h('span', { class: 'row-gain muted' }, fmtDay(c.date, now))),
          h('p', { class: 'row-sub' }, `${marks(c.marks)} marks · you were at about ${pct(c.m)}`)))),
        h('p', null, h('button', { class: 'btn small', onclick: async () => { copied.textContent = (await copyText(asText())) ? ' Copied.' : ' Could not copy.'; } }, 'Copy the list'), copied))
      : h('p', null, 'Nothing to catch up on. Every chapter ended at "Most" or better.'),

    h('h2', null, 'Forecast against reality'),
    h('p', null, `When you studied your last block, Triage expected about ${whole(forecast)} of ${whole(total)}. Enter your real marks when you get them.`),
    h('div', { class: 'pair' }, input, h('button', { class: 'btn', onclick: saveResult }, 'Save')),
    verdict,
    typical ? h('p', null, `Across ${history.length} exams, your real marks were typically ${Math.round(typical * 100)}% of the forecast. `,
      typical < 0.95 ? 'You tend to rate yourself a little kindly.' : typical > 1.05 ? 'You tend to underrate yourself.' : 'Your answers are well calibrated.') : null,
    history.length > 1 ? h('table', { class: 'history' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Exam'), h('th', { scope: 'col' }, 'Forecast'), h('th', { scope: 'col' }, 'Real'), h('th', { scope: 'col' }, 'Out of'))),
      h('tbody', null, history.map((x) => h('tr', null, h('td', null, x.name), h('td', null, whole(x.forecast)), h('td', null, marks(x.real)), h('td', null, whole(x.total)))))) : null,

    h('div', { class: 'actions' },
      h('button', { class: 'btn primary', onclick: () => { app.draft = newDraft(); app.go('setup/1'); } }, 'Plan the next exam'),
      h('a', { class: 'btn quiet', href: '#/exams' }, 'All exams'),
      !passed && exam.done ? h('button', { class: 'btn quiet', onclick: () => { app.update((e) => { e.done = false; }, false); app.go('plan'); } }, 'Not over yet: reopen') : null));
}
