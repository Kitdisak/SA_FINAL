/* หน้าประเมินตนเอง (พนักงาน) — UC-03 ประเมินตนเอง, UC-04 ส่งผลการประเมินตนเอง */
(function (A) {
  var S = A.S;

  // ข้อมูลประเมินตนเองของพนักงาน (จาก /api/self-evaluations)
  A.selfOf = function (id) { return S.selfs[id] || null; };
  A.selfDone = function (id) { var s = S.selfs[id]; return !!(s && s.status === "submitted"); };

  function newDraft(x) {
    return {
      scores: x && x.scores ? x.scores.slice() : new Array(A.N).fill(0),
      cc: ((x && x.cc) || []).concat(["", "", "", "", ""]).slice(0, A.CATS.length),
      comment: (x && x.comment) || ""
    };
  }

  function readOnly(x) {
    var esc = A.esc, a = A.avg(x.scores);
    var det = A.CATS.map(function (c, ci) {
      var items = c.items.map(function (t, qi) {
        var i = ci * A.PER + qi;
        return '<div class="item"><span>' + (i + 1) + '. ' + esc(t) + '</span><span class="s">' + (x.scores[i] || "–") + '</span></div>';
      }).join("");
      var cm = x.cc && x.cc[ci] ? '<div class="note" style="margin-top:6px"><div class="label">ความเห็นของฉัน</div>' + esc(x.cc[ci]) + '</div>' : "";
      return '<details><summary><span>' + esc(c.name) + '</span><span class="num">' + A.avg(A.catScores(x.scores, ci)).toFixed(2) + '</span></summary>' + items + cm + '</details>';
    }).join("");
    var mentorDone = S.evals[S.me.id] && S.evals[S.me.id].status === "submitted";
    return '<div class="stack">' +
      '<section class="panel stack"><div class="hero"><div><div class="label">คะแนนที่ประเมินตนเอง</div><div class="big">' + a.toFixed(2) + '<small> / ' + A.MAX + '</small></div></div>' +
      '<div><span class="pill done">ส่งให้พี่เลี้ยงแล้ว</span><p class="muted small" style="margin-top:6px">ส่งเมื่อ ' + A.fdate(x.submittedAt) + '</p></div></div>' +
      '<p class="muted small">' + (mentorDone ? 'ผลประเมินของคุณเผยแพร่แล้ว ดูผลได้ที่หน้า "ผลประเมินของฉัน"' : "พี่เลี้ยงจะเห็นคะแนนนี้ระหว่างประเมินคุณ ถ้าต้องแก้ไข พี่เลี้ยงสามารถส่งกลับให้แก้ได้") + '</p>' +
      (mentorDone ? '<div class="row"><button class="btn primary" data-act="nav" data-view="mine">ดูผลประเมินของฉัน</button></div>' : "") + '</section>' +
      '<section class="panel stack"><h3>คะแนนที่ให้ตนเองรายข้อ</h3><div>' + det + '</div></section>' +
      '<section class="panel stack"><h3>สรุปผลงานของฉัน</h3><div class="note">' + esc(x.comment || "ไม่ได้ระบุ") + '</div></section>' +
    '</div>';
  }

  A.views.self = function () {
    var esc = A.esc;
    if (!S.selfsLoaded) return '<section class="panel empty">กำลังโหลด…</section>';
    var x = A.selfOf(S.me.id);
    var goals = A.goalsPanel(S.me.id, "เป้าหมายของฉัน (ใช้ประกอบการประเมินตนเอง)");
    if (x && x.status === "submitted") { S.selfDraft = null; return A.cyclePicker() + readOnly(x); }
    var w = A.win("self");
    if (w.state !== "open") {   // นอกช่วงเวลา / รอบปิดแล้ว (BR-EVAL-03, BR-EVAL-07)
      S.selfDraft = null;
      return '<div class="stack">' + A.cyclePicker() + '<section class="panel stack"><h2>แบบประเมินตนเอง</h2>' + A.deadlineNote("self") +
        (x && x.status === "draft" ? '<p class="muted small">มีร่างที่บันทึกไว้ ' + x.scores.filter(Boolean).length + '/' + A.N + ' ข้อ</p>' : "") + '</section>' + goals + '</div>';
    }
    if (!S.selfDraft) S.selfDraft = newDraft(x);
    var d = S.selfDraft, R = A.REQ || {};

    var legend = '<div class="legend">' + A.SCALE.map(function (s) { return '<span><b>' + s[0] + '</b>' + s[1] + '</span>'; }).join("") + '</div>';
    var cats = A.CATS.map(function (c, ci) {
      var qs = c.items.map(function (t, qi) {
        var i = ci * A.PER + qi;
        var btns = A.SCALE.map(function (s) {
          return '<label class="sc"><input type="radio" name="s' + i + '" value="' + s[0] + '"' + (d.scores[i] == +s[0] ? " checked" : "") +
            ' aria-label="' + s[0] + ' ' + s[1] + '"><span>' + s[0] + '</span></label>';
        }).join("");
        return '<div class="q" id="sb' + i + '"><div class="t"><span class="n">' + (i + 1) + '</span><span>' + esc(t) + '</span></div>' +
          '<div class="scores" role="radiogroup" aria-label="' + esc(t) + '">' + btns + '</div></div>';
      }).join("");
      return '<section class="panel cat"><h3>' + (ci + 1) + '. ' + esc(c.name) + '</h3>' + qs +
        '<div class="field"><label for="scc' + ci + '">ความเห็นของฉันในหมวดนี้ ' + (R.selfCatComment ? '<span class="req">*จำเป็น</span>' : "(ถ้ามี)") + '</label>' +
        '<textarea id="scc' + ci + '" data-f="scc' + ci + '" placeholder="เช่น ผลงานที่ทำได้ดี หรือสิ่งที่ยังติดขัด">' + esc(d.cc[ci]) + '</textarea></div></section>';
    }).join("");

    var back = x && x.returnReason
      ? '<div class="note warn"><div class="label">พี่เลี้ยงส่งกลับให้แก้ไข' + (x.returnedAt ? " · " + A.fdate(x.returnedAt) : "") + '</div>' + esc(x.returnReason) + '</div>' : "";

    return '<div class="stack">' +
      '<section class="panel stack"><h2>แบบประเมินตนเอง</h2>' +
        '<p class="muted">ให้คะแนนตัวเองตามความเป็นจริง 20 ข้อ เมื่อส่งแล้วพี่เลี้ยงจะเห็นคะแนนนี้คู่กับแบบประเมินของ HR และจะแก้ไขไม่ได้จนกว่า HR จะส่งกลับ</p>' +
        A.deadlineNote("self") + back + legend + '</section>' + goals +
      '<div class="sticky"><div class="row" style="justify-content:space-between"><span>ตอบแล้ว <b class="num" id="spc"></b></span>' +
        '<span>คะแนนเฉลี่ย <b class="num" id="spa"></b></span></div><div class="bar"><i id="spbar"></i></div></div>' +
      cats +
      '<section class="panel stack"><h3>สรุปผลงานของฉัน</h3>' +
        '<div class="field"><label for="scomment">ผลงานที่ภูมิใจ และสิ่งที่อยากพัฒนาในรอบหน้า' + (R.selfComment ? ' <span class="req">*จำเป็น</span>' : "") + '</label>' +
        '<textarea id="scomment" data-f="scomment" placeholder="เช่น ปิดงบประจำเดือนได้เร็วขึ้น 2 วัน อยากพัฒนาทักษะ Excel">' + esc(d.comment) + '</textarea></div>' +
        '<p class="err" id="selfMsg">' + esc(S.selfMsg || "") + '</p>' +
        '<div class="row"><button class="btn" data-act="self-draft">บันทึกร่าง</button>' +
        '<button class="btn primary" data-act="self-submit">ส่งให้พี่เลี้ยง</button></div>' +
        (x && x.status === "draft" && x.updatedAt ? '<p class="muted small">บันทึกร่างล่าสุด ' + A.fdate(x.updatedAt) + '</p>' : "") +
      '</section></div>';
  };

  A.updateSelfProgress = function () {
    var d = S.selfDraft; if (!d) return;
    var answered = d.scores.filter(Boolean).length, a = A.avg(d.scores);
    var pc = document.getElementById("spc"), pa = document.getElementById("spa"), pb = document.getElementById("spbar");
    if (pc) pc.textContent = answered + "/" + A.N;
    if (pa) pa.textContent = a ? a.toFixed(2) : "–";
    if (pb) pb.style.width = (answered / A.N * 100) + "%";
  };

  A.saveSelf = async function (status) {
    if (S.busy || !S.selfDraft) return;
    var d = S.selfDraft, msg = document.getElementById("selfMsg");
    document.querySelectorAll(".q.missing").forEach(function (el) { el.classList.remove("missing"); });
    if (status === "submitted") {
      var miss = [];
      d.scores.forEach(function (s, i) { if (!s) miss.push(i); });
      if (miss.length) {
        miss.forEach(function (i) { var el = document.getElementById("sb" + i); if (el) el.classList.add("missing"); });
        S.selfMsg = "ยังไม่ได้ให้คะแนน " + miss.length + " ข้อ (ข้อที่ " + (miss[0] + 1) + " เป็นต้นไป)";
        if (msg) msg.textContent = S.selfMsg;
        var f = document.getElementById("sb" + miss[0]); if (f) f.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      var R = A.REQ || {};
      if (R.selfComment && !d.comment.trim()) { S.selfMsg = "กรุณากรอก \"สรุปผลงานของฉัน\" ก่อนส่ง"; if (msg) msg.textContent = S.selfMsg; var sc = document.getElementById("scomment"); if (sc) sc.focus(); return; }
      if (R.selfCatComment && d.cc.some(function (t) { return !t.trim(); })) { S.selfMsg = "กรุณากรอกความเห็นให้ครบทุกหมวดก่อนส่ง"; if (msg) msg.textContent = S.selfMsg; return; }
      if (!window.confirm("ส่งแบบประเมินตนเองให้พี่เลี้ยง?\n\nเมื่อส่งแล้วจะแก้ไขไม่ได้ จนกว่าพี่เลี้ยงจะส่งกลับให้แก้")) return;
    }
    S.busy = true; if (msg) msg.textContent = "กำลังบันทึก…";
    try {
      await A.api("/self-evaluations/me", { method: "PUT", body: JSON.stringify({
        status: status, scores: d.scores, cc: d.cc.map(function (t) { return t.trim(); }), comment: d.comment.trim() }) });
      S.selfMsg = "";
      S.flash = status === "submitted" ? "ส่งแบบประเมินตนเองให้พี่เลี้ยงแล้ว" : "บันทึกร่างแล้ว";
      S.selfDraft = null;
      await A.loadSelfs(true);
      A.render(); window.scrollTo(0, 0);
    } catch (e) {
      S.selfMsg = "บันทึกไม่สำเร็จ: " + ((e && e.message) || "ลองใหม่อีกครั้ง");
      var m = document.getElementById("selfMsg"); if (m) m.textContent = S.selfMsg;
    }
    S.busy = false;
  };

  // หัวหน้าส่งแบบประเมินตนเองกลับให้แก้ไข
  A.returnSelf = async function (id) {
    var name = (S.accounts[id] || {}).name || id;
    var reason = window.prompt("ส่งแบบประเมินตนเองของ " + name + " กลับให้แก้ไข\n\nเหตุผล / สิ่งที่อยากให้แก้:");
    if (reason == null) return;
    if (!reason.trim()) { S.flash = "กรุณาระบุเหตุผลที่ส่งกลับ"; A.render(); return; }
    try {
      await A.api("/self-evaluations/" + encodeURIComponent(id) + "/return", { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
      S.flash = "ส่งแบบประเมินตนเองกลับให้ " + name + " แก้ไขแล้ว";
      await A.loadSelfs(true);
    } catch (e) { S.flash = "ส่งกลับไม่สำเร็จ: " + (e.message || "ลองใหม่อีกครั้ง"); }
    A.render(); window.scrollTo(0, 0);
  };

  // กล่องแสดงแบบประเมินตนเองในฟอร์มของพี่เลี้ยง
  A.selfPanel = function (id) {
    var esc = A.esc, x = A.selfOf(id);
    if (!x || x.status !== "submitted") {
      var w = A.win("self", id);
      var txt = x && x.returnReason ? "ส่งกลับให้แก้ไขแล้ว รอพนักงานส่งใหม่" : x && x.status === "draft" ? "พนักงานกำลังทำแบบประเมินตนเอง (ยังไม่ส่ง)" : "พนักงานยังไม่ได้ส่งแบบประเมินตนเอง";
      txt += w.state === "after" ? " · พ้นกำหนดส่งแล้ว พี่เลี้ยงประเมินต่อได้" : w.until ? " · ส่งได้ถึง " + A.fday(w.until) : "";
      return '<div class="self-box off"><b>แบบประเมินตนเอง</b><span class="muted small">' + txt + '</span></div>';
    }
    return '<div class="self-box"><div class="row" style="justify-content:space-between;align-items:flex-start">' +
      '<div><b>แบบประเมินตนเองของพนักงาน</b><div class="muted small">ส่งเมื่อ ' + A.fdate(x.submittedAt) + ' · คะแนนเฉลี่ย <b class="num">' + A.avg(x.scores).toFixed(2) + '</b> (แสดงเป็น "ตนเอง" ในแต่ละข้อ)</div></div>' +
      '<div class="row"><button class="btn sm primary" data-act="selfview" data-id="' + esc(id) + '">ดูรายละเอียด</button>' + (A.stage(id) === "self" && S.cycle && S.cycle.status === "open" && S.me.role === "mentor" ? '<button class="btn sm" data-act="self-return" data-id="' + esc(id) + '">ส่งกลับให้แก้ไข</button>' : "") + '</div></div>' +
      (x.comment ? '<div class="note"><div class="label">สรุปผลงานจากพนักงาน</div>' + esc(x.comment) + '</div>' : "") + '</div>';
  };
})(window.App);
