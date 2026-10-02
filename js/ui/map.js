// The Marks Map: every square is one mark of the paper.
//   solid   = marks you have now
//   hatched = marks tonight's plan wins
//   outline = left for later
// The three kinds differ by shape as well as colour, so the map reads without colour too.

import { h, plural } from './dom.js';
import { fmtDur } from '../time.js';

function row(r, planRow, skipRow, counter) {
  const sq = [];
  for (let k = 0; k < r.have; k++) sq.push(h('span', { class: 'sq have' }));
  for (let k = 0; k < r.win; k++) sq.push(h('span', { class: 'sq win', vars: { '--i': counter.n++ } }));
  for (let k = 0; k < r.later; k++) sq.push(h('span', { class: 'sq later' }));

  let tag, tagClass = 'tag', spoken;
  if (planRow) { tag = fmtDur(planRow.minutes); tagClass += ' on'; spoken = `${fmtDur(planRow.minutes)} tonight.`; }
  else if (skipRow?.dropped) { tag = 'dropped'; spoken = 'Dropped.'; }
  else { tag = 'not tonight'; spoken = 'Not tonight.'; }

  const label = `${r.name}, ${plural(Math.round(r.marks * 10) / 10, 'mark')}. ` +
    `${r.have} you have now, ${r.win} tonight wins, ${r.later} left for later. ${spoken}`;

  return h('li', { class: 'map-row' + (planRow ? ' is-on' : '') },
    h('span', { class: 'sr' }, label),
    h('span', { class: 'map-name', 'aria-hidden': 'true' }, r.name, h('span', { class: 'map-marks' }, ` ${Math.round(r.marks * 10) / 10}`)),
    h('span', { class: tagClass, 'aria-hidden': 'true' }, tag),
    h('span', { class: 'squares', 'aria-hidden': 'true' }, sq));
}

/** pic: the picture from model.js. */
export function marksMap(pic, opts = {}) {
  const { sq, p } = pic;
  const counter = { n: 0 };
  const planById = new Map(p.tonight.map((r) => [r.id, r]));
  const skipById = new Map(p.skip.map((r) => [r.id, r]));
  const have = sq.rows.reduce((a, r) => a + r.have, 0);
  const win = sq.rows.reduce((a, r) => a + r.win, 0);
  const later = sq.rows.reduce((a, r) => a + r.later, 0);

  return h('section', { class: 'map' + (opts.still ? ' still' : ''), 'aria-label': 'Marks Map' },
    h('ul', { class: 'map-rows' }, sq.rows.map((r) => row(r, planById.get(r.id), skipById.get(r.id), counter))),
    h('ul', { class: 'legend' },
      h('li', null, h('span', { class: 'sq have', 'aria-hidden': 'true' }), ' have now ', h('b', null, have)),
      h('li', null, h('span', { class: 'sq win', 'aria-hidden': 'true' }), ' tonight ', h('b', null, '+' + win)),
      h('li', null, h('span', { class: 'sq later', 'aria-hidden': 'true' }), ' later ', h('b', null, later))),
    sq.unit > 1 ? h('p', { class: 'fine' }, `1 square = ${sq.unit} marks`) : null);
}
