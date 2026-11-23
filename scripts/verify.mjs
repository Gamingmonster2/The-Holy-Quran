import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const INVENTORY = fs.existsSync(path.join(ROOT, 'inventory', 'urls.json'))
  ? path.join(ROOT, 'inventory', 'urls.json')
  : path.resolve(ROOT, '..', 'inventory', 'urls.json');

const inventory = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
const missing = inventory.filter((u) => {
  const rel = decodeURIComponent(new URL(u.url).pathname).replace(/^\//, '');
  return !fs.existsSync(path.join(DIST, rel, 'index.html'));
});
console.log('روابط مفقودة:', missing.length);

const sample = path.join(
  DIST,
  decodeURIComponent('/%d8%b3%d9%88%d8%b1%d8%a9-%d8%a7%d9%84%d8%a5%d8%b3%d8%b1%d8%a7%d8%a1-%d9%85%d9%83%d8%aa%d9%88%d8%a8%d8%a9').replace(/^\//, ''),
  'index.html',
);
if (fs.existsSync(sample)) {
  const html = fs.readFileSync(sample, 'utf8');
  console.log('JSON-LD موجود:', html.includes('application/ld+json'));
  console.log('robots موجود:', html.includes('name="robots"'));
  console.log('صورة محلية:', html.includes('/wp-content/uploads/'));
  console.log('حجم الصفحة:', html.length);
} else {
  console.log('عينة المقالة غير موجودة');
}
console.log('sitemap:', fs.existsSync(path.join(DIST, 'sitemap.xml')));
console.log('feed:', fs.existsSync(path.join(DIST, 'feed.xml')));
