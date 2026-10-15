/* เป้าหมาย: พนักงานกำหนด/ปรับปรุงเป้าหมาย (UC-02) และพี่เลี้ยงตรวจสอบเป้าหมาย (UC-07) */
(function (A) {
  var S = A.S;
  A.acts = A.acts || {};
  var GST = { draft: ["ร่าง", "draft"], pending_review: ["รอพี่เลี้ยงตรวจสอบ", "ask"], approved: ["อนุมัติแล้ว", "done"], returned: ["ส่งกลับแก้ไข", "draft"] };
  A.goalPill = function (s) { var x = GST[s] || [s, ""]; return '<span class="pill ' + x[1] + '">' + x[0] + '</span>'; };
  function hrCanEdit() { return S.cycle && S.cycle.status === "open" && !S.viewCycle; }
  function canEdit() { return hrCanEdit() && A.win("goal").state === "open"; }   // พนักงาน: ต้องอยู่ในช่วงกำหนดเป้าหมาย (BR-EVAL-07)

  // รายการเป้าหมายของพนักงาน 1 คน (ใช้ในหน้าประเมินตนเองและแบบประเมินของ HR — UC-03 ขั้นที่ 4, UC-08 ขั้นที่ 3)
  A.goalsPanel = function (uid, title) {
    var esc = A.esc, gs = (S.goals || []).filter(function (g) { return g.userId === uid; });
    var body = gs.length ? gs.map(function (g) {
      return '<div class="goal-mini"><div class="sec-h"><b>' + esc(g.title) + '</b>' + A.goalPill(g.status) + '</div>' + (g.detail ? '<span class="muted small pre">' + esc(g.detail) + '</span>' : "") + '</div>';
    }).join("") : '<p class="muted small">' + (S.me.role !== "evaluatee" ? "พนักงานยังไม่ได้ส่งเป้าหมายในรอบนี้" : "ยังไม่ได้กำหนดเป้าหมายในรอบนี้") + '</p>';
    return '<details class="goals-box"' + (gs.length ? " open" : "") + '><summary><span>' + esc(title || "เป้าหมายในรอบนี้") + '</span><span class="muted small">' + gs.length + ' ข้อ</span></summary>' + body + '</details>';
  };

  /* ---------- UC-02 พนักงาน ---------- */
  function editor(g) {
    var esc = A.esc;
    return '<div class="goal edit-box"><div class="field"><label for="gl-t">หัวข้อเป้าหมาย</label><input id="gl-t" maxlength="150" value="' + esc(g ? g.title : "") + '" placeholder="เช่น ปิดงบรายเดือนภายใน 3 วันทำการ"></div>' +
      '<div class="field"><label for="gl-d">รายละเอียด / ตัวชี้วัด <span class="req">*จำเป็นก่อนส่ง</span></label><textarea id="gl-d" maxlength="2000" placeholder="วัดผลอย่างไร ภายในเมื่อไร">' + esc(g ? g.detail : "") + '</textarea></div>' +
      '<p class="err" id="glMsg"></p><div class="row"><button class="btn primary" data-act="gl-save">บันทึก</button><button class="btn" data-act="gl-cancel">ยกเลิก</button></div></div>';
  }
  A.views.goals = function () {
    var esc = A.esc, list = S.goals || [], open = canEdit();
    var waiting = list.filter(function (g) { return g.status === "draft" || g.status === "returned"; }).length;
    var cards = list.map(function (g) {
      if (S.goalEdit === g.id) return editor(g);
      var editable = open && (g.status === "draft" || g.status === "returned");
      return '<div class="goal"><div class="sec-h"><b>' + esc(g.title) + '</b>' + A.goalPill(g.status) + '</div>' +
        (g.detail ? '<p class="muted pre">' + esc(g.detail) + '</p>' : "") +
        (g.comment ? '<div class="note' + (g.status === "returned" ? " warn" : "") + '"><div class="label">ความเห็นจากพี่เลี้ยง</div>' + esc(g.comment) + '</div>' : "") +
        (editable ? '<div class="row"><button class="btn sm" data-act="gl-edit" data-id="' + g.id + '">แก้ไข</button><button class="btn sm danger" data-act="gl-del" data-id="' + g.id + '">ลบ</button></div>' : "") + '</div>';
    }).join("");
    return '<div class="stack">' + 
      A.cyclePicker() +
      '<section class="panel stack"><div class="sec-h"><div><h2>เป้าหมายของฉัน</h2><p class="muted small">กำหนดเป้าหมายการทำงานในรอบนี้ ' + (S.cycle && S.cycle.minGoals ? "อย่างน้อย <b>" + S.cycle.minGoals + " ข้อ</b> " : "") + '(ไม่เกิน 10 ข้อ) ทุกข้อต้องมีรายละเอียด/ตัวชี้วัด แล้วส่งให้พี่เลี้ยงตรวจสอบ เป้าหมายที่ถูกส่งกลับแก้ไขแล้วส่งใหม่ได้</p></div>' +
        (open && !S.goalEdit && list.length < 10 ? '<button class="btn primary" data-act="gl-new">+ เพิ่มเป้าหมาย</button>' : "") + '</div>' +
        (waiting || !list.length ? A.deadlineNote("goal") : "") +
        (S.goalEdit === "new" ? editor(null) : "") +
        (cards || (S.goalEdit ? "" : '<div class="empty">ยังไม่มีเป้าหมาย กด "เพิ่มเป้าหมาย" เพื่อเริ่ม</div>')) +
        (open && waiting && !S.goalEdit ? '<div class="row" style="justify-content:flex-end"><span class="muted small">มี ' + waiting + ' ข้อที่ยังไม่ได้ส่ง</span><button class="btn primary" data-act="gl-submit">ส่งให้พี่เลี้ยงตรวจสอบ</button></div>' : "") +
      '</section></div>';
  };
  A.loadGoals = async function () {
    try { var g = await A.api("/goals" + A.cq()), sig = JSON.stringify(g); if (sig !== A._lastGoals) { A._lastGoals = sig; S.goals = g; A.softRender(); } } catch (e) {}
  };
  async function goalCall(path, method, body, okMsg) {
    try { await A.api(path, { method: method, body: JSON.stringify(body || {}) }); S.flash = okMsg; S.goalEdit = null; await A.loadGoals(); }
    catch (e) { S.flash = "ไม่สำเร็จ: " + e.message; }
    A.render();
  }
  A.acts["gl-new"] = function () { S.goalEdit = "new"; S.flash = ""; A.render(); var t = document.getElementById("gl-t"); if (t) t.focus(); };
  A.acts["gl-edit"] = function (t) { S.goalEdit = +t.getAttribute("data-id"); S.flash = ""; A.render(); };
  A.acts["gl-cancel"] = function () { S.goalEdit = null; A.render(); };
  A.acts["gl-save"] = async function () {
    var title = document.getElementById("gl-t").value.trim(), detail = document.getElementById("gl-d").value.trim(), m = document.getElementById("glMsg");
    if (!title) { m.textContent = "กรุณาระบุหัวข้อเป้าหมาย"; return; }
    var id = S.goalEdit;
    try {
      await A.api(id === "new" ? "/goals" : "/goals/" + id, { method: id === "new" ? "POST" : "PUT", body: JSON.stringify({ title: title, detail: detail }) });
      S.goalEdit = null; S.flash = "บันทึกเป้าหมายแล้ว (ยังไม่ได้ส่งให้พี่เลี้ยง)"; await A.loadGoals(); A.render();
    } catch (e) { m.textContent = e.message; }
  };
  A.acts["gl-del"] = function (t) { if (window.confirm("ลบเป้าหมายนี้?")) goalCall("/goals/" + t.getAttribute("data-id"), "DELETE", null, "ลบเป้าหมายแล้ว"); };
  A.acts["gl-submit"] = function () {
    var list = S.goals || [], min = (S.cycle && S.cycle.minGoals) || 0;
    var miss = list.find(function (g) { return (g.status === "draft" || g.status === "returned") && !g.detail.trim(); });
    if (list.length < min) { S.flash = "ต้องกำหนดเป้าหมายอย่างน้อย " + min + " ข้อก่อนส่ง (ตอนนี้มี " + list.length + " ข้อ)"; A.render(); return; }
    if (miss) { S.flash = "กรุณาระบุรายละเอียด/ตัวชี้วัดของเป้าหมาย \"" + miss.title + "\" ก่อนส่ง"; A.render(); return; }
    if (window.confirm("ส่งเป้าหมายให้พี่เลี้ยงตรวจสอบ?\n\nระหว่างรอตรวจสอบจะแก้ไขไม่ได้")) goalCall("/goals/submit", "POST", {}, "ส่งเป้าหมายให้พี่เลี้ยงตรวจสอบแล้ว");
  };

  /* ---------- UC-07 พี่เลี้ยงตรวจสอบเป้าหมาย ---------- */
  A.pendingGoals = function () { return (S.goals || []).filter(function (g) { return g.status === "pending_review"; }).length; };
  A.views.goalreview = function () {
    var esc = A.esc, tab = S.goalTab || "pending", list = S.goals || [];
    var by = {};
    list.forEach(function (g) { (by[g.userId] = by[g.userId] || []).push(g); });
    var ids = Object.keys(by).filter(function (k) { return tab === "all" || by[k].some(function (g) { return g.status === "pending_review"; }); })
      .sort(function (a, b) { return ((S.accounts[a] || {}).name || a).localeCompare((S.accounts[b] || {}).name || b, "th"); });
    var none = A.staff().filter(function (k) { return !by[k]; }).length;
    var cards = ids.map(function (k) {
      var a = S.accounts[k] || { name: k }, dep = (S.employees[k] || {}).department;
      var gs = by[k].filter(function (g) { return tab === "all" || g.status === "pending_review"; }).map(function (g) {
        var pend = g.status === "pending_review";
        return '<div class="goal"><div class="sec-h"><b>' + esc(g.title) + '</b>' + A.goalPill(g.status) + '</div>' +
          (g.detail ? '<p class="muted pre">' + esc(g.detail) + '</p>' : "") +
          (g.comment ? '<div class="note"><div class="label">ความเห็นพี่เลี้ยง</div>' + esc(g.comment) + '</div>' : "") +
          (pend && hrCanEdit() && S.me.role === "mentor" ? '<div class="row"><button class="btn sm primary" data-act="gr-ok" data-id="' + g.id + '">อนุมัติ</button><button class="btn sm" data-act="gr-back" data-id="' + g.id + '">ส่งกลับให้แก้ไข</button></div>' : "") + '</div>';
      }).join("");
      return '<section class="panel stack"><div class="who-cell"><span class="avatar sm">' + A.initial(a.name) + '</span><div><b>' + esc(a.name) + '</b><span class="muted small"> ' + esc(dep || "") + '</span></div></div>' + gs + '</section>';
    }).join("");
    var pend = A.pendingGoals();
    return '<div class="stack">' + 
      '<div class="sec-h"><div><h2>ตรวจสอบเป้าหมาย</h2><p class="muted small">อนุมัติเป้าหมายของพนักงานในความดูแล หรือส่งกลับให้แก้ไขพร้อมเหตุผล · ยังไม่ส่งเป้าหมาย ' + none + ' คน</p></div>' +
        '<div class="tabs"><button class="' + (tab === "pending" ? "on" : "") + '" data-act="gr-tab" data-tab="pending">รอตรวจสอบ (' + pend + ')</button><button class="' + (tab === "all" ? "on" : "") + '" data-act="gr-tab" data-tab="all">ทั้งหมด</button></div></div>' +
      (cards || '<section class="panel empty">' + (tab === "pending" ? "ไม่มีเป้าหมายที่รอตรวจสอบ" : "ยังไม่มีพนักงานส่งเป้าหมาย") + '</section>') + '</div>';
  };
  A.acts["gr-tab"] = function (t) { S.goalTab = t.getAttribute("data-tab"); A.render(); };
  A.acts["gr-ok"] = function (t) {
    var c = window.prompt("อนุมัติเป้าหมายนี้\n\nความเห็นถึงพนักงาน (ไม่บังคับ):", ""); if (c == null) return;
    goalCall("/goals/" + t.getAttribute("data-id") + "/review", "POST", { decision: "approve", comment: c }, "อนุมัติเป้าหมายแล้ว");
  };
  A.acts["gr-back"] = function (t) {
    var c = window.prompt("ส่งเป้าหมายกลับให้แก้ไข\n\nเหตุผล / สิ่งที่ควรปรับ:", ""); if (c == null) return;
    if (!c.trim()) { S.flash = "กรุณาระบุเหตุผลที่ส่งกลับ"; A.render(); return; }
    goalCall("/goals/" + t.getAttribute("data-id") + "/review", "POST", { decision: "return", comment: c }, "ส่งเป้าหมายกลับให้แก้ไขแล้ว");
  };
})(window.App);
