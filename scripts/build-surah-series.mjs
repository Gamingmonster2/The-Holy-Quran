import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * يكمل سلسلة «سورة … مكتوبة بخط كبير» لكل السور التي لا تملك نصاً كاملاً في الموقع.
 * البيانات مصدرها manifest.json وملفات السور في public/quran-gateway؛ لا يُ Invent
 * أي كلام خارج这些数据: العنوان والوصف مبنيان على اسم السورة وعدد آياتها فقط.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPORT = path.join(ROOT, 'data', 'export');
const DATA = path.join(ROOT, 'data');
const GATEWAY = path.join(ROOT, 'public', 'quran-gateway');
const REPORTS = path.join(ROOT, 'reports');
const SERIES_CATEGORY = 1134;
const FIRST_ID = 8001;
const PUBLISHED = '2026-11-26T00:00:00';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
const pad = (n) => String(n).padStart(3, '0');
const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const normalize = (s) => String(s || '')
  .replace(/[\u064b-\u0652\u0670]/g, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ة/g, 'ه')
  .replace(/ى/g, 'ي')
  .replace(/ؤ/g, 'و')
  .replace(/ئ/g, 'ي');

const manifest = readJson(path.join(GATEWAY, 'manifest.json'));
const byArabicName = new Map(manifest.map((s) => [normalize(s.nameAr), s.number]));
const index = readJson(path.join(EXPORT, 'index.json'));
const categories = readJson(path.join(EXPORT, 'categories.json'));
const translationsFile = path.join(DATA, 'translations.json');
const translations = fs.existsSync(translationsFile)
  ? readJson(translationsFile)
  : { posts: {}, terms: {} };
translations.posts ||= {};
translations.terms ||= {};

// السور التي لها أصلاً نص كامل داخل إحدى المقالات (سواء كانت في التصنيف المستهدف أو غيره).
const covered = new Map();
for (const file of fs.readdirSync(path.join(EXPORT, 'posts'))) {
  if (!file.endsWith('.json')) continue;
  const post = readJson(path.join(EXPORT, 'posts', file));
  const html = post.content?.rendered || '';
  if (!/quran_gateway_by_sora/.test(html)) continue;
  const match = html.match(/sora_title[^>]*>([^<]+)<\/h2>/);
  if (!match) continue;
  const arabicPart = match[1].split('-').pop().trim();
  const number = byArabicName.get(normalize(arabicPart));
  if (number && !covered.has(number)) {
    covered.set(number, {
      id: post.id,
      title: post.title?.rendered || '',
      inSeries: (post.categories || []).includes(SERIES_CATEGORY),
    });
  }
}

const inSeries = new Set();
for (const file of fs.readdirSync(path.join(EXPORT, 'posts'))) {
  if (!file.endsWith('.json')) continue;
  const post = readJson(path.join(EXPORT, 'posts', file));
  if ((post.categories || []).includes(SERIES_CATEGORY)) inSeries.add(post.id);
}

const alreadyGenerated = new Map();
for (const file of fs.readdirSync(path.join(EXPORT, 'posts'))) {
  if (!file.endsWith('.json')) continue;
  const post = readJson(path.join(EXPORT, 'posts', file));
  if (!post.qbSeriesSurah) continue;
  const translation = translations.posts[String(post.id)] || {};
  alreadyGenerated.set(post.qbSeriesSurah, {
    id: post.id,
    surah: post.qbSeriesSurah,
    nameAr: manifest.find((s) => s.number === post.qbSeriesSurah)?.nameAr || '',
    arSlug: post.slug,
    enSlug: translation.englishSlug || '',
    arUrl: `/${post.slug}/`,
    enUrl: `/en/${translation.englishSlug || ''}/`,
  });
}
const missing = manifest.filter((s) => !covered.has(s.number) && !alreadyGenerated.has(s.number));
console.log(`سور لها نص كامل: ${covered.size} — داخل التصنيف ${SERIES_CATEGORY}: ${inSeries.size} — ناقصة: ${missing.length}`);

function arabicSlug(title, used) {
  const cleaned = String(title)
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  //WP يقطع السلغ عند 200 حرف؛ نقطع النص قبل الترميز حتى لا نكسر تسلسل UTF-8.
  while (cleaned.length && encodeURIComponent(cleaned).length > 200) cleaned = cleaned.slice(0, -1);
  cleaned = cleaned.replace(/-+$/g, '');
  let slug = encodeURIComponent(cleaned).replace(/%([0-9A-F]{2})/g, (_, h) => `%${h.toLowerCase()}`);
  const base = slug;
  let n = 2;
  while (used.has(slug)) slug = `${base}-${n++}`;
  used.add(slug);
  return slug;
}

function englishSlug(title, used) {
  const cleaned = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '') || 'surah';
  let slug = cleaned;
  let n = 2;
  while (used.has(slug)) slug = `${cleaned}-${n++}`;
  used.add(slug);
  return slug;
}

const usedOriginal = new Set(index.posts.map((p) => p.slug));
const usedEnglish = new Set(Object.values(translations.posts).map((p) => p.englishSlug).filter(Boolean));

const playerScript = (lang) => lang === 'ar'
  ? `<script type="text/javascript">
  function changesoundy(ID) {
    var sound_id = document.getElementById("quran_player_by_sora");
    sound_id.innerHTML = '<div style="margin-top:15px;"><audio controls autoplay><source src="'+ID+'" type="audio/mpeg">متصفحك لا يدعم عنصر الصوت</audio><br /><a href="'+ID+'">تنزيل الملف</a></div>';
  }
</script>`
  : `<script type="text/javascript">
  function changesoundy(ID) {
    var sound_id = document.getElementById("quran_player_by_sora");
    sound_id.innerHTML = '<div style="margin-top:15px;"><audio controls autoplay><source src="'+ID+'" type="audio/mpeg">Your browser does not support the audio element.</audio><br /><a href="'+ID+'">Download this file</a></div>';
  }
</script>`;

function bodyHtml(surah, data, lang) {
  const shortEn = surah.nameEn.split('(')[0].trim();
  const label = lang === 'ar' ? surah.nameAr : shortEn;
  const intro = lang === 'ar'
    ? `نقدم سورة ${surah.nameAr} مكتوبة بخط كبير، وعدد آياتها ${surah.verses}، مع تلاوة صوتية آية بآية.`
    : `Surah ${shortEn} written in large font. It has ${surah.verses} verses, with audio recitation for each verse.`;
  const basmala = lang === 'ar'
    ? 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'
    : 'In the name of Allah, the Most Gracious, the Most Merciful';
  const title = lang === 'ar' ? `سورة ${surah.nameAr}` : `Surah ${shortEn}`;
  const audioBase = data.audio[lang];
  const verses = data.verses.map((v) => {
    const src = `${audioBase}/${pad(surah.number)}${pad(v.n)}.mp3`;
    const text = escapeHtml(v[lang]);
    return `<div class="quran_gateway_by_sora"><div class="aya_${lang}_by_sora" onclick="changesoundy('${src}');">${text} <span class="sora_name_by_sora">${escapeHtml(label)} [${v.n}]</span></div></div>`;
  }).join('');
  return `<p class="wp-block-paragraph">${escapeHtml(intro)}</p>\n\n\n`
    + `<div style="background-color: #EAEAEA; padding: 15px; text-align: center;">\n`
    + `    <h2 style="color: #000000; font-family: 'Traditional Arabic', Arial, sans-serif; margin: 0;">${basmala}</h2>\n`
    + `</div>\n\n\n`
    + `<p>${playerScript(lang)}<h2 class="sora_title">${escapeHtml(title)}</h2>`
    + `<div id="quran_player_by_sora"></div>${verses}</p>\n`;
}

const generated = [];
for (const surah of missing) {
  const data = readJson(path.join(GATEWAY, 'surahs', `${surah.number}.json`));
  if (!Array.isArray(data.verses) || data.verses.length !== surah.verses) {
    console.warn(`تخطي ${surah.number}: عدد الآيات في الملف (${data.verses?.length}) لا يطابق البيانات`);
    continue;
  }
  const shortEn = surah.nameEn.split('(')[0].trim();
  const id = FIRST_ID + alreadyGenerated.size + generated.length;
  if (index.posts.some((p) => p.id === id) || fs.existsSync(path.join(EXPORT, 'posts', `${id}.json`))) {
    console.warn(`تخطي ${surah.number}: المعرّف ${id} مستخدم بالفعل`);
    continue;
  }
  const arTitle = `سورة ${surah.nameAr} مكتوبة بخط كبير: ${surah.verses} آية مع الترجمة الإنجليزية`;
  const enTitle = `Surah ${shortEn} written in large font: ${surah.verses} verses with English translation`;
  const arDescription = `اقرأ سورة ${surah.nameAr} مكتوبة بخط كبير، وعدد آياتها ${surah.verses}، مع تلاوة صوتية آية بآية.`;
  const enDescription = `Read Surah ${shortEn} in large font. It has ${surah.verses} verses, with audio recitation for each verse.`;
  const ar = bodyHtml(surah, data, 'ar');
  const en = bodyHtml(surah, data, 'en');
  const arIntro = `<p>${escapeHtml(`نقدم سورة ${surah.nameAr} مكتوبة بخط كبير، وعدد آياتها ${surah.verses}، مع تلاوة صوتية آية بآية.`)}</p>\n`;
  const enIntro = `<p>${escapeHtml(`Surah ${shortEn} written in large font. It has ${data.verses.length} verses, with audio recitation for each verse.`)}</p>\n`;
  const slug = arabicSlug(arTitle, usedOriginal);
  const link = `https://quranbook.org/${slug}/`;
  const published = new Date(new Date(PUBLISHED).getTime() + generated.length * 60000).toISOString().slice(0, 19);
  const coverIndex = (surah.number % 10) + 1;
  const cover = `/img/quran-covers/quran-${String(coverIndex).padStart(2, '0')}.jpg`;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: arTitle,
    datePublished: `${published}+00:00`,
    dateModified: `${published}+00:00`,
    mainEntityOfPage: link,
    inLanguage: 'ar',
    image: `https://quranbook.org${cover}`,
    articleSection: ['سور القران مع الترجمه الانجليزيه'],
  };
  const post = {
    id,
    date: `${published}+00:00`,
    modified: `${published}+00:00`,
    slug,
    status: 'publish',
    link,
    title: { rendered: arTitle },
    content: { rendered: ar, protected: false },
    excerpt: { rendered: arIntro, protected: false },
    featured_media: 0,
    categories: [SERIES_CATEGORY],
    tags: [],
    yoast_head_json: {
      title: arTitle,
      description: arDescription,
      canonical: link,
      og_locale: 'ar_AR',
      og_type: 'article',
      og_title: arTitle,
      og_description: arDescription,
      og_url: link,
      og_site_name: 'Quran Book',
      og_image: [{ width: 1200, height: 630, url: `https://quranbook.org${cover}`, type: 'image/jpeg' }],
      twitter_card: 'summary_large_image',
      robots: { index: 'index', follow: 'follow' },
      schema,
    },
    qbSeriesSurah: surah.number,
  };
  writeJson(path.join(EXPORT, 'posts', `${id}.json`), post);
  index.posts.push({
    id,
    slug,
    link,
    date: post.date,
    modified: post.modified,
    title: arTitle,
    file: `posts/${id}.json`,
  });
  const enSlug = englishSlug(enTitle, usedEnglish);
  translations.posts[String(id)] = {
    ar: {
      title: arTitle,
      html: ar,
      excerpt: arIntro,
      seoTitle: arTitle,
      seoDescription: arDescription,
    },
    en: {
      title: enTitle,
      html: en,
      excerpt: enIntro,
      seoTitle: enTitle,
      seoDescription: enDescription,
    },
    englishSlug: enSlug,
    originalPath: `/${slug}/`,
    series: true,
    surah: surah.number,
  };
  generated.push({ id, surah: surah.number, nameAr: surah.nameAr, arSlug: slug, enSlug, arUrl: `/${slug}/`, enUrl: `/en/${enSlug}/` });
}

index.counts.posts = index.posts.length;
const category = categories.find((c) => c.id === SERIES_CATEGORY);
if (category) {
  category.count = index.posts.filter((p) => {
    const file = path.join(EXPORT, p.file);
    if (!fs.existsSync(file)) return false;
    return (readJson(file).categories || []).includes(SERIES_CATEGORY);
  }).length;
}
writeJson(path.join(EXPORT, 'index.json'), index);
writeJson(path.join(EXPORT, 'categories.json'), categories);
writeJson(translationsFile, translations);

fs.mkdirSync(REPORTS, { recursive: true });
const allGenerated = [...alreadyGenerated.values(), ...generated].sort((a, b) => a.surah - b.surah);
const coveredInSeries = [...covered.values()].filter((v) => v.inSeries).length;
const report = {
  generatedAt: new Date().toISOString(),
  category: SERIES_CATEGORY,
  postsInCategory: inSeries.size,
  coveredSurahs: [...covered.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, value]) => ({ number, title: value.title, inTargetCategory: value.inSeries })),
  generated: allGenerated,
};
writeJson(path.join(REPORTS, 'surah-series.json'), report);
const ids = allGenerated.map((g) => g.id);
const md = [
  '# سلسلة السور المكتوبة بخط كبير',
  '',
  `- المقالات الموجودة في التصنيف ${SERIES_CATEGORY} قبل الإضافة: **${inSeries.size - allGenerated.length}** مقالاً تمثل **${coveredInSeries}** سورة.`,
  `- سور لها نص كامل في الموقع قبل الإضافة: **${covered.size}**.`,
  `- سور ناقصة تمت إضافتها: **${allGenerated.length}**.`,
  `- المعرّفات المستخدمة: ${ids.length ? `${Math.min(...ids)}–${Math.max(...ids)}` : 'لا شيء'}.`,
  '',
  '## السور التي تمت إضافتها',
  '',
  ...allGenerated.map((g) => `- ${g.surah}. ${g.nameAr} — [عربي](${g.arUrl}) / [إنجليزي](${g.enUrl})`),
  '',
];
fs.writeFileSync(path.join(REPORTS, 'surah-series.md'), md.join('\n'), 'utf8');
console.log(`generated ${generated.length} new surahs (${allGenerated.length} total); report: ${path.join(REPORTS, 'surah-series.md')}`);
