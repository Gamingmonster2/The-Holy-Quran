import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPORT = path.join(ROOT, 'data', 'export');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'reports');
fs.mkdirSync(OUT, { recursive: true });

const CHECK_EXTERNAL = process.argv.includes('--check-external');
const SAMPLE_EXTERNAL = process.argv.includes('--external-sample');
const EXTERNAL_SAMPLE = Number(process.env.EXTERNAL_SAMPLE || 5);
const CONCURRENCY = Number(process.env.CONCURRENCY || 8);
const TIMEOUT = Number(process.env.TIMEOUT || 12000);

const NAMED = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', hellip: '…',
  ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
};
const decode = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&(amp|quot|apos|lt|gt|nbsp|hellip|ndash|mdash|rsquo|lsquo|rdquo|ldquo);/gi,
    (_, n) => NAMED[n.toLowerCase()] || ' ')
  .replace(/&[a-z]+;/gi, ' ');

/** النص المرئي فقط: بلا وسوم، بلا script/style، وبلا رموز قصيرة مكتوبة بين [ ]. */
function visibleText(html) {
  return decode(String(html || '')
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[[^\]]{1,120}\]/g, ' '))
    .replace(/\s+/g, ' ').trim();
}

function langStats(text) {
  const s = String(text || '');
  let ar = 0;
  let la = 0;
  let other = 0;
  for (const ch of s.match(/\p{L}/gu) || []) {
    if (/[\u0600-\u06FF]/.test(ch)) ar++;
    else if (/[A-Za-z]/.test(ch)) la++;
    else other++;
  }
  let lang = 'neutral';
  if (ar && (la || other)) lang = 'mixed';
  else if (ar) lang = 'ar';
  else if (la) lang = 'en';
  else if (other) lang = 'other';
  return { ar, la, other, lang };
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

const index = readJson('data/export/index.json');
const articleAudit = fs.existsSync(path.join(OUT, 'articles-audit.json'))
  ? readJson('reports/articles-audit.json')
  : { rows: [] };
const auditById = new Map(articleAudit.rows.map((r) => [r.id, r]));

// ---------------------------------------------------------------------------
// 1) تداخل اللغات في المقالات والصفحات
// ---------------------------------------------------------------------------
function inspectItem(item, kind) {
  const fullPath = path.join(EXPORT, item.file);
  if (!fs.existsSync(fullPath)) return null;
  const data = readJson(path.relative(ROOT, fullPath));
  const title = decode(data.title?.rendered || item.title || '');
  const content = visibleText(data.content?.rendered || '');
  const excerpt = visibleText(data.excerpt?.rendered || '');
  const seo = visibleText(data.yoast_head_json?.description || '');
  const combined = [title, content, excerpt, seo].join(' ');
  const stats = {
    title: langStats(title),
    content: langStats(content),
    excerpt: langStats(excerpt),
    seo: langStats(seo),
    overall: langStats(combined),
  };
  const flags = [];
  if (stats.title.lang === 'mixed') flags.push('mixed_title');
  if (stats.content.lang === 'mixed') flags.push('mixed_content');
  if (stats.seo.lang === 'mixed' || stats.excerpt.lang === 'mixed') flags.push('mixed_meta');
  if (stats.overall.lang === 'en') flags.push('english_item');
  if (stats.overall.lang === 'mixed') flags.push('mixed_item');
  return {
    id: data.id,
    kind,
    title,
    url: data.link || item.link,
    date: data.date,
    modified: data.modified,
    contentPreview: content.slice(0, 180),
    stats,
    flags,
  };
}

const items = [
  ...index.posts.map((p) => inspectItem(p, 'post')),
  ...index.pages.map((p) => inspectItem(p, 'page')),
].filter(Boolean);

const language = {
  posts: items.filter((x) => x.kind === 'post'),
  pages: items.filter((x) => x.kind === 'page'),
};
function langSummary(rows) {
  const out = {};
  for (const key of ['ar', 'en', 'mixed', 'other', 'neutral']) {
    out[key] = rows.filter((r) => r.stats.overall.lang === key).length;
  }
  out.mixedTitle = rows.filter((r) => r.flags.includes('mixed_title')).length;
  out.mixedContent = rows.filter((r) => r.flags.includes('mixed_content')).length;
  out.mixedMeta = rows.filter((r) => r.flags.includes('mixed_meta')).length;
  return out;
}
language.summary = {
  posts: langSummary(language.posts),
  pages: langSummary(language.pages),
};

// القالب نفسه: لغة واجهة واحدة مفروضة على كل الصفحات حالياً.
const layout = fs.readFileSync(path.join(ROOT, 'src', 'layouts', 'BaseLayout.astro'), 'utf8');
const uiLabels = [...layout.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
const footerLabels = [...layout.matchAll(/\['([^']+)',\s*'([^']+)'\]/g)].map((m) => m[1]);
language.template = {
  htmlLang: (layout.match(/<html\s+lang="([^"]+)"/) || [])[1] || '',
  dir: (layout.match(/<html[^>]+dir="([^"]+)"/) || [])[1] || '',
  navLabels: uiLabels.map((label) => ({ label, lang: langStats(label).lang })),
  footerLabels: footerLabels.map((label) => ({ label, lang: langStats(label).lang })),
  hardcodedArabicInterface: true,
};

// ---------------------------------------------------------------------------
// 2) حداثة المحتوى والمقالات التي تحتوي فيديو
// ---------------------------------------------------------------------------
const now = new Date('2026-11-26T00:00:00Z');
const since6 = new Date('2026-05-26T00:00:00Z');
const since3 = new Date('2026-08-26T00:00:00Z');
const postsWithDates = language.posts.map((p) => ({
  ...p,
  audit: auditById.get(p.id) || null,
  dateObj: new Date(p.date),
}));
const inRange = (p, from) => p.dateObj >= from && p.dateObj <= now;
const recency = {
  cutoff6Months: since6.toISOString().slice(0, 10),
  cutoff3Months: since3.toISOString().slice(0, 10),
  postsLast6Months: postsWithDates.filter((p) => inRange(p, since6)).length,
  postsLast3Months: postsWithDates.filter((p) => inRange(p, since3)).length,
  byMonth: {},
  videoPostsAll: postsWithDates.filter((p) => p.audit?.hasVideo).length,
  videoOnlyAll: postsWithDates.filter((p) => p.audit?.issues?.includes('video_only')).length,
  videoPostsLast6Months: postsWithDates.filter((p) => inRange(p, since6) && p.audit?.hasVideo).length,
  veryThinAll: postsWithDates.filter((p) => p.audit?.issues?.includes('very_thin_prose')).length,
};
for (let y = 2026; y <= 2026; y++) {
  for (let m = 1; m <= 12; m++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const n = postsWithDates.filter((p) => p.dateObj.toISOString().startsWith(key)).length;
    if (n) recency.byMonth[key] = n;
  }
}
// خطة مبدئية: آخر 3 أشهر تقويمية كاملة قبل ديسمبر 2026 (سبتمبر/أكتوبر/نوفمبر).
const plannedDates = [];
for (const [ym, count] of [['2026-09', 7], ['2026-10', 7], ['2026-11', 6]]) {
  for (let i = 0; i < count; i++) {
    const day = 3 + i * 4;
    plannedDates.push(`${ym}-${String(day).padStart(2, '0')}T10:00:00Z`);
  }
}
recency.newArticlePlan = {
  assumption: 'آخر 3 أشهر تقويمية كاملة عند الإطلاق: سبتمبر/أكتوبر/نوفمبر 2026، بواقع 7/7/6 مقالات',
  total: plannedDates.length,
  dates: plannedDates,
};

// ---------------------------------------------------------------------------
// 3) فحص الروابط والموارد محلياً
// ---------------------------------------------------------------------------
const htmlFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) htmlFiles.push(p);
  }
})(DIST);

const localMissing = new Map();
const externalUrls = new Set();
const urlAttrRe = /(?:^|\s)(?:src|href)=["']([^"']+)["']/gi;
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  for (const m of html.matchAll(urlAttrRe)) {
    let url = m[1].split('#')[0].split('?')[0];
    if (!url || /^(?:data|blob|about|javascript|mailto|tel):/i.test(url)) continue;
    if (url.includes('${') || url.includes('{{')) continue;
    if (/^(https?:)?\/\//i.test(url)) {
      externalUrls.add(url);
      continue;
    }
    let decoded;
    try { decoded = decodeURIComponent(url); } catch { decoded = url; }
    if (!decoded.startsWith('/')) decoded = path.relative(DIST, path.resolve(path.dirname(file), decoded));
    const rel = decoded.replace(/^\/+/, '').replace(/\\/g, '/');
    if (!rel || rel.endsWith('/')) continue;
    const candidate = path.join(DIST, rel);
    const candidateIndex = path.join(DIST, rel, 'index.html');
    if (!fs.existsSync(candidate) && !fs.existsSync(candidateIndex) && !fs.existsSync(candidate + '.html')) {
      localMissing.set(url, (localMissing.get(url) || 0) + 1);
    }
  }
}

const hosts = new Map();
for (const u of externalUrls) {
  let host;
  try { host = new URL(u).hostname; } catch { host = 'unknown'; }
  hosts.set(host, (hosts.get(host) || 0) + 1);
}

let externalStatus = null;
if (CHECK_EXTERNAL || SAMPLE_EXTERNAL) {
  let urls = [...externalUrls];
  if (SAMPLE_EXTERNAL && !CHECK_EXTERNAL) {
    const byHost = new Map();
    for (const u of urls) {
      let host = 'unknown';
      try { host = new URL(u).hostname; } catch {}
      if (!byHost.has(host)) byHost.set(host, []);
      byHost.get(host).push(u);
    }
    urls = [...byHost.values()].flatMap((list) => list.slice(0, EXTERNAL_SAMPLE));
  }
  let cursor = 0;
  const checked = [];
  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      let result;
      try {
        const res = await fetch(url, {
          redirect: 'follow',
          signal: AbortSignal.timeout(TIMEOUT),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QuranBookLinkAudit/1.0)' },
        });
        result = { url, status: res.status, ok: res.status < 400 };
      } catch (e) {
        result = { url, status: 0, ok: false, error: String(e).slice(0, 160) };
      }
      checked.push(result);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const bad = checked.filter((r) => !r.ok);
  externalStatus = {
    mode: CHECK_EXTERNAL ? 'all' : 'sample',
    samplePerHost: CHECK_EXTERNAL ? null : EXTERNAL_SAMPLE,
    total: checked.length,
    ok: checked.filter((r) => r.ok).length,
    dead: bad.filter((r) => r.status === 404 || r.status === 410),
    blocked: bad.filter((r) => [401, 403, 429].includes(r.status)),
    network: bad.filter((r) => !r.status),
    other: bad.filter((r) => r.status && ![401, 403, 404, 410, 429].includes(r.status)),
  };
}

// روابط قديمة في بيانات التصدير تشير إلى quranbook.org وليست في المخزون الحالي.
const inventory = readJson('inventory/urls.json');
const knownPaths = new Set(inventory.map((u) => {
  try { return decodeURIComponent(new URL(u.url).pathname).replace(/\/+$/, '') || '/'; }
  catch { return ''; }
}));
const legacy = new Map();
const legacyAssets = new Map();
const isAssetPath = (p) => /^\/(?:wp-content|wp-includes|img|assets)\//i.test(p)
  || /\.(?:mp3|m4a|ogg|wav|aac|jpg|jpeg|png|gif|webp|svg|avif|ico|bmp|css|js|pdf|zip)$/i.test(p);
function scanLegacy(value, source) {
  if (!value) return;
  if (typeof value === 'object') {
    for (const v of Object.values(value)) scanLegacy(v, source);
    return;
  }
  if (typeof value !== 'string') return;
  for (const m of value.matchAll(/https?:\/\/(?:www\.)?quranbook\.org([^\s"'<>\\]+)/gi)) {
    const raw = m[1].replace(/&amp;/g, '&');
    let p;
    try { p = decodeURIComponent(new URL('https://quranbook.org' + raw).pathname); }
    catch { p = decodeURIComponent(raw.split(/[?#]/)[0]); }
    const norm = p.replace(/\/+$/, '') || '/';
    if (isAssetPath(norm)) {
      if (!legacyAssets.has(norm)) legacyAssets.set(norm, { path: norm, count: 0 });
      legacyAssets.get(norm).count++;
      continue;
    }
    if (!knownPaths.has(norm)) {
      const key = norm;
      if (!legacy.has(key)) legacy.set(key, { path: norm, count: 0, sources: new Set() });
      legacy.get(key).count++;
      legacy.get(key).sources.add(source);
    }
  }
}
for (const rel of ['data/export/index.json', 'data/export/categories.json', 'data/export/tags.json']) {
  const p = path.join(ROOT, rel);
  if (fs.existsSync(p)) scanLegacy(readJson(rel), rel);
}
for (const sub of ['posts', 'pages']) {
  const dir = path.join(EXPORT, sub);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    scanLegacy(readJson(`data/export/${sub}/${f}`), `${sub}/${f}`);
  }
}
const legacyAssetRows = [...legacyAssets.values()]
  .map((r) => ({
    ...r,
    local: fs.existsSync(path.join(DIST, r.path.replace(/^\/+/, '')))
      || fs.existsSync(path.join(ROOT, 'public', r.path.replace(/^\/+/, ''))),
  }))
  .sort((a, b) => b.count - a.count);
const legacyRows = [...legacy.values()].map((r) => ({ ...r, sources: [...r.sources] }))
  .sort((a, b) => b.count - a.count);

// ---------------------------------------------------------------------------
// 4) فحص SEO الأساسي في HTML المبني
// ---------------------------------------------------------------------------
const seo = {
  files: htmlFiles.length,
  lang: {},
  dir: {},
  missingTitle: [],
  missingDescription: [],
  missingCanonical: [],
  missingH1: [],
  multipleH1: [],
  missingJsonLd: [],
  missingOgImage: [],
};
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(DIST, file).replace(/\\/g, '/');
  const lang = (html.match(/<html[^>]+lang="([^"]+)"/) || [])[1] || '';
  const dir = (html.match(/<html[^>]+dir="([^"]+)"/) || [])[1] || '';
  seo.lang[lang] = (seo.lang[lang] || 0) + 1;
  seo.dir[dir] = (seo.dir[dir] || 0) + 1;
  if (!/<title>\s*\S/.test(html)) seo.missingTitle.push(rel);
  if (!/<meta[^>]+name=["']description["'][^>]+content=["']\s*\S/i.test(html)) seo.missingDescription.push(rel);
  if (!/<link[^>]+rel=["']canonical["']/i.test(html)) seo.missingCanonical.push(rel);
  const h1 = (html.match(/<h1\b/gi) || []).length;
  if (!h1) seo.multipleH1.push(rel);
  else if (h1 > 1) seo.multipleH1.push(rel);
  if (!/application\/ld\+json/.test(html)) seo.missingJsonLd.push(rel);
  if (!/property=["']og:image["']/i.test(html)) seo.missingOgImage.push(rel);
}
seo.counts = {
  missingTitle: seo.missingTitle.length,
  missingDescription: seo.missingDescription.length,
  missingCanonical: seo.missingCanonical.length,
  missingH1: seo.missingH1.length,
  multipleH1: seo.multipleH1.length,
  missingJsonLd: seo.missingJsonLd.length,
  missingOgImage: seo.missingOgImage.length,
};

const redirects = fs.existsSync(path.join(ROOT, 'public', '_redirects'))
  ? fs.readFileSync(path.join(ROOT, 'public', '_redirects'), 'utf8').split(/\r?\n/)
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  : [];

const result = {
  generatedAt: new Date().toISOString(),
  language,
  recency,
  links: {
    htmlFiles: htmlFiles.length,
    missingLocal: [...localMissing.entries()].sort((a, b) => b[1] - a[1]).map(([url, count]) => ({ url, count })),
    externalUnique: externalUrls.size,
    externalHosts: [...hosts.entries()].sort((a, b) => b[1] - a[1]).map(([host, count]) => ({ host, count })),
    externalStatus,
    legacyAssetPaths: {
      unique: legacyAssetRows.length,
      availableLocally: legacyAssetRows.filter((r) => r.local).length,
      missingLocally: legacyAssetRows.filter((r) => !r.local).length,
      missing: legacyAssetRows.filter((r) => !r.local).slice(0, 200),
    },
    legacyNotInSitemap: legacyRows,
    redirectRules: redirects,
  },
  seo,
};

fs.writeFileSync(path.join(OUT, 'phase1-audit.json'), JSON.stringify(result, null, 2), 'utf8');

// ---------------------------------------------------------------------------
// تقرير مقروء
// ---------------------------------------------------------------------------
const md = [];
const pct = (n, total) => total ? `${Math.round(100 * n / total)}%` : '0%';
md.push('# تقرير المرحلة الأولى — التدقيق قبل الإطلاق');
md.push('');
md.push(`تاريخ الفحص: ${result.generatedAt}`);
md.push('');
md.push('## 1) ازدواج اللغات — الأولوية القصوى');
md.push('');
md.push(`- المقالات: عربية خالصة **${language.summary.posts.ar}**، إنجليزية **${language.summary.posts.en}**، مختلطة **${language.summary.posts.mixed}**، لغات أخرى **${language.summary.posts.other}**، محايدة **${language.summary.posts.neutral}** من أصل ${language.posts.length}.`);
md.push(`- الصفحات: عربية خالصة **${language.summary.pages.ar}**، إنجليزية **${language.summary.pages.en}**، مختلطة **${language.summary.pages.mixed}**، أخرى **${language.summary.pages.other}**، محايدة **${language.summary.pages.neutral}** من أصل ${language.pages.length}.`);
md.push(`- عناوين مقالات مختلطة: **${language.summary.posts.mixedTitle}**، محتوى مقالات مختلط: **${language.summary.posts.mixedContent}**، وصف SEO مختلط: **${language.summary.posts.mixedMeta}**.`);
md.push(`- القالب الحالي يفرض \`lang="${language.template.htmlLang}" dir="${language.template.dir}"\` على كل الصفحات، ويستخدم قائمة وتذييلاً عربيين مفروضين على الصفحات الإنجليزية: ${language.template.navLabels.filter((x) => x.lang !== 'ar').length} عنصر إنجليزي/مختلط في القائمة، ${language.template.footerLabels.filter((x) => x.lang !== 'ar').length} في التذييل.`);
md.push('');
md.push('### صفحات إنجليزية/مختلطة');
for (const p of language.pages.filter((x) => x.stats.overall.lang !== 'ar').slice(0, 20)) {
  md.push(`- [${p.title}](${p.url}) — ${p.stats.overall.lang} (عربي ${p.stats.overall.ar} / لاتيني ${p.stats.overall.la})`);
}
md.push('');
md.push('### أمثلة مقالات مختلطة/إنجليزية');
for (const p of language.posts.filter((x) => x.stats.overall.lang !== 'ar').slice(0, 25)) {
  md.push(`- [${p.title}](${p.url}) — ${p.stats.overall.lang} — ${p.contentPreview.slice(0, 120)}`);
}
md.push('');
md.push('## 2) حداثة المحتوى والفيديو');
md.push('');
md.push(`- خلال آخر 6 أشهر (من ${recency.cutoff6Months}): **${recency.postsLast6Months}** مقالاً فقط.`);
md.push(`- خلال آخر 3 أشهر (من ${recency.cutoff3Months}): **${recency.postsLast3Months}** مقالاً.`);
md.push(`- مقالات فيها فيديو: **${recency.videoPostsAll}**، منها **${recency.videoOnlyAll}** بلا نص تحريري كافٍ.`);
md.push(`- مقالات نصها التحريري شديد القلة: **${recency.veryThinAll}**.`);
md.push(`- خطة الـ 20 مقالاً الجديدة: ${recency.newArticlePlan.assumption}؛ سيتم بناؤها من بيانات موجودة داخل الموقع فقط (سور، تلاوات، مصاحف، تفاسير) دون ادعاءات خارجية.`);
md.push('');
md.push('## 3) الروابط وإعادة التوجيه');
md.push('');
md.push(`- صفحات HTML مفحوصة: **${result.links.htmlFiles}**.`);
md.push(`- روابط/أصول محلية مفقودة: **${result.links.missingLocal.length}**.`);
md.push(`- روابط خارجية فريدة: **${result.links.externalUnique}** على ${result.links.externalHosts.length} نطاقاً.`);
if (externalStatus) {
  md.push(`- فحص خارجي ${externalStatus.mode === 'sample' ? `عَيّنة (${externalStatus.samplePerHost} لكل نطاق)` : 'كامل'}: **${externalStatus.ok}/${externalStatus.total}** ناجح، **${externalStatus.dead.length}** رابط ميت (404/410)، **${externalStatus.blocked.length}** محجوب بـ anti-bot (401/403/429، غير حاسم)، **${externalStatus.network.length}** تعذّر اتصال/مهلة (غير حاسم).`);
  for (const r of externalStatus.dead.slice(0, 15)) md.push(`  - ${r.status} ${r.url}`);
}
md.push(`- مسارات وسائط قديمة (\`wp-content\`, \`img\`, ...) في البيانات الأصلية: **${result.links.legacyAssetPaths.unique}**؛ منها **${result.links.legacyAssetPaths.missingLocally}** غير موجود محلياً.`);
md.push(`- روابط صفحات قديمة تشير إلى quranbook.org وغير موجودة في خريطة الموقع: **${result.links.legacyNotInSitemap.length}** عنواناً فريداً.`);
for (const r of result.links.legacyNotInSitemap.slice(0, 15)) md.push(`  - ${r.path} (${r.count})`);
md.push(`- قواعد إعادة التوجيه الحالية: **${result.links.redirectRules.length}** (كلها لمسارات ووردبريس/خلاصة الموقع).`);
md.push('');
md.push('## 4) SEO الأساسي');
md.push('');
md.push(`- لغة HTML: ${Object.entries(seo.lang).map(([k, v]) => `\`${k || 'فارغ'}\` ${v}`).join('، ')}.`);
md.push(`- اتجاه HTML: ${Object.entries(seo.dir).map(([k, v]) => `\`${k || 'فارغ'}\` ${v}`).join('، ')}.`);
for (const [key, label] of [
  ['missingTitle', 'عنوان مفقود'], ['missingDescription', 'وصف SEO مفقود'],
  ['missingCanonical', 'canonical مفقود'], ['missingH1', 'H1 مفقود'],
  ['multipleH1', 'أكثر من H1'], ['missingJsonLd', 'JSON-LD مفقود'],
  ['missingOgImage', 'og:image مفقود'],
]) md.push(`- ${label}: **${seo.counts[key]}** ${pct(seo.counts[key], seo.files)}`);
md.push('');
md.push('## القرار');
md.push('');
md.push('لا يتم أي رفع للإنتاج ولا حذف للاستضافة القديمة في هذه المرحلة. تُصلح أولاً اللغة، ثم المحتوى الجديد ونصوص الفيديو، ثم الروابط والتوجيه والتحقق النهائي.');
fs.writeFileSync(path.join(OUT, 'phase1-audit.md'), md.join('\n') + '\n', 'utf8');

console.log(`reports written to ${OUT}`);
console.log(`language posts ${JSON.stringify(language.summary.posts)}`);
console.log(`language pages ${JSON.stringify(language.summary.pages)}`);
console.log(`missing local ${result.links.missingLocal.length}, legacy ${result.links.legacyNotInSitemap.length}, external ${result.links.externalUnique}`);
console.log(`seo ${JSON.stringify(seo.counts)}`);
