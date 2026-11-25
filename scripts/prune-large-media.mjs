import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, 'src', 'data', 'remote-assets.json');
const REMOTE_DIR = path.join(ROOT, 'public', 'media', 'remote');
const LIMIT = 20 * 1024 * 1024;
const AUDIO = /\.(?:mp3|m4a|ogg|wav|aac)$/i;

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const keep = new Set();
let restored = 0;
let removed = 0;

for (const [url, local] of Object.entries(manifest)) {
  const rel = String(local || '').replace(/^\/+/, '');
  const file = path.join(ROOT, 'public', rel);
  if (!file.startsWith(REMOTE_DIR)) continue;
  const tooBig = fs.existsSync(file) && fs.statSync(file).size > LIMIT;
  if (AUDIO.test(rel) || tooBig) {
    manifest[url] = url;
    restored += 1;
    if (fs.existsSync(file)) {
      fs.rmSync(file);
      removed += 1;
    }
  } else if (fs.existsSync(file)) {
    keep.add(path.basename(file));
  }
}

if (fs.existsSync(REMOTE_DIR)) {
  for (const entry of fs.readdirSync(REMOTE_DIR, { withFileTypes: true })) {
    if (entry.isFile() && !keep.has(entry.name)) {
      fs.rmSync(path.join(REMOTE_DIR, entry.name));
      removed += 1;
    }
  }
}

fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log('restored remote URLs', restored);
console.log('removed local files', removed);
