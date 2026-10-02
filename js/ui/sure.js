// "How sure is this?" Says plainly what the app assumes, what is proven, and what is not.

import { h, plural, whole } from './dom.js';
import { picture } from '../model.js';
import { verify, whatIfWrong, BLOCK } from '../engine.js';
import { cleanExam } from '../store.js';
import { biologySample } from '../samples.js';
import { fmtDur } from '../time.js';

// From `node tests/robustness.js` (3,000 simulated exams per row). Re-run it if the engine changes.
const SIM = { examsPerRow: 3000, aheadPct: 99.2, keptPct: 91 };

export function sure(app) {
  // Use the student's exam if there is one, otherwise the sample.
  let exam = app.exam(), now = exam ? app.now(exam) : null;
  if (!exam) { const real = new Date(); exam = cleanExam(biologySample(real)); now = new Date(real.getTime() + exam.clockOffset); }
  const pic = picture(exam, now);
  const { p, chapters } = pic;

  const proof = h('p', { role: 'status' }, 'Checking…');
  const runProof = () => {
    proof.textContent = 'Checking…';
    setTimeout(() => {
      if (p.blocksUsed === 0) { proof.textContent = 'There are no blocks in the plan right now, so there is nothing to check.'; return; }
      const t0 = performance.now(), v = verify(chapters, p.split), ms = Math.max(1, Math.round(performance.now() - t0));
      proof.replaceChildren(
        h('b', null, v.exhaustive ? `Checked every way to split ${plural(p.blocksUsed, 'block')} over ${plural(chapters.length, 'chapter')}: ` : `Checked `,
          `${v.tried.toLocaleString('en')} ${v.exhaustive ? 'plans' : 'other plans'}.`),
        ` ${v.better} scored higher than Triage's. (${ms} ms, on your device.)`);
    }, 30);
  };

  const what = h('div', { role: 'status' });
  const runWhatIf = () => {
    const w = whatIfWrong(chapters, pic.blocks, { enoughPct: exam.keepGoing ? 0 : exam.enoughPct });
    what.replaceChildren(
      h('p', null, h('b', null, `${Math.round(w.same * 100)}% of the plan stays on the same chapters`), ' if you know every chapter one level worse than you said.'),
      w.moved.length ? h('ul', { class: 'plain' }, w.moved.map((m) => h('li', null, `${m.name}: ${m.from ? fmtDur(m.from) : 'nothing'} → ${m.to ? fmtDur(m.to) : 'nothing'}`)))
        : h('p', null, 'Nothing would move.'));
  };

  const el = h('section', { class: 'screen sure' },
    h('h1', null, 'How sure is this?'),
    h('p', { class: 'lead' }, 'Sure about the order. Not sure about the exact marks. Here is the difference.'),

    h('h2', null, 'What Triage assumes'),
    h('ul', { class: 'plain' },
      h('li', null, h('b', null, 'Your answers are honest. '), 'The plan starts from what you said you know.'),
      h('li', null, h('b', null, 'Study has diminishing returns. '), 'The first half hour on a new chapter teaches more than the fourth.'),
      h('li', null, h('b', null, 'Short, medium and long are starting guesses for speed. '), 'Each closed-book check corrects them for you.')),

    h('h2', null, 'What is proven'),
    h('p', null, 'Given those assumptions, no other way of splitting the same time scores higher. You do not have to trust that. Your device just checked it', app.exam() ? ' for your exam:' : ' for the sample exam:'),
    proof,
    h('p', null, h('button', { class: 'btn small', onclick: runProof }, 'Check again'), ' ', h('a', { class: 'btn small', href: '#/beat' }, 'Try to beat it yourself')),

    h('h2', null, 'What if I am fooling myself?'),
    h('p', null, 'Most people rate themselves too kindly. So we tested what happens when the answers are wrong.'),
    what,
    h('p', null, `In ${SIM.examsPerRow.toLocaleString('en')} simulated exams where the ratings were off and the real study speed was wrong by up to twice in either direction, `,
      h('b', null, `the plan still beat book order ${SIM.aheadPct}% of the time`), ` and kept ${SIM.keptPct}% of the lead a perfect plan would have.`),

    h('h2', null, 'What is not proven'),
    h('p', null, 'Nobody has shown that Triage raises real marks. The simulations show the method holds up inside its own model. Real exams are the only real test.'),
    h('p', null, 'So every forecast is a range and is labelled an estimate. After the exam, enter your real marks. Triage shows you how far off it was and remembers it.'),

    h('h2', null, 'Your data'),
    h('p', null, 'Nothing leaves this device. There is no account, no tracking and no AI inside the app. The class link carries only the chapter list, never your answers.'),

    h('h2', null, 'The numbers'),
    h('p', { class: 'fine' }, `A block is ${BLOCK} minutes. Blank, Bits, Most, Easy start a chapter at about 5%, 30%, 60%, 85% of its marks. `,
      'Nobody is planned above 95%. The plan stops when the next block would add less than ', `${exam.enoughPct}% of the paper (${whole(p.total)} marks here).`),
    h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: app.exam() ? '#/plan' : '#/' }, 'Back')));

  runProof(); runWhatIf();
  return el;
}
