window.supabase = { createClient: function () { return {
  rpc: function (name, args) { return fetch('http://localhost:8766/rpc/' + name, { method: 'POST', body: JSON.stringify(args || {}) }).then(function (r) { return r.json(); }); },
  channel: function () { throw new Error('no realtime in test'); }, removeChannel: function () {} }; } };
