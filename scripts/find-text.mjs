import fs from 'node:fs';
import path from 'node:path';
const needle = process.argv[2] || 'صوت الملك';
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const hits = [];
for (const f of walk('dist')) {
  const h = fs.readFileSync(f, 'utf8');
  const i = h.indexOf(needle);
  if (i >= 0) hits.push({ f, ctx: h.slice(Math.max(0, i - 180), i + 260) });
}
console.log('count', hits.length);
for (const h of hits.slice(0, 8)) console.log('\nFILE', h.f, '\n', h.ctx);
