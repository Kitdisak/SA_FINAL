/* ติดตามสถานะการประเมิน (HR) — UC-14: เลือกรอบ, ดูสถานะทุกคนและพี่เลี้ยง, ตรวจรายการที่ล่าช้า ขยายเวลา และมอบหมายพี่เลี้ยง */
(function (A) {
  A.acts = A.acts || {};
  A.acts["late-only"] = function () { A.S.lateOnly = !A.S.lateOnly; A.render(); };
  A.acts["assign"] = function () {};
  A.assignMentor = async function (k, mentor) {
    var S = A.S, name = (S.accounts[k] || {}).name || k;
    try {
      await A.api("/assignments/" + encodeURIComponent(k), { method: "PUT", body: JSON.stringify({ mentor: mentor }) });
      var e = S.employees[k] = S.employees[k] || {}; e.mentor = mentor;
      S.flash = mentor ? "มอบหมาย " + ((S.accounts[mentor] || {}).name || mentor) + " เป็นพี่เลี้ยงของ " + name + " แล้ว" : "ยกเลิกพี่เลี้ยงของ " + name + " แล้ว";
    } catch (err) { S.flash = "มอบหมายไม่สำเร็จ: " + err.message; }
    A.render();
  };
  A.acts["late-go"] = function () { A.S.lateOnly = true; A.S.view = "table"; A.S.flash = ""; A.render(); window.scrollTo(0, 0); };

  A.views.table = function () {
    var S = A.S, esc = A.esc;
    var emps = A.staff()
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
      var men = (S.employees[k] || {}).mentor || "", live = S.cycle && S.cycle.status === "open" && !S.viewCycle;
      var mentors = Object.keys(S.accounts).filter(function (m) { return S.accounts[m].role === "mentor"; });
      var menCell = live && !A.isFinal(ev)
        ? '<select class="fsel' + (men ? "" : " warn") + '" data-assign="' + esc(k) + '" aria-label="พี่เลี้ยงของ ' + esc(a.name) + '"><option value="">– ยังไม่มอบหมาย –</option>' +
            mentors.map(function (m) { return '<option value="' + esc(m) + '"' + (m === men ? " selected" : "") + '>' + esc(S.accounts[m].name) + '</option>'; }).join("") + '</select>'
        : esc(A.mentorName(k) || "–");
      return '<tr' + A.rowAttrs("table", k) + (late.length ? ' class="is-late"' : "") + '><td><div class="who-cell"><span class="avatar sm">' + A.initial(a.name) + '</span><b>' + esc(a.name) + '</b></div></td><td>' + esc((S.employees[k] || {}).department || "–") + '</td><td>' + menCell + '</td><td>' + A.stagePill(k) + '</td>' +
        '<td>' + lateHtml + (ext ? '<div>' + ext + '</div>' : "") + '</td>' +
        '<td class="n">' + (sf ? '<button type="button" class="pill self pill-btn" data-act="selfview" data-id="' + esc(k) + '" title="ดูรายละเอียด">' + sf.toFixed(2) + '</button>' : '<span class="muted">–</span>') + '</td><td class="n">' + (avg ? avg.toFixed(2) : "–") + '</td><td class="n"><b>' + (fin ? fin.toFixed(2) : "–") + '</b></td><td>' + (fin ? A.grade(fin) : "–") + '</td>' +
        '<td>' + ack + '</td><td>' + (ev && ev.updatedAt ? A.fdate(ev.updatedAt) : "–") + '</td>' +
        '<td><div class="row acts">' + (ev && ev.status === "submitted" ? '<button class="btn sm' + (ev.dbStatus === "pending_hr" ? " primary" : "") + '" data-act="rv-open" data-id="' + esc(k) + '">' + (ev.dbStatus === "pending_hr" ? "ตรวจสอบ" : "เปิดดู") + '</button>'
          : A.selfDone(k) ? '<button class="btn sm" data-act="selfview" data-id="' + esc(k) + '">ดูประเมินตนเอง</button>' : '<span class="muted small">รอพี่เลี้ยง</span>') + '</div></td></tr>';
    }).join("");

    var st = (S.cycle && S.cycle.stages || []).filter(function (s) { return s.key; }).map(function (s) {
      var t = A.today(), cls = t > s.end ? "past" : t >= s.start ? "now" : "";
      return '<span class="due-chip ' + cls + '"><b>' + esc(s.name) + '</b> ถึง ' + A.fday(s.end) + '</span>';
    }).join("");
    return '<div class="stack">' +
      '<div class="sec-h"><div><h2>ติดตามสถานะการประเมิน</h2><p class="muted small">สถานะของพนักงานและพี่เลี้ยงทุกคน ตั้งแต่ประเมินตนเองจนถึงรับทราบผล · เลือกพี่เลี้ยงของแต่ละคนได้ในคอลัมน์ "พี่เลี้ยง"</p></div>' + A.cyclePicker() + '</div>' +
      (st ? '<div class="due-chips">' + st + '</div>' : "") +
      A.filterBar("table", shown, { dep: true, pos: true, st: true, placeholder: "ค้นหาชื่อ ตำแหน่ง หรือแผนก" }) +
      '<div class="row"><button type="button" class="btn sm' + (S.lateOnly ? " primary" : "") + '" data-act="late-only">' + (S.lateOnly ? "✓ " : "") + 'เฉพาะรายการที่ล่าช้า (' + lateIds.length + ')</button>' +
        (S.lateOnly ? '<span class="muted small">แสดงพนักงานที่พ้นกำหนดแล้วแต่ยังไม่ดำเนินการ</span>' : "") + '</div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
        '<th>พนักงาน</th><th>แผนก</th><th>พี่เลี้ยง</th><th>สถานะ</th><th>ล่าช้า</th><th>ประเมินตนเอง</th><th>คะแนนพี่เลี้ยง</th><th>คะแนนสุดท้าย</th><th>ระดับ</th><th>การรับทราบ</th><th>อัปเดตล่าสุด</th><th></th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="12" class="empty">' + (S.lateOnly ? "ไม่มีรายการที่ล่าช้า" : "ยังไม่มีรายชื่อพนักงาน") + '</td></tr>') + '</tbody></table></div>' +
    '</div>';
  };
})(window.App);
