/*
 * ゆるかわ百鬼夜行 v0.2 — 手牌解析（アガリ判定・役判定・得点）
 * 仕様: ../design/core-loop-v0.2-agari.md
 * counts[34] 表現: m1-9=0-8, p1-9=9-17, s1-9=18-26, 字牌 z1-7=27-33
 * 単一プレイヤー=全てツモ・門前。得点 = 基礎点 × 2^翻（青天井）。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MJHand = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SUITS = ["m", "p", "s"];
  const HONOR_NAME = { 1: "東", 2: "南", 3: "西", 4: "北", 5: "白", 6: "發", 7: "中" };
  const SUIT_NAME = { m: "萬", p: "筒", s: "索" };
  // 么九牌(1・9・字)のindex
  const YAOCHU = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  // 字牌の呼称（表示用）。役の有無は下記 isYakuhaiIdx で判定する。
  const YAKUHAI = { 27: "東", 28: "南", 29: "西", 30: "北", 31: "白", 32: "發", 33: "中" };
  // ★D34(本家準拠): 役牌＝三元牌(31-33) と その道中の「場風」のみ。他の風(客風)は役なし・雀頭符なし・平和もブロックしない。
  // （ソロに自風は無いので、場風はダブ風相当＝刻子2翻。B1で入れた「全風牌1翻」は麻雀経験者に違和感があるため撤回。）
  function isYakuhaiIdx(i, baWind) { return i >= 31 || i === baWind; }

  function codeToIndex(code) {
    const s = code[0], r = parseInt(code.slice(1), 10);
    if (s === "z") return 27 + (r - 1);
    return SUITS.indexOf(s) * 9 + (r - 1);
  }
  function indexToCode(i) {
    if (i >= 27) return "z" + (i - 27 + 1);
    return SUITS[Math.floor(i / 9)] + ((i % 9) + 1);
  }
  function tileLabel(i) {
    if (i >= 27) return HONOR_NAME[i - 27 + 1];
    return ((i % 9) + 1) + SUIT_NAME[SUITS[Math.floor(i / 9)]];
  }
  function handToCounts(codes) {
    const c = new Array(34).fill(0);
    for (const code of codes) c[codeToIndex(code)]++;
    return c;
  }
  function countsTotal(counts) { return counts.reduce((a, b) => a + b, 0); }

  // ---- 面子抽出（counts を順子/刻子で全て消費する分解を全列挙） --------------
  function extractMelds(counts) {
    let i = 0;
    while (i < 34 && counts[i] === 0) i++;
    if (i === 34) return [[]]; // 全消費 → 空の分解1つ
    const res = [];
    if (counts[i] >= 3) {
      counts[i] -= 3;
      for (const sub of extractMelds(counts)) res.push([{ t: "trip", i }].concat(sub));
      counts[i] += 3;
    }
    if (i < 27 && (i % 9) <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0) {
      counts[i]--; counts[i + 1]--; counts[i + 2]--;
      for (const sub of extractMelds(counts)) res.push([{ t: "seq", i }].concat(sub));
      counts[i]++; counts[i + 1]++; counts[i + 2]++;
    }
    return res;
  }

  function isChiitoi(counts) {
    let pairs = 0;
    for (const c of counts) { if (c === 2) pairs++; else if (c !== 0) return false; }
    return pairs === 7;
  }
  function isKokushi(counts) {
    for (let i = 0; i < 34; i++) if (!YAOCHU.includes(i) && counts[i] > 0) return false;
    let hasPair = false;
    for (const i of YAOCHU) {
      if (counts[i] < 1) return false;
      if (counts[i] === 2) hasPair = true;
      else if (counts[i] > 2) return false;
    }
    return hasPair;
  }

  // アガリ形を列挙（standard/chiitoi/kokushi）。
  // ★D24(鳴き): meldsNeeded = 手牌側で作る面子数（4 - 晒した面子数）。特殊形(七対子/国士)は門前(=4)のみ。
  function enumerateAgari(counts, meldsNeeded) {
    if (meldsNeeded == null) meldsNeeded = 4;
    const results = [];
    for (let p = 0; p < 34; p++) {
      if (counts[p] >= 2) {
        counts[p] -= 2;
        for (const melds of extractMelds(counts)) {
          if (melds.length === meldsNeeded) results.push({ type: "standard", pair: p, melds });
        }
        counts[p] += 2;
      }
    }
    if (meldsNeeded === 4) {
      if (isChiitoi(counts)) results.push({ type: "chiitoi" });
      if (isKokushi(counts)) results.push({ type: "kokushi" });
    }
    return results;
  }

  // ---- 役・得点 --------------------------------------------------------------
  function isTanyao(counts) { for (const i of YAOCHU) if (counts[i] > 0) return false; return true; }
  function flushType(counts) {
    const suits = new Set(); let honor = false;
    for (let i = 0; i < 34; i++) if (counts[i] > 0) { if (i < 27) suits.add(Math.floor(i / 9)); else honor = true; }
    if (suits.size === 1) return honor ? "hon" : "chin";
    return null;
  }
  function seqStarts(seqs) { const m = {}; for (const s of seqs) m[s.i] = (m[s.i] || 0) + 1; return m; }
  // 同一順子のペア数（2組あれば二盃口、1組なら一盃口）。4つ同一順子なら2ペアとして扱う。
  function countIipeikouPairs(seqs) {
    const starts = seqStarts(seqs);
    let pairs = 0;
    for (const v of Object.values(starts)) pairs += Math.floor(v / 2);
    return pairs;
  }
  function hasSanshoku(seqs) {
    const set = new Set(seqs.map((s) => s.i));
    for (let r = 0; r <= 6; r++) if (set.has(r) && set.has(9 + r) && set.has(18 + r)) return true;
    return false;
  }
  function hasIttsu(seqs) {
    const set = new Set(seqs.map((s) => s.i));
    for (const b of [0, 9, 18]) if (set.has(b) && set.has(b + 3) && set.has(b + 6)) return true;
    return false;
  }
  // 三色同刻: 同じ数字の刻子を3色（三色同順の刻子版）
  function hasSanshokuDoukou(trips) {
    const set = new Set(trips.filter((t) => t.i < 27).map((t) => t.i));
    for (let r = 0; r <= 8; r++) if (set.has(r) && set.has(9 + r) && set.has(18 + r)) return true;
    return false;
  }

  // ---- 標準麻雀の点数計算（★D22: 翻・符方式。青天井を廃止しインフレ抑制） ----
  // 待ち符: 単騎・嵌張・辺張=2符 / 両面・シャンポン=0符
  function waitFuOf(dec, winTileIdx) {
    if (winTileIdx == null || dec.type !== "standard") return 0;
    if (dec.pair === winTileIdx) return 2; // 単騎
    for (const m of dec.melds) {
      if (m.t !== "seq") continue;
      const off = winTileIdx - m.i;
      if (off !== 0 && off !== 1 && off !== 2) continue;
      if (off === 1) return 2; // 嵌張
      const low = m.i % 9;
      if (off === 0 && low === 6) return 2; // 789の7待ち＝辺張
      if (off === 2 && low === 0) return 2; // 123の3待ち＝辺張
      return 0; // 両面
    }
    return 0; // 刻子/雀頭側で完成＝シャンポン
  }
  // 符計算: 基本20+ツモ2+刻子符(暗刻: 中張4/么九8, ★D24明刻: 中張2/么九4)+役牌雀頭2+待ち2、10符切り上げ。
  // 例外: 七対子=25符固定、平和ツモ=20符固定（平和は門前限定）。
  function computeFu(dec, ctx, yaku, openMelds) {
    if (dec.type === "chiitoi") return 25;
    if (dec.type !== "standard") return 30; // 国士等（役満なので実質未使用）
    if (yaku.some((y) => y.name === "平和")) return 20;
    let fu = 20 + 2; // 基本符 + ツモ符
    for (const m of dec.melds) {
      if (m.t === "trip") fu += YAOCHU.includes(m.i) ? 8 : 4; // 暗刻符
    }
    for (const m of (openMelds || [])) {
      if (m.t === "trip") fu += YAOCHU.includes(m.i) ? 4 : 2; // 明刻符
    }
    if (isYakuhaiIdx(dec.pair, ctx && ctx.baWind)) fu += 2; // 役牌雀頭（三元牌・場風のみ）
    fu += waitFuOf(dec, ctx && ctx.winTile);
    return Math.ceil(fu / 10) * 10;
  }
  // 翻・符 → 点数（子のロン相当テーブルを「アガリ点数」として採用）。
  // 満貫以上はキャップ＝翻の重ね過ぎが自然に頭打ちになりインフレを防ぐ。
  function scoreHanFu(han, fu, yakumanCount) {
    if (yakumanCount >= 1) {
      const names = { 1: "役満", 2: "ダブル役満", 3: "トリプル役満" };
      return { score: 32000 * yakumanCount, limit: names[yakumanCount] || yakumanCount + "倍役満" };
    }
    if (han >= 13) {
      // ★D27: 数え役満以降も伸び続ける階段（ユーザー提案）。
      // 13-15翻=数え役満(4倍満=32000) / 16-17翻=5倍満(40000) / 18-19翻=6倍満(48000) / 以降2翻ごとに+1倍満(+8000)。
      // 敵HPが無限に伸びる無限夜行で、解放妖怪による翻のインフレがそのまま火力になる。
      if (han <= 15) return { score: 32000, limit: "数え役満" };
      const tier = 5 + Math.floor((han - 16) / 2);
      return { score: 8000 * tier, limit: tier + "倍満" };
    }
    if (han >= 11) return { score: 24000, limit: "三倍満" };
    if (han >= 8) return { score: 16000, limit: "倍満" };
    if (han >= 6) return { score: 12000, limit: "跳満" };
    const base = fu * Math.pow(2, 2 + han);
    if (han >= 5 || base > 2000) return { score: 8000, limit: "満貫" };
    return { score: Math.ceil((base * 4) / 100) * 100, limit: null };
  }

  // 平和の「両面待ち」判定。winTileIdx がこの分解のどこを完成させたかで
  // 嵌張(カンチャン)/辺張(ペンチャン)/単騎はfalse、両面のみtrueを返す。
  function isRyanmenWait(dec, winTileIdx) {
    if (winTileIdx == null || dec.type !== "standard") return false;
    if (dec.pair === winTileIdx) return false; // 単騎
    for (const m of dec.melds) {
      if (m.t !== "seq") continue;
      const offset = winTileIdx - m.i;
      if (offset !== 0 && offset !== 1 && offset !== 2) continue; // このメンツに含まれない
      if (offset === 1) return false; // 嵌張（真ん中）
      const rankOfLow = m.i % 9; // 0-indexed（0=1, 6=7 など）
      if (offset === 0 && rankOfLow === 6) return false; // 789の7待ち＝辺張
      if (offset === 2 && rankOfLow === 0) return false; // 123の3待ち＝辺張
      return true; // 両面
    }
    return false; // winTileIdxがこの分解の刻子/対子側にある(=シャンポン等)→両面ではない
  }

  // 字一色（全て字牌）
  function isTsuuiisou(counts) {
    for (let i = 0; i < 27; i++) if (counts[i] > 0) return false;
    return countsTotal(counts) > 0;
  }
  // 清老頭（全て1・9の数牌）
  function isChinroutou(counts) {
    for (let i = 0; i < 34; i++) {
      if (counts[i] === 0) continue;
      const term = i < 27 && (i % 9 === 0 || i % 9 === 8);
      if (!term) return false;
    }
    return countsTotal(counts) > 0;
  }

  // 混老頭（全て老頭牌1・9or字牌、かつ字牌を含む＝清老頭との排他）
  function isHonroutou(counts) {
    let hasHonor = false;
    for (let i = 0; i < 34; i++) {
      if (counts[i] === 0) continue;
      if (i >= 27) { hasHonor = true; continue; }
      if (!(i % 9 === 0 || i % 9 === 8)) return false;
    }
    return hasHonor && countsTotal(counts) > 0;
  }
  // 緑一色（索子2,3,4,6,8 と 發 のみで構成）
  const RYUUIISOU_TILES = new Set([19, 20, 21, 23, 25, 32]); // s2,s3,s4,s6,s8,發
  function isRyuuiisou(counts) {
    let any = false;
    for (let i = 0; i < 34; i++) {
      if (counts[i] === 0) continue;
      if (!RYUUIISOU_TILES.has(i)) return false;
      any = true;
    }
    return any;
  }
  // 九蓮宝燈（1種の数牌のみで 3-1-1-1-1-1-1-1-3 の形+余剰1枚）
  function isChuurenPoutou(counts) {
    const req = [3, 1, 1, 1, 1, 1, 1, 1, 3];
    for (const base of [0, 9, 18]) {
      let inSuit = 0;
      for (let r = 0; r < 9; r++) inSuit += counts[base + r];
      if (inSuit !== 14) continue;
      if (countsTotal(counts) !== 14) continue; // 他スート/字牌混入なし
      let ok = true;
      for (let r = 0; r < 9; r++) if (counts[base + r] < req[r]) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  }

  // チャンタ/純全帯幺九: 全メンツ+雀頭が么九牌(1・9・字牌)を含む（晒し面子も対象）
  function chantaInfo(dec, allMelds) {
    if (dec.type !== "standard") return null;
    let hasHonor = dec.pair >= 27;
    const pairOk = dec.pair >= 27 || dec.pair % 9 === 0 || dec.pair % 9 === 8;
    if (!pairOk) return null;
    for (const m of allMelds) {
      if (m.t === "trip") {
        const isHonorTile = m.i >= 27;
        const isTerminalTile = m.i < 27 && (m.i % 9 === 0 || m.i % 9 === 8);
        if (!isHonorTile && !isTerminalTile) return null;
        if (isHonorTile) hasHonor = true;
      } else { // seq: 123 or 789 のみ許容
        const rankOfLow = m.i % 9;
        if (rankOfLow !== 0 && rankOfLow !== 6) return null;
      }
    }
    return hasHonor ? { name: "混全帯幺九(チャンタ)", han: 2 } : { name: "純全帯幺九(ジュンチャン)", han: 3 };
  }

  // 1つの分解の役・翻・得点を算出。
  // ★D24(鳴き): ctx.openMelds=[{t,i}]（晒した面子）。門前でなければ 門前ツモ/平和/一盃口/二盃口/七対子/四暗刻等は不成立、
  //  喰い下がり（混一色3→2, 清一色6→5, チャンタ2→1, ジュンチャン3→2, 一通2→1, 三色同順2→1）を適用。
  //  役が1つも無い場合は null（役なし和了不可）。
  function scoreDecomposition(dec, counts, ctx) {
    const openMelds = (ctx && ctx.openMelds) || [];
    const menzen = openMelds.length === 0;
    const seqs = dec.type === "standard" ? dec.melds.filter((m) => m.t === "seq") : [];
    const trips = dec.type === "standard" ? dec.melds.filter((m) => m.t === "trip") : [];
    const openSeqs = openMelds.filter((m) => m.t === "seq");
    const openTrips = openMelds.filter((m) => m.t === "trip");
    const allSeqs = seqs.concat(openSeqs);
    const allTrips = trips.concat(openTrips);
    const allMelds = (dec.type === "standard" ? dec.melds : []).concat(openMelds);
    // 全体counts = 手牌側counts + 晒した面子の牌
    const fullCounts = counts.slice();
    for (const m of openMelds) {
      if (m.t === "trip") fullCounts[m.i] += 3;
      else { fullCounts[m.i]++; fullCounts[m.i + 1]++; fullCounts[m.i + 2]++; }
    }
    const dragonTrips = allTrips.filter((m) => m.i >= 31 && m.i <= 33).length;

    // --- 役満（複合は 32000×n の線形加算） ---
    const yakuman = [];
    if (dec.type === "kokushi") yakuman.push("国士無双");
    if (isTsuuiisou(fullCounts)) yakuman.push("字一色");
    if (isRyuuiisou(fullCounts)) yakuman.push("緑一色");
    if (menzen && isChuurenPoutou(fullCounts)) yakuman.push("九蓮宝燈");
    if (dec.type === "standard") {
      if (menzen && trips.length === 4) yakuman.push("四暗刻"); // 暗刻4つ＝門前限定
      if (dragonTrips === 3) yakuman.push("大三元");
      if (isChinroutou(fullCounts)) yakuman.push("清老頭");
      const windTrips = allTrips.filter((m) => m.i >= 27 && m.i <= 30).length;
      if (windTrips === 4) yakuman.push("大四喜");
      else if (windTrips === 3 && dec.pair >= 27 && dec.pair <= 30) yakuman.push("小四喜");
    }
    if (yakuman.length) return finalizeYakuman(yakuman, dec, openMelds);

    // --- 通常役 ---
    const yaku = [];
    if (menzen) yaku.push({ name: "門前清自摸和", han: 1 });
    if (isTanyao(fullCounts)) yaku.push({ name: "断么九", han: 1 }); // 喰いタンあり
    const flush = flushType(fullCounts);

    if (dec.type === "chiitoi") {
      yaku.push({ name: "七対子", han: 2 });
    } else {
      if (allTrips.length === 4) yaku.push({ name: "対々和", han: 2 }); // ★D24: 鳴きで到達可能に
      if (trips.length >= 3) yaku.push({ name: "三暗刻", han: 2 }); // 暗刻3つ（晒した明刻は数えない）
      // 平和: 門前限定・全順子・非役牌雀頭・両面待ち
      if (menzen && seqs.length === 4 && !isYakuhaiIdx(dec.pair, ctx && ctx.baWind) && isRyanmenWait(dec, ctx && ctx.winTile)) yaku.push({ name: "平和", han: 1 });
      if (menzen) {
        const iipeikouPairs = countIipeikouPairs(seqs);
        if (iipeikouPairs >= 2) yaku.push({ name: "二盃口", han: 3 });
        else if (iipeikouPairs === 1) yaku.push({ name: "一盃口", han: 1 });
      }
      if (hasSanshoku(allSeqs)) yaku.push({ name: "三色同順", han: menzen ? 2 : 1 });
      if (hasSanshokuDoukou(allTrips)) yaku.push({ name: "三色同刻", han: 2 });
      if (hasIttsu(allSeqs)) yaku.push({ name: "一気通貫", han: menzen ? 2 : 1 });
      // 役牌の刻子: 三元牌=1翻 / 風牌=1翻(場風なら2翻) ★D23（明刻でも成立）
      const baWind = ctx && ctx.baWind;
      for (const m of allTrips) {
        if (m.i >= 31) yaku.push({ name: "役牌(" + YAKUHAI[m.i] + ")", han: 1 });
        else if (m.i >= 27 && m.i === baWind) yaku.push({ name: "場風(" + YAKUHAI[m.i] + ")", han: 2 });
        // ★D34: 客風(場風以外の風)の刻子は役なし（暗刻符は付く／四喜和・字一色・混老頭には引き続き寄与）
      }
      if (dragonTrips === 2 && dec.pair >= 31 && dec.pair <= 33) yaku.push({ name: "小三元", han: 2 });
      const chanta = chantaInfo(dec, allMelds);
      if (chanta) yaku.push({ name: chanta.name, han: menzen ? chanta.han : chanta.han - 1 }); // 喰い下がり
    }
    if ((dec.type === "standard" || dec.type === "chiitoi") && isHonroutou(fullCounts)) yaku.push({ name: "混老頭", han: 2 });
    if (flush === "hon") yaku.push({ name: "混一色", han: menzen ? 3 : 2 });
    else if (flush === "chin") yaku.push({ name: "清一色", han: menzen ? 6 : 5 });

    if (yaku.length === 0) return null; // 役なし＝和了不可（鳴いた手のみ起こり得る）
    return finalize(yaku, dec, ctx, openMelds);
  }

  function meldCounts(dec, openMelds) {
    let seqCount = 0, tripCount = 0;
    const all = (dec.type === "standard" ? dec.melds : []).concat(openMelds || []);
    for (const m of all) { if (m.t === "seq") seqCount++; else tripCount++; }
    return { seqCount, tripCount };
  }

  // 通常役: 翻+符から標準麻雀の点数を計算（妖怪フックはエンジン側で han/fu/加点/倍率を加工）
  function finalize(yaku, dec, ctx, openMelds) {
    const han = yaku.reduce((a, y) => a + y.han, 0);
    const fu = computeFu(dec, ctx, yaku, openMelds);
    const { score, limit } = scoreHanFu(han, fu, 0);
    const { seqCount, tripCount } = meldCounts(dec, openMelds);
    return { yaku, han, fu, yakumanCount: 0, score, limit, type: dec.type, seqCount, tripCount };
  }

  // 役満: 複合はダブル/トリプル役満として 32000×n の線形加算（指数爆発しない）
  function finalizeYakuman(names, dec, openMelds) {
    const yaku = names.map((n) => ({ name: n, han: 13 }));
    const { score, limit } = scoreHanFu(13, 30, names.length);
    const { seqCount, tripCount } = meldCounts(dec, openMelds);
    return { yaku, han: 13, fu: 30, yakumanCount: names.length, score, limit, type: dec.type, seqCount, tripCount };
  }

  // 手牌側counts（門前なら14枚、鳴きn個なら14-3n枚）を解析し、最高得点の役取りを返す。
  // 役なし分解しか無い場合は agari:false（鳴いた手は役が必須）。
  function analyze(counts, ctx) {
    const openMelds = (ctx && ctx.openMelds) || [];
    const decs = enumerateAgari(counts, 4 - openMelds.length);
    if (decs.length === 0) return { agari: false };
    let best = null;
    for (const d of decs) {
      const s = scoreDecomposition(d, counts, ctx || {});
      if (s && (!best || s.score > best.score)) best = s;
    }
    if (!best) return { agari: false, yakuless: true }; // 形は完成しているが役が無い
    return Object.assign({ agari: true }, best);
  }
  // codes は手牌側の全牌（最後の1枚＝アガリ牌の規約）。
  function analyzeHand(codes, ctx) {
    const winTile = (ctx && ctx.winTile != null) ? ctx.winTile : codeToIndex(codes[codes.length - 1]);
    return analyze(handToCounts(codes), Object.assign({}, ctx, { winTile }));
  }

  // ---- テンパイ・待ち（手牌側counts に1枚足してアガリ形になる牌） ------------
  // ★D24: openMeldCount 指定で鳴き後の手牌(13-3n枚)にも対応。
  // 注: ここは「形」のみの判定。鳴いた手の役なし待ちの除外はエンジン側(waitPreviews)で行う。
  function waits(counts, openMeldCount) {
    const need = 4 - (openMeldCount || 0);
    const w = [];
    for (let t = 0; t < 34; t++) {
      if (counts[t] >= 4) continue;
      counts[t]++;
      if (enumerateAgari(counts, need).length > 0) w.push(t);
      counts[t]--;
    }
    return w;
  }
  function isTenpai(counts13) { return waits(counts13).length > 0; }

  return {
    SUITS, YAOCHU, YAKUHAI,
    codeToIndex, indexToCode, tileLabel,
    handToCounts, countsTotal, extractMelds, enumerateAgari,
    isChiitoi, isKokushi, isTanyao, flushType,
    computeFu, scoreHanFu,
    scoreDecomposition, analyze, analyzeHand, waits, isTenpai,
  };
});
