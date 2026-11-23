# خطوات الربط مع Cloudflare Pages (تجريبي)

## 1. ربط المستودع
1. افتح https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. اختر GitHub → مستودع `Gamingmonster2/The-Holy-Quran`.
3. إعدادات البناء:
   - **Project name:** `quranbook-test` (مؤقت)
   - **Production branch:** `main`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node version:** 22
4. اضغط **Save and Deploy**. الانتظار ~3-5 دقائق (الحجم ~90MB).

## 2. رابط المعاينة
بعد البناء ستحصل على رابط مثل:
`https://quranbook-test.pages.dev`

**لا تغيّر DNS بعد.** هذا رابط تجريبي فقط.

## 3. الفحص المطلوب قبل تحويل DNS
افتح هذه الروابط في الرابط التجريبي وقارنها بالموقع القديم:

- `/` — الصفحة الرئيسية
- `/blog/` — أرشيف المقالات
- رابط أي مقالة عربية طويلة (من `migration/inventory/urls.json`)
- `/category/%d8%a7.../` — تصنيف
- `/tag/2020/` — وسم
- `/wp-content/uploads/2024/05/images.jpg` — صورة
- `/sitemap.xml`
- `/robots.txt`

تحقق من:
- [ ] المحتوى العربي سليم (لا رموز مشوّشة)
- [ ] الصور تظهر
- [ ] الروابط الداخلية تعمل
- [ ] `title` و `meta description` مطابقان للقديم
- [ ] لا توجد صفحة 404 في الروابط المفهرسة

## 4. بعد نجاح التجربة
1. في Cloudflare Pages → **Custom domains** → أضف `quranbook.org` و `www.quranbook.org`.
2. في DNS (عند Cloudflare أو مسجّل الدومين):وجّه A/AAAA أو CNAME إلى Pages.
3. انتظر 7-14 يوماً و راقب Google Search Console.
4. فقط بعد استقرار الزيارات أوقف/احذف الاستضافة القديمة.

## 5. التراجع السريع
إن ظهرت مشكلة، أعدDNS إلى الاستضافة القديمة — لا يوجد أي تعديل علىها، فهي لا تزال تعمل.
هذه ميزة important: **لم نحذف شيئاً بعد**.
