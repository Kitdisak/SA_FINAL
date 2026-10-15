/* รอบการประเมิน: พนักงานดูรอบ (UC-01) / HR กำหนดรอบ + ขยายเวลา (UC-12, BR-EVAL-07) / HR กำหนดเกณฑ์และแบบประเมิน (UC-13) */
(function (A) {
  var S = A.S;
  A.acts = A.acts || {};
  var CST = { draft: ["ร่าง", "draft"], open: ["เปิดอยู่", "done"], closed: ["ปิดแล้ว", ""] };

  function range(s, e) { return A.fday(s) + " – " + A.fday(e); }
  function stageState(st) { var t = A.today(); return t < st.start ? "next" : t > st.end ? "past" : "now"; }
  function cpill(c) { var x = CST[c.status] || [c.status, ""]; return '<span class="pill ' + x[1] + '">' + x[0] + '</span>'; }
  function keyName(k) { var x = A.STAGE_KEYS.find(function (s) { return s[0] === k; }); return x ? x[1] : ""; }

  function timeline(c, live) {
    return '<ol class="tl">' + c.stages.map(function (st, i) {
      var k = live ? stageState(st) : "past";
      return '<li class="tl-' + k + '"><span class="tl-dot">' + (k === "past" ? "✓" : i + 1) + '</span><div><b>' + A.esc(st.name) + '</b>' +
        '<span class="muted small">' + range(st.start, st.end) + (st.key ? ' · ' + keyName(st.key) : "") + (k === "now" ? ' · <b class="now-tag">ช่วงนี้</b>' : "") + '</span></div></li>';
    }).join("") + '</ol>';
  }

  /* ---------- UC-01 พนักงานดูรอบการประเมิน ---------- */
  A.views.cycle = function () {
    var esc = A.esc, c = S.cycle;
    if (!c) return '<section class="panel empty-state"><h3>ยังไม่มีรอบการประเมิน</h3><p class="muted">ระบบแจ้งว่าไม่มีรอบการประเมินในขณะนี้ เมื่อ HR เปิดรอบแล้ว รายละเอียดจะแสดงที่นี่</p></section>';
    var goals = S.goals || [], ap = goals.filter(function (g) { return g.status === "approved"; }).length;
    var x = A.selfOf ? A.selfOf(S.me.id) : null, ev = S.evals[S.me.id];
    function due(key, done) {
      if (done) return "";
      var w = A.win(key); if (!w.stage) return "";
      if (w.state === "after") return ' <span class="pill late">เลยกำหนด ' + A.fday(w.until) + '</span>';
      if (w.state === "before") return ' <span class="pill">เริ่ม ' + A.fday(w.stage.start) + '</span>';
      if (w.state === "open") return ' <span class="pill' + (w.left <= 3 ? " late" : "") + '">ส่งได้ถึง ' + A.fday(w.until) + (w.ext ? " (ขยายเวลา)" : "") + '</span>';
      return "";
    }
    function step(done, title, sub, view, btn, extra) {
      return '<div class="todo' + (done ? " ok" : "") + '"><span class="todo-ic">' + (done ? "✓" : "•") + '</span><div class="grow"><b>' + title + (extra || "") + '</b><span class="muted small">' + sub + '</span></div>' +
        (view ? '<button class="btn sm' + (done ? "" : " primary") + '" data-act="nav" data-view="' + view + '">' + btn + '</button>' : "") + '</div>';
    }
    var gDone = goals.length && ap === goals.length, sDone = x && x.status === "submitted";
    var todos =
      step(gDone, "1. กำหนดเป้าหมาย", goals.length ? "อนุมัติแล้ว " + ap + "/" + goals.length + " ข้อ" : "ยังไม่ได้กำหนดเป้าหมาย (ขั้นต่ำ " + (c.minGoals || 0) + " ข้อ)", "goals", "เป้าหมายของฉัน", due("goal", gDone || goals.some(function (g) { return g.status !== "draft"; }))) +
      step(sDone, "2. ประเมินตนเองและส่งให้ HR", sDone ? "ส่งแล้วเมื่อ " + A.fdate(x.submittedAt) : x && x.returnReason ? "HR ส่งกลับให้แก้ไข" : x && x.status === "draft" ? "บันทึกร่างไว้ ยังไม่ส่ง" : "ยังไม่ได้ทำ", "self", "ประเมินตนเอง", due("self", sDone)) +
      step(!!ev, "3. HR ประเมิน ตรวจสอบ และเผยแพร่ผล", ev ? "เผยแพร่ผลแล้วเมื่อ " + A.fdate(ev.publishedAt || ev.submittedAt) : "รอ HR ดำเนินการ", ev ? "mine" : "", "ดูผล") +
      step(ev && ev.ack, "4. ตรวจสอบผลและกดรับทราบ", ev && ev.ack ? "รับทราบแล้วเมื่อ " + A.fdate(ev.ackAt) : "ทำได้เมื่อผลเผยแพร่แล้ว", ev && !ev.ack ? "mine" : "", "รับทราบผล");
    var exts = (c.extensions || []).map(function (e) { return '<li>' + keyName(e.stage) + ': ส่งได้ถึง <b>' + A.fday(e.until) + '</b>' + (e.reason ? ' <span class="muted">(' + esc(e.reason) + ')</span>' : "") + '</li>'; }).join("");
    return '<div class="stack">' + A.cyclePicker() +
      '<section class="panel stack"><div class="sec-h"><div><h2>' + esc(c.name) + '</h2><p class="muted small">' + range(c.start, c.end) + ' · ' + esc(c.formName || "") + '</p></div>' + cpill(c) + '</div>' +
        (c.status !== "open" ? '<p class="note warn">รอบนี้ปิดแล้ว ดูข้อมูลได้อย่างเดียว</p>' : "") +
        (exts ? '<div class="note"><div class="label">HR อนุมัติให้ดำเนินการเพิ่มเติม</div><ul class="plain">' + exts + '</ul></div>' : "") + '</section>' +
      '<div class="dash">' +
        '<section class="panel stack"><h3>ช่วงเวลาแต่ละขั้นตอน</h3>' + timeline(c, c.status === "open") + '</section>' +
        '<section class="panel stack"><h3>สิ่งที่ต้องทำของฉัน</h3><div class="todos">' + todos + '</div></section>' +
      '</div></div>';
  };

  /* ---------- UC-12 HR กำหนดรอบการประเมิน ---------- */
  function syncEdit() {   // เก็บค่าที่พิมพ์ไว้ก่อน render ใหม่
    var e = S.cycleEdit; if (!e) return;
    var v = function (id) { var el = document.getElementById(id); return el ? el.value : null; };
    if (v("cy-name") != null) { e.name = v("cy-name"); e.start = v("cy-start"); e.end = v("cy-end"); e.minGoals = +v("cy-min"); }
    e.stages.forEach(function (st, i) { if (v("st-n" + i) != null) { st.name = v("st-n" + i); st.key = v("st-k" + i); st.start = v("st-s" + i); st.end = v("st-e" + i); } });
  }
  function editor() {
    var e = S.cycleEdit, esc = A.esc;
    var rows = e.stages.map(function (st, i) {
      return '<div class="st-row st5"><span class="num muted">' + (i + 1) + '</span>' +
        '<input id="st-n' + i + '" value="' + esc(st.name) + '" placeholder="ชื่อขั้นตอน" aria-label="ชื่อขั้นตอน ' + (i + 1) + '">' +
        '<select id="st-k' + i + '" aria-label="ประเภทขั้นตอน"><option value="">ไม่ใช้ตรวจเวลา</option>' + A.STAGE_KEYS.map(function (k) { return '<option value="' + k[0] + '"' + (st.key === k[0] ? " selected" : "") + '>' + k[1] + '</option>'; }).join("") + '</select>' +
        '<input type="date" id="st-s' + i + '" value="' + esc(st.start) + '" aria-label="วันเริ่ม">' +
        '<input type="date" id="st-e' + i + '" value="' + esc(st.end) + '" aria-label="วันสิ้นสุด">' +
        '<button type="button" class="btn sm danger icon" data-act="st-del" data-i="' + i + '" title="ลบขั้นตอน" aria-label="ลบขั้นตอน">✕</button></div>';
    }).join("");
    return '<section class="panel stack edit-box"><h3>' + (e.id ? "แก้ไขรอบการประเมิน" : "สร้างรอบการประเมินใหม่") + '</h3>' +
      '<div class="grid4"><div class="field"><label for="cy-name">ชื่อรอบ</label><input id="cy-name" value="' + esc(e.name) + '" maxlength="100"></div>' +
        '<div class="field"><label for="cy-start">วันเริ่มรอบ</label><input type="date" id="cy-start" value="' + esc(e.start) + '"></div>' +
        '<div class="field"><label for="cy-end">วันสิ้นสุดรอบ</label><input type="date" id="cy-end" value="' + esc(e.end) + '"></div>' +
        '<div class="field"><label for="cy-min">เป้าหมายขั้นต่ำ (ข้อ)</label><input type="number" id="cy-min" min="0" max="10" value="' + (e.minGoals == null ? 1 : e.minGoals) + '"></div></div>' +
      '<div><div class="label">ช่วงเวลาแต่ละขั้นตอน — "ประเภท" ใช้ตรวจกำหนดส่ง: พ้นวันสิ้นสุดแล้วพนักงานจะส่งไม่ได้ เว้นแต่ HR อนุมัติขยายเวลา</div><div class="st-rows">' + rows + '</div>' +
        '<button type="button" class="btn sm" data-act="st-add">+ เพิ่มขั้นตอน</button></div>' +
      (e.id ? "" : '<p class="muted small">รอบใหม่จะคัดลอกแบบประเมิน เกณฑ์ และระดับคะแนนจากรอบล่าสุด และอยู่ในสถานะ "ร่าง" จนกว่าจะกดเปิดรอบ</p>') +
      '<p class="err" id="cyMsg">' + esc(S.cycleMsg || "") + '</p>' +
      '<div class="row"><button class="btn primary" data-act="cy-save">บันทึก</button><button class="btn" data-act="cy-cancel">ยกเลิก</button></div></section>';
  }
  // HR อนุมัติให้ดำเนินการเพิ่มเติม (BR-EVAL-07)
  function extPanel() {
    var esc = A.esc, c = S.cycle, pre = S.extPre || {};
    if (!c || c.status !== "open") return "";
    var emps = Object.keys(S.accounts).filter(function (k) { return S.accounts[k].role === "evaluatee"; })
      .sort(function (a, b) { return S.accounts[a].name.localeCompare(S.accounts[b].name, "th"); });
    var list = (c.extensions || []).map(function (x) {
      return '<div class="fitem"><span class="avatar sm">' + A.initial((S.accounts[x.userId] || {}).name) + '</span><div class="grow"><b>' + esc((S.accounts[x.userId] || {}).name || x.userId) + '</b>' +
        '<span class="muted small">' + keyName(x.stage) + ' · ส่งได้ถึง ' + A.fday(x.until) + (x.reason ? ' · ' + esc(x.reason) : "") + '</span></div>' +
        '<button class="btn sm danger" data-act="ext-del" data-id="' + x.id + '">ยกเลิก</button></div>';
    }).join("");
    return '<section class="panel stack" id="extPanel"><h3>อนุมัติให้ส่งหลังกำหนด (ขยายเวลา)</h3>' +
      '<p class="muted small">ใช้เมื่อพนักงานส่งเป้าหมายหรือแบบประเมินตนเองไม่ทันกำหนด ระบบจะเปิดให้คนนั้นส่งได้ถึงวันที่อนุมัติ และแจ้งเตือนพนักงาน</p>' +
      '<div class="grid4"><div class="field"><label for="ex-emp">พนักงาน</label><select id="ex-emp">' + emps.map(function (k) { return '<option value="' + esc(k) + '"' + (pre.id === k ? " selected" : "") + '>' + esc(S.accounts[k].name) + '</option>'; }).join("") + '</select></div>' +
        '<div class="field"><label for="ex-stage">ขั้นตอน</label><select id="ex-stage"><option value="self"' + (pre.stage !== "goal" ? " selected" : "") + '>ประเมินตนเอง</option><option value="goal"' + (pre.stage === "goal" ? " selected" : "") + '>กำหนดเป้าหมาย</option></select></div>' +
        '<div class="field"><label for="ex-until">ส่งได้ถึงวันที่</label><input type="date" id="ex-until" value="' + A.addDays(A.today(), 7) + '" min="' + A.today() + '" max="' + c.end + '"></div>' +
        '<div class="field"><label for="ex-reason">เหตุผล</label><input id="ex-reason" maxlength="500" placeholder="เช่น ลาป่วย"></div></div>' +
      '<p class="err" id="exMsg"></p><div class="row"><button class="btn primary" data-act="ext-save">อนุมัติขยายเวลา</button></div>' +
      (list ? '<div class="flist">' + list + '</div>' : '<p class="muted small">ยังไม่มีการขยายเวลา</p>') + '</section>';
  }
  A.views.cycles = function () {
    var esc = A.esc, list = S.cycles;
    if (!list) { A.loadCycles(); return '<section class="panel empty">กำลังโหลด…</section>'; }
    var cards = list.map(function (c) {
      return '<section class="panel stack cy-card' + (c.status === "open" ? " on" : "") + '"><div class="sec-h"><div><h3>' + esc(c.name) + '</h3>' +
        '<p class="muted small">' + range(c.start, c.end) + ' · ' + c.stages.length + ' ขั้นตอน · เป้าหมายขั้นต่ำ ' + (c.minGoals || 0) + ' ข้อ · ' + esc(c.formName || "") + '</p></div>' + cpill(c) + '</div>' +
        timeline(c, c.status === "open") +
        '<div class="row">' + (c.status !== "closed" ? '<button class="btn sm" data-act="cy-edit" data-id="' + c.id + '">แก้ไข</button>' : "") +
        (c.status === "draft" ? '<button class="btn sm primary" data-act="cy-open" data-id="' + c.id + '">เปิดรอบ</button>' : "") +
        (c.status === "open" ? '<button class="btn sm danger" data-act="cy-close" data-id="' + c.id + '">ปิดรอบ</button>' : "") + '</div></section>';
    }).join("");
    return '<div class="stack">' +
      '<div class="sec-h"><div><h2>กำหนดรอบการประเมิน</h2><p class="muted small">สร้างรอบ กำหนดช่วงเวลาแต่ละขั้นตอน เปิด/ปิดรอบ (เปิดได้ครั้งละ 1 รอบ) และอนุมัติขยายเวลารายบุคคล</p></div>' +
        (S.cycleEdit ? "" : '<button class="btn primary" data-act="cy-new">+ สร้างรอบใหม่</button>') + '</div>' +
      (S.cycleEdit ? editor() : "") + (S.viewCycle ? "" : extPanel()) + (cards || '<div class="empty">ยังไม่มีรอบการประเมิน</div>') + '</div>';
  };
  A.loadCycles = async function () {
    try { S.cycles = await A.api("/cycles"); A.softRender(); } catch (e) { S.cycles = []; S.flash = e.message; A.render(); }
  };
  async function cycleAction(path, msg, okMsg) {
    if (msg && !window.confirm(msg)) return;
    try { await A.api(path, { method: "POST", body: "{}" }); S.flash = okMsg; S.viewCycle = null; await A.reloadAll(); }
    catch (e) { S.flash = "ไม่สำเร็จ: " + e.message; }
    S.cycles = null; A.render(); window.scrollTo(0, 0);
  }
  A.acts["cy-new"] = function () {
    var L = (S.cycles || []).slice().sort(function (a, b) { return a.end < b.end ? 1 : -1; }), c = L[0];
    var y = new Date().getFullYear() + 1;
    if (c) {   // เริ่มวันถัดจากรอบล่าสุด ระยะเวลาเท่าเดิม ขั้นตอนเลื่อนตาม
      var start = A.addDays(c.end, 1), off = Math.round((Date.parse(start) - Date.parse(c.start)) / 86400000);
      var len = Math.round((Date.parse(c.end) - Date.parse(c.start)) / 86400000);
      S.cycleEdit = { id: null, name: "รอบประเมิน ปี " + (+start.slice(0, 4) + 543), start: start, end: A.addDays(start, len), minGoals: c.minGoals,
        stages: c.stages.map(function (s) { return { name: s.name, key: s.key, start: A.addDays(s.start, off), end: A.addDays(s.end, off) }; }) };
    } else {
      S.cycleEdit = { id: null, name: "รอบประเมิน ปี " + (y + 543), start: y + "-01-01", end: y + "-12-31", minGoals: 1, stages: [{ name: "ประเมินตนเอง", key: "self", start: y + "-09-01", end: y + "-10-31" }] };
    }
    S.cycleMsg = ""; A.render(); window.scrollTo(0, 0);
  };
  A.acts["cy-edit"] = function (t) {
    var c = S.cycles.find(function (x) { return x.id === +t.getAttribute("data-id"); }); if (!c) return;
    S.cycleEdit = { id: c.id, name: c.name, start: c.start, end: c.end, minGoals: c.minGoals, stages: c.stages.map(function (s) { return { name: s.name, key: s.key, start: s.start, end: s.end }; }) };
    S.cycleMsg = ""; A.render(); window.scrollTo(0, 0);
  };
  A.acts["cy-cancel"] = function () { S.cycleEdit = null; S.cycleMsg = ""; A.render(); };
  A.acts["st-add"] = function () { syncEdit(); var e = S.cycleEdit, last = e.stages[e.stages.length - 1]; e.stages.push({ name: "", key: "", start: last ? last.end : e.start, end: e.end }); A.render(); };
  A.acts["st-del"] = function (t) { syncEdit(); S.cycleEdit.stages.splice(+t.getAttribute("data-i"), 1); A.render(); };
  A.acts["cy-save"] = async function () {
    syncEdit(); var e = S.cycleEdit, m = document.getElementById("cyMsg");
    try {
      await A.api(e.id ? "/cycles/" + e.id : "/cycles", { method: e.id ? "PUT" : "POST", body: JSON.stringify({ name: e.name, start: e.start, end: e.end, minGoals: e.minGoals, stages: e.stages }) });
      S.flash = e.id ? "บันทึกรอบการประเมินแล้ว" : "สร้างรอบใหม่แล้ว (สถานะร่าง) กด \"เปิดรอบ\" เมื่อพร้อม";
      S.cycleEdit = null; S.cycles = null; await A.loadCycle(); A.render(); window.scrollTo(0, 0);
    } catch (err) { S.cycleMsg = err.message; if (m) m.textContent = err.message; }
  };
  A.acts["cy-open"] = function (t) {
    cycleAction("/cycles/" + t.getAttribute("data-id") + "/open", "เปิดรอบนี้?\n\nรอบที่เปิดอยู่เดิมจะถูกปิด และระบบจะสร้างรายการประเมินให้พนักงานทุกคน", "เปิดรอบการประเมินแล้ว แจ้งเตือนพนักงานทุกคนแล้ว");
  };
  A.acts["cy-close"] = function (t) {
    cycleAction("/cycles/" + t.getAttribute("data-id") + "/close", "ปิดรอบนี้?\n\nหลังปิดรอบ จะแก้ไขเป้าหมาย การประเมิน และผลการประเมินของรอบนี้ไม่ได้ (ยังดูย้อนหลังได้)", "ปิดรอบการประเมินแล้ว");
  };
  A.acts["ext-save"] = async function () {
    var v = function (id) { return (document.getElementById(id) || {}).value || ""; }, m = document.getElementById("exMsg");
    try {
      var r = await A.api("/extensions", { method: "POST", body: JSON.stringify({ employee: v("ex-emp"), stage: v("ex-stage"), until: v("ex-until"), reason: v("ex-reason") }) });
      S.extPre = null; await A.loadCycle(); S.flash = "อนุมัติขยายเวลาให้ " + r.name + " แล้ว"; A.render(); window.scrollTo(0, 0);
    } catch (e) { if (m) m.textContent = e.message; }
  };
  A.acts["ext-del"] = async function (t) {
    if (!window.confirm("ยกเลิกการขยายเวลานี้?")) return;
    try { await A.api("/extensions/" + t.getAttribute("data-id"), { method: "DELETE" }); await A.loadCycle(); S.flash = "ยกเลิกการขยายเวลาแล้ว"; }
    catch (e) { S.flash = "ไม่สำเร็จ: " + e.message; }
    A.render();
  };
  // ปุ่ม "ขยายเวลา" จากหน้าติดตามสถานะ
  A.acts["ext-pre"] = function (t) {
    S.extPre = { id: t.getAttribute("data-id"), stage: t.getAttribute("data-stage") };
    S.view = "cycles"; S.cycleEdit = null; S.flash = ""; A.render();
    var p = document.getElementById("extPanel"); if (p) p.scrollIntoView({ block: "start" });
  };
  A.acts["cyc-current"] = function () { A.switchCycle(null); };

  /* ---------- UC-13 HR กำหนดเกณฑ์และแบบประเมิน ---------- */
  var REQS = [["strengths", "จุดเด่นของพนักงาน (HR)"], ["improvements", "สิ่งที่ควรปรับปรุงโดยรวม (HR)"], ["catComment", "ความเห็นรายหมวดครบ 5 หมวด (HR)"],
    ["selfComment", "สรุปผลงานของตนเอง (พนักงาน)"], ["selfCatComment", "ความเห็นรายหมวดครบ 5 หมวด (พนักงาน)"]];
  A.scaleRows = function (max) {
    for (var i = 0; i < 5; i++) { var r = document.getElementById("lvrow" + i); if (r) r.hidden = i >= max; }
  };
  A.views.criteria = function () {
    var esc = A.esc, f = S.form;
    if (!f) return '<section class="panel empty">กำลังโหลด…</section>';
    var ro = f.cycleStatus === "closed" || !!S.viewCycle;
    var dis = ro ? " disabled" : "";
    var st = f.settings || { max: 5, labels: [], req: {} };
    var defs = ["ต้องปรับปรุงมาก", "ต้องปรับปรุง", "ตามเกณฑ์", "ดี", "ดีเยี่ยม"];
    var levels = [0, 1, 2, 3, 4].map(function (i) {
      return '<div class="lv-row" id="lvrow' + i + '"' + (i >= st.max ? " hidden" : "") + '><span class="lv-n num">' + (i + 1) + '</span><input id="lv' + i + '" value="' + esc(st.labels[i] || defs[i]) + '" maxlength="60" aria-label="ชื่อระดับคะแนน ' + (i + 1) + '"' + dis + '></div>';
    }).join("");
    var reqs = REQS.map(function (r) { return '<label class="chk"><input type="checkbox" id="rq-' + r[0] + '"' + (st.req[r[0]] ? " checked" : "") + dis + '> ' + r[1] + '</label>'; }).join("");
    var cats = [0, 1, 2, 3, 4].map(function (ci) {
      var items = f.criteria.slice(ci * 4, ci * 4 + 4).map(function (c, qi) {
        var i = ci * 4 + qi;
        return '<div class="cr-item"><span class="n num">' + (i + 1) + '</span><div class="grow stack-s">' +
          '<input id="cr-t' + i + '" value="' + esc(c.title) + '" maxlength="150" aria-label="หัวข้อที่ ' + (i + 1) + '"' + dis + '>' +
          '<input id="cr-d' + i + '" value="' + esc(c.description) + '" maxlength="300" placeholder="คำอธิบาย / ตัวอย่างพฤติกรรม (ถ้ามี)" class="sub" aria-label="คำอธิบายหัวข้อที่ ' + (i + 1) + '"' + dis + '></div>' +
          '<span class="pill">' + c.min + '–' + c.max + '</span></div>';
      }).join("");
      return '<section class="panel stack"><div class="field"><label for="cr-c' + ci + '">หมวดที่ ' + (ci + 1) + '</label>' +
        '<input id="cr-c' + ci + '" class="cat-in" value="' + esc((f.criteria[ci * 4] || {}).category || "") + '" maxlength="100"' + dis + '></div>' + items + '</section>';
    }).join("");
    return '<div class="stack">' +
      '<section class="panel stack"><h2>เกณฑ์และแบบประเมิน</h2>' +
        '<p class="muted small">แบบประเมินของรอบ "' + esc((S.cycle || {}).name || "") + '" มี 20 ข้อ 5 หมวด ใช้ทั้งการประเมินตนเองและการประเมินของ HR</p>' +
        (ro ? '<p class="note warn">รอบนี้ปิดแล้ว แก้ไขแบบประเมินไม่ได้</p>' : f.inUse ? '<p class="note warn">รอบนี้มีการให้คะแนนแล้ว: แก้ชื่อหัวข้อ/ชื่อระดับได้ แต่เปลี่ยนจำนวนระดับคะแนนไม่ได้ เพื่อไม่ให้คะแนนเดิมผิดความหมาย (BR-HR-03)</p>' : "") +
        '<div class="field"><label for="fm-name">ชื่อแบบประเมิน</label><input id="fm-name" value="' + esc(f.name) + '" maxlength="100"' + dis + '></div>' +
        '<div class="field"><label for="fm-desc">รายละเอียดแบบประเมิน</label><textarea id="fm-desc"' + dis + '>' + esc(f.description) + '</textarea></div></section>' +
      '<div class="dash">' +
        '<section class="panel stack"><h3>ระดับคะแนน</h3><div class="field"><label for="sc-max">จำนวนระดับ</label><select id="sc-max"' + (ro || f.inUse ? " disabled" : "") + '>' +
          [3, 4, 5].map(function (n) { return '<option value="' + n + '"' + (n === st.max ? " selected" : "") + '>' + n + ' ระดับ (1–' + n + ')</option>'; }).join("") + '</select></div>' +
          '<div class="lv-rows">' + levels + '</div></section>' +
        '<section class="panel stack"><h3>ข้อมูลที่ต้องกรอกก่อนส่ง</h3><p class="muted small">นอกจากคะแนนครบทุกข้อ (บังคับเสมอ) เลือกช่องที่ต้องกรอกก่อนกดส่ง</p><div class="chks">' + reqs + '</div></section>' +
      '</div>' +
      cats +
      (ro ? "" : '<section class="panel row" style="justify-content:space-between"><p class="err" id="crMsg"></p><button class="btn primary" data-act="cr-save">บันทึกแบบประเมิน</button></section>') +
    '</div>';
  };
  A.acts["cr-save"] = async function () {
    var v = function (id) { return (document.getElementById(id) || {}).value || ""; }, m = document.getElementById("crMsg");
    var max = +v("sc-max") || 5, req = {};
    REQS.forEach(function (r) { var el = document.getElementById("rq-" + r[0]); req[r[0]] = !!(el && el.checked); });
    var body = { name: v("fm-name").trim(), description: v("fm-desc"), categories: [0, 1, 2, 3, 4].map(function (i) { return v("cr-c" + i).trim(); }),
      items: S.form.criteria.map(function (_, i) { return { title: v("cr-t" + i).trim(), description: v("cr-d" + i).trim() }; }),
      max: max, labels: [0, 1, 2, 3, 4].slice(0, max).map(function (i) { return v("lv" + i).trim(); }), req: req };
    if (m) m.textContent = "กำลังบันทึก…";
    try {
      await A.api("/form", { method: "PUT", body: JSON.stringify(body) });
      await A.loadForm(); S.flash = "บันทึกแบบประเมินแล้ว"; A.render(); window.scrollTo(0, 0);
    } catch (e) { if (m) m.textContent = e.message; }
  };
})(window.App);
