import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');
const htmlFiles = [];
const cssFiles = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) htmlFiles.push(p);
    else if (e.name.endsWith('.css')) cssFiles.push(p);
  }
}
walk(DIST);

const localMissing = new Map();
const remoteImages = new Map();
const remoteMedia = new Map();
const remoteLinks = new Map();
const remoteStyles = new Map();
const imgTagRe = /<(img|source|script|link|iframe|a)\b[^>]*?(?:src|href)=["']([^"']+)["'][^>]*>/gi;
const attrRe = /(?:^|\s)(?:src|href)=["']([^"']+)["']/gi;
const cssUrlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
const external = /^(https?:)?\/\//i;
const media = /\.(?:mp3|m4a|ogg|wav|aac)(?:[?#]|$)/i;
const imageFile = /\.(?:png|jpe?g|gif|webp|svg|avif|ico|bmp)(?:[?#]|$)/i;
const stylesheet = /fonts\.googleapis\.com|fonts\.gstatic\.com|\.css(?:[?#]|$)/i;

function cssKind(url) {
  if (media.test(url) || imageFile.test(url)) return 'image';
  if (stylesheet.test(url)) return 'style';
  return 'other';
}

function record(url, sourceDir = DIST, kind = 'image') {
  url = url.split('#')[0].split('?')[0];
  if (!url || /^(?:data|blob|about|javascript|mailto|tel):/i.test(url)) return;
  if (url.includes('${') || url.includes('{{')) return;
  if (!external.test(url) && !url.startsWith('/') && !/[./]/.test(url)) return;
  if (external.test(url)) {
    if (kind === 'link') {
      if (/quranbook\.org/i.test(url)) remoteLinks.set(url, (remoteLinks.get(url) || 0) + 1);
    } else if (kind === 'style') {
      remoteStyles.set(url, (remoteStyles.get(url) || 0) + 1);
    } else if (kind === 'image') {
      if (media.test(url)) remoteMedia.set(url, (remoteMedia.get(url) || 0) + 1);
      else remoteImages.set(url, (remoteImages.get(url) || 0) + 1);
    }
    return;
  }
  const absolute = url.startsWith('/');
  let decoded;
  try { decoded = decodeURIComponent(url); } catch { decoded = url; }
  const rel = (absolute ? decoded.replace(/^\/+/, '') : path.relative(DIST, path.resolve(sourceDir, decoded))).replace(/\\/g, '/');
  if (!rel || rel.endsWith('/')) return;
  const candidate = path.join(DIST, rel);
  const candidateIndex = path.join(DIST, rel, 'index.html');
  if (!fs.existsSync(candidate) && !fs.existsSync(candidateIndex) && !fs.existsSync(candidate + '.html')) {
    localMissing.set(url, (localMissing.get(url) || 0) + 1);
  }
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  for (const m of html.matchAll(imgTagRe)) {
    const tag = m[1].toLowerCase();
    for (const a of m[0].matchAll(attrRe)) {
      const url = a[1].split('#')[0].split('?')[0];
      const kind = tag === 'a' ? 'link' : (tag === 'img' || tag === 'source' ? 'image' : 'other');
      record(url, path.dirname(file), kind);
    }
  }
  for (const m of html.matchAll(cssUrlRe)) record(m[2], path.dirname(file), cssKind(m[2]));
}
for (const file of cssFiles) {
  const css = fs.readFileSync(file, 'utf8');
  for (const m of css.matchAll(cssUrlRe)) record(m[2], path.dirname(file), cssKind(m[2]));
}

function top(map, n = 25) { return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n); }
console.log('html files', htmlFiles.length);
console.log('css files', cssFiles.length);
console.log('--- missing local resources', localMissing.size);
for (const [u, c] of top(localMissing)) console.log(c, u);
console.log('--- remote images', remoteImages.size);
for (const [u, c] of top(remoteImages, 40)) console.log(c, u);
console.log('--- remote audio (original external media)', remoteMedia.size);
for (const [u, c] of top(remoteMedia, 20)) console.log(c, u);
console.log('--- remote styles (google fonts)', remoteStyles.size);
for (const [u, c] of top(remoteStyles, 10)) console.log(c, u);
console.log('--- remote quranbook.org links', remoteLinks.size);
for (const [u, c] of top(remoteLinks, 20)) console.log(c, u);
fs.writeFileSync('reports/resources-audit.json', JSON.stringify({
  localMissing: Object.fromEntries(localMissing),
  remoteImages: Object.fromEntries(remoteImages),
  remoteMedia: Object.fromEntries(remoteMedia),
  remoteStyles: Object.fromEntries(remoteStyles),
  remoteLinks: Object.fromEntries(remoteLinks),
}, null, 2), 'utf8');
