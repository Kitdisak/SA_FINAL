/* หน้าแจ้งเตือน */
(function (A) {
  A.views.notifications = function () {
    var S = A.S, esc = A.esc, unread = A.unread();
    var items = S.notis.map(function (n) {
      return '<button type="button" class="noti' + (n.read ? "" : " new") + '" data-act="noti" data-id="' + n.id + '" data-view="' + esc(n.view || "") + '">' +
        '<span class="dot" aria-hidden="true"></span>' +
        '<span class="nt"><b>' + esc(n.title) + '</b>' + (n.body ? '<span class="muted small">' + esc(n.body) + '</span>' : "") +
        '<span class="muted small">' + A.fdatetime(n.at) + '</span></span>' +
        (n.read ? "" : '<span class="pill ask">ใหม่</span>') + '</button>';
    }).join("");
    return '<div class="stack">' +
      '<div class="row" style="justify-content:space-between"><div><h2>แจ้งเตือน</h2><p class="muted small">ยังไม่ได้อ่าน ' + unread + ' รายการ</p></div>' +
      (unread ? '<button class="btn sm" data-act="read-all">ทำเครื่องหมายว่าอ่านทั้งหมด</button>' : "") + '</div>' +
      '<section class="panel noti-list">' + (items || '<div class="empty">ยังไม่มีแจ้งเตือน</div>') + '</section>' +
    '</div>';
  };
})(window.App);
