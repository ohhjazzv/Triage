// The plan: the Marks Map, three forecasts, what to study in order, and what to leave.

import { h, marks, gain, whole, span, pct, plural, copyText } from './dom.js';
import { marksMap } from './map.js';
import { after } from './after.js';
import { picture } from '../model.js';
import { fmtTime, fmtDur, fmtDay, fmtUntil, dayOf } from '../time.js';
import { biologySample } from '../samples.js';
import { BLOCK } from '../engine.js';

const stretchText = (st) => st.map((s) => `${fmtTime(s.start)} – ${fmtTime(s.end)}`).join(', ');

function forecastTrio(pic) {
  const { stopNow, book, withPlan } = pic.forecasts;
  const cell = (label, f, cls) => h('li', { class: cls || '' },
    h('span', { class: 'trio-label' }, label),
    h('b', { class: 'trio-n' }, whole(f.mid)),
    h('span', { class: 'trio-range' }, span(f.low, f.high)));
  return h('div', { class: 'forecast' },
    h('ul', { class: 'trio', 'aria-label': `Forecast out of ${whole(pic.p.total)} marks` },
      cell('Stop now', stopNow), cell('Book order', book), cell('This plan', withPlan, 'best')),
    h('p', { class: 'fine' }, `Out of ${whole(pic.p.total)}. Rough ranges underneath. Estimates from your own answers. `,
      h('a', { href: '#/sure' }, 'How sure is this?')));
}

function why(r) {
  return h('details', { class: 'why' }, h('summary', null, 'Why?'),
    h('p', null,
      `${r.name} carries ${marks(r.w)} marks. You are at about ${pct(r.from)} of it now. `,
      `${fmtDur(r.minutes)} should take you to about ${pct(r.to)}. `,
      `That is +${gain(r.marks)} marks, or ${gain(r.perHour)} marks per hour.`,
      r.pinned ? ' You pinned this chapter, so it is in the plan whatever it earns.' : ''));
}

function tonight(pic) {
  const { p, tl } = pic;
  if (!p.tonight.length) return null;
  const times = new Map(tl.map((t) => [t.id, t.stretches]));
  return h('section', { class: 'list-block' },
    h('h2', null, pic.words.order),
    h('ol', { class: 'rows numbered' }, p.tonight.map((r, i) => h('li', { class: 'row' },
      h('div', { class: 'row-main' },
        h('span', { class: 'row-n', 'aria-hidden': 'true' }, i + 1),
        h('span', { class: 'row-name' }, r.name),
        h('span', { class: 'row-gain' }, `+${gain(r.marks)}`, h('span', { class: 'sr' }, ' marks'))),
      h('p', { class: 'row-sub' }, fmtDur(r.minutes), ' · ', stretchText(times.get(r.id) || []), r.pinned ? ' · pinned' : ''),
      why(r)))));
}

function tradeText(s, p) {
  if (s.dropped) return 'You dropped this one: not in your exam.';
  const lead = s.m >= 0.75 ? 'You already have most of these marks. ' : '';
  if (p.blocksGiven === 0) return 'No study time left.';
  if (p.stop === 'enough' && p.blocksSpare > 0) {
    return `${lead}${BLOCK} minutes here would add about ${gain(s.firstBlock)} marks. That is under the Enough line (${gain(p.enough)}), so it is not worth another block.`;
  }
  if (s.trade) return `${lead}${BLOCK} minutes here adds about ${gain(s.firstBlock)} marks. The same ${BLOCK} minutes adds ${gain(s.trade.gain)} in ${s.trade.name}.`;
  return `${lead}${BLOCK} minutes here would add about ${gain(s.firstBlock)} marks.`;
}

function skipRow(s, p) {
  return h('li', { class: 'row' },
    h('div', { class: 'row-main' },
      h('span', { class: 'row-name' }, s.name),
      h('span', { class: 'row-gain muted' }, plural(marks(s.w), 'mark'))),
    h('p', { class: 'row-sub' }, tradeText(s, p)));
}

function notTonight(pic) {
  const { p } = pic;
  if (!p.skip.length) return null;
  // The chapters that came closest to making the plan go first. A long list is folded.
  const rows = [...p.skip].sort((a, b) => (a.dropped - b.dropped) || (b.firstBlock - a.firstBlock));
  const shown = rows.length > 7 ? rows.slice(0, 5) : rows, folded = rows.slice(shown.length);
  return h('section', { class: 'list-block' },
    h('h2', null, pic.words.not),
    h('ul', { class: 'rows' }, shown.map((s) => skipRow(s, p))),
    folded.length ? h('details', { class: 'fold' }, h('summary', null, `Show ${folded.length} more`),
      h('ul', { class: 'rows' }, folded.map((s) => skipRow(s, p)))) : null,
    h('p', { class: 'fine' }, 'Leaving these is the plan, not a failure. They are saved to your catch-up list for after the exam.'));
}

function stopNote(app, pic) {
  const { p, exam } = pic;
  if (pic.blocks === 0) return null;
  if (exam.keepGoing) {
    return h('p', { class: 'note' }, 'You chose to go past the Enough line. ',
      h('button', { class: 'link', onclick: () => app.update((e) => { e.keepGoing = false; }) }, 'Use it again'), '.');
  }
  if (p.stop === 'enough' && p.blocksSpare > 0) {
    return h('div', { class: 'note' },
      h('p', null, h('b', null, `The plan stops at ${pic.finishAt ? fmtTime(pic.finishAt) : 'this point'}`),
        pic.wall && pic.finishAt && pic.finishAt < pic.wall ? `, before bedtime (${fmtTime(pic.wall)}). ` : '. ',
        `After that, another ${BLOCK} minutes would add about ${gain(p.next.gain)} marks. Rest is worth more.`),
      h('button', { class: 'link', onclick: () => app.update((e) => { e.keepGoing = true; }) }, 'Keep going anyway'));
  }
  if (p.stop === 'time' && pic.wins.at(-1)?.hitWall && pic.wall) {
    return h('p', { class: 'note' }, `The plan uses all your study time. Bedtime is ${fmtTime(pic.wins.at(-1).wall)}. `, h('a', { href: '#/time' }, 'Change study time'));
  }
  if (p.stop === 'time') return h('p', { class: 'note' }, 'The plan uses all your study time. ', h('a', { href: '#/time' }, 'Change study time'));
  return null;
}

function morning(pic) {
  const { exam, p } = pic;
  if (!exam.morningMin || pic.over) return null;
  const recall = [...p.tonight].sort((a, b) => b.marks - a.marks);
  const spare = Math.max(0, exam.morningMin - recall.length * 2);
  const skim = p.skip.filter((s) => !s.dropped && s.m < 0.75).sort((a, b) => b.firstBlock - a.firstBlock).slice(0, Math.floor(spare / 5));
  if (!recall.length && !skim.length) return null;
  const sameDay = pic.examAt && dayOf(pic.examAt) === dayOf(pic.now);
  return h('section', { class: 'list-block' },
    h('h2', null, sameDay ? `Last ${exam.morningMin} minutes before the exam` : `Exam morning, ${exam.morningMin} min`),
    h('p', { class: 'fine' }, sameDay ? 'No new chapters now. This time is kept free in the plan.' : 'No new chapters in the morning.'),
    recall.length ? h('p', null, h('b', null, 'Recall, book closed: '), recall.map((r) => r.name).join(', '), '.') : null,
    skim.length ? h('p', null, h('b', null, 'Skim, 5 minutes each (headings, bold words, summary): '), skim.map((r) => r.name).join(', '), '.') : null);
}

/** The plan as plain text, to paste into notes or a chat, so the phone can go face down. */
export function planText(pic) {
  const { exam, p, tl } = pic;
  const times = new Map(tl.map((t) => [t.id, t.stretches]));
  const lines = [`${exam.name}${pic.examAt ? ` (${fmtDay(pic.examAt, pic.now)}, ${fmtTime(pic.examAt)})` : ''}`, '', pic.words.order + ':'];
  p.tonight.forEach((r, i) => lines.push(`${i + 1}. ${r.name}: ${fmtDur(r.minutes)}, ${stretchText(times.get(r.id) || [])}`));
  const skipped = p.skip.filter((s) => !s.dropped);
  if (skipped.length) lines.push('', `${pic.words.not}: ${skipped.map((s) => s.name).join(', ')}`);
  lines.push('', 'After every 25 minutes: close the book and say what you remember.');
  if (pic.finishAt) lines.push(`Stop at ${fmtTime(pic.finishAt)}.` + (pic.wins.some((w) => w.hitWall) && pic.wall ? ` Bedtime ${fmtTime(pic.wall)}.` : ''));
  if (exam.morningMin) lines.push(`Before the exam: ${exam.morningMin} minutes of recall, no new chapters.`);
  lines.push('', `Forecast: about ${whole(pic.forecasts.withPlan.mid)} of ${whole(p.total)} (an estimate).`, 'Made with Triage.');
  return lines.join('\n');
}

function sampleBanner(app, pic) {
  return h('p', { class: 'banner' },
    h('b', null, 'Sample exam. '), `Here it is ${fmtTime(pic.now)}, the evening before the test. `,
    h('button', { class: 'link', onclick: () => { app.state.exams = app.state.exams.filter((e) => !e.sample); app.addExam(biologySample(new Date())); app.render(); } }, 'Restart'),
    ' · ', h('a', { class: 'link', href: '#/exams' }, 'Plan my own'));
}

export function planScreen(app) {
  const exam = app.exam();
  if (!exam) { app.go(''); return null; }
  const now = app.now(exam);
  const pic = picture(exam, now);
  if (pic.over || exam.done) return after(app);

  // Redraw when the number of blocks left changes (time passing).
  const shown = pic.blocks;
  const tick = setInterval(() => {
    if (document.querySelector('details[open]') || document.hidden) return;
    if (picture(app.exam(), app.now()).blocks !== shown) app.render();
  }, 20000);
  app.onLeave(() => clearInterval(tick));

  const canStart = pic.p.tonight.length > 0 || !!pic.cur;
  const when = pic.examAt ? `${fmtDay(pic.examAt, now)}, ${fmtTime(pic.examAt)} · ${fmtUntil(pic.examAt, now)}` : '';
  const hitsBedtime = pic.wins.some((w) => w.blocks > 0 && w.hitWall);
  const timeLine = pic.blocks > 0
    ? h('p', { class: 'time-line' }, h('b', null, plural(pic.blocks, 'block')), ` · ${fmtDur(pic.studyMinutes)} of study`,
      hitsBedtime && pic.wall ? ` · bedtime ${fmtTime(pic.wall)}` : '', ' ', h('a', { href: '#/time' }, 'Change'))
    : null;

  const copied = h('span', { class: 'fine', role: 'status' });
  const offPhone = pic.p.tonight.length
    ? h('p', { class: 'fine off-phone' }, 'Phones distract. ',
      h('button', { class: 'link', onclick: async () => { copied.textContent = (await copyText(planText(pic))) ? ' Copied. Paste it into your notes.' : ' Could not copy.'; } }, 'Copy the plan'),
      ' or ', h('button', { class: 'link', onclick: () => window.print() }, 'print it'), ', then put the phone face down.', copied)
    : null;

  const running = pic.cur
    ? h('a', { class: 'callout live', href: '#/study' }, h('b', null, 'Block in progress: '), pic.cur.chapter.name, ' · open')
    : null;

  const notice = exam.notice
    ? h('div', { class: 'callout', role: 'status' }, h('p', null, exam.notice),
      h('button', { class: 'link', onclick: () => app.update((e) => { e.notice = null; }) }, 'OK'))
    : null;

  const unmet = pic.p.unmetPins.length
    ? h('p', { class: 'callout warn' }, 'There is not enough time for every pin. Pins are kept in list order. ', h('a', { href: '#/tune' }, 'Change pins'))
    : null;

  const empty = pic.blocks === 0
    ? h('div', { class: 'card empty' },
      h('h2', null, 'No study time left in your sessions.'),
      h('p', null, pic.wall && now >= pic.wall ? `It is past bedtime (${fmtTime(pic.wall)}). Sleep is part of the plan.` : 'Add a study session to get a plan.'),
      h('a', { class: 'btn primary', href: '#/time' }, 'Add study time'))
    : null;

  const done = pic.blocks > 0 && pic.p.tonight.length === 0 && !pic.cur
    ? h('div', { class: 'card empty' },
      h('h2', null, 'You are done.'),
      h('p', null, pic.p.stop === 'enough'
        ? `The next ${BLOCK} minutes would add about ${gain(pic.p.next?.gain || 0)} marks. Rest is worth more now.`
        : 'There is nothing left to gain in these chapters right now.'),
      pic.p.stop === 'enough' ? h('button', { class: 'link', onclick: () => app.update((e) => { e.keepGoing = true; }) }, 'Keep going anyway') : null)
    : null;

  return h('section', { class: 'screen plan' },
    exam.sample ? sampleBanner(app, pic) : null,
    h('header', { class: 'plan-head' },
      h('h1', null, exam.name),
      h('p', { class: 'when' }, when),
      timeLine,
      canStart ? h('a', { class: 'btn primary head-cta', href: '#/study' }, pic.cur ? 'Back to the block' : 'Start studying') : null),
    running, notice, unmet,
    h('div', { class: 'plan-grid' },
      h('div', { class: 'col-a' }, h('div', { class: 'card' }, marksMap(pic)), forecastTrio(pic)),
      h('div', { class: 'col-b' },
        empty, done,
        tonight(pic), offPhone, stopNote(app, pic), notTonight(pic), morning(pic),
        h('nav', { class: 'more-actions', 'aria-label': 'More' },
          h('a', { class: 'btn', href: '#/beat' }, 'Beat the plan'),
          h('a', { class: 'btn', href: '#/tune' }, 'Fine-tune'),
          h('a', { class: 'btn', href: '#/share' }, 'Share with class'),
          h('a', { class: 'btn', href: '#/sure' }, 'How sure is this?'),
          h('button', { class: 'btn', onclick: () => app.update((e) => { e.done = true; e.forecast = pic.p.before; }) }, 'The exam is over')))),
    canStart ? h('div', { class: 'bar' }, h('a', { class: 'btn primary wide', href: '#/study' }, pic.cur ? 'Back to the block' : 'Start studying')) : null);
}
