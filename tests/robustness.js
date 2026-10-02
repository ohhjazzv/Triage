// Run:  node tests/robustness.js
//
// Question: students misjudge themselves, and the app's study speeds are only starting guesses.
// If the inputs are wrong, is the plan still worth following?
//
// Method: each chapter has a TRUE level and a TRUE speed. The student REPORTS a level that may be
// wrong, and the app assumes its default speed. Triage plans from what it was told. We then score
// that plan against the truth and compare it with
//   (a) book order (chapter 1, then 2, ...), and
//   (b) the plan Triage would have made if it had known the truth.
//
// What this shows: the method holds up when its inputs are wrong.
// What it does not show: that real students gain real marks. Only real use can show that.

import { plan, bookOrder, score, tauNow, BLOCK, KNOW_ORDER, TAU } from '../js/engine.js';

let seed = 11;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const SIZES = ['S', 'M', 'L'];

function misreport(level, mode) {
  const i = KNOW_ORDER.indexOf(level);
  if (mode === 'kind') return KNOW_ORDER[Math.min(3, i + 1)];        // always one level too kind
  if (mode === 'harsh') return KNOW_ORDER[Math.max(0, i - 1)];       // always one level too harsh
  if (mode === 'noisy') { const r = rnd(); return KNOW_ORDER[Math.max(0, Math.min(3, i + (r < 0.3 ? 1 : r < 0.5 ? -1 : 0)))]; }
  return level;
}

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)];

function run(label, { ratings = 'exact', speeds = false }, N = 3000) {
  const lead = [], kept = [], same = [];
  for (let t = 0; t < N; t++) {
    const n = 5 + Math.floor(rnd() * 8);
    const truth = Array.from({ length: n }, (_, i) => {
      const size = SIZES[Math.floor(rnd() * 3)];
      const c = { id: 'c' + i, name: 'c' + i, marks: 2 + Math.floor(rnd() * 14), size, know: KNOW_ORDER[Math.floor(rnd() * 4)] };
      if (speeds) c.tau = TAU[size] * Math.pow(2, rnd() * 2 - 1);    // real speed is 0.5x to 2x the default
      return c;
    });
    const told = truth.map((c) => ({ ...c, tau: undefined, know: misreport(c.know, ratings) }));
    const full = truth.reduce((a, c) => a + 2 * tauNow(c), 0);
    const blocks = Math.max(2, Math.round(full * (0.2 + rnd() * 0.4) / BLOCK));   // 20% to 60% of the time a full pass needs

    const perfect = plan(truth, blocks, { enoughPct: 0 });           // if the app knew the truth
    const made = plan(told, blocks, { enoughPct: 0 });               // what the app actually plans
    const worth = score(truth, made.split);                          // what that plan is really worth
    const book = bookOrder(truth, blocks * BLOCK);

    lead.push((worth - book) / perfect.total * 100);
    if (perfect.after - book > 1e-9) kept.push((worth - book) / (perfect.after - book));
    let shared = 0;
    for (const id in made.split) shared += Math.min(made.split[id], perfect.split[id] || 0);
    same.push(shared / blocks);
  }
  const ahead = lead.filter((x) => x > 0).length / lead.length * 100;
  console.log(
    `${label.padEnd(34)} ahead of book order in ${ahead.toFixed(1)}% of exams | median lead ${median(lead).toFixed(1)} marks per 100 ` +
    `(worst tenth: ${pct(lead, 0.1).toFixed(1)}) | keeps ${(median(kept) * 100).toFixed(0)}% of a perfect plan's lead | ` +
    `${(median(same) * 100).toFixed(0)}% of the time lands on the same chapters`);
}

console.log('3,000 simulated short-time exams per row. Every plan is scored against the TRUE levels and speeds.\n');
run('inputs exactly right', {});
run('ratings randomly off by a level', { ratings: 'noisy' });
run('every rating one level too kind', { ratings: 'kind' });
run('every rating one level too harsh', { ratings: 'harsh' });
run('real speed wrong by up to 2x', { speeds: true });
run('ratings off AND speed wrong', { ratings: 'noisy', speeds: true });
