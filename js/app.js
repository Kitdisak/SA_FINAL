/* ตัวเรนเดอร์หลัก + อีเวนต์ + เริ่มระบบ */
(function (A) {
  var S = A.S;
  var root = document.getElementById("app");

  function topBar() {
    var right = S.me
      ? '<div class="who"><span><b>' + A.esc(S.me.name) + '</b> <span class="muted small">· ' +
        A.roleName(S.me.role) + '</span></span>' +
        '<button class="btn sm" data-act="logout">ออกจากระบบ</button></div>'
      : "";
    return '<header class="top"><div class="brand">ระบบประเมินพนักงาน<span>' + A.PERIOD + '</span></div>' + right + '</header>';
  }

  A.render = function () {
    var ou = document.getElementById("u"), op = document.getElementById("p");
    var uv = ou ? ou.value : "", pv = op ? op.value : "";     // กันค่าที่พิมพ์ค้างหาย
    var shell = !!S.me && S.view !== "login";
    var auth = !shell && S.view === "login";
    root.className = "app " + (shell ? "shell" + (S.navOpen ? " nav-open" : "") : auth ? "authpage" : "solo");
    root.innerHTML = shell ? A.shell(A.views[S.view]()) : auth ? A.views.login() : topBar() + A.views[S.view]();
    if (S.view === "login") {
      var u = document.getElementById("u"), p = document.getElementById("p");
      if (u) u.value = uv; if (p) p.value = pv;
    }
    if (S.view === "form") A.updateProgress();
    if (S.view === "self") A.updateSelfProgress();
  };
  // อัปเดตจากข้อมูลสด: ห้าม render ทับตอนกำลังกรอกฟอร์ม
  A.softRender = function () {
    if (S.view === "form") return;
    if (S.view === "self" && S.selfDraft) return;   // กำลังกรอกแบบประเมินตนเอง
    if (S.view === "criteria" || S.view === "calib" || (S.view === "cycles" && S.cycleEdit) || (S.view === "goals" && S.goalEdit)) return;   // กำลังแก้ไขข้อมูล
    var el = document.activeElement;   // กำลังเลือกกะ/พิมพ์ค้นหาอยู่: ไม่ render ทับ
    if (S.me && el && root.contains(el) && (el.tagName === "SELECT" || el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
    A.render();
  };

  /* ---------- อีเวนต์ (ผูกที่ root ตัวเดียว) ---------- */
  function pinCheck(p1, p2) {
    if (!/^\d{4,12}$/.test(p1)) return "PIN ใหม่ต้องเป็นตัวเลข 4–12 หลัก";
    if (p1 !== p2) return "PIN ใหม่ทั้งสองช่องไม่ตรงกัน";
    return "";
  }
  root.addEventListener("submit", async function (e) {
    var val = function (id) { var el = document.getElementById(id); return el ? el.value : ""; };
    if (e.target.id === "forgotForm") {
      e.preventDefault();
      var fe = document.getElementById("fErr"), fu = val("fu").trim().toLowerCase();
      var bad = (!fu || !val("fc").trim() || !val("fph").trim()) ? "กรุณากรอกข้อมูลให้ครบ" : pinCheck(val("fp1"), val("fp2"));
      if (bad) { fe.textContent = bad; return; }
      fe.textContent = "กำลังตรวจสอบ…";
      try {
        await A.api("/forgot-pin", { method: "POST", body: JSON.stringify({ username: fu, empCode: val("fc"), phone: val("fph"), newPin: val("fp1") }) });
        S.loginMode = "login"; S.loginErr = ""; S.loginOk = "ตั้ง PIN ใหม่เรียบร้อยแล้ว เข้าสู่ระบบด้วย PIN ใหม่ได้เลย";
        A.render(); var uu = document.getElementById("u"); if (uu) { uu.value = fu; document.getElementById("p").focus(); }
      } catch (err) { fe.textContent = err.message || "ตั้ง PIN ใหม่ไม่สำเร็จ"; }
      return;
    }
    if (e.target.id === "pinForm") {
      e.preventDefault();
      var ce = document.getElementById("cpErr");
      var bad2 = !val("cp0") ? "กรุณากรอก PIN ปัจจุบัน" : pinCheck(val("cp1"), val("cp2"));
      if (bad2) { ce.textContent = bad2; return; }
      ce.textContent = "กำลังบันทึก…";
      try {
        await A.api("/change-pin", { method: "POST", body: JSON.stringify({ currentPin: val("cp0"), newPin: val("cp1") }) });
        S.flash = "เปลี่ยน PIN เรียบร้อยแล้ว ครั้งหน้าใช้ PIN ใหม่ในการเข้าสู่ระบบ"; S.view = "home"; A.render(); window.scrollTo(0, 0);
      } catch (err) { ce.textContent = err.message || "เปลี่ยน PIN ไม่สำเร็จ"; }
      return;
    }
    if (e.target.id !== "loginForm") return;
    e.preventDefault();
    S.loginOk = "";
    var u = document.getElementById("u").value.trim().toLowerCase();
    var p = document.getElementById("p").value;
    try {
      var user = await A.loginApi(u, p);
      S.accounts[user.id] = { name: user.name, role: user.role, position: user.position };
      A.enter(user.id);
    } catch (err) {
      S.loginErr = (err && err.message === "ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง") ? err.message : "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบเซิร์ฟเวอร์";
      A.render();
    }
  });

  root.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]"); if (!t) return;
    var act = t.getAttribute("data-act");
    if (act === "logout") A.logout();
    else if (act === "forgot") { var cu = document.getElementById("u"); S.forgotUser = cu ? cu.value.trim() : ""; S.loginMode = "forgot"; S.loginErr = ""; S.loginOk = ""; A.render(); var f1 = document.getElementById(S.forgotUser ? "fc" : "fu"); if (f1) f1.focus(); }
    else if (act === "back-login") { S.loginMode = "login"; A.render(); }
    else if (act === "menu") { S.navOpen = !S.navOpen; root.classList.toggle("nav-open", S.navOpen); }
    else if (act === "nav") { S.view = t.getAttribute("data-view"); S.flash = ""; S.navOpen = false; S.target = null; S.draft = null; S.selfDraft = null; S.selfMsg = ""; S.cycleEdit = null; S.goalEdit = null; if (S.view === "cycles") S.cycles = null; A.render(); window.scrollTo(0, 0); }
    else if (act === "self-draft") A.saveSelf("draft");
    else if (act === "self-submit") A.saveSelf("submitted");
    else if (act === "self-return") A.returnSelf(t.getAttribute("data-id"));
    else if (act === "selfview") A.openSelfView(t.getAttribute("data-id"));
    else if (A.acts && A.acts[act]) A.acts[act](t);
    else if (act === "selfback") {
      if (S.selfBack === "form" && S.target && S.draft) { S.view = "form"; A.render(); }
      else { S.view = S.selfBack && S.selfBack !== "selfview" && S.selfBack !== "form" ? S.selfBack : "selfs"; A.render(); }
      window.scrollTo(0, 0);
    }
    else if (act === "open") A.openForm(t.getAttribute("data-id"));
    else if (act === "profile") { S.profileId = t.getAttribute("data-id"); S.view = "profile"; S.flash = ""; A.render(); window.scrollTo(0, 0); }
    else if (act === "read-all") A.markRead(null);
    else if (act === "del-eval") A.deleteEval(t.getAttribute("data-id"));
    else if (act === "fclear") A.clearFilter(t.getAttribute("data-fview"));
    else if (act === "noti") {
      var v = t.getAttribute("data-view");
      A.markRead(+t.getAttribute("data-id"));
      if (v && A.canView(v)) { S.view = v; S.flash = ""; S.selfDraft = null; A.render(); window.scrollTo(0, 0); }
    }
    else if (act === "back") { S.view = S.backView || "list"; S.target = null; S.draft = null; A.render(); }
    else if (act === "save-draft") A.saveEval("draft");
    else if (act === "submit") A.saveEval("submitted");
    else if (act === "ack") A.patchMine({ ack: true, ackAt: Date.now() }, "บันทึกการรับทราบแล้ว");
    else if (act === "reply") {
      var txt = S.replyDraft.trim();
      if (!txt) { S.flash = "กรุณาพิมพ์ข้อความก่อนส่ง"; A.render(); return; }
      A.patchMine({ reply: txt, replyAt: Date.now() }, "ส่งข้อความถึงพี่เลี้ยงและ HR แล้ว");
    }
  });

  root.addEventListener("change", function (e) {
    var fk = e.target.getAttribute && e.target.getAttribute("data-filter");
    if (fk && e.target.tagName === "SELECT") { A.setFilter(e.target.getAttribute("data-fview"), fk, e.target.value); e.target.blur(); return; }
    if (S.view === "calib" && e.target.classList && e.target.classList.contains("cb-sel")) { A.calibInput(e.target); return; }
    if (e.target.hasAttribute && e.target.hasAttribute("data-cyclesel")) { e.target.blur(); A.switchCycle(+e.target.value); return; }
    if (e.target.id === "sc-max") { A.scaleRows(+e.target.value); return; }
    if (e.target.hasAttribute && e.target.hasAttribute("data-ovdep")) { e.target.blur(); S.ovDep = e.target.value; A.render(); return; }
    var asg = e.target.getAttribute && e.target.getAttribute("data-assign");
    if (asg != null && e.target.tagName === "SELECT") { e.target.blur(); A.assignMentor(asg, e.target.value); return; }
    var sc = e.target.getAttribute && e.target.getAttribute("data-sched");
    if (sc && e.target.value) { e.target.blur(); A.saveShift(sc, +e.target.getAttribute("data-day"), e.target.value); return; }
    var n = e.target.name;
    if (S.view === "form" && n && n.charAt(0) === "q" && e.target.type === "radio") {
      var i = +n.slice(1);
      S.draft.scores[i] = +e.target.value;
      var b = document.getElementById("qb" + i); if (b) b.classList.remove("missing");
      A.updateProgress();
    }
    if (S.view === "self" && S.selfDraft && /^s\d+$/.test(n || "") && e.target.type === "radio") {
      var j = +n.slice(1);
      S.selfDraft.scores[j] = +e.target.value;
      var sb = document.getElementById("sb" + j); if (sb) sb.classList.remove("missing");
      A.updateSelfProgress();
    }
  });

  root.addEventListener("input", function (e) {
    var fk = e.target.getAttribute && e.target.getAttribute("data-filter");
    if (fk) { A.setFilter(e.target.getAttribute("data-fview"), fk, e.target.value); return; }
    if (e.target.id === "auditQ") { A.auditFilter(e.target.value); return; }
    var f = e.target.getAttribute && e.target.getAttribute("data-f"); if (!f) return;
    if (f === "scomment") { if (S.selfDraft) S.selfDraft.comment = e.target.value; return; }
    if (f.indexOf("scc") === 0) { if (S.selfDraft) S.selfDraft.cc[+f.slice(3)] = e.target.value; return; }
    if (f === "reply") S.replyDraft = e.target.value;
    else if (f === "strengths") S.draft.strengths = e.target.value;
    else if (f === "improvements") S.draft.improvements = e.target.value;
    else if (f.indexOf("cc") === 0) S.draft.cc[+f.slice(2)] = e.target.value;
  });

  /* ---------- เริ่มระบบ ---------- */
  A.render();
  A.connectDb().then(function (db) {
    if (!db) { S.dbState = "none"; A.softRender(); return; }
    S.db = db; S.dbState = "ready";
    db.collection("accounts").onSnapshot(function (snap) {
      S.accounts = {};
      snap.docs.forEach(function (x) { S.accounts[x.id] = x.data(); });
      var saved = A.load("eval-user");
      if (!S.me && saved && S.accounts[saved] && A.load("eval-token")) { A.enter(saved); return; }   // กลับเข้าผู้ใช้เดิมหลังรีเฟรช
      A.softRender();
    }, function () { S.dbState = "none"; A.softRender(); });
    A.softRender();
  }).catch(function () { S.dbState = "none"; A.softRender(); });
})(window.App);
