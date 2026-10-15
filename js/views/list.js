/* พี่เลี้ยง: รายชื่อพนักงานในความดูแลที่ต้องประเมิน (UC-08) */
(function (A) {

  A.views.list = function () {
    var S = A.S, esc = A.esc;
    var emps = A.staff()
      .sort(function (a, b) { return S.accounts[a].name.localeCompare(S.accounts[b].name, "th"); });
    var done = emps.filter(function (k) { return S.evals[k] && S.evals[k].status === "submitted"; }).length;

    var rows = emps.map(function (k) {
      var a = S.accounts[k], ev = S.evals[k];
      var sc = ev && ev.scores ? A.avg(ev.scores) : 0;
      var tags = (ev && ev.reply ? '<div class="tags"><span class="pill ask">มีข้อสงสัยจากพนักงาน</span></div>' : "") +
        (ev && ev.hrReturn ? '<div class="tags"><span class="pill late">HR ส่งกลับให้แก้ไข</span></div>' : "");
      var dep = (S.employees[k] || {}).department;
      return '<div class="emp ecard"' + A.rowAttrs("list", k) + '>' +
        '<div class="ec-top"><span class="avatar">' + A.initial(a.name) + '</span><div class="info"><b>' + esc(a.name) + '</b><span class="muted small">' + esc(a.position || "") + '</span>' +
        (dep ? '<span class="dep-tag">' + esc(dep) + '</span>' : "") + '</div>' +
        (sc ? '<div class="ec-score"><b class="num">' + sc.toFixed(2) + '</b><span>เฉลี่ย</span></div>' : "") + '</div>' +
        '<div class="tags">' + A.stagePill(k) + (A.selfDone(k) ? '<button type="button" class="pill self pill-btn" data-act="selfview" data-id="' + esc(k) + '" title="ดูรายละเอียดการประเมินตนเอง">ประเมินตนเองแล้ว · ดู</button>' : "") + '</div>' + tags +
        '<div class="row acts">' + (!ev && !A.canEvaluate(k) ? '<button class="btn sm" data-act="open" data-id="' + esc(k) + '" title="ต้องรอพนักงานส่งแบบประเมินตนเองก่อน">รอประเมินตนเอง</button>' : '<button class="btn' + (ev && ev.dbStatus !== "draft" ? "" : " primary") + ' sm" data-act="open" data-id="' + esc(k) + '">' + (!ev ? "เริ่มประเมิน" : ev.dbStatus === "draft" ? "ประเมินต่อ" : "เปิดดู") + '</button>') +
        (ev && ev.dbStatus === "draft" ? '<button class="btn sm danger icon" data-act="del-eval" data-id="' + esc(k) + '" title="ลบผลประเมิน" aria-label="ลบผลประเมินของ ' + esc(a.name) + '"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>' : "") + '</div></div>';
    }).join("");

    return (S.flash ? '<p class="flash" style="margin-bottom:16px">' + esc(S.flash) + '</p>' : "") +
      '<section class="panel stack"><div class="row" style="justify-content:space-between"><div><h2>พนักงานในความดูแล</h2><p class="muted small">ประเมินผล ให้คะแนนและข้อเสนอแนะ แล้วส่งผลให้ HR ตรวจสอบ (UC-08, UC-09, UC-11)</p></div>' +
      '<div class="stats muted"><span class="num" style="color:var(--ink);font-size:1.3rem">' + done + '/' + emps.length + '</span> ส่งผลให้ HR แล้ว</div></div>' +
      A.filterBar("list", emps, { dep: true, st: true, placeholder: "ค้นหาชื่อพนักงาน" }) +
      (rows ? '<div class="emp-grid">' + rows + '</div>' : '<div class="empty">ยังไม่มีพนักงานที่ได้รับมอบหมาย (HR เป็นผู้มอบหมายพี่เลี้ยง)</div>') + '</section>';
  };
})(window.App);
