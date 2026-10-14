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
    filters: {}           // ตัวกรองแต่ละหน้า view -> {q, dep, pos, st}
  };
  A.views = {};           // login/list/form/mine ลงทะเบียนที่นี่
})(window.App);
