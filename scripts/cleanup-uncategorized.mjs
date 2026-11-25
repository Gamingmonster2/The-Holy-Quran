import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POSTS_DIR = path.join(ROOT, 'data', 'export', 'posts');

// Reassign posts that WordPress left in the default "Uncategorized" category.
// Only existing, well-populated categories are used; no new terms are created
// so the preserved sitemap (inventory/urls.json) stays untouched at 1968 URLs.
const ASSIGN = {
  // Khushu' / selected recitations and individual reciters.
  86: 42, 97: 42, 98: 42, 114: 42, 128: 42, 129: 42,
  132: 42, 133: 42, 134: 42, 135: 42, 136: 42, 137: 42,
  138: 42, 139: 42, 140: 42, 143: 42, 145: 42, 146: 42,
  147: 42, 153: 42, 155: 42, 158: 42, 159: 42, 160: 42,
  161: 42, 162: 42, 163: 42, 164: 42, 165: 42, 166: 42,
  168: 42, 210: 42, 223: 42, 412: 42, 452: 42, 473: 42,
  557: 42, 570: 42, 6006: 42,
  // Various recitations / poems / untitled video posts / empty content.
  93: 456, 96: 456, 562: 456, 563: 456, 564: 456, 565: 456,
  566: 456, 581: 456,
  // General Islamic articles and Islamic-framed videos.
  568: 441, 569: 441, 571: 441, 572: 441, 573: 441, 574: 441,
  578: 441, 6052: 441,
  // Quran general topics.
  576: 428, 4886: 428,
  // Dua at sickness.
  580: 8,
  // Books / PDFs.
  87: 10, 6366: 956,
  // Takbirat.
  6371: 142,
  // English surah pages with gateway audio.
  6206: 1134, 6207: 1134, 6208: 1134, 6209: 1134, 6215: 1134,
};

let changed = 0;
const skipped = [];
for (const [idStr, target] of Object.entries(ASSIGN)) {
  const id = Number(idStr);
  const file = path.join(POSTS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) {
    skipped.push(`${id}: missing file`);
    continue;
  }
  const post = JSON.parse(fs.readFileSync(file, 'utf8'));
  const before = post.categories || [];
  if (!before.includes(1)) {
    skipped.push(`${id}: no Uncategorized category`);
    continue;
  }
  post.categories = [...new Set(before.map((c) => (c === 1 ? target : c)))];
  fs.writeFileSync(file, `${JSON.stringify(post, null, 2)}\n`, 'utf8');
  changed++;
}

console.log(`تم تحديث ${changed} مقال من أصل ${Object.keys(ASSIGN).length}`);
if (skipped.length) console.log(`تخطي: ${skipped.join(' | ')}`);
