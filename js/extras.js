/* ข้อมูลเสริม: แจ้งเตือน, ประวัติพนักงาน, ตารางเวลางาน (โหลดหลังล็อกอิน) */
(function (A) {
  var S = A.S;

  // วันนี้เป็น DAY_NO อะไร (1=จันทร์ ... 7=อาทิตย์)
  A.todayNo = function () { var d = new Date().getDay(); return d === 0 ? 7 : d; };
  A.unread = function () { return S.notis.filter(function (n) { return !n.read; }).length; };

  // "YYYY-MM-DD HH:MI" จาก Oracle -> ข้อความไทย
  A.fdatetime = function (txt) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/.exec(txt || ""); if (!m) return "";
    var d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    var s = d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
    return m[4] ? s + " " + m[4] + ":" + m[5] + " น." : s;
  };
  // อายุงานจากวันเริ่มงาน
  A.tenure = function (txt) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(txt || ""); if (!m) return "";
    var now = new Date(), months = (now.getFullYear() - +m[1]) * 12 + (now.getMonth() + 1 - +m[2]);
    if (now.getDate() < +m[3]) months--;
    if (months < 0) return "";
    var y = Math.floor(months / 12), mo = months % 12;
    return (y ? y + " ปี " : "") + (mo ? mo + " เดือน" : (y ? "" : "น้อยกว่า 1 เดือน"));
  };

  function poll(fn, ms) {
    fn(); var t = setInterval(fn, ms);
    S.unsubs.push(function () { clearInterval(t); });
  }

  var lastNoti = "", lastSched = "";
  async function loadNotis() {
    try {
      var list = await A.api("/notifications"), sig = JSON.stringify(list);
      if (sig !== lastNoti) { lastNoti = sig; S.notis = list; A.softRender(); }
    } catch (e) { /* ยังไม่ได้รัน 02_add_features.sql หรือเซิร์ฟเวอร์หยุด: เงียบไว้ */ }
  }
  async function loadSchedules() {
    try {
      var rows = await A.api("/schedules"), sig = JSON.stringify(rows);
      if (sig === lastSched) return; lastSched = sig;
      var map = {};
      rows.forEach(function (r) { (map[r.userId] = map[r.userId] || {})[r.day] = r.shift; });
      S.schedules = map; A.softRender();
    } catch (e) {}
  }
  async function loadEmployees() {
    try {
      var list = await A.api("/employees"), map = {};
      list.forEach(function (x) { map[x.id] = x; });
      S.employees = map; A.softRender();
    } catch (e) {}
  }

  var lastSelf = "";
  A.loadSelfs = async function (force) {
    try {
      var list = await A.api("/self-evaluations" + A.cq()), sig = JSON.stringify(list);
      if (!force && sig === lastSelf && S.selfsLoaded) return; lastSelf = sig;
      var map = {};
      list.forEach(function (x) { map[x.id] = x; });
      S.selfs = map; S.selfsLoaded = true;
      if (!force) A.softRender();
    } catch (e) { S.selfsLoaded = true; }
  };

  /* ---------- รอบที่กำลังดู (ดูย้อนหลังได้: UC-05, UC-14, UC-17) ---------- */
  A.cq = function (path) { return S.viewCycle ? ((path || "").indexOf("?") >= 0 ? "&" : "?") + "cycle=" + S.viewCycle : ""; };
  A.loadCycleList = async function () { try { S.cycleList = await A.api("/cycle-list"); A.softRender(); } catch (e) {} };
  A.switchCycle = function (id) {
    var cur = (S.cycleList || []).find(function (c) { return c.status === "open"; });
    S.viewCycle = !id || (cur && +id === cur.id) ? null : +id;
    var v = S.view;
    if (["form", "calib", "selfview", "profile"].indexOf(v) >= 0) v = "home";
    A.enter(S.me.id); S.view = v; A.render(); window.scrollTo(0, 0);
  };
  A.cyclePicker = function () {
    var L = S.cycleList || [], esc = A.esc;
    if (L.length < 2 || !S.cycle) return "";
    return '<label class="cyc-pick"><span>รอบการประเมิน</span><select data-cyclesel aria-label="เลือกรอบการประเมิน">' + L.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === S.cycle.id ? " selected" : "") + '>' + esc(c.name) + (c.status === "open" ? " (ปัจจุบัน)" : " (ปิดแล้ว)") + '</option>';
    }).join("") + '</select></label>';
  };
  // รอบการประเมิน (UC-01) -> ชื่อรอบบนทุกหน้า
  A.loadCycle = async function () {
    try { S.cycle = await A.api("/cycle" + A.cq()); if (S.cycle) A.PERIOD = S.cycle.name; A.softRender(); } catch (e) {}
  };

  /* ---------- กำหนดเวลาแต่ละขั้นตอน (BR-EVAL-03, BR-EVAL-07) ---------- */
  A.STAGE_KEYS = [["goal", "กำหนดเป้าหมาย"], ["self", "ประเมินตนเอง"], ["evaluate", "HR ประเมินผล"], ["review", "ตรวจสอบ ปรับเทียบ เผยแพร่"]];
  A.fday = function (t) { return A.fdatetime(t); };
  A.addDays = function (t, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t || ""); if (!m) return t;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
    return d.toISOString().slice(0, 10);
  };
  A.today = function () {
    if (S.cycle && S.cycle.today) return S.cycle.today;
    var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  };
  function dayDiff(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }
  A.stageOf = function (key) { return S.cycle && (S.cycle.stages || []).find(function (s) { return s.key === key; }); };
  A.extOf = function (uid, key) { return S.cycle && (S.cycle.extensions || []).find(function (x) { return x.userId === uid && x.stage === key; }); };
  A.win = function (key, uid) {
    var st = A.stageOf(key); if (!st) return { state: S.cycle && S.cycle.status !== "open" ? "closed" : "open" };
    var x = A.extOf(uid || (S.me && S.me.id), key), t = A.today();
    var until = x && x.until > st.end ? x.until : st.end;
    var state = S.cycle.status !== "open" ? "closed" : t < st.start ? "before" : t > until ? "after" : "open";
    return { state: state, stage: st, ext: x, until: until, left: dayDiff(t, until) };
  };
  // ข้อความกำหนดเวลาสำหรับพนักงาน
  A.deadlineNote = function (key) {
    var w = A.win(key), esc = A.esc;
    if (!w.stage) return "";
    var ext = w.ext ? ' · <b>HR อนุมัติให้ส่งได้ถึง ' + A.fday(w.ext.until) + '</b>' : "";
    if (w.state === "closed") return '<p class="note warn">รอบการประเมินนี้ปิดแล้ว ดูข้อมูลได้อย่างเดียว</p>';
    if (w.state === "before") return '<p class="note warn">ยังไม่ถึงช่วง "' + esc(w.stage.name) + '" (เริ่ม ' + A.fday(w.stage.start) + ')</p>';
    if (w.state === "after") return '<p class="note late">พ้นกำหนดช่วง "' + esc(w.stage.name) + '" แล้ว (สิ้นสุด ' + A.fday(w.until) + ') กรุณาติดต่อ HR เพื่อขออนุมัติขยายเวลา</p>';
    return '<p class="deadline' + (w.left <= 3 ? " soon" : "") + '">กำหนดส่ง: <b>' + A.fday(w.until) + '</b> (' + (w.left > 0 ? "เหลืออีก " + w.left + " วัน" : "วันนี้วันสุดท้าย") + ')' + ext + '</p>';
  };
  // HR: รายการที่ล่าช้าของพนักงาน 1 คน (UC-14 ขั้นที่ 6)
  A.lateOf = function (k) {
    if (!S.cycle || S.cycle.status !== "open") return [];
    var out = [], ev = S.evals[k];
    if (A.win("goal", k).state === "after" && !(S.goals || []).some(function (g) { return g.userId === k; })) out.push({ key: "goal", label: "ยังไม่ส่งเป้าหมาย" });
    if (A.win("self", k).state === "after" && !(A.selfDone && A.selfDone(k))) out.push({ key: "self", label: "ยังไม่ส่งประเมินตนเอง" });
    if (A.win("evaluate", k).state === "after" && !(ev && ev.status === "submitted")) out.push({ key: "evaluate", label: "HR ยังไม่ประเมิน" });
    if (A.win("review", k).state === "after" && ev && ev.status === "submitted" && ["published", "acknowledged"].indexOf(ev.dbStatus) < 0) out.push({ key: "review", label: "ยังไม่เผยแพร่ผล" });
    return out;
  };
  // UC-08 Exception 1: ประเมินได้เมื่อพนักงานส่งแบบประเมินตนเองแล้ว หรือพ้นกำหนดส่งแล้ว
  A.canEvaluate = function (k) { return (A.selfDone && A.selfDone(k)) || A.win("self", k).state === "after"; };
  // แบบประเมินจากฐานข้อมูล (UC-13) -> สร้าง A.CATS ใหม่ 5 หมวด x 4 ข้อ
  A.loadForm = async function () {
    try {
      var f = await A.api("/form" + A.cq()); S.form = f;
      if (f && f.settings) {   // ระดับคะแนนและข้อมูลที่ต้องกรอก (UC-13)
        A.MAX = f.settings.max;
        A.SCALE = f.settings.labels.map(function (l, i) { return [String(i + 1), l]; });
        A.REQ = f.settings.req || {};
      }
      if (f && f.criteria && f.criteria.length === A.N) {
        A.CATS = [0, 1, 2, 3, 4].map(function (ci) {
          var part = f.criteria.slice(ci * A.PER, ci * A.PER + A.PER);
          return { name: part[0].category || ("หมวดที่ " + (ci + 1)), items: part.map(function (c) { return c.title; }) };
        });
      }
      A.softRender();
    } catch (e) {}
  };
  A.reloadAll = async function () {
    await Promise.all([A.loadCycle(), A.loadForm(), A.loadSelfs(true), A.loadGoals(), A.loadCycleList()]);
  };

  A.startExtras = function () {
    lastNoti = ""; lastSched = ""; lastSelf = "";
    S.notis = []; S.schedules = {}; S.employees = {}; S.selfs = {}; S.selfsLoaded = false; S.selfDraft = null; S.selfMsg = "";
    loadEmployees();
    poll(A.loadSelfs, 5000);
    S.cycle = null; S.cycles = null; S.cycleEdit = null; S.form = null; S.goals = []; S.goalEdit = null; A._lastGoals = "";
    poll(A.loadGoals, 5000);
    poll(A.loadCycle, 30000);
    A.loadForm(); A.loadCycleList();
    poll(loadNotis, 5000);
    poll(loadSchedules, 15000);
  };

  A.markRead = async function (id) {
    S.notis.forEach(function (n) { if (id == null || n.id === id) n.read = true; });
    A.render();
    try { await A.api("/notifications/read", { method: "POST", body: JSON.stringify(id == null ? {} : { id: id }) }); } catch (e) {}
  };

  // ลบผลประเมิน (มีหน้าต่างยืนยัน)
  A.deleteEval = async function (id) {
    var name = (S.accounts[id] || {}).name || id;
    if (!window.confirm("ลบผลประเมินของ " + name + " ?\n\nคะแนน ความเห็น และข้อความตอบกลับจะถูกลบถาวร กู้คืนไม่ได้")) return;
    try {
      await A.api("/evaluations/" + encodeURIComponent(id), { method: "DELETE" });
      delete S.evals[id];
      S.flash = "ลบผลประเมินของ " + name + " แล้ว";
      if (S.view === "form") { S.view = S.backView || "list"; S.target = null; S.draft = null; }
    } catch (e) {
      S.flash = "ลบไม่สำเร็จ: " + (e.message || "ลองใหม่อีกครั้ง");
    }
    A.render(); window.scrollTo(0, 0);
  };

  A.saveShift = async function (userId, day, code) {
    var row = S.schedules[userId] = S.schedules[userId] || {};
    var before = row[day];
    row[day] = code;
    try {
      await A.api("/schedules/" + encodeURIComponent(userId) + "/" + day, { method: "PUT", body: JSON.stringify({ shift: code }) });
      S.flash = "บันทึกตารางงานของ " + ((S.accounts[userId] || {}).name || userId) + " แล้ว";
    } catch (e) {
      row[day] = before;
      S.flash = "บันทึกตารางงานไม่สำเร็จ: " + (e.message || "ลองใหม่อีกครั้ง");
    }
    A.render();
  };
})(window.App);
