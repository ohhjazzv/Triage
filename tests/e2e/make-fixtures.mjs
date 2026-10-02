// Makes the test pictures in tests/e2e/fixtures/. Run:  node tests/e2e/make-fixtures.mjs
//
// These are made-up pictures, drawn by a browser and then roughed up to look like the ways a
// syllabus really reaches a student: a phone photo of a printed table, a forwarded chat screenshot,
// a contents page with rows of dots, a faint photocopy. They are not real photos. They check that
// the photo reader keeps working; they do not prove it reads every real photo.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
async function picture(name, { width, height, scale = 1, html, quality }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await page.setContent(html);
  const file = path.join(OUT, name);
  await page.screenshot(name.endsWith('.jpg') ? { path: file, type: 'jpeg', quality } : { path: file });
  await page.close();
  console.log('made ' + name);
}
const cell = 'border:1px solid #222;padding:6px';

// 1. A printed list, photographed almost straight.
await picture('list-photo.png', { width: 900, height: 620, scale: 1.5, html: `<body style="margin:0;background:#cfcbc2">
  <div style="margin:26px 30px;padding:34px 44px;background:#f4f1ea;transform:rotate(-0.7deg);font:22px/1.75 Georgia,serif;color:#222;box-shadow:0 2px 14px rgba(0,0,0,.25)">
  <div style="font:700 26px Georgia,serif;margin-bottom:6px">Class 10 Science &mdash; Half-yearly syllabus</div>
  ${['Chemical Reactions and Equations (7 marks)', 'Acids, Bases and Salts (6 marks)', 'Metals and Non-metals (5 marks)', 'Life Processes (8 marks)', 'Control and Coordination (6 marks)', 'Light: Reflection and Refraction (9 marks)', 'Electricity (8 marks)'].map((t, i) => `<div>${i + 1}. ${t}</div>`).join('')}
  </div></body>` });

// 2. A school circular with a ruled table, photographed at an angle on a dark desk: tilted, squeezed
//    at the far end, slightly out of focus, in shadow, saved as a rough JPEG.
const science = [['Chemical Reactions and Equations', 8], ['Acids, Bases and Salts', 7], ['Metals and Non-metals', 7], ['Carbon and its Compounds', 6], ['Life Processes', 9], ['Control and Coordination', 6], ['How do Organisms Reproduce?', 7], ['Light - Reflection and Refraction', 10], ['The Human Eye and the Colourful World', 5], ['Electricity', 9], ['Magnetic Effects of Electric Current', 6]];
await picture('circular-photo.jpg', { width: 900, height: 1200, quality: 45, html: `<body style="margin:0;background:#5b4a3a;perspective:1400px;overflow:hidden">
  <div style="position:absolute;inset:0;background:radial-gradient(circle at 80% 15%,rgba(255,255,255,.25),rgba(0,0,0,.35))"></div>
  <div style="margin:90px 70px;padding:50px 46px;height:860px;background:#f1eee6;transform:rotateX(14deg) rotateZ(-3.5deg) rotateY(-6deg);font:21px/1.6 'Times New Roman',serif;color:#262320;filter:blur(0.7px);box-shadow:0 10px 40px rgba(0,0,0,.5);position:relative">
  <div style="position:absolute;inset:0;background:linear-gradient(200deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.28))"></div>
  <div style="text-align:center;font-weight:700;font-size:24px">GREENFIELD PUBLIC SCHOOL</div>
  <div style="text-align:center;font-weight:700">Half Yearly Examination 2026-27</div>
  <div style="text-align:center;margin-bottom:14px">Class X &nbsp;&nbsp; Subject: Science &nbsp;&nbsp; M.M. 80</div>
  <table style="border-collapse:collapse;width:100%;font-size:21px"><tr><th style="${cell}">S.No</th><th style="${cell};text-align:left">Name of the Chapter</th><th style="${cell}">Marks</th></tr>
  ${science.map((r, i) => `<tr><td style="${cell};text-align:center">${i + 1}.</td><td style="${cell}">${r[0]}</td><td style="${cell};text-align:center">${r[1]}</td></tr>`).join('')}</table>
  <p style="font-size:18px">Note: Students must bring their own geometry box. Paper will be of 3 hours.</p></div></body>` });

// 3. A table with heavier lines, tilted the other way, under uneven light.
const social = [['Nationalism in India', 8], ['Resources and Development', 5], ['Power Sharing', 6], ['Federalism', 5], ['Development', 6], ['Sectors of the Indian Economy', 7], ['Water Resources', 3]];
const thick = 'border:1.5px solid #333;padding:5px';
await picture('table-tilted.jpg', { width: 760, height: 560, scale: 2, quality: 70, html: `<body style="margin:0;background:linear-gradient(115deg,#8a8377,#d9d4c8 60%,#a39d90)">
  <div style="margin:30px 40px;padding:26px 30px;background:linear-gradient(100deg,#e9e5da,#fbf9f3);transform:rotate(2.2deg) skewX(-1deg);font:19px/1.5 Arial,sans-serif;color:#1c1c1c">
  <div style="text-align:center;font-weight:700">CLASS X &nbsp; SOCIAL SCIENCE</div><div style="text-align:center;margin-bottom:8px">Periodic Test 2 &nbsp; Maximum Marks: 40</div>
  <table style="border-collapse:collapse;width:100%;font-size:19px"><tr><th style="${thick}">S.No.</th><th style="${thick};text-align:left">Chapter</th><th style="${thick}">Marks</th></tr>
  ${social.map((r, i) => `<tr><td style="${thick};text-align:center">${i + 1}</td><td style="${thick}">${r[0]}</td><td style="${thick};text-align:center">${r[1]}</td></tr>`).join('')}</table></div></body>` });

// 4. A dark-mode chat screenshot, small: the way a syllabus is forwarded in a class group.
await picture('chat-dark.png', { width: 360, height: 420, html: `<body style="margin:0;background:#0b141a;font:15px/1.45 Roboto,Arial,sans-serif;color:#e9edef"><div style="margin:14px;padding:10px 12px;background:#1f2c33;border-radius:8px">
  Science portion for tomorrow<br>&bull; Chemical Reactions and Equations<br>&bull; Acids, Bases and Salts<br>&bull; Life Processes<br>&bull; Light: Reflection and Refraction<br>&bull; Electricity<br>&bull; Our Environment<div style="text-align:right;font-size:11px;color:#8696a0">7:42 PM</div></div></body>` });

// 5. A contents page: names and marks joined by rows of dots, saved as a rough JPEG.
const maths = [['Real Numbers', 6], ['Polynomials', 4], ['Pair of Linear Equations in Two Variables', 8], ['Quadratic Equations', 7], ['Arithmetic Progressions', 5], ['Triangles', 9]];
await picture('contents-dots.jpg', { width: 700, height: 520, scale: 1.5, quality: 55, html: `<body style="margin:0;background:#f7f4ec;font:20px/1.9 'Times New Roman',serif;color:#222;padding:30px 40px"><b>Syllabus: Mathematics</b>
  ${maths.map((r) => `<div style="display:flex"><span>${r[0]}</span><span style="flex:1;border-bottom:2px dotted #444;margin:0 6px 12px"></span><span>${r[1]} marks</span></div>`).join('')}</body>` });

// 6. A faint photocopy: grey typewriter text on grey paper, small and soft.
await picture('photocopy-faint.jpg', { width: 520, height: 330, quality: 60, html: `<body style="margin:0;background:#dedbd3;font:15px/1.6 'Courier New',monospace;color:#77736c;padding:18px 22px;filter:blur(0.4px)">
  UNIT TEST - III (ENGLISH)<br>1) A Letter to God ........ 5<br>2) Nelson Mandela: Long Walk to Freedom ........ 6<br>3) Two Stories about Flying ........ 5<br>4) From the Diary of Anne Frank ........ 6<br>5) Glimpses of India ........ 4<br>6) Dust of Snow (poem) ........ 4</body>` });

// 7. A page with no words on it.
await picture('no-text.png', { width: 400, height: 300, html: '<body style="margin:0;background:linear-gradient(135deg,#d8d2c4,#f3efe6)"><div style="margin:60px;width:120px;height:120px;border-radius:60px;background:#c98a00"></div></body>' });

await browser.close();
