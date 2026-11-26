import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'reports');
fs.mkdirSync(OUT, { recursive: true });

const readText = (rel) => fs.readFileSync(path.join(DIST, rel), 'utf8');
const count = (text, pattern) => (String(text).match(pattern) || []).length;
const decode = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&(amp|quot|apos|lt|gt|nbsp|hellip|ndash|mdash|rsquo|lsquo|rdquo|ldquo);/gi,
    (_, n) => ({
      amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', hellip: '…',
      ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
    }[n.toLowerCase()] || ' '))
  .replace(/&[a-z]+;/gi, ' ');

function visibleText(html) {
  let body = (html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i) || [])[1] || html;
  // مبدّل اللغة يحمل اسم اللغة الهدف بلغتها، وهو عنصر تحكم لا نص مقال.
  body = body.replace(/<a[^>]+class=["'][^"']*qb-lang-switch[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, ' ');
  return decode(body
    .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}

function counts(text) {
  return {
    ar: count(text, /[\u0600-\u06FF]/g),
    la: count(text, /[A-Za-z]/g),
  };
}

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) files.push(p);
  }
})(DIST);

const translations = fs.existsSync(path.join(ROOT, 'data', 'translations.json'))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'translations.json'), 'utf8'))
  : { posts: {} };
const seriesIds = new Set(Object.entries(translations.posts || {})
  .filter(([, v]) => v.series)
  .map(([id]) => id));
const mixedIds = new Set(Object.keys(translations.posts || {}).filter((id) => !seriesIds.has(id)));
const EMPTY_IDS = ['562', '563', '564', '565', '566', '581'];
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'export', 'index.json'), 'utf8'));
const postByRel = new Map();
for (const p of index.posts) {
  try {
    const rel = decodeURIComponent(new URL(p.link).pathname).replace(/^\//, '') + 'index.html';
    postByRel.set(rel, String(p.id));
  } catch { /* روابط معطوبة في المصدر الأصلي */ }
}

const seo = {
  files: files.length,
  missingDescription: 0,
  missingJsonLd: 0,
  missingCanonical: 0,
  multipleH1: 0,
};
const langFiles = { ar: 0, en: 0, other: 0 };
const purity = {
  englishPages: [],
  mixedArabicPages: [],
  englishWithArabic: 0,
  mixedArabicWithLatin: 0,
};
const builtIds = new Set();
const builtEnglishSlugs = new Set();

for (const file of files) {
  const rel = path.relative(DIST, file).replace(/\\/g, '/');
  const html = fs.readFileSync(file, 'utf8');
  const lang = (html.match(/<html[^>]+lang=["']([^"']+)["']/) || [])[1] || '';
  langFiles[lang === 'en' ? 'en' : lang === 'ar' ? 'ar' : 'other']++;
  if (!/<meta[^>]+name=["']description["'][^>]+content=["']\s*\S/i.test(html)) seo.missingDescription++;
  if (!/application\/ld\+json/.test(html)) seo.missingJsonLd++;
  if (!/<link[^>]+rel=["']canonical["']/i.test(html)) seo.missingCanonical++;
  if (count(html, /<h1\b/gi) !== 1) seo.multipleH1++;

  const postId = postByRel.get(rel);
  if (postId) builtIds.add(postId);
  const enMatch = rel.match(/^en\/([^/]+)\/index\.html$/);
  if (enMatch) builtEnglishSlugs.add(enMatch[1]);

  const text = visibleText(html);
  const article = (html.match(/<article\b[^>]*class=["'][^"']*qb-article[^"']*["'][^>]*>([\s\S]*?)<\/article>/i) || [])[1] || '';
  // نقيس نقاء اللغة في نص المقال نفسه؛ عناصر الواجهة المشتركة (الشريط الجانبي
  // والتصنيفات الإنجليزية القادمة من الموقع الأصلي) ليست جزءاً من النص المترجم.
  const stats = counts(article ? visibleText(article) : text);
  if (lang === 'en') {
    if (stats.ar > 0) {
      purity.englishWithArabic++;
      if (purity.englishPages.length < 40) purity.englishPages.push({ path: rel, ar: stats.ar, la: stats.la });
    }
  } else if (postId && (mixedIds.has(postId) || seriesIds.has(postId))) {
    if (stats.la > 0) {
      purity.mixedArabicWithLatin++;
      if (purity.mixedArabicPages.length < 40) purity.mixedArabicPages.push({ path: rel, ar: stats.ar, la: stats.la });
    }
  }
}

const sitemaps = {
  main: count(readText('sitemap.xml'), /<loc>/g),
  quran: count(readText('quran-sitemap.xml'), /<loc>/g),
  english: count(readText('sitemap-en.xml'), /<loc>/g),
  series: fs.existsSync(path.join(DIST, 'sitemap-series.xml'))
    ? count(readText('sitemap-series.xml'), /<loc>/g) : 0,
  seriesEn: fs.existsSync(path.join(DIST, 'sitemap-series-en.xml'))
    ? count(readText('sitemap-series-en.xml'), /<loc>/g) : 0,
};
const robots = readText('robots.txt');
const redirects = fs.readFileSync(path.join(ROOT, 'public', '_redirects'), 'utf8')
  .split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));

const result = {
  generatedAt: new Date().toISOString(),
  built: {
    htmlFiles: files.length,
    arabicPostPages: [...builtIds].filter((id) => !mixedIds.has(id) && !seriesIds.has(id)).length,
    mixedArabicPostPages: [...builtIds].filter((id) => mixedIds.has(id)).length,
    seriesPostPages: [...builtIds].filter((id) => seriesIds.has(id)).length,
    englishPostPages: builtEnglishSlugs.size,
    emptyPostsBuilt: EMPTY_IDS.filter((id) => builtIds.has(id)),
  },
  sitemaps,
  robots: {
    sitemapEn: robots.includes('sitemap-en.xml'),
    seriesSitemaps: robots.includes('sitemap-series.xml') && robots.includes('sitemap-series-en.xml'),
    quranSitemap: robots.includes('quran-sitemap.xml'),
  },
  langFiles,
  seo,
  purity,
  redirects: {
    total: redirects.length,
    emptyPostRedirects: EMPTY_IDS.filter((id) => redirects.some((l) => l.trim().startsWith(`/${id}-2/`))).length,
  },
};
fs.writeFileSync(path.join(OUT, 'phase2-audit.json'), JSON.stringify(result, null, 2), 'utf8');

const md = [
  '# تقرير المرحلة الثانية — اللغة والSEO بعد البناء',
  '',
  `تاريخ الفحص: ${result.generatedAt}`,
  '',
  '## البناء',
  '',
  `- ملفات HTML: **${result.built.htmlFiles}**.`,
  `- مقالات عربية أصلية: **${result.built.arabicPostPages}**.`,
  `- مقالات مختلطة أصبحت عربية خالصة: **${result.built.mixedArabicPostPages}**.`,
  `- مقالات سلسلة السور الجديدة (عربي): **${result.built.seriesPostPages}**.`,
  `- نسخ إنجليزية جديدة: **${result.built.englishPostPages}** (منها ${result.built.seriesPostPages} للسلسلة).`,
  `- المقالات الستة الفارغة المبنية: **${result.built.emptyPostsBuilt.length}** (المتوقع 0).`,
  '',
  '## اللغة',
  '',
  `- صفحات lang="ar": **${langFiles.ar}**، lang="en": **${langFiles.en}**.`,
  `- صفحات إنجليزية فيها حروف عربية: **${purity.englishWithArabic}**.`,
  `- نسخ عربية من المقالات المختلطة فيها حروف لاتينية: **${purity.mixedArabicWithLatin}**.`,
  '',
  '## SEO',
  '',
  `- وصف مفقود: **${seo.missingDescription}**.`,
  `- JSON-LD مفقود: **${seo.missingJsonLd}**.`,
  `- canonical مفقود: **${seo.missingCanonical}**.`,
  `- صفحات ليس لها H1 واحد: **${seo.multipleH1}**.`,
  '',
  '## خرائط الموقع والتوجيه',
  '',
  `- sitemap.xml: **${sitemaps.main}** رابطاً (يجب 1968).`,
  `- quran-sitemap.xml: **${sitemaps.quran}** رابطاً (يجب 115).`,
  `- sitemap-en.xml: **${sitemaps.english}** رابطاً (يجب 307).`,
  `- sitemap-series.xml: **${sitemaps.series}** رابطاً، sitemap-series-en.xml: **${sitemaps.seriesEn}** رابطاً.`,
  `- robots يشير إلى خرائط السلسلة: **${robots.seriesSitemaps ? 'نعم' : 'لا'}**.`,
  `- إعادة توجيه المقالات الستة الفارغة: **${result.redirects.emptyPostRedirects}/6**.`,
  '',
];
fs.writeFileSync(path.join(OUT, 'phase2-audit.md'), md.join('\n'), 'utf8');
console.log(`reports written to ${OUT}`);
console.log(`sitemaps ${JSON.stringify(sitemaps)}`);
console.log(`built ${JSON.stringify(result.built)}`);
console.log(`purity en-ar ${purity.englishWithArabic}, mixed-ar-la ${purity.mixedArabicWithLatin}`);
console.log(`seo ${JSON.stringify(seo)}`);
