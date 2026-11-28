/* Fake Supabase Realtime for tests (served in place of the CDN library): channels over BroadcastChannel, and switches per tab:
   FAKE_RT.setDown(true)   network gone: subscribe times out, open channels get CHANNEL_ERROR, nothing is sent or received
   FAKE_RT.setSilent(true) dead connection without any error event (phone slept): nothing is sent or received */
(function () {
  var RT = window.FAKE_RT = { down: false, silent: false, chans: [], subs: 0, sent: 0, recv: 0,
    setDown: function (v) { RT.down = v; if (v) RT.chans.slice().forEach(function (c) { c._err(); }); },
    setSilent: function (v) { RT.silent = v; } };
  function Chan(name) { this.name = name; this.handlers = []; this.bc = null; this.cb = null; this.live = false; RT.chans.push(this); }
  Chan.prototype._open = function () { var c = this; if (c.bc) return; c.bc = new BroadcastChannel("fake-" + c.name); c.bc.onmessage = function (e) { if (RT.down || RT.silent || !c.live) return; RT.recv++; c.handlers.forEach(function (h) { h({ payload: e.data }); }); }; };
  Chan.prototype.on = function (t, f, fn) { this.handlers.push(fn); return this; };
  Chan.prototype.subscribe = function (cb) {
    var c = this; c.cb = cb;
    setTimeout(function () { if (c.closed) return; if (RT.down) { cb("TIMED_OUT"); return; } c._open(); c.live = true; RT.subs++; cb("SUBSCRIBED"); }, 150);
    return c;
  };
  Chan.prototype.send = function (m) { if (RT.down || RT.silent || this.closed) return Promise.resolve("error"); this._open(); RT.sent++; this.bc.postMessage(m.payload); return Promise.resolve("ok"); };
  Chan.prototype._err = function () { if (!this.live) return; this.live = false; if (this.cb) this.cb("CHANNEL_ERROR"); };
  Chan.prototype._close = function () { var c = this; c.live = false; c.closed = true; try { if (c.bc) c.bc.close(); } catch (e) {} c.bc = null; RT.chans = RT.chans.filter(function (x) { return x !== c; }); if (c.cb) c.cb("CLOSED"); };
  window.supabase = { createClient: function () { return { channel: function (n) { return new Chan(n); }, removeChannel: function (c) { c._close(); }, realtime: { disconnect: function () {} },
    rpc: function () { return Promise.resolve({ error: { message: "no rpc in this test" } }); } }; } };
})();
