// The sample Biology plan, exactly as the app draws it: [name, have, tonight, later, tag]
const rows = [
  ['Cell structure', 7, 0, 1, 'not tonight'], ['Photosynthesis', 2, 3, 3, '50 min'], ['Respiration', 0, 3, 4, '50 min'],
  ['Genetics', 3, 2, 4, '50 min'], ['Ecology', 3, 1, 1, '25 min'], ['Human body systems', 0, 0, 3, 'not tonight'],
];
const map = document.getElementById('map');
for (const [name, have, win, later, tag] of rows) {
  const row = document.createElement('div'); row.className = 'row';
  const n = document.createElement('span'); n.className = 'name'; n.textContent = name;
  const t = document.createElement('span'); t.className = 'tag' + (tag.includes('min') ? ' on' : ''); t.textContent = tag;
  const s = document.createElement('span'); s.className = 'squares';
  for (const [cls, k] of [['have', have], ['win', win], ['later', later]]) for (let i = 0; i < k; i++) { const q = document.createElement('span'); q.className = 'sq ' + cls; s.append(q); }
  row.append(n, t, s); map.append(row);
}
