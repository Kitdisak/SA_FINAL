/* ตารางเวลางานรายสัปดาห์: หัวหน้าแก้กะได้, พนักงานดูของตัวเอง */
(function (A) {
  A.shiftPill = function (code) {
    var s = A.SHIFTS[code];
    if (!s) return '<span class="muted">–</span>';
    return '<span class="shift s-' + code + '">' + s.label + (s.time ? '<small>' + s.time + '</small>' : "") + '</span>';
  };

  // แถบ 7 วันของพนักงาน 1 คน (ใช้ในหน้าประวัติและหน้าตารางงานของพนักงาน)
  A.weekStrip = function (userId) {
    var row = A.S.schedules[userId] || {}, today = A.todayNo();
    return '<div class="week">' + A.DAYS.map(function (d, i) {
      var n = i + 1;
      return '<div class="day' + (n === today ? " today" : "") + '"><div class="dn">' + d + (n === today ? " · วันนี้" : "") + '</div>' + A.shiftPill(row[n]) + '</div>';
    }).join("") + '</div>';
  };

  function legend() {
    return '<div class="legend">' + A.SHIFT_ORDER.map(function (c) { return A.shiftPill(c); }).join("") + '</div>';
  }

  function evaluatorView() {
    var S = A.S, esc = A.esc, today = A.todayNo();
    var emps = Object.keys(S.accounts)
      .filter(function (k) { return S.accounts[k].role === "evaluatee"; })
      .sort(function (a, b) { return S.accounts[a].name.localeCompare(S.accounts[b].name, "th"); });

    var working = A.DAYS.map(function (_, i) {
      return emps.filter(function (k) { var c = (S.schedules[k] || {})[i + 1]; return c && c !== "OFF"; }).length;
    });

    var head = '<tr><th>พนักงาน</th>' + A.DAYS.map(function (d, i) {
      return '<th' + (i + 1 === today ? ' class="today"' : "") + '>' + d + '</th>';
    }).join("") + '</tr>';

    var rows = emps.map(function (k) {
      var row = S.schedules[k] || {};
      return '<tr><td><b>' + esc(S.accounts[k].name) + '</b><div class="muted small">' + esc(S.accounts[k].position || "") + '</div></td>' +
        A.DAYS.map(function (_, i) {
          var n = i + 1, cur = row[n] || "";
          var opts = (cur ? "" : '<option value="" selected>–</option>') + A.SHIFT_ORDER.map(function (c) {
            return '<option value="' + c + '"' + (c === cur ? " selected" : "") + '>' + A.SHIFTS[c].label + '</option>';
          }).join("");
          return '<td' + (n === today ? ' class="today"' : "") + '><select class="sel s-' + (cur || "none") + '" data-sched="' + esc(k) + '" data-day="' + n + '" aria-label="' + esc(S.accounts[k].name) + ' วัน' + A.DAYS[i] + '">' + opts + '</select></td>';
        }).join("") + '</tr>';
    }).join("");

    var foot = '<tr class="sum"><td>มาทำงาน (คน)</td>' + working.map(function (w, i) {
      return '<td class="n' + (i + 1 === today ? " today" : "") + '">' + w + '</td>';
    }).join("") + '</tr>';

    return '<div class="stack">' +
      '<div><h2>ตารางเวลางานประจำสัปดาห์</h2><p class="muted small">เลือกกะในช่องเพื่อเปลี่ยน ระบบบันทึกลงฐานข้อมูลทันทีและแจ้งเตือนพนักงาน</p></div>' +
      legend() +
      '<div class="tbl-wrap"><table class="tbl sched"><thead>' + head + '</thead><tbody>' +
        (rows || '<tr><td colspan="8" class="empty">ยังไม่มีรายชื่อพนักงาน</td></tr>') + foot + '</tbody></table></div>' +
    '</div>';
  }

  function evaluateeView() {
    var S = A.S, row = S.schedules[S.me.id] || {}, today = row[A.todayNo()];
    var s = A.SHIFTS[today];
    var days = Object.keys(row).filter(function (d) { return row[d] && row[d] !== "OFF"; }).length;
    return '<div class="stack">' +
      '<div class="cards">' +
        '<div class="card accent"><div class="k">วันนี้ (' + A.DAYS[A.todayNo() - 1] + ')</div><div class="v" style="font-size:1.4rem">' + (s ? s.label : "–") + '</div>' + (s && s.time ? '<div class="muted small">' + s.time + '</div>' : "") + '</div>' +
        '<div class="card"><div class="k">วันทำงานต่อสัปดาห์</div><div class="v"><span class="num">' + days + '</span><small> วัน</small></div></div>' +
      '</div>' +
      '<section class="panel stack"><h3>ตารางของฉันสัปดาห์นี้</h3>' + A.weekStrip(S.me.id) + '</section>' +
      legend() +
    '</div>';
  }

  A.views.schedule = function () {
    return A.S.me.role === "evaluator" ? evaluatorView() : evaluateeView();
  };
})(window.App);
