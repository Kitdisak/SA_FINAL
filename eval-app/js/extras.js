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

  A.startExtras = function () {
    lastNoti = ""; lastSched = "";
    S.notis = []; S.schedules = {}; S.employees = {};
    loadEmployees();
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
