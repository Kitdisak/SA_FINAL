/* หัวหน้าดูแบบประเมินตนเองของพนักงาน: รายชื่อทั้งหมด (selfs) + รายละเอียดรายคน (selfview) */
(function (A) {
  var S = A.S;
  var ST = [["submitted", "ส่งแล้ว"], ["draft", "กำลังทำ (ยังไม่ส่ง)"], ["none", "ยังไม่ได้ทำ"]];

  function selfStatus(k) { var x = S.selfs[k]; return x ? x.status : "none"; }
  A.statusFn.selfs = selfStatus;

  function pill(k) {
    var x = S.selfs[k], st = selfStatus(k);
    if (st === "submitted") return '<span class="pill done">ส่งแล้ว</span>';
    if (x && x.returnReason) return '<span class="pill draft">ส่งกลับให้แก้ไข</span>';
    if (st === "draft") return '<span class="pill draft">กำลังทำ</span>';
    return '<span class="pill">ยังไม่ได้ทำ</span>';
  }
  // คะแนนของ HR (ถ้ามี) สำหรับเทียบ
  function mentorScores(k) {
    var ev = S.evals[k];
    return ev && ev.scores && ev.scores.some(Boolean) ? ev : null;
  }
  function diffTag(d) {
    if (d == null) return '<span class="muted">–</span>';
    var t = (d > 0 ? "+" : "") + d.toFixed(2);
    return '<span class="diff ' + (Math.abs(d) >= 0.5 ? (d > 0 ? "up" : "down") : "") + '">' + t + '</span>';
  }

  // ปุ่มเปิดรายละเอียด (ใช้จากหน้าอื่นด้วย)
  A.openSelfView = function (id) {
    if (S.view !== "selfview") S.selfBack = S.view === "form" ? "form" : S.view;
    S.selfViewId = id; S.view = "selfview"; S.flash = ""; A.render(); window.scrollTo(0, 0);
  };

  A.views.selfs = function () {
    var esc = A.esc;
    var emps = Object.keys(S.accounts).filter(function (k) { return S.accounts[k].role === "evaluatee"; });
    var rank = { submitted: 0, draft: 1, none: 2 };
    emps.sort(function (a, b) { return (rank[selfStatus(a)] - rank[selfStatus(b)]) || S.accounts[a].name.localeCompare(S.accounts[b].name, "th"); });
    var sent = emps.filter(function (k) { return selfStatus(k) === "submitted"; });
    var wait = sent.filter(function (k) { var e = S.evals[k]; return !(e && e.status === "submitted"); }).length;

    var rows = emps.map(function (k) {
      var a = S.accounts[k], x = S.selfs[k], done = selfStatus(k) === "submitted";
      var sa = done ? A.avg(x.scores) : 0, m = mentorScores(k), ma = m ? A.avg(m.scores) : 0;
      return '<tr' + A.rowAttrs("selfs", k) + '>' +
        '<td><button type="button" class="who-cell linkrow" data-act="selfview" data-id="' + esc(k) + '"' + (done ? "" : " disabled") + '><span class="avatar sm">' + A.initial(a.name) + '</span><b>' + esc(a.name) + '</b></button></td>' +
        '<td>' + esc((S.employees[k] || {}).department || "–") + '</td><td>' + pill(k) + '</td>' +
        '<td class="n">' + (sa ? sa.toFixed(2) : '<span class="muted">–</span>') + '</td>' +
        '<td class="n">' + (ma ? ma.toFixed(2) + (m.status === "submitted" ? "" : ' <small class="muted">(ร่าง)</small>') : '<span class="muted">–</span>') + '</td>' +
        '<td class="n">' + diffTag(sa && ma ? sa - ma : null) + '</td>' +
        '<td>' + (done ? A.fdate(x.submittedAt) : "–") + '</td>' +
        '<td><div class="row acts">' + (done ? '<button class="btn sm primary" data-act="selfview" data-id="' + esc(k) + '">ดูรายละเอียด</button>' : '<span class="muted small">' + (x && x.returnReason ? "รอพนักงานแก้ไข" : "รอพนักงานส่ง") + '</span>') + '</div></td></tr>';
    }).join("");

    return '<div class="stack">' +
      '<div class="row" style="justify-content:space-between;align-items:flex-end"><div><h2>แบบประเมินตนเองของพนักงาน</h2>' +
        '<p class="muted small">กดชื่อหรือปุ่ม "ดูรายละเอียด" เพื่อดูคะแนนรายข้อ ความเห็น และเทียบกับคะแนนของ HR</p></div>' +
        '<div class="stats muted"><span class="num" style="color:var(--ink);font-size:1.3rem">' + sent.length + '/' + emps.length + '</span> ส่งแล้ว' +
        (wait ? ' · <b style="color:var(--accent)">' + wait + '</b> คนรอ HR ประเมิน' : "") + '</div></div>' +
      A.filterBar("selfs", emps, { dep: true, st: true, statusList: ST, keys: ["ส่งแล้ว", "กำลังทำ ยังไม่ส่ง", "ยังไม่ได้ทำ"], placeholder: "ค้นหาชื่อพนักงาน" }) +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
        '<th>พนักงาน</th><th>แผนก</th><th>สถานะ</th><th>คะแนนตนเอง</th><th>คะแนน HR</th><th>ส่วนต่าง</th><th>วันที่ส่ง</th><th></th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="8" class="empty">ยังไม่มีรายชื่อพนักงาน</td></tr>') + '</tbody></table></div>' +
      '<p class="muted small">ส่วนต่าง = คะแนนตนเอง − คะแนน HR (บวก = พนักงานให้ตัวเองสูงกว่า)</p>' +
    '</div>';
  };

  A.views.selfview = function () {
    var esc = A.esc, k = S.selfViewId, a = S.accounts[k] || { name: k, position: "" }, emp = S.employees[k] || {};
    var x = S.selfs[k];
    var back = '<div><button class="btn sm" data-act="selfback">← กลับ</button></div>';
    if (!x || x.status !== "submitted") {
      return '<div class="stack">' + back + '<section class="panel empty-state"><h3>' + esc(a.name) + ' ยังไม่ได้ส่งแบบประเมินตนเอง</h3>' +
        '<p class="muted">' + (x && x.returnReason ? "ส่งกลับให้แก้ไขแล้ว: " + esc(x.returnReason) : x && x.status === "draft" ? "พนักงานบันทึกร่างไว้ เมื่อกดส่งแล้วจะเห็นรายละเอียดที่นี่" : "เมื่อพนักงานส่งแล้วจะเห็นรายละเอียดที่นี่") + '</p></section></div>';
    }
    var m = mentorScores(k), sa = A.avg(x.scores), ma = m ? A.avg(m.scores) : 0;
    var mLabel = m ? (m.status === "submitted" ? "HR" : "HR (ร่าง)") : "";

    var cats = A.CATS.map(function (c, ci) {
      var cs = A.avg(A.catScores(x.scores, ci)), cm = m ? A.avg(A.catScores(m.scores, ci)) : 0;
      var items = c.items.map(function (t, qi) {
        var i = ci * A.PER + qi, s = x.scores[i], ms = m ? m.scores[i] : 0;
        var gap = s && ms && Math.abs(s - ms) >= 2;
        return '<div class="cmp-row' + (gap ? " gap" : "") + '"><span class="n">' + (i + 1) + '</span><span class="t">' + esc(t) + '</span>' +
          '<span class="sv self">' + (s || "–") + '</span>' + (m ? '<span class="sv">' + (ms || "–") + '</span>' : "") + '</div>';
      }).join("");
      return '<section class="panel stack"><div class="sec-h"><h3>' + (ci + 1) + '. ' + esc(c.name) + '</h3>' +
          '<span class="muted small">ตนเอง <b class="num">' + cs.toFixed(2) + '</b>' + (m && cm ? ' · ' + mLabel + ' <b class="num">' + cm.toFixed(2) + '</b>' : "") + '</span></div>' +
        '<div class="cmp-head"><span></span><span></span><span>ตนเอง</span>' + (m ? '<span>' + mLabel + '</span>' : "") + '</div>' + items +
        (x.cc && x.cc[ci] ? '<div class="note"><div class="label">ความเห็นของพนักงาน</div>' + esc(x.cc[ci]) + '</div>' : "") +
        (m && m.cc && m.cc[ci] ? '<div class="note warn"><div class="label">ความเห็นของ HR</div>' + esc(m.cc[ci]) + '</div>' : "") +
      '</section>';
    }).join("");

    var cbars = A.CATS.map(function (c, ci) {
      var v = A.avg(A.catScores(x.scores, ci)), w = m ? A.avg(A.catScores(m.scores, ci)) : 0;
      return '<div class="cbar"><div class="l"><span>' + esc(c.name) + '</span><span class="num">' + v.toFixed(2) + (w ? ' / ' + w.toFixed(2) : "") + '</span></div>' +
        '<div class="track"><i class="self" style="width:' + (v / A.MAX * 100) + '%"></i></div>' + (w ? '<div class="track"><i style="width:' + (w / A.MAX * 100) + '%"></i></div>' : "") + '</div>';
    }).join("");

    var ev = S.evals[k];
    return '<div class="stack">' + back +
      
      '<section class="panel stack">' +
        '<div class="row" style="justify-content:space-between;align-items:flex-start;gap:16px">' +
          '<div class="who-cell"><span class="avatar">' + A.initial(a.name) + '</span><div><h2>' + esc(a.name) + '</h2>' +
            '<p class="muted small">' + esc(a.position || "") + (emp.department ? " · " + esc(emp.department) : "") + (emp.code ? " · " + esc(emp.code) : "") + '</p></div></div>' +
          '<div class="row"><button class="btn primary" data-act="open" data-id="' + esc(k) + '">' + (ev ? (ev.status === "submitted" ? "เปิดแบบประเมินของ HR" : "ประเมินต่อ") : "เริ่มประเมินคนนี้") + '</button>' +
            (A.stage(k) === "self" && S.cycle && S.cycle.status === "open" ? '<button class="btn" data-act="self-return" data-id="' + esc(k) + '">ส่งกลับให้แก้ไข</button>' : "") + '</div></div>' +
        '<div class="cards">' +
          '<div class="card mini"><span class="label">คะแนนประเมินตนเอง</span><b class="num big2">' + sa.toFixed(2) + '</b><span class="muted small">' + A.grade(sa) + '</span></div>' +
          '<div class="card mini"><span class="label">คะแนนจาก HR</span><b class="num big2">' + (ma ? ma.toFixed(2) : "–") + '</b><span class="muted small">' + (ma ? mLabel : "ยังไม่ได้ประเมิน") + '</span></div>' +
          '<div class="card mini"><span class="label">ส่วนต่าง</span><b class="num big2">' + (ma ? diffTag(sa - ma) : "–") + '</b><span class="muted small">ตนเอง − HR</span></div>' +
          '<div class="card mini"><span class="label">ส่งเมื่อ</span><b class="big2" style="font-size:1.1rem">' + A.fdate(x.submittedAt) + '</b><span class="muted small">ตอบครบ ' + x.scores.filter(Boolean).length + '/' + A.N + ' ข้อ</span></div>' +
        '</div></section>' +
      '<section class="panel stack"><h3>สรุปผลงานจากพนักงาน</h3><div class="note">' + esc(x.comment || "ไม่ได้ระบุ") + '</div></section>' +
      '<section class="panel stack"><div class="sec-h"><h3>คะแนนรายหมวด</h3><span class="stkey"><span><i class="k-self"></i>ตนเอง</span>' + (m ? '<span><i class="k-boss"></i>' + mLabel + '</span>' : "") + '</span></div><div class="cbars">' + cbars + '</div></section>' +
      cats +
      (m ? '<p class="muted small">แถวสีเหลือง = คะแนนตนเองกับ HR ต่างกัน 2 คะแนนขึ้นไป</p>' : "") +
    '</div>';
  };
})(window.App);
