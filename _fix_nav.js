const fs = require('fs');
const p = 'c:/Users/Matt/Downloads/PROJECT 2/public/app.js';
let c = fs.readFileSync(p, 'utf8');

// Find renderNav section
const r1 = c.indexOf('function renderNav()');
const r2 = c.indexOf('/* ---------------------- selected program', r1);

// What currently exists between renderNav and the next comment
const currentSection = c.substring(r1, r2);

// New navToggle handlers to append
const navToggleHandlers = '\n\n$(\'#navToggle\').addEventListener(\'click\', () => {\n  const nav = $(\'#mainNav\');\n  nav.classList.toggle(\'open\');\n  const open = nav.classList.contains(\'open\');\n  $(\'#navToggle\').setAttribute(\'aria-expanded\', open);\n  $(\'#navToggle\').setAttribute(\'aria-label\', open ? \'Close menu\' : \'Open menu\');\n});\n$(\'#mainNav\').addEventListener(\'click\', (e) => {\n  if (e.target.closest(\'a\')) $(\'#mainNav\').classList.remove(\'open\');\n});';

// Check if handlers already exist
if (c.includes("navToggle');\n  nav.classList.toggle('open')")) {
  console.log('navToggle handlers already exist');
} else {
  // Append handlers after the renderNav function closes
  // Find the closing brace of renderNav (after '$('#topbar').hidden = false;')
  const closeIdx = c.indexOf("$('#topbar').hidden = false;", r1);
  if (closeIdx >= 0) {
    const insertAt = c.indexOf('\n', closeIdx) + 1;
    c = c.substring(0, insertAt) + navToggleHandlers + c.substring(insertAt);
    console.log('Added navToggle handlers');
  } else {
    console.log('Could not find renderNav closing');
  }
}

fs.writeFileSync(p, c, 'utf8');
console.log('File saved');
