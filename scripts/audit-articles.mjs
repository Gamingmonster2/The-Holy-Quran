import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPORT = path.join(ROOT, 'data', 'export');
const OUT_DIR = path.join(ROOT, 'reports');
fs.mkdirSync(OUT_DIR, { recursive: true });

const decode = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&(amp|quot|apos|lt|gt|nbsp|hellip|ndash|mdash|rsquo|lsquo|rdquo|ldquo);/gi, (_, n) => ({
    amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  }[n.toLowerCase()] || ' '))
  .replace(/&[a-z]+;/gi, ' ');

const strip = (s) => decode(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const words = (s) => (strip(s).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
const proseWords = (html) => {
  const h = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const parts = [...h.matchAll(/<(p|h[1-6]|li|blockquote|figcaption)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]);
  return words(parts.join(' '));
};
const normTitle = (s) => strip(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const contentHash = (html) => {
  const t = strip(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' '));
  return t.length >= 250 ? crypto.createHash('sha1').update(normTitle(t)).digest('hex') : '';
};

const categories = JSON.parse(fs.readFileSync(path.join(EXPORT, 'categories.json'), 'utf8'));
const tags = JSON.parse(fs.readFileSync(path.join(EXPORT, 'tags.json'), 'utf8'));
const catById = new Map(categories.map((c) => [c.id, c]));
const tagById = new Map(tags.map((t) => [t.id, t]));

const files = fs.readdirSync(path.join(EXPORT, 'posts')).filter((f) => f.endsWith('.json'));
const posts = files.map((f) => JSON.parse(fs.readFileSync(path.join(EXPORT, 'posts', f), 'utf8')))
  .filter((p) => p.status === 'publish')
  .sort((a, b) => a.id - b.id);

const catUsage = new Map();
const tagUsage = new Map();
for (const p of posts) {
  for (const id of p.categories || []) catUsage.set(id, (catUsage.get(id) || 0) + 1);
  for (const id of p.tags || []) tagUsage.set(id, (tagUsage.get(id) || 0) + 1);
}

const titleGroups = new Map();
const contentGroups = new Map();
for (const p of posts) {
  const t = normTitle(p.title?.rendered);
  const h = contentHash(p.content?.rendered || '');
  titleGroups.set(t, (titleGroups.get(t) || 0) + 1);
  if (h) contentGroups.set(h, (contentGroups.get(h) || 0) + 1);
}

const rows = [];
for (const p of posts) {
  const html = p.content?.rendered || '';
  const excerpt = strip(p.excerpt?.rendered);
  const yoastDesc = strip(p.yoast_head_json?.description);
  const prose = proseWords(html);
  const raw = words(html);

  const hasImage = /<img\b|wp-block-image/i.test(html);
  const hasVideo = /<iframe\b|<video\b|\.mp4|youtu\.be|youtube|vimeo/i.test(html);
  const hasAudio = /<audio\b|\.mp3|quran_player|changesoundy/i.test(html);
  const hasGateway = /quran_gateway|sora_title|aya_ar_by_sora|quran_gateway_sora_list/i.test(html);
  const hasTable = /<table\b/i.test(html);

  const hrefs = [...html.matchAll(/<a\b[^>]+href=["']([^"']+)["']/gi)].map((m) => decode(m[1]));
  const internal = [...new Set(hrefs.filter((u) => /quranbook\.org|^https?:\/\/www\.quranbook\.org/i.test(u) || u.startsWith('/')))];
  const external = [...new Set(hrefs.filter((u) => !/quranbook\.org/i.test(u) && !u.startsWith('/') && /^https?:/i.test(u)))];

  const catNames = (p.categories || []).map((id) => catById.get(id)?.name || `ID:${id}(مفقود)`);
  const tagNames = (p.tags || []).map((id) => tagById.get(id)?.name || `ID:${id}(مفقود)`);

  const issues = [];
  const add = (code) => issues.push(code);

  if (!(p.categories || []).length) add('no_category');
  if ((p.categories || []).some((id) => !catById.has(id))) add('missing_category_ref');
  if (catNames.some((n) => /^(uncategorized|غير مصنف|بدون تصنيف|general|default)$/i.test(n))) add('uncategorized');
  if ((p.categories || []).some((id) => (catUsage.get(id) || 0) <= 1)) add('single_use_category');

  if (!(p.tags || []).length) add('no_tags');
  if ((p.tags || []).some((id) => !tagById.has(id))) add('missing_tag_ref');
  if (tagNames.some((n) => /^\d+$/.test(n))) add('numeric_tag');
  if ((p.tags || []).some((id) => (tagUsage.get(id) || 0) <= 1)) add('single_use_tag');

  if (!excerpt && !yoastDesc) add('no_seo_description');
  if (!p.featured_media && !hasImage) add('no_image');
  if (!internal.length) add('no_internal_links');

  if (prose < 30) add('very_thin_prose');
  else if (prose < 80) add('thin_prose');

  if (hasImage && prose < 40 && !hasVideo && !hasAudio && !hasGateway) add('image_only');
  if (hasVideo && prose < 60) add('video_only');
  if (hasAudio && prose < 60 && !hasImage && !hasVideo) add('audio_only');
  if (hasGateway && prose < 60) add('gateway_only');
  if (external.length > 10 && prose < 100) add('link_list');

  if ((titleGroups.get(normTitle(p.title?.rendered)) || 0) > 1) add('duplicate_title');
  const ch = contentHash(html);
  if (ch && (contentGroups.get(ch) || 0) > 1) add('duplicate_content');

  const high = ['no_category', 'missing_category_ref', 'uncategorized', 'very_thin_prose', 'image_only', 'video_only', 'audio_only', 'gateway_only', 'duplicate_content'];
  const medium = ['thin_prose', 'no_seo_description', 'no_image', 'no_internal_links', 'single_use_category', 'numeric_tag', 'link_list', 'duplicate_title'];
  const priority = high.some((x) => issues.includes(x)) ? 'عالية' : medium.some((x) => issues.includes(x)) ? 'متوسطة' : issues.length ? 'منخفضة' : 'سليمة';

  rows.push({
    id: p.id,
    title: decode(p.title?.rendered),
    url: p.link,
    date: p.date,
    categories: catNames,
    tags: tagNames,
    proseWords: prose,
    rawWords: raw,
    hasImage,
    hasVideo,
    hasAudio,
    hasGateway,
    hasTable,
    internalLinks: internal.length,
    externalLinks: external.length,
    featuredMedia: p.featured_media || 0,
    excerpt: excerpt || yoastDesc,
    issues,
    priority,
  });
}

const issueDefs = {
  no_category: 'لا يوجد تصنيف إطلاقاً',
  missing_category_ref: 'معرّف تصنيف غير موجود في بيانات التصنيفات',
  uncategorized: 'مصنّف كـ Uncategorized / غير مصنف',
  single_use_category: 'كل تصنيفاته مستخدمة في مقال واحد فقط (عشوائية غالباً)',
  no_tags: 'لا توجد وسوم',
  missing_tag_ref: 'معرّف وسم غير موجود في بيانات الوسوم',
  numeric_tag: 'وسم رقمي بلا معنى (مثل 1442)',
  single_use_tag: 'كل وسومه مستخدمة في مقال واحد فقط',
  no_seo_description: 'لا يوجد وصف SEO / مقتطف',
  no_image: 'لا صورة بارزة ولا صورة داخل المقال',
  no_internal_links: 'لا توجد روابط داخلية',
  very_thin_prose: 'نص تحريري أقل من 30 كلمة',
  thin_prose: 'نص تحريري 30–79 كلمة',
  image_only: 'صورة فقط بلا نص يذكر',
  video_only: 'فيديو فقط بلا نص يذكر',
  audio_only: 'مشغّل صوتي فقط بلا نص يذكر',
  gateway_only: 'كتل Quran Gateway فقط بلا نص تحريري',
  link_list: 'قائمة روابط أكثر من نصها',
  duplicate_title: 'عنوان مكرر لمقال آخر',
  duplicate_content: 'محتوى مكرر لمقال آخر',
};

const counts = {};
for (const key of Object.keys(issueDefs)) counts[key] = rows.filter((r) => r.issues.includes(key)).length;

const priorityCounts = {
  عالية: rows.filter((r) => r.priority === 'عالية').length,
  متوسطة: rows.filter((r) => r.priority === 'متوسطة').length,
  منخفضة: rows.filter((r) => r.priority === 'منخفضة').length,
  سليمة: rows.filter((r) => r.priority === 'سليمة').length,
};

const catRows = categories.map((c) => ({ ...c, actual: catUsage.get(c.id) || 0 })).sort((a, b) => b.actual - a.actual);
const tagRows = tags.map((t) => ({ ...t, actual: tagUsage.get(t.id) || 0 })).sort((a, b) => b.actual - a.actual);

const suspiciousCats = catRows.filter((c) => c.actual <= 2 && (/[A-Za-z]{3,}|\d{3,}|file|pdf|mp3|ai|تحميل|جودة|عالية/i.test(c.name) || c.name.length > 35));

fs.writeFileSync(path.join(OUT_DIR, 'articles-audit.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  totals: { posts: posts.length, categories: categories.length, tags: tags.length, priorityCounts, issueCounts: counts },
  rows,
}, null, 2), 'utf8');

const csvHeader = ['id', 'title', 'url', 'priority', 'issues', 'proseWords', 'categories', 'tags', 'internalLinks', 'featuredMedia'];
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const csv = [csvHeader.join(',')].concat(rows.filter((r) => r.priority !== 'سليمة').map((r) => [
  r.id, r.title, r.url, r.priority, r.issues.join(' | '), r.proseWords, r.categories.join(' | '), r.tags.join(' | '), r.internalLinks, r.featuredMedia,
].map(csvCell).join(','))).join('\r\n');
fs.writeFileSync(path.join(OUT_DIR, 'articles-audit.csv'), '\uFEFF' + csv, 'utf8');

const md = [];
md.push('# تقرير فحص المقالات والتصنيفات');
md.push('');
md.push(`تاريخ الفحص: ${new Date().toISOString()}`);
md.push('');
md.push(`- المقالات المنشورة: **${posts.length}**`);
md.push(`- التصنيفات الموجودة: **${categories.length}** (منها **${catRows.filter((c) => c.actual === 0).length}** غير مستخدمة إطلاقاً، و**${catRows.filter((c) => c.actual === 1).length}** مستخدمة في مقال واحد فقط)`);
md.push(`- الوسوم الموجودة: **${tags.length}** (منها **${tagRows.filter((t) => t.actual === 0).length}** غير مستخدمة، و**${tagRows.filter((t) => t.actual === 1).length}** مستخدمة في مقال واحد فقط)`);
md.push('');
md.push('## الأولوية');
md.push('');
for (const [k, v] of Object.entries(priorityCounts)) md.push(`- ${k}: **${v}**`);
md.push('');
md.push('## المشاكل');
md.push('');
md.push('| المشكلة | العدد |');
md.push('|---|---:|');
for (const [k, v] of Object.entries(counts)) md.push(`| ${issueDefs[k]} (\`${k}\`) | ${v} |`);
md.push('');
md.push('## أكثر التصنيفات استخداماً');
md.push('');
for (const c of catRows.slice(0, 25)) md.push(`- ${c.name} — ${c.actual}`);
md.push('');
md.push('## تصنيفات مشبوهة (استخدام 1–2 مع اسم غير منهجي)');
md.push('');
for (const c of suspiciousCats.slice(0, 60)) md.push(`- ${c.name} — ${c.actual}`);
md.push('');
md.push('## أمثلة من المقالات ذات الأولوية العالية');
md.push('');
for (const r of rows.filter((x) => x.priority === 'عالية').slice(0, 40)) {
  md.push(`- [${r.title}](${r.url}) — ${r.issues.map((i) => issueDefs[i]).join('، ')} — كلمات النص: ${r.proseWords}`);
}
md.push('');
const exampleList = (issue, limit = 12) => {
  const list = rows.filter((r) => r.issues.includes(issue)).slice(0, limit);
  return list.length
    ? list.map((r) => `- [${r.title}](${r.url}) — ${r.categories.join('، ') || 'بلا تصنيف'} — ${r.proseWords} كلمة`).join('\n')
    : '- لا يوجد.';
};
const addSection = (title, issue) => {
  md.push('', `## ${title}`, '', `العدد: **${counts[issue]}**`, '', exampleList(issue));
};

md.push('', '## تفاصيل حسب نوع المشكلة');
addSection('مصنّفة Uncategorized / غير مصنف', 'uncategorized');
addSection('فيديو فقط بلا نص تحريري', 'video_only');
addSection('مشغّل صوتي فقط بلا نص تحريري', 'audio_only');
addSection('كتل Quran Gateway فقط بلا نص تحريري', 'gateway_only');
addSection('صورة فقط بلا نص يذكر', 'image_only');
addSection('عناوين مكررة', 'duplicate_title');
addSection('نص مكرر فعلي (أكثر من 250 حرفاً)', 'duplicate_content');

md.push(
  '',
  '## مقترح تنظيم التصنيفات',
  '',
  '- **تلاوات قرآن**: تلاوات خاشعة، تلاوات منوعة، تلاوات فيديو. أسماء القرّاء والسور تذهب إلى الوسوم لا إلى التصنيف.',
  '- **المصحف والتحميل PDF**: تحميل المصحف pdf، القرآن الكريم مكتوب pdf، quran book pdf، eDownload mp3.',
  '- **ترجمات القرآن**: quran، quran in English، سور القران مع الترجمه الانجليزيه، quran with urdu translation، المصحف المترجم باللغات المختلفة.',
  '- **السور والآيات**: سورة الواقعة، Al-Fatihah، آية الكرسي، سور القران مع الترجمه.',
  '- **الأدعية والأذكار والرقية**: أدعية مختارة، أذكار اليوم والليلة، الرقية الشرعية، دعاء القنوت.',
  '- **التلاوات الصوتية MP3**: تحميل القران mp3، القرآن الكريم mp3، أسماء القرّاء.',
  '- **مقالات معرفية عامة**: كل ما لا يدخل فيما سبق بعد مراجعة يدوية.',
  '',
  '> لا تُحذف مسارات URLs القديمة؛ تُضاف التصنيفات المنظّمة ويُعاد تعيين المقالات مع الحفاظ على الروابط كما هي.',
);
md.push('', '> الملف الكامل: `reports/articles-audit.csv` و `reports/articles-audit.json`.');
fs.writeFileSync(path.join(OUT_DIR, 'articles-audit.md'), md.join('\n'), 'utf8');

console.log('posts', posts.length, 'categories', categories.length, 'tags', tags.length);
console.log('priority', priorityCounts);
console.log('issues', counts);
console.log('top categories', catRows.slice(0, 12).map((c) => `${c.name}:${c.actual}`));
console.log('suspicious categories', suspiciousCats.length);
console.log('reports written to', OUT_DIR);
