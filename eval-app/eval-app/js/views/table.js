/* สรุปผลประเมินทั้งหมดแบบตาราง (ผู้ประเมิน) */
(function (A) {
  A.views.table = function () {
    var S = A.S, esc = A.esc;
    var emps = Object.keys(S.accounts)
      .filter(function (k) { return S.accounts[k].role === "evaluatee"; })
      .sort(function (a, b) { return S.accounts[a].name.localeCompare(S.accounts[b].name, "th"); });

    var rows = emps.map(function (k) {
      var a = S.accounts[k], ev = S.evals[k];
      var avg = ev && ev.scores ? A.avg(ev.scores) : 0;
      var st = !ev ? '<span class="pill">ยังไม่ประเมิน</span>'
        : ev.status === "submitted" ? '<span class="pill done">ส่งผลแล้ว</span>' : '<span class="pill draft">ร่าง</span>';
      var ack = ev && ev.status === "submitted"
        ? (ev.ack ? '<span class="pill done">รับทราบแล้ว</span>' : '<span class="pill">รอรับทราบ</span>') +
          (ev.reply ? ' <span class="pill ask">มีข้อสงสัย</span>' : "")
        : '<span class="muted">–</span>';
      return '<tr' + A.rowAttrs("table", k) + '><td><div class="who-cell"><span class="avatar sm">' + A.initial(a.name) + '</span><b>' + esc(a.name) + '</b></div></td><td>' + esc(a.position || "") + '</td><td>' + esc((S.employees[k] || {}).department || "–") + '</td><td>' + st + '</td>' +
        '<td class="n">' + (avg ? avg.toFixed(2) : "–") + '</td><td>' + (avg ? A.grade(avg) : "–") + '</td>' +
        '<td>' + ack + '</td><td>' + (ev && ev.updatedAt ? A.fdate(ev.updatedAt) : "–") + '</td>' +
        '<td><div class="row acts"><button class="btn sm" data-act="open" data-id="' + esc(k) + '">' + (ev ? "เปิดดู" : "ประเมิน") + '</button>' +
        (ev ? '<button class="btn sm danger icon" data-act="del-eval" data-id="' + esc(k) + '" title="ลบผลประเมิน" aria-label="ลบผลประเมินของ ' + esc(a.name) + '"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>' : "") + '</div></td></tr>';
    }).join("");

    return '<div class="stack">' +
      '<div><h2>ผลประเมินทั้งหมด</h2><p class="muted small">ข้อมูลพนักงานทุกคนในรอบนี้ อัปเดตอัตโนมัติ</p></div>' +
      A.filterBar("table", emps, { dep: true, pos: true, st: true, placeholder: "ค้นหาชื่อ ตำแหน่ง หรือแผนก" }) +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
        '<th>พนักงาน</th><th>ตำแหน่ง</th><th>แผนก</th><th>สถานะ</th><th>คะแนนเฉลี่ย</th><th>ระดับ</th><th>การรับทราบ</th><th>อัปเดตล่าสุด</th><th></th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="9" class="empty">ยังไม่มีรายชื่อพนักงาน</td></tr>') + '</tbody></table></div>' +
    '</div>';
  };
})(window.App);
