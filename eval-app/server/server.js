require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const oracledb = require('oracledb');
oracledb.autoCommit = true;
const app = express();
const PORT = Number(process.env.PORT || 3000);
const sessions = new Map(); // in-memory sessions; users sign in again after server restart
app.use(express.json({ limit: '1mb' }));
// Keep server source, SQL scripts, and environment files out of public static access.
app.use(['/server', '/sql'], (_req, res) => res.status(404).send('Not found'));
app.use(express.static(path.join(__dirname, '..')));

let pool;
function pinHash(username, pin) {
  return crypto.createHash('sha256').update(`${username}:${pin}`, 'utf8').digest('hex');
}
async function query(sql, binds = {}, options = {}) {
  let conn;
  try {
    conn = await pool.getConnection();
    return await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, ...options });
  } finally {
    if (conn) await conn.close();
  }
}
// สร้างแจ้งเตือน (ถ้าล้มเหลว เช่น ยังไม่ได้รัน 02_add_features.sql จะไม่ทำให้งานหลักพัง)
async function notify(userId, title, body, linkView) {
  try {
    await query('INSERT INTO EVAL_NOTIFICATIONS (USER_ID, TITLE, BODY, LINK_VIEW) VALUES (:u, :t, :b, :l)',
      { u: userId, t: String(title).slice(0, 200), b: String(body || '').slice(0, 1000), l: linkView || null });
  } catch (e) { console.error('notify failed:', e.message); }
}
const SHIFT_CODES = ['M', 'A', 'N', 'OFF'];
function publicUser(row) {
  return { id: row.USER_ID, name: row.FULL_NAME, role: row.ROLE, position: row.POSITION_NAME };
}
async function requireAuth(req, res, next) {
  const raw = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const userId = sessions.get(raw);
  if (!raw || !userId) return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  try {
    const result = await query('SELECT USER_ID, FULL_NAME, ROLE, POSITION_NAME FROM EVAL_ACCOUNTS WHERE USER_ID = :id AND IS_ACTIVE = 1', { id: userId });
    if (!result.rows.length) return res.status(401).json({ error: 'ไม่พบบัญชีผู้ใช้' });
    req.user = publicUser(result.rows[0]);
    next();
  } catch (e) { next(e); }
}
function requireEvaluator(req, res, next) {
  if (req.user.role !== 'evaluator') return res.status(403).json({ error: 'ไม่มีสิทธิ์ดำเนินการนี้' });
  next();
}
app.get('/api/health', async (_req, res, next) => {
  try { await query('SELECT 1 AS OK FROM DUAL'); res.json({ ok: true, database: 'Oracle' }); }
  catch (e) { next(e); }
});
app.get('/api/accounts', async (_req, res, next) => {
  try {
    const r = await query('SELECT USER_ID, FULL_NAME, ROLE, POSITION_NAME FROM EVAL_ACCOUNTS WHERE IS_ACTIVE = 1 ORDER BY USER_ID');
    res.json(r.rows.map(row => ({ id: row.USER_ID, name: row.FULL_NAME, role: row.ROLE, position: row.POSITION_NAME })));
  } catch (e) { next(e); }
});
app.post('/api/login', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const pin = String(req.body.pin || '');
    if (!/^[a-z0-9_-]{3,40}$/.test(username) || !/^\d{4,12}$/.test(pin)) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง' });
    const r = await query('SELECT USER_ID, FULL_NAME, ROLE, POSITION_NAME, PIN_HASH FROM EVAL_ACCOUNTS WHERE USER_ID = :id AND IS_ACTIVE = 1', { id: username });
    if (!r.rows.length) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง' });
    const row = r.rows[0];
    const actual = Buffer.from(pinHash(username, pin), 'hex');
    const expected = Buffer.from(row.PIN_HASH, 'hex');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง' });
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, username);
    res.json({ token, user: publicUser(row) });
  } catch (e) { next(e); }
});
app.get('/api/evaluations', requireAuth, requireEvaluator, async (_req, res, next) => {
  try {
    const r = await query('SELECT EVALUATEE_ID, PAYLOAD FROM EVAL_EVALUATIONS ORDER BY EVALUATEE_ID');
    const data = [];
    for (const row of r.rows) {
      let payload = row.PAYLOAD;
      if (payload && typeof payload.getData === 'function') payload = await payload.getData();
      if (Buffer.isBuffer(payload)) payload = payload.toString('utf8');
      data.push({ id: row.EVALUATEE_ID, ...JSON.parse(payload) });
    }
    res.json(data);
  } catch (e) { next(e); }
});
app.get('/api/evaluations/:id', requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id).toLowerCase();
    if (req.user.role !== 'evaluator' && req.user.id !== id) return res.status(403).json({ error: 'ไม่มีสิทธิ์ดูผลประเมินของผู้อื่น' });
    const r = await query('SELECT PAYLOAD FROM EVAL_EVALUATIONS WHERE EVALUATEE_ID = :id', { id });
    if (!r.rows.length) return res.json({ data: null });
    let payload = r.rows[0].PAYLOAD;
    if (payload && typeof payload.getData === 'function') payload = await payload.getData();
    if (Buffer.isBuffer(payload)) payload = payload.toString('utf8');
    res.json({ data: JSON.parse(payload) });
  } catch (e) { next(e); }
});
app.put('/api/evaluations/:id', requireAuth, requireEvaluator, async (req, res, next) => {
  try {
    const id = String(req.params.id).toLowerCase();
    const data = req.body || {};
    const acc = await query('SELECT USER_ID FROM EVAL_ACCOUNTS WHERE USER_ID = :id AND ROLE = \'evaluatee\' AND IS_ACTIVE = 1', { id });
    if (!acc.rows.length) return res.status(400).json({ error: 'ไม่พบพนักงานที่ต้องการประเมิน' });
    if (!Array.isArray(data.scores) || data.scores.length !== 20 || data.scores.some(x => !Number.isInteger(x) || x < 0 || x > 5)) return res.status(400).json({ error: 'รูปแบบคะแนนไม่ถูกต้อง' });
    if (data.status === 'submitted' && data.scores.some(x => x < 1 || x > 5)) return res.status(400).json({ error: 'กรุณาให้คะแนนครบทุกข้อก่อนส่ง' });
    data.evaluatee = id;
    data.evaluator = req.user.id;
    data.evaluatorName = req.user.name;
    const payload = JSON.stringify(data);
    const existing = await query('SELECT EVALUATEE_ID FROM EVAL_EVALUATIONS WHERE EVALUATEE_ID = :id', { id });
    if (existing.rows.length) {
      await query('UPDATE EVAL_EVALUATIONS SET EVALUATOR_ID = :evaluator, STATUS = :status, PAYLOAD = :payload, UPDATED_AT = SYSTIMESTAMP WHERE EVALUATEE_ID = :id', { id, evaluator: req.user.id, status: data.status || 'draft', payload: { val: payload, type: oracledb.CLOB } });
    } else {
      await query('INSERT INTO EVAL_EVALUATIONS (EVALUATEE_ID, EVALUATOR_ID, STATUS, PAYLOAD, UPDATED_AT) VALUES (:id, :evaluator, :status, :payload, SYSTIMESTAMP)', { id, evaluator: req.user.id, status: data.status || 'draft', payload: { val: payload, type: oracledb.CLOB } });
    }
    if (data.status === 'submitted') {
      await notify(id, 'คุณได้รับผลประเมินแล้ว', 'ผลประเมินจาก ' + req.user.name + ' พร้อมให้ตรวจสอบและกดรับทราบ', 'mine');
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.patch('/api/evaluations/:id', requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id).toLowerCase();
    if (req.user.role !== 'evaluatee' || req.user.id !== id) return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขผลประเมินนี้' });
    const r = await query('SELECT PAYLOAD FROM EVAL_EVALUATIONS WHERE EVALUATEE_ID = :id', { id });
    if (!r.rows.length) return res.status(404).json({ error: 'ยังไม่มีผลประเมิน' });
    let payload = r.rows[0].PAYLOAD;
    if (payload && typeof payload.getData === 'function') payload = await payload.getData();
    if (Buffer.isBuffer(payload)) payload = payload.toString('utf8');
    const data = JSON.parse(payload);
    const fields = req.body || {};
    if (Object.prototype.hasOwnProperty.call(fields, 'ack')) {
      if (fields.ack !== true) return res.status(400).json({ error: 'ค่า ack ไม่ถูกต้อง' });
      data.ack = true; data.ackAt = Number(fields.ackAt) || Date.now();
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'reply')) {
      const reply = String(fields.reply || '').trim();
      if (!reply || reply.length > 2000) return res.status(400).json({ error: 'ข้อความต้องมีความยาว 1–2000 ตัวอักษร' });
      data.reply = reply; data.replyAt = Number(fields.replyAt) || Date.now();
    }
    await query('UPDATE EVAL_EVALUATIONS SET PAYLOAD = :payload, UPDATED_AT = SYSTIMESTAMP WHERE EVALUATEE_ID = :id', { id, payload: { val: JSON.stringify(data), type: oracledb.CLOB } });
    if (data.evaluator) {
      if (Object.prototype.hasOwnProperty.call(fields, 'ack')) await notify(data.evaluator, req.user.name + ' รับทราบผลประเมินแล้ว', '', 'table');
      if (Object.prototype.hasOwnProperty.call(fields, 'reply')) await notify(data.evaluator, req.user.name + ' ส่งข้อสงสัยถึงคุณ', data.reply.slice(0, 200), 'table');
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});
// ลบผลประเมิน (หัวหน้าเท่านั้น) -> พนักงานกลับเป็น "ยังไม่ประเมิน"
app.delete('/api/evaluations/:id', requireAuth, requireEvaluator, async (req, res, next) => {
  try {
    const id = String(req.params.id).toLowerCase();
    const r = await query('DELETE FROM EVAL_EVALUATIONS WHERE EVALUATEE_ID = :id', { id });
    if (!r.rowsAffected) return res.status(404).json({ error: 'ไม่พบผลประเมินที่จะลบ' });
    await notify(id, 'ผลประเมินของคุณถูกยกเลิก', 'ผู้ประเมินจะประเมินใหม่อีกครั้ง', 'mine');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- ประวัติพนักงาน ---------- */
app.get('/api/employees', requireAuth, async (req, res, next) => {
  try {
    const sql = "SELECT USER_ID, FULL_NAME, ROLE, POSITION_NAME, EMP_CODE, DEPARTMENT, PHONE, EMAIL, TO_CHAR(START_DATE, 'YYYY-MM-DD') AS START_TXT FROM EVAL_ACCOUNTS WHERE IS_ACTIVE = 1"
      + (req.user.role === 'evaluator' ? '' : ' AND USER_ID = :id') + ' ORDER BY EMP_CODE, USER_ID';
    const r = await query(sql, req.user.role === 'evaluator' ? {} : { id: req.user.id });
    res.json(r.rows.map(row => ({
      id: row.USER_ID, name: row.FULL_NAME, role: row.ROLE, position: row.POSITION_NAME,
      code: row.EMP_CODE, department: row.DEPARTMENT, phone: row.PHONE, email: row.EMAIL, startDate: row.START_TXT
    })));
  } catch (e) { next(e); }
});

/* ---------- ตารางเวลางาน ---------- */
app.get('/api/schedules', requireAuth, async (req, res, next) => {
  try {
    const own = req.user.role !== 'evaluator';
    const r = await query('SELECT USER_ID, DAY_NO, SHIFT_CODE FROM EVAL_SCHEDULES' + (own ? ' WHERE USER_ID = :id' : '') + ' ORDER BY USER_ID, DAY_NO', own ? { id: req.user.id } : {});
    res.json(r.rows.map(row => ({ userId: row.USER_ID, day: row.DAY_NO, shift: row.SHIFT_CODE })));
  } catch (e) { next(e); }
});
app.put('/api/schedules/:userId/:day', requireAuth, requireEvaluator, async (req, res, next) => {
  try {
    const userId = String(req.params.userId).toLowerCase();
    const day = Number(req.params.day);
    const shift = String((req.body || {}).shift || '');
    if (!Number.isInteger(day) || day < 1 || day > 7 || !SHIFT_CODES.includes(shift)) return res.status(400).json({ error: 'ข้อมูลตารางงานไม่ถูกต้อง' });
    const acc = await query('SELECT USER_ID FROM EVAL_ACCOUNTS WHERE USER_ID = :id AND IS_ACTIVE = 1', { id: userId });
    if (!acc.rows.length) return res.status(400).json({ error: 'ไม่พบพนักงาน' });
    await query(`MERGE INTO EVAL_SCHEDULES s
      USING (SELECT :u AS USER_ID, :d AS DAY_NO, :c AS SHIFT_CODE FROM DUAL) x
      ON (s.USER_ID = x.USER_ID AND s.DAY_NO = x.DAY_NO)
      WHEN MATCHED THEN UPDATE SET s.SHIFT_CODE = x.SHIFT_CODE, s.UPDATED_AT = SYSTIMESTAMP
      WHEN NOT MATCHED THEN INSERT (USER_ID, DAY_NO, SHIFT_CODE) VALUES (x.USER_ID, x.DAY_NO, x.SHIFT_CODE)`,
      { u: userId, d: day, c: shift });
    // รวมเป็นแจ้งเตือนเดียว ถ้ายังมีแจ้งเตือนเรื่องตารางงานที่ยังไม่ได้อ่าน
    try {
      const up = await query("UPDATE EVAL_NOTIFICATIONS SET CREATED_AT = SYSTIMESTAMP WHERE USER_ID = :u AND LINK_VIEW = 'schedule' AND IS_READ = 0 AND TITLE = 'ตารางเวลางานของคุณมีการเปลี่ยนแปลง'", { u: userId });
      if (!up.rowsAffected) await notify(userId, 'ตารางเวลางานของคุณมีการเปลี่ยนแปลง', 'แก้ไขโดย ' + req.user.name, 'schedule');
    } catch (e) { console.error('schedule notify failed:', e.message); }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- แจ้งเตือน ---------- */
app.get('/api/notifications', requireAuth, async (req, res, next) => {
  try {
    const r = await query("SELECT NOTI_ID, TITLE, BODY, LINK_VIEW, IS_READ, TO_CHAR(CREATED_AT, 'YYYY-MM-DD HH24:MI') AS CREATED_TXT FROM EVAL_NOTIFICATIONS WHERE USER_ID = :u ORDER BY CREATED_AT DESC, NOTI_ID DESC FETCH FIRST 50 ROWS ONLY", { u: req.user.id });
    res.json(r.rows.map(row => ({ id: row.NOTI_ID, title: row.TITLE, body: row.BODY, view: row.LINK_VIEW, read: row.IS_READ === 1, at: row.CREATED_TXT })));
  } catch (e) { next(e); }
});
app.post('/api/notifications/read', requireAuth, async (req, res, next) => {
  try {
    const id = Number((req.body || {}).id);
    if (Number.isInteger(id) && id > 0) await query('UPDATE EVAL_NOTIFICATIONS SET IS_READ = 1 WHERE NOTI_ID = :n AND USER_ID = :u', { n: id, u: req.user.id });
    else await query('UPDATE EVAL_NOTIFICATIONS SET IS_READ = 1 WHERE USER_ID = :u AND IS_READ = 0', { u: req.user.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' : (err.message || 'Server error') });
});
(async () => {
  try {
    pool = await oracledb.createPool({ user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectString: process.env.DB_CONNECT_STRING, poolMin: 1, poolMax: 8, poolIncrement: 1 });
    app.listen(PORT, '0.0.0.0', () => console.log(`Evaluation app listening on http://0.0.0.0:${PORT}`));
  } catch (e) {
    console.error('Could not connect to Oracle Database. Check server/.env and ensure Oracle Database is running.', e);
    process.exit(1);
  }
})();
