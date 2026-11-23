import fs from 'node:fs';
import path from 'node:path';

const DATA = path.resolve(process.cwd(), 'data', 'export');

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

/** تحويل روابط الموقع القديم إلى مسارات محلية تعمل على أي دومين */
export function rewriteHtml(html) {
  if (!html) return '';
  return html
    .replace(/https?:\/\/quranbook\.org\/wp-content\/uploads\//gi, '/wp-content/uploads/')
    .replace(/https?:\/\/quranbook\.org\//gi, '/');
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
      ogImage: (y.og_image && y.og_image[0] && y.og_image[0].url) || '',
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
