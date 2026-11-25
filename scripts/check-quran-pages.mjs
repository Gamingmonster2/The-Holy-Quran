import fs from 'node:fs';

const h = fs.readFileSync('dist/index.html', 'utf8');
console.log('homepage dialog refs', (h.match(/qb-dialog/g) || []).length);
console.log('homepage quran links', (h.match(/href="\/quran\//g) || []).length);

for (const n of [1, 2]) {
  const p = fs.readFileSync(`dist/quran/${n}/index.html`, 'utf8');
  const j = JSON.parse(fs.readFileSync(`public/quran-gateway/surahs/${n}.json`, 'utf8'));
  console.log(`surah ${n} bytes`, p.length);
  console.log(`surah ${n} first arabic in HTML`, p.includes(j.verses[0].ar));
  console.log(`surah ${n} first translation in HTML`, p.includes(j.verses[0].en));
  console.log(`surah ${n} canonical`, p.includes(`<link rel="canonical" href="https://quranbook.org/quran/${n}/">`));
}

const j = JSON.parse(fs.readFileSync('dist/quran-gateway/surahs/2.json', 'utf8'));
console.log('audio.ar', j.audio.ar);
console.log('sample audio', `${j.audio.ar}/002001.mp3`);
