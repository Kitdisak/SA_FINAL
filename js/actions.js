/* การกระทำ: ล็อกอิน/ออก, เปิดฟอร์ม, บันทึก/ส่งผลประเมิน, รับทราบ/ตอบกลับ */
(function (A) {
  var S = A.S;

  function stopSubs() {
    S.unsubs.forEach(function (f) { try { f(); } catch (e) {} });
    S.unsubs = [];
  }

  A.enter = function (id) {
    var a = S.accounts[id]; if (!a) return;
    S.me = Object.assign({ id: id }, a);
    A.store("eval-user", id);
    S.loginErr = ""; S.flash = ""; S.evals = {}; S.replyDraft = "";
    stopSubs();

    if (a.role === "evaluator") {          // ผู้ประเมินเห็นทุกใบ
      S.view = "home";
      S.unsubs.push(S.db.collection("evaluations").onSnapshot(function (snap) {
        S.evals = {}; snap.docs.forEach(function (d) { S.evals[d.id] = d.data(); });
        A.softRender();
      }, function (e) { S.flash = "อ่านข้อมูลไม่สำเร็จ (" + (e && e.code) + ")"; A.softRender(); }));
    } else {                               // พนักงานเห็นเฉพาะของตัวเอง
      S.view = "home";
      S.unsubs.push(S.db.doc("evaluations/" + id).onSnapshot(function (snap) {
        var first = !S.evals[id] && !S.replyDraft;
        if (snap.exists) { S.evals[id] = snap.data(); if (first) S.replyDraft = S.evals[id].reply || ""; }
        else delete S.evals[id];
        A.softRender();
      }, function (e) { S.flash = "อ่านข้อมูลไม่สำเร็จ (" + (e && e.code) + ")"; A.softRender(); }));
    }
    if (A.startExtras) A.startExtras();
    A.render();
  };

  A.logout = function () {
    stopSubs();
    S.me = null; S.viewCycle = null; S.view = "login"; S.navOpen = false; S.loginMode = "login"; S.loginOk = ""; S.evals = {}; S.target = null; S.draft = null;
    A.store("eval-user", null);
    A.store("eval-token", null); A.setApiToken(null);
    A.render();
  };

  A.openForm = function (id) {
    var ex = S.evals[id];
    S.backView = S.view === "form" ? (S.backView || "list") : S.view;
    S.target = id; S.formMsg = ""; S.flash = "";
    S.draft = ex
      ? { scores: ex.scores.slice(), cc: (ex.cc || []).concat(["", "", "", "", ""]).slice(0, A.CATS.length), strengths: ex.strengths || "", improvements: ex.improvements || "" }
      : { scores: new Array(A.N).fill(0), cc: A.CATS.map(function () { return ""; }), strengths: "", improvements: "" };
    S.view = "form"; A.render(); window.scrollTo(0, 0);
  };

  A.saveEval = async function (status) {
    if (S.busy) return;
    var msg = document.getElementById("formMsg");

    if (status === "submitted") {          // ส่งจริงต้องครบทุกข้อ
      var miss = [];
      S.draft.scores.forEach(function (s, i) { if (!s) miss.push(i); });
      document.querySelectorAll(".q.missing").forEach(function (el) { el.classList.remove("missing"); });
      if (miss.length) {
        miss.forEach(function (i) { var el = document.getElementById("qb" + i); if (el) el.classList.add("missing"); });
        S.formMsg = "ยังไม่ได้ให้คะแนน " + miss.length + " ข้อ (ข้อที่ " + (miss[0] + 1) + " เป็นต้นไป)";
        if (msg) msg.textContent = S.formMsg;
        var f = document.getElementById("qb" + miss[0]); if (f) f.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      // ข้อมูลที่ HR กำหนดให้ต้องกรอก (UC-13, BR-EVAL-06)
      var R = A.REQ || {}, need = R.strengths && !S.draft.strengths.trim() ? ["strengths", "จุดเด่นของพนักงาน"]
        : R.improvements && !S.draft.improvements.trim() ? ["improvements", "สิ่งที่ควรปรับปรุงโดยรวม"]
        : R.catComment && S.draft.cc.some(function (t) { return !String(t || "").trim(); }) ? ["cc" + S.draft.cc.findIndex(function (t) { return !String(t || "").trim(); }), "ความเห็นให้ครบทุกหมวด"] : null;
      if (need) {
        S.formMsg = "กรุณากรอก \"" + need[1] + "\" ก่อนส่ง";
        if (msg) msg.textContent = S.formMsg;
        var el = document.getElementById(need[0]); if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); el.focus(); }
        return;
      }
    }

    S.busy = true; if (msg) msg.textContent = "กำลังบันทึก…";
    var ex = S.evals[S.target] || {};
    var d = S.draft;
    var data = {
      evaluatee: S.target, evaluator: S.me.id, evaluatorName: S.me.name,
      scores: d.scores, cc: d.cc, strengths: d.strengths.trim(), improvements: d.improvements.trim(),
      status: status, updatedAt: Date.now(),
      submittedAt: status === "submitted" ? Date.now() : (ex.submittedAt || 0),
      ack: false, ackAt: 0, reply: ex.reply || "", replyAt: ex.replyAt || 0
    };
    try {
      await S.db.doc("evaluations/" + S.target).set(data);
      S.flash = status === "submitted" ? "ส่งผลประเมินของ " + S.accounts[S.target].name + " แล้ว รอตรวจสอบและยืนยันผลที่หน้า \"ตรวจสอบและยืนยันผล\"" : "บันทึกร่างแล้ว";
      S.view = S.backView || "list"; S.target = null; S.draft = null; S.formMsg = "";
      A.render(); window.scrollTo(0, 0);
    } catch (e) {
      S.formMsg = "บันทึกไม่สำเร็จ: " + ((e && (e.message || e.code)) || "ลองใหม่อีกครั้ง");
      var m = document.getElementById("formMsg"); if (m) m.textContent = S.formMsg;
    }
    S.busy = false;
  };

  A.patchMine = async function (fields, okMsg) {
    if (S.busy) return; S.busy = true;
    try { await S.db.doc("evaluations/" + S.me.id).update(fields); S.flash = okMsg; }
    catch (e) { S.flash = "บันทึกไม่สำเร็จ: " + ((e && (e.message || e.code)) || "ลองใหม่อีกครั้ง"); }
    S.busy = false; A.render(); window.scrollTo(0, 0);
  };
})(window.App);
