/* สถานะกลางของแอป (ทุกไฟล์อ่าน/เขียนผ่าน App.S) */
(function (A) {
  A.S = {
    db: null,
    dbState: "loading",   // loading | ready | none
    accounts: {},         // id -> {name, role, position, pinHash}
    evals: {},            // id พนักงาน -> ใบประเมิน
    me: null,             // ผู้ใช้ที่ล็อกอิน {id, name, role}
    view: "login",        // login | home | list | table | form | mine
    backView: "list",     // หน้าที่จะกลับไปหลังปิดฟอร์ม
    navOpen: false,       // เมนูซ้ายบนมือถือเปิดอยู่ไหม
    target: null,         // id พนักงานที่กำลังประเมิน
    draft: null,          // ร่างฟอร์ม {scores[], cc[], strengths, improvements}
    flash: "",
    loginErr: "",
    formMsg: "",
    busy: false,
    replyDraft: "",
    unsubs: [],
    notis: [],            // แจ้งเตือนของผู้ใช้ที่ล็อกอิน
    employees: {},        // id -> ข้อมูลประวัติ {code, department, phone, email, startDate}
    schedules: {},        // id -> {1:"M", ... 7:"OFF"}
    profileId: null,      // พนักงานที่เปิดดูประวัติ
    selfs: {},            // id พนักงาน -> แบบประเมินตนเอง {scores, cc, comment, status, submittedAt, returnReason}
    selfsLoaded: false,
    selfDraft: null,      // ร่างแบบประเมินตนเองที่กำลังกรอก
    selfMsg: "",
    cycle: null,          // รอบการประเมินปัจจุบัน {id, name, status, start, end, stages[]}
    cycles: null,         // ทุกรอบ (HR)
    cycleEdit: null,      // ฟอร์มสร้าง/แก้รอบ
    form: null,           // แบบประเมิน + เกณฑ์ 20 ข้อ
    goals: [],            // เป้าหมาย (พนักงาน: ของตนเอง / HR: ที่ส่งตรวจแล้ว)
    goalEdit: null,       // id เป้าหมายที่กำลังแก้ หรือ "new"
    calibId: null,        // พนักงานที่กำลังปรับเทียบผล
    filters: {}           // ตัวกรองแต่ละหน้า view -> {q, dep, pos, st}
  };
  A.views = {};           // login/list/form/mine ลงทะเบียนที่นี่
})(window.App);
