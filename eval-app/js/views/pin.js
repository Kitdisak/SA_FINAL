/* เปลี่ยน PIN (หลังล็อกอิน) */
(function (A) {
  A.views.pin = function () {
    return '<section class="panel stack" style="max-width:460px"><div><h2>เปลี่ยนรหัส PIN</h2>' +
      '<p class="muted small">PIN ใช้เข้าสู่ระบบ เป็นตัวเลข 4–12 หลัก ไม่ควรใช้เลขที่เดาง่าย เช่น 1234 หรือวันเกิด</p></div>' +
      '<form id="pinForm" class="stack" autocomplete="off">' +
      '<div class="field"><label for="cp0">PIN ปัจจุบัน</label><input type="password" id="cp0" inputmode="numeric"></div>' +
      '<div class="field"><label for="cp1">PIN ใหม่</label><input type="password" id="cp1" inputmode="numeric"></div>' +
      '<div class="field"><label for="cp2">ยืนยัน PIN ใหม่</label><input type="password" id="cp2" inputmode="numeric"></div>' +
      '<p class="err" id="cpErr" aria-live="polite"></p>' +
      '<div><button class="btn primary" type="submit">บันทึก PIN ใหม่</button></div></form></section>';
  };
})(window.App);
