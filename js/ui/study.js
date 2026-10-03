// Study mode: one block at a time, then a closed-book check.

import { h, gain, whole, plural } from './dom.js';
import { picture, currentBlock, planChange } from '../model.js';
import { checkIn, masteryNow, BLOCK, BREAK } from '../engine.js';
import { fmtTime, fmtDur } from '../time.js';

const MIN = 60 * 1000;

const RECALL_LABEL = { nothing: 'Nothing', some: 'Some', most: 'Most', all: 'All' };
const RECALL_HINT = {
  nothing: 'It did not stick',
  some: 'A few points',
  most: 'The main ideas',
  all: 'I could explain it',
};

// What to actually do in a block. Three kinds, chosen from how well the chapter is known.
// These are the methods with the best evidence: testing yourself and explaining in your own words,
// not rereading and not copying notes.
function method(m) {
  if (m < 0.35) {
    return { kind: 'First pass', line: 'First pass. Read for the big ideas. Do not copy out notes.', steps: [
      ['5 min', 'Read the headings, the summary and the diagrams first.'],
      ['15 min', 'Read it once. After each section, say its main point in one line.'],
      ['5 min', 'Write the five questions most likely to be asked.'],
    ] };
  }
  if (m < 0.7) {
    return { kind: 'Practise', line: 'Practise. Do questions from this chapter and check your answers.', steps: [
      ['First', 'Do questions from this chapter without looking at the answers.'],
      ['Then', 'Check each one straight away.'],
      ['Last', 'Mark the ones you got wrong. Read only those parts again.'],
    ] };
  }
  return { kind: 'Polish', line: 'Polish. Test yourself on the parts you still get wrong.', steps: [
    ['First', 'Go only to the parts you still get wrong.'],
    ['Then', 'Explain each one aloud with the book closed.'],
    ['Last', 'Write the formulas, dates or definitions from memory.'],
  ] };
}
const howTo = (m) => method(m).line;

function steps(m) {
  const how = method(m);
  return h('div', { class: 'method' },
    h('p', { class: 'method-kind' }, how.kind),
    h('ol', { class: 'steps' }, how.steps.map(([when, what]) => h('li', null, h('b', null, when + ' '), what))));
}

function clock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// A short, quiet tone when a block ends. No sound file, no network.
// Browsers (Safari above all) only let a page make sound after a tap, so the sound is switched on
// by the tap on "Start the block" and the same switch is used when the block ends.
let sound = null;
function primeSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
    if (!sound || sound.state === 'closed') sound = new Ctx();
    if (sound.state === 'suspended') sound.resume();
  } catch { /* sound is a bonus */ }
}
function beep() {
  try {
    primeSound();
    const ctx = sound; if (!ctx) return;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.value = 660; gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.65);
  } catch { /* sound is a bonus */ }
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* so is a buzz */ }
}

// ----- the three states -----

function nextUp(app, exam, pic) {
  const first = pic.p.tonight[0];
  if (!first) return doneScreen(app, exam, pic);
  const rest = pic.p.tonight.slice(1, 4);
  const start = () => app.update((e) => {
    primeSound();
    e.current = { chapterId: first.id, startedAt: app.now(e).toISOString(), minutes: BLOCK };
    e.notice = null;
  });
  const moreOfSame = first.blocks > 1 ? ` (${first.blocks} blocks on this chapter)` : '';
  return h('section', { class: 'screen study' },
    exam.notice ? h('div', { class: 'callout', role: 'status' }, h('p', null, exam.notice)) : null,
    h('p', { class: 'kicker' }, exam.log.length ? `Take ${BREAK} minutes. Then:` : 'First block'),
    h('h1', null, first.name),
    h('p', { class: 'lead' }, `${BLOCK} minutes${moreOfSame}. ${howTo(first.from)}`),
    h('div', { class: 'actions' },
      h('button', { class: 'btn primary wide', onclick: start }, 'Start the block'),
      h('a', { class: 'btn quiet', href: '#/plan' }, 'See the plan')),
    rest.length ? h('p', { class: 'fine' }, 'After this: ', rest.map((r) => r.name).join(', '), pic.p.tonight.length > 4 ? ', …' : '.') : null,
    h('p', { class: 'fine' }, plural(pic.blocks, 'block'), ' left in your study time',
      pic.finishAt ? `. The plan ends at ${fmtTime(pic.finishAt)}.` : '.'));
}

function running(app, exam, cur) {
  const time = h('p', { class: 'timer', role: 'timer', 'aria-live': 'off' }, clock(cur.left));
  const baseTitle = document.title;
  let lock = null;
  if (navigator.wakeLock?.request) navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
  const tick = setInterval(() => {
    const left = new Date(cur.ends) - app.now(exam);
    time.textContent = clock(left);
    document.title = `${clock(left)} · ${cur.chapter.name}`;
    if (left <= 0) { clearInterval(tick); beep(); app.render(); }
  }, 500);
  app.onLeave(() => { clearInterval(tick); document.title = baseTitle; try { lock?.release(); } catch { /* gone */ } });

  const elapsed = () => Math.max(1, Math.round((app.now(exam) - cur.started) / MIN));
  const finishEarly = () => app.update((e) => { e.current.minutes = Math.min(e.current.minutes, elapsed()); });
  const fastForward = () => app.update((e) => { e.current.startedAt = new Date(app.now(e).getTime() - e.current.minutes * MIN).toISOString(); });
  const restart = () => app.update((e) => { e.current.startedAt = app.now(e).toISOString(); e.notice = 'Block restarted. Everything after it is planned from now.'; });

  return h('section', { class: 'screen study' },
    h('p', { class: 'kicker' }, 'Studying now'),
    h('h1', null, cur.chapter.name),
    time,
    steps(masteryNow(cur.chapter)),
    h('p', { class: 'fine' }, `Ends at ${fmtTime(cur.ends)}. Then you close the book and check what stayed. Put your phone face down; it will beep.`),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: finishEarly }, 'I finished early'),
      h('button', { class: 'btn', onclick: restart }, 'I lost time'),
      h('a', { class: 'btn quiet', href: '#/plan' }, 'See the plan')),
    h('p', { class: 'fine' }, h('button', { class: 'link', onclick: fastForward }, 'Fast-forward this block'), ' (for trying the app, not for studying).'));
}

function checkScreen(app, exam, cur) {
  const answer = (recalled) => app.update((e) => {
    const now = app.now(e);
    const c = e.chapters.find((x) => x.id === cur.chapter.id);
    const minutes = e.current.minutes;
    const expected = picture(e, now);                        // what the plan assumed: the block went as predicted
    const expectedRows = expected.p.tonight.map((r) => ({ id: r.id, minutes: r.minutes }));

    const fix = checkIn(c, minutes, recalled);
    c.m = fix.m; c.tau = fix.tau; c.minutes = (c.minutes || 0) + minutes;
    if (c.pin > 0 && minutes >= BLOCK - 5) c.pin -= 1;       // one pinned block is now done
    e.log.push({ chapterId: c.id, minutes, recalled, at: now.toISOString() });
    e.current = null;

    // Same moment, same number of blocks, only the check-in differs: did the plan change?
    const actual = picture(e, expected.wins.length ? expected.wins[0].start : now);
    const nameOf = (id) => e.chapters.find((x) => x.id === id)?.name || 'a chapter';
    const change = planChange(expectedRows, actual.p.tonight.map((r) => ({ id: r.id, minutes: r.minutes })), nameOf);
    if (recalled === 'most') e.notice = change;
    else {
      const how = recalled === 'all' ? 'went better than expected' : 'went slower than expected';
      e.notice = `${c.name} ${how}. Forecast is now about ${whole(actual.p.after)} of ${whole(actual.p.total)}. ${change || 'The rest of the plan still holds.'}`;
    }
  });

  return h('section', { class: 'screen study checking' },
    h('p', { class: 'kicker' }, 'Block finished'),
    h('h1', null, 'Close the book.'),
    h('p', { class: 'lead' }, 'For one minute, say or write everything you remember from ', h('b', null, cur.chapter.name), '. Then answer honestly.'),
    h('p', { class: 'question', id: 'rq' }, 'How much came back?'),
    h('div', { class: 'answers', role: 'group', 'aria-labelledby': 'rq' }, Object.keys(RECALL_LABEL).map((k) =>
      h('button', { class: 'answer', type: 'button', onclick: () => answer(k) }, h('b', null, RECALL_LABEL[k]), h('span', null, RECALL_HINT[k])))),
    h('p', { class: 'fine' }, 'Recalling with the book closed is itself strong study. Your answer also tells Triage how fast this chapter really goes, and the plan adjusts.'));
}

function doneScreen(app, exam, pic) {
  const studied = exam.log.reduce((a, l) => a + l.minutes, 0);
  let reason;
  const lastWin = pic.wins[pic.wins.length - 1];
  const atBedtime = pic.wall && (!lastWin || lastWin.hitWall || pic.now >= pic.wall);
  if (pic.blocks === 0) reason = atBedtime ? `It is bedtime (${fmtTime(pic.wall)}). Sleep is part of the plan.` : 'Your study time is used up.';
  else if (pic.p.stop === 'enough') reason = `The next ${BLOCK} minutes would add about ${gain(pic.p.next?.gain || 0)} marks. Rest is worth more now.`;
  else reason = 'There is nothing left to gain in these chapters tonight.';
  const canKeepGoing = pic.blocks > 0 && pic.p.stop === 'enough';
  return h('section', { class: 'screen study' },
    h('p', { class: 'kicker' }, studied ? `${fmtDur(studied)} studied` : 'Tonight'),
    h('h1', null, 'You are done.'),
    h('p', { class: 'lead' }, reason),
    exam.morningMin && !pic.over ? h('p', null, `${pic.examAt && pic.examAt.toDateString() === pic.now.toDateString() ? 'Before the exam' : 'On exam morning'}: ${exam.morningMin} minutes of recall, book closed. No new chapters.`) : null,
    h('div', { class: 'actions' },
      h('a', { class: 'btn primary', href: '#/plan' }, 'See where you stand'),
      canKeepGoing ? h('button', { class: 'btn quiet', onclick: () => app.update((e) => { e.keepGoing = true; }) }, 'Keep going anyway') : null));
}

export function study(app) {
  const exam = app.exam();
  if (!exam) { app.go(''); return null; }
  const now = app.now(exam);
  const cur = currentBlock(exam, now);
  if (exam.current && !cur) { app.update((e) => { e.current = null; }, false); }   // the chapter was deleted
  if (cur && cur.over) return checkScreen(app, exam, cur);
  if (cur) return running(app, exam, cur);
  const pic = picture(exam, now);
  if (pic.over || exam.done) { app.go('plan'); return null; }
  return nextUp(app, exam, pic);
}
