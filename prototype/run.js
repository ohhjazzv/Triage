// Run:  node run.js     Prints sample plans and the checks quoted in IDEA.md.
const { triage, bookOrder, brute, score, checkIn, latestBedtime, prep } = require('./engine.js');

function show(title, chapters, minutes, opts = {}) {
  const r = triage(chapters, minutes, opts), bo = bookOrder(chapters, minutes);
  console.log(`\n=== ${title} | ${minutes} min | ${r.total} marks${opts.enough ? ' | enough line ' + opts.enough : ''}`);
  console.log(`stop now ${r.before.toFixed(1)}  |  book order ${bo.toFixed(1)}  |  TRIAGE ${r.after.toFixed(1)}   used ${r.used} min${r.stoppedEarly ? ', STOPPED EARLY with ' + r.spare + ' min spare' : ''}`);
  for (const p of r.plan) console.log(`  STUDY ${p.name.padEnd(32)} ${String(p.minutes).padStart(3)} min  ${(p.from * 100).toFixed(0)}% -> ${(p.to * 100).toFixed(0)}%  +${p.marks.toFixed(1)}${p.pinned ? '  (pinned)' : ''}`);
  for (const s of r.skip) console.log(`  SKIP  ${s.name.padEnd(32)} ${s.dropped ? 'dropped by student' : 'first block would add ' + s.firstBlock.toFixed(1) + ', ' + s.left.toFixed(1) + ' marks left there'}`);
  return r;
}

const bio = [
  { name: 'Cell structure', w: 8, size: 'M', know: 'easy' },
  { name: 'Cell division', w: 6, size: 'M', know: 'most' },
  { name: 'Photosynthesis', w: 8, size: 'L', know: 'bits' },
  { name: 'Respiration', w: 7, size: 'L', know: 'blank' },
  { name: 'Genetics', w: 9, size: 'L', know: 'bits' },
  { name: 'Evolution', w: 4, size: 'M', know: 'blank' },
  { name: 'Ecology', w: 5, size: 'S', know: 'most' },
  { name: 'Human body systems', w: 3, size: 'L', know: 'blank' },
];
show('Biology test', bio, 100);
const r3 = show('Biology test', bio, 200);
show('Biology test', bio, 600);
show('Biology test, enough line 0.5', bio, 600, { enough: 0.5 });
console.log('   marks added by each block, in order:', triage(bio, 600).curve.map((x) => x.toFixed(2)).join(' '));

// Pin: "teacher said Human body systems is coming"
const pinned = bio.map((c) => (c.name === 'Human body systems' ? { ...c, pin: 2 } : c));
const rp = show('Biology test, Human body systems pinned for 2 blocks', pinned, 200);
console.log(`   cost of the pin: ${(r3.after - rp.after).toFixed(1)} marks of forecast`);

// SST midterm shaped like Jaz's. Knowledge ratings are ASSUMED, not his.
const sst = [
  { name: 'Hist 1 Nationalism in Europe', w: 10, size: 'L', know: 'bits' },
  { name: 'Hist 2 Nationalism in India', w: 10, size: 'L', know: 'bits' },
  { name: 'Geo 1 Resources & Development', w: 5, size: 'M', know: 'blank' },
  { name: 'Geo 2 Forest & Wildlife', w: 5, size: 'S', know: 'blank' },
  { name: 'Geo 3 Water Resources', w: 5, size: 'S', know: 'blank' },
  { name: 'Geo 4 Agriculture', w: 5, size: 'L', know: 'blank' },
  { name: 'Pol 1 Power Sharing', w: 6.67, size: 'S', know: 'most' },
  { name: 'Pol 2 Federalism', w: 6.67, size: 'M', know: 'bits' },
  { name: 'Pol 3 Gender, Religion, Caste', w: 6.66, size: 'M', know: 'bits' },
  { name: 'Eco 1 Development', w: 6.67, size: 'S', know: 'most' },
  { name: 'Eco 2 Sectors of the Economy', w: 6.67, size: 'M', know: 'bits' },
  { name: 'Eco 3 Money and Credit', w: 6.66, size: 'M', know: 'blank' },
];
show('SST midterm (assumed ratings)', sst, 250);
show('SST midterm (assumed ratings)', sst, 500);

// ---- Check 1: block-by-block vs every possible split, including pins and drops
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const sizes = ['S', 'M', 'L'], knows = ['blank', 'bits', 'most', 'easy'];
let worst = 0, cases = 0;
for (let t = 0; t < 600; t++) {
  const n = 3 + Math.floor(rnd() * 4);
  const chs = Array.from({ length: n }, (_, i) => ({ name: 'c' + i, w: 2 + Math.floor(rnd() * 14), size: sizes[Math.floor(rnd() * 3)], know: knows[Math.floor(rnd() * 4)], pin: rnd() < 0.15 ? 1 : 0, drop: rnd() < 0.1 }));
  const blocks = 1 + Math.floor(rnd() * 9);
  if (chs.reduce((a, c) => a + c.pin, 0) > blocks) continue;
  worst = Math.max(worst, brute(chs, blocks * 25) - triage(chs, blocks * 25).after); cases++;
}
console.log(`\nCHECK 1  vs brute force: ${cases} random exams (with pins and drops), biggest gap ${worst.toExponential(2)} marks`);

// ---- Check 2: "Beat the plan". Random hand-made splits of the same time never score higher.
let beaten = 0, tries = 0;
for (let t = 0; t < 300; t++) {
  const n = 5 + Math.floor(rnd() * 8);
  const chs = Array.from({ length: n }, (_, i) => ({ name: 'c' + i, w: 2 + Math.floor(rnd() * 14), size: sizes[Math.floor(rnd() * 3)], know: knows[Math.floor(rnd() * 4)] }));
  const blocks = 4 + Math.floor(rnd() * 10), best = triage(chs, blocks * 25).after;
  for (let k = 0; k < 200; k++) {
    const split = new Array(n).fill(0); for (let b = 0; b < blocks; b++) split[Math.floor(rnd() * n)]++;
    tries++; if (score(chs, split) > best + 1e-9) beaten++;
  }
}
console.log(`CHECK 2  beat the plan: ${tries} random hand-made plans, ${beaten} scored higher than Triage`);

// ---- Check 3: edge over book order when time is short
let N = 2000, pct = [];
for (let t = 0; t < N; t++) {
  const n = 5 + Math.floor(rnd() * 8);
  const chs = Array.from({ length: n }, () => ({ name: 'c', w: 2 + Math.floor(rnd() * 14), size: sizes[Math.floor(rnd() * 3)], know: knows[Math.floor(rnd() * 4)] }));
  const full = prep(chs).reduce((a, c) => a + 2 * c.tau, 0);
  const mins = Math.max(25, Math.round(full * (0.2 + rnd() * 0.4) / 25) * 25);
  const r = triage(chs, mins); pct.push((r.after - bookOrder(chs, mins)) / r.total * 100);
}
pct.sort((a, b) => a - b);
console.log(`CHECK 3  vs book order, ${N} random short-time exams: median +${pct[N / 2].toFixed(1)} points per 100, worst ${pct[0].toFixed(1)}, 10th pct ${pct[N / 10].toFixed(1)}, 90th pct ${pct[N * 9 / 10].toFixed(1)}`);

// ---- Check-in and sleep wall
const ch = prep([{ name: 'x', w: 10, size: 'M', know: 'blank' }])[0];
for (const a of ['nothing', 'some', 'most', 'all']) { const u = checkIn(ch, 25, a); console.log(`check-in "${a}": mastery 5% -> ${(u.m * 100).toFixed(0)}%, tau 60 -> ${u.tau.toFixed(0)}`); }
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
console.log(`sleep wall: wake 06:00 -> latest bedtime ${hhmm(latestBedtime(360))};  wake 04:30 -> ${hhmm(latestBedtime(270))}`);
