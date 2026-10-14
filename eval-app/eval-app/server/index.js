require('dotenv').config();
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const oracledb = require('oracledb');
oracledb.fetchAsString = [oracledb.CLOB];

const app = express();
const PORT = Number(process.env.PORT || 3000);
const required = ['ORACLE_USER', 'ORACLE_PASSWORD', 'ORACLE_CONNECT_STRING', 'SESSION_SECRET'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error('กรุณาตั้งค่าใน .env ให้ครบ:', missing.join(', '));
  process.exit(1);
}

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(session({
  name: 'eval.sid', secret: process.env.SESSION_SECRET,
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 8 * 60 * 60 * 1000 }
}));

let pool;
const hashPin = (username, pin) => crypto.createHash('sha256').update(`${username}:${pin}`).digest('hex');
const safeAccount = r => ({ id: r.USERNAME, name: r.DISPLAY_NAME, role: r.ROLE, position: r.POSITION_NAME || '', pinHash: undefined });
function fail(res, status, message) { return res.status(status).json({ error: message }); }
function auth(req, res, next) { if (!req.session.user) return fail(res, 401, 'กรุณาเข้าสู่ระบบใหม่'); next(); }
function evaluator(req) { return req.session.user && req.session.user.role === 'evaluator'; }
function canAccessEval(req, id) { return evaluator(req) || req.session.user.id === id; }

async function query(sql, binds = {}, opts = {}) {
  const conn = await pool.getConnection();
  try { return await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: opts.autoCommit !== false, ...opts }); }
  finally { await conn.close(); }
}
function mapEval(r) {
  return {
    evaluatee: r.EVALUATEE_ID, evaluator: r.EVALUATOR_ID, evaluatorName: r.EVALUATOR_NAME,
    scores: JSON.parse(r.SCORES_JSON || '[]'), cc: JSON.parse(r.CC_JSON || '[]'),
    strengths: r.STRENGTHS || '', improvements: r.IMPROVEMENTS || '', status: r.STATUS,
    updatedAt: Number(r.UPDATED_AT), submittedAt: Number(r.SUBMITTED_AT || 0),
    ack: Number(r.ACK) === 1, ackAt: Number(r.ACK_AT || 0), reply: r.REPLY || '', replyAt: Number(r.REPLY_AT || 0)
  };
}
async function seedDemo() {
  if (process.env.SEED_DEMO_ACCOUNTS !== 'true') return;
  const existing = await query('SELECT COUNT(*) AS N FROM EVAL_ACCOUNTS');
  if (Number(existing.rows[0].N) > 0) return;
  const accounts = [
    ['boss01','คุณวิชัย (หัวหน้า)','evaluator','ผู้จัดการฝ่าย'],
    ['somchai','สมชาย ใจดี','evaluatee','เจ้าหน้าที่ฝ่ายขาย'],
    ['nida','นิดา รักงาน','evaluatee','เจ้าหน้าที่บัญชี'],
    ['anan','อนันต์ มั่นคง','evaluatee','ช่างเทคนิค']
  ];
  for (const [id,name,role,position] of accounts) {
    await query('INSERT INTO EVAL_ACCOUNTS (USERNAME, DISPLAY_NAME, ROLE, POSITION_NAME, PIN_HASH) VALUES (:id,:name,:role,:position,:pin)',
      { id, name, role, position, pin: hashPin(id, '1234') });
  }
  console.log('สร้างบัญชีทดลองแล้ว (PIN 1234) กรุณาปิด SEED_DEMO_ACCOUNTS หลังทดลอง');
}

app.post('/api/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const pin = String(req.body.pin || '');
    if (!username || !pin || pin.length > 128) return fail(res, 400, 'กรุณากรอกชื่อผู้ใช้และ PIN');
    const result = await query('SELECT USERNAME, DISPLAY_NAME, ROLE, POSITION_NAME, PIN_HASH FROM EVAL_ACCOUNTS WHERE USERNAME = :id', { id: username }, { autoCommit: false });
    const row = result.rows[0];
    const supplied = Buffer.from(hashPin(username, pin));
    const expected = Buffer.from(row ? row.PIN_HASH : '0'.repeat(64));
    if (!row || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return fail(res, 401, 'ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง');
    req.session.user = { id: row.USERNAME, name: row.DISPLAY_NAME, role: row.ROLE, position: row.POSITION_NAME || '' };
    res.json({ user: req.session.user });
  } catch (e) { console.error(e); fail(res, 500, 'เข้าสู่ระบบไม่สำเร็จ'); }
});
app.post('/api/logout', (req, res) => req.session.destroy(() => { res.clearCookie('eval.sid'); res.json({ ok: true }); }));
app.get('/api/me', auth, (req, res) => res.json({ user: req.session.user }));

app.get('/api/collections/:collection', auth, async (req, res) => {
  try {
    if (req.params.collection === 'accounts') {
      const result = evaluator(req)
        ? await query('SELECT USERNAME, DISPLAY_NAME, ROLE, POSITION_NAME FROM EVAL_ACCOUNTS ORDER BY USERNAME', {}, { autoCommit: false })
        : await query('SELECT USERNAME, DISPLAY_NAME, ROLE, POSITION_NAME FROM EVAL_ACCOUNTS WHERE USERNAME = :id', { id: req.session.user.id }, { autoCommit: false });
      return res.json({ docs: result.rows.map(r => ({ id: r.USERNAME, data: { id: r.USERNAME, name: r.DISPLAY_NAME, role: r.ROLE, position: r.POSITION_NAME || '' } })) });
    }
    if (req.params.collection === 'evaluations') {
      const result = evaluator(req)
        ? await query('SELECT * FROM EVAL_EVALUATIONS ORDER BY UPDATED_AT DESC', {}, { autoCommit: false })
        : await query('SELECT * FROM EVAL_EVALUATIONS WHERE EVALUATEE_ID = :id', { id: req.session.user.id }, { autoCommit: false });
      return res.json({ docs: result.rows.map(r => ({ id: r.EVALUATEE_ID, data: mapEval(r) })) });
    }
    return fail(res, 404, 'ไม่พบ collection');
  } catch (e) { console.error(e); fail(res, 500, 'อ่านข้อมูลไม่สำเร็จ'); }
});
app.get('/api/docs/:collection/:id', auth, async (req, res) => {
  try {
    const { collection, id } = req.params;
    if (collection === 'accounts') {
      if (!evaluator(req) && req.session.user.id !== id) return fail(res, 403, 'ไม่มีสิทธิ์เข้าถึง');
      const r = await query('SELECT USERNAME, DISPLAY_NAME, ROLE, POSITION_NAME FROM EVAL_ACCOUNTS WHERE USERNAME = :id', { id }, { autoCommit: false });
      if (!r.rows.length) return res.json({ exists: false });
      const a = r.rows[0]; return res.json({ exists: true, data: { id: a.USERNAME, name: a.DISPLAY_NAME, role: a.ROLE, position: a.POSITION_NAME || '' } });
    }
    if (collection !== 'evaluations') return fail(res, 404, 'ไม่พบเอกสาร');
    if (!canAccessEval(req, id)) return fail(res, 403, 'ไม่มีสิทธิ์เข้าถึง');
    const r = await query('SELECT * FROM EVAL_EVALUATIONS WHERE EVALUATEE_ID = :id', { id }, { autoCommit: false });
    return r.rows.length ? res.json({ exists: true, data: mapEval(r.rows[0]) }) : res.json({ exists: false });
  } catch (e) { console.error(e); fail(res, 500, 'อ่านข้อมูลไม่สำเร็จ'); }
});
app.put('/api/docs/:collection/:id', auth, async (req, res) => {
  try {
    const { collection, id } = req.params, d = req.body || {};
    if (collection !== 'evaluations') return fail(res, 403, 'ไม่อนุญาตให้แก้ไขข้อมูลนี้');
    if (!evaluator(req)) return fail(res, 403, 'เฉพาะผู้ประเมินเท่านั้นที่บันทึกผลได้');
    if (!/^[a-z0-9_-]{1,50}$/.test(id) || d.evaluatee !== id || !Array.isArray(d.scores) || d.scores.length !== 20 || d.scores.some(x => !Number.isInteger(x) || x < 0 || x > 5)) return fail(res, 400, 'ข้อมูลการประเมินไม่ถูกต้อง');
    const account = await query("SELECT USERNAME FROM EVAL_ACCOUNTS WHERE USERNAME = :id AND ROLE = 'evaluatee'", { id }, { autoCommit: false });
    if (!account.rows.length) return fail(res, 400, 'ไม่พบพนักงานที่ต้องการประเมิน');
    const fields = {
      id, evaluator: req.session.user.id, evaluatorName: req.session.user.name,
      scores: JSON.stringify(d.scores), cc: JSON.stringify(Array.isArray(d.cc) ? d.cc : []),
      strengths: String(d.strengths || ''), improvements: String(d.improvements || ''),
      status: d.status === 'submitted' ? 'submitted' : 'draft', updatedAt: Date.now(),
      submittedAt: d.status === 'submitted' ? Date.now() : Number(d.submittedAt || 0),
      ack: 0, ackAt: 0, reply: String(d.reply || ''), replyAt: Number(d.replyAt || 0)
    };
    await query(`MERGE INTO EVAL_EVALUATIONS t USING (SELECT :id EVALUATEE_ID FROM dual) s ON (t.EVALUATEE_ID=s.EVALUATEE_ID)
      WHEN MATCHED THEN UPDATE SET t.EVALUATOR_ID=:evaluator,t.EVALUATOR_NAME=:evaluatorName,t.SCORES_JSON=:scores,t.CC_JSON=:cc,t.STRENGTHS=:strengths,t.IMPROVEMENTS=:improvements,t.STATUS=:status,t.UPDATED_AT=:updatedAt,t.SUBMITTED_AT=:submittedAt,t.ACK=0,t.ACK_AT=0,t.REPLY=:reply,t.REPLY_AT=:replyAt
      WHEN NOT MATCHED THEN INSERT (EVALUATEE_ID,EVALUATOR_ID,EVALUATOR_NAME,SCORES_JSON,CC_JSON,STRENGTHS,IMPROVEMENTS,STATUS,UPDATED_AT,SUBMITTED_AT,ACK,ACK_AT,REPLY,REPLY_AT)
      VALUES (:id,:evaluator,:evaluatorName,:scores,:cc,:strengths,:improvements,:status,:updatedAt,:submittedAt,0,0,:reply,:replyAt)`, fields);
    res.json({ ok: true });
  } catch (e) { console.error(e); fail(res, 500, 'บันทึกผลประเมินไม่สำเร็จ'); }
});
app.patch('/api/docs/:collection/:id', auth, async (req, res) => {
  try {
    const { collection, id } = req.params, fields = req.body || {};
    if (collection !== 'evaluations' || !canAccessEval(req, id)) return fail(res, 403, 'ไม่มีสิทธิ์แก้ไขข้อมูลนี้');
    const existing = await query('SELECT * FROM EVAL_EVALUATIONS WHERE EVALUATEE_ID=:id', { id }, { autoCommit: false });
    if (!existing.rows.length) return fail(res, 404, 'ไม่พบผลประเมิน');
    const old = mapEval(existing.rows[0]);
    let sql, binds;
    if (!evaluator(req)) {
      if (Object.keys(fields).some(k => !['ack','ackAt','reply','replyAt'].includes(k))) return fail(res, 403, 'แก้ไขได้เฉพาะการรับทราบและข้อความตอบกลับ');
      sql = 'UPDATE EVAL_EVALUATIONS SET ACK=:ack, ACK_AT=:ackAt, REPLY=:reply, REPLY_AT=:replyAt WHERE EVALUATEE_ID=:id';
      binds = { id, ack: fields.ack ? 1 : 0, ackAt: Number(fields.ackAt || old.ackAt), reply: String(fields.reply == null ? old.reply : fields.reply), replyAt: Number(fields.replyAt || old.replyAt) };
    } else return fail(res, 403, 'ผู้ประเมินแก้ไขได้ผ่านการบันทึกผลประเมิน');
    await query(sql, binds); res.json({ ok: true });
  } catch (e) { console.error(e); fail(res, 500, 'อัปเดตข้อมูลไม่สำเร็จ'); }
});

app.use(express.static(path.join(__dirname, '..'), { index: 'index.html' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));

(async () => {
  try {
    pool = await oracledb.createPool({ user: process.env.ORACLE_USER, password: process.env.ORACLE_PASSWORD, connectString: process.env.ORACLE_CONNECT_STRING, poolMin: 1, poolMax: 5, poolIncrement: 1 });
    await seedDemo();
    app.listen(PORT, () => console.log(`ระบบพร้อมใช้งาน: http://localhost:${PORT}`));
  } catch (e) { console.error('เชื่อม Oracle ไม่สำเร็จ:', e.message); process.exit(1); }
})();
