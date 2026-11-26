import fs from 'node:fs';
import path from 'node:path';
import REMOTE_ASSETS from '../data/remote-assets.json';

const DATA = path.resolve(process.cwd(), 'data', 'export');
const PUBLIC = path.resolve(process.cwd(), 'public');
const REMOTE_MAP = new Map(Object.entries(REMOTE_ASSETS));
const TRANSLATIONS_FILE = path.resolve(process.cwd(), 'data', 'translations.json');

/** المقالات الستة بلا نص مرئي: تُستبعد من البناء وتُعاد توجيهها إلى الرئيسية. */
const EMPTY_POST_IDS = new Set([562, 563, 564, 565, 566, 581]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const translations = fs.existsSync(TRANSLATIONS_FILE)
  ? readJson(TRANSLATIONS_FILE)
  : { posts: {}, terms: {} };
translations.posts ||= {};
translations.terms ||= {};

const AR_LETTER = /[\u0600-\u06FF]/;

function detectLang(...values) {
  const text = values.join(' ');
  const ar = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const la = (text.match(/[A-Za-z]/g) || []).length;
  return ar > la ? 'ar' : 'en';
}
function urlPath(link) {
  try {
    return new URL(link).pathname;
  } catch {
    return '/';
  }
}

function rewritePlainUrl(url) {
  return String(url || '')
    .replace(/https?:\/\/quranbook\.org\/wp-content\/uploads\//gi, '/wp-content/uploads/')
    .replace(/https?:\/\/quranbook\.org\//gi, '/')
    // Quran Gateway يستدعي الصوت عبر http؛ نرفعه إلى https لتفادي حظر المحتوى المختلط
    .replace(/http:\/\/www\.qurantranslations\.net\//gi, 'https://www.qurantranslations.net/');
}

function assetExists(localPath) {
  if (!localPath || !localPath.startsWith('/')) return false;
  const rel = safeDecode(localPath).replace(/^\/+/, '');
  if (!rel) return false;
  return fs.existsSync(path.join(PUBLIC, rel));
}

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

/** يعيد المسار المحلي لرابط صورة/صوت أصلي بعد تنزيله، أو سلسلة فارغة */
export function localAsset(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const stripped = raw.split(/[?#]/)[0];
  const mapped = REMOTE_MAP.get(raw) || REMOTE_MAP.get(stripped);
  if (mapped) return mapped;
  const rewritten = rewritePlainUrl(raw);
  if (rewritten.startsWith('/') && assetExists(rewritten)) return rewritten;
  return '';
}

/** عشر صور للمصحف وحده (بلا أشخاص أو أيدٍ) تُوزَّع بالتناوب على المقالات بلا صورة */
export const CURATED_COVERS = Array.from(
  { length: 10 },
  (_, i) => `/img/quran-covers/quran-${String(i + 1).padStart(2, '0')}.jpg`,
);

export function curatedCover(seed = '') {
  const key = String(seed || 'quran');
  let hash = 7;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return CURATED_COVERS[hash % CURATED_COVERS.length];
}

/** يحلّ رابط الصورة إلى مسار محلي مؤكد الوجود، مع احتفاظ بالرابط الأصلي إن وُجد */
export function resolveAsset(url, fallback = '') {
  const local = localAsset(url);
  if (local) return local;
  const rewritten = rewritePlainUrl(url);
  if (/^https?:\/\//i.test(rewritten)) return rewritten;
  return fallback;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** تحويل روابط الموقع القديم إلى مسارات محلية تعمل على أي دومين */
export function rewriteHtml(html) {
  if (!html) return '';
  const originals = [];
  let out = String(html).replace(
    /<(img|source|video|audio)\b([^>]*?)src=(["'])([^"']+)\3([^>]*)>/gi,
    (full, tag, before, quote, src, after) => {
      // بعض المقالات القديمة كتبت مسار الصورة نسبياً img/... فيُرفع إلى جذر الموقع
      const source = /^(?:img|wp-content)\//i.test(src) ? `/${src}` : src;
      const local = localAsset(source);
      if (!local) return full;
      const token = `QBORIGINAL${originals.length}QB`;
      originals.push(src);
      return `<${tag}${before}src=${quote}${local}${quote} data-original-src=${quote}${token}${quote}${after}>`;
    },
  );
  out = out
    .replace(/https?:\/\/quranbook\.org\/wp-content\/uploads\//gi, '/wp-content/uploads/')
    .replace(/https?:\/\/quranbook\.org\//gi, '/')
    .replace(/http:\/\/www\.qurantranslations\.net\//gi, 'https://www.qurantranslations.net/');
  // الروابط داخل og:image وقوائم <option> وسكربتات المقالات القديمة
  // نتخطى المفاتيح النسبية لأنها عولجت أعلاه عبر src، وقد تطابق جزءًا من
  // مسار محلي already /img/... فتنتج //img/...
  for (const [remote, local] of REMOTE_MAP) {
    if (!remote.startsWith('/') && !/^https?:\/\//i.test(remote)) continue;
    const pattern = new RegExp(`${escapeRegExp(remote)}(?:\\?[^"'\\s<>]*)?(?:#[^"'\\s<>]*)?`, 'g');
    out = out.replace(pattern, local);
  }
  // قالب المقالة يضع H1 للعنوان؛ عناوين المحتوى الأصلية تُنزّل إلى H2 حتى لا
  // يظهر أكثر من H1 في الصفحة (32 صفحة كانت تعاني من ذلك).
  out = out.replace(/<h1\b/gi, '<h2').replace(/<\/h1>/gi, '</h2>');
  return out.replace(/QBORIGINAL(\d+)QB/g, (_, i) => originals[Number(i)] || '');
}

let postsCache = null;
let englishPostsCache = null;

function basePost(p, full, translated) {
  const y = full.yoast_head_json || {};
  const originalTitle = p.title || (full.title && full.title.rendered) || '';
  const title = (translated && translated.title) || originalTitle;
  const html = rewriteHtml((translated && translated.html) || (full.content && full.content.rendered));
  const excerpt = rewriteHtml((translated && translated.excerpt) || (full.excerpt && full.excerpt.rendered));
  return {
    id: p.id,
    slug: p.slug,
    path: urlPath(p.link),
    title,
    date: p.date,
    modified: p.modified,
    html,
    excerpt,
    seoTitle: translated ? (translated.seoTitle || title) : (y.title || p.title || ''),
    seoDescription: translated ? translated.seoDescription : (y.description || ''),
    canonical: y.canonical || p.link,
    ogImage: rewritePlainUrl((y.og_image && y.og_image[0] && y.og_image[0].url) || ''),
    schema: translated ? null : (y.schema || null),
    robots: y.robots
      ? Object.entries(y.robots).map(([k, v]) => `${k}:${v}`).join(',')
      : '',
    categories: full.categories || [],
    tags: full.tags || [],
  };
}

export function getPosts() {
  if (postsCache) return postsCache;
  const index = readJson(path.join(DATA, 'index.json'));
  postsCache = index.posts
    .filter((p) => !EMPTY_POST_IDS.has(Number(p.id)))
    .map((p) => {
      const full = readJson(path.join(DATA, p.file));
      const translation = translations.posts[String(p.id)];
      const post = basePost(p, full, translation && translation.ar);
      post.lang = translation ? 'ar' : detectLang(post.title, plainText(post.html).slice(0, 600));
      if (translation) {
        post.englishPath = `/en/${translation.englishSlug}/`;
        post.alternates = [
          { lang: 'ar', href: p.link },
          { lang: 'en', href: `https://quranbook.org${post.englishPath}` },
        ];
      }
      return post;
    });
  return postsCache;
}

/** النسخ الإنجليزية للمقالات المختلطة: 307 مقالاً في مسارات /en/ مستقلة. */
export function getEnglishPosts() {
  if (englishPostsCache) return englishPostsCache;
  englishPostsCache = getPosts()
    .filter((p) => translations.posts[String(p.id)] && p.englishPath)
    .map((p) => {
      const translation = translations.posts[String(p.id)];
      const english = { ...p };
      english.path = p.englishPath;
      english.title = translation.en.title || `Quran Book article ${p.id}`;
      english.html = rewriteHtml(translation.en.html || '');
      english.excerpt = rewriteHtml(translation.en.excerpt || '');
      english.seoTitle = translation.en.seoTitle || english.title;
      english.seoDescription = translation.en.seoDescription || `English version of the Arabic article from Quran Book (${p.id}).`;
      english.canonical = `https://quranbook.org${p.englishPath}`;
      english.schema = null;
      english.lang = 'en';
      english.englishVersion = true;
      english.alternates = [
        { lang: 'ar', href: translations.posts[String(p.id)].originalPath || p.canonical },
        { lang: 'en', href: english.canonical },
      ];
      return english;
    });
  return englishPostsCache;
}

let pagesCache = null;

export function getPages() {
  if (pagesCache) return pagesCache;
  const index = readJson(path.join(DATA, 'index.json'));
  pagesCache = index.pages.map((p) => {
    const full = readJson(path.join(DATA, p.file));
    const y = full.yoast_head_json || {};
    const title = p.title || (full.title && full.title.rendered) || '';
    const html = rewriteHtml(full.content && full.content.rendered);
    return {
      id: p.id,
      slug: p.slug,
      path: urlPath(p.link),
      title,
      lang: detectLang(title, plainText(html).slice(0, 800)),
      html,
      seoTitle: y.title || p.title || '',
      seoDescription: y.description || '',
      canonical: y.canonical || p.link,
      ogImage: y.og_image && y.og_image[0] ? rewritePlainUrl(y.og_image[0].url) : '',
      schema: y.schema || null,
      robots: y.robots
        ? Object.entries(y.robots).map(([k, v]) => `${k}:${v}`).join(',')
        : '',
    };
  });
  return pagesCache;
}

const termsCache = {};

export function getTerms(type) {
  if (termsCache[type]) return termsCache[type];
  const list = readJson(path.join(DATA, `${type}.json`));
  termsCache[type] = list.map((t) => {
    const translated = translations.terms[String(t.id)];
    return {
      id: t.id,
      slug: t.slug,
      name: t.name || '',
      englishName: translated?.en || '',
      count: t.count || 0,
      path: urlPath(t.link),
      type,
    };
  });
  return termsCache[type];
}

export function getTermName(type, id) {
  const terms = getTerms(type);
  const found = terms.find((t) => t.id === id);
  return found ? found.name : '';
}

export function plainText(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getCover(post) {
  const html = post.html || post.content || '';
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  const candidates = [post.ogImage, m && m[1]];
  for (const candidate of candidates) {
    const local = localAsset(candidate);
    if (local) return local;
  }
  // المقالات بلا صورة تحصل على صورة مصحف مختلفة من المجموعة المعدّة لهذا الغرض،
  // بدلاً من صورة افتراضية واحدة تتكرر في كل مكان.
  return curatedCover(post.id || post.path || post.title);
}

export function getSummary(post, length = 190) {
  const text = plainText(post.excerpt) || plainText(post.html).slice(0, 400);
  return text.length > length ? text.slice(0, length).trim() + '…' : text;
}

export function getCategoryNames(post, lang = 'ar') {
  return (post.categories || [])
    .map((id) => {
      const term = getTerms('categories').find((t) => t.id === Number(id));
      return (lang === 'en' && term?.englishName) || (term && term.name) || '';
    })
    .filter(Boolean);
}

export function getTagNames(post, lang = 'ar') {
  return (post.tags || [])
    .map((id) => {
      const term = getTerms('tags').find((t) => t.id === Number(id));
      return (lang === 'en' && term?.englishName) || (term && term.name) || '';
    })
    .filter(Boolean);
}

/**
 * مقدمة قصيرة تُضاف أصل المقال دون تعديل أي رابط أو رابط تحميل أو أيقونة.
 * النص مأخوذ حرفياً من بيانات المقال: الوصف المتاح، ثم أول نص منه، ثم بيانات
 * التصنيف والتاريخ إذا لم يوجد وصف — لا ننشئ ادعاءات خارج البيانات.
 */
export function getIntro(post, length = 260, lang = 'ar') {
  const direct = plainText(post.excerpt || post.seoDescription || '');
  if (direct) return direct.length > length ? `${direct.slice(0, length).trim()}…` : direct;
  const first = plainText(post.html || '');
  if (first) return first.length > length ? `${first.slice(0, length).trim()}…` : first;
  const cats = lang === 'en' ? getCategoryNames(post, 'en') : getCategoryNames(post);
  const date = (post.date || '').slice(0, 10);
  const bits = [];
  if (cats.length) bits.push(lang === 'en' ? `Filed under ${cats.join(' and ')}` : `هذا المقال ضمن ${cats.join(' و')}`);
  if (date) bits.push(lang === 'en' ? `Published on ${date}` : `نُشر في ${date}`);
  return bits.length ? `${bits.join(lang === 'en' ? ', ' : '، ')}.` : '';
}

export function postsInTerm(type, id, limit = 12) {
  return getPosts().filter((p) => (type === 'categories' ? p.categories : p.tags).includes(id));
}

export function relatedPosts(post, limit = 4) {
  const source = post.englishVersion ? getEnglishPosts() : getPosts();
  const others = source.filter((p) => p.id !== post.id && p.path !== '/blog/');
  return others
    .map((p) => {
      let score = 0;
      for (const id of p.categories || []) if ((post.categories || []).includes(id)) score += 3;
      for (const id of p.tags || []) if ((post.tags || []).includes(id)) score += 1;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.p.modified < b.p.modified ? 1 : -1))
    .slice(0, limit)
    .map((x) => x.p);
}
