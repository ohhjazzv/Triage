// Browser tests. Run:  node tests/e2e/run.mjs      (set BASE_URL to test the published site)
// Needs Playwright (npm i -D playwright, or set PLAYWRIGHT_PATH to an installed copy).
// Starts its own tiny web server, drives a real browser with a controlled clock, and checks the app end to end.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')); }
catch { console.log('Playwright is not installed. Skipping browser tests. (npm i -D playwright)'); process.exit(0); }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tests/e2e/out');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.gz': 'application/gzip', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
// To test the published site instead of the local files:  BASE_URL=https://ohhjazzv.github.io/Triage/ node tests/e2e/run.mjs
const BASE = process.env.BASE_URL ? process.env.BASE_URL.replace(/\/?$/, '/') : `http://127.0.0.1:${server.address().port}/`;
console.log('Testing ' + BASE + '\n');

const browser = await chromium.launch();
let passed = 0, failed = 0;
const problems = [];

function expect(cond, message) { if (!cond) throw new Error(message); }

/** A fresh browser profile with the clock fixed, and every request and error recorded. */
async function fresh({ at = '2026-10-04T18:00:00', width = 390, height = 800, sw = false, scheme = 'light' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: sw ? 'allow' : 'block', colorScheme: scheme, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [], requests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('page error: ' + e.message));
  ctx.on('request', (r) => requests.push(r.url()));
  if (at) await page.clock.install({ time: new Date(at) });
  return { ctx, page, errors, requests };
}

async function test(name, fn) {
  const t = await fresh(fn.opts);
  try {
    await fn(t);
    expect(t.errors.length === 0, 'console errors: ' + t.errors.join(' | '));
    passed++; console.log('ok   ' + name);
  } catch (err) {
    failed++; problems.push(name); console.log('FAIL ' + name + '\n     ' + String(err.message).split('\n')[0]);
    try { await t.page.screenshot({ path: path.join(OUT, 'FAIL-' + name.replace(/[^a-z0-9]+/gi, '-') + '.png'), fullPage: true }); } catch { /* page gone */ }
  } finally { await t.ctx.close(); }
}
const withOpts = (opts, fn) => Object.assign(fn, { opts });

const text = (page, sel) => page.locator(sel).first().innerText();
const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('triage-v1')));
const shot = (page, name, fullPage = false) => page.screenshot({ path: path.join(OUT, name + '.png'), fullPage });

async function loadSample(page) {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await page.locator('.plan h1').waitFor();
}

/** Create a real exam through the four setup screens. Clock is 4 Oct 2026, 6:00 PM. */
async function setupExam(page, { chapters = 'Light (7 marks)\nElectricity (8 marks)\nMagnetism (5 marks)\nSound', answers = ['Blank', 'Bits', 'Most', 'Easy'] } = {}) {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Plan my exam' }).click();
  await page.getByLabel('Exam name').fill('Physics test');
  await page.getByRole('button', { name: 'Tomorrow' }).click();
  await page.getByLabel('Exam time').fill('08:00');
  await page.getByLabel('Total marks').fill('25');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Chapter list').fill(chapters);
  await page.getByRole('button', { name: 'Next' }).click();
  const count = chapters.split('\n').filter(Boolean).length;
  for (let i = 0; i < count; i++) await page.locator('.answer', { hasText: answers[i % answers.length] }).first().click();
  await page.locator('.summary').waitFor();
  await page.getByRole('button', { name: 'Show my plan' }).click();
  await page.locator('.plan h1').waitFor();
}

// ------------------------------------------------------------------ tests

await test('home shows the moment, the sample Marks Map and two buttons', async ({ page }) => {
  await page.goto(BASE);
  expect((await text(page, '.moment')).toLowerCase().includes('exam tomorrow'), 'the moment line is missing');
  expect(await page.locator('.map .sq').count() === 53, 'expected 50 squares plus 3 in the legend, got ' + await page.locator('.map .sq').count());
  expect(await page.getByRole('button', { name: 'Plan my exam' }).isVisible(), 'no Plan my exam button');
  const words = (await page.locator('body').innerText()).toLowerCase();
  for (const banned of ['planner', 'study buddy', 'ai-powered', 'productivity']) expect(!words.includes(banned), `the word "${banned}" is on the home screen`);
  await shot(page, 'home-phone', true);
  // the start page also says how it works, and where to check the claims
  expect(await page.locator('.how li').count() === 3 && await page.locator('.home .rules li').count() === 3, 'the three steps or the three rules are missing');
  expect((await text(page, '.how')).includes('photo of the syllabus'), 'the steps do not mention adding a photo');
  await page.locator('.trust a', { hasText: 'How sure is this?' }).click();
  await page.locator('h1', { hasText: 'How sure is this?' }).waitFor();
  await page.goBack();
  await page.getByRole('button', { name: 'Start with my exam' }).click();
  await page.locator('h1', { hasText: 'What is the exam?' }).waitFor();
});

await test('the logo always leads to the start page, which offers the way back into a saved plan', async ({ page }) => {
  await loadSample(page);
  await page.locator('a.brand').click();
  await page.locator('h1', { hasText: 'Know what to study' }).waitFor();
  expect((await text(page, '.resume')).includes('Biology test'), 'the saved exam is not offered on the start page');
  expect(await page.getByRole('button', { name: 'Plan another exam' }).isVisible(), 'no way to plan another exam');
  await page.getByRole('link', { name: 'Open my plan' }).click();
  await page.locator('.plan h1', { hasText: 'Biology test' }).waitFor();
  // opening Triage again with an exam saved goes straight to the plan
  await page.goto(BASE);
  await page.locator('.plan h1').waitFor();
  expect(page.url().endsWith('#/plan'), 'a fresh open did not land on the plan: ' + page.url());
  // while a block is running, the start page leads back to it
  await page.goto(BASE + '#/study');
  await page.getByRole('button', { name: 'Start the block' }).click();
  await page.locator('a.brand').click();
  await page.getByRole('link', { name: 'Back to my block' }).click();
  await page.locator('.timer').waitFor();
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.locator('a.brand').click();
  await page.locator('.resume').waitFor();
  await shot(page, 'home-laptop-with-exam', true);
});

await test('sample: the plan appears with the numbers in the README', async ({ page }) => {
  await loadSample(page);
  expect(await text(page, '.plan h1') === 'Biology test', 'wrong title');
  const trio = await page.locator('.trio-n').allInnerTexts();
  expect(trio.join(',') === '19,21,29', 'forecasts were ' + trio.join(','));
  expect((await text(page, '.time-line')).includes('8 blocks'), 'expected 8 blocks: ' + await text(page, '.time-line'));
  expect(await page.locator('.map .tag.on').count() === 5, 'expected 5 chapters tonight');
  const skipped = await page.locator('h2:text("Not tonight") + ul .row-name').allInnerTexts();
  expect(skipped.join('|') === 'Cell division|Human body systems|Cell structure', 'skip list was ' + skipped.join('|'));   // closest misses first
  const legend = (await text(page, '.legend')).replace(/\s+/g, ' ');
  expect(legend.includes('19') && legend.includes('+10') && legend.includes('21'), 'legend was ' + legend);
  await shot(page, 'plan-phone'); await shot(page, 'plan-phone-full', true);
});

await test('sample: on a phone the Marks Map and its "not tonight" tags are on the first screen', withOpts({ width: 360, height: 740 }, async ({ page }) => {
  await loadSample(page);
  const firstTag = await page.locator('.map .tag', { hasText: 'not tonight' }).first().boundingBox();
  const lastRow = await page.locator('.map-row').last().boundingBox();
  expect(firstTag && firstTag.y < 740, '"not tonight" is below the fold');
  expect(lastRow && lastRow.y < 740, 'the last map row is below the fold at y=' + lastRow?.y);
}));

await test('"Why?" explains a row in plain numbers', async ({ page }) => {
  await loadSample(page);
  await page.locator('.why summary').first().click();
  const why = await text(page, '.why p');
  expect(/carries 7 marks/.test(why) && /about 5%/.test(why) && /\+2\.7 marks/.test(why), 'why text: ' + why);
});

await test('setup: four screens from nothing to a plan', async ({ page }) => {
  await setupExam(page);
  expect(await text(page, '.plan h1') === 'Physics test', 'wrong title');
  const s = await state(page), e = s.exams[0];
  expect(e.chapters.length === 4, 'chapters: ' + e.chapters.length);
  expect(e.chapters.map((c) => c.know).join(',') === 'blank,bits,most,easy', 'ratings: ' + e.chapters.map((c) => c.know));
  expect(e.chapters[0].marks === 7 && e.chapters[3].marks === undefined, 'marks not parsed');
  expect(e.at === '2026-10-05T08:00' && e.sleepHours === 8 && e.wake === '06:00', 'time fields wrong: ' + JSON.stringify([e.at, e.sleepHours, e.wake]));
  expect((await text(page, '.time-line')).includes('8 blocks'), 'expected 8 blocks from 6 PM to a 10 PM bedtime: ' + await text(page, '.time-line'));
  await shot(page, 'setup-plan', true);
});

await test('setup: messy paste is read, and the photo prompt can be opened', async ({ page }) => {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Plan my exam' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Chapter list').waitFor();
  expect(await page.getByRole('button', { name: 'Next' }).isDisabled(), 'Next should wait for at least one chapter');
  await page.getByLabel('Chapter list').fill('SYLLABUS\n1. Light\n2) Sound [6]\nCh 3 - Heat (5 marks)\n• Motion | 9 | L\n----\n');
  expect((await text(page, '.found')).includes('4 chapters'), 'preview: ' + await text(page, '.found'));
  await page.locator('summary', { hasText: 'photo' }).click();
  expect((await text(page, '.prompt')).includes('chapter name | marks or ?'), 'prompt missing');
  await shot(page, 'setup-paste', true);
});

await test('setup survives a reload half way', async ({ page }) => {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Plan my exam' }).click();
  await page.getByLabel('Exam name').fill('Chemistry');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Chapter list').fill('Acids\nBases\nSalts');
  await page.reload();
  expect((await page.getByLabel('Chapter list').inputValue()) === 'Acids\nBases\nSalts', 'the pasted list was lost');
});

await test('study: a block runs, the book closes, the answer corrects the plan', async ({ page }) => {
  await loadSample(page);
  await page.locator('.bar a').click();
  expect(await text(page, '.study h1') === 'Respiration', 'first block should be Respiration');
  await page.getByRole('button', { name: 'Start the block' }).click();
  expect(await text(page, '.timer') === '25:00', 'timer: ' + await text(page, '.timer'));
  await page.clock.fastForward('10:00');
  expect(await text(page, '.timer') === '15:00', 'after 10 minutes: ' + await text(page, '.timer'));
  await page.reload();                                                   // the timer must survive a reload
  await page.locator('.timer').waitFor();
  expect(await text(page, '.timer') === '15:00', 'after reload: ' + await text(page, '.timer'));
  await shot(page, 'study-running');
  await page.clock.fastForward('15:01');
  await page.locator('h1', { hasText: 'Close the book.' }).waitFor();
  await shot(page, 'study-check');
  await page.locator('.answer', { hasText: 'Nothing' }).click();
  const e = (await state(page)).exams[0], resp = e.chapters.find((c) => c.name === 'Respiration');
  expect(e.log.length === 1 && e.log[0].recalled === 'nothing' && e.log[0].minutes === 25, 'log: ' + JSON.stringify(e.log));
  expect(Math.abs(resp.m - 0.0937) < 0.001 && resp.tau === 135, `mastery ${resp.m}, tau ${resp.tau}`);
  expect(e.current === null, 'block should be cleared');
  expect((await page.locator('.callout').innerText()).includes('Respiration went slower than expected'), 'no notice after a bad block: ' + await page.locator('.callout').innerText());
  await shot(page, 'study-next');
});

await test('study: answering "Most" changes nothing, so no notice', async ({ page }) => {
  await loadSample(page);
  await page.goto(BASE + '#/study');
  await page.getByRole('button', { name: 'Start the block' }).click();
  await page.clock.fastForward('25:01');
  await page.locator('.answer', { hasText: 'Most' }).click();
  await page.locator('.study h1').waitFor();
  expect(await page.locator('.callout').count() === 0, 'unexpected notice: ' + (await page.locator('.callout').allInnerTexts()).join(' '));
});

await test('study: the plan ends with "You are done" and never passes bedtime', async ({ page }) => {
  await loadSample(page);
  await page.goto(BASE + '#/study');
  let blocks = 0;
  for (; blocks < 14; blocks++) {
    if (await page.locator('h1', { hasText: 'You are done.' }).count()) break;
    await page.getByRole('button', { name: 'Start the block' }).click();
    await page.clock.fastForward('25:01');
    await page.locator('.answer', { hasText: 'Most' }).click();
    await page.clock.fastForward('04:59');
    await page.reload(); await page.locator('.study h1').waitFor();
  }
  expect(await page.locator('h1', { hasText: 'You are done.' }).count() === 1, 'never reached "You are done" after ' + blocks + ' blocks');
  expect(blocks === 8, 'expected 8 blocks before bedtime, did ' + blocks);
  const e = (await state(page)).exams[0];
  const last = new Date(e.log.at(-1).at);                              // sample clock: bedtime is 10 PM
  expect(last.getHours() < 22, 'a block finished after bedtime: ' + last.toString());
  await shot(page, 'study-done');
});

await test('the Enough line stops a long evening early, and "Keep going anyway" overrides it', withOpts({ at: '2026-10-04T08:00:00' }, async ({ page }) => {
  await setupExam(page);                                                // 8 AM to a 10 PM bedtime: far more time than 4 chapters need
  const note = await text(page, '.note');
  expect(/The plan stops at/.test(note) && /Rest is worth more/.test(note), 'no Enough-line note: ' + note);
  const before = (await text(page, '.time-line'));
  const usedBefore = await page.locator('ol.rows .row').count();
  await page.getByRole('button', { name: 'Keep going anyway' }).click();
  const s = await state(page);
  expect(s.exams[0].keepGoing === true, 'keepGoing not saved');
  expect((await text(page, '.note')).includes('past the Enough line'), 'no confirmation');
  expect(usedBefore >= 1 && before.includes('blocks'), 'plan looked empty');
}));

await test('sleep wall: bedtime moves, but never under 6 hours', async ({ page }) => {
  await loadSample(page);
  await page.goto(BASE + '#/time');
  const less = page.getByRole('button', { name: 'Less sleep, 30 minutes' });
  for (let i = 0; i < 12 && !(await less.isDisabled()); i++) await less.click();
  expect(await less.isDisabled(), 'the minus button should lock at the floor');
  expect((await text(page, '.stepper-value')) === '6 h', 'value: ' + await text(page, '.stepper-value'));
  expect((await page.locator('.stepper').innerText()).includes('6 hours is the floor'), 'no floor message');
  expect((await text(page, '.summary')).includes('12:00 AM'), 'bedtime should be midnight: ' + await text(page, '.summary'));
  await shot(page, 'sleep-wall', true);
  await page.getByRole('button', { name: 'Save' }).click();
  expect((await state(page)).exams[0].sleepHours === 6, 'saved sleep hours');
  // even hand-edited storage cannot go lower
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('triage-v1')); s.exams[0].sleepHours = 2; localStorage.setItem('triage-v1', JSON.stringify(s)); });
  await page.reload(); await page.locator('.plan h1').waitFor();
  expect((await text(page, '.time-line')).includes('bedtime 12:00 AM'), 'tampered sleep was accepted: ' + await text(page, '.time-line'));
});

await test('beat the plan: moving blocks only ever lowers the forecast', async ({ page }) => {
  await loadSample(page);
  await page.goto(BASE + '#/beat');
  expect((await text(page, '.verdict')).includes('matched'), 'should start matched');
  await page.getByRole('button', { name: 'One block less on Respiration' }).click();
  expect((await text(page, '.verdict')).includes('still to place'), 'verdict: ' + await text(page, '.verdict'));
  await page.getByRole('button', { name: 'One block more on Cell structure' }).click();
  expect(/\d\.\d marks below/.test(await text(page, '.verdict')), 'verdict: ' + await text(page, '.verdict'));
  await page.locator('.beat p.fine', { hasText: 'scored higher' }).waitFor();
  expect((await page.locator('.beat p.fine', { hasText: 'scored higher' }).innerText()).includes(' 0 scored higher'), 'proof line wrong');
  await shot(page, 'beat', true);
  await page.getByRole('button', { name: /Reset/ }).click();
  expect((await text(page, '.verdict')).includes('matched'), 'reset failed');
});

await test('pin and drop: the plan obeys, and a pin shows its price', async ({ page }) => {
  await loadSample(page);
  await page.goto(BASE + '#/tune');
  await page.getByRole('button', { name: 'One pinned block more on Human body systems' }).click();
  await page.getByRole('button', { name: 'One pinned block more on Human body systems' }).click();
  const price = await page.locator('[data-price]').last().innerText();
  expect(/This pin costs about 0\.8 marks/.test(price), 'price line: ' + price);
  await page.locator('.tune-card', { hasText: 'Not in my exam' }).nth(3).getByRole('checkbox').check();   // Respiration is the 4th chapter
  await shot(page, 'tune', true);
  await page.getByRole('link', { name: 'Back to the plan' }).click();
  const tonight = await page.locator('ol.rows.numbered .row-name').allInnerTexts();
  expect(tonight.includes('Human body systems') && !tonight.includes('Respiration'), 'tonight: ' + tonight.join(', '));
  expect((await page.locator('h2:text("Not tonight") + ul').innerText()).includes('You dropped this one'), 'dropped chapter not explained');
});

await test('"How sure is this?" states assumptions and proves the plan live', async ({ page }) => {
  await loadSample(page);
  await page.goto(BASE + '#/sure');
  await page.locator('.sure b', { hasText: 'Checked every way' }).waitFor();
  const body = await page.locator('.sure').innerText();
  expect(/Checked every way to split 8 blocks over 8 chapters: 6,435 plans\./.test(body), 'proof text wrong');
  expect(body.includes(' 0 scored higher'), 'something scored higher');
  expect(/\d+% of the plan stays on the same chapters/.test(body), 'what-if result missing');
  expect(body.includes('Nobody has shown that Triage raises real marks'), 'the limit is not stated');
  await shot(page, 'sure', true);
});

await test('class link: carries the chapter list and nothing personal', async ({ page, ctx }) => {
  await loadSample(page);
  await page.goto(BASE + '#/share');
  const link = await page.getByLabel('Class link').inputValue();
  expect(link.startsWith(BASE + '#x='), 'link: ' + link.slice(0, 60));
  const payload = JSON.parse(Buffer.from(link.split('#x=')[1], 'base64url').toString('utf8'));
  expect(JSON.stringify(Object.keys(payload).sort()) === '["a","c","n","t","v"]', 'payload keys: ' + Object.keys(payload));
  expect(payload.c.every((row) => row.length === 3), 'a chapter row carries more than name, marks, size');
  await shot(page, 'share', true);

  const other = await fresh();                                           // a classmate, on another device
  await other.page.goto(link);
  await other.page.locator('.kicker', { hasText: 'Shared exam' }).waitFor();
  expect((await other.page.locator('.card').innerText()).includes('8 chapters'), 'shared card wrong');
  await other.page.reload();                                             // a refresh must not lose the shared exam
  await other.page.locator('.kicker', { hasText: 'Shared exam' }).waitFor();
  expect(other.page.url() === link, 'the class link did not stay in the address bar');
  await other.page.getByRole('button', { name: 'Use it' }).click();
  expect((await other.page.locator('.count').innerText()) === 'Chapter 1 of 8', 'should land on the rating cards');
  expect(await other.page.locator('.answer.on').count() === 0, 'a rating travelled in the link');
  expect(other.errors.length === 0, 'classmate saw errors: ' + other.errors.join(' | '));
  await other.ctx.close();
});

await test('a broken class link is refused politely', async ({ page }) => {
  await page.goto(BASE + '#x=not-a-real-link');
  expect((await page.locator('.card').innerText()).includes('could not be read'), 'no message for a bad link');
});

await test('after the exam: catch-up list, real marks against the forecast', async ({ page }) => {
  await setupExam(page);                                                 // Physics test, tomorrow 8:00 AM
  await page.clock.fastForward('15:00:00');                              // past the exam next morning
  await page.reload();
  await page.locator('.after h1').waitFor();
  const names = await page.locator('.after ol.rows .row-name').allInnerTexts();
  expect(names.length >= 1 && names.every((n) => ['Light', 'Electricity', 'Magnetism', 'Sound'].includes(n)), 'catch-up list: ' + names.join(', '));
  await page.getByLabel(/Your real marks/).fill('14');
  await page.getByRole('button', { name: 'Save' }).click();
  expect((await text(page, '.after .big')).includes('Real: 14'), 'verdict: ' + await text(page, '.after .big'));
  expect((await state(page)).exams[0].result.marks === 14, 'result not saved');
  await shot(page, 'after', true);
});

await test('a sample left overnight is cleared, so a returning visitor gets the start page', async ({ page }) => {
  await loadSample(page);
  await page.clock.fastForward('15:00:00');                              // the sample's own exam time has passed
  await page.goto(BASE);
  await page.locator('h1', { hasText: 'Know what to study' }).waitFor();
  expect(await page.locator('.resume').count() === 0, 'the expired sample is still offered');
  expect((await state(page)).exams.length === 0, 'the expired sample is still saved');
  expect(await page.getByRole('button', { name: 'Plan my exam' }).isVisible(), 'no way to start');
});

await test('twelve chapters all rated the same still get a plan that uses the evening', async ({ page }) => {
  // Bug found on 4 Oct: with many chapters each block is a small share of the paper, and the plan stopped at zero blocks.
  const twelve = Array.from({ length: 12 }, (_, i) => 'Chapter ' + (i + 1) + ' topic').join('\n');
  for (const answer of ['Most', 'Bits', 'Blank']) {
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* first run */ } });
    await setupExam(page, { chapters: twelve, answers: [answer] });
    const trio = (await page.locator('.trio-n').allInnerTexts()).map(Number);
    expect(trio[2] > trio[0], `all ${answer}: the plan adds nothing (${trio})`);
    expect(trio[1] <= trio[2], `all ${answer}: book order (${trio[1]}) is shown above the plan (${trio[2]})`);
    expect(await page.locator('.tonight .row, .plan ol.rows > li').count() >= 1, `all ${answer}: no chapters in tonight's list`);
    expect(!(await page.locator('body').innerText()).includes('You are done'), `all ${answer}: told "you are done" before starting`);
  }
});

await test('odd addresses and the skip link behave', async ({ page }) => {
  await loadSample(page);
  for (const odd of ['#/constructor', '#/toString', '#/__proto__', '#/nope', '#//']) {
    await page.goto(BASE + odd); await page.waitForTimeout(60);
    expect(!(await page.locator('main').innerText()).includes('[object'), odd + ' shows raw object text');
    expect(await page.locator('main h1').count() === 1, odd + ' did not render a screen');
  }
  await page.goto(BASE + '#/plan'); await page.locator('.plan h1').waitFor();
  await page.locator('a.skip').focus();
  await page.keyboard.press('Enter');
  expect(page.url().endsWith('#/plan'), 'the skip link changed the address to ' + page.url());
  expect(await page.locator('.plan h1').isVisible() && (await page.evaluate(() => document.activeElement.id)) === 'main', 'the skip link did not move to the content');
});

await test('daytime exam: says "today", keeps the last minutes free, and does not talk about bedtime', withOpts({ at: '2026-10-04T08:00:00' }, async ({ page }) => {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Plan my exam' }).click();
  await page.getByRole('button', { name: 'Today' }).click();
  await page.getByLabel('Exam time').fill('14:00');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Chapter list').fill('Light\nSound\nHeat\nMotion\nForce');
  await page.getByRole('button', { name: 'Next' }).click();
  for (const a of ['Blank', 'Bits', 'Blank', 'Bits', 'Blank']) await page.locator('.answer', { hasText: a }).first().click();
  await page.locator('.summary').waitFor();
  await page.getByRole('button', { name: 'Show my plan' }).click();
  await page.locator('.plan h1').waitFor();
  const body = await page.locator('.plan').innerText();
  expect(body.includes('Today, in this order') && !body.includes('Tonight'), 'daytime plan still says tonight');
  expect(body.includes('Last 20 minutes before the exam'), 'recall section not adapted');
  expect(!(await text(page, '.time-line')).includes('bedtime'), 'bedtime shown for a 2 PM exam: ' + await text(page, '.time-line'));
  const lastEnd = (await page.locator('ol.rows.numbered .row-sub').last().innerText()).split('–').pop().trim();
  expect(lastEnd === '1:25 PM' || lastEnd === '1:40 PM' || /^1[:]\d\d PM$/.test(lastEnd), 'last block ends at ' + lastEnd + ', should be at or before 1:40 PM');
  const s = await state(page);
  expect(s.exams[0].morningMin === 20, 'recall minutes not saved');
}));

await test('a long "Not tonight" list is folded, closest misses first', async ({ page }) => {
  const many = Array.from({ length: 16 }, (_, i) => `Topic ${i + 1} (${3 + (i % 5)} marks)`).join('\n');
  await setupExam(page, { chapters: many, answers: ['Blank', 'Bits', 'Most', 'Easy'] });
  const visible = await page.locator('section.list-block:has(h2:text("Not tonight")) > ul .row').count();
  expect(visible === 5, 'expected 5 rows before the fold, got ' + visible);
  const fold = page.locator('details.fold summary');
  expect(/Show \d+ more/.test(await fold.innerText()), 'no fold');
  await fold.click();
  expect(await page.locator('details.fold .row').first().isVisible(), 'fold did not open');
});

await test('the plan can leave the phone: copy as text', async ({ page, ctx }) => {
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await loadSample(page);
  await page.getByRole('button', { name: 'Copy the plan' }).click();
  await page.locator('.off-phone [role=status]', { hasText: 'Copied' }).waitFor();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip.startsWith('Biology test (Tomorrow, 8:00 AM)'), 'clipboard: ' + clip.slice(0, 60));
  expect(clip.includes('1. Respiration: 50 min, 5:50 PM – 6:45 PM') && clip.includes('Not tonight: Cell structure, Cell division, Human body systems'), 'plan text wrong: ' + clip);
  expect(clip.includes('Stop at 9:45 PM. Bedtime 10:00 PM.') && clip.includes('about 29 of 50 (an estimate)'), 'plan text footer wrong');
});

await test('each block says what to do in it', async ({ page }) => {
  await loadSample(page);
  await page.goto(BASE + '#/study');
  await page.getByRole('button', { name: 'Start the block' }).click();
  expect((await text(page, '.method-kind')).toLowerCase() === 'first pass', 'Respiration is Blank, so a first pass: ' + await text(page, '.method-kind'));
  expect(await page.locator('.steps li').count() === 3, 'three steps expected');
});

await test('keyboard: focus lands on the new screen\'s heading after moving on', withOpts({ width: 1280, height: 800 }, async ({ page }) => {
  await page.goto(BASE);
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); if (await page.evaluate(() => document.activeElement?.innerText) === 'Try a sample') break; }
  await page.keyboard.press('Enter');
  await page.locator('.plan h1').waitFor();
  const focus = await page.evaluate(() => document.activeElement?.tagName + ':' + document.activeElement?.innerText);
  expect(focus === 'H1:Biology test', 'focus went to ' + focus);
}));

await test('storage blocked by the browser: the app still works for this tab and says so', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Try a sample' }).click();
  expect(await text(page, '.plan h1') === 'Biology test', 'plan did not render without storage');
  expect(await page.locator('#save-note').isVisible(), 'no warning that nothing is being saved');
});

// ------------------------------------------------------------------ a photo of the syllabus

const FIXTURES = path.join(ROOT, 'tests/e2e/fixtures');
const DONE = /^Found |Could not find|did not work|too big|not a picture/;

async function toChapterStep(page) {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Plan my exam' }).click();
  await page.getByLabel('Exam name').fill('Science');
  await page.getByRole('button', { name: 'Tomorrow' }).click();
  await page.getByLabel('Exam time').fill('08:00');
  await page.getByLabel('Total marks').fill('80');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Chapter list').waitFor();
}
/** Wait until the photo reader has finished, and return what it told the student. */
async function photoDone(page) {
  await page.waitForFunction((re) => new RegExp(re).test(document.querySelector('.photo-status')?.textContent || ''), DONE.source, { timeout: 90000 });
  return page.locator('.photo-status').textContent();
}
/** The chapters the app found in the box, as "name=marks" strings. */
const chaptersInBox = (page) => page.evaluate(async () => {
  const { parseSyllabus } = await import(new URL('js/parse.js', document.baseURI).href);
  return parseSyllabus(document.querySelector('textarea').value).map((c) => c.name + (c.marks != null ? '=' + c.marks : ''));
});

await test('a photo of the syllabus is read on the device and fills the chapter list', async ({ page, requests }) => {
  await toChapterStep(page);
  expect(await page.getByRole('button', { name: 'Next' }).isDisabled(), 'Next should wait for chapters');
  await page.locator('#photo').setInputFiles(path.join(FIXTURES, 'list-photo.png'));
  const said = await photoDone(page);
  expect(said.startsWith('Found 7 chapters'), 'status was: ' + said);
  expect(said.includes('Check the list'), 'the student is not told to check the result');
  const got = await chaptersInBox(page);
  const want = ['Chemical Reactions and Equations=7', 'Acids, Bases and Salts=6', 'Metals and Non-metals=5', 'Life Processes=8', 'Control and Coordination=6', 'Light: Reflection and Refraction=9', 'Electricity=8'];
  expect(JSON.stringify(got) === JSON.stringify(want), 'read as: ' + got.join(' / '));
  expect((await text(page, '.found')).includes('7 chapters'), 'the preview did not update');
  await shot(page, 'photo-read', true);
  // the photo never left the device: every request, including the text reader's own files, stayed on this origin
  const outside = requests.filter((u) => !u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:'));
  expect(outside.length === 0, 'requests to other origins: ' + outside.join(', '));
  expect(requests.some((u) => u.includes('/vendor/tesseract/')), 'the text reader was not loaded from the app itself');
  expect(!requests.some((u) => /list-photo/.test(u)), 'the photo was sent somewhere');
  // and the list carries on into the rest of setup
  await page.getByRole('button', { name: 'Next' }).click();
  expect((await page.locator('body').innerText()).includes('Chemical Reactions and Equations'), 'the first chapter is not on the next screen');
});

await test('six kinds of picture: tilted tables, a dark chat screenshot, rows of dots, a faint photocopy', async ({ page }) => {
  const PICTURES = [
    ['circular-photo.jpg', ['Chemical Reactions and Equations=8', 'Acids, Bases and Salts=7', 'Metals and Non-metals=7', 'Carbon and its Compounds=6', 'Life Processes=9', 'Control and Coordination=6', 'How do Organisms Reproduce?=7', 'Light - Reflection and Refraction=10', 'The Human Eye and the Colourful World=5', 'Electricity=9', 'Magnetic Effects of Electric Current=6']],
    ['table-tilted.jpg', ['Nationalism in India=8', 'Resources and Development=5', 'Power Sharing=6', 'Federalism=5', 'Development=6', 'Sectors of the Indian Economy=7', 'Water Resources=3']],
    ['chat-dark.png', ['Chemical Reactions and Equations', 'Acids, Bases and Salts', 'Life Processes', 'Light: Reflection and Refraction', 'Electricity', 'Our Environment']],
    ['contents-dots.jpg', ['Real Numbers=6', 'Polynomials=4', 'Pair of Linear Equations in Two Variables=8', 'Quadratic Equations=7', 'Arithmetic Progressions=5', 'Triangles=9']],
    ['photocopy-faint.jpg', ['A Letter to God=5', 'Nelson Mandela: Long Walk to Freedom=6', 'Two Stories about Flying=5', 'From the Diary of Anne Frank=6', 'Glimpses of India=4', 'Dust of Snow (poem)=4']],
  ];
  await toChapterStep(page);
  for (const [file, want] of PICTURES) {
    await page.getByLabel('Chapter list').fill('');
    await page.locator('#photo').setInputFiles(path.join(FIXTURES, file));
    const said = await photoDone(page);
    const got = await chaptersInBox(page);
    expect(JSON.stringify(got) === JSON.stringify(want), `${file} was read as: ${got.join(' / ')} (${said})`);
    await page.evaluate(() => { document.querySelector('.photo-status').textContent = ''; });
  }
});

await test('a pasted screenshot is read too, and is added under what was already typed', async ({ page }) => {
  await toChapterStep(page);
  await page.getByLabel('Chapter list').fill('Magnetism (5 marks)');
  const bytes = fs.readFileSync(path.join(FIXTURES, 'chat-dark.png')).toString('base64');
  await page.evaluate(async (b64) => {
    const file = new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'screenshot.png', { type: 'image/png' });
    const data = new DataTransfer(); data.items.add(file);
    document.querySelector('textarea').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, bytes);
  const said = await photoDone(page);
  expect(said.startsWith('Found 6 chapters'), 'status was: ' + said);
  const got = await chaptersInBox(page);
  expect(got.length === 7 && got[0] === 'Magnetism=5' && got[6] === 'Our Environment', 'box now holds: ' + got.join(' / '));
  // pasting ordinary text still works as ordinary text
  await page.getByLabel('Chapter list').fill('');
  await page.evaluate(() => {
    const data = new DataTransfer(); data.setData('text/plain', 'Sound');
    const ta = document.querySelector('textarea');
    const went = ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    if (!went) throw new Error('a text paste was blocked');
  });
});

await test('a PDF, or a picture with no words, gets a plain message and the list is left alone', async ({ page }) => {
  await toChapterStep(page);
  await page.getByLabel('Chapter list').fill('Light\nSound');
  await page.locator('#photo').setInputFiles({ name: 'syllabus.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 not really') });
  expect((await photoDone(page)).includes('not a picture'), 'no message for a PDF');
  await page.locator('#photo').setInputFiles(path.join(FIXTURES, 'no-text.png'));
  const said = await photoDone(page);
  expect(said.includes('Could not find any text'), 'status was: ' + said);
  expect(await page.getByLabel('Chapter list').inputValue() === 'Light\nSound', 'the list was changed');
  await page.locator('#photo').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('this is not a png') });
  expect((await photoDone(page)).includes('did not work'), 'no message for a broken picture');
  expect(!(await page.locator('#photo').isDisabled()), 'the photo button stayed locked');
});
await test('broken saved data does not break the app', async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.setItem('triage-v1', '{"exams": [{"chapters": "oops"'));
  await page.reload();
  expect(await page.getByRole('button', { name: 'Plan my exam' }).isVisible(), 'home did not render');
});

await test('nothing leaves the device: every request stays on the app\'s own origin', async ({ page, requests }) => {
  await loadSample(page);
  for (const route of ['#/study', '#/beat', '#/tune', '#/sure', '#/share', '#/exams', '#/time', '#/setup/1']) { await page.goto(BASE + route); await page.waitForTimeout(80); }
  const outside = requests.filter((u) => !u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:'));
  expect(outside.length === 0, 'requests to other origins: ' + outside.join(', '));
  expect(requests.length > 15, 'suspiciously few requests recorded: ' + requests.length);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp.includes("default-src 'self'") && csp.includes("connect-src 'self'"), 'CSP is not locked to self');
});

await test('works offline after the first visit', withOpts({ sw: true, at: null }, async ({ page, ctx }) => {
  await page.goto(BASE);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForTimeout(600);
  await ctx.setOffline(true);
  await page.reload();
  expect(await page.getByRole('button', { name: 'Try a sample' }).isVisible(), 'home did not load offline');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  expect(await text(page, '.plan h1') === 'Biology test', 'plan did not load offline');
  await page.goto(BASE + '#/sure'); await page.locator('.sure b', { hasText: 'Checked' }).waitFor();
}));

await test('the photo reader works offline once it has been used', withOpts({ sw: true, at: null }, async ({ page, ctx }) => {
  await page.goto(BASE);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForTimeout(600);
  await page.reload();                                                  // now the page is served by the service worker
  await toChapterStep(page);
  await page.locator('#photo').setInputFiles(path.join(FIXTURES, 'chat-dark.png'));
  expect((await photoDone(page)).startsWith('Found 6'), 'first read failed');
  await page.waitForTimeout(400);
  await ctx.setOffline(true);
  await page.reload();
  await page.getByLabel('Chapter list').fill('');
  await page.locator('#photo').setInputFiles(path.join(FIXTURES, 'contents-dots.jpg'));
  const said = await photoDone(page);
  expect(said.startsWith('Found 6'), 'offline read said: ' + said);
}));

await test('every control has a name, every input a label', async ({ page }) => {
  await loadSample(page);
  const audit = () => page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea')) {
      const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim()
        || (el.id && document.querySelector(`label[for="${el.id}"]`)?.innerText) || el.closest('label')?.innerText?.trim();
      if (!name) bad.push(el.outerHTML.slice(0, 90));
    }
    if (document.querySelectorAll('h1').length !== 1) bad.push('h1 count: ' + document.querySelectorAll('h1').length);
    return bad;
  });
  for (const route of ['#/', '#/plan', '#/study', '#/beat', '#/tune', '#/sure', '#/share', '#/exams', '#/time', '#/setup/1', '#/setup/2']) {
    await page.goto(BASE + route); await page.waitForTimeout(60);
    const bad = await audit();
    expect(bad.length === 0, `${route}: ${bad.join(' || ')}`);
  }
});

await test('small tap targets: every button and link is at least 44 px tall or wide enough to hit', withOpts({ width: 360, height: 740 }, async ({ page }) => {
  await loadSample(page);
  for (const route of ['#/plan', '#/study', '#/tune', '#/beat']) {
    await page.goto(BASE + route); await page.waitForTimeout(60);
    const small = await page.evaluate(() => [...document.querySelectorAll('button.btn, a.btn, .answer, .chip')]
      .filter((el) => el.offsetParent).map((el) => ({ r: el.getBoundingClientRect(), t: el.innerText.slice(0, 20) }))
      .filter((x) => x.r.height < 43.5).map((x) => `${x.t} (${Math.round(x.r.height)}px)`));
    expect(small.length === 0, `${route}: ${small.join(', ')}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(!overflow, `${route} scrolls sideways at 360 px`);
  }
}));

await test('dark mode and a laptop screen render', withOpts({ width: 1280, height: 860, scheme: 'dark' }, async ({ page }) => {
  await loadSample(page);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg === 'rgb(20, 20, 22)', 'dark background: ' + bg);
  expect(await page.locator('.head-cta').isVisible(), 'the Start button should sit in the header on a laptop');
  await shot(page, 'plan-laptop-dark', true);
  await page.locator('#theme').click();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(250, 247, 242)', 'theme switch did nothing');
  await shot(page, 'plan-laptop', true);
}));

await browser.close(); server.close();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log('Failed: ' + problems.join('; ')); process.exit(1); }
