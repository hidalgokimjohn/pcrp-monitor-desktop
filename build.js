// Builds "PCRP Encoding and Data Quality Assessment Tool.html": one offline file that runs the Encoding
// Monitor's own computation (Code.js, Store.js, WebApp.js) and Data Health page
// (JS_Health.html) in the browser, on KCIS exports the user drops in.
//
//   node build.js [path to the monitor workbook .xlsx]
//
// The built-in Baseline and Activities come from that workbook (default:
// ../PCRP-Stage-1-Encoding-Monitor/_PCRP Encoding Monitor.xlsx). Rebuild
// whenever the monitor's code or the baseline changes.
//
// The repo is self-contained: when the monitor project or the workbook is not
// next to it, the build uses vendor/monitor/ (a cleaned copy of the monitor
// files it needs) and data/reference.json (Baseline + Activities only; the
// workbook itself holds KCIS personal data and is never committed). Both are
// refreshed from the originals whenever those are present.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const HERE = __dirname;
// The monitor project: PCRP_MONITOR_SRC when set (e.g. the clasp folder), else the folder next to this one.
const MONITOR_SRC = process.env.PCRP_MONITOR_SRC || path.join(HERE, '..', 'PCRP-Stage-1-Encoding-Monitor');
const VENDOR = path.join(HERE, 'vendor', 'monitor');
const REFERENCE = path.join(HERE, 'data', 'reference.json');
const WORKBOOK = process.argv[2] || path.join(MONITOR_SRC, '_PCRP Encoding Monitor.xlsx');
const OUT = path.join(HERE, 'dist', 'PCRP Encoding and Data Quality Assessment Tool.html');
const OUT_LEGACY = path.join(HERE, 'dist', 'PCRP Monitor Desktop.html');
const MONITOR_FILES = ['Code.js', 'Store.js', 'WebApp.js', 'JS_Health.html', 'JS_Core.html', 'JS_Modals.html', 'Styles.html'];

// Secrets of the web app that the desktop app does not need: the default editor
// passkey (the fallback in getEditorPasskey_) and the Google Sheet ID (the
// fallback in ss_). They are found by pattern, so their values are never
// written in this repo, removed from the vendored copy and the build, and the
// build fails if any survives.
const SECRET_PATTERNS = {
  'WebApp.js': /(function getEditorPasskey_\(\)[\s\S]*?return )'([^']+)'(;\s*\n\})/,
  'Store.js': /(getProperty\('SHEET_ID'\)\s*\|\|\s*)'([^']+)'/
};
const FORBIDDEN = [];
function scrub(file, text) {
  const re = SECRET_PATTERNS[file];
  if (!re) return text;
  const m = re.exec(text);
  if (m && m[2]) FORBIDDEN.push(m[2]);
  return text.replace(re, file === 'WebApp.js' ? "$1''$3" : "$1''");
}

// Refresh vendor/monitor from the monitor project when it is next to us.
if (fs.existsSync(MONITOR_SRC)) {
  fs.mkdirSync(VENDOR, { recursive: true });
  MONITOR_FILES.forEach(f => fs.writeFileSync(path.join(VENDOR, f), scrub(f, fs.readFileSync(path.join(MONITOR_SRC, f), 'utf8'))));
}
if (!fs.existsSync(path.join(VENDOR, 'Code.js'))) throw new Error('Monitor code not found: neither ' + MONITOR_SRC + ' nor ' + VENDOR);
const MONITOR = VENDOR;

// ---- xlsx (zip + XML) reader, Node side --------------------------------
function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Not a zip file: ' + WORKBOOK);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const lnlen = buf.readUInt16LE(off + 26), lxlen = buf.readUInt16LE(off + 28);
    const data = buf.subarray(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize);
    files[name] = () => (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    p += 46 + nlen + xlen + clen;
  }
  return files;
}
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
function readWorkbook(file, wanted) {
  const z = unzip(fs.readFileSync(file));
  const shared = [];
  if (z['xl/sharedStrings.xml']) {
    const x = z['xl/sharedStrings.xml'](); const re = /<si>([\s\S]*?)<\/si>/g; let m;
    while ((m = re.exec(x))) { let t = ''; const tr = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g; let q; while ((q = tr.exec(m[1]))) t += q[1]; shared.push(decode(t)); }
  }
  const rels = {}; z['xl/_rels/workbook.xml.rels']().replace(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g, (s, id, t) => { rels[id] = t; });
  z['xl/_rels/workbook.xml.rels']().replace(/<Relationship [^>]*Target="([^"]+)"[^>]*Id="([^"]+)"/g, (s, t, id) => { rels[id] = rels[id] || t; });
  const out = {};
  z['xl/workbook.xml']().replace(/<sheet [^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"/g, (s, name, id) => {
    name = decode(name);
    if (wanted.indexOf(name) === -1) return;
    const target = rels[id].replace(/^\/?xl\//, '');
    const xml = z['xl/' + target]();
    const rows = []; const rr = /<row [^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g; let r;
    while ((r = rr.exec(xml))) {
      const row = []; const cr = /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let c;
      while ((c = cr.exec(r[1] || ''))) {
        let idx = 0; for (const ch of c[1]) idx = idx * 26 + ch.charCodeAt(0) - 64; idx--;
        const type = (/t="([^"]+)"/.exec(c[2]) || [])[1] || 'n'; const v = /<v>([\s\S]*?)<\/v>/.exec(c[3] || '');
        let val = '';
        if (type === 's' && v) val = shared[+v[1]];
        else if (type === 'inlineStr') { const t = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(c[3] || ''); val = t ? decode(t[1]) : ''; }
        else if (type === 'b' && v) val = v[1] === '1';
        else if (type === 'str' && v) val = decode(v[1]);
        else if (v) val = Number(v[1]);
        while (row.length < idx) row.push(''); row[idx] = val;
      }
      rows.push(row);
    }
    const headers = rows[0] || [];
    out[name] = { headers, rows: rows.slice(1).filter(x => x.some(v => v !== '' && v !== null)).map(x => { while (x.length < headers.length) x.push(''); return x; }) };
  });
  return out;
}

// ---- pieces from the monitor --------------------------------------------
const read = (f) => scrub(f, fs.readFileSync(path.join(MONITOR, f), 'utf8'));
const script = (f) => read(f).replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '');
const styles = read('Styles.html').replace(/\r\n/g, '\n');
const dhStart = styles.indexOf('/* ===================================================================\n   DATA HEALTH (dh-)');
const dhCss = styles.slice(dhStart, styles.lastIndexOf('</style>'));
if (dhStart < 0) throw new Error('Data Health styles not found in Styles.html');
const core = read('JS_Core.html');
function grab(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error(name + ' not found');
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; }
  return src.slice(i, j + 1);
}
const version = (/version:\s*'([^']+)'/.exec(read('JS_Modals.html')) || [])[1] || '';

// Baseline + Activities: from the workbook when it is here (and saved to
// data/reference.json), otherwise from data/reference.json.
let ref;
if (fs.existsSync(WORKBOOK)) {
  const wb = readWorkbook(WORKBOOK, ['Baseline', 'Activities']);
  if (!wb.Baseline || !wb.Activities) throw new Error('The workbook needs Baseline and Activities tabs');
  ref = { source: path.basename(WORKBOOK), extractedAt: new Date().toISOString(), Baseline: wb.Baseline, Activities: wb.Activities };
  fs.mkdirSync(path.dirname(REFERENCE), { recursive: true });
  fs.writeFileSync(REFERENCE, JSON.stringify(ref));
} else if (fs.existsSync(REFERENCE)) {
  ref = JSON.parse(fs.readFileSync(REFERENCE, 'utf8'));
} else {
  throw new Error('No baseline: pass the monitor workbook (node build.js "path/to/workbook.xlsx") or keep data/reference.json');
}
const builtIn = {
  source: ref.source,
  builtAt: new Date().toISOString(),
  monitorVersion: version,
  Baseline: ref.Baseline,
  Activities: ref.Activities
};

// "</" inside inline scripts must not close the <script> element
const safe = (js) => js.replace(/<\/(script)/gi, '<\\/$1');
const tpl = fs.readFileSync(path.join(HERE, 'src', 'app.html'), 'utf8');
const html = tpl
  .replace('/*@@APP_CSS@@*/', () => fs.readFileSync(path.join(HERE, 'src', 'app.css'), 'utf8'))
  .replace('/*@@DH_CSS@@*/', () => dhCss)
  .replace('/*@@BUILT_IN@@*/', () => 'var BUILT_IN = ' + safe(JSON.stringify(builtIn)) + ';')
  .replace('/*@@STORE@@*/', () => safe(fs.readFileSync(path.join(HERE, 'src', 'store.js'), 'utf8')))
  .replace('/*@@CRYPTO@@*/', () => safe(fs.readFileSync(path.join(HERE, 'src', 'crypto.js'), 'utf8')))
  .replace('/*@@DELTA@@*/', () => safe(fs.readFileSync(path.join(HERE, 'src', 'delta.js'), 'utf8')))
  .replace('/*@@VIRTUAL_TABLE@@*/', () => safe(fs.readFileSync(path.join(HERE, 'src', 'virtual-table.js'), 'utf8')))
  .replace('/*@@WORKER@@*/', () => safe(fs.readFileSync(path.join(HERE, 'src', 'worker.js'), 'utf8')))
  .replace('/*@@MONITOR@@*/', () => safe(['Code.js', 'Store.js', 'WebApp.js'].map(read).join('\n;\n')))
  .replace('/*@@CORE@@*/', () => safe(['esc', 'n', 'pct', 'normSearch', 'labelFor'].map(f => grab(core, f)).join('\n')))
  .replace('/*@@RUNTIME@@*/', () => safe(fs.readFileSync(path.join(HERE, 'src', 'runtime.js'), 'utf8')))
  .replace('/*@@HEALTH@@*/', () => safe(script('JS_Health.html')))
  .replace('/*@@APP@@*/', () => safe(fs.readFileSync(path.join(HERE, 'src', 'app.js'), 'utf8')))
  .replace('/*@@PEOPLE@@*/', () => safe(fs.readFileSync(path.join(HERE, 'src', 'people.js'), 'utf8')))
  .replace('/*@@VERIFY@@*/', () => safe(fs.readFileSync(path.join(HERE, 'src', 'verify.js'), 'utf8')))
  .replace('/*@@GSAP@@*/', () => {
    const gsapPath = path.join(HERE, 'vendor', 'gsap.min.js');
    return fs.existsSync(gsapPath) ? safe(fs.readFileSync(gsapPath, 'utf8')) : '';
  })
  .replace('/*@@SAVED@@*/', () => safe(fs.readFileSync(path.join(HERE, 'src', 'saved.js'), 'utf8')))
  .replace(/@@VERSION@@/g, version);

const leaked = FORBIDDEN.filter(s => html.indexOf(s) !== -1 || MONITOR_FILES.some(f => fs.readFileSync(path.join(VENDOR, f), 'utf8').indexOf(s) !== -1));
if (leaked.length) throw new Error('Build stopped: a web app secret is still in the output (' + leaked.length + ' item). Update SCRUB in build.js.');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
fs.writeFileSync(OUT_LEGACY, html);
console.log('Built', OUT, '(' + Math.round(html.length / 1024) + ' KB) · monitor v' + version +
  ' · baseline ' + ref.Baseline.rows.length + ' rows · activities ' + ref.Activities.rows.length + ' · secrets removed');
