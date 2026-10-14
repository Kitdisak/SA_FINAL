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
    clock: svg('<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 3v3M16 3v3"/><path d="M12 12.5v3l2 1.2"/>')
  };

  // เมนูตามบทบาท: view = ชื่อหน้าใน A.views
  A.NAV = {
    evaluator: [
      { group: "ภาพรวม", view: "home",  icon: "home",  label: "หน้าหลัก" },
      { group: "ภาพรวม", view: "notifications", icon: "bell", label: "แจ้งเตือน", count: "unread" },
      { group: "การประเมิน", view: "list",  icon: "users", label: "ประเมินพนักงาน" },
      { group: "การประเมิน", view: "table", icon: "table", label: "สรุปผลทั้งหมด", count: "replies" },
      { group: "พนักงาน", view: "employees", icon: "id", label: "ประวัติพนักงาน" },
      { group: "พนักงาน", view: "schedule", icon: "clock", label: "ตารางเวลางาน" },
      { group: "บัญชี", view: "me", icon: "id", label: "ข้อมูลของฉัน" },
      { group: "บัญชี", view: "pin", icon: "key", label: "เปลี่ยน PIN" }
    ],
    evaluatee: [
      { group: "ภาพรวม", view: "home", icon: "home", label: "หน้าหลัก" },
      { group: "ภาพรวม", view: "notifications", icon: "bell", label: "แจ้งเตือน", count: "unread" },
      { group: "ของฉัน", view: "mine", icon: "doc",  label: "ผลประเมินของฉัน" },
      { group: "ของฉัน", view: "profile", icon: "id", label: "ข้อมูลของฉัน" },
      { group: "ของฉัน", view: "schedule", icon: "clock", label: "ตารางเวลางาน" },
      { group: "บัญชี", view: "pin", icon: "key", label: "เปลี่ยน PIN" }
    ]
  };

  // ชื่อหน้าบนแถบหัว
  A.TITLES = {
    home:  "หน้าหลัก",
    list:  "ประเมินพนักงาน",
    form:  "แบบประเมิน",
    table: "สรุปผลประเมินทั้งหมด",
    mine:  "ผลประเมินของฉัน",
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

  function headDate() {
    try { return new Date().toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; }
  }

  A.shell = function (content) {
    var S = A.S, esc = A.esc, me = S.me;
    var active = S.view === "form" ? "list" : (S.view === "profile" && me.role === "evaluator") ? "employees" : S.view;
    var lastGroup = "";
    var items = (A.NAV[me.role] || []).map(function (n) {
      var c = n.count === "replies" ? replyCount() : n.count === "unread" ? A.unread() : 0;
      var head = n.group && n.group !== lastGroup ? '<div class="nav-label">' + esc(n.group) + '</div>' : "";
      lastGroup = n.group || lastGroup;
      return head + '<button type="button" data-act="nav" data-view="' + n.view + '"' + (active === n.view ? ' class="on" aria-current="page"' : "") + '>' +
        ICON[n.icon] + '<span>' + esc(n.label) + '</span>' + (c ? '<span class="count" title="ข้อสงสัยจากพนักงาน">' + c + '</span>' : "") + '</button>';
    }).join("");
    var roleTh = me.role === "evaluator" ? "ผู้ประเมิน" : "ผู้ถูกประเมิน";

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
          '<div class="grow"><div class="crumb">' + esc(A.PERIOD) + ' <span>/</span> ' + esc(A.TITLES[S.view] || "") + '</div><h1>' + esc(A.TITLES[S.view] || "") + '</h1></div>' +
          '<span class="head-date">' + headDate() + '</span>' +
          '<button type="button" class="bell" data-act="nav" data-view="notifications" aria-label="แจ้งเตือน ' + A.unread() + ' รายการที่ยังไม่อ่าน">' + ICON.bell +
            (A.unread() ? '<span class="count">' + A.unread() + '</span>' : "") + '</button>' +
          '<button type="button" class="chip" data-act="nav" data-view="' + (me.role === "evaluator" ? "me" : "profile") + '" title="ข้อมูลของฉัน"><span class="avatar xs">' + A.initial(me.name) + '</span><span><b>' + esc(me.name) + '</b><small>' + roleTh + '</small></span></button></header>' +
        '<main class="content">' + (S.flash && S.view !== "list" && S.view !== "mine" ? '<p class="flash" style="margin-bottom:16px">' + esc(S.flash) + '</p>' : "") + content + '</main>' +
      '</div>';
  };
})(window.App);
