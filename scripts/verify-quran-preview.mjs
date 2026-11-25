const base = process.argv[2] || 'https://design-v2.quranbook-test.pages.dev';

async function get(path, headers = {}) {
  const res = await fetch(base + path, { headers, signal: AbortSignal.timeout(30000) });
  return { status: res.status, type: res.headers.get('content-type') || '', text: await res.text() };
}

for (const path of ['/quran/', '/quran/1/', '/quran/2/', '/quran-sitemap.xml', '/robots.txt']) {
  const r = await get(path);
  console.log(r.status, path, r.type.split(';')[0], r.text.length);
  if (path === '/quran/1/' || path === '/quran/2/') {
    const verseCount = (r.text.match(/class="qg-aya-ar"/g) || []).length;
    const firstArabic = r.text.match(/class="qg-aya-ar"[\s\S]{0,3000}?<span>([^<]+)<\/span>/);
    console.log('  Arabic verses in HTML:', verseCount);
    console.log('  first Arabic verse:', firstArabic ? firstArabic[1].trim().slice(0, 60) : '(none)');
    console.log('  dialog markup:', r.text.includes('qb-dialog'));
  }
  if (path === '/quran-sitemap.xml') console.log('  urls:', (r.text.match(/<loc>/g) || []).length);
  if (path === '/robots.txt') console.log('  quran sitemap:', r.text.includes('quran-sitemap.xml'));
}

const j = JSON.parse((await get('/quran-gateway/surahs/1.json')).text);
console.log('audio.ar', j.audio.ar);
const direct = await fetch(`${j.audio.ar}/001001.mp3`, {
  headers: { Range: 'bytes=0-255' },
  signal: AbortSignal.timeout(30000),
});
console.log('sample audio', direct.status, direct.headers.get('content-type'));
