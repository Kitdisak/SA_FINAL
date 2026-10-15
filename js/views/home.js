/* หน้าหลัก: แบนเนอร์ทักทาย + การ์ดสถิติ + 2 คอลัมน์ */
(function (A) {
  function ic(d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }
  var I = {
    users: ic('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.6 3.5 5.2"/>'),
    check: ic('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/>'),
    edit:  ic('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    clock: ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    star:  ic('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'),
    chat:  ic('<path d="M4 5h16v11H9l-5 4z"/>'),
    sun:   ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    flag:  ic('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>')
  };

  function stat(icon, tone, label, value, sub) {
    return '<div class="card stat t-' + tone + '"><span class="stat-ic">' + I[icon] + '</span>' +
      '<div><div class="k">' + label + '</div><div class="v">' + value + (sub ? '<small> ' + sub + '</small>' : "") + '</div></div></div>';
  }

  function ring(pct, label) {
    var r = 42, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
    return '<div class="ring" role="img" aria-label="' + label + ' ' + pct + '%">' +
      '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="' + r + '" class="ring-bg"/>' +
      '<circle cx="50" cy="50" r="' + r + '" class="ring-fg" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/></svg>' +
      '<div class="ring-txt"><b>' + pct + '%</b><span>' + label + '</span></div></div>';
  }

  function today() {
    try { return new Date().toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
    catch (e) { return ""; }
  }

  function evaluatorHome() {
    var S = A.S, esc = A.esc, isHR = S.me.role === "evaluator";
    var emps = A.staff();
    var sub = emps.filter(function (k) { return S.evals[k] && S.evals[k].status === "submitted"; });
    var draft = emps.filter(function (k) { return S.evals[k] && S.evals[k].status !== "submitted"; });
    var todo = emps.filter(function (k) { return !S.evals[k]; });
    var acked = sub.filter(function (k) { return S.evals[k].ack; });
    var asks = sub.filter(function (k) { return S.evals[k].reply; });
    var team = A.avg(sub.filter(function (k) { return A.isFinal(S.evals[k]); }).map(function (k) { return A.avg(S.evals[k].finalScores || []); }));
    // สถานะกระบวนการประเมิน (UC-18)
    var flow = isHR ? [["none", "table"], ["self", "table"], ["draft", "table"], ["pending_hr", "reviews"], ["confirmed", "reviews"], ["published", "table"], ["acknowledged", "table"]]
      : [["none", "selfs"], ["self", "selfs"], ["draft", "list"], ["pending_hr", "list"], ["confirmed", "list"], ["published", "list"], ["acknowledged", "list"]];
    var pipe = flow.map(function (f) {
      var n = emps.filter(function (k) { return A.stage(k) === f[0]; }).length;
      return '<button type="button" class="pipe-i' + (n ? "" : " zero") + '" data-act="nav" data-view="' + f[1] + '"><b class="num">' + n + '</b><span>' + A.STAGE[f[0]][0] + '</span></button>';
    }).join('<span class="pipe-arrow" aria-hidden="true">›</span>');
    var gp = A.pendingGoals(), rv = A.reviewCount(), late = emps.filter(function (k) { return A.lateOf(k).length; }).length;
    var pct = emps.length ? Math.round(sub.length / emps.length * 100) : 0;
    var working = emps.filter(function (k) { var c = (S.schedules[k] || {})[A.todayNo()]; return c && c !== "OFF"; }).length;

    function follow(list, label, cls, act) {
      return list.map(function (k) {
        var a = S.accounts[k];
        return '<div class="fitem"><span class="avatar sm">' + A.initial(a.name) + '</span>' +
          '<div class="grow"><b>' + esc(a.name) + '</b><span class="muted small">' + esc(a.position || "") + (isHR ? " · พี่เลี้ยง " + esc(A.mentorName(k) || "ยังไม่มอบหมาย") : "") + '</span></div>' +
          '<span class="pill ' + cls + '">' + label + '</span>' +
          (act === "table" ? '<button class="btn sm" data-act="nav" data-view="table">เปิด</button>' : '<button class="btn sm" data-act="' + act + '" data-id="' + esc(k) + '">เปิด</button>') + '</div>';
      }).join("");
    }
    var hrWait = emps.filter(function (k) { var d = (S.evals[k] || {}).dbStatus; return d === "pending_hr" || d === "confirmed"; });
    var noMentor = emps.filter(function (k) { return !(S.employees[k] || {}).mentor; });
    var todoMine = todo.filter(function (k) { return A.canEvaluate(k); });
    var pending = isHR ? asks.length + hrWait.length + noMentor.length : asks.length + draft.length + todoMine.length, MAX = 6;
    var rows = (isHR ? follow(asks, "มีข้อสงสัย", "ask", "rv-open") + follow(hrWait, "รอ HR ดำเนินการ", "ask", "rv-open") + follow(noMentor, "ยังไม่มอบหมายพี่เลี้ยง", "late", "table")
        : follow(asks, "มีข้อสงสัย", "ask", "open") + follow(draft, "ร่าง", "draft", "open") + follow(todoMine, "รอประเมิน", "", "open"))
      .split('<div class="fitem">').slice(1, MAX + 1).map(function (x) { return '<div class="fitem">' + x; }).join("") +
      (pending > MAX ? '<button class="linkbtn" data-act="nav" data-view="' + (isHR ? "table" : "list") + '">ดูทั้งหมด ' + pending + ' รายการ →</button>' : "");

    // ความคืบหน้าตามแผนก
    var deps = {};
    emps.forEach(function (k) {
      var d = (S.employees[k] || {}).department || "ไม่ระบุแผนก";
      deps[d] = deps[d] || { t: 0, s: 0 }; deps[d].t++;
      if (S.evals[k] && S.evals[k].status === "submitted") deps[d].s++;
    });
    var depRows = Object.keys(deps).sort(function (a, b) { return a.localeCompare(b, "th"); }).map(function (d) {
      var x = deps[d], p = Math.round(x.s / x.t * 100);
      return '<div class="dep"><div class="dep-l"><span>' + esc(d) + '</span><span class="num muted">' + x.s + '/' + x.t + '</span></div>' +
        '<div class="track"><i style="width:' + p + '%"></i></div></div>';
    }).join("");

    return '<div class="stack">' +
      '<section class="hero-banner">' +
        '<div class="hb-text"><span class="hb-date">' + I.sun + today() + '</span>' +
          '<h2>สวัสดี ' + esc(S.me.name) + '</h2>' +
          (isHR
            ? '<p>' + (rv ? 'มีผลจากพี่เลี้ยงรอ HR ตรวจสอบ/เผยแพร่ <b>' + rv + ' คน</b>' : 'ยังไม่มีผลที่รอ HR ตรวจสอบ') + (noMentor.length ? ' · ยังไม่มอบหมายพี่เลี้ยง <b>' + noMentor.length + ' คน</b>' : "") + '</p>' +
              '<div class="row"><button class="btn primary" data-act="nav" data-view="reviews">ตรวจสอบและยืนยันผล' + (rv ? " (" + rv + ")" : "") + '</button><button class="btn ghost" data-act="nav" data-view="table">ติดตามสถานะ</button></div></div>'
            : '<p>' + (todo.length + draft.length ? 'พนักงานในความดูแล ' + emps.length + ' คน · ยังเหลือที่ต้องประเมินอีก <b>' + (todo.length + draft.length) + ' คน</b>' : emps.length ? 'ประเมินพนักงานในความดูแลครบทุกคนแล้ว เยี่ยมมาก!' : 'ยังไม่มีพนักงานที่ได้รับมอบหมาย') + '</p>' +
              '<div class="row"><button class="btn primary" data-act="nav" data-view="list">' + (todo.length + draft.length ? "ไปประเมินต่อ" : "ดูรายชื่อ") + '</button>' +
              (gp ? '<button class="btn ghost" data-act="nav" data-view="goalreview">ตรวจสอบเป้าหมาย (' + gp + ')</button>' : '<button class="btn ghost" data-act="nav" data-view="selfs">แบบประเมินตนเอง</button>') + '</div></div>') +
        ring(pct, isHR ? "พี่เลี้ยงส่งผลแล้ว" : "ประเมินแล้ว") +
      '</section>' +
      '<div class="cards">' +
        stat("users", "blue", isHR ? "พนักงานทั้งหมด" : "พนักงานในความดูแล", '<span class="num">' + emps.length + '</span>', "คน") +
        stat("check", "green", isHR ? "พี่เลี้ยงส่งผลแล้ว" : "ส่งผลให้ HR แล้ว", '<span class="num">' + sub.length + '</span>', "คน") +
        stat("edit", "amber", "ร่าง ยังไม่ส่ง", '<span class="num">' + draft.length + '</span>', "คน") +
        stat("flag", "slate", "ยังไม่ประเมิน", '<span class="num">' + todo.length + '</span>', "คน") +
      '</div>' +
      '<section class="panel stack"><div class="sec-h"><h3>สถานะกระบวนการประเมิน</h3><span class="muted small">' + esc((S.cycle || {}).name || "") + (gp && !isHR ? ' · <button class="linkbtn" data-act="nav" data-view="goalreview">เป้าหมายรอตรวจสอบ ' + gp + ' ข้อ →</button>' : "") +
          (late && isHR ? ' · <button class="linkbtn late-link" data-act="late-go">ล่าช้า ' + late + ' คน →</button>' : late ? ' · <span class="pill late">ล่าช้า ' + late + ' คน</span>' : "") + '</span></div>' +
        '<div class="pipe">' + pipe + '</div></section>' +
      '<div class="dash">' +
        '<section class="panel stack"><div class="sec-h"><h3>รายการที่ต้องติดตาม</h3><span class="pill">' + (asks.length + draft.length + todo.length) + ' รายการ</span></div>' +
          '<div class="flist">' + (rows || '<div class="empty">ไม่มีรายการค้าง</div>') + '</div></section>' +
        '<div class="stack">' +
          '<section class="panel stack"><h3>ภาพรวมทีม</h3><div class="mini">' +
            '<div><span class="mini-ic t-blue">' + I.star + '</span><b class="num">' + (team ? team.toFixed(2) : "–") + '</b><span class="muted small">คะแนนสุดท้ายเฉลี่ย</span></div>' +
            '<div><span class="mini-ic t-green">' + I.check + '</span><b class="num">' + acked.length + '/' + sub.length + '</b><span class="muted small">รับทราบแล้ว</span></div>' +
            '<div><span class="mini-ic t-violet">' + I.chat + '</span><b class="num">' + asks.length + '</b><span class="muted small">ข้อสงสัย</span></div>' +
            '<div><span class="mini-ic t-amber">' + I.clock + '</span><b class="num">' + working + '</b><span class="muted small">เข้างานวันนี้</span></div>' +
          '</div></section>' +
          '<section class="panel stack"><h3>ความคืบหน้าตามแผนก</h3><div class="deps">' + (depRows || '<div class="empty">–</div>') + '</div></section>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function evaluateeHome() {
    var S = A.S, esc = A.esc, ev = S.evals[S.me.id];
    var acc = S.accounts[S.me.id] || {}, emp = S.employees[S.me.id] || {};
    var shift = A.SHIFTS[(S.schedules[S.me.id] || {})[A.todayNo()]];
    var done = ev && ev.status === "submitted", a = done ? A.avg(ev.scores) : 0;
    var sx = A.selfOf(S.me.id), sst = sx ? sx.status : "none";
    var gl = S.goals || [], gap = gl.filter(function (g) { return g.status === "approved"; }).length, gret = gl.filter(function (g) { return g.status === "returned"; }).length;
    var goalBox = '<section class="panel self-cta' + (gl.length && gap === gl.length ? " ok" : "") + '"><div><b>เป้าหมายของฉัน</b><p class="muted small">' +
      (!gl.length ? "ยังไม่ได้กำหนดเป้าหมายในรอบนี้" : gret ? "มี " + gret + " ข้อที่พี่เลี้ยงส่งกลับให้แก้ไข" : "อนุมัติแล้ว " + gap + "/" + gl.length + " ข้อ") + '</p></div>' +
      '<button class="btn' + (gl.length ? "" : " primary") + '" data-act="nav" data-view="goals">' + (gl.length ? "ดูเป้าหมาย" : "กำหนดเป้าหมาย") + '</button></section>';
    var selfBox = !S.selfsLoaded ? "" : '<section class="panel self-cta' + (sst === "submitted" ? " ok" : "") + '"><div>' +
      '<b>แบบประเมินตนเอง</b><p class="muted small">' +
      (sst === "submitted" ? "ส่งให้พี่เลี้ยงแล้วเมื่อ " + A.fdate(sx.submittedAt) + " · คะแนนเฉลี่ย " + A.avg(sx.scores).toFixed(2)
        : sx && sx.returnReason ? "พี่เลี้ยงส่งกลับให้แก้ไข: " + esc(sx.returnReason)
        : sst === "draft" ? "บันทึกร่างไว้แล้ว ยังไม่ได้ส่งให้พี่เลี้ยง" : "ประเมินตนเอง 20 ข้อ แล้วส่งให้พี่เลี้ยงก่อนพี่เลี้ยงประเมิน") + '</p></div>' +
      '<button class="btn' + (sst === "submitted" ? "" : " primary") + '" data-act="nav" data-view="self">' + (sst === "submitted" ? "ดูแบบประเมินตนเอง" : sst === "none" ? "เริ่มประเมินตนเอง" : "ทำต่อ") + '</button></section>';

    var evalBox = done
      ? '<div class="cards">' +
          stat("star", "blue", "คะแนนเฉลี่ยรวม", a.toFixed(2), "/ " + A.MAX) +
          stat("flag", "violet", "ระดับ", '<span class="lvl">' + A.grade(a) + '</span>') +
          stat("check", ev.ack ? "green" : "amber", "สถานะ", '<span class="lvl">' + (ev.ack ? "รับทราบแล้ว" : "รอรับทราบ") + '</span>') +
        '</div>'
      : '<section class="panel empty-state">' + I.clock + '<h3>ยังไม่มีผลประเมิน</h3><p class="muted">เมื่อ HR เผยแพร่ผลแล้ว คะแนนและข้อเสนอแนะจะแสดงที่นี่</p></section>';

    return '<div class="stack">' +
      '<section class="hero-banner">' +
        '<div class="hb-text"><span class="hb-date">' + I.sun + today() + '</span>' +
          '<h2>สวัสดี ' + esc(S.me.name) + '</h2>' +
          '<p>' + esc(acc.position || "") + (emp.department ? " · " + esc(emp.department) : "") + (emp.mentor ? " · พี่เลี้ยง: " + esc(A.mentorName(S.me.id)) : "") + '</p>' +
          '<div class="row">' + (done ? '<button class="btn primary" data-act="nav" data-view="mine">ดูผลประเมินของฉัน</button>' : "") +
          '<button class="btn ghost" data-act="nav" data-view="profile">ข้อมูลของฉัน</button></div></div>' +
        '<div class="hb-shift"><span>วันนี้</span><b>' + (shift ? shift.label : "–") + '</b><small>' + (shift && shift.time ? shift.time : "") + '</small></div>' +
      '</section>' +
      goalBox + selfBox + evalBox +
      '<section class="panel stack"><div class="sec-h"><h3>ตารางงานสัปดาห์นี้</h3><button class="btn sm" data-act="nav" data-view="schedule">ดูทั้งหมด</button></div>' + A.weekStrip(S.me.id) + '</section>' +
    '</div>';
  }

  A.views.home = function () {
    var r = A.S.me && A.S.me.role;
    return r === "executive" ? A.views.overview() : r === "evaluator" || r === "mentor" ? evaluatorHome() : evaluateeHome();
  };
})(window.App);
