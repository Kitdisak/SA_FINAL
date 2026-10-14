/* REST adapter: browser -> Express API -> Oracle Database. */
(function (A) {
  var API = "/api";
  var token = null;
  var timers = [];
  function headers(extra) {
    var h = Object.assign({ "Content-Type": "application/json" }, extra || {});
    if (token) h.Authorization = "Bearer " + token;
    return h;
  }
  async function request(path, options) {
    var res = await fetch(API + path, Object.assign({ headers: headers() }, options || {}));
    var body = {};
    try { body = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error(body.error || ("HTTP " + res.status));
    return body;
  }
  function snapDoc(item) { return { id: item.id, data: function () { return item.data; } }; }
  function makeSnap(items) { return { docs: items.map(snapDoc) }; }
  function apiDb() {
    return {
      collection: function (col) {
        return { onSnapshot: function (cb, errCb) {
          var active = true, last = "";
          async function refresh() {
            try {
              var data = col === "accounts" ? await request("/accounts") : await request("/evaluations");
              var sig = JSON.stringify(data);
              if (active && sig !== last) { last = sig; cb(makeSnap(data.map(function (x) { return { id: x.id, data: x }; }))); }
            } catch (e) { if (active && errCb) errCb(e); }
          }
          refresh(); var timer = setInterval(refresh, 2500);
          var off = function () { active = false; clearInterval(timer); };
          timers.push(off); return off;
        } };
      },
      doc: function (path) {
        var bits = path.split("/"), col = bits[0], id = encodeURIComponent(bits[1] || "");
        return {
          onSnapshot: function (cb, errCb) {
            var active = true, last = "";
            async function refresh() {
              try {
                var result = col === "evaluations" ? await request("/evaluations/" + id) : null;
                var sig = JSON.stringify(result);
                if (active && sig !== last) { last = sig; cb({ exists: !!(result && result.data), data: function () { return result && result.data; } }); }
              } catch (e) { if (active && errCb) errCb(e); }
            }
            refresh(); var timer = setInterval(refresh, 2500);
            var off = function () { active = false; clearInterval(timer); };
            timers.push(off); return off;
          },
          set: function (data) { return request("/evaluations/" + id, { method: "PUT", body: JSON.stringify(data) }); },
          update: function (fields) { return request("/evaluations/" + id, { method: "PATCH", body: JSON.stringify(fields) }); }
        };
      }
    };
  }
  A.setApiToken = function (value) { token = value || null; };
  A.api = function (path, options) { return request(path, options); };   // เรียก API อื่น ๆ (แจ้งเตือน/ตารางงาน/ประวัติ)
  A.loginApi = async function (username, pin) {
    var result = await request("/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username, pin: pin }) });
    token = result.token;
    try { sessionStorage.setItem("eval-token", token); } catch (_) {}
    return result.user;
  };
  A.connectDb = async function () {
    try {
      token = sessionStorage.getItem("eval-token") || null;
      await request("/health");
      return apiDb();
    } catch (e) { console.error("API connection failed", e); return null; }
  };
})(window.App);
