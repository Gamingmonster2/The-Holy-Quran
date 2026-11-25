import fs from 'node:fs';
const ids = [562, 563, 564, 565, 566, 581, 572, 573, 574];
for (const id of ids) {
  const p = JSON.parse(fs.readFileSync(`data/export/posts/${id}.json`, 'utf8'));
  const text = String(p.content?.rendered || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 260);
  console.log(id, '|', p.slug, '|', p.link, '|', text);
}
