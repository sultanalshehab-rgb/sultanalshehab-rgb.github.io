// خدمة حجز الجلسة الثانية — Cloudflare Worker
// تربط صفحة /session-two/ بقاعدة Airtable دون كشف المفتاح للمتصفح.
// الأسرار (تُضبط من لوحة Cloudflare، لا تُكتب هنا):
//   AIRTABLE_TOKEN  مفتاح Airtable شخصي بصلاحية data.records:read و data.records:write على القاعدة فقط
//   ALLOWED_ORIGIN  أصل الموقع، مثل https://sultanalshehab-rgb.github.io

const BASE = 'appe7H0lsFiQ34Zy4';
const T = {
  coaches: 'tbllw324pRpp2OPJM',
  trainees: 'tblGkLuqjyLZRusAT',
  slots: 'tblALJ8XNkZK8ohkp',
  bookings: 'tblno5Ip7LbGYd7kN',
};
const F = {
  coachName: 'fldkVSLRUKX2bQkOn',
  coachTeams: 'fldTtyiiuJNaLG1Jv',
  traineeName: 'flda4SNFYRflhQiup',
  traineeEmail: 'fldu2rK18N6ZBeBQh',
  traineeCoach: 'fldbQwCoMeWzH5ECM',
  traineeBookings: 'fldnBZjDQNM991Mju',
  slotStart: 'fldoPRi2vrKqJ54mB',
  slotEnd: 'fldwz2sfPmi0xELqG',
  slotStatus: 'fldnf01CcgV1gBM2B',
  slotCoach: 'fldYcPyoYrXPecGS1',
  slotBookings: 'fldZKh6eb4ZXWU7in',
  coachSlots: 'fldAlhzPoa1sLtr37',
  bookingNo: 'fldUl78ShNjlAG9W5',
  bookingStatus: 'fldSZxApznajuwbth',
  bookingEmail: 'fldUwcd10mcCICmeg',
  bookingDetails: 'fldDDvWnmSK9OzThQ',
  bookingTeams: 'fldhyoQs7OLDjKo5g',
  bookingSend: 'fldy8Vv1F2crRuSFJ',
  bookingTrainee: 'fldGgATG7b4vV13mM',
  bookingSlot: 'fldM7ZcEJndNoAqvn',
};
const AVAILABLE = 'متاح', BOOKED = 'محجوز';
const PENDING = 'قيد المعالجة', CONFIRMED = 'مؤكد', CANCELLED = 'ملغي';
const ACTIVE = [PENDING, CONFIRMED];

const timeFmt = new Intl.DateTimeFormat('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit', hour12: true });
const dateFmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const riyadhDate = iso => new Date(new Date(iso).getTime() + 3 * 3600e3).toISOString().slice(0, 10);

class UserError extends Error {}

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    if (req.method !== 'POST') return json({ message: 'غير مسموح' }, 405);
    try {
      const body = await req.json().catch(() => ({}));
      const path = new URL(req.url).pathname;
      const at = airtable(env.AIRTABLE_TOKEN);
      if (path.endsWith('/lookup')) return json(await lookup(at, body));
      if (path.endsWith('/book')) return json(await book(at, body));
      return json({ message: 'غير موجود' }, 404);
    } catch (err) {
      if (err instanceof UserError) return json({ message: err.message }, 400);
      console.error(err);
      return json({ message: 'تعذر إتمام الطلب. حاول مرة أخرى.' }, 500);
    }
  },
};

function airtable(token) {
  const call = async (method, path, body) => {
    const r = await fetch(`https://api.airtable.com/v0/${BASE}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(`Airtable ${r.status}: ${await r.text()}`);
    return r.json();
  };
  return {
    async list(table, params) {
      const out = [];
      let offset;
      do {
        const q = new URLSearchParams({ returnFieldsByFieldId: 'true', ...params });
        if (offset) q.set('offset', offset);
        const page = await call('GET', `${table}?${q}`);
        out.push(...page.records);
        offset = page.offset;
      } while (offset);
      return out;
    },
    get: (table, id) => call('GET', `${table}/${id}?returnFieldsByFieldId=true`),
    create: (table, fields) => call('POST', `${table}?returnFieldsByFieldId=true`, { fields, typecast: true }),
    update: (table, id, fields) => call('PATCH', `${table}/${id}?returnFieldsByFieldId=true`, { fields, typecast: true }),
  };
}

const esc = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const idFormula = ids => `OR(${ids.map(id => `RECORD_ID()='${esc(id)}'`).join(',')})`;
const name = sel => (sel && typeof sel === 'object' ? sel.name : sel);

function cleanEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) throw new UserError('أدخل بريدًا إلكترونيًا صحيحًا.');
  return e;
}

async function findTrainee(at, email) {
  const recs = await at.list(T.trainees, { filterByFormula: `LOWER(TRIM({البريد الإلكتروني}))='${esc(email)}'`, maxRecords: '1' });
  if (!recs.length) throw new UserError('لم نجد هذا البريد في قائمة المتدربين. تأكد من البريد المسجل أو تواصل مع منظم البرنامج.');
  const trainee = recs[0];
  const coachId = (trainee.fields[F.traineeCoach] || [])[0];
  if (!coachId) throw new UserError('لم يُخصَّص لك كوتش بعد. تواصل مع منظم البرنامج.');
  const coach = await at.get(T.coaches, coachId);
  return { trainee, coach };
}

async function activeBookings(at, ids) {
  if (!ids || !ids.length) return [];
  const recs = await at.list(T.bookings, { filterByFormula: idFormula(ids) });
  return recs.filter(b => ACTIVE.includes(name(b.fields[F.bookingStatus])));
}

async function describeBooking(at, booking) {
  const slotId = (booking.fields[F.bookingSlot] || [])[0];
  if (!slotId) return booking.fields[F.bookingNo] || '';
  const slot = await at.get(T.slots, slotId);
  return `${dateFmt.format(new Date(slot.fields[F.slotStart]))} — ${timeFmt.format(new Date(slot.fields[F.slotStart]))}`;
}

async function coachSlots(at, coach) {
  const ids = coach.fields[F.coachSlots] || [];
  if (!ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 50) out.push(...await at.list(T.slots, { filterByFormula: idFormula(ids.slice(i, i + 50)) }));
  const now = Date.now();
  return out
    .filter(s => s.fields[F.slotStart] && s.fields[F.slotEnd])
    .map(s => ({
      id: s.id,
      date: riyadhDate(s.fields[F.slotStart]),
      start: s.fields[F.slotStart],
      end: s.fields[F.slotEnd],
      available: name(s.fields[F.slotStatus]) === AVAILABLE && new Date(s.fields[F.slotStart]).getTime() > now,
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

async function lookup(at, { email }) {
  email = cleanEmail(email);
  const { trainee, coach } = await findTrainee(at, email);
  const existing = await activeBookings(at, trainee.fields[F.traineeBookings]);
  const base = { trainee: { name: trainee.fields[F.traineeName] || '' }, coach: { name: coach.fields[F.coachName] || '' } };
  if (existing.length) return { ...base, existingBooking: { description: await describeBooking(at, existing[0]) } };
  return { ...base, slots: await coachSlots(at, coach) };
}

async function book(at, { email, slotId, requestId }) {
  email = cleanEmail(email);
  if (!/^rec[A-Za-z0-9]{14}$/.test(String(slotId))) throw new UserError('الموعد غير صالح.');
  const { trainee, coach } = await findTrainee(at, email);

  const existing = await activeBookings(at, trainee.fields[F.traineeBookings]);
  if (existing.length) throw new UserError('لديك حجز مؤكد بالفعل: ' + await describeBooking(at, existing[0]));

  const slot = await at.get(T.slots, slotId);
  if (!(slot.fields[F.slotCoach] || []).includes(coach.id)) throw new UserError('هذا الموعد ليس مع الكوتش المخصص لك.');
  if (name(slot.fields[F.slotStatus]) !== AVAILABLE || new Date(slot.fields[F.slotStart]).getTime() <= Date.now())
    throw new UserError('هذا الموعد لم يعد متاحًا. اختر موعدًا آخر.');

  const ref = 'S2-' + String(requestId || crypto.randomUUID()).replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase();
  const booking = await at.create(T.bookings, {
    [F.bookingNo]: ref,
    [F.bookingStatus]: PENDING,
    [F.bookingTrainee]: [trainee.id],
    [F.bookingSlot]: [slot.id],
  });

  // حماية من حجزين متزامنين لنفس الموعد: أقدم حجز نشط هو الفائز.
  const fresh = await at.get(T.slots, slot.id);
  const rivals = (await activeBookings(at, fresh.fields[F.slotBookings]))
    .sort((a, b) => a.createdTime.localeCompare(b.createdTime) || a.id.localeCompare(b.id));
  if (rivals.length && rivals[0].id !== booking.id) {
    await at.update(T.bookings, booking.id, { [F.bookingStatus]: CANCELLED });
    throw new UserError('سبقك أحد لهذا الموعد. اختر موعدًا آخر.');
  }

  await at.update(T.slots, slot.id, { [F.slotStatus]: BOOKED });
  const start = new Date(slot.fields[F.slotStart]), end = new Date(slot.fields[F.slotEnd]);
  const teams = coach.fields[F.coachTeams] || '';
  const details = [
    `مرحبًا ${trainee.fields[F.traineeName] || ''}،`,
    'تم تأكيد حجز جلستك الثانية في مشروع المواهب الواعدة.',
    `رقم الحجز: ${ref}`,
    `الكوتش: ${coach.fields[F.coachName] || ''}`,
    `التاريخ: ${dateFmt.format(start)}`,
    `الوقت: ${timeFmt.format(start)} – ${timeFmt.format(end)} (بتوقيت الرياض)`,
    'مدة الجلسة: ساعة واحدة',
    teams ? `رابط الجلسة على Teams: ${teams}` : 'يُرسل رابط Teams لاحقًا.',
  ].join('\n');
  await at.update(T.bookings, booking.id, {
    [F.bookingStatus]: CONFIRMED,
    [F.bookingEmail]: email,
    [F.bookingDetails]: details,
    ...(teams ? { [F.bookingTeams]: teams } : {}),
    [F.bookingSend]: true,
  });
  return { ok: true, bookingNo: ref };
}
