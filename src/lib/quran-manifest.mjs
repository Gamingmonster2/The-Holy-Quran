import fs from 'node:fs';
import path from 'node:path';

/** بيانات بوابة Quran Gateway الثابتة (114 سورة) — تُقرأ أثناء البناء فقط */
export function loadQuranManifest() {
  const file = path.join(process.cwd(), 'public', 'quran-gateway', 'manifest.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** بيانات سورة واحدة لتضمينها في HTML أثناء البناء */
export function loadQuranSurah(number) {
  const file = path.join(process.cwd(), 'public', 'quran-gateway', 'surahs', `${Number(number) || 1}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
