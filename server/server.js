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
   บทบาท 4 แบบตาม Use Case
     employee  (หน้าเว็บ: evaluatee)  พนักงาน   UC-01 ถึง UC-06
     mentor    (หน้าเว็บ: mentor)     พี่เลี้ยง   UC-07 ถึง UC-11 (เฉพาะพนักงานที่ได้รับมอบหมาย evaluations.mentor_id)
     hr        (หน้าเว็บ: evaluator)  HR        UC-12 ถึง UC-16 + มอบหมายพี่เลี้ยง ขยายเวลา ตารางงาน ประวัติการเปลี่ยนแปลง
     executive (หน้าเว็บ: executive)  ผู้บริหาร   UC-17, UC-18 (ดูอย่างเดียว เห็นคะแนนเฉพาะผลที่ยืนยันแล้ว)
   ขั้นตอน: not_started -> (พนักงานส่งประเมินตนเอง) pending_mentor -> (พี่เลี้ยงประเมิน) draft -> (พี่เลี้ยงส่ง) pending_hr
            -> (HR ปรับเทียบ/ยืนยัน) confirmed -> (เผยแพร่) published -> (พนักงานรับทราบ) acknowledged
            พี่เลี้ยงส่งแบบประเมินตนเองกลับ = returned (UC-10), HR ส่งผลกลับให้พี่เลี้ยงแก้ = draft (UC-15)
   ===================================================================== */
let pool;
const OBJ = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const ROLE_OUT = { hr: 'evaluator', employee: 'evaluatee', mentor: 'mentor', executive: 'executive' };   // ค่าใน DB -> ค่าที่หน้าเว็บใช้
const VIEW_TO_TYPE = {
  mine: 'result', table: 'review', schedule: 'schedule', home: 'account', employees: 'staff',
  selfs: 'self_eval', self: 'self_return', goals: 'goal', goalreview: 'goal_review', cycle: 'cycle', reviews: 'calibrate',
  list: 'evaluate', overview: 'overview', report: 'report'
};
const TYPE_TO_VIEW = Object.fromEntries(Object.entries(VIEW_TO_TYPE).map(([v, t]) => [t, v]));
const SHIFT_CODES = ['M', 'A', 'N', 'OFF'];
const EVALUATED = ['pending_hr', 'confirmed', 'published', 'acknowledged'];   // พี่เลี้ยงส่งผลประเมินแล้ว
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
const STAGE_KEYS = ['goal', 'self', 'evaluate', 'review'];
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function todayTxt() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function thDate(t) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t || ''); return m ? (+m[3]) + ' ' + TH_MONTHS[+m[2] - 1] + ' ' + (+m[1] + 543) : String(t || ''); }
// ระดับคะแนนและข้อมูลที่ต้องกรอก (evaluation_forms.settings) — UC-13
const DEFAULT_SETTINGS = { max: 5, labels: ['ต้องปรับปรุงมาก', 'ต้องปรับปรุง', 'ตามเกณฑ์', 'ดี', 'ดีเยี่ยม'],
  req: { strengths: false, improvements: false, catComment: false, selfComment: false, selfCatComment: false } };
function parseSettings(txt) {
  let o = {};
  try { o = JSON.parse(txt || '{}') || {}; } catch (_) {}
  const max = [3, 4, 5].includes(Number(o.max)) ? Number(o.max) : 5;
  const labels = DEFAULT_SETTINGS.labels.map((d, i) => String((Array.isArray(o.labels) && o.labels[i]) || d).slice(0, 60));
  const req = {};
  for (const k of Object.keys(DEFAULT_SETTINGS.req)) req[k] = !!(o.req && o.req[k]);
  return { max, labels: labels.slice(0, max), req };
}
const cycleParam = req => (Number.isInteger(Number(req.query.cycle)) && Number(req.query.cycle) > 0 ? Number(req.query.cycle) : null);

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
// พี่เลี้ยงของพนักงานในรอบที่เปิดอยู่ (evaluations.mentor_id)
async function mentorOf(empUsername) {
  const r = await query(`SELECT m.username FROM evaluations e JOIN users u ON u.user_id = e.employee_id JOIN users m ON m.user_id = e.mentor_id
                           JOIN evaluation_cycles c ON c.cycle_id = e.cycle_id WHERE u.username = :u AND c.status = 'open'`, { u: empUsername });
  return r.rows.length ? r.rows[0].USERNAME : null;
}
async function notifyMentor(empUsername, title, body, view) {
  try {
    const m = await mentorOf(empUsername);
    if (m) await notify(m, title, body, view);
    else await notifyHR(title + ' (ยังไม่ได้มอบหมายพี่เลี้ยง)', body, 'table');
  } catch (e) { console.error('notifyMentor failed:', e.message); }
}
function publicUser(row) {
  return { id: row.USERNAME, name: row.FULL_NAME, role: ROLE_OUT[row.ROLE] || row.ROLE, position: row.POSITION_NAME };
}

// รอบการประเมินปัจจุบัน: รอบที่เปิดอยู่ ถ้าไม่มีใช้รอบล่าสุด (ดูได้อย่างเดียว)
async function currentCycle(run = query, wantId = null) {
  let c = { rows: [] };
  if (wantId) c = await run("SELECT cycle_id, cycle_name, status FROM evaluation_cycles WHERE cycle_id = :w AND status <> 'draft'", { w: wantId });
  if (!c.rows.length) c = await run("SELECT cycle_id, cycle_name, status FROM evaluation_cycles WHERE status = 'open' ORDER BY start_date DESC FETCH FIRST 1 ROWS ONLY");
  if (!c.rows.length) c = await run("SELECT cycle_id, cycle_name, status FROM evaluation_cycles WHERE status <> 'draft' ORDER BY start_date DESC, cycle_id DESC FETCH FIRST 1 ROWS ONLY");
  if (!c.rows.length) throw fail(400, 'ยังไม่มีรอบการประเมิน');
  const cycleId = c.rows[0].CYCLE_ID;
  const f = await run('SELECT form_id, settings FROM evaluation_forms WHERE cycle_id = :c ORDER BY form_id FETCH FIRST 1 ROWS ONLY', { c: cycleId });
  if (!f.rows.length) throw fail(400, 'รอบการประเมินนี้ยังไม่มีแบบประเมิน');
  const formId = f.rows[0].FORM_ID;
  const cr = await run('SELECT criteria_id FROM criteria WHERE form_id = :f ORDER BY sort_order', { f: formId });
  return { cycleId, formId, name: c.rows[0].CYCLE_NAME, status: c.rows[0].STATUS, criteria: cr.rows.map(r => r.CRITERIA_ID), settings: parseSettings(f.rows[0].SETTINGS) };
}
async function openCycle(run) {
  const c = await currentCycle(run);   // เขียนข้อมูลได้เฉพาะรอบที่เปิดอยู่
  if (c.status !== 'open') throw fail(400, 'รอบการประเมินปิดแล้ว แก้ไขข้อมูลไม่ได้');
  if (c.criteria.length !== 20) throw fail(500, 'แบบประเมินในฐานข้อมูลต้องมี 20 ข้อ');
  return c;
}

// ช่วงเวลาของขั้นตอน (cycle_stages.stage_key) + การขยายเวลารายคน (deadline_extensions) — BR-EVAL-03, BR-EVAL-07
async function stageWindow(run, cycleId, key, empId) {
  const r = await run(`SELECT stage_name, TO_CHAR(start_date, 'YYYY-MM-DD') AS s_txt, TO_CHAR(end_date, 'YYYY-MM-DD') AS e_txt
                         FROM cycle_stages WHERE cycle_id = :c AND stage_key = :k ORDER BY start_date FETCH FIRST 1 ROWS ONLY`, { c: cycleId, k: key });
  if (!r.rows.length) return { state: 'open' };
  let ext = null;
  if (empId) {
    const x = await run("SELECT TO_CHAR(until_date, 'YYYY-MM-DD') AS u_txt FROM deadline_extensions WHERE cycle_id = :c AND employee_id = :e AND stage_key = :k", { c: cycleId, e: empId, k: key });
    if (x.rows.length) ext = x.rows[0].U_TXT;
  }
  const t = todayTxt(), st = r.rows[0];
  const state = t < st.S_TXT ? 'before' : (t > st.E_TXT && !(ext && t <= ext)) ? 'after' : 'open';
  return { state, name: st.STAGE_NAME, start: st.S_TXT, end: st.E_TXT, ext };
}
async function requireWindow(run, cycleId, key, empId) {
  const w = await stageWindow(run, cycleId, key, empId);
  if (w.state === 'before') throw fail(403, 'ยังไม่ถึงช่วง "' + w.name + '" (เริ่ม ' + thDate(w.start) + ')');
  if (w.state === 'after') throw fail(403, 'พ้นกำหนดช่วง "' + w.name + '" แล้ว (สิ้นสุด ' + thDate(w.ext && w.ext > w.end ? w.ext : w.end) + ') กรุณาติดต่อ HR เพื่อขออนุมัติขยายเวลา');
  return w;
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
// mode = 'employee': เห็นเฉพาะผลที่เผยแพร่แล้ว และคะแนนเป็นคะแนนสุดท้ายหลังปรับเทียบ
//        'mentor'  : เฉพาะพนักงานที่ตนเป็นพี่เลี้ยง (uid)
//        'exec'    : ผู้บริหารเห็นสถานะทุกคน แต่เห็นคะแนนเฉพาะผลที่ HR ยืนยันแล้ว (UC-17, UC-18)
//        'hr'      : ทุกคน
async function loadEvaluations(username, mode, wantCycle, uid) {
  const forEmployee = mode === 'employee';
  const { cycleId } = await currentCycle(query, wantCycle);
  const r = await query(
    `SELECT e.evaluation_id, e.mentor_id, emp.username AS emp_u, m.username AS men_u, m.full_name AS men_n, e.status,
            e.strengths, e.improvements, e.category_comments, e.employee_reply, e.replied_at,
            e.updated_at, e.mentor_submitted_at, r.final_score, r.summary, r.confirmed_at, r.published_at, r.acknowledged_at
       FROM evaluations e
       JOIN users emp ON emp.user_id = e.employee_id
       LEFT JOIN users m ON m.user_id = e.mentor_id
       LEFT JOIN evaluation_results r ON r.evaluation_id = e.evaluation_id
      WHERE e.cycle_id = :c AND e.status NOT IN ('not_started', 'pending_mentor', 'returned')` + (username ? ' AND emp.username = :u' : '') +
    ' ORDER BY emp.username', username ? { c: cycleId, u: username } : { c: cycleId });
  if (!r.rows.length) return [];
  const mentor = await scoreMap(cycleId, 'mentor'), hr = await scoreMap(cycleId, 'hr');
  // เหตุผลที่ HR ส่งผลกลับให้พี่เลี้ยงแก้ไข (UC-15) ล่าสุดของแต่ละรายการ
  const back = {};
  if (mode === 'mentor' || mode === 'hr') {
    const rb = await query("SELECT entity_id, change_detail FROM audit_logs WHERE entity_type = 'evaluations' AND action = 'RETURN_TO_MENTOR' ORDER BY log_id");
    for (const x of rb.rows) { try { back[x.ENTITY_ID] = JSON.parse(x.CHANGE_DETAIL || '{}').reason || ''; } catch (_) {} }
  }
  const out = [];
  for (const row of r.rows) {
    if (forEmployee && !PUBLIC.includes(row.STATUS)) continue;
    if (mode === 'mentor' && row.MENTOR_ID !== uid) continue;
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
    if (row.STATUS === 'draft' && back[row.EVALUATION_ID]) o.hrReturn = back[row.EVALUATION_ID];
    if (mode === 'exec') {   // ผู้บริหาร: ไม่เห็นคะแนน/ความเห็นระหว่างดำเนินการ
      const locked = LOCKED.includes(row.STATUS);
      const z = new Array(20).fill(0);
      Object.assign(o, { scores: locked ? fin : z, hrScores: locked ? fin : z, finalScores: locked ? fin : z, cc: [], strengths: '', improvements: '', reply: '',
        summary: locked ? o.summary : '', final: locked ? o.final : null });
    }
    out.push(o);
  }
  return out;
}

// อ่านแบบประเมินตนเอง (UC-03, UC-04): คะแนน evaluator_role = 'employee' + self_comment / self_category_comments
async function loadSelf(username, wantCycle, mentorUid) {
  const { cycleId } = await currentCycle(query, wantCycle);
  const b = { c: cycleId };
  if (username) b.u = username;
  if (mentorUid) b.m = mentorUid;
  const r = await query(
    `SELECT e.evaluation_id, u.username, e.self_submitted_at, e.self_comment, e.self_category_comments, e.updated_at
       FROM evaluations e JOIN users u ON u.user_id = e.employee_id
      WHERE e.cycle_id = :c AND u.role = 'employee'` + (username ? ' AND u.username = :u' : '') + (mentorUid ? ' AND e.mentor_id = :m' : '') + ' ORDER BY u.username', b);
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
function requireMentor(req, res, next) {
  if (req.user.role !== 'mentor') return res.status(403).json({ error: 'เฉพาะพี่เลี้ยงเท่านั้น' });
  next();
}
// ผู้ที่ดูข้อมูลภาพรวมได้: HR, พี่เลี้ยง (เฉพาะทีม), ผู้บริหาร
function requireStaffViewer(req, res, next) {
  if (!['evaluator', 'mentor', 'executive'].includes(req.user.role)) return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' });
  next();
}
const viewMode = req => ({ evaluator: 'hr', mentor: 'mentor', executive: 'exec', evaluatee: 'employee' }[req.user.role]);
// UC-07/08/10 Exception 2: พี่เลี้ยงทำได้เฉพาะพนักงานที่ได้รับมอบหมาย
function requireOwnStaff(ev, req) {
  if (!ev) throw fail(404, 'ไม่พบรายการประเมินของพนักงานในรอบนี้');
  if (ev.MENTOR_ID !== req.uid) throw fail(403, 'คุณไม่ได้เป็นพี่เลี้ยงของพนักงานคนนี้');
}
// หาแถว evaluations ของพนักงานในรอบปัจจุบัน
async function evalOf(ex, cycleId, username) {
  const r = await ex(`SELECT e.evaluation_id, e.status, e.self_submitted_at, e.mentor_id, u.user_id, u.username, u.full_name
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
function checkScores(scores, submit, max = 5) {
  if (!Array.isArray(scores) || scores.length !== 20 || scores.some(x => !Number.isInteger(x) || x < 0 || x > max)) throw fail(400, 'คะแนนต้องอยู่ระหว่าง 1–' + max);
  if (submit && scores.some(x => x < 1)) throw fail(400, 'กรุณาให้คะแนนครบทุกข้อก่อนส่ง');
}

app.get('/api/health', async (_req, res, next) => {
  try { await query('SELECT COUNT(*) AS n FROM users'); res.json({ ok: true, database: 'Oracle' }); }
  catch (e) { next(e); }
});
app.get('/api/accounts', async (_req, res, next) => {
  try {
    const r = await query("SELECT username, full_name, role, position_name FROM users WHERE status = 'active' ORDER BY username");
    res.json(r.rows.map(publicUser));
  } catch (e) { next(e); }
});
app.post('/api/login', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const pin = String(req.body.pin || '');
    const bad = () => res.status(401).json({ error: 'ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง' });
    if (!/^[a-z0-9_-]{3,50}$/.test(username) || !/^\d{4,12}$/.test(pin)) return bad();
    const r = await query("SELECT user_id, username, full_name, role, position_name, password_hash FROM users WHERE username = :u AND status = 'active'", { u: username });
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
  const r = await query(`SELECT cycle_id, cycle_name, status, min_goals, TO_CHAR(start_date, 'YYYY-MM-DD') AS s_txt, TO_CHAR(end_date, 'YYYY-MM-DD') AS e_txt
                           FROM evaluation_cycles ${where} ORDER BY start_date DESC, cycle_id DESC`, binds || {});
  const out = [];
  for (const c of r.rows) {
    const st = await query(`SELECT stage_id, stage_name, stage_key, TO_CHAR(start_date, 'YYYY-MM-DD') AS s_txt, TO_CHAR(end_date, 'YYYY-MM-DD') AS e_txt
                              FROM cycle_stages WHERE cycle_id = :c ORDER BY start_date, stage_id`, { c: c.CYCLE_ID });
    const f = await query('SELECT form_name FROM evaluation_forms WHERE cycle_id = :c ORDER BY form_id FETCH FIRST 1 ROWS ONLY', { c: c.CYCLE_ID });
    out.push({ id: c.CYCLE_ID, name: c.CYCLE_NAME, status: c.STATUS, start: c.S_TXT, end: c.E_TXT, minGoals: Number(c.MIN_GOALS || 0), formName: f.rows.length ? f.rows[0].FORM_NAME : '',
      stages: st.rows.map(s => ({ id: s.STAGE_ID, name: s.STAGE_NAME, key: s.STAGE_KEY || '', start: s.S_TXT, end: s.E_TXT })) });
  }
  return out;
}
// รอบที่กำลังดู (ค่าเริ่มต้น = รอบที่เปิดอยู่) + วันนี้ + การขยายเวลาของตนเอง
app.get('/api/cycle', requireAuth, async (req, res, next) => {
  try {
    const { cycleId } = await currentCycle(query, cycleParam(req));
    const c = (await cycleRows('WHERE cycle_id = :c', { c: cycleId }))[0] || null;
    if (c) {
      c.today = todayTxt();
      const own = req.user.role === 'evaluatee';
      const x = await query(`SELECT x.ext_id, u.username, x.stage_key, TO_CHAR(x.until_date, 'YYYY-MM-DD') AS u_txt, x.reason
                               FROM deadline_extensions x JOIN users u ON u.user_id = x.employee_id
                              WHERE x.cycle_id = :c` + (own ? ' AND x.employee_id = :e' : '') + ' ORDER BY u.username, x.stage_key', own ? { c: cycleId, e: req.uid } : { c: cycleId });
      c.extensions = x.rows.map(r => ({ id: r.EXT_ID, userId: r.USERNAME, stage: r.STAGE_KEY, until: r.U_TXT, reason: r.REASON || '' }));
    }
    res.json(c);
  } catch (e) { if (e.status === 400) return res.json(null); next(e); }
});
// รายชื่อรอบสำหรับเลือกดูย้อนหลัง (UC-05, UC-14, UC-17)
app.get('/api/cycle-list', requireAuth, async (_req, res, next) => {
  try {
    const r = await query("SELECT cycle_id, cycle_name, status FROM evaluation_cycles WHERE status <> 'draft' ORDER BY start_date DESC, cycle_id DESC");
    res.json(r.rows.map(c => ({ id: c.CYCLE_ID, name: c.CYCLE_NAME, status: c.STATUS })));
  } catch (e) { next(e); }
});
// HR อนุมัติให้ดำเนินการหลังกำหนดเวลา (BR-EVAL-07)
app.post('/api/extensions', requireAuth, requireHR, async (req, res, next) => {
  try {
    const b = req.body || {};
    const username = String(b.employee || '').toLowerCase(), stage = String(b.stage || ''), until = String(b.until || ''), reason = String(b.reason || '').trim().slice(0, 500);
    if (!['goal', 'self'].includes(stage)) return res.status(400).json({ error: 'เลือกขั้นตอนที่จะขยายเวลา (กำหนดเป้าหมาย / ประเมินตนเอง)' });
    if (!isDate(until) || until < todayTxt()) return res.status(400).json({ error: 'วันที่ขยายเวลาต้องไม่ก่อนวันนี้' });
    const who = await tx(async ex => {
      const { cycleId } = await openCycle(ex);
      const u = await ex("SELECT user_id, full_name FROM users WHERE username = :u AND role = 'employee' AND status = 'active'", { u: username });
      if (!u.rows.length) throw fail(400, 'ไม่พบพนักงาน');
      const c = await ex("SELECT TO_CHAR(end_date, 'YYYY-MM-DD') AS e_txt FROM evaluation_cycles WHERE cycle_id = :c", { c: cycleId });
      if (until > c.rows[0].E_TXT) throw fail(400, 'วันที่ขยายเวลาต้องไม่เกินวันสิ้นสุดรอบ (' + thDate(c.rows[0].E_TXT) + ')');
      await ex(`MERGE INTO deadline_extensions d
                USING (SELECT :c AS cycle_id, :e AS employee_id, :k AS stage_key FROM DUAL) x
                ON (d.cycle_id = x.cycle_id AND d.employee_id = x.employee_id AND d.stage_key = x.stage_key)
                WHEN MATCHED THEN UPDATE SET d.until_date = TO_DATE(:u, 'YYYY-MM-DD'), d.reason = :r, d.granted_by = :g, d.granted_at = SYSTIMESTAMP
                WHEN NOT MATCHED THEN INSERT (cycle_id, employee_id, stage_key, until_date, reason, granted_by) VALUES (x.cycle_id, x.employee_id, x.stage_key, TO_DATE(:u, 'YYYY-MM-DD'), :r, :g)`,
        { c: cycleId, e: u.rows[0].USER_ID, k: stage, u: until, r: reason, g: req.uid });
      await audit(ex, req.uid, 'deadline_extensions', u.rows[0].USER_ID, 'EXTEND_DEADLINE', { employee: username, stage, until, reason });
      return u.rows[0];
    });
    await notify(username, 'HR อนุมัติให้' + (stage === 'goal' ? 'ส่งเป้าหมาย' : 'ส่งแบบประเมินตนเอง') + 'ได้ถึง ' + thDate(until), reason, stage === 'goal' ? 'goals' : 'self');
    res.json({ ok: true, name: who.FULL_NAME });
  } catch (e) { next(e); }
});
app.delete('/api/extensions/:id', requireAuth, requireHR, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await tx(async ex => {
      const r = await ex('SELECT employee_id, stage_key FROM deadline_extensions WHERE ext_id = :i', { i: id });
      if (!r.rows.length) throw fail(404, 'ไม่พบรายการขยายเวลา');
      await ex('DELETE FROM deadline_extensions WHERE ext_id = :i', { i: id });
      await audit(ex, req.uid, 'deadline_extensions', r.rows[0].EMPLOYEE_ID, 'CANCEL_EXTENSION', { stage: r.rows[0].STAGE_KEY });
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
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
  const minGoals = Number(b.minGoals == null ? 1 : b.minGoals);
  if (!Number.isInteger(minGoals) || minGoals < 0 || minGoals > 10) throw fail(400, 'จำนวนเป้าหมายขั้นต่ำต้องเป็น 0–10');
  const used = {};
  for (const s of stages) {
    if (s.key && !STAGE_KEYS.includes(s.key)) throw fail(400, 'ประเภทขั้นตอนไม่ถูกต้อง');
    if (s.key && used[s.key]) throw fail(400, 'ประเภทขั้นตอนซ้ำกัน: แต่ละประเภทใช้ได้ 1 ขั้น');
    if (s.key) used[s.key] = 1;
    if (!String(s.name || '').trim()) throw fail(400, 'กรุณาระบุชื่อขั้นตอน');
    if (!isDate(s.start) || !isDate(s.end) || s.end < s.start) throw fail(400, 'วันที่ของขั้นตอน "' + s.name + '" ไม่ถูกต้อง');
    if (s.start < b.start || s.end > b.end) throw fail(400, 'ขั้นตอน "' + s.name + '" ต้องอยู่ในช่วงวันที่ของรอบ');
  }
  return { name, start: b.start, end: b.end, minGoals, stages: stages.map(s => ({ name: String(s.name).trim().slice(0, 50), key: s.key || null, start: s.start, end: s.end })) };
}
// UC-12 Exception 3: ห้ามชื่อซ้ำหรือช่วงวันที่ทับกับรอบอื่น
async function checkOverlap(ex, b, selfId) {
  const r = await ex(`SELECT cycle_name, TO_CHAR(start_date, 'YYYY-MM-DD') AS s_txt, TO_CHAR(end_date, 'YYYY-MM-DD') AS e_txt FROM evaluation_cycles
                       WHERE cycle_id <> :i AND (cycle_name = :n OR (start_date <= TO_DATE(:e, 'YYYY-MM-DD') AND end_date >= TO_DATE(:s, 'YYYY-MM-DD')))`,
    { i: selfId || 0, n: b.name, s: b.start, e: b.end });
  if (r.rows.length) {
    const c = r.rows[0];
    throw fail(409, c.CYCLE_NAME === b.name ? 'มีรอบชื่อ "' + b.name + '" อยู่แล้ว' : 'ช่วงวันที่ทับกับรอบ "' + c.CYCLE_NAME + '" (' + thDate(c.S_TXT) + ' – ' + thDate(c.E_TXT) + ')');
  }
}
async function writeStages(ex, cycleId, stages) {
  await ex('DELETE FROM cycle_stages WHERE cycle_id = :c', { c: cycleId });
  for (const s of stages) {
    await ex("INSERT INTO cycle_stages (cycle_id, stage_name, start_date, end_date, stage_key) VALUES (:c, :n, TO_DATE(:s, 'YYYY-MM-DD'), TO_DATE(:e, 'YYYY-MM-DD'), :k)",
      { c: cycleId, n: s.name, s: s.start, e: s.end, k: s.key });
  }
}
// สร้างรอบใหม่ (สถานะร่าง) และคัดลอกแบบประเมิน + เกณฑ์จากรอบล่าสุด
app.post('/api/cycles', requireAuth, requireHR, async (req, res, next) => {
  try {
    const b = checkCycleBody(req.body || {});
    const id = await tx(async ex => {
      await checkOverlap(ex, b, 0);
      const ins = await ex(`INSERT INTO evaluation_cycles (cycle_name, start_date, end_date, status, min_goals)
                            VALUES (:n, TO_DATE(:s, 'YYYY-MM-DD'), TO_DATE(:e, 'YYYY-MM-DD'), 'draft', :mg) RETURNING cycle_id INTO :rid`,
        { n: b.name, s: b.start, e: b.end, mg: b.minGoals, rid: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } });
      const cid = ins.outBinds.rid[0];
      await writeStages(ex, cid, b.stages);
      const src = await ex(`SELECT f.form_id, f.form_name, f.description, f.settings FROM evaluation_forms f JOIN evaluation_cycles c ON c.cycle_id = f.cycle_id
                             WHERE c.cycle_id <> :c ORDER BY c.start_date DESC, f.form_id DESC FETCH FIRST 1 ROWS ONLY`, { c: cid });
      if (!src.rows.length) throw fail(400, 'ไม่พบแบบประเมินต้นแบบสำหรับคัดลอก');
      const fi = await ex('INSERT INTO evaluation_forms (cycle_id, form_name, description, settings) VALUES (:c, :n, :d, :st) RETURNING form_id INTO :rid',
        { c: cid, n: src.rows[0].FORM_NAME, d: { val: src.rows[0].DESCRIPTION || '', type: oracledb.CLOB }, st: { val: src.rows[0].SETTINGS || '', type: oracledb.CLOB }, rid: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } });
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
      await checkOverlap(ex, b, id);
      await ex("UPDATE evaluation_cycles SET cycle_name = :n, start_date = TO_DATE(:s, 'YYYY-MM-DD'), end_date = TO_DATE(:e, 'YYYY-MM-DD'), min_goals = :mg WHERE cycle_id = :c",
        { n: b.name, s: b.start, e: b.end, mg: b.minGoals, c: id });
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
        if (has.rows.length) continue;
        // พี่เลี้ยงเดิมจากรอบก่อนหน้า (HR เปลี่ยนได้ที่หน้าติดตามสถานะ)
        const pm = await ex(`SELECT e.mentor_id FROM evaluations e JOIN users m ON m.user_id = e.mentor_id
                              WHERE e.employee_id = :e AND e.cycle_id <> :c AND m.role = 'mentor' AND m.status = 'active'
                              ORDER BY e.evaluation_id DESC FETCH FIRST 1 ROWS ONLY`, { e: u.USER_ID, c: id });
        await ex("INSERT INTO evaluations (cycle_id, employee_id, form_id, status, mentor_id) VALUES (:c, :e, :f, 'not_started', :m)",
          { c: id, e: u.USER_ID, f: f.rows[0].FORM_ID, m: pm.rows.length ? pm.rows[0].MENTOR_ID : null });
      }
      await audit(ex, req.uid, 'evaluation_cycles', id, 'OPEN_CYCLE', { employees: emps.rows.length });
      return c.rows[0].CYCLE_NAME;
    });
    const emps = await query("SELECT username FROM users WHERE role = 'employee' AND status = 'active'");
    for (const u of emps.rows) await notify(u.USERNAME, 'เปิด' + name + ' แล้ว', 'ดูช่วงเวลาแต่ละขั้นตอน และเริ่มกำหนดเป้าหมาย/ประเมินตนเองได้', 'cycle');
    const ms = await query("SELECT username FROM users WHERE role = 'mentor' AND status = 'active'");
    for (const u of ms.rows) await notify(u.USERNAME, 'เปิด' + name + ' แล้ว', 'ดูรายชื่อพนักงานที่ได้รับมอบหมายได้ที่หน้า "ประเมินพนักงาน"', 'list');
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
app.get('/api/form', requireAuth, async (req, res, next) => {
  try {
    const { formId, cycleId, status, settings } = await currentCycle(query, cycleParam(req));
    const f = await query('SELECT form_name, description FROM evaluation_forms WHERE form_id = :f', { f: formId });
    const cr = await query('SELECT criteria_id, title, description, min_score, max_score, category, sort_order FROM criteria WHERE form_id = :f ORDER BY sort_order', { f: formId });
    const used = await query("SELECT COUNT(*) AS n FROM evaluation_scores s JOIN evaluations e ON e.evaluation_id = s.evaluation_id WHERE e.cycle_id = :c", { c: cycleId });
    res.json({ formId, cycleStatus: status, settings, name: f.rows[0].FORM_NAME, description: f.rows[0].DESCRIPTION || '', inUse: Number(used.rows[0].N) > 0,
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
    // ระดับคะแนน (3–5 ระดับ) และข้อมูลที่ผู้ประเมินต้องกรอก
    const max = Number(b.max || 5);
    if (![3, 4, 5].includes(max)) return res.status(400).json({ error: 'จำนวนระดับคะแนนต้องเป็น 3, 4 หรือ 5 ระดับ' });
    const labels = (Array.isArray(b.labels) ? b.labels : []).slice(0, max).map(x => String(x || '').trim());
    if (labels.length !== max || labels.some(l => !l || l.length > 60)) return res.status(400).json({ error: 'กรุณาตั้งชื่อระดับคะแนนให้ครบทุกระดับ (ไม่เกิน 60 ตัวอักษร)' });
    const reqf = {};
    for (const k of Object.keys(DEFAULT_SETTINGS.req)) reqf[k] = !!(b.req && b.req[k]);
    await tx(async ex => {
      const { formId, cycleId, status, settings: old } = await currentCycle(ex);
      if (status === 'closed') throw fail(400, 'รอบการประเมินปิดแล้ว แก้ไขแบบประเมินไม่ได้');
      if (max !== old.max) {   // BR-HR-03: เปลี่ยนจำนวนระดับคะแนนหลังให้คะแนนแล้ว จะทำให้คะแนนเดิมผิดความหมาย
        const used = await ex('SELECT COUNT(*) AS n FROM evaluation_scores s JOIN evaluations e ON e.evaluation_id = s.evaluation_id WHERE e.cycle_id = :c', { c: cycleId });
        if (Number(used.rows[0].N) > 0) throw fail(409, 'มีการให้คะแนนในรอบนี้แล้ว เปลี่ยนจำนวนระดับคะแนนไม่ได้ (แก้ได้เฉพาะชื่อระดับ)');
      }
      const st = JSON.stringify({ max, labels, req: reqf });
      await ex('UPDATE evaluation_forms SET form_name = :n, description = :d, settings = :st WHERE form_id = :f',
        { n: name, d: { val: description, type: oracledb.CLOB }, st: { val: st, type: oracledb.CLOB }, f: formId });
      for (let i = 0; i < 20; i++) {
        await ex('UPDATE criteria SET title = :t, description = :d, category = :c, min_score = 1, max_score = :mx WHERE form_id = :f AND sort_order = :o',
          { t: String(items[i].title).trim(), d: { val: String(items[i].description || '').slice(0, 2000), type: oracledb.CLOB }, c: cats[Math.floor(i / 4)], mx: max, f: formId, o: i + 1 });
      }
      await audit(ex, req.uid, 'evaluation_forms', formId, 'UPDATE_FORM', { name, categories: cats, max, labels, req: reqf });
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- เป้าหมาย (UC-02 พนักงานกำหนด, UC-07 HR ตรวจสอบ) ---------- */
app.get('/api/goals', requireAuth, async (req, res, next) => {
  try {
    const { cycleId } = await currentCycle(query, cycleParam(req));
    const role = req.user.role, own = role === 'evaluatee', men = role === 'mentor';
    const r = await query(`SELECT g.goal_id, u.username, g.title, g.detail, g.status, g.review_comment FROM goals g JOIN users u ON u.user_id = g.employee_id
                            WHERE g.cycle_id = :c` + (own ? ' AND g.employee_id = :e' : " AND g.status <> 'draft'") +
                          (men ? ' AND g.employee_id IN (SELECT employee_id FROM evaluations WHERE cycle_id = :c AND mentor_id = :e)' : '') +
                          ' ORDER BY u.username, g.goal_id', own || men ? { c: cycleId, e: req.uid } : { c: cycleId });
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
      await requireWindow(ex, cycleId, 'goal', req.uid);
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
      const { cycleId } = await openCycle(ex);
      await requireWindow(ex, cycleId, 'goal', req.uid);
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
      const { cycleId } = await openCycle(ex);
      await requireWindow(ex, cycleId, 'goal', req.uid);
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
      await requireWindow(ex, cycleId, 'goal', req.uid);
      // BR-EVAL-02: ครบตามจำนวนขั้นต่ำ และทุกข้อที่จะส่งต้องมีรายละเอียด/ตัวชี้วัด
      const mg = await ex('SELECT min_goals FROM evaluation_cycles WHERE cycle_id = :c', { c: cycleId });
      const min = Number(mg.rows[0].MIN_GOALS || 0);
      const all = await ex('SELECT title, detail, status FROM goals WHERE cycle_id = :c AND employee_id = :e', { c: cycleId, e: req.uid });
      if (all.rows.length < min) throw fail(400, 'ต้องกำหนดเป้าหมายอย่างน้อย ' + min + ' ข้อก่อนส่ง (ตอนนี้มี ' + all.rows.length + ' ข้อ)');
      const noDetail = all.rows.find(g => ['draft', 'returned'].includes(g.STATUS) && !String(g.DETAIL || '').trim());
      if (noDetail) throw fail(400, 'กรุณาระบุรายละเอียด/ตัวชี้วัดของเป้าหมาย "' + noDetail.TITLE + '" ก่อนส่ง');
      const r = await ex("UPDATE goals SET status = 'pending_review' WHERE cycle_id = :c AND employee_id = :e AND status IN ('draft', 'returned')", { c: cycleId, e: req.uid });
      if (!r.rowsAffected) throw fail(400, 'ไม่มีเป้าหมายที่รอส่ง');
      await audit(ex, req.uid, 'goals', req.uid, 'SUBMIT_GOALS', { count: r.rowsAffected });
      return r.rowsAffected;
    });
    await notifyMentor(req.user.id, req.user.name + ' ส่งเป้าหมายให้ตรวจสอบ', n + ' ข้อ รอการตรวจสอบ', 'goalreview');
    res.json({ ok: true, count: n });
  } catch (e) { next(e); }
});
app.post('/api/goals/:id/review', requireAuth, requireMentor, async (req, res, next) => {
  try {
    const id = Number(req.params.id), b = req.body || {};
    const decision = b.decision === 'approve' ? 'approved' : b.decision === 'return' ? 'returned' : null;
    const comment = String(b.comment || '').trim().slice(0, 2000);
    if (!decision) return res.status(400).json({ error: 'ต้องเลือกอนุมัติหรือส่งกลับ' });
    if (decision === 'returned' && !comment) return res.status(400).json({ error: 'กรุณาระบุเหตุผลที่ส่งกลับ' });
    const who = await tx(async ex => {
      const { cycleId } = await openCycle(ex);
      const r = await ex('SELECT g.status, g.title, g.cycle_id, u.username FROM goals g JOIN users u ON u.user_id = g.employee_id WHERE g.goal_id = :g', { g: id });
      if (!r.rows.length) throw fail(404, 'ไม่พบเป้าหมาย');
      if (r.rows[0].CYCLE_ID !== cycleId) throw fail(409, 'เป้าหมายนี้อยู่ในรอบที่ปิดแล้ว');
      requireOwnStaff(await evalOf(ex, cycleId, r.rows[0].USERNAME), req);
      if (r.rows[0].STATUS !== 'pending_review') throw fail(409, 'เป้าหมายนี้ไม่ได้อยู่ในสถานะรอตรวจสอบ');
      await ex('UPDATE goals SET status = :s, review_comment = :c WHERE goal_id = :g', { s: decision, c: { val: comment, type: oracledb.CLOB }, g: id });
      await audit(ex, req.uid, 'goals', id, decision === 'approved' ? 'APPROVE_GOAL' : 'RETURN_GOAL', { comment: comment.slice(0, 200) });
      return r.rows[0];
    });
    await notify(who.USERNAME, decision === 'approved' ? 'พี่เลี้ยงอนุมัติเป้าหมาย "' + who.TITLE + '"' : 'พี่เลี้ยงส่งเป้าหมาย "' + who.TITLE + '" กลับให้แก้ไข', comment, 'goals');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- ผลการประเมิน (UC-05, 06, 08, 09, 11, 14) ---------- */
app.get('/api/evaluations', requireAuth, requireStaffViewer, async (req, res, next) => {
  try { res.json(await loadEvaluations(null, viewMode(req), cycleParam(req), req.uid)); } catch (e) { next(e); }
});
app.get('/api/evaluations/:id', requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id).toLowerCase();
    const mode = viewMode(req);
    if (mode === 'employee' && req.user.id !== id) return res.status(403).json({ error: 'ไม่มีสิทธิ์ดูผลประเมินของผู้อื่น' });
    const list = await loadEvaluations(id, mode, cycleParam(req), req.uid);
    res.json({ data: list[0] || null });
  } catch (e) { next(e); }
});
// พี่เลี้ยงบันทึกร่าง (UC-08, UC-09) / ส่งผลประเมิน (UC-11) -> สถานะ pending_hr รอ HR ตรวจสอบและปรับเทียบ
app.put('/api/evaluations/:id', requireAuth, requireMentor, async (req, res, next) => {
  try {
    const id = String(req.params.id).toLowerCase();
    const data = req.body || {};
    const submit = data.status === 'submitted';
    checkScores(data.scores, false, 5);
    const scores = data.scores;
    const cc = (Array.isArray(data.cc) ? data.cc : []).slice(0, 5).map(x => String(x || '').slice(0, 2000));
    const strengths = String(data.strengths || '').slice(0, 4000), improvements = String(data.improvements || '').slice(0, 4000);
    const avg = avgOf(scores);
    const result = await tx(async ex => {
      const { cycleId, formId, criteria, settings } = await openCycle(ex);
      checkScores(scores, submit, settings.max);
      const emp = await ex("SELECT user_id FROM users WHERE username = :u AND role = 'employee' AND status = 'active'", { u: id });
      if (!emp.rows.length) throw fail(400, 'ไม่พบพนักงานที่ต้องการประเมิน');
      const ev = await evalOf(ex, cycleId, id);
      requireOwnStaff(ev, req);
      const evalId = ev.EVALUATION_ID, before = ev.STATUS;
      if (LOCKED.includes(before)) throw fail(409, 'ผลประเมินนี้ HR ยืนยันแล้ว แก้ไขไม่ได้');
      // UC-11 Exception 3: ส่งแล้วแก้ไม่ได้ จนกว่า HR จะส่งกลับ
      if (before === 'pending_hr') throw fail(409, 'ส่งผลประเมินให้ HR แล้ว แก้ไขไม่ได้ (ถ้าต้องแก้ ให้ HR ส่งกลับ)');
      // UC-08 Exception 1: ต้องรอพนักงานส่งแบบประเมินตนเองก่อน (เว้นแต่พ้นกำหนดส่งแล้ว)
      if (!(ev && ev.SELF_SUBMITTED_AT)) {
        const w = await stageWindow(ex, cycleId, 'self', emp.rows[0].USER_ID);
        if (w.state !== 'after') throw fail(409, 'พนักงานยังไม่ได้ส่งแบบประเมินตนเอง จึงยังประเมินไม่ได้' + (w.end ? ' (ส่งได้ถึง ' + thDate(w.ext && w.ext > w.end ? w.ext : w.end) + ')' : ''));
      }
      if (submit) {   // BR-EVAL-06 + ข้อมูลที่ HR กำหนดให้ต้องกรอก (UC-13)
        const rq = settings.req;
        if (rq.strengths && !strengths.trim()) throw fail(400, 'กรุณากรอก "จุดเด่นของพนักงาน" ก่อนส่ง');
        if (rq.improvements && !improvements.trim()) throw fail(400, 'กรุณากรอก "สิ่งที่ควรปรับปรุงโดยรวม" ก่อนส่ง');
        if (rq.catComment && cc.filter(x => x.trim()).length < 5) throw fail(400, 'กรุณากรอกความเห็นให้ครบทุกหมวดก่อนส่ง');
      }
      const status = submit ? 'pending_hr' : 'draft';
      await ex(`UPDATE evaluations SET form_id = :f, status = :s, strengths = :st, improvements = :im,
                       category_comments = :cc, updated_at = SYSTIMESTAMP,
                       mentor_submitted_at = CASE WHEN :sub = 1 THEN SYSTIMESTAMP ELSE NULL END
                 WHERE evaluation_id = :id`,
        { f: formId, s: status, st: { val: strengths, type: oracledb.CLOB }, im: { val: improvements, type: oracledb.CLOB },
          cc: { val: JSON.stringify(cc), type: oracledb.CLOB }, sub: submit ? 1 : 0, id: evalId });
      await saveScores(ex, evalId, 'mentor', criteria, scores);
      // คะแนนประเมินเปลี่ยน -> ล้างผลปรับเทียบเดิม ต้องตรวจสอบใหม่
      await ex("DELETE FROM evaluation_scores WHERE evaluation_id = :id AND evaluator_role = 'hr'", { id: evalId });
      await ex('DELETE FROM evaluation_results WHERE evaluation_id = :id', { id: evalId });
      await audit(ex, req.uid, 'evaluations', evalId, submit ? 'SUBMIT' : 'SAVE_DRAFT', { employee: id, before, after: status, answered: scores.filter(x => x > 0).length, average: avg });
      return { evalId, name: ev.FULL_NAME };
    });
    if (submit) await notifyHR(req.user.name + ' (พี่เลี้ยง) ส่งผลประเมินของ ' + result.name, 'คะแนนเฉลี่ย ' + (avg == null ? '-' : avg.toFixed(2)) + ' รอตรวจสอบและปรับเทียบ', 'reviews');
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
    if (hasReply && (!reply || reply.length > 1300)) return res.status(400).json({ error: 'ข้อความต้องมีความยาว 1–1300 ตัวอักษร' });
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
    if (hasAck) { await notifyHR(req.user.name + ' รับทราบผลประเมินแล้ว', '', 'table'); await notifyMentor(id, req.user.name + ' รับทราบผลประเมินแล้ว', '', 'list'); }
    if (hasReply) { await notifyHR(req.user.name + ' ส่งข้อสงสัยเกี่ยวกับผลประเมิน', reply.slice(0, 200), 'table'); await notifyMentor(id, req.user.name + ' ส่งข้อสงสัยเกี่ยวกับผลประเมิน', reply.slice(0, 200), 'list'); }
    res.json({ ok: true });
  } catch (e) { next(e); }
});
// พี่เลี้ยงลบร่างผลประเมิน (คะแนนและความเห็น) แบบประเมินตนเองของพนักงานยังอยู่ — ลบได้เฉพาะร่างที่ยังไม่ส่ง
app.delete('/api/evaluations/:id', requireAuth, requireMentor, async (req, res, next) => {
  try {
    const id = String(req.params.id).toLowerCase();
    const wasPublic = await tx(async ex => {
      const { cycleId } = await openCycle(ex);
      const ev = await evalOf(ex, cycleId, id);
      requireOwnStaff(ev, req);
      if (ev.STATUS !== 'draft') throw fail(409, 'ลบได้เฉพาะร่างที่ยังไม่ได้ส่งให้ HR');
      await ex("DELETE FROM evaluation_scores WHERE evaluation_id = :id AND evaluator_role IN ('mentor', 'hr')", { id: ev.EVALUATION_ID });
      await ex('DELETE FROM evaluation_results WHERE evaluation_id = :id', { id: ev.EVALUATION_ID });
      await ex(`UPDATE evaluations SET status = CASE WHEN self_submitted_at IS NOT NULL THEN 'pending_mentor' ELSE 'not_started' END,
                       strengths = NULL, improvements = NULL,
                       category_comments = NULL, employee_reply = NULL, replied_at = NULL, mentor_submitted_at = NULL,
                       updated_at = SYSTIMESTAMP WHERE evaluation_id = :id`, { id: ev.EVALUATION_ID });
      await audit(ex, req.uid, 'evaluations', ev.EVALUATION_ID, 'RESET', { employee: id, before: ev.STATUS, after: 'not_started' });
      return PUBLIC.includes(ev.STATUS);
    });
    if (wasPublic) await notify(id, 'ผลประเมินของคุณถูกยกเลิก', 'พี่เลี้ยงจะประเมินใหม่อีกครั้ง', 'mine');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- ตรวจสอบ ปรับเทียบ ยืนยัน และเผยแพร่ผล (UC-15, UC-16) ---------- */
// บันทึกคะแนนหลังปรับเทียบ (evaluator_role = 'hr') และข้อสรุปฉบับสุดท้าย
app.post('/api/reviews/:id/calibrate', requireAuth, requireHR, async (req, res, next) => {
  try {
    const id = String(req.params.id).toLowerCase(), b = req.body || {};
    checkScores(b.scores, false, 5);
    const summary = String(b.summary || '').trim().slice(0, 4000);
    const avg = avgOf(b.scores);
    await tx(async ex => {
      const { cycleId, criteria } = await openCycle(ex);
      const ev = await evalOf(ex, cycleId, id);
      if (!ev || ev.STATUS !== 'pending_hr') throw fail(409, 'ปรับเทียบได้เฉพาะผลที่อยู่ในสถานะรอตรวจสอบ');
      checkScores(b.scores, true, (await currentCycle(ex)).settings.max);
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
app.post('/api/reviews/:id/return', requireAuth, requireHR, async (req, res, next) => {
  try {
    const id = String(req.params.id).toLowerCase();
    const reason = String((req.body || {}).reason || '').trim();
    if (!reason || reason.length > 2000) return res.status(400).json({ error: 'กรุณาระบุเหตุผลที่ส่งกลับ (ไม่เกิน 2000 ตัวอักษร)' });
    const ev = await tx(async ex => {
      const { cycleId } = await openCycle(ex);
      const ev = await evalOf(ex, cycleId, id);
      if (!ev || ev.STATUS !== 'pending_hr') throw fail(409, 'ส่งกลับได้เฉพาะผลที่อยู่ในสถานะรอ HR ตรวจสอบ');
      await ex("UPDATE evaluations SET status = 'draft', mentor_submitted_at = NULL, updated_at = SYSTIMESTAMP WHERE evaluation_id = :id", { id: ev.EVALUATION_ID });
      await ex("DELETE FROM evaluation_scores WHERE evaluation_id = :id AND evaluator_role = 'hr'", { id: ev.EVALUATION_ID });
      await ex('DELETE FROM evaluation_results WHERE evaluation_id = :id', { id: ev.EVALUATION_ID });
      await audit(ex, req.uid, 'evaluations', ev.EVALUATION_ID, 'RETURN_TO_MENTOR', { employee: id, before: 'pending_hr', after: 'draft', reason: reason.slice(0, 500) });
      return ev;
    });
    const m = await mentorOf(id);
    if (m) await notify(m, 'HR ส่งผลประเมินของ ' + ev.FULL_NAME + ' กลับให้แก้ไข', reason.slice(0, 200), 'list');
    res.json({ ok: true });
  } catch (e) { next(e); }
});
// HR มอบหมาย/เปลี่ยนพี่เลี้ยงของพนักงานในรอบที่เปิดอยู่
app.put('/api/assignments/:id', requireAuth, requireHR, async (req, res, next) => {
  try {
    const id = String(req.params.id).toLowerCase();
    const mentor = String((req.body || {}).mentor || '').toLowerCase();
    const out = await tx(async ex => {
      const { cycleId } = await openCycle(ex);
      const ev = await evalOf(ex, cycleId, id);
      if (!ev) throw fail(404, 'ไม่พบรายการประเมินของพนักงานในรอบนี้');
      if (LOCKED.includes(ev.STATUS)) throw fail(409, 'ผลประเมินนี้ยืนยันแล้ว เปลี่ยนพี่เลี้ยงไม่ได้');
      let mid = null, mname = '';
      if (mentor) {
        const m = await ex("SELECT user_id, full_name FROM users WHERE username = :u AND role = 'mentor' AND status = 'active'", { u: mentor });
        if (!m.rows.length) throw fail(400, 'ไม่พบพี่เลี้ยง');
        mid = m.rows[0].USER_ID; mname = m.rows[0].FULL_NAME;
      }
      if (mid === ev.MENTOR_ID) return null;
      await ex('UPDATE evaluations SET mentor_id = :m, updated_at = SYSTIMESTAMP WHERE evaluation_id = :id', { m: mid, id: ev.EVALUATION_ID });
      await audit(ex, req.uid, 'evaluations', ev.EVALUATION_ID, 'ASSIGN_MENTOR', { employee: id, mentor: mentor || null });
      return { name: ev.FULL_NAME, mname };
    });
    if (out && mentor) await notify(mentor, 'คุณได้รับมอบหมายให้เป็นพี่เลี้ยงของ ' + out.name, 'ตรวจสอบเป้าหมายและประเมินผลได้ที่เมนู "ประเมินพนักงาน"', 'list');
    res.json({ ok: true });
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
    for (const u of done) {
      await notify(u, 'ผลประเมินของคุณเผยแพร่แล้ว', 'ตรวจสอบคะแนนและกดรับทราบได้ที่หน้า "ผลประเมินของฉัน"', 'mine');
      const m = await mentorOf(u).catch(() => null);
      if (m) await notify(m, 'HR เผยแพร่ผลประเมินของ ' + u + ' แล้ว', '', 'list');
    }
    res.json({ ok: true, count: done.length });
  } catch (e) { next(e); }
});

/* ---------- ประเมินตนเอง (UC-03, UC-04) และส่งกลับให้แก้ไข (UC-10) ---------- */
app.get('/api/self-evaluations', requireAuth, async (req, res, next) => {
  try {
    const role = req.user.role;
    if (role === 'evaluatee') return res.json(await loadSelf(req.user.id, cycleParam(req)));
    const list = await loadSelf(null, cycleParam(req), role === 'mentor' ? req.uid : null);
    // พี่เลี้ยง/HR/ผู้บริหาร ไม่เห็นร่างที่พนักงานยังไม่ส่ง
    res.json(list.filter(x => x.status !== 'none' || x.returnReason).map(x => x.status === 'draft' ? { ...x, scores: new Array(20).fill(0), cc: [], comment: '' } : x));
  } catch (e) { next(e); }
});
app.put('/api/self-evaluations/me', requireAuth, requireEmployee, async (req, res, next) => {
  try {
    const data = req.body || {};
    const submit = data.status === 'submitted';
    checkScores(data.scores, false, 5);
    const scores = data.scores;
    const cc = (Array.isArray(data.cc) ? data.cc : []).slice(0, 5).map(x => String(x || '').slice(0, 2000));
    const comment = String(data.comment || '').slice(0, 4000);
    const avg = avgOf(scores);
    await tx(async ex => {
      const { cycleId, formId, criteria, settings } = await openCycle(ex);
      await requireWindow(ex, cycleId, 'self', req.uid);   // BR-EVAL-03
      checkScores(scores, submit, settings.max);
      if (submit && settings.req.selfComment && !comment.trim()) throw fail(400, 'กรุณากรอก "สรุปผลงานของฉัน" ก่อนส่ง');
      if (submit && settings.req.selfCatComment && cc.filter(x => x.trim()).length < 5) throw fail(400, 'กรุณากรอกความเห็นให้ครบทุกหมวดก่อนส่ง');
      let ev = await evalOf(ex, cycleId, req.user.id), evalId, before = 'not_started';
      if (ev) {
        if (ev.SELF_SUBMITTED_AT) throw fail(409, 'ส่งแบบประเมินตนเองแล้ว แก้ไขไม่ได้ (ถ้าต้องแก้ ให้พี่เลี้ยงส่งกลับ)');
        evalId = ev.EVALUATION_ID; before = ev.STATUS;
      } else {
        const ins = await ex(`INSERT INTO evaluations (cycle_id, employee_id, form_id, status) VALUES (:c, :e, :f, 'not_started')
                              RETURNING evaluation_id INTO :rid`, { c: cycleId, e: req.uid, f: formId, rid: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } });
        evalId = ins.outBinds.rid[0];
      }
      const after = submit && ['not_started', 'returned'].includes(before) ? 'pending_mentor' : before;   // ยังไม่มีผลจากพี่เลี้ยง -> รอประเมิน
      await ex(`UPDATE evaluations SET self_comment = :cm, self_category_comments = :cc, status = :s, updated_at = SYSTIMESTAMP,
                       self_submitted_at = CASE WHEN :sub = 1 THEN SYSTIMESTAMP ELSE NULL END
                 WHERE evaluation_id = :id`,
        { cm: { val: comment, type: oracledb.CLOB }, cc: { val: JSON.stringify(cc), type: oracledb.CLOB }, s: after, sub: submit ? 1 : 0, id: evalId });
      await saveScores(ex, evalId, 'employee', criteria, scores);
      await audit(ex, req.uid, 'evaluations', evalId, submit ? 'SELF_SUBMIT' : 'SELF_SAVE_DRAFT', { before, after, answered: scores.filter(x => x > 0).length, average: avg });
    });
    if (submit) await notifyMentor(req.user.id, req.user.name + ' ส่งแบบประเมินตนเองแล้ว', 'คะแนนเฉลี่ยที่ประเมินตนเอง ' + (avg == null ? '-' : avg.toFixed(2)) + ' กดเพื่อดูรายละเอียด', 'selfs');
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.post('/api/self-evaluations/:id/return', requireAuth, requireMentor, async (req, res, next) => {
  try {
    const id = String(req.params.id).toLowerCase();
    const reason = String((req.body || {}).reason || '').trim();
    if (!reason || reason.length > 2000) return res.status(400).json({ error: 'กรุณาระบุเหตุผลที่ส่งกลับ (ไม่เกิน 2000 ตัวอักษร)' });
    await tx(async ex => {
      const { cycleId } = await openCycle(ex);
      const ev = await evalOf(ex, cycleId, id);
      requireOwnStaff(ev, req);
      if (!ev.SELF_SUBMITTED_AT) throw fail(404, 'พนักงานยังไม่ได้ส่งแบบประเมินตนเอง');
      // UC-10 Exception 2: ส่งกลับได้เฉพาะก่อนพี่เลี้ยงเริ่มประเมิน
      if (ev.STATUS !== 'pending_mentor') throw fail(409, 'คุณเริ่มประเมินพนักงานคนนี้แล้ว ส่งกลับไม่ได้ (ถ้าจำเป็น ให้ลบร่างผลประเมินก่อน)');
      await ex(`UPDATE evaluations SET self_submitted_at = NULL, updated_at = SYSTIMESTAMP, status = 'returned'
                 WHERE evaluation_id = :id`, { id: ev.EVALUATION_ID });
      await ex('INSERT INTO return_records (evaluation_id, reason) VALUES (:id, :r)', { id: ev.EVALUATION_ID, r: { val: reason, type: oracledb.CLOB } });
      await audit(ex, req.uid, 'evaluations', ev.EVALUATION_ID, 'RETURN_SELF', { employee: id, reason: reason.slice(0, 200) });
    });
    await notify(id, 'พี่เลี้ยงส่งแบบประเมินตนเองกลับให้แก้ไข', reason.slice(0, 200), 'self');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- ประวัติการเปลี่ยนแปลง (audit_logs) — UC-15 ขั้นที่ 7, NFR-AUD-01, BR-DATA-01 ---------- */
app.get('/api/audit', requireAuth, requireHR, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const username = req.query.employee ? String(req.query.employee).toLowerCase() : '';
    let where = '', binds = {};
    if (username) {
      const uid = await uidOf(username);
      if (!uid) return res.json([]);
      where = `WHERE (a.entity_type = 'evaluations' AND a.entity_id IN (SELECT evaluation_id FROM evaluations WHERE employee_id = :e))
                  OR (a.entity_type = 'goals' AND (a.actor_id = :e OR a.entity_id IN (SELECT goal_id FROM goals WHERE employee_id = :e)))
                  OR (a.entity_type IN ('deadline_extensions', 'users') AND a.entity_id = :e)`;
      binds = { e: uid };
    }
    const r = await query(`SELECT a.log_id, a.action, a.entity_type, a.entity_id, a.change_detail, TO_CHAR(a.action_at, 'YYYY-MM-DD HH24:MI') AS at_txt,
                                  u.full_name AS actor, u.username AS actor_u
                             FROM audit_logs a LEFT JOIN users u ON u.user_id = a.actor_id ${where}
                            ORDER BY a.log_id DESC FETCH FIRST ${limit} ROWS ONLY`, binds);
    res.json(r.rows.map(x => {
      let d = x.CHANGE_DETAIL || '';
      try { d = JSON.parse(d); } catch (_) {}
      return { id: x.LOG_ID, action: x.ACTION, entity: x.ENTITY_TYPE, entityId: x.ENTITY_ID, detail: d, at: x.AT_TXT, actor: x.ACTOR || '', actorId: x.ACTOR_U || '' };
    }));
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
    const role = req.user.role, all = role === 'evaluator' || role === 'executive', men = role === 'mentor';
    let cycleId = -1;
    try { cycleId = (await currentCycle(query, cycleParam(req))).cycleId; } catch (_) {}
    const r = await query(
      `SELECT u.username, u.full_name, u.role, u.position_name, u.emp_code, d.department_name, u.phone, u.email,
              TO_CHAR(u.start_date, 'YYYY-MM-DD') AS start_txt, m.username AS mentor_u
         FROM users u LEFT JOIN departments d ON d.department_id = u.department_id
         LEFT JOIN evaluations e ON e.employee_id = u.user_id AND e.cycle_id = :c
         LEFT JOIN users m ON m.user_id = e.mentor_id
        WHERE u.status = 'active'` + (all ? '' : men ? ' AND (u.user_id = :id OR e.mentor_id = :id)' : ' AND u.user_id = :id') +
      ' ORDER BY u.emp_code, u.username', all ? { c: cycleId } : { c: cycleId, id: req.uid });
    res.json(r.rows.map(row => ({
      id: row.USERNAME, name: row.FULL_NAME, role: ROLE_OUT[row.ROLE] || row.ROLE, position: row.POSITION_NAME,
      code: row.EMP_CODE, department: row.DEPARTMENT_NAME, phone: row.PHONE, email: row.EMAIL, startDate: row.START_TXT, mentor: row.MENTOR_U || ''
    })));
  } catch (e) { next(e); }
});

/* ---------- ตารางเวลางาน (work_schedules) ---------- */
app.get('/api/schedules', requireAuth, async (req, res, next) => {
  try {
    const role = req.user.role, all = role === 'evaluator', men = role === 'mentor';
    const r = await query('SELECT u.username, s.day_no, s.shift_code FROM work_schedules s JOIN users u ON u.user_id = s.user_id' +
      (all ? '' : men ? " WHERE s.user_id = :id OR s.user_id IN (SELECT e.employee_id FROM evaluations e JOIN evaluation_cycles c ON c.cycle_id = e.cycle_id WHERE c.status = 'open' AND e.mentor_id = :id)" : ' WHERE s.user_id = :id') +
      ' ORDER BY u.username, s.day_no', all ? {} : { id: req.uid });
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

const DEMO_ROLES = [
  { u: 'mentor01', n: 'สมศักดิ์ ดูแลดี', r: 'mentor', d: 'ฝ่ายขาย', p: 'หัวหน้าฝ่ายขาย (พี่เลี้ยง)', c: 'EMP101', ph: '081-000-0101', since: '2014-03-01',
    deps: ['ฝ่ายขาย', 'บัญชี', 'การตลาด', 'บริการลูกค้า', 'บริหาร'] },
  { u: 'mentor02', n: 'มาลี ใส่ใจ', r: 'mentor', d: 'ซ่อมบำรุง', p: 'หัวหน้าฝ่ายปฏิบัติการ (พี่เลี้ยง)', c: 'EMP102', ph: '081-000-0102', since: '2013-08-15',
    deps: ['ซ่อมบำรุง', 'คลังสินค้า', 'ไอที', 'ขนส่ง', 'ฝ่ายบุคคล'] },
  { u: 'exec01', n: 'คุณประเสริฐ วงศ์ใหญ่', r: 'executive', d: 'บริหาร', p: 'ผู้อำนวยการ', c: 'EMP900', ph: '081-000-0900', since: '2010-01-04', deps: [] }
];
async function ensureRoleAccounts() {
  const has = await query("SELECT COUNT(*) AS n FROM users WHERE role IN ('mentor', 'executive')");
  if (Number(has.rows[0].N) > 0) return;
  for (const x of DEMO_ROLES) {
    const ex0 = await query('SELECT 1 AS x FROM users WHERE username = :u', { u: x.u });
    if (ex0.rows.length) continue;
    await query(`INSERT INTO users (username, password_hash, full_name, role, department_id, position_name, emp_code, phone, email, start_date)
                 SELECT :u, :h, :n, :r, (SELECT MIN(department_id) FROM departments WHERE department_name = :d), :p, :c, :ph, :em, TO_DATE(:s, 'YYYY-MM-DD') FROM DUAL`,
      { u: x.u, h: pinHash(x.u, '1234'), n: x.n, r: x.r, d: x.d, p: x.p, c: x.c, ph: x.ph, em: x.u + '@example.com', s: x.since });
  }
  // มอบหมายพี่เลี้ยงให้รายการประเมินของรอบที่เปิดอยู่ที่ยังไม่มีพี่เลี้ยง (หรือเดิม HR ประเมินแทน)
  for (const x of DEMO_ROLES.filter(y => y.deps.length)) {
    for (const d of x.deps) {
      await query(`UPDATE evaluations SET mentor_id = (SELECT user_id FROM users WHERE username = :m)
                    WHERE cycle_id IN (SELECT cycle_id FROM evaluation_cycles WHERE status = 'open')
                      AND (mentor_id IS NULL OR mentor_id IN (SELECT user_id FROM users WHERE role <> 'mentor'))
                      AND employee_id IN (SELECT u.user_id FROM users u JOIN departments dd ON dd.department_id = u.department_id WHERE dd.department_name = :d)`,
        { m: x.u, d });
    }
  }
  console.log('เพิ่มบัญชีพี่เลี้ยง (mentor01, mentor02) และผู้บริหาร (exec01) แล้ว PIN 1234');
}

app.use((err, _req, res, _next) => {
  if (err && err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' : (err.message || 'Server error') });
});
(async () => {
  try {
    pool = await oracledb.createPool({ user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectString: process.env.DB_CONNECT_STRING, poolMin: 1, poolMax: 8, poolIncrement: 1 });
    // ปรับฐานข้อมูลรุ่นก่อนให้อัตโนมัติ (ถ้ามีอยู่แล้วจะข้ามไป) ไม่ต้องรัน SQL ใหม่
    const MIGRATIONS = [
      'ALTER TABLE evaluations ADD self_comment CLOB',
      'ALTER TABLE evaluations ADD self_category_comments CLOB',
      'ALTER TABLE cycle_stages ADD stage_key VARCHAR2(20 CHAR)',
      'ALTER TABLE evaluation_cycles ADD min_goals NUMBER(2) DEFAULT 1',
      'ALTER TABLE evaluation_forms ADD settings CLOB',
      `CREATE TABLE deadline_extensions (
         ext_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
         cycle_id NUMBER NOT NULL REFERENCES evaluation_cycles(cycle_id),
         employee_id NUMBER NOT NULL REFERENCES users(user_id),
         stage_key VARCHAR2(20 CHAR) NOT NULL, until_date DATE NOT NULL, reason VARCHAR2(500 CHAR),
         granted_by NUMBER REFERENCES users(user_id), granted_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
         CONSTRAINT uq_deadline_ext UNIQUE (cycle_id, employee_id, stage_key))`
    ];
    for (const sql of MIGRATIONS) {
      try { await query(sql); console.log('migrated:', sql.split('(')[0].replace(/\s+/g, ' ').slice(0, 70)); }
      catch (e) { if (!/ORA-01430|ORA-00955|duplicate column|already exists/i.test(e.message)) console.error('migration failed:', e.message); }
    }
    // ขั้นตอนเดิมที่ยังไม่มีประเภท: เดาจากชื่อขั้นตอน
    try {
      await query(`UPDATE cycle_stages SET stage_key = CASE
                     WHEN stage_name LIKE '%เป้าหมาย%' THEN 'goal' WHEN stage_name LIKE '%ตนเอง%' THEN 'self'
                     WHEN stage_name LIKE '%ปรับเทียบ%' OR stage_name LIKE '%ยืนยัน%' OR stage_name LIKE '%เผยแพร่%' THEN 'review'
                     WHEN stage_name LIKE '%ประเมิน%' THEN 'evaluate' END
                   WHERE stage_key IS NULL`);
    } catch (e) { console.error('stage_key backfill:', e.message); }
    // ฐานข้อมูลรุ่นก่อน (มีแค่ HR + พนักงาน): เพิ่มบัญชีพี่เลี้ยง/ผู้บริหารตัวอย่าง และมอบหมายพี่เลี้ยงตามแผนก
    try { await ensureRoleAccounts(); } catch (e) { console.error('ensure roles:', e.message); }
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
