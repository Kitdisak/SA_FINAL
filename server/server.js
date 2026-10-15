require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const oracledb = require('oracledb');
oracledb.autoCommit = true;
oracledb.fetchAsString = [oracledb.CLOB];   // อ่าน CLOB เป็นข้อความ
const app = express();
const PORT = Number(process.env.PORT || 3000);
const sessions = new Map(); // token -> username (ล็อกอินใหม่เมื่อรีสตาร์ตเซิร์ฟเวอร์)
app.use(express.json({ limit: '1mb' }));
// ไม่เปิดให้เข้าถึงโค้ดเซิร์ฟเวอร์ ไฟล์ SQL และไฟล์ .env ผ่านเว็บ
app.use(['/server', '/sql'], (_req, res) => res.status(404).send('Not found'));
app.use(express.static(path.join(__dirname, '..')));

/* =====================================================================
   ฐานข้อมูล 13 ตารางตามเอกสาร (sql/03_document_schema.sql)
   บทบาท 2 แบบ: hr (หน้าเว็บเรียกว่า evaluator) และ employee (evaluatee)
   HR ทำ UC-07 ถึง UC-18 ทั้งหมด, พนักงานทำ UC-01 ถึง UC-06
   ขั้นตอน: not_started -> (พนักงานส่งประเมินตนเอง) pending_mentor -> (HR ประเมิน) draft -> pending_hr
            -> (HR ปรับเทียบ/ยืนยัน) confirmed -> (เผยแพร่) published -> (พนักงานรับทราบ) acknowledged
   ===================================================================== */
let pool;
const OBJ = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const ROLE_OUT = { hr: 'evaluator', employee: 'evaluatee' };       // ค่าใน DB -> ค่าที่หน้าเว็บใช้
const VIEW_TO_TYPE = {
  mine: 'result', table: 'review', schedule: 'schedule', home: 'account', employees: 'staff',
  selfs: 'self_eval', self: 'self_return', goals: 'goal', goalreview: 'goal_review', cycle: 'cycle', reviews: 'calibrate'
};
const TYPE_TO_VIEW = Object.fromEntries(Object.entries(VIEW_TO_TYPE).map(([v, t]) => [t, v]));
const SHIFT_CODES = ['M', 'A', 'N', 'OFF'];
const EVALUATED = ['pending_hr', 'confirmed', 'published', 'acknowledged'];   // HR ส่งผลประเมินแล้ว
const PUBLIC = ['published', 'acknowledged'];                                  // พนักงานเห็นผลได้
const LOCKED = ['confirmed', 'published', 'acknowledged'];                     // ยืนยันแล้ว แก้คะแนนไม่ได้

function pinHash(username, pin) {
  return crypto.createHash('sha256').update(`${username}:${pin}`, 'utf8').digest('hex');
}
async function query(sql, binds = {}, options = {}) {
  let conn;
  try {
    conn = await pool.getConnection();
    return await conn.execute(sql, binds, { ...OBJ, ...options });
  } finally {
    if (conn) await conn.close();
  }
}
// ทำหลายคำสั่งเป็นชุดเดียว (Transaction): สำเร็จทั้งหมดหรือยกเลิกทั้งหมด (NFR-REL-01)
async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    const ex = (sql, binds = {}) => conn.execute(sql, binds, { ...OBJ, autoCommit: false });
    ex.many = (sql, rows, options) => conn.executeMany(sql, rows, { ...options, autoCommit: false });
    const out = await fn(ex);
    await conn.commit();
    return out;
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    throw e;
  } finally {
    await conn.close();
  }
}
const ms = d => (d instanceof Date ? d.getTime() : 0);
const fail = (status, msg) => Object.assign(new Error(msg), { status });
const avgOf = arr => { const a = arr.filter(x => x > 0); return a.length ? Math.round(a.reduce((p, c) => p + c, 0) / a.length * 100) / 100 : null; };
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(new Date(s).getTime());

async function uidOf(username, run = query) {
  const r = await run('SELECT user_id FROM users WHERE username = :u', { u: username });
  return r.rows.length ? r.rows[0].USER_ID : null;
}
// บันทึกประวัติการเปลี่ยนแปลง (audit_logs) — NFR-AUD-01
async function audit(run, actorId, entityType, entityId, action, detail) {
  await run('INSERT INTO audit_logs (actor_id, entity_type, entity_id, action, change_detail) VALUES (:a, :t, :i, :ac, :d)',
    { a: actorId, t: entityType, i: entityId, ac: action, d: { val: typeof detail === 'string' ? detail : JSON.stringify(detail || {}), type: oracledb.CLOB } });
}
// แจ้งเตือน (ถ้าล้มเหลวจะไม่ทำให้งานหลักพัง)
async function notify(username, title, body, view) {
  try {
    const uid = await uidOf(username);
    if (!uid) return;
    await query('INSERT INTO notifications (user_id, message, detail, notify_type) VALUES (:u, :m, :d, :t)',
      { u: uid, m: String(title).slice(0, 255), d: String(body || '').slice(0, 1000), t: VIEW_TO_TYPE[view] || view || null });
  } catch (e) { console.error('notify failed:', e.message); }
}
async function notifyHR(title, body, view, except) {
  try {
    const r = await query("SELECT username FROM users WHERE role = 'hr' AND status = 'active'");
    for (const b of r.rows) if (b.USERNAME !== except) await notify(b.USERNAME, title, body, view);
  } catch (e) { console.error('notifyHR failed:', e.message); }
}
function publicUser(row) {
  return { id: row.USERNAME, name: row.FULL_NAME, role: ROLE_OUT[row.ROLE] || row.ROLE, position: row.POSITION_NAME };
}

// รอบการประเมินปัจจุบัน: รอบที่เปิดอยู่ ถ้าไม่มีใช้รอบล่าสุด (ดูได้อย่างเดียว)
async function currentCycle(run = query) {
  let c = await run("SELECT cycle_id, cycle_name, status FROM evaluation_cycles WHERE status = 'open' ORDER BY start_date DESC FETCH FIRST 1 ROWS ONLY");
  if (!c.rows.length) c = await run("SELECT cycle_id, cycle_name, status FROM evaluation_cycles WHERE status <> 'draft' ORDER BY start_date DESC, cycle_id DESC FETCH FIRST 1 ROWS ONLY");
  if (!c.rows.length) throw fail(400, 'ยังไม่มีรอบการประเมิน');
  const cycleId = c.rows[0].CYCLE_ID;
  const f = await run('SELECT form_id FROM evaluation_forms WHERE cycle_id = :c ORDER BY form_id FETCH FIRST 1 ROWS ONLY', { c: cycleId });
  if (!f.rows.length) throw fail(400, 'รอบการประเมินนี้ยังไม่มีแบบประเมิน');
  const formId = f.rows[0].FORM_ID;
  const cr = await run('SELECT criteria_id FROM criteria WHERE form_id = :f ORDER BY sort_order', { f: formId });
  return { cycleId, formId, name: c.rows[0].CYCLE_NAME, status: c.rows[0].STATUS, criteria: cr.rows.map(r => r.CRITERIA_ID) };
}
async function openCycle(run) {
  const c = await currentCycle(run);
  if (c.status !== 'open') throw fail(400, 'รอบการประเมินปิดแล้ว แก้ไขข้อมูลไม่ได้');
  if (c.criteria.length !== 20) throw fail(500, 'แบบประเมินในฐานข้อมูลต้องมี 20 ข้อ');
  return c;
}

// คะแนนรายข้อของรอบนี้ แยกตามผู้ให้คะแนน ('employee' / 'mentor' = ขั้นประเมิน / 'hr' = หลังปรับเทียบ)
async function scoreMap(cycleId, role) {
  const sc = await query(
    `SELECT s.evaluation_id, c.sort_order, s.score
       FROM evaluation_scores s
       JOIN criteria c ON c.criteria_id = s.criteria_id
       JOIN evaluations e ON e.evaluation_id = s.evaluation_id
      WHERE e.cycle_id = :c AND s.evaluator_role = :r`, { c: cycleId, r: role });
  const m = {};
  for (const s of sc.rows) {
    const arr = m[s.EVALUATION_ID] = m[s.EVALUATION_ID] || new Array(20).fill(0);
    if (s.SORT_ORDER >= 1 && s.SORT_ORDER <= 20) arr[s.SORT_ORDER - 1] = Number(s.SCORE);
  }
  return m;
}

// อ่านผลการประเมินในรอบปัจจุบัน แล้วแปลงเป็นรูปแบบที่หน้าเว็บใช้
// forEmployee = true: เห็นเฉพาะผลที่เผยแพร่แล้ว และคะแนนเป็นคะแนนสุดท้ายหลังปรับเทียบ
async function loadEvaluations(username, forEmployee) {
  const { cycleId } = await currentCycle();
  const r = await query(
    `SELECT e.evaluation_id, emp.username AS emp_u, m.username AS men_u, m.full_name AS men_n, e.status,
            e.strengths, e.improvements, e.category_comments, e.employee_reply, e.replied_at,
            e.updated_at, e.mentor_submitted_at, r.final_score, r.summary, r.confirmed_at, r.published_at, r.acknowledged_at
       FROM evaluations e
       JOIN users emp ON emp.user_id = e.employee_id
       LEFT JOIN users m ON m.user_id = e.mentor_id
       LEFT JOIN evaluation_results r ON r.evaluation_id = e.evaluation_id
      WHERE e.cycle_id = :c AND e.status NOT IN ('not_started', 'pending_mentor')` + (username ? ' AND emp.username = :u' : '') +
    ' ORDER BY emp.username', username ? { c: cycleId, u: username } : { c: cycleId });
  if (!r.rows.length) return [];
  const mentor = await scoreMap(cycleId, 'mentor'), hr = await scoreMap(cycleId, 'hr');
  const out = [];
  for (const row of r.rows) {
    if (forEmployee && !PUBLIC.includes(row.STATUS)) continue;
    let cc = [];
    try { cc = JSON.parse(row.CATEGORY_COMMENTS || '[]'); } catch (_) {}
    const ms0 = mentor[row.EVALUATION_ID] || new Array(20).fill(0);
    const hs = hr[row.EVALUATION_ID] || null;
    const fin = hs && hs.some(Boolean) ? hs : ms0;
    const o = {
      id: row.EMP_U, evaluationId: row.EVALUATION_ID,
      evaluatee: row.EMP_U, evaluator: row.MEN_U, evaluatorName: row.MEN_N,
      scores: forEmployee ? fin : ms0, cc,
      strengths: row.STRENGTHS || '', improvements: row.IMPROVEMENTS || '',
      status: EVALUATED.includes(row.STATUS) ? 'submitted' : 'draft', dbStatus: row.STATUS,
      updatedAt: ms(row.UPDATED_AT), submittedAt: ms(row.PUBLISHED_AT) || ms(row.MENTOR_SUBMITTED_AT),
      evaluatedAt: ms(row.MENTOR_SUBMITTED_AT), confirmedAt: ms(row.CONFIRMED_AT), publishedAt: ms(row.PUBLISHED_AT),
      final: row.FINAL_SCORE == null ? null : Number(row.FINAL_SCORE), summary: row.SUMMARY || '',
      ack: row.STATUS === 'acknowledged', ackAt: ms(row.ACKNOWLEDGED_AT),
      reply: row.EMPLOYEE_REPLY || '', replyAt: ms(row.REPLIED_AT)
    };
    if (!forEmployee) { o.hrScores = hs || new Array(20).fill(0); o.finalScores = fin; }
    out.push(o);
  }
  return out;
}

// อ่านแบบประเมินตนเอง (UC-03, UC-04): คะแนน evaluator_role = 'employee' + self_comment / self_category_comments
async function loadSelf(username) {
  const { cycleId } = await currentCycle();
  const r = await query(
    `SELECT e.evaluation_id, u.username, e.self_submitted_at, e.self_comment, e.self_category_comments, e.updated_at
       FROM evaluations e JOIN users u ON u.user_id = e.employee_id
      WHERE e.cycle_id = :c AND u.role = 'employee'` + (username ? ' AND u.username = :u' : '') + ' ORDER BY u.username',
    username ? { c: cycleId, u: username } : { c: cycleId });
  if (!r.rows.length) return [];
  const scores = await scoreMap(cycleId, 'employee');
  const rr = await query(
    `SELECT x.evaluation_id, x.reason, x.returned_at FROM return_records x
       JOIN evaluations e ON e.evaluation_id = x.evaluation_id
      WHERE e.cycle_id = :c ORDER BY x.returned_at, x.return_id`, { c: cycleId });
  const ret = {};
  for (const x of rr.rows) ret[x.EVALUATION_ID] = { reason: x.REASON || '', at: ms(x.RETURNED_AT) };
  return r.rows.map(row => {
    let cc = [];
    try { cc = JSON.parse(row.SELF_CATEGORY_COMMENTS || '[]'); } catch (_) {}
    const s = scores[row.EVALUATION_ID] || new Array(20).fill(0);
    const touched = s.some(x => x > 0) || !!row.SELF_COMMENT || cc.some(Boolean);
    const submittedAt = ms(row.SELF_SUBMITTED_AT);
    const back = ret[row.EVALUATION_ID];
    return {
      id: row.USERNAME, evaluationId: row.EVALUATION_ID, scores: s, cc, comment: row.SELF_COMMENT || '',
      status: submittedAt ? 'submitted' : touched ? 'draft' : 'none', submittedAt, updatedAt: ms(row.UPDATED_AT),
      returnReason: !submittedAt && back ? back.reason : '', returnedAt: !submittedAt && back ? back.at : 0
    };
  });
}

async function requireAuth(req, res, next) {
  const raw = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const username = sessions.get(raw);
  if (!raw || !username) return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  try {
    const r = await query("SELECT user_id, username, full_name, role, position_name FROM users WHERE username = :u AND status = 'active'", { u: username });
    if (!r.rows.length) return res.status(401).json({ error: 'ไม่พบบัญชีผู้ใช้' });
    req.user = publicUser(r.rows[0]);
    req.uid = r.rows[0].USER_ID;
    next();
  } catch (e) { next(e); }
}
function requireHR(req, res, next) {
  if (req.user.role !== 'evaluator') return res.status(403).json({ error: 'เฉพาะ HR เท่านั้น' });
  next();
}
function requireEmployee(req, res, next) {
  if (req.user.role !== 'evaluatee') return res.status(403).json({ error: 'เฉพาะพนักงานเท่านั้น' });
  next();
}
// หาแถว evaluations ของพนักงานในรอบปัจจุบัน
async function evalOf(ex, cycleId, username) {
  const r = await ex(`SELECT e.evaluation_id, e.status, e.self_submitted_at, u.user_id, u.username, u.full_name
                        FROM evaluations e JOIN users u ON u.user_id = e.employee_id
                       WHERE e.cycle_id = :c AND u.username = :u`, { c: cycleId, u: username });
  return r.rows[0] || null;
}
async function saveScores(ex, evalId, role, criteria, scores) {
  await ex('DELETE FROM evaluation_scores WHERE evaluation_id = :id AND evaluator_role = :r', { id: evalId, r: role });
  const rows = [];
  scores.forEach((s, i) => { if (s > 0) rows.push({ e: evalId, c: criteria[i], r: role, s }); });
  if (rows.length) {
    await ex.many('INSERT INTO evaluation_scores (evaluation_id, criteria_id, evaluator_role, score) VALUES (:e, :c, :r, :s)', rows,
      { bindDefs: { e: { type: oracledb.NUMBER }, c: { type: oracledb.NUMBER }, r: { type: oracledb.STRING, maxSize: 20 }, s: { type: oracledb.NUMBER } } });
  }
}
function checkScores(scores, submit) {
  if (!Array.isArray(scores) || scores.length !== 20 || scores.some(x => !Number.isInteger(x) || x < 0 || x > 5)) throw fail(400, 'รูปแบบคะแนนไม่ถูกต้อง');
  if (submit && scores.some(x => x < 1)) throw fail(400, 'กรุณาให้คะแนนครบทุกข้อก่อนส่ง');
}

app.get('/api/health', async (_req, res, next) => {
  try { await query('SELECT COUNT(*) AS n FROM users'); res.json({ ok: true, database: 'Oracle' }); }
  catch (e) { next(e); }
});
app.get('/api/accounts', async (_req, res, next) => {
  try {
    const r = await query("SELECT username, full_name, role, position_name FROM users WHERE status = 'active' AND role IN ('hr', 'employee') ORDER BY username");
    res.json(r.rows.map(publicUser));
  } catch (e) { next(e); }
});
app.post('/api/login', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const pin = String(req.body.pin || '');
    const bad = () => res.status(401).json({ error: 'ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง' });
    if (!/^[a-z0-9_-]{3,50}$/.test(username) || !/^\d{4,12}$/.test(pin)) return bad();
    const r = await query("SELECT user_id, username, full_name, role, position_name, password_hash FROM users WHERE username = :u AND status = 'active' AND role IN ('hr', 'employee')", { u: username });
    if (!r.rows.length) return bad();
    const row = r.rows[0];
    const actual = Buffer.from(pinHash(username, pin), 'hex');
    const expected = Buffer.from(String(row.PASSWORD_HASH), 'hex');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return bad();
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, username);
    res.json({ token, user: publicUser(row) });
  } catch (e) { next(e); }
});

/* ---------- รอบการประเมิน (UC-01 ดู, UC-12 กำหนด) ---------- */
async function cycleRows(where, binds) {
  const r = await query(`SELECT cycle_id, cycle_name, status, TO_CHAR(start_date, 'YYYY-MM-DD') AS s_txt, TO_CHAR(end_date, 'YYYY-MM-DD') AS e_txt
                           FROM evaluation_cycles ${where} ORDER BY start_date DESC, cycle_id DESC`, binds || {});
  const out = [];
  for (const c of r.rows) {
    const st = await query(`SELECT stage_id, stage_name, TO_CHAR(start_date, 'YYYY-MM-DD') AS s_txt, TO_CHAR(end_date, 'YYYY-MM-DD') AS e_txt
                              FROM cycle_stages WHERE cycle_id = :c ORDER BY start_date, stage_id`, { c: c.CYCLE_ID });
    const f = await query('SELECT form_name FROM evaluation_forms WHERE cycle_id = :c ORDER BY form_id FETCH FIRST 1 ROWS ONLY', { c: c.CYCLE_ID });
    out.push({ id: c.CYCLE_ID, name: c.CYCLE_NAME, status: c.STATUS, start: c.S_TXT, end: c.E_TXT, formName: f.rows.length ? f.rows[0].FORM_NAME : '',
      stages: st.rows.map(s => ({ id: s.STAGE_ID, name: s.STAGE_NAME, start: s.S_TXT, end: s.E_TXT })) });
  }
  return out;
}
app.get('/api/cycle', requireAuth, async (_req, res, next) => {
  try {
    const { cycleId } = await currentCycle();
    res.json((await cycleRows('WHERE cycle_id = :c', { c: cycleId }))[0] || null);
  } catch (e) { if (e.status === 400) return res.json(null); next(e); }
});
app.get('/api/cycles', requireAuth, requireHR, async (_req, res, next) => {
  try { res.json(await cycleRows('')); } catch (e) { next(e); }
});
function checkCycleBody(b) {
  const name = String(b.name || '').trim();
  if (!name || name.length > 100) throw fail(400, 'กรุณาระบุชื่อรอบ (ไม่เกิน 100 ตัวอักษร)');
  if (!isDate(b.start) || !isDate(b.end) || b.end < b.start) throw fail(400, 'วันที่เริ่มต้น/สิ้นสุดของรอบไม่ถูกต้อง');
  const stages = Array.isArray(b.stages) ? b.stages : [];
  if (stages.length < 1 || stages.length > 8) throw fail(400, 'ต้องมีขั้นตอน 1–8 ขั้น');
  for (const s of stages) {
    if (!String(s.name || '').trim()) throw fail(400, 'กรุณาระบุชื่อขั้นตอน');
    if (!isDate(s.start) || !isDate(s.end) || s.end < s.start) throw fail(400, 'วันที่ของขั้นตอน "' + s.name + '" ไม่ถูกต้อง');
    if (s.start < b.start || s.end > b.end) throw fail(400, 'ขั้นตอน "' + s.name + '" ต้องอยู่ในช่วงวันที่ของรอบ');
  }
  return { name, start: b.start, end: b.end, stages: stages.map(s => ({ name: String(s.name).trim().slice(0, 50), start: s.start, end: s.end })) };
}
async function writeStages(ex, cycleId, stages) {
  await ex('DELETE FROM cycle_stages WHERE cycle_id = :c', { c: cycleId });
  for (const s of stages) {
    await ex("INSERT INTO cycle_stages (cycle_id, stage_name, start_date, end_date) VALUES (:c, :n, TO_DATE(:s, 'YYYY-MM-DD'), TO_DATE(:e, 'YYYY-MM-DD'))",
      { c: cycleId, n: s.name, s: s.start, e: s.end });
  }
}
// สร้างรอบใหม่ (สถานะร่าง) และคัดลอกแบบประเมิน + เกณฑ์จากรอบล่าสุด
app.post('/api/cycles', requireAuth, requireHR, async (req, res, next) => {
  try {
    const b = checkCycleBody(req.body || {});
    const id = await tx(async ex => {
      const ins = await ex(`INSERT INTO evaluation_cycles (cycle_name, start_date, end_date, status)
                            VALUES (:n, TO_DATE(:s, 'YYYY-MM-DD'), TO_DATE(:e, 'YYYY-MM-DD'), 'draft') RETURNING cycle_id INTO :rid`,
        { n: b.name, s: b.start, e: b.end, rid: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } });
      const cid = ins.outBinds.rid[0];
      await writeStages(ex, cid, b.stages);
      const src = await ex(`SELECT f.form_id, f.form_name, f.description FROM evaluation_forms f JOIN evaluation_cycles c ON c.cycle_id = f.cycle_id
                             WHERE c.cycle_id <> :c ORDER BY c.start_date DESC, f.form_id DESC FETCH FIRST 1 ROWS ONLY`, { c: cid });
      if (!src.rows.length) throw fail(400, 'ไม่พบแบบประเมินต้นแบบสำหรับคัดลอก');
      const fi = await ex('INSERT INTO evaluation_forms (cycle_id, form_name, description) VALUES (:c, :n, :d) RETURNING form_id INTO :rid',
        { c: cid, n: src.rows[0].FORM_NAME, d: { val: src.rows[0].DESCRIPTION || '', type: oracledb.CLOB }, rid: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } });
      const fid = fi.outBinds.rid[0];
      const cr = await ex('SELECT title, description, min_score, max_score, category, sort_order FROM criteria WHERE form_id = :f ORDER BY sort_order', { f: src.rows[0].FORM_ID });
      for (const c of cr.rows) {
        await ex('INSERT INTO criteria (form_id, title, description, min_score, max_score, category, sort_order) VALUES (:f, :t, :d, :mn, :mx, :cat, :so)',
          { f: fid, t: c.TITLE, d: { val: c.DESCRIPTION || '', type: oracledb.CLOB }, mn: c.MIN_SCORE, mx: c.MAX_SCORE, cat: c.CATEGORY, so: c.SORT_ORDER });
      }
      await audit(ex, req.uid, 'evaluation_cycles', cid, 'CREATE_CYCLE', b);
      return cid;
    });
    res.json({ ok: true, id });
  } catch (e) { next(e); }
});
app.put('/api/cycles/:id', requireAuth, requireHR, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const b = checkCycleBody(req.body || {});
    await tx(async ex => {
      const c = await ex('SELECT status FROM evaluation_cycles WHERE cycle_id = :c', { c: id });
      if (!c.rows.length) throw fail(404, 'ไม่พบรอบการประเมิน');
      if (c.rows[0].STATUS === 'closed') throw fail(400, 'รอบนี้ปิดแล้ว แก้ไขไม่ได้');
      await ex("UPDATE evaluation_cycles SET cycle_name = :n, start_date = TO_DATE(:s, 'YYYY-MM-DD'), end_date = TO_DATE(:e, 'YYYY-MM-DD') WHERE cycle_id = :c",
        { n: b.name, s: b.start, e: b.end, c: id });
      await writeStages(ex, id, b.stages);
      await audit(ex, req.uid, 'evaluation_cycles', id, 'UPDATE_CYCLE', b);
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
// เปิดรอบ: ปิดรอบที่เปิดอยู่เดิม แล้วสร้างรายการประเมิน "ยังไม่เริ่ม" ให้พนักงานทุกคน
app.post('/api/cycles/:id/open', requireAuth, requireHR, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const name = await tx(async ex => {
      const c = await ex('SELECT cycle_name, status FROM evaluation_cycles WHERE cycle_id = :c', { c: id });
      if (!c.rows.length) throw fail(404, 'ไม่พบรอบการประเมิน');
      if (c.rows[0].STATUS !== 'draft') throw fail(400, 'เปิดได้เฉพาะรอบที่เป็นร่าง');
      const f = await ex('SELECT form_id FROM evaluation_forms WHERE cycle_id = :c ORDER BY form_id FETCH FIRST 1 ROWS ONLY', { c: id });
      if (!f.rows.length) throw fail(400, 'รอบนี้ยังไม่มีแบบประเมิน');
      await ex("UPDATE evaluation_cycles SET status = 'closed' WHERE status = 'open'");
      await ex("UPDATE evaluation_cycles SET status = 'open' WHERE cycle_id = :c", { c: id });
      const emps = await ex("SELECT user_id FROM users WHERE role = 'employee' AND status = 'active'");
      for (const u of emps.rows) {
        const has = await ex('SELECT 1 AS x FROM evaluations WHERE cycle_id = :c AND employee_id = :e', { c: id, e: u.USER_ID });
        if (!has.rows.length) await ex("INSERT INTO evaluations (cycle_id, employee_id, form_id, status) VALUES (:c, :e, :f, 'not_started')", { c: id, e: u.USER_ID, f: f.rows[0].FORM_ID });
      }
      await audit(ex, req.uid, 'evaluation_cycles', id, 'OPEN_CYCLE', { employees: emps.rows.length });
      return c.rows[0].CYCLE_NAME;
    });
    const emps = await query("SELECT username FROM users WHERE role = 'employee' AND status = 'active'");
    for (const u of emps.rows) await notify(u.USERNAME, 'เปิด' + name + ' แล้ว', 'ดูช่วงเวลาแต่ละขั้นตอน และเริ่มกำหนดเป้าหมาย/ประเมินตนเองได้', 'cycle');
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.post('/api/cycles/:id/close', requireAuth, requireHR, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await tx(async ex => {
      const c = await ex('SELECT status FROM evaluation_cycles WHERE cycle_id = :c', { c: id });
      if (!c.rows.length) throw fail(404, 'ไม่พบรอบการประเมิน');
      if (c.rows[0].STATUS !== 'open') throw fail(400, 'ปิดได้เฉพาะรอบที่เปิดอยู่');
      await ex("UPDATE evaluation_cycles SET status = 'closed' WHERE cycle_id = :c", { c: id });
      await audit(ex, req.uid, 'evaluation_cycles', id, 'CLOSE_CYCLE', '');
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- แบบประเมินและเกณฑ์ (UC-13) ---------- */
app.get('/api/form', requireAuth, async (_req, res, next) => {
  try {
    const { formId, cycleId, status } = await currentCycle();
    const f = await query('SELECT form_name, description FROM evaluation_forms WHERE form_id = :f', { f: formId });
    const cr = await query('SELECT criteria_id, title, description, min_score, max_score, category, sort_order FROM criteria WHERE form_id = :f ORDER BY sort_order', { f: formId });
    const used = await query("SELECT COUNT(*) AS n FROM evaluation_scores s JOIN evaluations e ON e.evaluation_id = s.evaluation_id WHERE e.cycle_id = :c", { c: cycleId });
    res.json({ formId, cycleStatus: status, name: f.rows[0].FORM_NAME, description: f.rows[0].DESCRIPTION || '', inUse: Number(used.rows[0].N) > 0,
      criteria: cr.rows.map(c => ({ id: c.CRITERIA_ID, order: c.SORT_ORDER, category: c.CATEGORY || '', title: c.TITLE, description: c.DESCRIPTION || '', min: Number(c.MIN_SCORE), max: Number(c.MAX_SCORE) })) });
  } catch (e) { next(e); }
});
app.put('/api/form', requireAuth, requireHR, async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim(), description = String(b.description || '').slice(0, 4000);
    const cats = Array.isArray(b.categories) ? b.categories.map(x => String(x || '').trim()) : [];
    const items = Array.isArray(b.items) ? b.items : [];
    if (!name || name.length > 100) return res.status(400).json({ error: 'กรุณาระบุชื่อแบบประเมิน (ไม่เกิน 100 ตัวอักษร)' });
    if (cats.length !== 5 || cats.some(c => !c || c.length > 100)) return res.status(400).json({ error: 'ต้องมีชื่อหมวดครบ 5 หมวด' });
    if (items.length !== 20 || items.some(i => !String(i.title || '').trim() || String(i.title).length > 150)) return res.status(400).json({ error: 'ต้องมีหัวข้อประเมินครบ 20 ข้อ (ไม่เกิน 150 ตัวอักษร)' });
    await tx(async ex => {
      const { formId, status } = await currentCycle(ex);
      if (status === 'closed') throw fail(400, 'รอบการประเมินปิดแล้ว แก้ไขแบบประเมินไม่ได้');
      await ex('UPDATE evaluation_forms SET form_name = :n, description = :d WHERE form_id = :f', { n: name, d: { val: description, type: oracledb.CLOB }, f: formId });
      for (let i = 0; i < 20; i++) {
        await ex('UPDATE criteria SET title = :t, description = :d, category = :c WHERE form_id = :f AND sort_order = :o',
          { t: String(items[i].title).trim(), d: { val: String(items[i].description || '').slice(0, 2000), type: oracledb.CLOB }, c: cats[Math.floor(i / 4)], f: formId, o: i + 1 });
      }
      await audit(ex, req.uid, 'evaluation_forms', formId, 'UPDATE_FORM', { name, categories: cats });
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- เป้าหมาย (UC-02 พนักงานกำหนด, UC-07 HR ตรวจสอบ) ---------- */
app.get('/api/goals', requireAuth, async (req, res, next) => {
  try {
    const { cycleId } = await currentCycle();
    const own = req.user.role !== 'evaluator';
    const r = await query(`SELECT g.goal_id, u.username, g.title, g.detail, g.status, g.review_comment FROM goals g JOIN users u ON u.user_id = g.employee_id
                            WHERE g.cycle_id = :c` + (own ? ' AND g.employee_id = :e' : " AND g.status <> 'draft'") + ' ORDER BY u.username, g.goal_id', own ? { c: cycleId, e: req.uid } : { c: cycleId });
    res.json(r.rows.map(g => ({ id: g.GOAL_ID, userId: g.USERNAME, title: g.TITLE, detail: g.DETAIL || '', status: g.STATUS, comment: g.REVIEW_COMMENT || '' })));
  } catch (e) { next(e); }
});
function goalBody(b) {
  const title = String((b || {}).title || '').trim(), detail = String((b || {}).detail || '').trim();
  if (!title || title.length > 150) throw fail(400, 'กรุณาระบุหัวข้อเป้าหมาย (ไม่เกิน 150 ตัวอักษร)');
  if (detail.length > 2000) throw fail(400, 'รายละเอียดยาวเกิน 2000 ตัวอักษร');
  return { title, detail };
}
async function ownGoal(ex, id, uid) {
  const r = await ex('SELECT goal_id, status FROM goals WHERE goal_id = :g AND employee_id = :e', { g: id, e: uid });
  if (!r.rows.length) throw fail(404, 'ไม่พบเป้าหมาย');
  if (!['draft', 'returned'].includes(r.rows[0].STATUS)) throw fail(409, 'เป้าหมายนี้ส่งตรวจแล้ว แก้ไขไม่ได้');
  return r.rows[0];
}
app.post('/api/goals', requireAuth, requireEmployee, async (req, res, next) => {
  try {
    const b = goalBody(req.body);
    await tx(async ex => {
      const { cycleId } = await openCycle(ex);
      const n = await ex('SELECT COUNT(*) AS n FROM goals WHERE cycle_id = :c AND employee_id = :e', { c: cycleId, e: req.uid });
      if (Number(n.rows[0].N) >= 10) throw fail(400, 'กำหนดเป้าหมายได้ไม่เกิน 10 ข้อ');
      const ins = await ex("INSERT INTO goals (cycle_id, employee_id, title, detail, status) VALUES (:c, :e, :t, :d, 'draft') RETURNING goal_id INTO :rid",
        { c: cycleId, e: req.uid, t: b.title, d: { val: b.detail, type: oracledb.CLOB }, rid: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } });
      await audit(ex, req.uid, 'goals', ins.outBinds.rid[0], 'CREATE_GOAL', b);
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.put('/api/goals/:id', requireAuth, requireEmployee, async (req, res, next) => {
  try {
    const b = goalBody(req.body), id = Number(req.params.id);
    await tx(async ex => {
      await openCycle(ex);
      await ownGoal(ex, id, req.uid);
      await ex("UPDATE goals SET title = :t, detail = :d, status = 'draft' WHERE goal_id = :g", { t: b.title, d: { val: b.detail, type: oracledb.CLOB }, g: id });
      await audit(ex, req.uid, 'goals', id, 'UPDATE_GOAL', b);
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.delete('/api/goals/:id', requireAuth, requireEmployee, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await tx(async ex => {
      await openCycle(ex);
      await ownGoal(ex, id, req.uid);
      await ex('DELETE FROM goals WHERE goal_id = :g', { g: id });
      await audit(ex, req.uid, 'goals', id, 'DELETE_GOAL', '');
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.post('/api/goals/submit', requireAuth, requireEmployee, async (req, res, next) => {
  try {
    const n = await tx(async ex => {
      const { cycleId } = await openCycle(ex);
      const r = await ex("UPDATE goals SET status = 'pending_review' WHERE cycle_id = :c AND employee_id = :e AND status IN ('draft', 'returned')", { c: cycleId, e: req.uid });
      if (!r.rowsAffected) throw fail(400, 'ไม่มีเป้าหมายที่รอส่ง');
      await audit(ex, req.uid, 'goals', req.uid, 'SUBMIT_GOALS', { count: r.rowsAffected });
      return r.rowsAffected;
    });
    await notifyHR(req.user.name + ' ส่งเป้าหมายให้ตรวจสอบ', n + ' ข้อ รอการตรวจสอบ', 'goalreview');
    res.json({ ok: true, count: n });
  } catch (e) { next(e); }
});
app.post('/api/goals/:id/review', requireAuth, requireHR, async (req, res, next) => {
  try {
    const id = Number(req.params.id), b = req.body || {};
    const decision = b.decision === 'approve' ? 'approved' : b.decision === 'return' ? 'returned' : null;
    const comment = String(b.comment || '').trim().slice(0, 2000);
    if (!decision) return res.status(400).json({ error: 'ต้องเลือกอนุมัติหรือส่งกลับ' });
    if (decision === 'returned' && !comment) return res.status(400).json({ error: 'กรุณาระบุเหตุผลที่ส่งกลับ' });
    const who = await tx(async ex => {
      await openCycle(ex);
      const r = await ex('SELECT g.status, g.title, u.username FROM goals g JOIN users u ON u.user_id = g.employee_id WHERE g.goal_id = :g', { g: id });
      if (!r.rows.length) throw fail(404, 'ไม่พบเป้าหมาย');
      if (r.rows[0].STATUS !== 'pending_review') throw fail(409, 'เป้าหมายนี้ไม่ได้อยู่ในสถานะรอตรวจสอบ');
      await ex('UPDATE goals SET status = :s, review_comment = :c WHERE goal_id = :g', { s: decision, c: { val: comment, type: oracledb.CLOB }, g: id });
      await audit(ex, req.uid, 'goals', id, decision === 'approved' ? 'APPROVE_GOAL' : 'RETURN_GOAL', { comment: comment.slice(0, 200) });
      return r.rows[0];
    });
    await notify(who.USERNAME, decision === 'approved' ? 'เป้าหมาย "' + who.TITLE + '" ได้รับการอนุมัติ' : 'เป้าหมาย "' + who.TITLE + '" ถูกส่งกลับให้แก้ไข', comment, 'goals');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- ผลการประเมิน (UC-05, 06, 08, 09, 11, 14) ---------- */
app.get('/api/evaluations', requireAuth, requireHR, async (_req, res, next) => {
  try { res.json(await loadEvaluations()); } catch (e) { next(e); }
});
app.get('/api/evaluations/:id', requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id).toLowerCase();
    const hr = req.user.role === 'evaluator';
    if (!hr && req.user.id !== id) return res.status(403).json({ error: 'ไม่มีสิทธิ์ดูผลประเมินของผู้อื่น' });
    const list = await loadEvaluations(id, !hr);
    res.json({ data: list[0] || null });
  } catch (e) { next(e); }
});
// HR บันทึกร่าง / ส่งผลประเมิน -> สถานะ pending_hr รอตรวจสอบและปรับเทียบ
app.put('/api/evaluations/:id', requireAuth, requireHR, async (req, res, next) => {
  try {
    const id = String(req.params.id).toLowerCase();
    const data = req.body || {};
    const submit = data.status === 'submitted';
    checkScores(data.scores, submit);
    const scores = data.scores;
    const cc = (Array.isArray(data.cc) ? data.cc : []).slice(0, 5).map(x => String(x || '').slice(0, 2000));
    const strengths = String(data.strengths || '').slice(0, 4000), improvements = String(data.improvements || '').slice(0, 4000);
    const avg = avgOf(scores);
    const result = await tx(async ex => {
      const { cycleId, formId, criteria } = await openCycle(ex);
      const emp = await ex("SELECT user_id FROM users WHERE username = :u AND role = 'employee' AND status = 'active'", { u: id });
      if (!emp.rows.length) throw fail(400, 'ไม่พบพนักงานที่ต้องการประเมิน');
      let ev = await evalOf(ex, cycleId, id), evalId, before = 'not_started';
      if (ev) {
        evalId = ev.EVALUATION_ID; before = ev.STATUS;
        if (LOCKED.includes(before)) throw fail(409, 'ผลประเมินนี้ยืนยันแล้ว แก้ไขไม่ได้ (ยกเลิกการยืนยันก่อน)');
      } else {
        const ins = await ex(`INSERT INTO evaluations (cycle_id, employee_id, form_id, status) VALUES (:c, :e, :f, 'not_started')
                              RETURNING evaluation_id INTO :rid`, { c: cycleId, e: emp.rows[0].USER_ID, f: formId, rid: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } });
        evalId = ins.outBinds.rid[0];
      }
      const status = submit ? 'pending_hr' : 'draft';
      await ex(`UPDATE evaluations SET mentor_id = :m, form_id = :f, status = :s, strengths = :st, improvements = :im,
                       category_comments = :cc, updated_at = SYSTIMESTAMP,
                       mentor_submitted_at = CASE WHEN :sub = 1 THEN SYSTIMESTAMP ELSE NULL END
                 WHERE evaluation_id = :id`,
        { m: req.uid, f: formId, s: status, st: { val: strengths, type: oracledb.CLOB }, im: { val: improvements, type: oracledb.CLOB },
          cc: { val: JSON.stringify(cc), type: oracledb.CLOB }, sub: submit ? 1 : 0, id: evalId });
      await saveScores(ex, evalId, 'mentor', criteria, scores);
      // คะแนนประเมินเปลี่ยน -> ล้างผลปรับเทียบเดิม ต้องตรวจสอบใหม่
      await ex("DELETE FROM evaluation_scores WHERE evaluation_id = :id AND evaluator_role = 'hr'", { id: evalId });
      await ex('DELETE FROM evaluation_results WHERE evaluation_id = :id', { id: evalId });
      await audit(ex, req.uid, 'evaluations', evalId, submit ? 'SUBMIT' : 'SAVE_DRAFT', { employee: id, before, after: status, answered: scores.filter(x => x > 0).length, average: avg });
      return { evalId };
    });
    res.json({ ok: true, evaluationId: result.evalId });
  } catch (e) { next(e); }
});
// พนักงานรับทราบผล (UC-06) / ส่งข้อสงสัย
app.patch('/api/evaluations/:id', requireAuth, requireEmployee, async (req, res, next) => {
  try {
    const id = String(req.params.id).toLowerCase();
    if (req.user.id !== id) return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขผลประเมินนี้' });
    const fields = req.body || {};
    const hasAck = Object.prototype.hasOwnProperty.call(fields, 'ack');
    const hasReply = Object.prototype.hasOwnProperty.call(fields, 'reply');
    if (hasAck && fields.ack !== true) return res.status(400).json({ error: 'ค่า ack ไม่ถูกต้อง' });
    const reply = hasReply ? String(fields.reply || '').trim() : '';
    if (hasReply && (!reply || reply.length > 2000)) return res.status(400).json({ error: 'ข้อความต้องมีความยาว 1–2000 ตัวอักษร' });
    await tx(async ex => {
      const { cycleId } = await currentCycle(ex);
      const ev = await evalOf(ex, cycleId, id);
      if (!ev || !PUBLIC.includes(ev.STATUS)) throw fail(404, 'ยังไม่มีผลประเมิน');
      if (hasAck) {
        await ex("UPDATE evaluations SET status = 'acknowledged', updated_at = SYSTIMESTAMP WHERE evaluation_id = :id", { id: ev.EVALUATION_ID });
        await ex('UPDATE evaluation_results SET acknowledged_at = SYSTIMESTAMP WHERE evaluation_id = :id', { id: ev.EVALUATION_ID });
        await audit(ex, req.uid, 'evaluations', ev.EVALUATION_ID, 'ACKNOWLEDGE', { before: ev.STATUS, after: 'acknowledged' });
      }
      if (hasReply) {
        await ex('UPDATE evaluations SET employee_reply = :r, replied_at = SYSTIMESTAMP, updated_at = SYSTIMESTAMP WHERE evaluation_id = :id', { r: reply, id: ev.EVALUATION_ID });
        await audit(ex, req.uid, 'evaluations', ev.EVALUATION_ID, 'REPLY', { reply: reply.slice(0, 200) });
      }
    });
    if (hasAck) await notifyHR(req.user.name + ' รับทราบผลประเมินแล้ว', '', 'table');
    if (hasReply) await notifyHR(req.user.name + ' ส่งข้อสงสัยถึง HR', reply.slice(0, 200), 'table');
    res.json({ ok: true });
  } catch (e) { next(e); }
});
// ลบผลประเมินของ HR (คะแนน ผลปรับเทียบ ผลสรุป) แบบประเมินตนเองของพนักงานยังอยู่
app.delete('/api/evaluations/:id', requireAuth, requireHR, async (req, res, next) => {
  try {
    const id = String(req.params.id).toLowerCase();
    const wasPublic = await tx(async ex => {
      const { cycleId } = await openCycle(ex);
      const ev = await evalOf(ex, cycleId, id);
      if (!ev || ['not_started', 'pending_mentor'].includes(ev.STATUS)) throw fail(404, 'ไม่พบผลประเมินที่จะลบ');
      await ex("DELETE FROM evaluation_scores WHERE evaluation_id = :id AND evaluator_role IN ('mentor', 'hr')", { id: ev.EVALUATION_ID });
      await ex('DELETE FROM evaluation_results WHERE evaluation_id = :id', { id: ev.EVALUATION_ID });
      await ex(`UPDATE evaluations SET status = CASE WHEN self_submitted_at IS NOT NULL THEN 'pending_mentor' ELSE 'not_started' END,
                       mentor_id = NULL, strengths = NULL, improvements = NULL,
                       category_comments = NULL, employee_reply = NULL, replied_at = NULL, mentor_submitted_at = NULL,
                       updated_at = SYSTIMESTAMP WHERE evaluation_id = :id`, { id: ev.EVALUATION_ID });
      await audit(ex, req.uid, 'evaluations', ev.EVALUATION_ID, 'RESET', { employee: id, before: ev.STATUS, after: 'not_started' });
      return PUBLIC.includes(ev.STATUS);
    });
    if (wasPublic) await notify(id, 'ผลประเมินของคุณถูกยกเลิก', 'HR จะประเมินใหม่อีกครั้ง', 'mine');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- ตรวจสอบ ปรับเทียบ ยืนยัน และเผยแพร่ผล (UC-15, UC-16) ---------- */
// บันทึกคะแนนหลังปรับเทียบ (evaluator_role = 'hr') และข้อสรุปฉบับสุดท้าย
app.post('/api/reviews/:id/calibrate', requireAuth, requireHR, async (req, res, next) => {
  try {
    const id = String(req.params.id).toLowerCase(), b = req.body || {};
    checkScores(b.scores, true);
    const summary = String(b.summary || '').trim().slice(0, 4000);
    const avg = avgOf(b.scores);
    await tx(async ex => {
      const { cycleId, criteria } = await openCycle(ex);
      const ev = await evalOf(ex, cycleId, id);
      if (!ev || ev.STATUS !== 'pending_hr') throw fail(409, 'ปรับเทียบได้เฉพาะผลที่อยู่ในสถานะรอตรวจสอบ');
      await saveScores(ex, ev.EVALUATION_ID, 'hr', criteria, b.scores);
      await ex(`MERGE INTO evaluation_results r
                USING (SELECT :id AS evaluation_id FROM DUAL) x ON (r.evaluation_id = x.evaluation_id)
                WHEN MATCHED THEN UPDATE SET r.final_score = :fs, r.summary = :sm
                WHEN NOT MATCHED THEN INSERT (evaluation_id, final_score, summary) VALUES (x.evaluation_id, :fs, :sm)`,
        { id: ev.EVALUATION_ID, fs: avg, sm: { val: summary, type: oracledb.CLOB } });
      await audit(ex, req.uid, 'evaluations', ev.EVALUATION_ID, 'CALIBRATE', { employee: id, final: avg });
    });
    res.json({ ok: true, final: avg });
  } catch (e) { next(e); }
});
app.post('/api/reviews/:id/confirm', requireAuth, requireHR, async (req, res, next) => {
  try {
    const id = String(req.params.id).toLowerCase();
    const final = await tx(async ex => {
      const { cycleId, criteria } = await openCycle(ex);
      const ev = await evalOf(ex, cycleId, id);
      if (!ev || ev.STATUS !== 'pending_hr') throw fail(409, 'ยืนยันได้เฉพาะผลที่อยู่ในสถานะรอตรวจสอบ');
      const evalId = ev.EVALUATION_ID;
      // ยังไม่ได้ปรับเทียบ -> ใช้คะแนนจากขั้นประเมินเป็นคะแนนสุดท้าย
      const hs = (await scoreMap(cycleId, 'hr'))[evalId];
      let fin = hs;
      if (!hs || !hs.every(x => x > 0)) {
        fin = (await scoreMap(cycleId, 'mentor'))[evalId];
        if (!fin || !fin.every(x => x > 0)) throw fail(400, 'คะแนนไม่ครบ 20 ข้อ');
        await saveScores(ex, evalId, 'hr', criteria, fin);
      }
      const avg = avgOf(fin);
      await ex(`MERGE INTO evaluation_results r
                USING (SELECT :id AS evaluation_id FROM DUAL) x ON (r.evaluation_id = x.evaluation_id)
                WHEN MATCHED THEN UPDATE SET r.final_score = :fs, r.confirmed_at = SYSTIMESTAMP
                WHEN NOT MATCHED THEN INSERT (evaluation_id, final_score, confirmed_at) VALUES (x.evaluation_id, :fs, SYSTIMESTAMP)`,
        { id: evalId, fs: avg });
      await ex("UPDATE evaluations SET status = 'confirmed', updated_at = SYSTIMESTAMP WHERE evaluation_id = :id", { id: evalId });
      await audit(ex, req.uid, 'evaluations', evalId, 'CONFIRM', { employee: id, final: avg });
      return avg;
    });
    res.json({ ok: true, final });
  } catch (e) { next(e); }
});
app.post('/api/reviews/:id/unconfirm', requireAuth, requireHR, async (req, res, next) => {
  try {
    const id = String(req.params.id).toLowerCase();
    await tx(async ex => {
      const { cycleId } = await openCycle(ex);
      const ev = await evalOf(ex, cycleId, id);
      if (!ev || ev.STATUS !== 'confirmed') throw fail(409, 'ยกเลิกได้เฉพาะผลที่ยืนยันแล้วแต่ยังไม่เผยแพร่');
      await ex("UPDATE evaluations SET status = 'pending_hr', updated_at = SYSTIMESTAMP WHERE evaluation_id = :id", { id: ev.EVALUATION_ID });
      await ex('UPDATE evaluation_results SET confirmed_at = NULL WHERE evaluation_id = :id', { id: ev.EVALUATION_ID });
      await audit(ex, req.uid, 'evaluations', ev.EVALUATION_ID, 'UNCONFIRM', { employee: id });
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
// เผยแพร่ผลที่ยืนยันแล้ว (ระบุรายชื่อ หรือไม่ระบุ = ทุกคนที่ยืนยันแล้ว)
app.post('/api/reviews/publish', requireAuth, requireHR, async (req, res, next) => {
  try {
    const only = Array.isArray((req.body || {}).ids) ? req.body.ids.map(x => String(x).toLowerCase()) : null;
    const done = await tx(async ex => {
      const { cycleId } = await openCycle(ex);
      const r = await ex(`SELECT e.evaluation_id, u.username FROM evaluations e JOIN users u ON u.user_id = e.employee_id
                           WHERE e.cycle_id = :c AND e.status = 'confirmed'`, { c: cycleId });
      const list = r.rows.filter(x => !only || only.includes(x.USERNAME));
      if (!list.length) throw fail(400, 'ไม่มีผลที่ยืนยันแล้วรอเผยแพร่');
      for (const x of list) {
        await ex("UPDATE evaluations SET status = 'published', updated_at = SYSTIMESTAMP WHERE evaluation_id = :id", { id: x.EVALUATION_ID });
        await ex('UPDATE evaluation_results SET published_at = SYSTIMESTAMP, acknowledged_at = NULL WHERE evaluation_id = :id', { id: x.EVALUATION_ID });
        await audit(ex, req.uid, 'evaluations', x.EVALUATION_ID, 'PUBLISH', { employee: x.USERNAME });
      }
      return list.map(x => x.USERNAME);
    });
    for (const u of done) await notify(u, 'ผลประเมินของคุณเผยแพร่แล้ว', 'ตรวจสอบคะแนนและกดรับทราบได้ที่หน้า "ผลประเมินของฉัน"', 'mine');
    res.json({ ok: true, count: done.length });
  } catch (e) { next(e); }
});

/* ---------- ประเมินตนเอง (UC-03, UC-04) และส่งกลับให้แก้ไข (UC-10) ---------- */
app.get('/api/self-evaluations', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role === 'evaluator') res.json((await loadSelf()).filter(x => x.status !== 'none' || x.returnReason));
    else res.json(await loadSelf(req.user.id));
  } catch (e) { next(e); }
});
app.put('/api/self-evaluations/me', requireAuth, requireEmployee, async (req, res, next) => {
  try {
    const data = req.body || {};
    const submit = data.status === 'submitted';
    checkScores(data.scores, submit);
    const scores = data.scores;
    const cc = (Array.isArray(data.cc) ? data.cc : []).slice(0, 5).map(x => String(x || '').slice(0, 2000));
    const comment = String(data.comment || '').slice(0, 4000);
    const avg = avgOf(scores);
    await tx(async ex => {
      const { cycleId, formId, criteria } = await openCycle(ex);
      let ev = await evalOf(ex, cycleId, req.user.id), evalId, before = 'not_started';
      if (ev) {
        if (ev.SELF_SUBMITTED_AT) throw fail(409, 'ส่งแบบประเมินตนเองแล้ว แก้ไขไม่ได้ (ถ้าต้องแก้ ให้ HR ส่งกลับ)');
        evalId = ev.EVALUATION_ID; before = ev.STATUS;
      } else {
        const ins = await ex(`INSERT INTO evaluations (cycle_id, employee_id, form_id, status) VALUES (:c, :e, :f, 'not_started')
                              RETURNING evaluation_id INTO :rid`, { c: cycleId, e: req.uid, f: formId, rid: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } });
        evalId = ins.outBinds.rid[0];
      }
      const after = submit && before === 'not_started' ? 'pending_mentor' : before;   // ยังไม่มีผลจาก HR -> รอประเมิน
      await ex(`UPDATE evaluations SET self_comment = :cm, self_category_comments = :cc, status = :s, updated_at = SYSTIMESTAMP,
                       self_submitted_at = CASE WHEN :sub = 1 THEN SYSTIMESTAMP ELSE NULL END
                 WHERE evaluation_id = :id`,
        { cm: { val: comment, type: oracledb.CLOB }, cc: { val: JSON.stringify(cc), type: oracledb.CLOB }, s: after, sub: submit ? 1 : 0, id: evalId });
      await saveScores(ex, evalId, 'employee', criteria, scores);
      await audit(ex, req.uid, 'evaluations', evalId, submit ? 'SELF_SUBMIT' : 'SELF_SAVE_DRAFT', { before, after, answered: scores.filter(x => x > 0).length, average: avg });
    });
    if (submit) await notifyHR(req.user.name + ' ส่งแบบประเมินตนเองแล้ว', 'คะแนนเฉลี่ยที่ประเมินตนเอง ' + (avg == null ? '-' : avg.toFixed(2)) + ' กดเพื่อดูรายละเอียด', 'selfs');
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.post('/api/self-evaluations/:id/return', requireAuth, requireHR, async (req, res, next) => {
  try {
    const id = String(req.params.id).toLowerCase();
    const reason = String((req.body || {}).reason || '').trim();
    if (!reason || reason.length > 2000) return res.status(400).json({ error: 'กรุณาระบุเหตุผลที่ส่งกลับ (ไม่เกิน 2000 ตัวอักษร)' });
    await tx(async ex => {
      const { cycleId } = await openCycle(ex);
      const ev = await evalOf(ex, cycleId, id);
      if (!ev || !ev.SELF_SUBMITTED_AT) throw fail(404, 'พนักงานยังไม่ได้ส่งแบบประเมินตนเอง');
      await ex(`UPDATE evaluations SET self_submitted_at = NULL, updated_at = SYSTIMESTAMP,
                       status = CASE WHEN status = 'pending_mentor' THEN 'not_started' ELSE status END
                 WHERE evaluation_id = :id`, { id: ev.EVALUATION_ID });
      await ex('INSERT INTO return_records (evaluation_id, reason) VALUES (:id, :r)', { id: ev.EVALUATION_ID, r: { val: reason, type: oracledb.CLOB } });
      await audit(ex, req.uid, 'evaluations', ev.EVALUATION_ID, 'RETURN_SELF', { employee: id, reason: reason.slice(0, 200) });
    });
    await notify(id, 'HR ส่งแบบประเมินตนเองกลับให้แก้ไข', reason.slice(0, 200), 'self');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- ลืม PIN / เปลี่ยน PIN ---------- */
// กันเดาสุ่ม: ลองผิดได้ 5 ครั้งต่อ 15 นาที (นับต่อชื่อผู้ใช้และต่อ IP)
const resetTries = new Map();
function tooManyTries(key) {
  const now = Date.now(), t = resetTries.get(key);
  if (!t || now - t.start > 15 * 60 * 1000) return false;
  return t.count >= 5;
}
function addTry(key) {
  const now = Date.now(), t = resetTries.get(key);
  if (!t || now - t.start > 15 * 60 * 1000) resetTries.set(key, { start: now, count: 1 });
  else t.count++;
}
const digits = v => String(v || '').replace(/\D/g, '');
function dropSessions(username) {
  for (const [tok, u] of sessions) if (u === username) sessions.delete(tok);
}

app.post('/api/forgot-pin', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const empCode = String(req.body.empCode || '').trim().toUpperCase();
    const phone = digits(req.body.phone);
    const newPin = String(req.body.newPin || '');
    const ipKey = 'ip:' + (req.ip || ''), userKey = 'u:' + username;
    if (tooManyTries(ipKey) || tooManyTries(userKey)) return res.status(429).json({ error: 'ลองผิดหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่' });
    if (!/^\d{4,12}$/.test(newPin)) return res.status(400).json({ error: 'PIN ใหม่ต้องเป็นตัวเลข 4–12 หลัก' });
    const bad = () => { addTry(ipKey); addTry(userKey); return res.status(400).json({ error: 'ข้อมูลยืนยันตัวตนไม่ถูกต้อง' }); };
    if (!/^[a-z0-9_-]{3,50}$/.test(username) || !empCode || phone.length < 6) return bad();
    const r = await query("SELECT user_id, full_name, emp_code, phone FROM users WHERE username = :u AND status = 'active'", { u: username });
    const row = r.rows[0];
    if (!row || String(row.EMP_CODE || '').toUpperCase() !== empCode || digits(row.PHONE) !== phone) return bad();
    await tx(async ex => {
      await ex('UPDATE users SET password_hash = :h WHERE user_id = :id', { h: pinHash(username, newPin), id: row.USER_ID });
      await audit(ex, row.USER_ID, 'users', row.USER_ID, 'RESET_PIN', 'ยืนยันตัวตนด้วยรหัสพนักงานและเบอร์โทร');
    });
    resetTries.delete(userKey);
    dropSessions(username);   // ออกจากระบบทุกเครื่องที่ล็อกอินค้างไว้
    await notify(username, 'PIN ของคุณถูกรีเซ็ตแล้ว', 'ถ้าคุณไม่ได้เป็นคนทำ กรุณาแจ้ง HR ทันที', 'home');
    await notifyHR(row.FULL_NAME + ' รีเซ็ต PIN ด้วยตนเอง', 'ผ่านการยืนยันด้วยรหัสพนักงานและเบอร์โทร', 'employees', username);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post('/api/change-pin', requireAuth, async (req, res, next) => {
  try {
    const current = String(req.body.currentPin || ''), newPin = String(req.body.newPin || '');
    if (!/^\d{4,12}$/.test(newPin)) return res.status(400).json({ error: 'PIN ใหม่ต้องเป็นตัวเลข 4–12 หลัก' });
    if (current === newPin) return res.status(400).json({ error: 'PIN ใหม่ต้องไม่ซ้ำกับ PIN เดิม' });
    const r = await query('SELECT password_hash FROM users WHERE user_id = :id', { id: req.uid });
    const a = Buffer.from(pinHash(req.user.id, current), 'hex'), b = Buffer.from(String(r.rows[0].PASSWORD_HASH), 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(400).json({ error: 'PIN เดิมไม่ถูกต้อง' });
    await tx(async ex => {
      await ex('UPDATE users SET password_hash = :h WHERE user_id = :id', { h: pinHash(req.user.id, newPin), id: req.uid });
      await audit(ex, req.uid, 'users', req.uid, 'CHANGE_PIN', '');
    });
    await notify(req.user.id, 'เปลี่ยน PIN เรียบร้อยแล้ว', '', 'home');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- ประวัติพนักงาน (users + departments) ---------- */
app.get('/api/employees', requireAuth, async (req, res, next) => {
  try {
    const all = req.user.role === 'evaluator';
    const r = await query(
      `SELECT u.username, u.full_name, u.role, u.position_name, u.emp_code, d.department_name, u.phone, u.email,
              TO_CHAR(u.start_date, 'YYYY-MM-DD') AS start_txt
         FROM users u LEFT JOIN departments d ON d.department_id = u.department_id
        WHERE u.status = 'active' AND u.role IN ('hr', 'employee')` + (all ? '' : ' AND u.user_id = :id') +
      ' ORDER BY u.emp_code, u.username', all ? {} : { id: req.uid });
    res.json(r.rows.map(row => ({
      id: row.USERNAME, name: row.FULL_NAME, role: ROLE_OUT[row.ROLE] || row.ROLE, position: row.POSITION_NAME,
      code: row.EMP_CODE, department: row.DEPARTMENT_NAME, phone: row.PHONE, email: row.EMAIL, startDate: row.START_TXT
    })));
  } catch (e) { next(e); }
});

/* ---------- ตารางเวลางาน (work_schedules) ---------- */
app.get('/api/schedules', requireAuth, async (req, res, next) => {
  try {
    const own = req.user.role !== 'evaluator';
    const r = await query('SELECT u.username, s.day_no, s.shift_code FROM work_schedules s JOIN users u ON u.user_id = s.user_id' +
      (own ? ' WHERE s.user_id = :id' : '') + ' ORDER BY u.username, s.day_no', own ? { id: req.uid } : {});
    res.json(r.rows.map(row => ({ userId: row.USERNAME, day: row.DAY_NO, shift: row.SHIFT_CODE })));
  } catch (e) { next(e); }
});
app.put('/api/schedules/:userId/:day', requireAuth, requireHR, async (req, res, next) => {
  try {
    const username = String(req.params.userId).toLowerCase();
    const day = Number(req.params.day);
    const shift = String((req.body || {}).shift || '');
    if (!Number.isInteger(day) || day < 1 || day > 7 || !SHIFT_CODES.includes(shift)) return res.status(400).json({ error: 'ข้อมูลตารางงานไม่ถูกต้อง' });
    const uid = await uidOf(username);
    if (!uid) return res.status(400).json({ error: 'ไม่พบพนักงาน' });
    await tx(async ex => {
      const old = await ex('SELECT shift_code FROM work_schedules WHERE user_id = :u AND day_no = :d', { u: uid, d: day });
      await ex(`MERGE INTO work_schedules s
                USING (SELECT :u AS user_id, :d AS day_no, :c AS shift_code FROM DUAL) x
                ON (s.user_id = x.user_id AND s.day_no = x.day_no)
                WHEN MATCHED THEN UPDATE SET s.shift_code = x.shift_code, s.updated_at = SYSTIMESTAMP
                WHEN NOT MATCHED THEN INSERT (user_id, day_no, shift_code) VALUES (x.user_id, x.day_no, x.shift_code)`,
        { u: uid, d: day, c: shift });
      await audit(ex, req.uid, 'work_schedules', uid, 'CHANGE_SHIFT', { employee: username, day, before: old.rows.length ? old.rows[0].SHIFT_CODE : null, after: shift });
    });
    // รวมเป็นแจ้งเตือนเดียว ถ้ายังมีแจ้งเตือนเรื่องตารางงานที่ยังไม่ได้อ่าน
    try {
      const up = await query("UPDATE notifications SET created_at = SYSTIMESTAMP WHERE user_id = :u AND notify_type = 'schedule' AND is_read = 0 AND message = 'ตารางเวลางานของคุณมีการเปลี่ยนแปลง'", { u: uid });
      if (!up.rowsAffected) await notify(username, 'ตารางเวลางานของคุณมีการเปลี่ยนแปลง', 'แก้ไขโดย ' + req.user.name, 'schedule');
    } catch (e) { console.error('schedule notify failed:', e.message); }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- แจ้งเตือน (notifications) ---------- */
app.get('/api/notifications', requireAuth, async (req, res, next) => {
  try {
    const r = await query(`SELECT notification_id, message, detail, notify_type, is_read, TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS created_txt
                             FROM notifications WHERE user_id = :u ORDER BY created_at DESC, notification_id DESC FETCH FIRST 50 ROWS ONLY`, { u: req.uid });
    res.json(r.rows.map(row => ({
      id: row.NOTIFICATION_ID, title: row.MESSAGE, body: row.DETAIL, view: TYPE_TO_VIEW[row.NOTIFY_TYPE] || row.NOTIFY_TYPE,
      read: row.IS_READ === 1, at: row.CREATED_TXT
    })));
  } catch (e) { next(e); }
});
app.post('/api/notifications/read', requireAuth, async (req, res, next) => {
  try {
    const id = Number((req.body || {}).id);
    if (Number.isInteger(id) && id > 0) await query('UPDATE notifications SET is_read = 1 WHERE notification_id = :n AND user_id = :u', { n: id, u: req.uid });
    else await query('UPDATE notifications SET is_read = 1 WHERE user_id = :u AND is_read = 0', { u: req.uid });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.use((err, _req, res, _next) => {
  if (err && err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' : (err.message || 'Server error') });
});
(async () => {
  try {
    pool = await oracledb.createPool({ user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectString: process.env.DB_CONNECT_STRING, poolMin: 1, poolMax: 8, poolIncrement: 1 });
    // เพิ่มคอลัมน์สำหรับประเมินตนเองให้อัตโนมัติ (ถ้ามีอยู่แล้วจะข้ามไป)
    for (const col of ['self_comment', 'self_category_comments']) {
      try { await query(`ALTER TABLE evaluations ADD ${col} CLOB`); console.log('added column evaluations.' + col); }
      catch (e) { if (!/ORA-01430|duplicate column/i.test(e.message)) console.error('migration ' + col + ':', e.message); }
    }
    // เตือนถ้ายังใช้ฐานข้อมูลรุ่นเก่า (ยังไม่มีบัญชี HR)
    try {
      const h = await query("SELECT COUNT(*) AS n FROM users WHERE role = 'hr'");
      if (!Number(h.rows[0].N)) console.warn('ยังไม่มีบัญชี HR ในฐานข้อมูล: กรุณารัน sql/03_document_schema.sql ใหม่');
    } catch (_) {}
    app.listen(PORT, '0.0.0.0', () => console.log(`Evaluation app listening on http://0.0.0.0:${PORT}`));
  } catch (e) {
    console.error('Could not connect to Oracle Database. Check server/.env and ensure Oracle Database is running.', e);
    process.exit(1);
  }
})();
