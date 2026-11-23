# QuranBook — النسخة الثابتة (Astro + Cloudflare Pages)

نسخة ثابتة من موقع `quranbook.org`، مبنية من مستودع على Cloudflare Pages،
تهدف إلى إلغاء استضافة WordPress مع الحفاظ على **كل الروابط والترتيب في محركات البحث**.

## الإحصائيات

- 862 مقالة + 11 صفحة
- 549 تصنيفاً + 556 وسماً
- 1,968 رابطاً من خريطة الموقع القديمة (تُنقل حرفياً)
- 411 صورة محلية (70 MB)

## البناء محلياً

```bash
npm install
npm run build
```

الناتج في `dist/`.

## النشر على Cloudflare Pages

1. اربط هذا المستودع بـ Cloudflare Pages → **Create a project → Connect to Git**.
2. إعدادات البناء:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node version:** `22` (أو أضف متغير البيئة `NODE_VERSION=22`)
3. لا يحتاج أي متغيرات بيئة.
4. في البداية استخدم رابط المعاينة الذي يعطيه Cloudflare (`*.pages.dev`) للمراجعة،
   **ولا تغيّر DNS** حتى اكتمال فحص كل الروابط.

## كيف حافظنا على الروابط؟

WordPress يخزّن الروابط العربية مشفّرة مثل:
`/%d8%b3%d9%88%d8%b1%d8%a9-%d8%a7%d9%84%d8%a5%d8%b3%d8%b1%d8%a7%d8%a1/`

Astro يولّد الصفحات بمسارات داخلية آمنة (`generated/<id>/`)، ثم يقوم
`scripts/rewrite-paths.mjs` بنقلها إلى **المسار الأصلي حرفياً** بعد البناء.
بهذا لا يتغيّر أي رابط، ولا نحتاج إلى 301 للغالبية.

كما يُنشئ السكربت:
- `sitemap.xml` بكل روابط خريطة الموقع القديمة.
- `robots.txt`.
- صفحات المؤلفين المفقودة من REST API.
- تقريراً بالروابط المفقودة في `missing-urls.json` (يجب أن يكون فارغاً).

## بنية المشروع

```
src/
  layouts/BaseLayout.astro   → <head> من بيانات Yoast الأصلية
  pages/generated/           → صفحات المقالات/الصفحات/التصنيفات/الوسوم
  pages/blog/                → أرشيف المقالات + ترقيم 87 صفحة
  lib/content.mjs            → قراءة التصدير + تحويل روابط الصور
  styles/global.css          → التصميم + تأثيرات زجاجية مستوحاة من Magic UI
data/export/                 → تصدير WordPress (محتوى + Yoast)
public/wp-content/uploads/   → 411 صورة من الموقع القديم
scripts/
  rewrite-paths.mjs          → إعادة المسارات + sitemap + تحقق
  copy-data.mjs              → نسخ البيانات من مجلد الترحيل
```

## قبل تحويل DNS

- [ ] فحص كل الروابط (الهدف: 0 مفقود في `missing-urls.json`)
- [ ] مقارنة title/meta بين القديم والجديد لعينة من المقالات
- [ ] التأكد من عمل الصور والمقالات العربية
- [ ] إرسال `sitemap.xml` في Google Search Console
- [ ] مراقبة 7-14 يوماً، ثم تحويل DNS
