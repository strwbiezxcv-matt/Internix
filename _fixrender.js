const fs = require('fs');
const p = 'c:/Users/Matt/Downloads/PROJECT 2/public/app.js';
let c = fs.readFileSync(p, 'utf8');

// Find and fix the broken renderNav section
const idx = c.indexOf('function renderNav()');
const nextFuncIdx = c.indexOf('/* ---------------------- selected program', idx);

console.log('Found renderNav at:', idx, 'next function at:', nextFuncIdx);

// Build the fixed section as an array of lines, then join
const lines = [
  "function renderNav() {",
  "  const nav = $('#mainNav');",
  "  const links = [",
  "    ['#/', 'Home'],",
  "    ['#/match', 'Find My Matches'],",
  "    ['#/companies', 'Companies'],",
  "    ['#/saved', 'Saved'],",
  "    ['#/about', 'About']",
  "  ];",
  "  const h = location.hash === '#/matches' ? '#/match' : (location.hash || '#/');",
  "  nav.innerHTML = links.map(([hp, label]) =>",
  "    '<a href=\"' + hp + '\" class=\"link' + (h === hp ? ' active' : '') + '\"' +",
  "    (h === hp ? ' aria-current=\"page\"' : '') + '>' + label + '</a>').join('');",
  "  $('#topbar').hidden = false;",
  "}",
  "",
  "$('#navToggle').addEventListener('click', () => {",
  "  const nav = $('#mainNav');",
  "  nav.classList.toggle('open');",
  "  const open = nav.classList.contains('open');",
  "  $('#navToggle').setAttribute('aria-expanded', open);",
  "  $('#navToggle').setAttribute('aria-label', open ? 'Close menu' : 'Open menu');",
  "});",
  "$('#mainNav').addEventListener('click', (e) => {",
  "  if (e.target.closest('a')) $('#mainNav').classList.remove('open');",
  "});"
];

const fixedSection = lines.join('\n');

c = c.substring(0, idx) + fixedSection + '\n\n' + c.substring(nextFuncIdx);
fs.writeFileSync(p, c, 'utf8');
console.log('Fixed renderNav and navToggle handlers!');
