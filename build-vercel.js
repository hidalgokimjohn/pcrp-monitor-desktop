// Build the existing offline app, then publish only its browser-ready HTML.
// KCIS exports, saved sessions, source files, and design previews stay private.
const fs = require('node:fs');
const path = require('node:path');

require('./build.js');

const output = path.join(__dirname, 'web-dist');
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'dist', 'PCRP Encoding and Data Quality Assessment Tool.html'), path.join(output, 'index.html'));
console.log('Vercel output: web-dist/index.html');
