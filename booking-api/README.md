# خدمة حجز الجلسة الثانية

الصفحة: `/session-two/` على الموقع. تحتاج هذه الخدمة الصغيرة لأن الموقع ثابت ولا يجوز وضع مفتاح Airtable في المتصفح.

## التشغيل (مرة واحدة)

1. **مفتاح Airtable**: من https://airtable.com/create/tokens أنشئ مفتاحًا بالصلاحيتين
   `data.records:read` و `data.records:write`، وحدد القاعدة `appe7H0lsFiQ34Zy4` فقط.
2. **Cloudflare** (مجاني): من لوحة Workers & Pages ← Create Worker، الصق محتوى `worker.js` واحفظ.
3. في إعدادات الـ Worker ← Variables and Secrets:
   - `AIRTABLE_TOKEN` (Secret) = المفتاح من الخطوة 1
   - `ALLOWED_ORIGIN` = `https://sultanalshehab-rgb.github.io`
4. انسخ رابط الـ Worker (مثل `https://session-two-booking.xxx.workers.dev`) وضعه في
   `session-two/index.html` داخل `const API_BASE='...'` بدون شرطة في آخره.

بعدها تختفي رسالة "معاينة الواجهة" ويصير الحجز حقيقيًا.

## ماذا تفعل الخدمة

- `/lookup`: تبحث عن المتدرب ببريده، وترجع اسمه واسم الكوتش ومواعيد الكوتش المتاحة، أو حجزه الحالي إن وُجد.
- `/book`: تتحقق أن الموعد متاح ومع الكوتش نفسه وأن المتدرب ليس له حجز، تنشئ الحجز بحالة "مؤكد"،
  تغيّر الموعد إلى "محجوز"، وتفعّل "إرسال التأكيد" فترسل أتمتة Airtable الموجودة رسالة التأكيد.
