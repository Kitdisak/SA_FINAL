/* หน้า 3: ฟอร์มประเมิน 20 ข้อ */
(function (A) {
  A.views.form = function () {
    var S = A.S, esc = A.esc, draft = S.draft;
    var a = S.accounts[S.target] || { name: S.target, position: "" };
    var ex = S.evals[S.target];
    var me = A.selfOf(S.target), selfOn = !!(me && me.status === "submitted");

    var legend = '<div class="legend">' + A.SCALE.map(function (s) {
      return '<span><b>' + s[0] + '</b>' + s[1] + '</span>';
    }).join("") + '</div>';

    var cats = A.CATS.map(function (c, ci) {
      var qs = c.items.map(function (t, qi) {
        var i = ci * A.PER + qi;
        var btns = A.SCALE.map(function (s) {
          return '<label class="sc"><input type="radio" name="q' + i + '" value="' + s[0] + '"' +
            (draft.scores[i] == +s[0] ? " checked" : "") + ' aria-label="' + s[0] + ' ' + s[1] + '"><span>' + s[0] + '</span></label>';
        }).join("");
        return '<div class="q" id="qb' + i + '"><div class="t"><span class="n">' + (i + 1) + '</span><span>' + esc(t) + '</span>' +
          (selfOn && me.scores[i] ? '<span class="self-chip" title="คะแนนที่พนักงานให้ตนเอง">ตนเอง <b>' + me.scores[i] + '</b></span>' : "") + '</div>' +
          '<div class="scores" role="radiogroup" aria-label="' + esc(t) + '">' + btns + '</div></div>';
      }).join("");
      var selfCc = selfOn && me.cc && me.cc[ci] ? '<div class="note"><div class="label">ความเห็นของพนักงานในหมวดนี้</div>' + esc(me.cc[ci]) + '</div>' : "";
      return '<section class="panel cat"><h3>' + (ci + 1) + '. ' + esc(c.name) + '</h3>' + qs + selfCc +
        '<div class="field"><label for="cc' + ci + '">สิ่งที่ควรปรับปรุงในหมวดนี้ ' + (A.REQ.catComment ? '<span class="req">*จำเป็น</span>' : "(ถ้ามี)") + '</label>' +
        '<textarea id="cc' + ci + '" data-f="cc' + ci + '" placeholder="เช่น ควรตรวจทานงานซ้ำก่อนส่ง">' + esc(draft.cc[ci]) + '</textarea></div></section>';
    }).join("");

    var submitted = ex && ex.status === "submitted", waitSelf = !ex && !A.canEvaluate(S.target);
    var locked = submitted || !(S.cycle && S.cycle.status === "open") || waitSelf || S.me.role !== "mentor";
    return '<div class="stack">' +
      '<div><button class="btn sm" data-act="back">← กลับรายชื่อ</button></div>' +
      '<section class="panel stack"><h2>ประเมิน ' + esc(a.name) + '</h2><p class="muted small">' + esc(a.position || "") + '</p>' +
      (ex && ex.hrReturn ? '<div><div class="label">HR ส่งกลับให้แก้ไข</div><div class="note warn">' + esc(ex.hrReturn) + '</div></div>' : "") +
      (ex && ex.reply ? '<div><div class="label">ข้อสงสัยจากพนักงาน</div><div class="note warn">' + esc(ex.reply) + '</div></div>' : "") +
      A.selfPanel(S.target) + A.goalsPanel(S.target, "เป้าหมายของพนักงาน (ใช้ประกอบการประเมิน)") +
      (!ex && !A.canEvaluate(S.target) ? '<p class="note warn">พนักงานยังไม่ได้ส่งแบบประเมินตนเอง จึงยังบันทึกการประเมินไม่ได้ (UC-08) — รอพนักงานส่ง หรือรอจนพ้นกำหนดส่ง' + (A.win("self", S.target).until ? " (" + A.fday(A.win("self", S.target).until) + ")" : "") + '</p>' : "") +
      legend + '</section>' +
      '<div class="sticky"><div class="row" style="justify-content:space-between"><span>ตอบแล้ว <b class="num" id="pc"></b></span>' +
      '<span>คะแนนเฉลี่ย <b class="num" id="pa"></b></span></div><div class="bar"><i id="pbar"></i></div></div>' +
      cats +
      '<section class="panel stack"><h3>สรุปภาพรวม</h3>' +
      '<div class="field"><label for="strengths">จุดเด่นของพนักงาน' + (A.REQ.strengths ? ' <span class="req">*จำเป็น</span>' : "") + '</label><textarea id="strengths" data-f="strengths">' + esc(draft.strengths) + '</textarea></div>' +
      '<div class="field"><label for="improvements">สิ่งที่ควรปรับปรุงโดยรวม' + (A.REQ.improvements ? ' <span class="req">*จำเป็น</span>' : "") + '</label><textarea id="improvements" data-f="improvements" placeholder="ระบุสิ่งที่อยากให้พัฒนา พร้อมแนวทาง">' + esc(draft.improvements) + '</textarea></div>' +
      '<p class="err" id="formMsg">' + esc(S.formMsg) + '</p>' +
      (locked ? '<p class="note warn">' + (A.isFinal(ex) ? 'HR ยืนยันผลแล้ว (' + A.STAGE[ex.dbStatus][0] + ') แก้ไขคะแนนไม่ได้' : submitted ? 'ส่งผลให้ HR ตรวจสอบแล้ว (' + A.STAGE[ex.dbStatus][0] + ') แก้ไขไม่ได้ จนกว่า HR จะส่งกลับ' : waitSelf ? 'รอพนักงานส่งแบบประเมินตนเองก่อน จึงจะบันทึกการประเมินได้' : 'รอบการประเมินปิดแล้ว ดูข้อมูลได้อย่างเดียว') + '</p>'
        : '<div class="row"><button class="btn" data-act="save-draft">บันทึกร่าง</button>' +
          '<button class="btn primary" data-act="submit">ส่งผลให้ HR ตรวจสอบ</button></div>' +
          '<p class="muted small">หลังส่ง HR จะตรวจสอบ ปรับเทียบ และยืนยันผลก่อนเผยแพร่ให้พนักงาน ระหว่างนั้นแก้ไขไม่ได้ (UC-11)</p>') +
      (ex && !locked && ex.dbStatus === "draft" ? '<div class="danger-zone"><div><b>ลบร่างผลประเมินนี้</b><p class="muted small">ล้างคะแนนและความเห็นที่บันทึกไว้ แล้วเริ่มประเมินใหม่ได้</p></div>' +
        '<button class="btn danger" data-act="del-eval" data-id="' + esc(S.target) + '"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg> ลบร่าง</button></div>' : "") +
      '</section></div>';
  };

  // อัปเดตแถบความคืบหน้า โดยไม่ต้อง render ทั้งหน้า (กันฟอร์มกระตุก)
  A.updateProgress = function () {
    var d = A.S.draft;
    var answered = d.scores.filter(Boolean).length, a = A.avg(d.scores);
    var pc = document.getElementById("pc"), pa = document.getElementById("pa"), pb = document.getElementById("pbar");
    if (pc) pc.textContent = answered + "/" + A.N;
    if (pa) pa.textContent = a ? a.toFixed(2) : "–";
    if (pb) pb.style.width = (answered / A.N * 100) + "%";
  };
})(window.App);
