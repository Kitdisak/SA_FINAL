/* โครงหน้าหลังล็อกอิน: แถบเมนูซ้าย + หัวหน้า (เพิ่ม/ลบเมนูได้ที่ A.NAV) */
(function (A) {
  function svg(d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }
  var ICON = {
    home:  svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
    users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.8c2 .7 3.2 2.6 3.5 5.2"/>'),
    table: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>'),
    doc:   svg('<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>'),
    out:   svg('<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>'),
    key:   svg('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>'),
    menu:  svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    bell:  svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
    id:    svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16c.5-1.6 1.7-2.4 3.2-2.4s2.7.8 3.2 2.4M14.5 10h4M14.5 13.5h3"/>'),
    cal:   svg('<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 3v3M16 3v3M7.5 13h3M7.5 16.5h3M13.5 13h3"/>'),
    sliders: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
    target: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
    check: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 12.5l3 3 5-6"/>'),
    chart: svg('<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>'),
    pen:   svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    clock: svg('<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 3v3M16 3v3"/><path d="M12 12.5v3l2 1.2"/>')
  };

  // เมนูตามบทบาท: view = ชื่อหน้าใน A.views
  A.NAV = {
    evaluator: [   // HR: UC-12 ถึง UC-16 (+ มอบหมายพี่เลี้ยง ขยายเวลา ประวัติการเปลี่ยนแปลง)
      { group: "ภาพรวม", view: "home",  icon: "home",  label: "หน้าหลัก" },
      { group: "ภาพรวม", view: "notifications", icon: "bell", label: "แจ้งเตือน", count: "unread" },
      { group: "ตั้งค่าการประเมิน", view: "cycles", icon: "cal", label: "รอบการประเมิน" },
      { group: "ตั้งค่าการประเมิน", view: "criteria", icon: "sliders", label: "เกณฑ์และแบบประเมิน" },
      { group: "การประเมิน", view: "table", icon: "table", label: "ติดตามสถานะ", count: "replies" },
      { group: "การประเมิน", view: "reviews", icon: "check", label: "ตรวจสอบและยืนยันผล", count: "reviews" },
      { group: "รายงาน", view: "report", icon: "chart", label: "รายงานสรุปผล" },
      { group: "รายงาน", view: "audit", icon: "clock", label: "ประวัติการเปลี่ยนแปลง" },
      { group: "พนักงาน", view: "employees", icon: "id", label: "ประวัติพนักงาน" },
      { group: "พนักงาน", view: "schedule", icon: "clock", label: "ตารางเวลางาน" },
      { group: "บัญชี", view: "me", icon: "id", label: "ข้อมูลของฉัน" },
      { group: "บัญชี", view: "pin", icon: "key", label: "เปลี่ยน PIN" }
    ],
    mentor: [      // พี่เลี้ยง: UC-07 ถึง UC-11 (เฉพาะพนักงานที่ได้รับมอบหมาย)
      { group: "ภาพรวม", view: "home", icon: "home", label: "หน้าหลัก" },
      { group: "ภาพรวม", view: "notifications", icon: "bell", label: "แจ้งเตือน", count: "unread" },
      { group: "พนักงานในความดูแล", view: "goalreview", icon: "target", label: "ตรวจสอบเป้าหมาย", count: "goals" },
      { group: "พนักงานในความดูแล", view: "selfs", icon: "pen", label: "แบบประเมินตนเอง", count: "selfwait" },
      { group: "พนักงานในความดูแล", view: "list", icon: "users", label: "ประเมินพนักงาน", count: "mentortodo" },
      { group: "ของฉัน", view: "me", icon: "id", label: "ข้อมูลของฉัน" },
      { group: "ของฉัน", view: "schedule", icon: "clock", label: "ตารางเวลางาน" },
      { group: "บัญชี", view: "pin", icon: "key", label: "เปลี่ยน PIN" }
    ],
    executive: [   // ผู้บริหาร: UC-17, UC-18 (ดูอย่างเดียว)
      { group: "ภาพรวม", view: "home", icon: "home", label: "ภาพรวมการประเมิน" },
      { group: "ภาพรวม", view: "notifications", icon: "bell", label: "แจ้งเตือน", count: "unread" },
      { group: "รายงาน", view: "report", icon: "chart", label: "รายงานสรุปผล" },
      { group: "บัญชี", view: "me", icon: "id", label: "ข้อมูลของฉัน" },
      { group: "บัญชี", view: "pin", icon: "key", label: "เปลี่ยน PIN" }
    ],
    evaluatee: [   // พนักงาน: UC-01 ถึง UC-06
      { group: "ภาพรวม", view: "home", icon: "home", label: "หน้าหลัก" },
      { group: "ภาพรวม", view: "notifications", icon: "bell", label: "แจ้งเตือน", count: "unread" },
      { group: "การประเมินของฉัน", view: "cycle", icon: "cal", label: "รอบการประเมิน" },
      { group: "การประเมินของฉัน", view: "goals", icon: "target", label: "เป้าหมายของฉัน" },
      { group: "การประเมินของฉัน", view: "self", icon: "pen", label: "ประเมินตนเอง", count: "selftodo" },
      { group: "การประเมินของฉัน", view: "mine", icon: "doc",  label: "ผลประเมินของฉัน" },
      { group: "ของฉัน", view: "profile", icon: "id", label: "ข้อมูลของฉัน" },
      { group: "ของฉัน", view: "schedule", icon: "clock", label: "ตารางเวลางาน" },
      { group: "บัญชี", view: "pin", icon: "key", label: "เปลี่ยน PIN" }
    ]
  };

  A.ROLE_TH = { evaluator: "HR (ฝ่ายบุคคล)", mentor: "พี่เลี้ยง", executive: "ผู้บริหาร", evaluatee: "พนักงาน" };
  A.roleName = function (r) { return A.ROLE_TH[r] || "พนักงาน"; };
  // หน้าที่บทบาทนี้เปิดได้ (ใช้ตอนกดแจ้งเตือน)
  var EXTRA = { evaluator: ["calib", "selfview", "profile", "employees", "schedule"], mentor: ["form", "selfview"], executive: [], evaluatee: [] };
  A.canView = function (v) {
    var r = A.S.me && A.S.me.role;
    return !!A.views[v] && ((A.NAV[r] || []).some(function (n) { return n.view === v; }) || (EXTRA[r] || []).indexOf(v) >= 0);
  };

  // ชื่อหน้าบนแถบหัว
  A.TITLES = {
    home:  "หน้าหลัก",
    overview: "ภาพรวมสถานะและผลการประเมิน",
    list:  "ประเมินพนักงาน",
    form:  "แบบประเมิน",
    table: "ติดตามสถานะการประเมิน",
    cycle: "รอบการประเมิน",
    cycles: "กำหนดรอบการประเมิน",
    criteria: "เกณฑ์และแบบประเมิน",
    goals: "เป้าหมายของฉัน",
    goalreview: "ตรวจสอบเป้าหมาย",
    reviews: "ตรวจสอบและยืนยันผล",
    calib: "ปรับเทียบผลการประเมิน",
    report: "รายงานสรุปผลการประเมิน",
    audit: "ประวัติการเปลี่ยนแปลง",
    mine:  "ผลประเมินของฉัน",
    self:  "ประเมินตนเอง",
    selfs: "แบบประเมินตนเองของพนักงาน",
    selfview: "รายละเอียดการประเมินตนเอง",
    employees: "ประวัติพนักงาน",
    profile: "ประวัติพนักงาน",
    schedule: "ตารางเวลางาน",
    notifications: "แจ้งเตือน",
    me: "ข้อมูลของฉัน",
    pin: "เปลี่ยนรหัส PIN"
  };

  // ตัวอักษรแรกของชื่อ (ใช้ในรูปโปรไฟล์วงกลม)
  A.initial = function (name) { return A.esc(String(name || "?").replace(/^คุณ/, "").trim().charAt(0)); };

  function replyCount() {
    var S = A.S;
    return Object.keys(S.evals).filter(function (k) { var e = S.evals[k]; return e && e.status === "submitted" && e.reply; }).length;
  }

  // พนักงานที่ส่งประเมินตนเองแล้ว แต่พี่เลี้ยงยังไม่ได้ส่งผล
  function selfWait() {
    var S = A.S;
    return A.staff().filter(function (k) { var e = S.evals[k], x = S.selfs[k]; return x && x.status === "submitted" && !(e && e.status === "submitted"); }).length;
  }
  // พี่เลี้ยง: ร่างที่ยังไม่ส่ง หรือ HR ส่งกลับ
  function mentorTodo() {
    var S = A.S;
    return A.staff().filter(function (k) { var e = S.evals[k]; return (e && e.dbStatus === "draft") || (!e && A.selfDone(k)); }).length;
  }
  function selfTodo() { var S = A.S; return S.selfsLoaded && !A.selfDone(S.me.id) ? 1 : 0; }

  function headDate() {
    try { return new Date().toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; }
  }

  A.shell = function (content) {
    var S = A.S, esc = A.esc, me = S.me;
    var active = S.view === "form" ? "list" : (S.view === "profile" && me.role === "evaluator") ? "employees" : S.view === "selfview" ? (me.role === "evaluator" ? "table" : "selfs") : S.view === "calib" ? "reviews" : S.view;
    var lastGroup = "";
    var items = (A.NAV[me.role] || []).map(function (n) {
      var c = n.count === "replies" ? replyCount() : n.count === "unread" ? A.unread() : n.count === "selfwait" ? selfWait() : n.count === "selftodo" ? selfTodo() : n.count === "goals" ? A.pendingGoals() : n.count === "reviews" ? A.reviewCount() : n.count === "mentortodo" ? mentorTodo() : 0;
      var tip = n.count === "replies" ? "ข้อสงสัยจากพนักงาน" : n.count === "unread" ? "ยังไม่อ่าน" : n.count === "selfwait" ? "ส่งประเมินตนเองแล้ว รอพี่เลี้ยงประเมิน" : n.count === "goals" ? "เป้าหมายรอตรวจสอบ" : n.count === "reviews" ? "รอตรวจสอบหรือรอเผยแพร่" : n.count === "mentortodo" ? "รอประเมิน / ร่างที่ยังไม่ส่ง" : "ยังไม่ได้ส่งแบบประเมินตนเอง";
      var head = n.group && n.group !== lastGroup ? '<div class="nav-label">' + esc(n.group) + '</div>' : "";
      lastGroup = n.group || lastGroup;
      return head + '<button type="button" data-act="nav" data-view="' + n.view + '"' + (active === n.view ? ' class="on" aria-current="page"' : "") + '>' +
        ICON[n.icon] + '<span>' + esc(n.label) + '</span>' + (c ? '<span class="count" title="' + tip + '">' + (n.count === "selftodo" ? "!" : c) + '</span>' : "") + '</button>';
    }).join("");
    var roleTh = A.roleName(me.role);
    var title = S.view === "home" && me.role === "executive" ? "ภาพรวมการประเมิน" : S.view === "list" && me.role === "mentor" ? "พนักงานในความดูแล" : (A.TITLES[S.view] || "");

    return '<aside class="side" aria-label="เมนูหลัก">' +
        '<div class="side-brand"><div class="side-logo"><img src="img/logo.png" alt="" onerror="this.remove()">EV</div><div><b>ระบบประเมินพนักงาน</b><span>' + esc(A.PERIOD) + '</span></div></div>' +
        '<div class="side-user"><div class="avatar">' + A.initial(me.name) + '</div>' +
          '<div><b>' + esc(me.name) + '</b><span>' + roleTh + '</span></div></div>' +
        '<nav class="nav">' + items + '</nav>' +
        '<button type="button" class="side-out" data-act="logout">' + ICON.out + 'ออกจากระบบ</button>' +
      '</aside>' +
      '<div class="scrim" data-act="menu"></div>' +
      '<div class="main">' +
        '<header class="head"><button type="button" class="menu-btn" data-act="menu" aria-label="เปิดเมนู">' + ICON.menu + '</button>' +
          '<div class="grow"><div class="crumb">' + esc(A.PERIOD) + ' <span>/</span> ' + esc(title) + '</div><h1>' + esc(title) + '</h1></div>' +
          '<span class="head-date">' + headDate() + '</span>' +
          '<button type="button" class="bell" data-act="nav" data-view="notifications" aria-label="แจ้งเตือน ' + A.unread() + ' รายการที่ยังไม่อ่าน">' + ICON.bell +
            (A.unread() ? '<span class="count">' + A.unread() + '</span>' : "") + '</button>' +
          '<button type="button" class="chip" data-act="nav" data-view="' + (me.role === "evaluatee" ? "profile" : "me") + '" title="ข้อมูลของฉัน"><span class="avatar xs">' + A.initial(me.name) + '</span><span><b>' + esc(me.name) + '</b><small>' + roleTh + '</small></span></button></header>' +
        '<main class="content">' +
          (S.viewCycle && S.cycle ? '<div class="viewing"><span>กำลังดูข้อมูลย้อนหลังของ <b>' + esc(S.cycle.name) + '</b> (ปิดแล้ว ดูได้อย่างเดียว)</span><button type="button" class="btn sm" data-act="cyc-current">กลับไปรอบปัจจุบัน</button></div>' : "") +
          (S.flash && S.view !== "list" && S.view !== "mine" ? '<p class="flash" style="margin-bottom:16px">' + esc(S.flash) + '</p>' : "") + content + '</main>' +
      '</div>';
  };
})(window.App);
