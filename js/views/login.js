/* หน้า 1: เข้าสู่ระบบ + ลืมรหัส PIN */
(function (A) {
  function note(S) {
    if (S.dbState === "loading") return '<p class="muted small">กำลังเชื่อมต่อฐานข้อมูล…</p>';
    if (S.dbState === "none") return '<p class="err">เชื่อมต่อเซิร์ฟเวอร์หรือฐานข้อมูลไม่ได้ กรุณาตรวจว่ารัน npm start และ Oracle ทำงานอยู่</p>';
    if (!Object.keys(S.accounts).length) return '<p class="muted small">ยังไม่มีบัญชีในระบบ</p>';
    return "";
  }

  function forgotView(S) {
    var off = S.dbState !== "ready" ? " disabled" : "";
    return '<section class="panel login stack"><div><h1>ลืมรหัส PIN</h1>' +
      '<p class="muted small">ยืนยันตัวตนด้วยข้อมูลพนักงาน แล้วตั้ง PIN ใหม่ได้ทันที (ถ้าไม่ทราบรหัสพนักงาน ติดต่อ HR (ฝ่ายบุคคล))</p></div>' +
      '<form id="forgotForm" class="stack" autocomplete="off">' +
      '<div class="field"><label for="fu">ชื่อผู้ใช้</label><input type="text" id="fu" autocapitalize="none" spellcheck="false" value="' + A.esc(S.forgotUser || "") + '"></div>' +
      '<div class="field"><label for="fc">รหัสพนักงาน</label><input type="text" id="fc" placeholder="เช่น EMP002" autocapitalize="characters" spellcheck="false"></div>' +
      '<div class="field"><label for="fph">เบอร์โทรที่ลงทะเบียนไว้</label><input type="text" id="fph" inputmode="tel" placeholder="เช่น 081-000-0002"></div>' +
      '<div class="field"><label for="fp1">PIN ใหม่ (ตัวเลข 4–12 หลัก)</label><input type="password" id="fp1" inputmode="numeric"></div>' +
      '<div class="field"><label for="fp2">ยืนยัน PIN ใหม่</label><input type="password" id="fp2" inputmode="numeric"></div>' +
      '<p class="err" id="fErr" aria-live="polite"></p>' + note(S) +
      '<button class="btn primary" type="submit"' + off + '>ตั้ง PIN ใหม่</button>' +
      '<button class="btn" type="button" data-act="back-login">← กลับไปหน้าเข้าสู่ระบบ</button></form></section>';
  }

  function ic(d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; }
  function hero() {
    var feats = [
      [ic('<path d="M4 20h4L19 9l-4-4L4 16z"/>'), "ประเมิน 20 ข้อใน 5 หมวด", "บันทึกร่างได้ ส่งเมื่อพร้อม"],
      [ic('<path d="M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6"/>'), "สรุปผลและติดตามสถานะ", "ค้นหา กรองตามแผนก ตำแหน่ง สถานะ"],
      [ic('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'), "แจ้งเตือนและตารางงาน", "รู้ทันทีเมื่อมีผลประเมินหรือกะเปลี่ยน"]
    ];
    return '<div class="auth-hero"><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>' +
      '<div class="auth-brand"><div class="side-logo"><img src="img/logo.png" alt="" onerror="this.remove()">EV</div><div><b>ระบบประเมินพนักงาน</b><span>' + A.esc(A.PERIOD) + '</span></div></div>' +
      '<div class="auth-copy"><h1>ประเมินผลงานทีม<br>ง่าย ชัดเจน ในที่เดียว</h1><p>เชื่อมข้อมูลกับ Oracle Database ทุกการบันทึกถูกเก็บอย่างปลอดภัย</p>' +
      '<ul class="feats">' + feats.map(function (f) { return '<li><span>' + f[0] + '</span><div><b>' + f[1] + '</b><small>' + f[2] + '</small></div></li>'; }).join("") + '</ul></div>' +
      '<div class="auth-foot">© 2569 Employee Evaluation System</div></div>';
  }

  A.views.login = function () {
    var S = A.S;
    return '<div class="auth">' + hero() + '<div class="auth-side">' + (S.loginMode === "forgot" ? forgotView(S) : loginView(S)) + '</div></div>';
  };

  function loginView(S) {
    var esc = A.esc;
    return '<section class="panel login stack"><div><h1>เข้าสู่ระบบ</h1><p class="muted small">กรอกชื่อผู้ใช้และรหัส PIN ของคุณ</p></div>' +
      (S.loginOk ? '<p class="flash">' + esc(S.loginOk) + '</p>' : "") +
      '<form id="loginForm" class="stack" autocomplete="off">' +
      '<div class="field"><label for="u">ชื่อผู้ใช้</label><input type="text" id="u" autocapitalize="none" spellcheck="false"></div>' +
      '<div class="field"><label for="p">รหัส PIN</label><input type="password" id="p" inputmode="numeric"></div>' +
      (S.loginErr ? '<p class="err">' + esc(S.loginErr) + '</p>' : "") + note(S) +
      '<button class="btn primary" type="submit"' + (S.dbState !== "ready" ? " disabled" : "") + '>เข้าสู่ระบบ</button>' +
      '<button class="linkbtn" type="button" data-act="forgot">ลืมรหัส PIN?</button></form></section>';
  }
})(window.App);
