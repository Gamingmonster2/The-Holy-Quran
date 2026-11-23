# خطوات الربط مع Cloudflare Pages (تجريبي)

## 1. المشروع التجريبي
تم إنشاء مشروع Pages مباشرة باسم `quranbook-test` (الفرع `main`) ونشره برفع الملفات
(`wrangler pages deploy dist`) وليس عبر ربط Git بعد.

- الرابط التجريبي: https://quranbook-test.pages.dev
- آخر نشر: https://97957dad.quranbook-test.pages.dev
- الحساب: `safealigoog@gmail.com`

**لا تغيّر DNS بعد.** هذا رابط تجريبي فقط والموقع القديم يعمل كما هو.

### إعادة النشر
```bash
npm run build
node scripts/verify.mjs
npx wrangler pages deploy dist --project-name quranbook-test --branch main \
  --commit-hash <SHA> --commit-message "<message>"
```
لا تستخدم `--force`؛ المشروع موجود بالفعل.

## 2. ملاحظة مهمة حول المسارات العربية
Cloudflare Pages يفك ترميز مسار الطلب قبل مطابقته للملفات الثابتة. لذلك تُخزَّن مجلدات
الصفحات بالاسم العربي المفكوك (مثل `ربح-ملايين-.../`) بينما تبقى الروابط في `sitemap.xml`
والـ `canonical` كما هي في الموقع الأصلي (percent-encoded). بدون هذا الإصلاح كانت كل
الصفحات العربية تُعرض كصفحة رئيسية بحالة 200.

## 3. الفحص قبل تحويل DNS
```bash
node scripts/verify-preview.mjs https://quranbook-test.pages.dev 8 5
node scripts/compare-preview.mjs https://quranbook-test.pages.dev
```
- `verify-preview` يفحص الحالة + `canonical` لكل روابط خريطة الموقع والصور، مع إعادة محاولة
  عند أخطاء 522/523 المؤقتة.
- `compare-preview` يقارن عيّنة من القديم والجديد: `title`، `description`، `canonical`، JSON-LD، إلخ.

### النتيجة الحالية
- البناء: 2068 صفحة، روابط مفقودة: 0.
- الفحص المباشر: **2384 رابط فريد — 0 فشل**.
- العيّنة المقارَنة: `title` و `canonical` متطابقان في المقالات والصفحات والأرشيفات.
- الفروق المتبقية متعلقة بالتصميم فقط (عدد الصور/الروابط الداخلية و `h1`)، مع إضافة
  `meta description` و JSON-LD لأرشيفات التصنيفات والوسوم.

## 4. بعد نجاح التجربة (لم تُنفذ بعد)
1. في Cloudflare Pages → **Custom domains** → أضف `quranbook.org` و `www.quranbook.org`.
2. في DNS: وجّه A/AAAA أو CNAME إلى Pages.
3. أعد إرسال `https://quranbook.org/sitemap.xml` في Google Search Console وراقب 7-14 يوماً.
4. فقط بعد استقرار الزيارات أوقف/احذف الاستضافة القديمة.

## 5. التراجع السريع
إن ظهرت مشكلة، أعد DNS إلى الاستضافة القديمة — لا يوجد أي تعديل عليها، فهي لا تزال تعمل.
**لم نحذف شيئاً بعد.**
