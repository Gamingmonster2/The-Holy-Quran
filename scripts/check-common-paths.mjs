const base = process.argv[2] || 'https://design-v2.quranbook-test.pages.dev';

const paths = [
  '/',
  '/404/',
  '/sitemap.xml',
  '/quran-sitemap.xml',
  '/robots.txt',
  '/feed/',
  '/comments/feed/',
  '/wp-sitemap.xml',
  '/sitemap_index.xml',
  '/wp-login',
  '/wp-login.php',
  '/wp-admin',
  '/wp-admin/',
  '/wp-json/',
  '/wp-json/wp/v2/posts',
  '/xmlrpc.php',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/.well-known/security.txt',
  '/search.json',
  '/definitely-missing-page-xyz/',
];

for (const path of paths) {
  try {
    const res = await fetch(base + path, {
      headers: { 'User-Agent': 'Mozilla/5.0 (QuranBook error audit)' },
      signal: AbortSignal.timeout(20000),
      redirect: 'manual',
    });
    console.log(String(res.status).padEnd(4), path, res.headers.get('content-type') || '');
  } catch (err) {
    console.log('ERR ', path, String(err && err.message || err));
  }
}
