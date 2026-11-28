/* Logic over Luck: scoring engine (rules: Rules Race Math Club Edition v5 + the decisions in
   claude/logic-over-luck-decisions.md). Pure functions, no DOM, no network: the Host page calls them,
   and the tests run them in Node against the Python simulator.

   Codes (same as the simulator):
   dice       std con risk prime
   conditions notrep fib even odd f6 gtmean samedie otherrr div3 sq ge6 up adj mode deja uniq sameroll ends7 sum7
   effects    +2 shield flip +3 crowd interest steal2 echo random +5 x2 spoiler next6 +7 x3
   rules      ban curse prime median outlier minority norepeat underdog bust robin crowded bubble lucky

   Where the web version differs from the simulator on purpose (see the decisions file):
   - Robin Hood: exactly the 3 lowest receive (the leader gives at most 3); ties at the line are broken like the winner's
     order reversed (round points of this round, the round before, ...), then at random; a leader inside the 3 gives to the other 2.
     Each player's earlier round points go in players[i].hist and a random tie-break number in players[i].tie.
   - Outlier Bonus: when every roll is the same, nobody gets it.
   - Underdog Boost: only voting-group players whose personal-rule condition is met get +2 (user's rule, 28 Nov).
   - Delulu (new version): wrong guess -6 from the running total, first in step 8; not simulated. */
(function (root) {
  "use strict";

  var DICE = { std: [1, 2, 3, 4, 5, 6], con: [2, 3, 3, 4, 4, 5], risk: [0, 1, 2, 5, 6, 7], prime: [1, 2, 2, 3, 5, 5] };
  var DIE_IDS = ["std", "con", "risk", "prime"];
  var COND = { notrep: 4, fib: 4, even: 3, odd: 3, f6: 3, gtmean: 3, samedie: 3, otherrr: 3, div3: 2, sq: 2, ge6: 2,
    up: 2, adj: 2, mode: 2, deja: 1, uniq: 1, sameroll: 1, ends7: 1, sum7: 1 };
  var EFF = { "+2": 1, shield: 1, flip: 1, "+3": 2, crowd: 2, interest: 2, steal2: 2, echo: 2, random: 2,
    "+5": 3, x2: 3, spoiler: 3, next6: 3, "+7": 4, x3: 4 };
  var RULES = ["ban", "curse", "prime", "median", "outlier", "minority", "norepeat", "underdog", "bust", "robin", "crowded", "bubble", "lucky"];
  var RANDOM_POOL = Object.keys(EFF).filter(function (e) { return e !== "random"; });   /* Random draws from every other effect, equal chance */
  var DEFAULTS = { cap: 3, crowdX: null, voteFrac: 0.5, voteCount: null, underdogNeedsCond: true,
    stealGain: 4, stealLoss: 2, spoilGain: 5, spoilLoss: 3, deluluLoss: 6, fanumPts: 2, fanumTie: "order", start: 0, stealTarget: "above" };   /* start: starting score (rules 28 Nov: 15 on the web; Compound Interest does not count it) */

  function cfgOf(c) { var o = {}, k; for (k in DEFAULTS) o[k] = DEFAULTS[k]; if (c) for (k in c) if (c[k] !== undefined) o[k] = c[k]; return o; }
  function has(arr, v) { return arr.indexOf(v) >= 0; }
  function countOf(arr) { var m = {}; arr.forEach(function (v) { m[v] = (m[v] || 0) + 1; }); return m; }

  /* ---------- room statistics ---------- */
  /* mode: every value with the highest count; none when every value rolled appears equally often */
  function modeOf(xs) {
    var c = countOf(xs), keys = Object.keys(c), mx = 0, same = true, first = c[keys[0]];
    keys.forEach(function (k) { if (c[k] > mx) mx = c[k]; if (c[k] !== first) same = false; });
    if (same) return [];
    return keys.filter(function (k) { return c[k] === mx; }).map(Number);
  }
  /* values that count as the median (a .5 median makes both neighbours count) */
  function medianHits(xs) {
    var s = xs.slice().sort(function (a, b) { return a - b; }), n = s.length;
    var m = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
    return m === Math.floor(m) ? [m] : [Math.floor(m), Math.ceil(m)];
  }
  /* voting group (and Underdog Boost): the lowest-ranked ceil(N x frac) players, or a set number, ties at the line all in */
  function votingGroup(acc, c) {
    c = cfgOf(c);
    var n = acc.length, k = c.voteCount != null ? Math.min(n, c.voteCount) : Math.ceil(n * c.voteFrac);
    if (k < 1 || n === 0) return [];
    var thr = acc.slice().sort(function (a, b) { return a - b; })[k - 1], out = [];
    for (var i = 0; i < n; i++) if (acc[i] <= thr) out.push(i);
    return out;
  }
  /* Banned Dice: the die (dice) picked by the most players last round; all 4 tied = nothing banned */
  function bannedDice(prevDice) {
    if (!prevDice || !prevDice.length) return [];
    var c = countOf(prevDice), mx = 0;
    DIE_IDS.forEach(function (d) { if ((c[d] || 0) > mx) mx = c[d]; });
    var b = DIE_IDS.filter(function (d) { return (c[d] || 0) === mx; });
    return b.length === 4 ? [] : b;
  }
  /* "the leader" for player i: the highest running total at the start of the round among everyone else (ties: all of them) */
  function leadersFor(i, acc) {
    var m = null, j;
    for (j = 0; j < acc.length; j++) if (j !== i && (m === null || acc[j] > m)) m = acc[j];
    var out = [];
    if (m === null) return out;
    for (j = 0; j < acc.length; j++) if (j !== i && acc[j] === m) out.push(j);
    return out;
  }

  /* ---------- personal rules ---------- */
  function buildCost(cond, eff) { return (COND[cond] || 0) + (EFF[eff] || 0); }
  /* when: "start" (before the game), "break" (mid-game break), "locked" (Locked In), "aura" (Aura Farming draw) */
  function buildOk(cond, eff, o) {
    o = o || {};
    if (!(cond in COND) || !(eff in EFF)) return false;
    var budget = o.budget != null ? o.budget : 5;
    if (o.when !== "aura" && buildCost(cond, eff) > budget) return false;
    if (o.when === "aura") { var c = buildCost(cond, eff); if (c < 6 || c > 7 || eff === "shield") return false; }
    if (eff === "interest" && o.when && o.when !== "start") return false;   /* Compound Interest only before the game */
    if (o.when === "locked" && o.old && (cond === o.old.cond || eff === o.old.eff)) return false;   /* both must change */
    return true;
  }
  function condMet(cond, i, R) {
    var x = R.X[i], p = R.prev[i];
    switch (cond) {
      case "notrep": return p != null && x !== p;
      case "fib": return x === 1 || x === 2 || x === 3 || x === 5 || x === 8;
      case "even": return x % 2 === 0;
      case "odd": return x % 2 === 1;
      case "f6": return x === 1 || x === 2 || x === 3 || x === 6;
      case "gtmean": return x > R.mean;
      case "samedie": return R.lead[i].some(function (j) { return R.dice[j] === R.dice[i]; });
      case "otherrr": return R.rr.some(function (r, j) { return r && j !== i; });
      case "div3": return x === 3 || x === 6;
      case "sq": return x === 1 || x === 4;
      case "ge6": return x >= 6;
      case "up": return p != null && x > p;
      case "adj": return p != null && Math.abs(x - p) === 1;
      case "mode": return has(R.mode, x);
      case "deja": return p != null && x === p;
      case "uniq": return R.cnt[x] === 1;
      case "sameroll": return R.lead[i].some(function (j) { return R.X[j] === x; });
      case "ends7": return Math.abs(R.acc0[i] + x) % 10 === 7;
      case "sum7": return x + (p == null ? 0 : p) === 7;
    }
    throw new Error("unknown condition " + cond);
  }

  /* ---------- one round, steps 1–8 ----------
     inp = {
       round: 1..12, final: true in round 12 (round points x2),
       players: [{ die, x (final roll), rerolled, cond, eff (the effect this round: Random already resolved),
                   acc (running total at the start of the round), prevX (null in round 1), next6 (bonus earned last round),
                   hist (round points of rounds 1..t-1, for Robin Hood's tie-break), tie (random number, Robin Hood's last tie-break),
                   aura (Shield until the end of the game), lord (Sigma Lord), guess (Delulu guess; null = none) }],
       rules: [{ id, scope: null | [player indexes] }]   active common rules; a Let Him Cook rule carries its scope,
              and a rule listed twice (voted + cooked) applies to everyone,
       banned: [dice], lucky: 1..7 | null, delulu: true in the Delulu round, cfg: {...} }
     returns { players: [...per player detail...], acc: [running totals after step 8], room: {...} } */
  function scoreRound(inp) {
    var c = cfgOf(inp.cfg), P = inp.players, n = P.length, rules = inp.rules || [], banned = inp.banned || [];
    function on(id, i) { return rules.some(function (r) { return r.id === id && (!r.scope || has(r.scope, i)); }); }
    function any(id) { return rules.some(function (r) { return r.id === id; }); }
    var X = P.map(function (p) { return p.x; }), dice = P.map(function (p) { return p.die; }), acc0 = P.map(function (p) { return p.acc; });
    var R = { X: X, dice: dice, acc0: acc0, prev: P.map(function (p) { return p.prevX == null ? null : p.prevX; }),
      rr: P.map(function (p) { return !!p.rerolled; }), cnt: countOf(X), mode: modeOf(X), mh: medianHits(X),
      mean: X.reduce(function (a, b) { return a + b; }, 0) / n };
    R.lead = P.map(function (_, i) { return leadersFor(i, acc0); });
    var dev = X.map(function (x) { return Math.abs(x - R.mean); }), md = Math.max.apply(null, dev);
    var dc = countOf(dice), allowed = DIE_IDS.filter(function (d) { return !has(banned, d); });
    var mn = Math.min.apply(null, allowed.map(function (d) { return dc[d] || 0; }));
    var hi = Math.max.apply(null, allowed.map(function (d) { return dc[d] || 0; }));
    var under = any("underdog") ? votingGroup(acc0, c) : [];

    var out = P.map(function (p, i) {
      var eff = p.eff;
      if (eff === "random") throw new Error("player " + i + ": resolve Random before scoring");
      var fired = condMet(p.cond, i, R);
      return { fired: fired, eff: eff, shield: (fired && eff === "shield") || !!p.aura, steps: [] };
    });

    var rp = out.map(function (o, i) {
      var p = P[i], x = X[i], face = x, s = o.steps;
      var cursed = on("curse", i) && has(R.mode, x) && !o.shield;
      if (cursed) face = 0;
      s.push({ k: "face", v: face, cursed: cursed });
      var g = face;
      if (o.fired) {
        switch (o.eff) {
          case "+2": g = face + 2; break; case "+3": g = face + 3; break; case "+5": g = face + 5; break; case "+7": g = face + 7; break;
          case "x2": g = face * 2; break; case "x3": g = face * 3; break;
          case "crowd": g = face + Math.min(4, R.cnt[x]); break;
          case "shield": g = face + 1; break;
          case "flip": g = cursed ? 0 : 9 - x; break;
          case "echo": g = face + (R.prev[i] == null ? 0 : R.prev[i]); break;
          case "interest": g = face + Math.floor(Math.max(0, acc0[i] - (c.start || 0)) / 8); break;   /* points earned in the game only */
          default: g = face;   /* steal2, spoiler (step 5), next6 (next round) */
        }
      }
      s.push({ k: "personal", fired: o.fired, eff: o.eff, d: g - face });
      if (p.next6) { g += 6; s.push({ k: "next6", d: 6 }); }
      var com = [];
      if (on("prime", i)) com.push(["prime", (x === 2 || x === 3 || x === 5 || x === 7) ? 2 : (o.shield ? 0 : -1)]);
      if (on("median", i) && has(R.mh, x)) com.push(["median", 4]);
      if (on("outlier", i) && md > 0 && dev[i] === md) com.push(["outlier", 3]);
      if (on("minority", i) && mn > 0 && (dc[dice[i]] || 0) === mn) com.push(["minority", 3]);
      if (on("norepeat", i) && R.prev[i] != null && x === R.prev[i] && !o.shield) com.push(["norepeat", -2]);
      if (on("bubble", i) && hi <= n / 2 && (dc[dice[i]] || 0) === hi) com.push(["bubble", 3]);
      if (on("underdog", i) && has(under, i) && (!c.underdogNeedsCond || o.fired)) com.push(["underdog", 2]);
      if (inp.lucky != null && on("lucky", i) && x === inp.lucky) com.push(["lucky", 4]);
      com.forEach(function (e) { if (e[1]) { g += e[1]; s.push({ k: "common", id: e[0], d: e[1] }); } });
      if (g < 0) { s.push({ k: "floor", d: -g }); g = 0; }
      if (on("bust", i) && g > 10) { s.push({ k: "bust", d: -g }); g = 0; }
      o.afterStep4 = g;
      return g;
    });

    /* step 5: Steal 2 and Spoiler, targets fixed once, all at the same time, loss cap per target */
    var base = rp.map(function (v, i) { return acc0[i] + v; }), topB = Math.max.apply(null, base), topR = Math.max.apply(null, rp);
    var leaders = [], spikes = [], lost = P.map(function () { return 0; }), gain = P.map(function () { return 0; });
    for (var i = 0; i < n; i++) { if (base[i] === topB) leaders.push(i); if (rp[i] === topR) spikes.push(i); }
    function take(v, k) { var room = c.cap == null ? k : Math.max(0, Math.min(k, c.cap - lost[v])); lost[v] += room; }
    out.forEach(function (o, p) {
      if (!o.fired) return;
      if (o.eff === "steal2") {
        /* user (28 Nov 12:35): the target is the player(s) one rank above you, ranked by running total + round points after
           step 4 (the next higher value; everyone tied there loses). Nobody above you (you are 1st): the card does nothing.
           cfg.stealTarget "leader" = the old rule (1st place). */
        var tg;
        if (c.stealTarget === "leader") { if (has(leaders, p)) { o.stealSelf = true; return; } tg = leaders; }
        else {
          var up = base.filter(function (v) { return v > base[p]; });
          if (!up.length) { o.stealSelf = true; return; }
          var nx = Math.min.apply(null, up); tg = [];
          for (var q = 0; q < n; q++) if (base[q] === nx) tg.push(q);
        }
        var vs = tg.filter(function (v) { return !out[v].shield; });
        vs.forEach(function (v) { take(v, c.stealLoss); });
        gain[p] = vs.length ? c.stealGain : 0; o.targets = vs; o.blocked = tg.filter(function (v) { return out[v].shield; });   /* blocked: for the big screen (shield bounce) */
      } else if (o.eff === "spoiler") {   /* v5: the user can be a target too */
        var ws = spikes.filter(function (v) { return !out[v].shield; });
        ws.forEach(function (v) { take(v, c.spoilLoss); });
        gain[p] = ws.length ? c.spoilGain : 0; o.targets = ws; o.blocked = spikes.filter(function (v) { return out[v].shield; });
      }
    });

    var acc = acc0.slice(), roundPts = [];
    out.forEach(function (o, i) {
      var r = rp[i] + gain[i];
      if (gain[i]) o.steps.push({ k: "gain", d: gain[i] });
      if (inp.final) { o.steps.push({ k: "double", d: r }); r *= 2; }
      o.gain = gain[i]; o.stolen = lost[i]; o.roundPts = r; roundPts.push(r);
      acc[i] = acc0[i] - lost[i] + r;   /* step 7 (the stolen points come off the running total) */
    });

    /* step 8: Delulu, then Crowded Dice, then Robin Hood */
    if (inp.delulu) out.forEach(function (o, i) {
      if (P[i].lord) return;
      var ok = P[i].guess != null && P[i].guess === X[i];
      o.deluluOk = ok;
      if (!ok && !o.shield) { acc[i] -= c.deluluLoss; o.delulu = -c.deluluLoss; }
    });
    if (any("crowded")) {
      var cx = c.crowdX || Math.ceil(n / 5);
      out.forEach(function (o, i) {
        if (o.shield || !on("crowded", i)) return;
        var k = Math.floor((dc[dice[i]] || 0) / cx);
        if (k) { acc[i] -= k; o.crowded = -k; }
      });
    }
    if (any("robin")) {
      /* user's rule (28 Nov): exactly the 3 lowest-ranked receive, so a leader gives at most 3.
         Lowest = the winner's order reversed: lowest running total, then lower round points this round, then the round
         before, ... round 1; still tied in every round = random (players[i].tie, a random number the caller draws). */
      var top = Math.max.apply(null, acc), givers = [], order = [];
      for (var j = 0; j < n; j++) { order.push(j); if (acc[j] === top && !out[j].shield && on("robin", j)) givers.push(j); }
      var rpH = P.map(function (p, k) { return (p.hist || []).concat([roundPts[k]]); });
      order.sort(function (a, b) {
        if (acc[a] !== acc[b]) return acc[a] - acc[b];
        for (var t = Math.max(rpH[a].length, rpH[b].length) - 1; t >= 0; t--) { var d = (rpH[a][t] || 0) - (rpH[b][t] || 0); if (d) return d; }
        return (P[a].tie || 0) - (P[b].tie || 0) || a - b;
      });
      var bottom = order.slice(0, Math.min(3, n));
      givers.forEach(function (l) {
        bottom.forEach(function (b) {
          if (b === l || !on("robin", b)) return;
          acc[l] -= 1; acc[b] += 1;
          out[l].robin = (out[l].robin || 0) - 1; out[b].robin = (out[b].robin || 0) + 1;
        });
      });
    }
    out.forEach(function (o, i) { o.acc = acc[i]; o.next6Next = o.fired && o.eff === "next6"; });
    return { players: out, acc: acc, roundPts: roundPts,
      room: { mode: R.mode, median: R.mh, mean: R.mean, diceCount: dc, someoneRerolled: R.rr.some(Boolean) } };
  }

  /* ---------- after step 8 ---------- */
  /* the Sigma Lords: players whose running total is exactly 67 (the caller checks "once per game" and "not after round 12") */
  function sigmaLords(acc) { var o = []; acc.forEach(function (v, i) { if (v === 67) o.push(i); }); return o; }
  /* ranking with the end-of-game tie-break: higher running total, then more round points in the latest round, the round
     before, ... round 1, then tie[i] (a random number the caller draws; lower first), then seat.
     hist[i] = round points of the rounds played so far. Returns the player indexes, highest first. */
  function rankOrder(acc, hist, tie, only) {
    var idx = [];
    for (var i = 0; i < acc.length; i++) if (!only || has(only, i)) idx.push(i);
    hist = hist || []; tie = tie || [];
    idx.sort(function (a, b) {
      if (acc[a] !== acc[b]) return acc[b] - acc[a];
      var ha = hist[a] || [], hb = hist[b] || [];
      for (var t = Math.max(ha.length, hb.length) - 1; t >= 0; t--) { var d = (hb[t] || 0) - (ha[t] || 0); if (d) return d; }
      return (tie[a] || 0) - (tie[b] || 0) || a - b;
    });
    return idx;
  }
  /* Fanum Tax: for each Sigma Lord, players ranked 1–5 among those over 67 (no active Shield this round) give pts.
     tie "order" (user, 28 Nov): exactly 5 pay, picked by rankOrder (hist, tie needed); "all": everyone tied with the 5th pays;
     "index": the first 5 by seat (the simulator's way). Sequential per lord, like the simulator. */
  function applyFanum(acc, lords, shield, c, hist, tie) {
    c = cfgOf(c); acc = acc.slice();
    var paid = acc.map(function () { return 0; });
    lords.forEach(function (h) {
      var above = [];
      acc.forEach(function (v, i) { if (v > 67 && !shield[i]) above.push(i); });
      if (c.fanumTie === "order") above = rankOrder(acc, hist, tie, above);
      else above.sort(function (a, b) { return acc[b] - acc[a] || a - b; });
      var pay = above.slice(0, 5);
      if (c.fanumTie === "all" && above.length > 5) { var v5 = acc[above[4]]; pay = above.filter(function (i) { return acc[i] >= v5; }); }
      pay.forEach(function (v) { acc[v] -= c.fanumPts; acc[h] += c.fanumPts; paid[v] -= c.fanumPts; paid[h] += c.fanumPts; });
    });
    return { acc: acc, delta: paid };
  }
  /* final places, shared places like 1, 2, 2, 4: running total, then round points in round 12, 11, ... 1 */
  function finalPlaces(acc, roundPts) {
    var n = acc.length, idx = [];
    for (var i = 0; i < n; i++) idx.push(i);
    function cmp(a, b) {
      if (acc[a] !== acc[b]) return acc[b] - acc[a];
      for (var t = (roundPts[a] || []).length - 1; t >= 0; t--) { var d = (roundPts[b][t] || 0) - (roundPts[a][t] || 0); if (d) return d; }
      return 0;
    }
    idx.sort(function (a, b) { return cmp(a, b) || a - b; });
    var place = [];
    idx.forEach(function (p, k) { place[p] = k && cmp(idx[k - 1], p) === 0 ? place[idx[k - 1]] : k + 1; });
    return place;
  }
  /* ---------- common-rule vote (before rounds 4, 7, 10) ----------
     options: 3 rules drawn from those not excluded (the rule active now and the final-round special rule) */
  function voteOptions(exclude, rnd) {
    rnd = rnd || Math.random;
    var pool = RULES.filter(function (r) { return !has(exclude || [], r); }), out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return out;
  }
  /* votes: [{ opt, t }] (t = when the vote arrived). Most votes wins; tied options: the one that got a vote earliest;
     nobody voted: random. Returns { win, tally: {opt: count}, how: "votes" | "tie" | "random" } */
  function voteWinner(opts, votes, rnd) {
    var tally = {}, first = {};
    opts.forEach(function (o) { tally[o] = 0; first[o] = Infinity; });
    (votes || []).forEach(function (v) { if (!(v.opt in tally)) return; tally[v.opt]++; if (v.t < first[v.opt]) first[v.opt] = v.t; });
    var mx = Math.max.apply(null, opts.map(function (o) { return tally[o]; }));
    if (!mx) return { win: opts[Math.floor((rnd || Math.random)() * opts.length)], tally: tally, how: "random" };
    var tied = opts.filter(function (o) { return tally[o] === mx; });
    tied.sort(function (a, b) { return first[a] - first[b]; });
    return { win: tied[0], tally: tally, how: tied.length > 1 ? "tie" : "votes" };
  }
  function drawRandomEffect(rnd) { return RANDOM_POOL[Math.floor((rnd || Math.random)() * RANDOM_POOL.length)]; }
  function drawLucky(rnd) { return 1 + Math.floor((rnd || Math.random)() * 7); }

  /* ---------- The 67 Event ---------- */
  var EV_SELF = ["fanum", "aura", "cook", "god"], EV_ROOM = ["locked", "delulu", "brainrot", "npc"];
  /* 1 event from each pile; Let Him Cook is not drawn when there are several Sigma Lords */
  function eventDraw(several, rnd) {
    rnd = rnd || Math.random;
    var self = EV_SELF.filter(function (e) { return !(several && e === "cook"); });
    return [self[Math.floor(rnd() * self.length)], EV_ROOM[Math.floor(rnd() * EV_ROOM.length)]];
  }
  /* every legal rule for a situation (see buildOk) as [cond, eff] pairs */
  function allBuilds(o) {
    var out = [];
    Object.keys(COND).forEach(function (c) { Object.keys(EFF).forEach(function (e) { if (buildOk(c, e, o)) out.push([c, e]); }); });
    return out;
  }
  /* Aura Farming: 2 different rules costing 6–7 coins (no Compound Interest, no Shield) */
  function auraOptions(rnd) {
    rnd = rnd || Math.random;
    var pool = allBuilds({ when: "aura" }), a = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    return [a, pool[Math.floor(rnd() * pool.length)]];
  }
  /* Brainrot: a shuffle of 0..k-1 where nobody keeps their own place (k >= 2); k < 2 gives no change */
  function derange(k, rnd) {
    rnd = rnd || Math.random;
    var p = [];
    for (var i = 0; i < k; i++) p.push(i);
    if (k < 2) return p;
    for (;;) {
      for (var j = k - 1; j > 0; j--) { var r = Math.floor(rnd() * (j + 1)), t = p[j]; p[j] = p[r]; p[r] = t; }
      if (p.every(function (v, q) { return v !== q; })) return p;
    }
  }

  var api = { DICE: DICE, DIE_IDS: DIE_IDS, COND: COND, EFF: EFF, RULES: RULES, RANDOM_POOL: RANDOM_POOL, DEFAULTS: DEFAULTS,
    modeOf: modeOf, medianHits: medianHits, votingGroup: votingGroup, bannedDice: bannedDice, leadersFor: leadersFor,
    buildCost: buildCost, buildOk: buildOk, scoreRound: scoreRound, sigmaLords: sigmaLords, applyFanum: applyFanum,
    finalPlaces: finalPlaces, voteOptions: voteOptions, voteWinner: voteWinner, drawRandomEffect: drawRandomEffect, drawLucky: drawLucky,
    rankOrder: rankOrder, EV_SELF: EV_SELF, EV_ROOM: EV_ROOM, eventDraw: eventDraw, allBuilds: allBuilds, auraOptions: auraOptions, derange: derange };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.LOL = api;
})(this);
