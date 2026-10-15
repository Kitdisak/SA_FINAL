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

  // ระดับผลการประเมิน (เทียบสัดส่วนกับจำนวนระดับคะแนนที่ HR กำหนด: 5 ระดับ = 4.5 / 3.5 / 2.5 / 1.5)
  A.grade = function (a) {
    var p = (a - 1) / ((A.MAX || 5) - 1);
    return p >= 0.875 ? "ดีเยี่ยม" : p >= 0.625 ? "ดี" : p >= 0.375 ? "ตามเกณฑ์" : p >= 0.125 ? "ต้องปรับปรุง" : "ต้องปรับปรุงมาก";
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
