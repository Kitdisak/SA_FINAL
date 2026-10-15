/* หน้า 4: ผลประเมินของฉัน (ผู้ถูกประเมิน) */
(function (A) {
  A.views.mine = function () {
    var S = A.S, esc = A.esc, ev = S.evals[S.me.id];
    var me = A.selfOf(S.me.id), selfOn = !!(me && me.status === "submitted");

    if (!ev || ev.status !== "submitted") {
      return A.cyclePicker() + '<section class="panel empty"><h2 style="margin-bottom:8px;color:var(--ink)">ยังไม่มีผลประเมิน</h2>' +
        '<p>เมื่อพี่เลี้ยงประเมินและ HR ตรวจสอบ เผยแพร่ผลแล้ว คะแนนและข้อเสนอแนะจะแสดงที่หน้านี้</p></section>';
    }

    var a = A.avg(ev.scores);
    var cbars = A.CATS.map(function (c, ci) {
      var v = A.avg(A.catScores(ev.scores, ci));
      return '<div class="cbar"><div class="l"><span>' + esc(c.name) + '</span><span class="num">' + v.toFixed(2) + '</span></div>' +
        '<div class="track"><i style="width:' + (v / A.MAX * 100) + '%"></i></div></div>';
    }).join("");

    var det = A.CATS.map(function (c, ci) {
      var items = c.items.map(function (t, qi) {
        var i = ci * A.PER + qi;
        return '<div class="item"><span>' + (i + 1) + '. ' + esc(t) + '</span><span class="s">' + (selfOn ? '<small class="self-mini" title="คะแนนที่ประเมินตนเอง">ตนเอง ' + (me.scores[i] || "–") + '</small>' : "") + ev.scores[i] + '</span></div>';
      }).join("");
      var cm = ev.cc && ev.cc[ci] ? '<div class="note warn" style="margin-top:6px"><div class="label">ควรปรับปรุง</div>' + esc(ev.cc[ci]) + '</div>' : "";
      return '<details><summary><span>' + esc(c.name) + '</span><span class="num">' + A.avg(A.catScores(ev.scores, ci)).toFixed(2) + '</span></summary>' + items + cm + '</details>';
    }).join("");

    var ackBox = ev.ack
      ? '<p class="flash">รับทราบผลประเมินแล้วเมื่อ ' + A.fdate(ev.ackAt) + '</p>'
      : '<button class="btn primary" data-act="ack">รับทราบผลประเมิน</button>';
    if (S.viewCycle) ackBox = ev.ack ? ackBox : '<p class="muted small">รอบนี้ปิดแล้ว</p>';

    return (S.flash ? '<p class="flash" style="margin-bottom:16px">' + esc(S.flash) + '</p>' : "") + '<div class="stack">' + A.cyclePicker() +
      '<section class="panel stack"><div class="hero"><div><div class="label">คะแนนเฉลี่ยรวม</div><div class="big">' + a.toFixed(2) + '<small> / ' + A.MAX + '</small></div></div>' +
      '<div><div class="grade">' + A.grade(a) + '</div><p class="muted small">พี่เลี้ยง ' + esc(ev.evaluatorName || "") + ' · ' + A.fdate(ev.submittedAt) + '</p>' + (selfOn ? '<p class="muted small">คะแนนที่ประเมินตนเอง <b class="num">' + A.avg(me.scores).toFixed(2) + '</b></p>' : "") + '</div></div></section>' +
      '<section class="panel stack"><h3>คะแนนรายหมวด</h3><div class="cbars">' + cbars + '</div></section>' +
      '<section class="panel stack"><h3>รายละเอียดรายข้อ</h3><div>' + det + '</div></section>' +
      '<section class="panel stack"><h3>ความเห็นจากพี่เลี้ยงและ HR</h3>' +
      (ev.summary ? '<div><div class="label">ข้อสรุปฉบับสุดท้าย (HR)</div><div class="note">' + esc(ev.summary) + '</div></div>' : "") +
      '<div><div class="label">จุดเด่น (พี่เลี้ยง)</div><div class="note">' + esc(ev.strengths || "ไม่ได้ระบุ") + '</div></div>' +
      '<div><div class="label">สิ่งที่ควรปรับปรุง (พี่เลี้ยง)</div><div class="note warn">' + esc(ev.improvements || "ไม่ได้ระบุ") + '</div></div></section>' +
      (S.viewCycle ? '<section class="panel stack"><h3>การรับทราบ</h3>' + ackBox + (ev.reply ? '<div><div class="label">ข้อสงสัยที่ส่งไว้</div><div class="note warn">' + esc(ev.reply) + '</div></div>' : "") + '</section></div>' :
      '<section class="panel stack"><h3>ตรวจสอบและตอบกลับ</h3>' +
      '<div class="field"><label for="reply">ข้อสงสัยหรือความเห็นถึงพี่เลี้ยงและ HR</label><textarea id="reply" data-f="reply" maxlength="1300" placeholder="หากไม่เห็นด้วยกับข้อใด พิมพ์ได้ที่นี่">' + esc(S.replyDraft) + '</textarea></div>' +
      '<div class="row"><button class="btn" data-act="reply">ส่งข้อความ</button>' + ackBox + '</div></section></div>');
  };
})(window.App);
