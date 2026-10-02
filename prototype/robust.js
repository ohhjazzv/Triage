// Run:  node robust.js
// Question: students misjudge themselves. If every rating can be off, is the plan still worth following?
// Method: each chapter has a TRUE level. The student REPORTS a level that may be wrong.
// Triage plans from the reported levels. We then score that plan against the TRUE levels and compare with
//   (a) book order, and (b) the plan Triage would have made if it had known the truth.
const { triage, bookOrder, score, prep, KNOW } = require('./engine.js');

let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const sizes = ['S', 'M', 'L'], levels = ['blank', 'bits', 'most', 'easy'];

function misreport(level, mode) {
  const i = levels.indexOf(level);
  if (mode === 'over') return levels[Math.min(3, i + 1)];                       // always one level too kind
  if (mode === 'under') return levels[Math.max(0, i - 1)];                      // always one level too harsh
  if (mode === 'noisy') { const r = rnd(); return levels[Math.max(0, Math.min(3, i + (r < 0.3 ? 1 : r < 0.5 ? -1 : 0)))]; } // 30% too kind, 20% too harsh
  return level;
}

function run(mode, N = 3000) {
  let kept = [], overBook = [], sameMinutes = [];
  for (let t = 0; t < N; t++) {
    const n = 5 + Math.floor(rnd() * 8);
    const truth = Array.from({ length: n }, (_, i) => ({ name: 'c' + i, w: 2 + Math.floor(rnd() * 14), size: sizes[Math.floor(rnd() * 3)], know: levels[Math.floor(rnd() * 4)] }));
    if (mode === 'speed' || mode === 'both') {                // real study speed is 0.5x to 2x what the app assumes
      for (const c of truth) c.tau = { S: 30, M: 60, L: 90 }[c.size] * Math.pow(2, rnd() * 2 - 1);
    }
    const reported = truth.map((c) => ({ ...c, tau: undefined, know: misreport(c.know, mode === 'both' ? 'noisy' : mode) }));
    const full = prep(truth).reduce((a, c) => a + 2 * c.tau, 0);
    const mins = Math.max(50, Math.round(full * (0.2 + rnd() * 0.4) / 25) * 25);

    const oracle = triage(truth, mins);                       // plan if the app knew the truth
    const made = triage(reported, mins);                      // plan the app actually makes
    const split = truth.map((c) => { const p = made.plan.find((x) => x.name === c.name); return p ? p.minutes / 25 : 0; });
    const got = score(truth, split);                          // what that plan is really worth
    const book = bookOrder(truth, mins);
    const total = oracle.total;

    if (oracle.after - book > 1e-9) kept.push((got - book) / (oracle.after - book));
    overBook.push((got - book) / total * 100);
    const oSplit = truth.map((c) => { const p = oracle.plan.find((x) => x.name === c.name); return p ? p.minutes : 0; });
    const shared = split.reduce((a, b, i) => a + Math.min(b * 25, oSplit[i]), 0);
    sameMinutes.push(shared / (mins - (mins % 25)));
  }
  const med = (a) => { a = [...a].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  const pct = (a, p) => { a = [...a].sort((x, y) => x - y); return a[Math.floor(a.length * p)]; };
  const share = (a) => a.filter((x) => x > 0).length / a.length * 100;
  console.log(`${mode.padEnd(6)}  still ahead of book order in ${share(overBook).toFixed(1)}% of exams | median lead ${med(overBook).toFixed(1)} per 100 (worst 10%: ${pct(overBook, 0.1).toFixed(1)}) | keeps ${(med(kept) * 100).toFixed(0)}% of the perfect plan's lead | ${(med(sameMinutes) * 100).toFixed(0)}% of minutes land on the same chapters`);
}

console.log('3,000 random short-time exams per row. "Lead" = marks ahead of book order, scored against the TRUE levels.\n');
run('exact');
run('noisy');
run('over');
run('under');
run('speed');   // ratings exact, but every chapter's real speed is wrong by up to 2x either way
run('both');    // noisy ratings AND wrong speeds
