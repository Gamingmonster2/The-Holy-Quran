import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEW = process.argv[2] || 'https://quranbook-test.pages.dev';
const OLD = 'https://quranbook.org';
const INVENTORY = fs.existsSync(path.join(ROOT, 'inventory', 'urls.json'))
  ? path.join(ROOT, 'inventory', 'urls.json')
  : path.resolve(ROOT, '..', 'inventory', 'urls.json');
const all = JSON.parse(fs.readFileSync(INVENTORY, 'utf8')).map((u) => new URL(u.url).pathname);

const pick = (re, n = 1) => all.filter((p) => re.test(p)).slice(0, n);
const paths = [
  '/',
  '/blog/',
  '/566-2/',
  ...pick(/^\/[0-9]+-2\/$/, 1),
  ...pick(/^\/%d8/, 2),
  ...pick(/^\/category\//, 2),
  ...pick(/^\/tag\//, 2),
  ...pick(/^\/(about|contact|privacy|digital-quran-repository|quran-book)\/$/, 2),
];

const attr = (html, re) => (html.match(re) || [])[1]?.trim() || '';
const clean = (s) => s.replace(/\s+/g, ' ').trim().slice(0, 180);

function parse(html) {
  return {
    title: clean(attr(html, /<title[^>]*>([\s\S]*?)<\/title>/i)),
    description: clean(attr(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
      || attr(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)),
    canonical: attr(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i)
      || attr(html, /<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i),
    jsonld: (html.match(/<script[^>]+type=["']application\/ld\+json["']/gi) || []).length,
    h1: clean(attr(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, ' ')),
    images: (html.match(/<img\b/gi) || []).length,
    firstImage: attr(html, /<img[^>]+src=["']([^"']*)["']/i),
    internalLinks: (html.match(/href=["']\/(?!\/)[^"']*["']/gi) || []).length,
    arabic: /[\u0600-\u06FF]/.test(html),
  };
}

async function get(base, p) {
  const res = await fetch(base + p, { redirect: 'follow', signal: AbortSignal.timeout(40000) });
  const html = await res.text();
  return { status: res.status, final: res.url, parsed: parse(html) };
}

const rows = [];
for (const p of paths) {
  const [o, n] = await Promise.allSettled([get(OLD, p), get(NEW, p)]);
  const ov = o.status === 'fulfilled' ? o.value : { error: String(o.reason) };
  const nv = n.status === 'fulfilled' ? n.value : { error: String(n.reason) };
  rows.push({ path: p, old: ov, new: nv });
  const keys = ['status', 'title', 'description', 'canonical', 'jsonld', 'h1', 'images', 'internalLinks', 'arabic'];
  const diffs = keys.filter((k) => JSON.stringify(ov.parsed?.[k]) !== JSON.stringify(nv.parsed?.[k]));
  console.log(`\n=== ${p}`);
  console.log(`  old: ${ov.status || ov.error} | ${ov.parsed?.title || ''}`);
  console.log(`  new: ${nv.status || nv.error} | ${nv.parsed?.title || ''}`);
  console.log(`  مختلف: ${diffs.join(', ') || 'لا شيء'}`);
  if (diffs.includes('description')) console.log(`  desc old: ${ov.parsed?.description}\n  desc new: ${nv.parsed?.description}`);
  if (diffs.includes('canonical')) console.log(`  can  old: ${ov.parsed?.canonical}\n  can  new: ${nv.parsed?.canonical}`);
}

fs.writeFileSync(path.join(ROOT, 'preview-compare.json'), JSON.stringify(rows, null, 2), 'utf8');
console.log(`\nتم حفظ النتيجة: ${path.join(ROOT, 'preview-compare.json')}`);
