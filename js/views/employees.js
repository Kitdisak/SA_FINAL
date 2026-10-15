/* ประวัติพนักงาน: รายชื่อ (หัวหน้า) และหน้าประวัติรายคน */
(function (A) {
  function info(k, v) {
    return '<div class="kv"><span class="muted small">' + k + '</span><span>' + (v || '<span class="muted">–</span>') + '</span></div>';
  }
  function avatar(name) {
    return A.esc(String(name || "?").replace(/^คุณ/, "").trim().charAt(0));
  }

  A.views.employees = function () {
    var S = A.S, esc = A.esc;
    var ids = Object.keys(S.accounts)
      .filter(function (k) { return S.accounts[k].role === "evaluatee"; })
      .sort(function (a, b) {
        var ea = (S.employees[a] || {}).code || "~", eb = (S.employees[b] || {}).code || "~";
        return ea.localeCompare(eb) || S.accounts[a].name.localeCompare(S.accounts[b].name, "th");
      });

    var rows = ids.map(function (k) {
      var a = S.accounts[k], e = S.employees[k] || {}, ev = S.evals[k];
      var st = !ev ? '<span class="pill">ยังไม่ประเมิน</span>' : ev.status === "submitted" ? '<span class="pill done">ส่งผลแล้ว</span>' : '<span class="pill draft">ร่าง</span>';
      return '<tr' + A.rowAttrs("employees", k) + '>' +
        '<td class="n">' + esc(e.code || "–") + '</td>' +
        '<td><div class="who-cell"><span class="avatar sm">' + avatar(a.name) + '</span><b>' + esc(a.name) + '</b></div></td>' +
        '<td>' + esc(a.position || "") + '</td><td>' + esc(e.department || "–") + '</td>' +
        '<td>' + (e.startDate ? A.fdatetime(e.startDate) : "–") + '</td><td>' + st + '</td>' +
        '<td><button class="btn sm" data-act="profile" data-id="' + esc(k) + '">ดูประวัติ</button></td></tr>';
    }).join("");

    return '<div class="stack">' +
      '<div class="row" style="justify-content:space-between"><div><h2>ประวัติพนักงาน</h2><p class="muted small">ทั้งหมด ' + ids.length + ' คน</p></div>' +
      '</div>' + A.filterBar("employees", ids, { dep: true, pos: true, st: true, placeholder: "ค้นหาชื่อ รหัส ตำแหน่ง หรือแผนก" }) +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>รหัส</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th>แผนก</th><th>วันเริ่มงาน</th><th>ผลประเมิน</th><th></th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="7" class="empty">ยังไม่มีรายชื่อพนักงาน</td></tr>') + '</tbody></table></div>' +
    '</div>';
  };

  A.views.profile = function () {
    var S = A.S, esc = A.esc, me = S.me;
    var self = S.view === "me" || me.role !== "evaluator";
    var id = self ? me.id : S.profileId;
    var a = S.accounts[id];
    if (!a) return '<section class="panel empty">ไม่พบข้อมูลพนักงาน</section>';
    var e = S.employees[id] || {}, ev = S.evals[id];

    var evalBox;
    if (ev && (A.isFinal(ev) || me.role !== "evaluator")) {
      var avg = A.avg(ev.finalScores || ev.scores);
      evalBox = '<div class="cards">' +
          '<div class="card accent"><div class="k">คะแนนเฉลี่ย</div><div class="v">' + avg.toFixed(2) + '<small> / ' + A.MAX + '</small></div></div>' +
          '<div class="card"><div class="k">ระดับ</div><div class="v" style="font-size:1.3rem;font-family:var(--font-display)">' + A.grade(avg) + '</div></div>' +
          '<div class="card"><div class="k">การรับทราบ</div><div class="v" style="font-size:1rem">' + (me.role === "evaluator" ? A.stagePill(id) : ev.ack ? '<span class="pill done">รับทราบแล้ว</span>' : '<span class="pill">รอรับทราบ</span>') + '</div></div>' +
        '</div><p class="muted small">คะแนนสุดท้ายหลังปรับเทียบ · ประเมินเมื่อ ' + A.fdate(ev.submittedAt) + ' โดย ' + esc(ev.evaluatorName || "") + '</p>';
    } else if (ev) {
      evalBox = '<p>' + A.stagePill(id) + ' <span class="muted small">ยังไม่ยืนยันผล</span></p>';
    } else {
      evalBox = '<p><span class="pill">ยังไม่ประเมิน</span></p>';
    }
    var act = me.role === "evaluator"
      ? '<button class="btn sm" data-act="open" data-id="' + esc(id) + '">' + (ev ? "เปิดแบบประเมิน" : "เริ่มประเมิน") + '</button>'
      : (ev && ev.status === "submitted" ? '<button class="btn sm" data-act="nav" data-view="mine">ดูผลประเมินฉบับเต็ม</button>' : "");

    return '<div class="stack">' +
      (!self ? '<div><button class="btn sm" data-act="nav" data-view="employees">← กลับรายชื่อพนักงาน</button></div>' : "") +
      '<section class="panel profile-head"><span class="avatar lg">' + avatar(a.name) + '</span>' +
        '<div><h2>' + esc(a.name) + '</h2><p class="muted">' + esc(a.position || "") + (e.department ? " · " + esc(e.department) : "") + '</p>' +
        '<div class="tags">' + (e.code ? '<span class="pill num">' + esc(e.code) + '</span>' : "") + '<span class="pill">' + (a.role === "evaluator" ? "HR" : "พนักงาน") + '</span></div></div></section>' +
      '<section class="panel stack"><h3>ข้อมูลส่วนตัวและการทำงาน</h3><div class="kvs">' +
        info("รหัสพนักงาน", esc(e.code)) + info("ชื่อผู้ใช้", '<span class="num">' + esc(id) + '</span>') +
        info("ตำแหน่ง", esc(a.position)) + info("แผนก", esc(e.department)) +
        info("เบอร์โทร", esc(e.phone)) + info("อีเมล", esc(e.email)) +
        info("วันเริ่มงาน", e.startDate ? A.fdatetime(e.startDate) : "") + info("อายุงาน", esc(A.tenure(e.startDate))) +
      '</div></section>' +
      (a.role === "evaluatee" ? '<section class="panel stack"><div class="row" style="justify-content:space-between"><h3>ผลประเมิน ' + esc(A.PERIOD) + '</h3>' + act + '</div>' + evalBox + '</section>' : "") +
      (a.role === "evaluatee" ? '<section class="panel stack"><h3>ตารางเวลางานประจำสัปดาห์</h3>' + A.weekStrip(id) + '</section>' : "") +
      (a.role === "evaluator" ? evaluatorWork(id) : "") +
      (self ? '<section class="panel stack"><h3>การตั้งค่าบัญชี</h3><div class="row">' +
        '<button class="btn" data-act="nav" data-view="pin">เปลี่ยนรหัส PIN</button>' +
        '<button class="btn" data-act="nav" data-view="notifications">ดูแจ้งเตือน</button></div></section>' : "") +
    '</div>';
  };

  // งานประเมินของ HR: สรุป + ประวัติล่าสุด
  function evaluatorWork(id) {
    var S = A.S, esc = A.esc;
    var mine = Object.keys(S.evals).filter(function (k) { return S.evals[k] && S.evals[k].evaluator === id; });
    var emps = Object.keys(S.accounts).filter(function (k) { return S.accounts[k].role === "evaluatee"; });
    var sub = mine.filter(function (k) { return S.evals[k].status === "submitted"; });
    var fin = mine.filter(function (k) { return A.isFinal(S.evals[k]); });
    var drafts = mine.length - sub.length;
    var acked = sub.filter(function (k) { return S.evals[k].ack; }).length;
    var avg = A.avg(fin.map(function (k) { return A.avg(S.evals[k].finalScores || []); }));
    var recent = mine.slice().sort(function (x, y) { return (S.evals[y].updatedAt || 0) - (S.evals[x].updatedAt || 0); }).slice(0, 8);
    var hist = recent.map(function (k) {
      var ev = S.evals[k], n = (S.accounts[k] || {}).name || k, done = ev.status === "submitted";
      return '<div class="fitem"><span class="avatar sm">' + A.initial(n) + '</span>' +
        '<div class="grow"><b>' + (done ? "ส่งผลประเมินของ " : "บันทึกร่างของ ") + esc(n) + '</b>' +
        '<span class="muted small">' + A.fdate(ev.updatedAt) + (done ? " · คะแนนเฉลี่ย " + A.avg(ev.scores || []).toFixed(2) : "") + '</span></div>' +
        A.stagePill(k) +
        '<button class="btn sm" data-act="open" data-id="' + esc(k) + '">เปิด</button></div>';
    }).join("");
    return '<section class="panel stack"><h3>งานประเมิน ' + esc(A.PERIOD) + '</h3><div class="mini mini4">' +
        '<div><b class="num">' + sub.length + '/' + emps.length + '</b><span class="muted small">ประเมินแล้ว</span></div>' +
        '<div><b class="num">' + acked + '</b><span class="muted small">พนักงานรับทราบ</span></div>' +
        '<div><b class="num">' + fin.length + '</b><span class="muted small">ยืนยันผลแล้ว</span></div>' +
        '<div><b class="num">' + (avg ? avg.toFixed(2) : "–") + '</b><span class="muted small">คะแนนสุดท้ายเฉลี่ย</span></div>' +
      '</div></section>' +
      '<section class="panel stack"><div class="sec-h"><h3>ประวัติการประเมินล่าสุด</h3><button class="btn sm" data-act="nav" data-view="table">ดูทั้งหมด</button></div>' +
      '<div class="flist">' + (hist || '<div class="empty">ยังไม่มีประวัติการประเมิน</div>') + '</div></section>';
  }

  A.views.me = function () { return A.views.profile(); };
})(window.App);
