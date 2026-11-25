import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const EXPORT = path.join(ROOT, 'data', 'export');
const INVENTORY = fs.existsSync(path.join(ROOT, 'inventory', 'urls.json'))
  ? path.join(ROOT, 'inventory', 'urls.json')
  : path.resolve(ROOT, '..', 'inventory', 'urls.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function urlPath(link) {
  try {
    // Cloudflare Pages يفك ترميز مسار الطلب قبل مطابقته للملفات الثابتة،
    // لذلك يجب تخزين المجلدات بالاسم العربي المفكوك مع إبقاء الروابط في
    // خريطة الموقع والـ canonical كما هي في الموقع الأصلي.
    return decodeURIComponent(new URL(link).pathname);
  } catch {
    try {
      return new URL(link).pathname;
    } catch {
      return '/';
    }
  }
}
function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 1) بناء خريطة: معرّف ووردبريس → المسار الأصلي الدقيق (percent-encoded كما هو)
const moves = [];

for (const file of fs.readdirSync(path.join(EXPORT, 'posts'))) {
  if (!file.endsWith('.json')) continue;
  const post = readJson(path.join(EXPORT, 'posts', file));
  moves.push({
    from: path.join(DIST, 'generated', 'post', String(post.id), 'index.html'),
    target: urlPath(post.link),
    kind: 'post',
    id: post.id,
  });
}
for (const file of fs.readdirSync(path.join(EXPORT, 'pages'))) {
  if (!file.endsWith('.json')) continue;
  const page = readJson(path.join(EXPORT, 'pages', file));
  moves.push({
    from: path.join(DIST, 'generated', 'page', String(page.id), 'index.html'),
    target: urlPath(page.link),
    kind: 'page',
    id: page.id,
  });
}
for (const type of ['categories', 'tags']) {
  for (const term of readJson(path.join(EXPORT, `${type}.json`))) {
    const folder = type === 'categories' ? 'category' : 'tag';
    moves.push({
      from: path.join(DIST, 'generated', folder, String(term.id), 'index.html'),
      target: urlPath(term.link),
      kind: folder,
      id: term.id,
    });
  }
}

// 2) نقل كل صفحة إلى مسارها الأصلي حرفياً
let moved = 0;
const missing = [];
const occupied = new Set();
for (const move of moves) {
  // /blog/ هي صفحة الأرشيف؛ صفحة ووردبريس بالمعرّف 49 فارغة المحتوى،
  // لذلك نبقي قائمة المقالات التي يبنيها Astro ولا نسمح للقالب بالكتابة فوقها.
  if (move.target === '/blog/' && (move.kind === 'post' || move.kind === 'page')) continue;
  // الصفحة الرئيسية تُبنى في index.astro مع إبقاء محتواها الأصلي داخل التصميم الجديد
  if (move.target === '/' && move.kind === 'page') continue;
  if (!fs.existsSync(move.from)) {
    missing.push(`${move.kind}/${move.id}`);
    continue;
  }
  const destDir = path.join(DIST, move.target.replace(/^\//, ''));
  const dest = path.join(destDir, 'index.html');
  if (occupied.has(dest.toLowerCase())) continue;
  occupied.add(dest.toLowerCase());
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(move.from, dest);
  fs.rmSync(path.dirname(move.from), { recursive: true, force: true });
  moved++;
}
fs.rmSync(path.join(DIST, 'generated'), { recursive: true, force: true });
console.log(`تم نقل ${moved} صفحة إلى مساراتها الأصلية`);
if (missing.length) console.log(`مفقود من البناء: ${missing.length} → ${missing.slice(0, 10).join(', ')}`);

// 3) صفحات المؤلفين من خريطة الموقع (غير متوفرة في REST المصدّر)
const inventory = readJson(INVENTORY);
const authorUrls = inventory.filter((u) => u.sitemap.includes('author-sitemap')).map((u) => u.url);
for (const url of authorUrls) {
  const rel = decodeURIComponent(new URL(url).pathname).replace(/^\//, '');
  const dest = path.join(DIST, rel, 'index.html');
  if (fs.existsSync(dest)) continue;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(
    dest,
    '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
      '<meta name="robots" content="noindex,follow"><title>المؤلف</title></head>' +
      '<body><h1>صفحة المؤلف</h1><p><a href="/blog/">العودة إلى المقالات</a></p></body></html>',
    'utf8',
  );
}

// 4) خريطة الموقع وملف الروبوت
const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  inventory
    .map(
      (u) =>
        `  <url><loc>${xmlEscape(u.url)}</loc>${u.lastmod ? `<lastmod>${xmlEscape(u.lastmod)}</lastmod>` : ''}</url>`,
    )
    .join('\n') +
  '\n</urlset>\n';
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap, 'utf8');

// خريطة منفصلة لصفحات السور المستقلة؛ خريطة الـ1968 رابطاً الأصلية تبقى كما هي
const quranManifest = JSON.parse(
  fs.readFileSync(path.join(DIST, 'quran-gateway', 'manifest.json'), 'utf8'),
);
const quranSitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  quranManifest
    .map((s) => `  <url><loc>https://quranbook.org/quran/${s.number}/</loc></url>`)
    .join('\n') +
  '\n  <url><loc>https://quranbook.org/quran/</loc></url>\n' +
  '</urlset>\n';
fs.writeFileSync(path.join(DIST, 'quran-sitemap.xml'), quranSitemap, 'utf8');
fs.writeFileSync(
  path.join(DIST, 'robots.txt'),
  'User-agent: *\nAllow: /\nSitemap: https://quranbook.org/sitemap.xml\nSitemap: https://quranbook.org/quran-sitemap.xml\n',
  'utf8',
);

// 6) خلاصة RSS من أحدث 50 مقالة
const postsForFeed = [];
for (const file of fs.readdirSync(path.join(EXPORT, 'posts'))) {
  if (!file.endsWith('.json')) continue;
  postsForFeed.push(readJson(path.join(EXPORT, 'posts', file)));
}
postsForFeed.sort((a, b) => (a.date < b.date ? 1 : -1));
const feedItems = postsForFeed.slice(0, 50).map((p) => {
  const y = p.yoast_head_json || {};
  return (
    '  <item>\n' +
    `    <title>${xmlEscape((p.title && p.title.rendered) || '')}</title>\n` +
    `    <link>${xmlEscape(p.link)}</link>\n` +
    `    <guid isPermaLink="true">${xmlEscape(p.link)}</guid>\n` +
    `    <pubDate>${xmlEscape(p.date)}</pubDate>\n` +
    `    <description>${xmlEscape(y.description || '')}</description>\n` +
    '  </item>'
  );
});
fs.writeFileSync(
  path.join(DIST, 'feed.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0"><channel>\n' +
    '<title>QuranBook</title>\n<link>https://quranbook.org</link>\n' +
    '<description>مكتبة القرآن الكريم</description>\n' +
    feedItems.join('\n') +
    '\n</channel></rss>\n',
  'utf8',
);

// 5) تحقق: كل رابط في خريطة الموقع يجب أن يكون له ملف
const missingUrls = inventory.filter((u) => {
  const rel = decodeURIComponent(new URL(u.url).pathname).replace(/^\//, '');
  return !fs.existsSync(path.join(DIST, rel, 'index.html'));
});
console.log(`خريطة الموقع: ${inventory.length} رابط — المفقود: ${missingUrls.length}`);
if (missingUrls.length) {
  fs.writeFileSync(
    path.join(ROOT, 'missing-urls.json'),
    JSON.stringify(missingUrls.map((u) => u.url), null, 2),
    'utf8',
  );
  console.log(`قائمة المفقودين: ${path.join(ROOT, 'missing-urls.json')}`);
}
console.log(`البناء النهائي: ${DIST}`);
