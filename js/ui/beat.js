// Beat the plan: move the blocks around yourself and watch the forecast.
// Under the model, no split of the same time scores higher than Triage's. This screen lets you try.

import { h, marks, whole, plural } from './dom.js';
import { picture } from '../model.js';
import { score, verify, BLOCK } from '../engine.js';
import { fmtDur } from '../time.js';

export function beat(app) {
  const exam = app.exam();
  if (!exam) { app.go(''); return null; }
  const pic = picture(exam, app.now(exam));
  const { p, chapters } = pic;
  const total = p.blocksUsed;

  if (total === 0) {
    return h('section', { class: 'screen' }, h('h1', null, 'Beat the plan'),
      h('p', null, 'There are no blocks in the plan right now, so there is nothing to move.'),
      h('p', null, h('a', { class: 'btn', href: '#/plan' }, 'Back to the plan')));
  }

  const split = { ...p.split };
  const status = h('div', { class: 'beat-status', role: 'status', 'aria-live': 'polite' });
  const list = h('ul', { class: 'beat-rows' });

  function paint() {
    const placed = Object.values(split).reduce((a, b) => a + b, 0), left = total - placed;
    const mine = score(chapters, split), gap = p.after - mine;
    status.replaceChildren(
      h('div', { class: 'duel' },
        h('div', null, h('span', { class: 'trio-label' }, 'Your split'), h('b', { class: 'trio-n' }, marks(mine))),
        h('div', { class: 'best' }, h('span', { class: 'trio-label' }, 'Triage'), h('b', { class: 'trio-n' }, marks(p.after)))),
      h('p', { class: 'verdict' }, left > 0 ? `${plural(left, 'block')} still to place.`
        : gap > 0.049 ? `${marks(gap)} marks below Triage's plan.`
          : gap < -0.049 ? `You beat it by ${marks(-gap)} marks. That should not be possible: please report it.`
            : 'You matched Triage\'s plan. Nothing scores higher.'));
    list.replaceChildren(...chapters.map((c) => {
      const n = split[c.id] || 0;
      const change = (d) => { split[c.id] = Math.max(0, n + d); paint(); };
      return h('li', { class: 'beat-row' + (n !== (p.split[c.id] || 0) ? ' changed' : '') },
        h('span', { class: 'row-name' }, c.name, h('span', { class: 'meta' }, ` ${marks(c.marks)} marks`)),
        h('span', { class: 'stepper' },
          h('button', { class: 'btn small', type: 'button', disabled: n === 0, 'aria-label': `One block less on ${c.name}`, onclick: () => change(-1) }, '−'),
          h('output', { class: 'stepper-value', 'aria-label': `${c.name}: ${fmtDur(n * BLOCK)}` }, n ? fmtDur(n * BLOCK) : '0'),
          h('button', { class: 'btn small', type: 'button', disabled: left <= 0 || c.drop, 'aria-label': `One block more on ${c.name}`, onclick: () => change(1) }, '+')));
    }));
  }
  paint();

  const proof = h('p', { class: 'fine', role: 'status' }, 'Checking other plans…');
  setTimeout(() => {
    const v = verify(chapters, p.split);
    proof.textContent = v.exhaustive
      ? `Checked every way to split these ${plural(total, 'block')}: ${v.tried.toLocaleString('en')} plans. ${v.better} scored higher.`
      : `Checked ${v.tried.toLocaleString('en')} other ways to split these ${plural(total, 'block')}. ${v.better} scored higher.`;
  }, 30);

  return h('section', { class: 'screen beat' },
    h('h1', null, 'Beat the plan'),
    h('p', { class: 'lead' }, `You have ${plural(total, 'block')} (${fmtDur(total * BLOCK)}). Move them where you like. Out of ${whole(p.total)} marks.`),
    status, list, proof,
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: () => { for (const k of Object.keys(split)) split[k] = p.split[k] || 0; paint(); } }, 'Reset to Triage\'s plan'),
      h('a', { class: 'btn quiet', href: '#/plan' }, 'Back to the plan')),
    h('p', { class: 'fine' }, 'Think a chapter matters more than its marks say? Pin it in ', h('a', { href: '#/tune' }, 'Fine-tune'), ' and Triage plans around it.'));
}
