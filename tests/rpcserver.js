// tiny RPC bridge: POST /rpc/<fn> {args} -> select public.<fn>(k => v, ...) on the local Postgres
const http = require('http'), { execFileSync } = require('child_process');
const q = s => "'" + String(s).replace(/'/g, "''") + "'";
function lit(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return q(v);
  if (Array.isArray(v) && v.every(x => typeof x === 'number')) return 'ARRAY[' + v.join(',') + ']::' + (v.every(Number.isInteger) ? 'bigint[]' : 'numeric[]');
  return q(JSON.stringify(v)) + '::jsonb';
}
http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.end();
    const fn = req.url.split('/').pop().replace(/[^a-z0-9_]/g, '');
    const args = b ? JSON.parse(b) : {};
    // admin_set_ranks2 p_vals is int[]
    const parts = Object.keys(args).map(k => k + ' => ' + (k === 'p_vals' ? 'ARRAY[' + args[k].join(',') + ']::int[]' : lit(args[k])));
    const sql = 'select to_json(public.' + fn + '(' + parts.join(', ') + '))';
    try {
      const out = execFileSync('psql', ['-h', '/tmp', '-p', String(process.env.PGPORT || 5499), '-U', 'postgres', '-At', '-c', 'set role anon;' + sql], { encoding: 'utf8' }).trim().split('\n').pop();
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: out ? JSON.parse(out) : null }));
    } catch (e) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: String(e.stderr || e.message) } })); }
  });
}).listen(Number(process.env.RPC_PORT || 8766));
