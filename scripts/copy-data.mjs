import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION = path.resolve(ROOT, '..');

const pairs = [
  [path.join(MIGRATION, 'export'), path.join(ROOT, 'data', 'export')],
  [path.join(MIGRATION, 'assets', 'uploads'), path.join(ROOT, 'public', 'wp-content', 'uploads')],
];

for (const [src, dest] of pairs) {
  if (!fs.existsSync(src)) {
    console.error(`مفقود: ${src}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
  const count = fs.readdirSync(dest, { recursive: true }).length;
  console.log(`نسخ ${src} → ${dest} (${count} عنصر)`);
}
