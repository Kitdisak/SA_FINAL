/* ประวัติการเปลี่ยนแปลง (audit_logs) — NFR-AUD-01, BR-DATA-01, UC-15 ขั้นที่ 7 */
(function (A) {
  var S = A.S;
  A.acts = A.acts || {};
  var ACTIONS = {
    OPEN_CYCLE: "เปิดรอบการประเมิน", CREATE_CYCLE: "สร้างรอบการประเมิน", UPDATE_CYCLE: "แก้ไขรอบการประเมิน", CLOSE_CYCLE: "ปิดรอบการประเมิน",
    UPDATE_FORM: "แก้ไขเกณฑ์และแบบประเมิน", CREATE_GOAL: "เพิ่มเป้าหมาย", UPDATE_GOAL: "แก้ไขเป้าหมาย", DELETE_GOAL: "ลบเป้าหมาย",
    SUBMIT_GOALS: "ส่งเป้าหมายให้ตรวจสอบ", APPROVE_GOAL: "อนุมัติเป้าหมาย", RETURN_GOAL: "ส่งเป้าหมายกลับให้แก้ไข",
    SELF_SAVE_DRAFT: "บันทึกร่างประเมินตนเอง", SELF_SUBMIT: "ส่งแบบประเมินตนเอง", RETURN_SELF: "ส่งแบบประเมินตนเองกลับให้แก้ไข",
    SAVE_DRAFT: "บันทึกร่างการประเมิน", SUBMIT: "ส่งผลประเมินให้ตรวจสอบ", CALIBRATE: "ปรับเทียบคะแนน", CONFIRM: "ยืนยันผลการประเมิน",
    UNCONFIRM: "ยกเลิกการยืนยันผล", PUBLISH: "เผยแพร่ผลการประเมิน", ACKNOWLEDGE: "พนักงานรับทราบผล", REPLY: "ส่งข้อสงสัย", RESET: "ลบผลการประเมิน",
    EXTEND_DEADLINE: "อนุมัติขยายเวลา", CANCEL_EXTENSION: "ยกเลิกการขยายเวลา", CHANGE_SHIFT: "เปลี่ยนกะทำงาน", CHANGE_PIN: "เปลี่ยน PIN", RESET_PIN: "รีเซ็ต PIN"
  };
  var STG = { goal: "กำหนดเป้าหมาย", self: "ประเมินตนเอง" };
  function who(u) { return u ? ((S.accounts[u] || {}).name || u) : ""; }
  function detailText(r) {
    var d = r.detail, out = [];
    if (!d || typeof d !== "object") return typeof d === "string" ? d : "";
    if (d.employee) out.push(who(d.employee));
    if (d.final != null) out.push("คะแนนสุดท้าย " + Number(d.final).toFixed(2));
    else if (d.average != null) out.push("เฉลี่ย " + Number(d.average).toFixed(2));
    if (d.before && d.after && d.before !== d.after) out.push(d.before + " → " + d.after);
    if (d.stage) out.push(STG[d.stage] || d.stage);
    if (d.until) out.push("ถึง " + A.fday(d.until));
    if (d.reason) out.push("เหตุผล: " + d.reason);
    if (d.comment) out.push(d.comment);
    if (d.reply) out.push(d.reply);
    if (d.count) out.push(d.count + " ข้อ");
    if (d.name && r.action !== "UPDATE_FORM") out.push(d.name);
    if (d.day) out.push("วันที่ " + d.day + " " + (d.before || "") + " → " + (d.after || ""));
    return out.join(" · ");
  }
  A.auditItem = function (r) {
    var esc = A.esc;
    return '<div class="fitem"><span class="avatar sm">' + A.initial(r.actor || "?") + '</span><div class="grow"><b>' + esc(ACTIONS[r.action] || r.action) + '</b>' +
      '<span class="muted small">' + esc(r.actor || "ระบบ") + ' · ' + A.fdatetime(r.at) + (detailText(r) ? ' · ' + esc(detailText(r)) : "") + '</span></div></div>';
  };
  function listHtml() {
    if (!S.auditRows) return '<div class="empty">กำลังโหลด…</div>';
    var q = (S.auditQ || "").trim().toLowerCase();
    var rows = S.auditRows.filter(function (r) { return !q || [ACTIONS[r.action], r.actor, detailText(r)].join(" ").toLowerCase().indexOf(q) >= 0; });
    return rows.map(A.auditItem).join("") || '<div class="empty">ไม่พบรายการ</div>';
  }
  A.auditFilter = function (v) { S.auditQ = v; var el = document.getElementById("auditList"); if (el) el.innerHTML = listHtml(); };
  A.views.audit = function () {
    var esc = A.esc;
    if (S.auditFor !== "*") { S.auditFor = "*"; S.auditRows = null; A.api("/audit?limit=300").then(function (r) { S.auditRows = r; A.render(); }).catch(function () { S.auditRows = []; A.render(); }); }

    return '<div class="stack"><div class="sec-h"><div><h2>ประวัติการเปลี่ยนแปลง</h2><p class="muted small">บันทึกทุกการกระทำสำคัญ: ผู้ดำเนินการ วันเวลา และรายละเอียดก่อน-หลัง (300 รายการล่าสุด)</p></div>' +
      '<button class="btn sm" data-act="audit-reload">โหลดใหม่</button></div>' +
      '<input type="search" class="search" id="auditQ" value="' + esc(S.auditQ || "") + '" placeholder="ค้นหา เช่น ชื่อพนักงาน ปรับเทียบ ขยายเวลา" aria-label="ค้นหาประวัติ">' +
      '<section class="panel"><div class="flist" id="auditList">' + listHtml() + '</div></section></div>';
  };
  A.acts["audit-reload"] = function () { S.auditFor = null; A.render(); };
})(window.App);
