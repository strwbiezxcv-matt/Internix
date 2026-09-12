const fs = require('fs');
const p = 'c:/Users/Matt/Downloads/PROJECT 2/public/app.js';
let c = fs.readFileSync(p, 'utf8');

// Fix 1: Replace the incomplete renderNav with a complete one
const oldRenderNav = "function renderNav() {\r\n  const nav = $('#mainNav');\r\n  const links = [\r\n    ['#/', 'Home'],\r\n    ['#/match', 'Find My Matches'],\r\n    ['#/companies', 'Companies'],\r\n\r\n";

const newRenderNav = "function renderNav() {\r\n  const nav = $('#mainNav');\r\n  const links = [\r\n    ['#/', 'Home'],\r\n    ['#/match', 'Find My Matches'],\r\n    ['#/companies', 'Companies'],\r\n    ['#/saved', 'Saved'],\r\n    ['#/about', 'About']\r\n  ];\r\n  const h = location.hash === '#/matches' ? '#/match' : (location.hash || '#/');\r\n  nav.innerHTML = links.map(([hp, label]) =>\r\n    '<a href=\"' + hp + '\" class=\"link' + (h === hp ? ' active' : '') + '\"' +\r\n    (h === hp ? ' aria-current=\"page\"' : '') + '>' + label + '</a>').join('');\r\n  $('#topbar').hidden = false;\r\n}\r\n\r\n";

if (c.includes(oldRenderNav)) {
  c = c.replace(oldRenderNav, newRenderNav);
  console.log('Fixed renderNav function');
} else {
  console.log('oldRenderNav not found');
}

// Fix 2: Remove the duplicate code block that was floating
// This is the duplicate that appears after some other function
const dupBlock = "\r\n\r\n    ['#/saved', 'Saved'],\r\n    ['#/about', 'About']\r\n  ];\r\n  const h = location.hash === '#/matches' ? '#/match' : (location.hash || '#/');\r\n  nav.innerHTML = links.map(([hp, label]) =>\r\n    '<a href=\"' + hp + '\" class=\"link' + (h === hp ? ' active' : '') + '\"' +\r\n    (h === hp ? ' aria-current=\"page\"' : '') + '>' + label + '</a>').join('');\r\n  $('#topbar').hidden = false;\r\n}\r\n$('#navToggle').addEventListener('click', () => {\r\n  const nav = $('#mainNav');\r\n  nav.classList.toggle('open');\r\n  const open = nav.classList.contains('open');\r\n  $('#navToggle').setAttribute('aria-expanded', open);\r\n  $('#navToggle').setAttribute('aria-label', open ? 'Close menu' : 'Open menu');\r\n});\r\n$('#mainNav').addEventListener('click', (e) => {\r\n  if (e.target.closest('a')) $('#mainNav').classList.remove('open');\r\n});\r\n";

if (c.includes(dupBlock)) {
  c = c.replace(dupBlock, '\r\n');
  console.log('Removed duplicate block');
} else {
  console.log('dupBlock not found');
}

fs.writeFileSync(p, c, 'utf8');
console.log('File written successfully');
