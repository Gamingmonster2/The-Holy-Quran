import fs from 'node:fs';
const rows = JSON.parse(fs.readFileSync('reports/articles-audit.json', 'utf8')).rows;
const list = rows.filter((r) => r.issues.includes('uncategorized'));
console.log('count', list.length);
for (const r of list) {
  const flags = [r.hasVideo && 'video', r.hasAudio && 'audio', r.hasGateway && 'gateway', r.hasImage && 'image'].filter(Boolean).join('+') || 'text';
  console.log([
    r.id,
    r.title.replace(/\s+/g, ' ').slice(0, 90),
    `[${flags}]`,
    `p${r.proseWords}`,
    `img${r.featuredMedia}`,
    `tags:${r.tags.join(',') || '-'}`,
  ].join(' | '));
}
