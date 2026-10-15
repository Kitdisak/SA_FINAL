/* HR ตรวจสอบและปรับเทียบผล (UC-15) / สรุปยืนยันและเผยแพร่ผล (UC-16) + สถานะกระบวนการ (ใช้ทุกหน้า) */
(function (A) {
  var S = A.S;
  A.acts = A.acts || {};

  // สถานะของพนักงาน 1 คนในกระบวนการ (ตามภาคผนวก ข)
  var STAGE = {
    none:         ["ยังไม่ประเมิน", ""],
    self:         ["รอ HR ประเมิน", "self"],
    returned:     ["ส่งกลับแก้ไข", "draft"],
    draft:        ["ร่าง", "draft"],
    pending_hr:   ["รอตรวจสอบ/ปรับเทียบ", "ask"],
    confirmed:    ["ยืนยันแล้ว รอเผยแพร่", "self"],
    published:    ["เผยแพร่แล้ว", "done"],
    acknowledged: ["รับทราบแล้ว", "done"]
  };
  A.STAGE = STAGE;
  A.stage = function (k) {
    var ev = S.evals[k];
    if (ev) return STAGE[ev.dbStatus] ? ev.dbStatus : (ev.status === "submitted" ? "pending_hr" : "draft");
    if (A.selfDone && A.selfDone(k)) return "self";
    var x = A.selfOf && A.selfOf(k);
    return x && x.returnReason ? "returned" : "none";
  };
  A.stagePill = function (k) { var s = STAGE[A.stage(k)]; return '<span class="pill ' + s[1] + '">' + s[0] + '</span>'; };
  A.isFinal = function (ev) { return ev && ["confirmed", "published", "acknowledged"].indexOf(ev.dbStatus) >= 0; };
  A.finalAvg = function (ev) { return ev && ev.final != null ? ev.final : ev && ev.finalScores ? A.avg(ev.finalScores) : 0; };
  A.reviewCount = function () {
    return Object.keys(S.evals).filter(function (k) { var d = S.evals[k].dbStatus; return d === "pending_hr" || d === "confirmed"; }).length;
  };

  /* ---------- รายการรอตรวจสอบ / ยืนยัน / เผยแพร่ ---------- */
  A.views.reviews = function () {
    var esc = A.esc;
    var ids = Object.keys(S.evals).filter(function (k) { return S.evals[k].status === "submitted"; });
    var rank = { pending_hr: 0, confirmed: 1, published: 2, acknowledged: 3 };
    ids.sort(function (a, b) { return (rank[S.evals[a].dbStatus] - rank[S.evals[b].dbStatus]) || ((S.accounts[a] || {}).name || a).localeCompare((S.accounts[b] || {}).name || b, "th"); });
    var cnt = function (s) { return ids.filter(function (k) { return S.evals[k].dbStatus === s; }).length; };
    var conf = cnt("confirmed"), live = S.cycle && S.cycle.status === "open";
    var rows = ids.map(function (k) {
      var a = S.accounts[k] || { name: k }, ev = S.evals[k], d = ev.dbStatus;
      var sx = A.selfOf(k), sa = sx && sx.status === "submitted" ? A.avg(sx.scores) : 0, ma = A.avg(ev.scores), fa = ev.hrScores && ev.hrScores.some(Boolean) ? A.avg(ev.hrScores) : 0;
      var act = !live ? '<button class="btn sm" data-act="rv-open" data-id="' + esc(k) + '">ดู</button>' : d === "pending_hr" ? '<button class="btn sm primary" data-act="rv-open" data-id="' + esc(k) + '">ตรวจสอบ/ปรับเทียบ</button>'
        : d === "confirmed" ? '<button class="btn sm primary" data-act="rv-pub1" data-id="' + esc(k) + '">เผยแพร่</button><button class="btn sm" data-act="rv-open" data-id="' + esc(k) + '">ดู</button>'
        : '<button class="btn sm" data-act="rv-open" data-id="' + esc(k) + '">ดู</button>';
      return '<tr data-st="' + (d === "published" || d === "acknowledged" ? "submitted" : d === "confirmed" ? "draft" : "none") + '"><td><div class="who-cell"><span class="avatar sm">' + A.initial(a.name) + '</span><b>' + esc(a.name) + '</b></div></td>' +
        '<td>' + esc((S.employees[k] || {}).department || "–") + '</td><td>' + A.stagePill(k) + '</td>' +
        '<td class="n">' + (sa ? sa.toFixed(2) : "–") + '</td><td class="n">' + ma.toFixed(2) + '</td>' +
        '<td class="n"><b>' + (fa ? fa.toFixed(2) : "–") + '</b></td><td>' + (fa ? A.grade(fa) : "–") + '</td>' +
        '<td><div class="row acts">' + act + '</div></td></tr>';
    }).join("");
    return '<div class="stack">' + 
      '<div class="sec-h"><div><h2>ตรวจสอบและยืนยันผล</h2><p class="muted small">ตรวจสอบผลที่ประเมินแล้ว ปรับเทียบคะแนนให้มาตรฐานเดียวกัน ยืนยันผล แล้วเผยแพร่ให้พนักงาน</p></div>' +
        (conf && live ? '<button class="btn primary" data-act="rv-puball">เผยแพร่ผลที่ยืนยันแล้ว (' + conf + ' คน)</button>' : "") + '</div>' +
      '<div class="cards">' +
        '<div class="card mini"><span class="label">รอตรวจสอบ/ปรับเทียบ</span><b class="num big2">' + cnt("pending_hr") + '</b></div>' +
        '<div class="card mini"><span class="label">ยืนยันแล้ว รอเผยแพร่</span><b class="num big2">' + conf + '</b></div>' +
        '<div class="card mini"><span class="label">เผยแพร่แล้ว</span><b class="num big2">' + (cnt("published") + cnt("acknowledged")) + '</b></div>' +
        '<div class="card mini"><span class="label">พนักงานรับทราบแล้ว</span><b class="num big2">' + cnt("acknowledged") + '</b></div></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>พนักงาน</th><th>แผนก</th><th>สถานะ</th><th>คะแนนตนเอง</th><th>คะแนนประเมิน</th><th>คะแนนสุดท้าย</th><th>ระดับ</th><th></th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="8" class="empty">ยังไม่มีผลที่ส่งให้ตรวจสอบ (ส่งผลจากหน้า "ประเมินพนักงาน")</td></tr>') + '</tbody></table></div></div>';
  };

  /* ---------- ปรับเทียบรายคน ---------- */
  A.views.calib = function () {
    var esc = A.esc, k = S.calibId, ev = S.evals[k], a = S.accounts[k] || { name: k };
    var back = '<div><button class="btn sm" data-act="nav" data-view="reviews">← กลับรายการ</button></div>';
    if (!ev || ev.status !== "submitted") return '<div class="stack">' + back + '<section class="panel empty">ไม่พบผลที่รอตรวจสอบ</section></div>';
    var edit = ev.dbStatus === "pending_hr" && S.cycle && S.cycle.status === "open";
    var gl = A.goalsPanel(k, "เป้าหมายของพนักงาน");
    var sx = A.selfOf(k), self = sx && sx.status === "submitted" ? sx.scores : null;
    var base = ev.hrScores && ev.hrScores.some(Boolean) ? ev.hrScores : ev.scores;
    var cats = A.CATS.map(function (c, ci) {
      var items = c.items.map(function (t, qi) {
        var i = ci * A.PER + qi, v = base[i];
        var sel = edit ? '<select id="cb' + i + '" class="cb-sel' + (v !== ev.scores[i] ? " changed" : "") + '" aria-label="คะแนนสุดท้ายข้อ ' + (i + 1) + '">' +
          A.SCALE.map(function (s) { return '<option value="' + s[0] + '"' + (+s[0] === v ? " selected" : "") + '>' + s[0] + '</option>'; }).join("") + '</select>'
          : '<b class="sv">' + (v || "–") + '</b>';
        return '<div class="cmp-row cmp4' + (self && Math.abs(self[i] - ev.scores[i]) >= 2 ? " gap" : "") + '"><span class="n">' + (i + 1) + '</span><span class="t">' + esc(t) + '</span>' +
          '<span class="sv self">' + (self ? self[i] : "–") + '</span><span class="sv">' + ev.scores[i] + '</span>' + sel + '</div>';
      }).join("");
      return '<section class="panel stack"><h3>' + (ci + 1) + '. ' + esc(c.name) + '</h3>' +
        '<div class="cmp-head cmp4"><span></span><span></span><span>ตนเอง</span><span>ประเมิน</span><span>สุดท้าย</span></div>' + items +
        (ev.cc && ev.cc[ci] ? '<div class="note warn"><div class="label">ความเห็นจากขั้นประเมิน</div>' + esc(ev.cc[ci]) + '</div>' : "") + '</section>';
    }).join("");
    var fa = A.avg(base);
    if (S.auditFor !== k) { S.auditFor = k; S.auditRows = null; A.loadAudit(k); }
    var hist = (S.auditRows || []).map(A.auditItem).join("");
    var btns = edit
      ? '<button class="btn" data-act="rv-save">บันทึกการปรับเทียบ</button><button class="btn primary" data-act="rv-confirm">บันทึกและยืนยันผล</button>'
      : ev.dbStatus === "confirmed" ? '<button class="btn" data-act="rv-unconfirm" data-id="' + esc(k) + '">ยกเลิกการยืนยัน</button><button class="btn primary" data-act="rv-pub1" data-id="' + esc(k) + '">เผยแพร่ผลให้พนักงาน</button>' : "";
    return '<div class="stack">' + back + 
      '<section class="panel stack"><div class="sec-h"><div class="who-cell"><span class="avatar">' + A.initial(a.name) + '</span><div><h2>' + esc(a.name) + '</h2><p class="muted small">' + esc(a.position || "") + ' · ' + esc((S.employees[k] || {}).department || "") + '</p></div></div>' + A.stagePill(k) + '</div>' +
        '<div class="cards">' +
          '<div class="card mini"><span class="label">คะแนนประเมินตนเอง</span><b class="num big2">' + (self ? A.avg(self).toFixed(2) : "–") + '</b></div>' +
          '<div class="card mini"><span class="label">คะแนนจากขั้นประเมิน</span><b class="num big2">' + A.avg(ev.scores).toFixed(2) + '</b><span class="muted small">ประเมินโดย ' + esc(ev.evaluatorName || "") + '</span></div>' +
          '<div class="card mini"><span class="label">คะแนนสุดท้าย (หลังปรับเทียบ)</span><b class="num big2" id="cbAvg">' + fa.toFixed(2) + '</b><span class="muted small" id="cbGrade">' + A.grade(fa) + '</span></div></div>' +
        (edit ? '<p class="muted small">ปรับช่อง "สุดท้าย" ได้เฉพาะข้อที่ต้องการ ข้อที่ปรับจะเป็นสีม่วง ถ้าไม่ปรับเลย ระบบใช้คะแนนจากขั้นประเมินเป็นคะแนนสุดท้าย</p>' : "") + '</section>' +
      gl + cats +
      '<section class="panel stack"><h3>ข้อสรุปฉบับสุดท้าย</h3>' +
        '<div class="row2"><div><div class="label">จุดเด่น (ขั้นประเมิน)</div><div class="note">' + esc(ev.strengths || "–") + '</div></div><div><div class="label">สิ่งที่ควรปรับปรุง (ขั้นประเมิน)</div><div class="note warn">' + esc(ev.improvements || "–") + '</div></div></div>' +
        (edit ? '<div class="field"><label for="cbSum">ข้อสรุป / ข้อเสนอแนะฉบับสุดท้าย (พนักงานจะเห็นข้อความนี้)</label><textarea id="cbSum" placeholder="สรุปผลการปรับเทียบ และข้อเสนอแนะ">' + esc(ev.summary || "") + '</textarea></div>'
          : '<div><div class="label">ข้อสรุปฉบับสุดท้าย</div><div class="note">' + esc(ev.summary || "ไม่ได้ระบุ") + '</div></div>') +
        (ev.reply ? '<div><div class="label">ข้อสงสัยจากพนักงาน</div><div class="note warn">' + esc(ev.reply) + '</div></div>' : "") +
        '<p class="err" id="cbMsg"></p><div class="row">' + btns + '</div></section>' +
      '<section class="panel stack"><div class="sec-h"><h3>ประวัติการตรวจสอบและปรับเทียบ</h3><span class="muted small">จาก audit_logs</span></div>' +
        '<div class="flist">' + (S.auditRows ? hist || '<div class="empty">ยังไม่มีประวัติ</div>' : '<div class="empty">กำลังโหลด…</div>') + '</div></section></div>';
  };
  function readCalib() {
    var sc = []; for (var i = 0; i < A.N; i++) sc.push(+((document.getElementById("cb" + i) || {}).value || 0));
    return { scores: sc, summary: ((document.getElementById("cbSum") || {}).value || "").trim() };
  }
  A.calibInput = function (el) {   // อัปเดตคะแนนเฉลี่ยทันทีเมื่อเปลี่ยนตัวเลือก
    var ev = S.evals[S.calibId], i = +el.id.slice(2); if (!ev) return;
    el.classList.toggle("changed", +el.value !== ev.scores[i]);
    var a = A.avg(readCalib().scores), x = document.getElementById("cbAvg"), g = document.getElementById("cbGrade");
    if (x) x.textContent = a.toFixed(2); if (g) g.textContent = A.grade(a);
  };
  async function refreshEvals() { try { var list = await A.api("/evaluations"); S.evals = {}; list.forEach(function (x) { S.evals[x.id] = x; }); } catch (e) {} }
  async function post(path, body) { return A.api(path, { method: "POST", body: JSON.stringify(body || {}) }); }
  A.loadAudit = async function (k) {
    try { var rows = await A.api("/audit?limit=100" + (k ? "&employee=" + encodeURIComponent(k) : "")); if (S.auditFor === k) { S.auditRows = rows; A.render(); } } catch (e) { S.auditRows = []; }
  };
  A.acts["rv-open"] = function (t) { S.calibId = t.getAttribute("data-id"); S.view = "calib"; S.flash = ""; A.render(); window.scrollTo(0, 0); };
  A.acts["rv-save"] = async function () {
    var m = document.getElementById("cbMsg"); m.textContent = "กำลังบันทึก…";
    try { await post("/reviews/" + encodeURIComponent(S.calibId) + "/calibrate", readCalib()); await refreshEvals(); S.auditFor = null; S.flash = "บันทึกการปรับเทียบแล้ว (ยังไม่ยืนยันผล)"; A.render(); window.scrollTo(0, 0); }
    catch (e) { m.textContent = e.message; }
  };
  A.acts["rv-confirm"] = async function () {
    var name = (S.accounts[S.calibId] || {}).name || S.calibId, m = document.getElementById("cbMsg");
    if (!window.confirm("ยืนยันผลการประเมินของ " + name + "?\n\nหลังยืนยันจะแก้คะแนนไม่ได้ จนกว่าจะยกเลิกการยืนยัน")) return;
    m.textContent = "กำลังบันทึก…";
    try {
      await post("/reviews/" + encodeURIComponent(S.calibId) + "/calibrate", readCalib());
      await post("/reviews/" + encodeURIComponent(S.calibId) + "/confirm");
      await refreshEvals(); S.flash = "ยืนยันผลของ " + name + " แล้ว พร้อมเผยแพร่"; S.view = "reviews"; A.render(); window.scrollTo(0, 0);
    } catch (e) { m.textContent = e.message; }
  };
  A.acts["rv-unconfirm"] = async function (t) {
    try { await post("/reviews/" + encodeURIComponent(t.getAttribute("data-id")) + "/unconfirm"); await refreshEvals(); S.auditFor = null; S.flash = "ยกเลิกการยืนยันแล้ว แก้ไขการปรับเทียบได้"; }
    catch (e) { S.flash = "ไม่สำเร็จ: " + e.message; }
    A.render(); window.scrollTo(0, 0);
  };
  async function publish(ids, label) {
    if (!window.confirm("เผยแพร่ผลการประเมินให้ " + label + "?\n\nพนักงานจะเห็นคะแนนสุดท้ายและได้รับแจ้งเตือน")) return;
    try { var r = await post("/reviews/publish", ids ? { ids: ids } : {}); await refreshEvals(); S.flash = "เผยแพร่ผลแล้ว " + r.count + " คน"; S.view = "reviews"; }
    catch (e) { S.flash = "ไม่สำเร็จ: " + e.message; }
    A.render(); window.scrollTo(0, 0);
  }
  A.acts["rv-pub1"] = function (t) { var k = t.getAttribute("data-id"); publish([k], (S.accounts[k] || {}).name || k); };
  A.acts["rv-puball"] = function () { publish(null, "พนักงานทุกคนที่ยืนยันผลแล้ว"); };
})(window.App);
