// เครื่องมือฐานข้อมูลแบบไม่ต้องใช้ SQL Developer หรือ docker exec
//   npm run db:check   ตรวจว่าเชื่อม Oracle ได้ และมีตารางครบหรือยัง
//   npm run db:reset   รัน sql/03_document_schema.sql ใหม่ (ลบข้อมูลเดิมทั้งหมด แล้วสร้างข้อมูลทดลองใหม่)
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const oracledb = require('oracledb');

const SQL_FILE = path.join(__dirname, '..', 'sql', '03_document_schema.sql');
const TABLES = ['USERS', 'DEPARTMENTS', 'NOTIFICATIONS', 'AUDIT_LOGS', 'EVALUATION_CYCLES', 'CYCLE_STAGES', 'EVALUATION_FORMS',
  'CRITERIA', 'GOALS', 'EVALUATIONS', 'EVALUATION_SCORES', 'RETURN_RECORDS', 'EVALUATION_RESULTS', 'WORK_SCHEDULES', 'DEADLINE_EXTENSIONS'];

// แยกไฟล์ SQL เป็นคำสั่งทีละคำสั่ง (รองรับบล็อก PL/SQL ที่ปิดด้วย / และข้ามคอมเมนต์ --)
function splitSql(text) {
  const out = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let buf = '', inBlock = false;
  for (const raw of lines) {
    if (inBlock) {
      if (raw.trim() === '/') { out.push(buf.trim()); buf = ''; inBlock = false; } else buf += raw + '\n';
      continue;
    }
    if (!buf.trim() && /^\s*(BEGIN|DECLARE)\b/i.test(raw)) { inBlock = true; buf = raw + '\n'; continue; }
    // ตัดคอมเมนต์ -- ที่ไม่ได้อยู่ในเครื่องหมาย '
    let line = '', q = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === "'") q = !q;
      if (!q && ch === '-' && raw[i + 1] === '-') break;
      line += ch;
    }
    buf += line + '\n';
    // แยกคำสั่งที่ ; นอกเครื่องหมาย '
    let start = 0; q = false;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === "'") q = !q;
      else if (buf[i] === ';' && !q) { const s = buf.slice(start, i).trim(); if (s) out.push(s); start = i + 1; }
    }
    buf = buf.slice(start);
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(s => !/^COMMIT$/i.test(s));
}

async function connect() {
  try {
    return await oracledb.getConnection({ user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectString: process.env.DB_CONNECT_STRING });
  } catch (e) {
    console.error('เชื่อมต่อ Oracle ไม่ได้ (' + process.env.DB_CONNECT_STRING + '): ' + e.message);
    console.error('ถ้าเพิ่งเปิด Codespace ให้รอ 2-5 นาทีให้ Oracle เริ่มทำงาน แล้วลองใหม่');
    process.exit(1);
  }
}

async function check(conn) {
  const r = await conn.execute('SELECT table_name FROM user_tables', [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const have = new Set(r.rows.map(x => x.TABLE_NAME));
  const missing = TABLES.filter(t => !have.has(t));
  console.log('เชื่อมต่อ ' + process.env.DB_CONNECT_STRING + ' ด้วยบัญชี ' + process.env.DB_USER + ' สำเร็จ');
  if (missing.length) { console.log('ยังไม่มีตาราง: ' + missing.join(', ') + '\n-> พิมพ์ npm run db:reset เพื่อสร้าง'); return false; }
  const c = await conn.execute(`SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM departments) d, (SELECT COUNT(*) FROM criteria) c,
                                       (SELECT COUNT(*) FROM evaluations) e, (SELECT COUNT(*) FROM work_schedules) w FROM DUAL`);
  const [u, d, cr, ev, w] = c.rows[0];
  console.log('ตารางครบ ' + TABLES.length + ' ตาราง | users ' + u + ', departments ' + d + ', criteria ' + cr + ', evaluations ' + ev + ', work_schedules ' + w);
  return true;
}

(async () => {
  const cmd = process.argv[2];
  const conn = await connect();
  try {
    if (cmd === 'reset') {
      const stmts = splitSql(fs.readFileSync(SQL_FILE, 'utf8'));
      console.log('รัน ' + path.basename(SQL_FILE) + ' (' + stmts.length + ' คำสั่ง) ...');
      let n = 0;
      for (const s of stmts) {
        if (/^SELECT/i.test(s)) continue;            // คำสั่งตรวจผลท้ายไฟล์ ใช้ db:check แทน
        try { await conn.execute(s); n++; }
        catch (e) { console.error('\nผิดพลาดที่คำสั่ง:\n' + s.slice(0, 300) + '\n-> ' + e.message); throw e; }
      }
      await conn.commit();
      console.log('สำเร็จ ' + n + ' คำสั่ง');
      await check(conn);
      console.log('ถ้าเซิร์ฟเวอร์รันอยู่ ให้กด Ctrl+C แล้ว npm start ใหม่ (ผู้ใช้ต้องเข้าสู่ระบบใหม่)');
    } else {
      await check(conn);
    }
  } catch (e) {
    process.exitCode = 1;
  } finally {
    await conn.close();
  }
})();
