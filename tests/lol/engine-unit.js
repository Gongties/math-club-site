/* Hand-checked cases for what the simulator does not cover (or covers differently). Expected values worked out by hand from the rules. */
"use strict";
var L = require(__dirname + "/../../logic-over-luck/engine.js"), fails = 0, count = 0;
function eq(name, got, want) {
  count++;
  if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log("FAIL", name, "\n  got ", JSON.stringify(got), "\n  want", JSON.stringify(want)); }
}
/* a player: die, roll, condition, effect, running total; options in o */
function pl(die, x, cond, eff, acc, o) { var p = { die: die, x: x, cond: cond, eff: eff, acc: acc || 0, prevX: null, rerolled: false, next6: false, aura: false }; for (var k in o || {}) p[k] = o[k]; return p; }
function run(players, rules, extra) { var inp = { round: 5, final: false, players: players, rules: (rules || []).map(function (r) { return typeof r === "string" ? { id: r, scope: null } : r; }), banned: [], lucky: null }; for (var k in extra || {}) inp[k] = extra[k]; return L.scoreRound(inp); }

/* ---- basic effects (no common rule). sq never fires on 3/5 -> face only ---- */
eq("face only", run([pl("con", 3, "sq", "+7"), pl("std", 5, "sq", "+7")]).acc, [3, 5]);
eq("+7 fires", run([pl("std", 4, "sq", "+7"), pl("std", 5, "sq", "+7")]).acc, [11, 5]);
eq("flip 9-x", run([pl("risk", 0, "even", "flip"), pl("std", 5, "deja", "+2")]).acc, [9, 5]);
eq("echo", run([pl("std", 4, "even", "echo", 0, { prevX: 6 }), pl("std", 5, "deja", "+2")]).acc, [10, 5]);
eq("echo round 1", run([pl("std", 4, "even", "echo"), pl("std", 5, "deja", "+2")]).acc, [4, 5]);
eq("interest 1 per 8", run([pl("std", 4, "even", "interest", 23), pl("std", 5, "deja", "+2", -9)]).acc, [23 + 4 + 2, -9 + 5]);
eq("interest negative total", run([pl("std", 4, "even", "interest", -20), pl("std", 5, "deja", "+2")]).acc, [-16, 5]);
/* rules 28 Nov: everyone starts with a starting score; Compound Interest counts only points earned (total - start), never below 0 */
eq("interest minus starting score", run([pl("std", 4, "even", "interest", 15 + 23), pl("std", 5, "deja", "+2", 15)], [], { cfg: { start: 15 } }).acc, [38 + 4 + 2, 20]);
eq("interest below starting score gives 0", run([pl("std", 4, "even", "interest", 10), pl("std", 5, "deja", "+2", 15)], [], { cfg: { start: 15 } }).acc, [14, 20]);
eq("ends7 counts the starting score (15 + 2 = 17)", run([pl("std", 2, "ends7", "+2", 15), pl("std", 5, "deja", "+2", 15)], [], { cfg: { start: 15 } }).players[0].fired, true);
eq("crowd max 4", run([1, 2, 3, 4, 5].map(function () { return pl("con", 3, "odd", "crowd"); })).acc, [7, 7, 7, 7, 7]);
eq("x3", run([pl("risk", 7, "odd", "x3"), pl("std", 5, "deja", "+2")]).acc, [21, 5]);
eq("next6 lands even if condition fails", run([pl("std", 5, "deja", "+2", 0, { next6: true }), pl("std", 1, "deja", "+2")]).acc, [11, 1]);
var r = run([pl("std", 4, "sq", "next6"), pl("std", 1, "deja", "+2")]);
eq("next6 earned: nothing now, flag for next round", [r.acc, r.players[0].next6Next], [[4, 1], true]);
eq("round 12 doubles", run([pl("std", 4, "sq", "+7"), pl("std", 5, "deja", "+2")], [], { final: true }).acc, [22, 10]);

/* ---- conditions that look at the room ---- */
eq("ends7 negative total -11 + 4 = -7", run([pl("std", 4, "ends7", "+2", -11), pl("std", 5, "deja", "+2")]).players[0].fired, true);
eq("ends7 -7 + 4 = -3 does not count", run([pl("std", 4, "ends7", "+2", -7), pl("std", 5, "deja", "+2")]).players[0].fired, false);
eq("sum7 round 1 counts last roll as 0", run([pl("risk", 7, "sum7", "+2"), pl("std", 5, "deja", "+2")]).players[0].fired, true);
eq("sum7 with last roll 0", run([pl("risk", 7, "sum7", "+2", 0, { prevX: 0 }), pl("std", 5, "deja", "+2")]).players[0].fired, true);
eq("samedie: leader is the other top player", run([pl("con", 3, "samedie", "+2", 10), pl("con", 4, "deja", "+2", 20), pl("std", 4, "deja", "+2", 5)]).players[0].fired, true);
eq("samedie: I am 1st -> leader is 2nd", run([pl("con", 3, "samedie", "+2", 30), pl("std", 4, "deja", "+2", 20), pl("con", 4, "deja", "+2", 5)]).players[0].fired, false);
eq("samedie: tied leaders, match any", run([pl("con", 3, "samedie", "+2", 1), pl("std", 4, "deja", "+2", 9), pl("con", 4, "deja", "+2", 9)]).players[0].fired, true);
eq("sameroll", run([pl("con", 4, "sameroll", "+2", 1), pl("std", 4, "deja", "+2", 9)]).players[0].fired, true);
eq("otherrr: own re-roll does not count", run([pl("con", 4, "otherrr", "+2", 0, { rerolled: true }), pl("std", 4, "deja", "+2")]).players[0].fired, false);
eq("otherrr: someone else", run([pl("con", 4, "otherrr", "+2"), pl("std", 4, "deja", "+2", 0, { rerolled: true })]).players[0].fired, true);
eq("mode none when all counts equal", L.modeOf([1, 2, 3]), []);
eq("mode two values", L.modeOf([2, 2, 5, 5, 1]).sort(), [2, 5]);
eq("median .5", L.medianHits([1, 3, 4, 6]), [3, 4]);

/* ---- common rules ---- */
eq("outlier: all same roll, nobody", run([pl("con", 3, "deja", "+2"), pl("con", 3, "deja", "+2")], ["outlier"]).acc, [3, 3]);
eq("outlier: tied farthest both", run([pl("std", 1, "sq", "+7"), pl("std", 5, "deja", "+2"), pl("std", 3, "deja", "+2")], ["outlier"]).acc, [1 + 7 + 3, 5 + 3, 3]);
eq("prime surge + shield blocks -1", run([pl("std", 4, "even", "shield"), pl("std", 4, "deja", "+2"), pl("std", 5, "deja", "+2")], ["prime"]).acc, [5, 3, 7]);
eq("cursed mode, shield blocks", run([pl("con", 4, "even", "shield"), pl("con", 4, "deja", "+2"), pl("std", 5, "deja", "+2")], ["curse"]).acc, [5, 0, 5]);
eq("cursed + flip stays 0", run([pl("con", 4, "even", "flip"), pl("con", 4, "deja", "+2"), pl("std", 5, "deja", "+2")], ["curse"]).acc, [0, 0, 5]);
eq("floor at 0 before bust", run([pl("std", 1, "deja", "+2", 0, { prevX: 1 }), pl("std", 5, "deja", "+2")], ["norepeat", "prime"]).acc, [1 + 2 - 2 - 1, 7]);
eq("negative goes to 0", run([pl("std", 1, "sq", "steal2", 0, { prevX: 1 }), pl("std", 6, "deja", "+2")], ["norepeat", "prime"]).players[0].afterStep4, 0);
eq("bust over 10, not at 10", run([pl("std", 5, "odd", "+5"), pl("std", 4, "even", "+7")], ["bust"]).acc, [10, 0]);
eq("lucky +4", run([pl("std", 5, "deja", "+2"), pl("std", 4, "deja", "+2")], ["lucky"], { lucky: 5 }).acc, [9, 4]);
eq("minority: an unused allowed die -> nobody", run([pl("std", 5, "deja", "+2"), pl("con", 4, "deja", "+2")], ["minority"]).acc, [5, 4]);
eq("minority: banned die does not count", run([pl("std", 5, "deja", "+2"), pl("con", 4, "deja", "+2"), pl("con", 3, "deja", "+2"), pl("risk", 1, "deja", "+2", 0)], ["minority"], { banned: ["prime"] }).acc, [8, 4, 3, 4]);
eq("bubble: most-used die, not over half", run([pl("con", 3, "deja", "+2"), pl("con", 3, "deja", "+2"), pl("std", 5, "deja", "+2"), pl("prime", 2, "deja", "+2")], ["bubble"]).acc, [6, 6, 5, 2]);
eq("bubble bursts over half", run([pl("con", 3, "deja", "+2"), pl("con", 3, "deja", "+2"), pl("con", 5, "deja", "+2")], ["bubble"]).acc, [3, 3, 5]);
/* underdog: voting group = lowest ceil(4 x 50%) = 2 players (totals 0 and 1); only the one whose condition is met gets +2 */
eq("underdog needs the condition", run([pl("std", 4, "even", "+2", 0), pl("std", 5, "even", "+2", 1), pl("std", 5, "deja", "+2", 9), pl("std", 4, "even", "+2", 9)], ["underdog"]).acc, [0 + 6 + 2, 1 + 5, 9 + 5, 9 + 6]);
eq("voting group: ties at the line all in", L.votingGroup([5, 1, 1, 1, 9], {}), [1, 2, 3]);
eq("voting group by number of players", L.votingGroup([5, 1, 2, 3, 9], { voteCount: 2 }), [1, 2]);
eq("voting group 30%", L.votingGroup([5, 1, 2, 3, 9], { voteFrac: 0.3 }), [1, 2]);
eq("banned: tie of 3 leaves one die", L.bannedDice(["std", "con", "risk"]), ["std", "con", "risk"]);
eq("banned: all 4 tied = none", L.bannedDice(["std", "con", "risk", "prime"]), []);
eq("banned: most picked", L.bannedDice(["std", "std", "con"]), ["std"]);
/* crowded: 7 players on con, 3 on std; x auto = ceil(10/5) = 2 -> con lose 3, std lose 1 */
var ten = []; for (var i = 0; i < 7; i++) ten.push(pl("con", 3, "deja", "+2")); for (i = 0; i < 3; i++) ten.push(pl("std", 5, "deja", "+2"));
eq("crowded auto x = ceil(N/5)", run(ten, ["crowded"]).acc, [0, 0, 0, 0, 0, 0, 0, 4, 4, 4]);
eq("crowded x set to 3", run(ten, ["crowded"], { cfg: { crowdX: 3 } }).acc, [1, 1, 1, 1, 1, 1, 1, 4, 4, 4]);
/* robin: after the round totals 20, 0, 1, 1, 5 -> leader 20 gives 1 to the 3 lowest (0,1,1) */
eq("robin hood", run([pl("std", 0 + 0, "deja", "+2", 20, { die: "risk" }), pl("risk", 0, "deja", "+2"), pl("risk", 1, "deja", "+2"), pl("risk", 1, "deja", "+2"), pl("std", 5, "deja", "+2")], ["robin"]).acc, [17, 1, 2, 2, 5]);
/* user's rule: exactly 3 receive. All four lowest end on 1; this round p1 and p4 scored 0, p2 and p3 scored 1 -> p1, p4 lowest;
   p2 vs p3: last round p3 scored 2 < p2's 5 -> p3. Leader gives 3 */
eq("robin: only 3 receive, tie-break by round points", run([pl("risk", 0, "deja", "+2", 20, { hist: [0] }), pl("risk", 0, "deja", "+2", 1, { hist: [0] }), pl("risk", 1, "deja", "+2", 0, { hist: [5] }), pl("risk", 1, "deja", "+2", 0, { hist: [2] }), pl("risk", 0, "deja", "+2", 1, { hist: [0] })], ["robin"]).acc, [17, 2, 1, 2, 2]);
eq("robin: tied in every round -> random number decides", run([pl("risk", 0, "deja", "+2", 20, { hist: [0] }), pl("risk", 0, "deja", "+2", 1, { hist: [0] }), pl("risk", 1, "deja", "+2", 0, { hist: [2], tie: 0.1 }), pl("risk", 1, "deja", "+2", 0, { hist: [2], tie: 0.9 }), pl("risk", 0, "deja", "+2", 1, { hist: [0] })], ["robin"]).acc, [17, 2, 2, 1, 2]);
eq("robin: everyone tied, each leader gives to the others", run([pl("risk", 0, "deja", "+2"), pl("risk", 0, "deja", "+2"), pl("risk", 0, "deja", "+2")], ["robin"]).acc, [0, 0, 0]);
eq("robin: shield leader gives nothing", run([pl("risk", 0, "even", "shield", 20), pl("risk", 0, "deja", "+2"), pl("risk", 1, "deja", "+2"), pl("risk", 1, "deja", "+2")], ["robin"]).acc, [21, 0, 1, 1]);
eq("robin: scope only me (cooked) - leader not in scope gives nothing", run([pl("risk", 0, "deja", "+2", 20), pl("risk", 0, "deja", "+2"), pl("risk", 1, "deja", "+2"), pl("risk", 1, "deja", "+2")], [{ id: "robin", scope: [1] }]).acc, [20, 0, 1, 1]);
eq("robin: scope leader + one receiver", run([pl("risk", 0, "deja", "+2", 20), pl("risk", 0, "deja", "+2"), pl("risk", 1, "deja", "+2"), pl("risk", 1, "deja", "+2")], [{ id: "robin", scope: [0, 2] }]).acc, [19, 0, 2, 1]);
eq("rule voted and cooked = everyone", run([pl("con", 3, "deja", "+2"), pl("con", 3, "deja", "+2"), pl("std", 5, "deja", "+2")], [{ id: "curse", scope: [2] }, { id: "curse", scope: null }]).acc, [0, 0, 5]);

/* ---- Steal 2 and Spoiler ---- */
/* p0 steals; leader p1 (acc 10 + 4) loses 2 */
eq("steal 2", run([pl("std", 1, "sq", "steal2"), pl("std", 4, "deja", "+2", 10)]).acc, [5, 12]);
eq("steal 2 while 1st: nothing", run([pl("std", 1, "sq", "steal2", 30), pl("std", 4, "deja", "+2", 10)]).acc, [31, 14]);
eq("steal 2 tied leaders both lose, gain once", run([pl("std", 1, "sq", "steal2"), pl("std", 4, "deja", "+2", 10), pl("std", 4, "deja", "+2", 10)]).acc, [5, 12, 12]);
eq("steal 2 shielded leader: no gain", run([pl("std", 1, "sq", "steal2"), pl("std", 4, "even", "shield", 10)]).acc, [1, 15]);
eq("loss cap 3: two steals, leader loses 3, both gain 4", run([pl("std", 1, "sq", "steal2"), pl("std", 1, "sq", "steal2"), pl("std", 4, "deja", "+2", 10)]).acc, [5, 5, 11]);
eq("spoiler hits top scorer", run([pl("std", 1, "sq", "spoiler"), pl("risk", 7, "deja", "+2")]).acc, [6, 4]);
/* spoiler user is the top scorer: 6 + 5 - 3 = 8; in round 12 (6 + 5) x 2 - 3 = 19 */
eq("spoiler self-hit", run([pl("std", 6, "ge6", "spoiler"), pl("std", 5, "deja", "+2")]).acc, [8, 5]);
eq("spoiler self-hit round 12", run([pl("std", 6, "ge6", "spoiler"), pl("std", 5, "deja", "+2")], [], { final: true }).acc, [19, 10]);
eq("spoiler self-hit with Aura shield: no gain, no loss", run([pl("std", 6, "ge6", "spoiler", 0, { aura: true }), pl("std", 5, "deja", "+2")]).acc, [6, 5]);
eq("steal gain not busted, doubled in 12", run([pl("risk", 7, "odd", "steal2"), pl("std", 4, "deja", "+2", 30)], ["bust"], { final: true }).acc, [22, 36]);

/* ---- Delulu (new rules): wrong or no guess -6, Sigma Lord exempt, Shield blocks, before Crowded and Robin ---- */
eq("delulu", run([pl("std", 4, "deja", "+2", 10, { guess: 4 }), pl("std", 5, "deja", "+2", 10, { guess: 2 }), pl("std", 5, "deja", "+2", 10, { guess: null }),
  pl("std", 5, "deja", "+2", 10, { lord: true }), pl("std", 5, "odd", "shield", 10, { guess: 1 })], [], { delulu: true }).acc, [14, 9, 9, 15, 16]);
/* order: after Delulu p0 = 20 - 6 + 0 = 14 is no longer the leader; p1 is (15). p1 gives 1 to the lowest 3 (p0 14, p2 0, p3 0) */
eq("delulu before robin", run([pl("risk", 0, "deja", "+2", 20, { guess: 1 }), pl("risk", 0, "deja", "+2", 15, { lord: true }), pl("risk", 0, "deja", "+2", 0, { lord: true }), pl("risk", 0, "deja", "+2", 0, { lord: true })], ["robin"], { delulu: true }).acc, [15, 12, 1, 1]);

/* ---- Fanum Tax ---- */
eq("fanum top 5 over 67 pay 2, shield exempt", L.applyFanum([67, 90, 80, 70, 69, 68, 68, 50], [0], [false, false, true, false, false, false, false, false], {}).acc, [77, 88, 80, 68, 67, 66, 66, 50]);
eq("fanum tie at 5th: all pay (option all)", L.applyFanum([67, 90, 80, 70, 69, 68, 68, 68], [0], [], { fanumTie: "all" }).acc, [81, 88, 78, 68, 67, 66, 66, 66]);
eq("fanum tie at 5th: index", L.applyFanum([67, 90, 80, 70, 69, 68, 68, 68], [0], [], { fanumTie: "index" }).acc, [77, 88, 78, 68, 67, 66, 68, 68]);
/* user (28 Nov): tie at 5th -> exactly 5 pay, by the end-of-game tie-break (latest round first), then random */
eq("fanum tie at 5th: tie-break by round points", L.applyFanum([67, 90, 80, 70, 69, 68, 68, 68], [0], [], {}, [[], [], [], [], [], [1, 2], [3, 1], [0, 2]]).acc, [77, 88, 78, 68, 67, 66, 68, 68]);
eq("fanum tie at 5th: tied in every round -> random number", L.applyFanum([67, 90, 80, 70, 69, 68, 68, 68], [0], [], {}, [], [0, 0, 0, 0, 0, .9, .1, .5]).acc, [77, 88, 78, 68, 67, 68, 66, 68]);
eq("fanum shield skips, 6th steps in (order)", L.applyFanum([67, 90, 80, 70, 69, 68, 68, 50], [0], [false, false, true, false, false, false, false, false], {}).acc, [77, 88, 80, 68, 67, 66, 66, 50]);
eq("rankOrder: total, then latest round, earlier round, random", L.rankOrder([5, 7, 5, 5], [[1, 2], [0, 0], [3, 1], [2, 1]], [.5, 0, .2, .1]), [1, 0, 2, 3]);
eq("rankOrder only some players", L.rankOrder([5, 7, 5, 9], [], [.3, 0, .1, 0], [0, 1, 2]), [1, 2, 0]);
eq("derange 2 swaps", L.derange(2), [1, 0]);
eq("derange 1 keeps", L.derange(1), [0]);
var okD = true; for (var dd = 0; dd < 300; dd++) { var k = 2 + dd % 9, d = L.derange(k); if (d.slice().sort(function (a, b) { return a - b; }).join() !== Array.from({ length: k }, function (_, q) { return q; }).join() || d.some(function (v, q) { return v === q; })) okD = false; }
eq("derange: a shuffle where nobody keeps their own (300 draws)", okD, true);
var okE = true, seenE = {}; for (var de = 0; de < 400; de++) { var e2 = L.eventDraw(de % 2 === 1); seenE[e2[0]] = seenE[e2[1]] = 1; if (L.EV_SELF.indexOf(e2[0]) < 0 || L.EV_ROOM.indexOf(e2[1]) < 0 || (de % 2 === 1 && e2[0] === "cook")) okE = false; }
eq("eventDraw: 1 from each pile, no Let Him Cook with several lords, all 8 seen", [okE, Object.keys(seenE).length], [true, 8]);
var okA = true; for (var da = 0; da < 300; da++) { var a2 = L.auraOptions(); var c0 = L.buildCost(a2[0][0], a2[0][1]), c1 = L.buildCost(a2[1][0], a2[1][1]);
  if (a2[0].join() === a2[1].join() || c0 < 6 || c0 > 7 || c1 < 6 || c1 > 7 || a2.some(function (b) { return b[1] === "shield" || b[1] === "interest"; })) okA = false; }
eq("auraOptions: 2 different rules, 6-7 coins, no Shield or Compound Interest", okA, true);
eq("locked in: both must change, budget 6 for the lord", [L.buildOk("even", "+5", { when: "locked", old: { cond: "odd", eff: "+2" }, budget: 6 }), L.buildOk("even", "+2", { when: "locked", old: { cond: "odd", eff: "+2" }, budget: 6 }), L.buildOk("fib", "+5", { when: "locked", old: { cond: "odd", eff: "+2" } }), L.buildOk("even", "interest", { when: "locked", old: { cond: "odd", eff: "+2" } })], [true, false, false, false]);
eq("sigma lords", L.sigmaLords([67, 3, 67]), [0, 2]);

/* ---- final places: total, then round points 12, 11, ... ---- */
eq("places with tie-break", L.finalPlaces([50, 50, 40, 50], [[1, 9], [2, 8], [0, 0], [1, 9]]), [1, 3, 4, 1]);
eq("places full tie shares", L.finalPlaces([10, 10], [[5, 5], [5, 5]]), [1, 1]);

/* ---- building a personal rule ---- */
eq("cost", L.buildCost("notrep", "+2"), 5);
eq("over budget", L.buildOk("notrep", "+3", {}), false);
eq("random 2 coins with 3-coin condition", L.buildOk("gtmean", "random", { when: "start" }), true);
eq("interest only before the game", [L.buildOk("sq", "interest", { when: "start" }), L.buildOk("sq", "interest", { when: "break" })], [true, false]);
eq("locked in: both must change; sigma lord budget 6", [L.buildOk("sq", "+3", { when: "locked", old: { cond: "sq", eff: "+2" } }), L.buildOk("div3", "+7", { when: "locked", old: { cond: "sq", eff: "+2" }, budget: 6 })], [false, true]);
eq("aura: 6-7 coins, no shield, no interest, random ok", [L.buildOk("notrep", "+3", { when: "aura" }), L.buildOk("notrep", "shield", { when: "aura" }), L.buildOk("notrep", "interest", { when: "aura" }), L.buildOk("notrep", "random", { when: "aura" }), L.buildOk("sq", "+7", { when: "aura" })], [true, false, false, true, true]);
eq("random pool has 14 effects, no random", [L.RANDOM_POOL.length, L.RANDOM_POOL.indexOf("random")], [14, -1]);
eq("19 conditions, 15 effects, 13 rules", [Object.keys(L.COND).length, Object.keys(L.EFF).length, L.RULES.length], [19, 15, 13]);
var seen = {}; for (i = 0; i < 2000; i++) seen[L.drawLucky()] = 1;
eq("lucky 1..7", Object.keys(seen).sort(), ["1", "2", "3", "4", "5", "6", "7"]);

/* ---- common-rule vote ---- */
var vo = L.voteOptions(["ban", "lucky"]);
eq("vote options: 3 different, none excluded", [vo.length, new Set(vo).size, vo.indexOf("ban"), vo.indexOf("lucky")], [3, 3, -1, -1]);
var seenR = {}; for (i = 0; i < 3000; i++) L.voteOptions(["curse"]).forEach(function (r) { seenR[r] = 1; });
eq("vote options cover the other 12 rules", Object.keys(seenR).sort(), L.RULES.filter(function (r) { return r !== "curse"; }).sort());
eq("vote: most votes", L.voteWinner(["a", "b", "c"], [{ opt: "b", t: 5 }, { opt: "b", t: 6 }, { opt: "a", t: 1 }]).win, "b");
eq("vote tie: the option voted earliest", L.voteWinner(["a", "b", "c"], [{ opt: "b", t: 5 }, { opt: "a", t: 7 }, { opt: "b", t: 9 }, { opt: "a", t: 8 }, { opt: "c", t: 1 }]), { win: "b", tally: { a: 2, b: 2, c: 1 }, how: "tie" });
eq("vote: nobody voted -> random of the 3", ["a", "b", "c"].indexOf(L.voteWinner(["a", "b", "c"], []).win) >= 0 && L.voteWinner(["a", "b", "c"], []).how === "random", true);

console.log(count - fails + "/" + count + " passed");
process.exit(fails ? 1 : 0);
