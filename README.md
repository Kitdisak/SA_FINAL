# ระบบประเมินพนักงาน (Employee Evaluation System)

เว็บแอปประเมินผลการปฏิบัติงาน: หน้าบ้าน HTML/CSS/JavaScript, หลังบ้าน Node.js + Express, ฐานข้อมูล Oracle Database (13 ตารางตามเอกสาร + work_schedules + deadline_extensions)

## บทบาทผู้ใช้

| บทบาท | Use Case | เมนูหลัก |
|---|---|---|
| **พนักงาน** (`employee`) | UC-01 ถึง UC-06 | รอบการประเมิน, เป้าหมายของฉัน, ประเมินตนเอง, ผลประเมินของฉัน (รับทราบ / ส่งข้อสงสัย) |
| **HR** (`hr`) | UC-07 ถึง UC-18 | รอบการประเมิน (ช่วงเวลา + ขยายเวลารายบุคคล), เกณฑ์และแบบประเมิน (ระดับคะแนน + ข้อมูลที่ต้องกรอก), ตรวจสอบเป้าหมาย, แบบประเมินตนเอง (ส่งกลับแก้ไข), ประเมินพนักงาน, ตรวจสอบและยืนยันผล (ปรับเทียบ / ยืนยัน / เผยแพร่), ติดตามสถานะ (รายการล่าช้า), รายงานสรุปผล, ประวัติการเปลี่ยนแปลง |

ขั้นตอนการประเมิน (evaluations.status):
`not_started` → พนักงานส่งประเมินตนเอง `pending_mentor` (HR ส่งกลับ = `returned`) → HR ประเมิน `draft` / ส่ง `pending_hr` → HR ปรับเทียบและยืนยัน `confirmed` → เผยแพร่ `published` → พนักงานรับทราบ `acknowledged`

## ไฟล์สำคัญ

- `index.html`, `css/`, `js/` — หน้าบ้าน (หน้าจอแยกไฟล์ใน `js/views/`)
- `server/server.js` — หลังบ้าน REST API
- `server/.env` — ค่าการเชื่อมต่อฐานข้อมูล (**ห้ามอัปขึ้น Git / ห้ามส่งให้คนอื่น**) ดูตัวอย่างที่ `server/.env.example`
- `sql/00_create_user_as_admin.sql` — สร้างบัญชีฐานข้อมูล EVAL_APP (รันด้วย SYSTEM ครั้งเดียว)
- `sql/03_document_schema.sql` — สร้าง 13 ตาราง + ตารางเสริม 2 ตาราง + ข้อมูลตั้งต้น (รันด้วย EVAL_APP, รันซ้ำได้ จะล้างข้อมูลเดิม) ช่วงเวลาของรอบตัวอย่างคำนวณจากวันที่รันไฟล์ จึงทดลองส่งเป้าหมาย/ประเมินตนเองได้ทันที
- `sql/01_schema_and_seed.sql`, `sql/02_add_features.sql` — โครงสร้างรุ่นเก่า **ไม่ต้องใช้แล้ว**

## วิธีติดตั้ง

**เครื่อง Windows (Oracle XE, service XEPDB1)**
1. SQL Developer → connection ของ EVAL_APP → เปิด `sql/03_document_schema.sql` → กด **F5**
2. ตรวจ `server/.env`: `DB_CONNECT_STRING=localhost:1521/XEPDB1`
3. Terminal: `cd server` → `npm.cmd install` (ครั้งแรก) → `npm.cmd start`
4. เปิด http://localhost:3000 แล้วกด Ctrl+F5

**GitHub Codespace (Oracle Free ใน Docker, service FREEPDB1)**
1. `docker start oracle` แล้วรอจน `docker logs oracle` ขึ้น `DATABASE IS READY TO USE!`
2. `docker exec -i -e NLS_LANG=AMERICAN_AMERICA.AL32UTF8 oracle sqlplus -s EVAL_APP/<รหัสผ่าน>@localhost/FREEPDB1 < sql/03_document_schema.sql`
3. ตรวจ `server/.env`: `DB_CONNECT_STRING=localhost:1521/FREEPDB1`
4. `cd server` → `npm install` → `npm start` แล้วเปิดพอร์ต 3000 จากแท็บ Ports

## บัญชีทดลอง (PIN เริ่มต้น `1234`)

| ชื่อผู้ใช้ | บทบาท |
|---|---|
| `hr01` | HR |
| `nida`, `somchai`, `anan`, `kanya`, `prasit`, `wanpen`, `thanawat`, `suda`, `chaiwat`, `pimchanok`, `kittisak` | พนักงาน |

## กติกาที่ระบบบังคับ (Business Rules)

- **BR-EVAL-03 / BR-EVAL-07** พนักงานส่งเป้าหมายและแบบประเมินตนเองได้เฉพาะในช่วงเวลาของขั้นตอนนั้น พ้นกำหนดแล้วส่งไม่ได้ เว้นแต่ HR อนุมัติขยายเวลารายบุคคล
- **BR-EVAL-02** ต้องมีเป้าหมายอย่างน้อยตามจำนวนที่ HR กำหนด และทุกข้อต้องมีรายละเอียด/ตัวชี้วัด
- **BR-EVAL-06** ต้องให้คะแนนครบ 20 ข้อ และกรอกช่องที่ HR ตั้งให้บังคับ ก่อนส่ง
- **UC-08** HR ประเมินได้เมื่อพนักงานส่งแบบประเมินตนเองแล้ว / **UC-10** ส่งกลับได้เฉพาะก่อน HR เริ่มประเมิน
- **BR-HR-03** เปลี่ยนจำนวนระดับคะแนนไม่ได้เมื่อมีการให้คะแนนแล้ว / ข้อมูลรอบเก่าดูย้อนหลังได้ทุกหน้า
- **UC-12** ช่วงวันที่ของรอบห้ามทับกัน และชื่อรอบห้ามซ้ำ

## ความปลอดภัย

- PIN เก็บเป็นค่าแฮช SHA-256 ของ `ชื่อผู้ใช้:PIN` ไม่เก็บรหัสจริง
- Backend ตรวจสิทธิ์ทุกคำขอ: HR จัดการได้ทุกส่วน, พนักงานเห็นและแก้ไขเฉพาะข้อมูลของตนเอง และเห็นผลประเมินเมื่อ HR เผยแพร่แล้วเท่านั้น
- ทุกการเปลี่ยนแปลงสำคัญบันทึกลง `audit_logs`
