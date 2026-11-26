/**
 * خادم نتائج الاختبارات — سلطان الشهاب
 * Google Apps Script web app. يستقبل النتائج من tests.html ثم:
 *  1) يحفظ النتيجة في Airtable (قاعدة «نتائج اختبارات الموقع»)
 *  2) يرفع تقرير PDF إلى سجل النتيجة
 *  3) يرسل التقرير على إيميل الشخص من Gmail الخاص بك
 *
 * الأسرار محفوظة في Script Properties فقط (لا شيء منها في الموقع):
 *   AIRTABLE_TOKEN  توكن Airtable شخصي بصلاحية data.records:read و data.records:write على هذه القاعدة فقط
 *   SECRET          يُنشأ تلقائياً بتشغيل setup() مرة واحدة
 *   NOTIFY_EMAIL    (اختياري) بريد يصله إشعار مختصر بكل تقرير يُرسل
 */

var BASE = 'appvdJlCMZqXV17hA';
var T_RESULTS = 'tblL4GUgzYwXUKSa8';
var T_PEOPLE = 'tbllhdINhyzeCCMzt';
var F = {
  name: 'fldZXGFAGeOwl741t', email: 'fldnXjinYbA9mtHtC', org: 'fldPtvNkyE6s2ZyBi',
  test: 'fldblC7X3GUGhTM3f', testId: 'fldRJYbCpcNasB9D1', headline: 'fldQvMOneGAVZ7RrF',
  summary: 'fldh35X2BOrssbCiu', scores: 'fldp1yIC2kcNnkpiO', pdf: 'fld7R8KeDUPPUVzEO',
  status: 'fld52zaHiOz9qeEK3', consent: 'fldZdtYXcrQCGIhLr', date: 'fld74B7lAObAWs78n',
  person: 'fldGy12bG5rPxx9za'
};
var P = { email: 'fldoY5mjbGpPLg7pX', name: 'fld8aFe7etDXPcjJM', org: 'fldlbOISaFywRJd7W' };

var SITE = 'https://sultanalshehab-rgb.github.io';
var BOOK = 'https://airtable.com/appvS94pd4R5zDikc/shrgEllxVpJM32PHk';
var SENDER_NAME = 'سلطان الشهاب';

// حدود ضد الإساءة
var MAX_SAVES_PER_DAY = 1500;
var MAX_EMAILS_PER_DAY = 80;        // حد Gmail الشخصي حوالي 100 يومياً
var MAX_EMAILS_PER_ADDRESS = 3;     // لكل بريد خلال 6 ساعات
var MAX_PDF_BYTES = 4.5 * 1024 * 1024;

/** شغّلها مرة واحدة من المحرر بعد إضافة AIRTABLE_TOKEN */
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRET')) props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  if (!props.getProperty('AIRTABLE_TOKEN')) throw new Error('أضف AIRTABLE_TOKEN في Script Properties أولاً');
  // يتأكد أن التوكن يعمل
  var r = at_('get', 'https://api.airtable.com/v0/' + BASE + '/' + T_RESULTS + '?maxRecords=1');
  Logger.log('Airtable OK: ' + JSON.stringify(r).slice(0, 200));
  Logger.log('Mail quota left today: ' + MailApp.getRemainingDailyQuota());
}

function doGet() { return out_({ ok: true, service: 'sultan-tests' }); }

function doPost(e) {
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.hp) return out_({ ok: true }); // honeypot: bots fill the hidden field
    if (d.action === 'save') return out_(save_(d));
    if (d.action === 'email') return out_(email_(d));
    return out_({ ok: false, msg: 'طلب غير معروف' });
  } catch (err) {
    console.error(err);
    return out_({ ok: false, msg: 'تعذر الإرسال الآن، حاول بعد قليل.' });
  }
}

/* ---------- actions ---------- */

function save_(d) {
  var m = clean_(d);
  if (!m.name || !m.title) return { ok: false, msg: 'بيانات ناقصة' };
  if (!count_('saves', MAX_SAVES_PER_DAY)) return { ok: false, msg: 'busy' };
  var rec = createResult_(m, 'لم يطلب');
  return { ok: true, id: rec.id, tok: sign_(rec.id) };
}

function email_(d) {
  var m = clean_(d);
  var to = String(d.email || '').trim().toLowerCase().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return { ok: false, msg: 'اكتب بريداً إلكترونياً صحيحاً.' };
  if (!m.name || !m.title) return { ok: false, msg: 'بيانات ناقصة' };

  var pdfBytes = Utilities.base64Decode(String(d.pdf || ''));
  if (pdfBytes.length < 1000 || pdfBytes.length > MAX_PDF_BYTES ||
      String.fromCharCode(pdfBytes[0], pdfBytes[1], pdfBytes[2], pdfBytes[3]) !== '%PDF') {
    return { ok: false, msg: 'تعذر تجهيز التقرير. حمّله مباشرة من الزر.' };
  }

  var cache = CacheService.getScriptCache();
  var key = 'em:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, to));
  var sent = Number(cache.get(key) || 0);
  if (sent >= MAX_EMAILS_PER_ADDRESS) return { ok: false, msg: 'أُرسل التقرير لهذا البريد أكثر من مرة اليوم. حمّله مباشرة من الزر.' };
  if (!count_('emails', MAX_EMAILS_PER_DAY) || MailApp.getRemainingDailyQuota() < 5) {
    return { ok: false, msg: 'وصلنا الحد اليومي للإرسال. حمّل التقرير مباشرة، وسيكون محفوظاً.' };
  }

  // السجل: نستخدم سجل الحفظ إن كان موثوقاً، وإلا ننشئ سجلاً جديداً
  var id = (d.id && /^rec[A-Za-z0-9]{14}$/.test(d.id) && d.tok === sign_(d.id)) ? d.id : createResult_(m, 'لم يطلب').id;
  var consent = d.consent === true;

  var person = upsertPerson_(to, m);
  var fields = {};
  fields[F.email] = to;
  fields[F.consent] = consent;
  if (person) fields[F.person] = [person];
  patch_(T_RESULTS, id, fields);

  var filename = String(d.filename || 'تقرير.pdf').replace(/[\\\/:*?"<>|]+/g, '').slice(0, 100);
  if (!/\.pdf$/i.test(filename)) filename += '.pdf';
  try { uploadPdf_(id, d.pdf, filename); } catch (err) { console.error('upload', err); }

  var status = 'أُرسل';
  try {
    var blob = Utilities.newBlob(pdfBytes, 'application/pdf', filename);
    MailApp.sendEmail({
      to: to,
      subject: 'تقريرك: ' + m.title + ' | سلطان الشهاب',
      body: plain_(m),
      htmlBody: html_(m),
      name: SENDER_NAME,
      attachments: [blob]
    });
    cache.put(key, String(sent + 1), 21600);
    var notify = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
    if (notify) MailApp.sendEmail(notify, 'نتيجة جديدة: ' + m.name + ' - ' + m.title,
      m.name + (m.org ? ' (' + m.org + ')' : '') + '\n' + to + '\n' + m.title + '\n' + m.headline +
      '\nhttps://airtable.com/' + BASE + '/' + T_RESULTS + '/' + id);
  } catch (err) {
    console.error('mail', err);
    status = 'فشل';
  }
  var f2 = {}; f2[F.status] = status;
  patch_(T_RESULTS, id, f2);
  return status === 'أُرسل' ? { ok: true } : { ok: false, msg: 'تعذر إرسال الإيميل الآن. حمّل التقرير مباشرة من الزر.' };
}

/* ---------- Airtable ---------- */

function createResult_(m, status) {
  var f = {};
  f[F.name] = m.name; f[F.org] = m.org; f[F.test] = m.title; f[F.testId] = m.id;
  f[F.headline] = m.headline; f[F.summary] = m.summary; f[F.scores] = m.scores;
  f[F.status] = status; f[F.date] = new Date().toISOString();
  var r = at_('post', 'https://api.airtable.com/v0/' + BASE + '/' + T_RESULTS,
    { records: [{ fields: f }], typecast: true });
  return r.records[0];
}

function upsertPerson_(email, m) {
  try {
    var f = {}; f[P.email] = email; f[P.name] = m.name; if (m.org) f[P.org] = m.org;
    var r = at_('patch', 'https://api.airtable.com/v0/' + BASE + '/' + T_PEOPLE,
      { performUpsert: { fieldsToMergeOn: [P.email] }, records: [{ fields: f }], typecast: true });
    return r.records[0].id;
  } catch (err) { console.error('person', err); return null; }
}

function patch_(table, id, fields) {
  return at_('patch', 'https://api.airtable.com/v0/' + BASE + '/' + table,
    { records: [{ id: id, fields: fields }], typecast: true });
}

function uploadPdf_(id, b64, filename) {
  return at_('post', 'https://content.airtable.com/v0/' + BASE + '/' + id + '/' + F.pdf + '/uploadAttachment',
    { contentType: 'application/pdf', file: b64, filename: filename });
}

function at_(method, url, body) {
  var token = PropertiesService.getScriptProperties().getProperty('AIRTABLE_TOKEN');
  var opt = { method: method, muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token } };
  if (body) opt.payload = JSON.stringify(body);
  var res = UrlFetchApp.fetch(url, opt);
  var code = res.getResponseCode();
  if (code >= 300) throw new Error('Airtable ' + code + ': ' + res.getContentText().slice(0, 300));
  return JSON.parse(res.getContentText());
}

/* ---------- helpers ---------- */

function clean_(d) {
  function s(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n); }
  var scores = s(d.scores, 20000);
  return {
    id: /^[a-z0-9-]{1,40}$/.test(d.test_id || '') ? d.test_id : 'unknown',
    title: s(d.test_title, 120), name: s(d.name, 60), org: s(d.org, 80),
    headline: s(d.headline, 200), summary: s(d.summary, 8000), scores: scores
  };
}

function sign_(id) {
  var secret = PropertiesService.getScriptProperties().getProperty('SECRET') || '';
  var raw = Utilities.computeHmacSha256Signature(id, secret);
  return Utilities.base64EncodeWebSafe(raw).slice(0, 32);
}

function count_(kind, max) {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var props = PropertiesService.getScriptProperties();
    var day = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd');
    var k = 'n:' + kind;
    var v = JSON.parse(props.getProperty(k) || '{}');
    if (v.d !== day) v = { d: day, n: 0 };
    if (v.n >= max) return false;
    v.n++; props.setProperty(k, JSON.stringify(v));
    return true;
  } finally { lock.releaseLock(); }
}

function esc_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function plain_(m) {
  return 'مرحباً ' + m.name + '،\n\nشكراً لإكمالك اختبار (' + m.title + ') في موقعي.\n' +
    (m.headline ? 'نتيجتك باختصار: ' + m.headline + '\n' : '') +
    'تجد تقريرك الكامل باسمك مرفقاً بصيغة PDF.\n\n' +
    'إذا حاب تحوّل نتيجتك إلى خطة واضحة، احجز جلسة كوتشنج: ' + BOOK + '\n\n' +
    'سلطان الشهاب\nمستشار قيادي وكوتش تنفيذي\n' + SITE;
}

function html_(m) {
  var font = "font-family:'Dubai','Segoe UI',Tahoma,Arial,sans-serif;";
  return '<div dir="rtl" style="' + font + 'background:#f4f6f8;padding:24px 12px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dbe3ea">' +
    '<tr><td style="background:#0d2436;padding:22px 26px;color:#eef3f7;' + font + '">' +
      '<div style="font-size:20px;font-weight:700">سلطان الشهاب</div>' +
      '<div style="font-size:12px;color:#a9bccb">مستشار قيادي وكوتش تنفيذي · خبرة +٢٥ سنة</div></td></tr>' +
    '<tr><td style="height:5px;background:#2dd4bf;line-height:5px;font-size:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:26px;color:#10283a;font-size:15px;line-height:1.8;' + font + '">' +
      '<p style="margin:0 0 12px">مرحباً <b>' + esc_(m.name) + '</b>،</p>' +
      '<p style="margin:0 0 12px">شكراً لإكمالك اختبار <b>(' + esc_(m.title) + ')</b> في موقعي. مرفق لك تقريرك الكامل باسمك بصيغة PDF.</p>' +
      (m.headline ? '<p style="margin:0 0 16px;padding:12px 16px;background:#d5f5f0;border-radius:12px;color:#0f766e;font-weight:700">' + esc_(m.headline) + '</p>' : '') +
      '<p style="margin:0 0 18px">إذا حاب تحوّل نتيجتك إلى خطة واضحة، نقرأها معاً في جلسة كوتشنج ونحدد خطوتك التالية.</p>' +
      '<a href="' + BOOK + '" style="display:inline-block;background:#2dd4bf;color:#0d2436;text-decoration:none;font-weight:700;padding:11px 26px;border-radius:999px">احجز جلسة كوتشنج</a>' +
    '</td></tr>' +
    '<tr><td style="padding:16px 26px;border-top:1px solid #dbe3ea;font-size:12px;color:#56687a;' + font + '">' +
      'وصلك هذا الإيميل لأنك طلبت تقريرك من صفحة الاختبارات في <a href="' + SITE + '/tests.html" style="color:#0f766e">موقع سلطان الشهاب</a>.</td></tr>' +
    '</table></div>';
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
