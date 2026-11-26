import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPORT = path.join(ROOT, 'data', 'export');
const AUDIT = path.join(ROOT, 'reports', 'phase1-audit.json');
const OUT = path.join(ROOT, 'data', 'translations.json');
const CACHE_FILE = path.join(ROOT, 'data', 'translation-cache.json');

const AR = /[\u0600-\u06FF]/;
const TOKEN_RE = /[\p{L}][\p{L}’'\-]*/gu;
const BATCH_SIZE = 25;
const BATCH_CHARS = 1600;
const THROTTLE_MS = 150;
const RETRIES = 5;
// نقطة ترجمة أخرى أقل تعرّضاً لحظر المعدل من نقطة translate.googleapis.com
const ENDPOINT = 'https://clients5.google.com/translate_a/t';
const LIMIT = Number(process.env.LIMIT || 0);
const VERBOSE = process.argv.includes('--verbose');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&(amp|quot|apos|lt|gt|nbsp|hellip|ndash|mdash|rsquo|lsquo|rdquo|ldquo);/gi,
      (_, n) => ({
        amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', hellip: '…',
        ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
      }[n.toLowerCase()] || ' '))
    .replace(/&[a-z]+;/gi, ' ');
}

const cache = fs.existsSync(CACHE_FILE)
  ? readJson(CACHE_FILE)
  : { ar: {}, en: {} };
cache.ar ||= {};
cache.en ||= {};

let requests = 0;
let translatedTokens = 0;
let failedTokens = 0;

function markedQuery(tokens) {
  return tokens.map((token, i) => `⟦QB${i}⟧${token}`).join('') + '⟦QBEND⟧';
}

function parseMarked(text, count) {
  // Google قد يضيف مسافة داخل العلامة؛ نُعيدها إلى شكلها القياسي أولاً.
  const normalized = String(text || '').replace(/⟦\s*(QB(?:\d+|END))\s*⟧/g, '⟦$1⟧');
  const positions = new Map();
  for (const m of normalized.matchAll(/⟦(QB\d+|QBEND)⟧/g)) {
    const key = m[1];
    if (positions.has(key)) return null;
    positions.set(key, { start: m.index, end: m.index + m[0].length });
  }
  if (!positions.has('QBEND')) return null;
  const parts = [];
  for (let i = 0; i < count; i++) {
    const current = positions.get(`QB${i}`);
    const next = positions.get(i + 1 < count ? `QB${i + 1}` : 'QBEND');
    if (!current || !next || next.start <= current.end) return null;
    parts.push(normalized.slice(current.end, next.start).trim());
  }
  return parts.every((p) => p) ? parts : null;
}

function flatten(value) {
  if (Array.isArray(value)) return value.map(flatten).join('');
  return typeof value === 'string' ? value : '';
}

async function translateBatch(tokens, direction) {
  const params = new URLSearchParams({
    client: 'dict-chrome-ex',
    sl: direction === 'en' ? 'ar' : 'auto',
    tl: direction === 'en' ? 'en' : 'ar',
    q: markedQuery(tokens),
  });
  let lastError;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const res = await fetch(`${ENDPOINT}?${params}`, {
        signal: AbortSignal.timeout(30000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QuranBookTranslator/1.0)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      requests++;
      const raw = flatten(json);
      const parts = parseMarked(raw, tokens.length);
      await sleep(THROTTLE_MS);
      if (parts) {
        translatedTokens += tokens.length;
        return parts;
      }
      if (tokens.length === 1) return [raw.trim() || tokens[0]];
      // في حالة نادرة يتلف Google العلامات؛ نعود إلى سطر لكل كلمة.
      const lines = [];
      for (const token of tokens) lines.push(await translateBatch([token], direction));
      return lines;
    } catch (error) {
      lastError = error;
      const wait = [2000, 6000, 15000, 30000, 45000][Math.min(attempt, 4)];
      console.warn(`  retry ${attempt + 1}/${RETRIES} after ${String(error).slice(0, 80)}`);
      await sleep(wait);
    }
  }
  failedTokens += tokens.length;
  console.warn(`  translate failed (${tokens.length} tokens): ${String(lastError).slice(0, 120)}`);
  return tokens;
}

async function ensureTranslations(tokens, direction) {
  const buckets = [];
  let current = [];
  let chars = 0;
  for (const token of tokens) {
    if (current.length && (chars + token.length > BATCH_CHARS || current.length >= BATCH_SIZE)) {
      buckets.push(current);
      current = [];
      chars = 0;
    }
    current.push(token);
    chars += token.length + 1;
  }
  if (current.length) buckets.push(current);
  for (const bucket of buckets) {
    const results = await translateBatch(bucket, direction);
    bucket.forEach((token, i) => {
      cache[direction][token] = results[i] || token;
    });
  }
}

/** يقنّع الكيانات والروابط حتى لا تُترجم عناصرها ككلمات مستقلة. */
function maskLiterals(text) {
  const masked = [];
  const mask = (value) => {
    const token = `⟦QBX${masked.length}⟧`;
    masked.push(value);
    return token;
  };
  let out = String(text || '')
    .replace(/&(?:#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m) => mask(m))
    .replace(/\bhttps?:\/\/[^\s<>"'()]+/gi, (m) => mask(m))
    .replace(/\bwww\.[^\s<>"'()]+/gi, (m) => mask(m))
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, (m) => mask(m));
  return { out, masked };
}

function unmaskLiterals(text, masked) {
  // Google Translate قد يحوّل حروف العلامة إلى صغيرة (⟦qbx0⟧).
  return String(text || '').replace(/⟦QBX(\d+)⟧/gi, (_, i) => masked[Number(i)] ?? '');
}

function keyOf(token) {
  return token.toLocaleLowerCase();
}

async function translateText(text, direction) {
  const source = String(text || '');
  if (!/[\p{L}]/u.test(source)) return source;
  const { out: masked, masked: literals } = maskLiterals(source);
  const matches = [...masked.matchAll(TOKEN_RE)];
  const selected = matches.filter((m) => (direction === 'ar' ? !AR.test(m[0]) : AR.test(m[0])));
  if (!selected.length) return source;
  const unique = [...new Set(selected.map((m) => keyOf(m[0])))];
  const missing = unique.filter((k) => cache[direction][k] === undefined);
  if (missing.length) await ensureTranslations(missing, direction);

  let result = masked;
  for (let i = selected.length - 1; i >= 0; i--) {
    const m = selected[i];
    let replacement = cache[direction][keyOf(m[0])] || m[0];
    if (direction === 'en' && /^[A-Z]/.test(m[0]) && !/^[A-Z]{2,}$/.test(m[0])) {
      replacement = replacement.charAt(0).toLocaleUpperCase() + replacement.slice(1);
    }
    result = result.slice(0, m.index) + replacement + result.slice(m.index + m[0].length);
  }
  return unmaskLiterals(result, literals);
}

const PROTECTED = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>|<!--[\s\S]*?-->|<[^>]+>/gi;

async function translateHtml(html, direction) {
  const source = String(html || '');
  let result = '';
  let cursor = 0;
  for (const match of source.matchAll(PROTECTED)) {
    const index = match.index ?? 0;
    result += await translateText(source.slice(cursor, index), direction);
    const tag = match[0];
    if (/^<!--|^<script|^<style/i.test(tag)) {
      result += tag;
    } else {
      result += await translateTag(tag, direction);
    }
    cursor = index + tag.length;
  }
  result += await translateText(source.slice(cursor), direction);
  return result;
}

async function translateTag(tag, direction) {
  const re = /(alt|title|aria-label)\s*=\s*(["'])([^"']*)\2/gi;
  let out = '';
  let cursor = 0;
  for (const match of tag.matchAll(re)) {
    const index = match.index ?? 0;
    out += tag.slice(cursor, index);
    const [, attr, quote, value] = match;
    out += `${attr}=${quote}${await translateText(value, direction)}${quote}`;
    cursor = index + match[0].length;
  }
  return out + tag.slice(cursor);
}

function slugify(title, used) {
  let slug = decodeEntities(String(title || '').replace(/<[^>]+>/g, ' '))
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '') || 'article';
  const base = slug;
  let n = 2;
  while (used.has(slug)) slug = `${base}-${n++}`;
  used.add(slug);
  return slug;
}

function visibleText(html) {
  return decodeEntities(String(html || '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}

const audit = readJson(AUDIT);
const mixedIds = audit.language.posts
  .filter((p) => p.stats.overall.lang === 'mixed')
  .map((p) => p.id);
console.log(`mixed posts to split: ${mixedIds.length}`);

const previous = fs.existsSync(OUT) ? readJson(OUT) : { posts: {}, terms: {} };
const output = {
  generatedAt: new Date().toISOString(),
  source: 'Google Translate (clients5.google.com/translate_a/t, client=dict-chrome-ex)',
  note: 'Arabic version translates only non-Arabic visible text; English version translates only Arabic visible text. Tags, URLs, attributes other than alt/title/aria-label and script/style blocks stay untouched.',
  posts: previous.posts || {},
  terms: previous.terms || {},
};

const usedSlugs = new Set(Object.values(output.posts).map((p) => p.englishSlug).filter(Boolean));
let done = 0;
const startedAt = Date.now();
for (const id of mixedIds) {
  if (LIMIT && done >= LIMIT) break;
  const key = String(id);
  if (output.posts[key]?.ar?.html && output.posts[key]?.en?.html) { done++; continue; }
  const file = path.join(EXPORT, 'posts', `${id}.json`);
  if (!fs.existsSync(file)) continue;
  const postStart = Date.now();
  const reqStart = requests;
  if (VERBOSE) console.log(`start ${key} (${done + 1}/${mixedIds.length})`);
  const post = readJson(file);
  const y = post.yoast_head_json || {};
  const raw = {
    title: post.title?.rendered || '',
    html: post.content?.rendered || '',
    excerpt: post.excerpt?.rendered || '',
    seoTitle: y.title || post.title?.rendered || '',
    seoDescription: y.description || '',
  };
  const ar = {
    title: await translateText(raw.title, 'ar'),
    html: await translateHtml(raw.html, 'ar'),
    excerpt: await translateHtml(raw.excerpt, 'ar'),
    seoTitle: await translateText(raw.seoTitle, 'ar'),
    seoDescription: await translateText(raw.seoDescription, 'ar'),
  };
  const en = {
    title: await translateText(raw.title, 'en'),
    html: await translateHtml(raw.html, 'en'),
    excerpt: await translateHtml(raw.excerpt, 'en'),
    seoTitle: await translateText(raw.seoTitle, 'en'),
    seoDescription: await translateText(raw.seoDescription, 'en'),
  };
  output.posts[key] = {
    ar,
    en,
    englishSlug: output.posts[key]?.englishSlug || slugify(en.title || en.seoTitle, usedSlugs),
    originalPath: new URL(post.link).pathname,
  };
  done++;
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 0), 'utf8');
  fs.writeFileSync(OUT, JSON.stringify(output, null, 0), 'utf8');
  if (VERBOSE || done % 10 === 0) {
    console.log(`  ${done}/${mixedIds.length} post ${key}: ${((Date.now() - postStart) / 1000).toFixed(1)}s, +${requests - reqStart} requests, total ${requests}, tokens ${translatedTokens}`);
  }
}

// ترجمة أسماء التصنيفات والوسوم المستخدمة في هذه المقالات إلى الإنجليزية.
const termIds = new Set();
for (const id of mixedIds) {
  const post = readJson(path.join(EXPORT, 'posts', `${id}.json`));
  for (const t of [...(post.categories || []), ...(post.tags || [])]) termIds.add(Number(t));
}
for (const type of ['categories', 'tags']) {
  const file = path.join(EXPORT, `${type}.json`);
  if (!fs.existsSync(file)) continue;
  for (const term of readJson(file)) {
    if (!termIds.has(Number(term.id))) continue;
    const name = decodeEntities(term.name || '');
    if (!AR.test(name)) continue;
    output.terms[String(term.id)] ||= { id: term.id, type, ar: name, en: await translateText(name, 'en') };
  }
}

fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 0), 'utf8');
fs.writeFileSync(OUT, JSON.stringify(output, null, 0), 'utf8');
console.log(`done: ${Object.keys(output.posts).length} posts, ${Object.keys(output.terms).length} terms`);
console.log(`requests: ${requests}, translated tokens: ${translatedTokens}, failed: ${failedTokens}`);
console.log(`written: ${OUT}`);
