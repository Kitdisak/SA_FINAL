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
    var id = me.role === "evaluator" ? S.profileId : me.id;
    var a = S.accounts[id];
    if (!a) return '<section class="panel empty">ไม่พบข้อมูลพนักงาน</section>';
    var e = S.employees[id] || {}, ev = S.evals[id];

    var evalBox;
    if (ev && ev.status === "submitted") {
      var avg = A.avg(ev.scores);
      evalBox = '<div class="cards">' +
          '<div class="card accent"><div class="k">คะแนนเฉลี่ย</div><div class="v">' + avg.toFixed(2) + '<small> / 5</small></div></div>' +
          '<div class="card"><div class="k">ระดับ</div><div class="v" style="font-size:1.3rem;font-family:var(--font-display)">' + A.grade(avg) + '</div></div>' +
          '<div class="card"><div class="k">การรับทราบ</div><div class="v" style="font-size:1rem">' + (ev.ack ? '<span class="pill done">รับทราบแล้ว</span>' : '<span class="pill">รอรับทราบ</span>') + '</div></div>' +
        '</div><p class="muted small">ส่งผลเมื่อ ' + A.fdate(ev.submittedAt) + ' โดย ' + esc(ev.evaluatorName || "") + '</p>';
    } else if (ev) {
      evalBox = '<p><span class="pill draft">ร่าง</span> <span class="muted small">ผู้ประเมินยังไม่ส่งผล</span></p>';
    } else {
      evalBox = '<p><span class="pill">ยังไม่ประเมิน</span></p>';
    }
    var act = me.role === "evaluator"
      ? '<button class="btn sm" data-act="open" data-id="' + esc(id) + '">' + (ev ? "เปิดแบบประเมิน" : "เริ่มประเมิน") + '</button>'
      : (ev && ev.status === "submitted" ? '<button class="btn sm" data-act="nav" data-view="mine">ดูผลประเมินฉบับเต็ม</button>' : "");

    return '<div class="stack">' +
      (me.role === "evaluator" ? '<div><button class="btn sm" data-act="nav" data-view="employees">← กลับรายชื่อพนักงาน</button></div>' : "") +
      '<section class="panel profile-head"><span class="avatar lg">' + avatar(a.name) + '</span>' +
        '<div><h2>' + esc(a.name) + '</h2><p class="muted">' + esc(a.position || "") + (e.department ? " · " + esc(e.department) : "") + '</p>' +
        '<div class="tags">' + (e.code ? '<span class="pill num">' + esc(e.code) + '</span>' : "") + '<span class="pill">' + (a.role === "evaluator" ? "ผู้ประเมิน" : "พนักงาน") + '</span></div></div></section>' +
      '<section class="panel stack"><h3>ข้อมูลส่วนตัวและการทำงาน</h3><div class="kvs">' +
        info("รหัสพนักงาน", esc(e.code)) + info("ชื่อผู้ใช้", '<span class="num">' + esc(id) + '</span>') +
        info("ตำแหน่ง", esc(a.position)) + info("แผนก", esc(e.department)) +
        info("เบอร์โทร", esc(e.phone)) + info("อีเมล", esc(e.email)) +
        info("วันเริ่มงาน", e.startDate ? A.fdatetime(e.startDate) : "") + info("อายุงาน", esc(A.tenure(e.startDate))) +
      '</div></section>' +
      (a.role === "evaluatee" ? '<section class="panel stack"><div class="row" style="justify-content:space-between"><h3>ผลประเมิน ' + esc(A.PERIOD) + '</h3>' + act + '</div>' + evalBox + '</section>' : "") +
      (a.role === "evaluatee" ? '<section class="panel stack"><h3>ตารางเวลางานประจำสัปดาห์</h3>' + A.weekStrip(id) + '</section>' : "") +
    '</div>';
  };
})(window.App);
