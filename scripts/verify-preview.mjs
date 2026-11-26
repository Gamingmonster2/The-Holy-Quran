import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] || 'https://quranbook-test.pages.dev';
const CONCURRENCY = Number(process.argv[3] || 5);
const RETRIES = Number(process.argv[4] || 4);
const ONLY_FAILURES = process.argv.includes('--failures');
const STATUS_ONLY = process.argv.includes('--status-only');
const INVENTORY = fs.existsSync(path.join(ROOT, 'inventory', 'urls.json'))
  ? path.join(ROOT, 'inventory', 'urls.json')
  : path.resolve(ROOT, '..', 'inventory', 'urls.json');
const UPLOADS = path.join(ROOT, 'public', 'wp-content', 'uploads');

const inventory = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
const expected = new Map(inventory.map((u) => [new URL(u.url).pathname, u]));
const urlPaths = inventory.map((u) => new URL(u.url).pathname);

let targets;
if (ONLY_FAILURES) {
  const prev = JSON.parse(fs.readFileSync(path.join(ROOT, 'preview-failures.json'), 'utf8'));
  targets = prev.map((f) => f.path);
} else {
  const images = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else images.push('/wp-content/uploads/' + path.relative(UPLOADS, p).split(path.sep).map(encodeURIComponent).join('/'));
    }
  })(UPLOADS);
  targets = [...urlPaths, ...images, '/sitemap.xml', '/robots.txt', '/feed.xml', '/category/', '/tag/'];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (u) => {
  try {
    const x = new URL(u);
    return x.hostname.replace(/^www\./, '') + decodeURIComponent(x.pathname).replace(/\/+$/, '') + x.search;
  } catch {
    return String(u);
  }
};
const canonical = (html) => {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i)
    || html.match(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i);
  return m ? m[1] : '';
};

// المقالات الستة بلا نص مرئي حُذفت وعُيّنت إعادة توجيه 301 إلى الرئيسية.
const EXPECTED_REDIRECTS = new Set([
  '/562-2/', '/563-2/', '/564-2/', '/565-2/', '/566-2/', '/581-2/',
]);

let i = 0;
const failures = [];
const t0 = Date.now();

async function check(p) {
  let last;
  const want = expected.get(p);
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(BASE + p, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
      const html = await res.text();
      if (res.status === 301 && EXPECTED_REDIRECTS.has(p)) return;
      if (res.status !== 200) {
        last = { path: p, status: res.status, attempt };
      } else if (!STATUS_ONLY && want && !/author-sitemap/.test(want.sitemap)) {
        const got = canonical(html);
        if (!got) last = { path: p, issue: 'canonical مفقود', attempt };
        else if (norm(got) !== norm(want.url)) {
          last = { path: p, issue: 'canonical غير مطابق', got, want: want.url, attempt };
        }
      }
      if (!last || last.attempt !== attempt) return;
    } catch (e) {
      last = { path: p, error: String(e), attempt };
    }
    if (attempt < RETRIES) await sleep(400 * attempt);
  }
  failures.push(last);
}

async function worker() {
  while (i < targets.length) {
    const p = targets[i++];
    await check(p);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const out = path.join(ROOT, ONLY_FAILURES ? 'preview-failures-recheck.json' : 'preview-failures.json');
fs.writeFileSync(out, JSON.stringify(failures, null, 2), 'utf8');
console.log(`تم فحص ${targets.length} رابط خلال ${Math.round((Date.now() - t0) / 1000)} ثانية (تزامن ${CONCURRENCY}، محاولات ${RETRIES}${STATUS_ONLY ? '، حالة فقط' : '، مع فحص canonical'})`);
console.log(`الفاشل: ${failures.length}`);
if (failures.length) {
  const groups = {};
  for (const f of failures) {
    const k = f.issue || (f.status ? `HTTP ${f.status}` : (f.error || 'unknown'));
    groups[k] = (groups[k] || 0) + 1;
  }
  console.log(groups);
  console.log(failures.slice(0, 20));
}
console.log(`ملف النتيجة: ${out}`);
