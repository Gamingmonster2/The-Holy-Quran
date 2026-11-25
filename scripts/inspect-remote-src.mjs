import fs from 'node:fs';
import path from 'node:path';
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const re = /<(?:img|source)[^>]*\ssrc=["'](https?:[^"']+)["']/gi;
const hits = [];
for (const f of walk('dist')) {
  const h = fs.readFileSync(f, 'utf8');
  for (const m of h.matchAll(re)) hits.push({ file: f, url: m[1] });
}
console.log('total', hits.length);
for (const h of hits.slice(0, 30)) console.log(h.file, h.url.slice(0, 140));
