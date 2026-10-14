/* ฟังก์ชันช่วยทั่วไป */
(function (A) {
  A.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  // ค่าเฉลี่ย โดยไม่นับข้อที่ยังไม่ตอบ (0)
  A.avg = function (arr) {
    var v = arr.filter(function (x) { return x > 0; });
    return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : 0;
  };

  A.catScores = function (scores, ci) {
    return scores.slice(ci * A.PER, ci * A.PER + A.PER);
  };

  A.grade = function (a) {
    return a >= 4.5 ? "ดีเยี่ยม" : a >= 3.5 ? "ดี" : a >= 2.5 ? "ตามเกณฑ์" : a >= 1.5 ? "ต้องปรับปรุง" : "ต้องปรับปรุงมาก";
  };

  A.fdate = function (ms) {
    try { return new Date(ms).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }); }
    catch (e) { return ""; }
  };

  A.sha = async function (text) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  };

  // sessionStorage แบบไม่พังถ้าใช้ไม่ได้ (จำผู้ใช้ที่ล็อกอินไว้ตอนรีเฟรช)
  A.store = function (k, v) {
    try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {}
  };
  A.load = function (k) {
    try { return sessionStorage.getItem(k); } catch (e) { return null; }
  };
})(window.App);
