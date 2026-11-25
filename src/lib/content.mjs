import fs from 'node:fs';
import path from 'node:path';
import REMOTE_ASSETS from '../data/remote-assets.json';

const DATA = path.resolve(process.cwd(), 'data', 'export');
const PUBLIC = path.resolve(process.cwd(), 'public');
const REMOTE_MAP = new Map(Object.entries(REMOTE_ASSETS));

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
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
      const local = localAsset(src);
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
  return out.replace(/QBORIGINAL(\d+)QB/g, (_, i) => originals[Number(i)] || '');
}

let postsCache = null;

export function getPosts() {
  if (postsCache) return postsCache;
  const index = readJson(path.join(DATA, 'index.json'));
  postsCache = index.posts.map((p) => {
    const full = readJson(path.join(DATA, p.file));
    const y = full.yoast_head_json || {};
    return {
      id: p.id,
      slug: p.slug,
      path: urlPath(p.link),
      title: p.title || (full.title && full.title.rendered) || '',
      date: p.date,
      modified: p.modified,
      html: rewriteHtml(full.content && full.content.rendered),
      excerpt: rewriteHtml(full.excerpt && full.excerpt.rendered),
      seoTitle: y.title || p.title || '',
      seoDescription: y.description || '',
      canonical: y.canonical || p.link,
      ogImage: rewritePlainUrl((y.og_image && y.og_image[0] && y.og_image[0].url) || ''),
      schema: y.schema || null,
      robots: y.robots
        ? Object.entries(y.robots).map(([k, v]) => `${k}:${v}`).join(',')
        : '',
      categories: full.categories || [],
      tags: full.tags || [],
    };
  });
  return postsCache;
}

let pagesCache = null;

export function getPages() {
  if (pagesCache) return pagesCache;
  const index = readJson(path.join(DATA, 'index.json'));
  pagesCache = index.pages.map((p) => {
    const full = readJson(path.join(DATA, p.file));
    const y = full.yoast_head_json || {};
    return {
      id: p.id,
      slug: p.slug,
      path: urlPath(p.link),
      title: p.title || (full.title && full.title.rendered) || '',
      html: rewriteHtml(full.content && full.content.rendered),
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
  termsCache[type] = list.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name || '',
    count: t.count || 0,
    path: urlPath(t.link),
    type,
  }));
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

export function getCategoryNames(post) {
  return (post.categories || []).map((id) => getTermName('categories', id)).filter(Boolean);
}

export function getTagNames(post) {
  return (post.tags || []).map((id) => getTermName('tags', id)).filter(Boolean);
}

/**
 * مقدمة قصيرة تُضاف أصل المقال دون تعديل أي رابط أو رابط تحميل أو أيقونة.
 * النص مأخوذ حرفياً من بيانات المقال: الوصف المتاح، ثم أول نص منه، ثم بيانات
 * التصنيف والتاريخ إذا لم يوجد وصف — لا ننشئ ادعاءات خارج البيانات.
 */
export function getIntro(post, length = 260) {
  const direct = plainText(post.excerpt || post.seoDescription || '');
  if (direct) return direct.length > length ? `${direct.slice(0, length).trim()}…` : direct;
  const first = plainText(post.html || '');
  if (first) return first.length > length ? `${first.slice(0, length).trim()}…` : first;
  const cats = getCategoryNames(post);
  const date = (post.date || '').slice(0, 10);
  const bits = [];
  if (cats.length) bits.push(`هذا المقال ضمن ${cats.join(' و')}`);
  if (date) bits.push(`نُشر في ${date}`);
  return bits.length ? `${bits.join('، ')}.` : '';
}

export function postsInTerm(type, id, limit = 12) {
  return getPosts().filter((p) => (type === 'categories' ? p.categories : p.tags).includes(id));
}

export function relatedPosts(post, limit = 4) {
  const others = getPosts().filter((p) => p.id !== post.id && p.path !== '/blog/');
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
