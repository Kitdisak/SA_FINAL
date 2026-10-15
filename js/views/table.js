/* ติดตามสถานะการประเมิน (HR) — UC-14: เลือกรอบ, ดูสถานะทุกคน, ตรวจรายการที่ล่าช้าและขยายเวลา */
(function (A) {
  A.acts = A.acts || {};
  A.acts["late-only"] = function () { A.S.lateOnly = !A.S.lateOnly; A.render(); };
  A.acts["late-go"] = function () { A.S.lateOnly = true; A.S.view = "table"; A.S.flash = ""; A.render(); window.scrollTo(0, 0); };

  A.views.table = function () {
    var S = A.S, esc = A.esc;
    var emps = Object.keys(S.accounts)
      .filter(function (k) { return S.accounts[k].role === "evaluatee"; })
      .sort(function (a, b) { return S.accounts[a].name.localeCompare(S.accounts[b].name, "th"); });
    var lateIds = emps.filter(function (k) { return A.lateOf(k).length; });
    var shown = S.lateOnly ? lateIds : emps;

    var rows = shown.map(function (k) {
      var a = S.accounts[k], ev = S.evals[k];
      var avg = ev && ev.scores ? A.avg(ev.scores) : 0;
      var fin = A.isFinal(ev) ? A.avg(ev.finalScores) : 0;
      var ack = ev && (ev.dbStatus === "published" || ev.dbStatus === "acknowledged")
        ? (ev.ack ? '<span class="pill done">รับทราบแล้ว</span>' : '<span class="pill">รอรับทราบ</span>') +
          (ev.reply ? ' <span class="pill ask">มีข้อสงสัย</span>' : "")
        : '<span class="muted">–</span>';
      var sf = A.selfDone(k) ? A.avg(S.selfs[k].scores) : 0;
      var late = A.lateOf(k);
      var lateHtml = late.length ? late.map(function (l) {
        return '<span class="pill late">' + l.label + '</span>' + (l.key === "goal" || l.key === "self" ? ' <button class="linkbtn" data-act="ext-pre" data-id="' + esc(k) + '" data-stage="' + l.key + '">ขยายเวลา</button>' : "");
      }).join("<br>") : '<span class="muted">–</span>';
      var ext = ["goal", "self"].map(function (s) { var x = A.extOf(k, s); return x ? '<span class="pill">ขยายถึง ' + A.fday(x.until) + '</span>' : ""; }).join(" ");
      return '<tr' + A.rowAttrs("table", k) + (late.length ? ' class="is-late"' : "") + '><td><div class="who-cell"><span class="avatar sm">' + A.initial(a.name) + '</span><b>' + esc(a.name) + '</b></div></td><td>' + esc((S.employees[k] || {}).department || "–") + '</td><td>' + A.stagePill(k) + '</td>' +
        '<td>' + lateHtml + (ext ? '<div>' + ext + '</div>' : "") + '</td>' +
        '<td class="n">' + (sf ? '<button type="button" class="pill self pill-btn" data-act="selfview" data-id="' + esc(k) + '" title="ดูรายละเอียด">' + sf.toFixed(2) + '</button>' : '<span class="muted">–</span>') + '</td><td class="n">' + (avg ? avg.toFixed(2) : "–") + '</td><td class="n"><b>' + (fin ? fin.toFixed(2) : "–") + '</b></td><td>' + (fin ? A.grade(fin) : "–") + '</td>' +
        '<td>' + ack + '</td><td>' + (ev && ev.updatedAt ? A.fdate(ev.updatedAt) : "–") + '</td>' +
        '<td><div class="row acts"><button class="btn sm" data-act="open" data-id="' + esc(k) + '">' + (ev ? "เปิดดู" : "ประเมิน") + '</button>' +
        (ev && S.cycle && S.cycle.status === "open" ? '<button class="btn sm danger icon" data-act="del-eval" data-id="' + esc(k) + '" title="ลบผลประเมิน" aria-label="ลบผลประเมินของ ' + esc(a.name) + '"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>' : "") + '</div></td></tr>';
    }).join("");

    var st = (S.cycle && S.cycle.stages || []).filter(function (s) { return s.key; }).map(function (s) {
      var t = A.today(), cls = t > s.end ? "past" : t >= s.start ? "now" : "";
      return '<span class="due-chip ' + cls + '"><b>' + esc(s.name) + '</b> ถึง ' + A.fday(s.end) + '</span>';
    }).join("");
    return '<div class="stack">' +
      '<div class="sec-h"><div><h2>ติดตามสถานะการประเมิน</h2><p class="muted small">สถานะของพนักงานทุกคน ตั้งแต่ประเมินตนเองจนถึงรับทราบผล อัปเดตอัตโนมัติ</p></div>' + A.cyclePicker() + '</div>' +
      (st ? '<div class="due-chips">' + st + '</div>' : "") +
      A.filterBar("table", shown, { dep: true, pos: true, st: true, placeholder: "ค้นหาชื่อ ตำแหน่ง หรือแผนก" }) +
      '<div class="row"><button type="button" class="btn sm' + (S.lateOnly ? " primary" : "") + '" data-act="late-only">' + (S.lateOnly ? "✓ " : "") + 'เฉพาะรายการที่ล่าช้า (' + lateIds.length + ')</button>' +
        (S.lateOnly ? '<span class="muted small">แสดงพนักงานที่พ้นกำหนดแล้วแต่ยังไม่ดำเนินการ</span>' : "") + '</div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
        '<th>พนักงาน</th><th>แผนก</th><th>สถานะ</th><th>ล่าช้า</th><th>ประเมินตนเอง</th><th>คะแนนประเมิน</th><th>คะแนนสุดท้าย</th><th>ระดับ</th><th>การรับทราบ</th><th>อัปเดตล่าสุด</th><th></th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="11" class="empty">' + (S.lateOnly ? "ไม่มีรายการที่ล่าช้า" : "ยังไม่มีรายชื่อพนักงาน") + '</td></tr>') + '</tbody></table></div>' +
    '</div>';
  };
})(window.App);
