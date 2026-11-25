import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCES = [
  {
    url: 'https://quranbook.org/wp-content/plugins/kadence-blocks/includes/assets/images/masks/blob2.svg',
    out: 'public/wp-content/plugins/kadence-blocks/includes/assets/images/masks/blob2.svg',
  },
  {
    url: 'https://quranbook.org/wp-content/plugins/youtube-embed-plus/images/deleted-video-thumb.png',
    out: 'public/wp-content/plugins/youtube-embed-plus/images/deleted-video-thumb.png',
  },
  {
    url: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Bismillah.png',
    out: 'public/img/basmalah.png',
  },
];

for (const { url, out } of SOURCES) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (QuranBook static migration)' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const file = path.join(ROOT, out);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(res.status, out, fs.statSync(file).size);
}

const manifestPath = path.join(ROOT, 'src', 'data', 'remote-assets.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest['img/basmalah.png'] = '/img/basmalah.png';
manifest['/img/basmalah.png'] = '/img/basmalah.png';
manifest['//img/basmalah.png'] = '/img/basmalah.png';
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log('mapped basmalah paths -> /img/basmalah.png');
