/* ผู้บริหาร: ภาพรวมสถานะและผลการประเมิน (UC-18) — ดูอย่างเดียว เลือกดูตามรอบและหน่วยงานได้
   คะแนนแสดงเฉพาะผลที่ HR ยืนยันแล้ว (เซิร์ฟเวอร์ไม่ส่งคะแนนระหว่างดำเนินการมาให้ผู้บริหาร) */
(function (A) {
  var S = A.S;
  A.acts = A.acts || {};
  var GROUPS = [
    ["none", "ยังไม่เริ่ม", ["none", "returned"]],
    ["doing", "อยู่ระหว่างดำเนินการ", ["self", "draft"]],
    ["hr", "รอ HR ตรวจสอบ", ["pending_hr", "confirmed"]],
    ["done", "เสร็จสิ้น (เผยแพร่แล้ว)", ["published", "acknowledged"]]
  ];
  function groupOf(k) { var st = A.stage(k); var g = GROUPS.find(function (x) { return x[2].indexOf(st) >= 0; }); return g ? g[0] : "none"; }
  function bar(label, v, max, txt) {
    return '<div class="cbar"><div class="l"><span>' + A.esc(label) + '</span><span class="num">' + txt + '</span></div>' +
      '<div class="track"><i style="width:' + (max ? Math.min(100, v / max * 100) : 0) + '%"></i></div></div>';
  }

  A.views.overview = function () {
    var esc = A.esc, all = A.staff(), dep = S.ovDep || "";
    var deps = {};
    all.forEach(function (k) { deps[(S.employees[k] || {}).department || "ไม่ระบุแผนก"] = 1; });
    var depList = Object.keys(deps).sort(function (a, b) { return a.localeCompare(b, "th"); });
    if (dep && !deps[dep]) dep = S.ovDep = "";
    var emps = all.filter(function (k) { return !dep || ((S.employees[k] || {}).department || "ไม่ระบุแผนก") === dep; });
    var picker = '<label class="cyc-pick"><span>หน่วยงาน</span><select data-ovdep aria-label="เลือกหน่วยงาน"><option value="">ทุกหน่วยงาน</option>' +
      depList.map(function (d) { return '<option value="' + esc(d) + '"' + (d === dep ? " selected" : "") + '>' + esc(d) + '</option>'; }).join("") + '</select></label>';
    var head = '<div class="sec-h"><div><h2>ภาพรวมสถานะและผลการประเมิน</h2><p class="muted small">' + esc((S.cycle || {}).name || "") +
      ' · ข้อมูลอัปเดตอัตโนมัติ · คะแนนนับเฉพาะผลที่ HR ยืนยันแล้ว</p></div><div class="row">' + A.cyclePicker() + picker + '</div></div>';
    if (!emps.length) return '<div class="stack">' + head + '<section class="panel empty">ไม่มีข้อมูลการประเมินในรอบหรือหน่วยงานที่เลือก</section></div>';

    var cnt = {}; GROUPS.forEach(function (g) { cnt[g[0]] = 0; });
    emps.forEach(function (k) { cnt[groupOf(k)]++; });
    var fin = emps.filter(function (k) { return A.isFinal(S.evals[k]); });
    var org = A.avg(fin.map(function (k) { return A.finalAvg(S.evals[k]); }));
    var pct = Math.round(cnt.done / emps.length * 100);
    var r = 42, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
    var ring = '<div class="ring" role="img" aria-label="เสร็จสิ้น ' + pct + '%"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="' + r + '" class="ring-bg"/>' +
      '<circle cx="50" cy="50" r="' + r + '" class="ring-fg" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/></svg>' +
      '<div class="ring-txt"><b>' + pct + '%</b><span>เสร็จสิ้น</span></div></div>';

    var pipe = ["none", "self", "draft", "pending_hr", "confirmed", "published", "acknowledged"].map(function (st) {
      var n = emps.filter(function (k) { return A.stage(k) === st || (st === "none" && A.stage(k) === "returned"); }).length;
      return '<div class="pipe-i' + (n ? "" : " zero") + '"><b class="num">' + n + '</b><span>' + A.STAGE[st][0] + '</span></div>';
    }).join('<span class="pipe-arrow" aria-hidden="true">›</span>');

    // แยกตามหน่วยงาน
    var byDep = {};
    emps.forEach(function (k) { var d = (S.employees[k] || {}).department || "ไม่ระบุแผนก"; (byDep[d] = byDep[d] || []).push(k); });
    var depRows = Object.keys(byDep).sort(function (a, b) { return a.localeCompare(b, "th"); }).map(function (d) {
      var ks = byDep[d], g = {}; GROUPS.forEach(function (x) { g[x[0]] = 0; });
      ks.forEach(function (k) { g[groupOf(k)]++; });
      var f = A.avg(ks.filter(function (k) { return A.isFinal(S.evals[k]); }).map(function (k) { return A.finalAvg(S.evals[k]); }));
      var p = Math.round(g.done / ks.length * 100);
      return '<tr><td><b>' + esc(d) + '</b></td><td class="n">' + ks.length + '</td><td class="n">' + g.none + '</td><td class="n">' + g.doing + '</td><td class="n">' + g.hr + '</td><td class="n">' + g.done + '</td>' +
        '<td><div class="track mini-track"><i style="width:' + p + '%"></i></div><span class="muted small">' + p + '%</span></td><td class="n"><b>' + (f ? f.toFixed(2) : "–") + '</b></td></tr>';
    }).join("");

    // ความคืบหน้าของพี่เลี้ยง
    var byMen = {};
    emps.forEach(function (k) { var m = (S.employees[k] || {}).mentor || ""; (byMen[m] = byMen[m] || []).push(k); });
    var menBars = Object.keys(byMen).sort().map(function (m) {
      var ks = byMen[m], sent = ks.filter(function (k) { var e = S.evals[k]; return e && e.status === "submitted"; }).length;
      return bar((m ? (S.accounts[m] || {}).name || m : "ยังไม่มอบหมายพี่เลี้ยง"), sent, ks.length, "ส่งผลแล้ว " + sent + "/" + ks.length + " คน");
    }).join("");

    var GR = ["ดีเยี่ยม", "ดี", "ตามเกณฑ์", "ต้องปรับปรุง", "ต้องปรับปรุงมาก"];
    var gc = GR.map(function (g) { return fin.filter(function (k) { return A.grade(A.finalAvg(S.evals[k])) === g; }).length; });
    var gmax = Math.max.apply(null, gc.concat([1]));
    var grades = GR.map(function (g, i) { return bar(g, gc[i], gmax, gc[i] + " คน"); }).join("");

    function card(label, v, sub) { return '<div class="card mini"><span class="label">' + label + '</span><b class="num big2">' + v + '</b><span class="muted small">' + sub + '</span></div>'; }
    return '<div class="stack">' + head +
      '<section class="hero-banner"><div class="hb-text"><h2>สวัสดี ' + esc(S.me.name) + '</h2>' +
        '<p>' + (dep ? esc(dep) + ' · ' : "") + 'พนักงาน ' + emps.length + ' คน · เสร็จสิ้น <b>' + cnt.done + ' คน</b> · ยังดำเนินการอยู่ <b>' + (emps.length - cnt.done) + ' คน</b></p>' +
        '<div class="row"><button class="btn primary" data-act="nav" data-view="report">ดูรายงานสรุปผล</button></div></div>' + ring + '</section>' +
      '<div class="cards">' +
        GROUPS.map(function (g) { return card(g[1], cnt[g[0]], emps.length ? Math.round(cnt[g[0]] / emps.length * 100) + "% ของทั้งหมด" : ""); }).join("") +
      '</div>' +
      '<section class="panel stack"><div class="sec-h"><h3>สถานะกระบวนการประเมิน</h3><span class="muted small">คะแนนเฉลี่ยผลที่ยืนยันแล้ว <b class="num">' + (org ? org.toFixed(2) : "–") + '</b>' + (org ? " (" + A.grade(org) + ")" : "") + '</span></div>' +
        '<div class="pipe">' + pipe + '</div></section>' +
      '<section class="stack"><h3>ความคืบหน้าแยกตามหน่วยงาน</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>หน่วยงาน</th><th>พนักงาน</th><th>ยังไม่เริ่ม</th><th>ระหว่างดำเนินการ</th><th>รอ HR</th><th>เสร็จสิ้น</th><th>ความคืบหน้า</th><th>คะแนนเฉลี่ย</th></tr></thead><tbody>' + depRows + '</tbody></table></div></section>' +
      '<div class="dash">' +
        '<section class="panel stack"><h3>ความคืบหน้าของพี่เลี้ยง</h3><div class="cbars">' + menBars + '</div></section>' +
        '<section class="panel stack"><h3>การกระจายระดับผล (ยืนยันแล้ว ' + fin.length + ' คน)</h3>' + (fin.length ? '<div class="cbars">' + grades + '</div>' : '<div class="empty">ยังไม่มีผลที่ยืนยันแล้ว</div>') + '</section>' +
      '</div></div>';
  };
})(window.App);
