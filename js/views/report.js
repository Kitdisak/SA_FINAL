/* HR ดูรายงานสรุปผลการประเมิน (UC-17) — ใช้เฉพาะผลที่ยืนยันแล้ว */
(function (A) {
  var S = A.S;
  A.acts = A.acts || {};
  var GRADES = ["ดีเยี่ยม", "ดี", "ตามเกณฑ์", "ต้องปรับปรุง", "ต้องปรับปรุงมาก"];

  function data() {
    var emps = Object.keys(S.accounts).filter(function (k) { return S.accounts[k].role === "evaluatee"; });
    var rows = emps.map(function (k) {
      var a = S.accounts[k], e = S.employees[k] || {}, ev = S.evals[k], sx = A.selfOf(k);
      var fin = A.isFinal(ev) ? ev.finalScores : null;
      return { id: k, name: a.name, position: a.position || "", dep: e.department || "ไม่ระบุแผนก", code: e.code || "",
        stage: A.STAGE[A.stage(k)][0], self: sx && sx.status === "submitted" ? A.avg(sx.scores) : 0,
        eval: ev ? A.avg(ev.scores) : 0, fin: fin ? A.avg(fin) : 0, finScores: fin, ack: !!(ev && ev.ack) };
    });
    return { emps: emps, rows: rows, done: rows.filter(function (r) { return r.fin; }) };
  }
  function bar(label, v, max, txt, cls) {
    return '<div class="cbar"><div class="l"><span>' + A.esc(label) + '</span><span class="num">' + txt + '</span></div>' +
      '<div class="track"><i' + (cls ? ' class="' + cls + '"' : "") + ' style="width:' + (max ? v / max * 100 : 0) + '%"></i></div></div>';
  }

  A.views.report = function () {
    var esc = A.esc, d = data(), done = d.done;
    var org = A.avg(done.map(function (r) { return r.fin; }));
    var selfOrg = A.avg(done.map(function (r) { return r.self; }));
    var gcount = GRADES.map(function (g) { return done.filter(function (r) { return A.grade(r.fin) === g; }).length; });
    var gmax = Math.max.apply(null, gcount.concat([1]));
    var grades = GRADES.map(function (g, i) { return bar(g, gcount[i], gmax, gcount[i] + " คน"); }).join("");
    var cats = A.CATS.map(function (c, ci) {
      var v = A.avg(done.map(function (r) { return A.avg(A.catScores(r.finScores, ci)); }));
      return bar(c.name, v, A.MAX, v ? v.toFixed(2) : "–");
    }).join("");
    var deps = {};
    d.rows.forEach(function (r) { (deps[r.dep] = deps[r.dep] || []).push(r); });
    var depRows = Object.keys(deps).sort(function (a, b) { return a.localeCompare(b, "th"); }).map(function (k) {
      var all = deps[k], ok = all.filter(function (r) { return r.fin; });
      var f = A.avg(ok.map(function (r) { return r.fin; })), s = A.avg(ok.map(function (r) { return r.self; }));
      return '<tr><td><b>' + esc(k) + '</b></td><td class="n">' + all.length + '</td><td class="n">' + ok.length + '</td>' +
        '<td class="n">' + (s ? s.toFixed(2) : "–") + '</td><td class="n"><b>' + (f ? f.toFixed(2) : "–") + '</b></td><td>' + (f ? A.grade(f) : "–") + '</td></tr>';
    }).join("");
    var ranked = done.slice().sort(function (a, b) { return b.fin - a.fin; });
    var people = ranked.map(function (r, i) {
      return '<tr><td class="n">' + (i + 1) + '</td><td><b>' + esc(r.name) + '</b><div class="muted small">' + esc(r.position) + '</div></td><td>' + esc(r.dep) + '</td>' +
        '<td class="n">' + (r.self ? r.self.toFixed(2) : "–") + '</td><td class="n"><b>' + r.fin.toFixed(2) + '</b></td><td>' + A.grade(r.fin) + '</td>' +
        '<td>' + (r.ack ? '<span class="pill done">รับทราบแล้ว</span>' : '<span class="pill">' + esc(r.stage) + '</span>') + '</td></tr>';
    }).join("");
    return '<div class="stack">' +
      '<div class="sec-h"><div><h2>รายงานสรุปผลการประเมิน</h2><p class="muted small">' + esc((S.cycle || {}).name || "") + ' · นับเฉพาะผลที่ HR ยืนยันแล้ว (' + done.length + ' จาก ' + d.emps.length + ' คน)</p></div>' +
        '<div class="row">' + A.cyclePicker() + '<button class="btn" data-act="rp-csv">ดาวน์โหลด CSV</button></div></div>' +
      '<div class="cards">' +
        '<div class="card mini"><span class="label">พนักงานทั้งหมด</span><b class="num big2">' + d.emps.length + '</b><span class="muted small">คน</span></div>' +
        '<div class="card mini"><span class="label">ยืนยันผลแล้ว</span><b class="num big2">' + done.length + '</b><span class="muted small">' + (d.emps.length ? Math.round(done.length / d.emps.length * 100) : 0) + '% ของทั้งหมด</span></div>' +
        '<div class="card mini"><span class="label">คะแนนเฉลี่ยองค์กร</span><b class="num big2">' + (org ? org.toFixed(2) : "–") + '</b><span class="muted small">' + (org ? A.grade(org) : "") + '</span></div>' +
        '<div class="card mini"><span class="label">ตนเองเฉลี่ย / สุดท้ายเฉลี่ย</span><b class="num big2">' + (selfOrg ? selfOrg.toFixed(2) : "–") + ' / ' + (org ? org.toFixed(2) : "–") + '</b><span class="muted small">พนักงานที่ยืนยันผลแล้ว</span></div>' +
      '</div>' +
      (done.length ? '<div class="dash">' +
        '<section class="panel stack"><h3>การกระจายตามระดับผลการประเมิน</h3><div class="cbars">' + grades + '</div></section>' +
        '<section class="panel stack"><h3>คะแนนเฉลี่ยรายหมวด</h3><div class="cbars">' + cats + '</div></section></div>' : '<section class="panel empty">ยังไม่มีผลที่ยืนยันแล้ว ยืนยันผลได้ที่หน้า "ตรวจสอบและยืนยันผล"</section>') +
      '<section class="stack"><h3>สรุปรายแผนก</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>แผนก</th><th>พนักงาน</th><th>ยืนยันแล้ว</th><th>ตนเองเฉลี่ย</th><th>คะแนนสุดท้ายเฉลี่ย</th><th>ระดับ</th></tr></thead><tbody>' + depRows + '</tbody></table></div></section>' +
      (people ? '<section class="stack"><h3>ผลรายบุคคล (เรียงตามคะแนนสุดท้าย)</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>พนักงาน</th><th>แผนก</th><th>คะแนนตนเอง</th><th>คะแนนสุดท้าย</th><th>ระดับ</th><th>สถานะ</th></tr></thead><tbody>' + people + '</tbody></table></div></section>' : "") +
    '</div>';
  };

  A.acts["rp-csv"] = function () {
    var d = data(), q = function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var head = ["รหัสพนักงาน", "ชื่อ", "ตำแหน่ง", "แผนก", "สถานะ", "คะแนนตนเอง", "คะแนนประเมิน", "คะแนนสุดท้าย", "ระดับ"];
    var lines = [head.join(",")].concat(d.rows.map(function (r) {
      return [r.code, r.name, r.position, r.dep, r.stage, r.self ? r.self.toFixed(2) : "", r.eval ? r.eval.toFixed(2) : "", r.fin ? r.fin.toFixed(2) : "", r.fin ? A.grade(r.fin) : ""].map(q).join(",");
    }));
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "รายงานผลการประเมิน.csv";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
})(window.App);
