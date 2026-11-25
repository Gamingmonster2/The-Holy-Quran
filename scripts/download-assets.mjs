import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const AUDIT = path.join(ROOT, 'reports', 'resources-audit.json');
const MANIFEST = path.join(ROOT, 'src', 'data', 'remote-assets.json');
const REPORT = path.join(ROOT, 'reports', 'asset-download.json');
const PUBLIC = path.join(ROOT, 'public');
const CONCURRENCY = 12;
const TIMEOUT_MS = 10000;
const AUDIO_URL = /\.(?:mp3|m4a|ogg|wav|aac)(?:[?#]|$)/i;

const CURATED = [
  '/wp-content/uploads/2024/03/open-quran-book-with-islamic-text-3272118-1024x683-1.jpg',
  '/wp-content/uploads/2024/03/high-angle-of-opened-koran-book-placed.jpeg',
  '/wp-content/uploads/2024/03/koran-on-metal-stand-15807108-683x1024.jpg',
  '/wp-content/uploads/2024/03/Free-Close-Up-Photography-of-a-Quran-Stock-Photo.jpg',
  '/wp-content/uploads/2024/03/man-hands-holding-smartphone-digital-quran-1024x683.jpeg',
  '/wp-content/uploads/2024/03/Children-reading-the-Quran-1024x683.jpg',
];

const EXT_BY_TYPE = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/ogg': '.ogg',
};

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function localPathFor(url) {
  const parsed = new URL(url);
  if (/^quranbook\.org$/i.test(parsed.hostname) && parsed.pathname.startsWith('/wp-content/uploads/')) {
    return safeDecode(parsed.pathname);
  }
  const ext = path.extname(parsed.pathname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);
  const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 18);
  return `/media/remote/${hash}${ext || ''}`;
}

function fallbackFor(url) {
  const hash = crypto.createHash('sha256').update(url).digest('hex');
  return CURATED[parseInt(hash.slice(0, 8), 16) % CURATED.length];
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; QuranBookStaticMigration/1.0)',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,audio/*,*/*;q=0.8',
      },
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

async function download(url, localPath, result) {
  const target = path.join(PUBLIC, localPath.replace(/^\/+/, ''));
  if (fs.existsSync(target) && fs.statSync(target).size > 0) {
    result.existing.push({ url, localPath });
    return localPath;
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url);
      const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 32) throw new Error('empty response');
      const isMedia = type.startsWith('image/') || type.startsWith('audio/');
      if (!isMedia) throw new Error(`unexpected content-type ${type}`);
      let finalPath = localPath;
      if (!path.extname(finalPath) && EXT_BY_TYPE[type]) finalPath += EXT_BY_TYPE[type];
      const finalTarget = path.join(PUBLIC, finalPath.replace(/^\/+/, ''));
      fs.mkdirSync(path.dirname(finalTarget), { recursive: true });
      fs.writeFileSync(finalTarget, buf);
      result.downloaded.push({ url, localPath: finalPath, bytes: buf.length, type });
      return finalPath;
    } catch (err) {
      if (attempt === 1) {
        const fb = fallbackFor(url);
        result.failed.push({ url, localPath, error: String(err && err.message || err), fallback: fb });
        return fb;
      }
    }
  }
  return fallbackFor(url);
}

async function main() {
  if (!fs.existsSync(AUDIT)) throw new Error('reports/resources-audit.json غير موجود — شغّل audit-resources.mjs أولاً');
  const audit = JSON.parse(fs.readFileSync(AUDIT, 'utf8'));
  const urls = Object.keys(audit.remoteImages || {});
  const pluginAssets = [
    'https://quranbook.org/wp-content/plugins/youtube-embed-plus/images/playhover.png',
    'https://quranbook.org/wp-content/plugins/youtube-embed-plus/images/gallery-page-loader.gif',
  ];
  for (const asset of pluginAssets) urls.push(asset);

  const result = { downloaded: [], existing: [], failed: [], manifest: {} };
  function persist() {
    fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(MANIFEST, `${JSON.stringify(result.manifest, null, 2)}\n`, 'utf8');
    fs.writeFileSync(REPORT, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  let cursor = 0;
  async function worker() {
    while (cursor < urls.length) {
      const i = cursor++;
      const url = urls[i];
      if (AUDIO_URL.test(url)) {
        // الملفات الصوتية الكبيرة تُترك على مصدرها الأصلي لتفادي حد 25MiB في Cloudflare Pages
        result.manifest[url] = url;
        persist();
        continue;
      }
      const localPath = localPathFor(url);
      const mapped = await download(url, localPath, result);
      result.manifest[url] = mapped;
      persist();
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  persist();

  console.log('urls', urls.length);
  console.log('downloaded', result.downloaded.length);
  console.log('already local', result.existing.length);
  console.log('failed -> fallback', result.failed.length);
  for (const f of result.failed.slice(0, 25)) console.log('FAIL', f.url, '=>', f.fallback, f.error);
  console.log('manifest', MANIFEST);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
