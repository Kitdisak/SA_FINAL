/* แถบค้นหา + ตัวกรอง (ใช้ร่วมกันในหน้าประเมิน / สรุปผล / ประวัติพนักงาน)
   กรองบนหน้าจอโดยไม่ render ใหม่ ช่องค้นหาจึงไม่หลุดโฟกัสระหว่างพิมพ์ */
(function (A) {
  var STATUS = [["none", "ยังไม่ประเมิน"], ["draft", "ร่าง"], ["submitted", "ส่งผลแล้ว"]];

  // พนักงานที่ผู้ใช้เห็น: HR/ผู้บริหาร = ทุกคน, พี่เลี้ยง = เฉพาะที่ได้รับมอบหมาย (UC-07/08 Exception 2)
  A.staff = function () {
    var S = A.S, men = S.me && S.me.role === "mentor";
    return Object.keys(S.accounts).filter(function (k) {
      return S.accounts[k].role === "evaluatee" && (!men || (S.employees[k] && S.employees[k].mentor === S.me.id));
    });
  };
  A.mentorName = function (k) { var m = (A.S.employees[k] || {}).mentor; return m ? ((A.S.accounts[m] || {}).name || m) : ""; };

  A.filterState = function (view) {
    var all = A.S.filters = A.S.filters || {};
    return all[view] || (all[view] = { q: "", dep: "", pos: "", st: "" });
  };

  A.evalStatus = function (k) {
    var ev = A.S.evals[k];
    return !ev ? "none" : ev.status === "submitted" ? "submitted" : "draft";
  };

  // หน้าที่ใช้สถานะแบบอื่น (เช่น หน้าแบบประเมินตนเอง) ลงทะเบียนฟังก์ชันสถานะไว้ที่นี่
  A.statusFn = {};
  function info(view, k) {
    var a = A.S.accounts[k] || {}, e = A.S.employees[k] || {};
    return { q: [k, a.name, a.position, e.code, e.department].join(" ").toLowerCase(), dep: e.department || "", pos: a.position || "", st: (A.statusFn[view] || A.evalStatus)(k) };
  }
  function match(i, f) {
    var q = f.q.trim().toLowerCase();
    return (!q || i.q.indexOf(q) >= 0) && (!f.dep || i.dep === f.dep) && (!f.pos || i.pos === f.pos) && (!f.st || i.st === f.st);
  }

  // ใส่ใน tag ของแต่ละแถว: <tr' + A.rowAttrs(view, k) + '>
  A.rowAttrs = function (view, k) {
    var i = info(view, k), esc = A.esc;
    return ' data-frow data-q="' + esc(i.q) + '" data-dep="' + esc(i.dep) + '" data-pos="' + esc(i.pos) + '" data-st="' + i.st + '"' +
      (match(i, A.filterState(view)) ? "" : " hidden");
  };

  A.countMatch = function (view, ids) {
    var f = A.filterState(view);
    return ids.filter(function (k) { return match(info(view, k), f); }).length;
  };

  function uniq(ids, fn) {
    var seen = {};
    ids.forEach(function (k) { var v = fn(k); if (v) seen[v] = 1; });
    return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, "th"); });
  }
  function select(view, key, label, options) {
    var cur = A.filterState(view)[key], esc = A.esc;
    return '<select class="fsel' + (cur ? " on" : "") + '" data-filter="' + key + '" data-fview="' + view + '" aria-label="' + label + '">' +
      '<option value="">' + label + 'ทั้งหมด</option>' +
      options.map(function (o) { var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o;
        return '<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + '>' + esc(t) + '</option>'; }).join("") + '</select>';
  }

  // opts: { dep: true, pos: true, st: true, placeholder: "..." }
  A.filterBar = function (view, ids, opts) {
    var S = A.S, f = A.filterState(view), esc = A.esc;
    var active = f.q || f.dep || f.pos || f.st;
    return '<div class="fbar">' +
      '<input type="search" class="search" data-filter="q" data-fview="' + view + '" value="' + esc(f.q) + '" placeholder="' + esc(opts.placeholder || "ค้นหาชื่อ") + '" aria-label="ค้นหา">' +
      (opts.dep ? select(view, "dep", "แผนก", uniq(ids, function (k) { return (S.employees[k] || {}).department; })) : "") +
      (opts.pos ? select(view, "pos", "ตำแหน่ง", uniq(ids, function (k) { return (S.accounts[k] || {}).position; })) : "") +
      (opts.st ? select(view, "st", "สถานะ", opts.statusList || STATUS) : "") +
      '<span class="fcount muted small" data-fcount="' + view + '">แสดง ' + A.countMatch(view, ids) + ' จาก ' + ids.length + ' คน</span>' +
      '<button type="button" class="btn sm fclear" data-act="fclear" data-fview="' + view + '"' + (active ? "" : " hidden") + '>ล้างตัวกรอง</button>' +
    '</div>' +
    '<div class="stkey">' + (opts.keys || ["ส่งผลแล้ว", "ร่าง ยังไม่ส่ง", "ยังไม่ประเมิน"]).map(function (t, i) { return '<span><i class="' + ["k-s", "k-d", "k-n"][i] + '"></i>' + esc(t) + '</span>'; }).join("") + '</div>' +
    '<div class="empty fempty" data-fempty="' + view + '"' + (A.countMatch(view, ids) || !ids.length ? " hidden" : "") + '>ไม่พบพนักงานที่ตรงกับเงื่อนไข</div>';
  };

  // เรียกเมื่อพิมพ์/เลือกตัวกรอง
  A.setFilter = function (view, key, value) {
    var f = A.filterState(view); f[key] = value;
    var shown = 0, total = 0;
    document.querySelectorAll("[data-frow]").forEach(function (el) {
      var ok = match({ q: el.getAttribute("data-q"), dep: el.getAttribute("data-dep"), pos: el.getAttribute("data-pos"), st: el.getAttribute("data-st") }, f);
      el.hidden = !ok; total++; if (ok) shown++;
    });
    var c = document.querySelector('[data-fcount="' + view + '"]'); if (c) c.textContent = "แสดง " + shown + " จาก " + total + " คน";
    var em = document.querySelector('[data-fempty="' + view + '"]'); if (em) em.hidden = shown > 0 || total === 0;
    var cl = document.querySelector('.fclear[data-fview="' + view + '"]'); if (cl) cl.hidden = !(f.q || f.dep || f.pos || f.st);
    document.querySelectorAll('.fsel[data-fview="' + view + '"]').forEach(function (s) { s.classList.toggle("on", !!s.value); });
  };

  A.clearFilter = function (view) {
    A.S.filters[view] = { q: "", dep: "", pos: "", st: "" };
    A.render();
  };
})(window.App);
