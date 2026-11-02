// Закрыть сайт на переделку: docs/ (то, что отдаёт GitHub Pages) заменяется страницей из maintenance/.
//   node tools/close-site.cjs        Открыть снова: npm run build (сборка приложения перезапишет docs/).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'maintenance'), OUT = path.join(ROOT, 'docs');
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });
fs.copyFileSync(path.join(SRC, 'index.html'), path.join(OUT, '404.html')); // любой адрес сайта ведёт на эту страницу
console.log('docs/: страница «закрыто на переделку»', fs.readdirSync(OUT).join(', '));
