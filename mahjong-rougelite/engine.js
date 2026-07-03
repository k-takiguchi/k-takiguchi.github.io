/*
 * ゆるかわ百鬼夜行 v0.2 — ゲームエンジン（本格アガリ型）
 * 仕様: ../design/core-loop-v0.2-agari.md
 * 手牌解析(アガリ/役/得点)は hand.js(MJHand) に委譲。
 * ここでは 山/巡目/打牌/アガリ のループ、妖怪(翻/基礎/倍率フック)、ショップ、メタ進行。
 */
(function (root, factory) {
  const MJHand = (typeof module !== "undefined" && module.exports) ? require("./hand.js") : root.MJHand;
  const api = factory(MJHand);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MJ = api;
})(typeof self !== "undefined" ? self : this, function (MJHand) {
  "use strict";

  const SUITS = ["m", "p", "s"];
  function tileLabelCode(code) { return MJHand.tileLabel(MJHand.codeToIndex(code)); }

  // ---- 妖怪（v0.2: 翻/基礎点/倍率に効く） -----------------------------------
  // hooks: hanAdd(ctx) 加算翻 / baseAdd(ctx) 基礎点加算 / baseTimes:係数 / multTimes:係数
  // flags: 進行系(小判/巡目/敗北無効/リロール/先読み)
  const YOKAI = {
    rokurokubi:   { name: "ろくろ首", face: "🦒", rarity: 1, price: 4, desc: "順子3つ以上のアガリで +1翻" },
    tofukozo:     { name: "豆腐小僧", face: "🍮", rarity: 1, price: 4, desc: "白を含むアガリで 符+10" },
    ittanmomen:   { name: "一反木綿", face: "🧻", rarity: 2, price: 6, desc: "一気通貫か三色を含むと +1翻" },
    zashikiwarashi:{ name: "座敷童", face: "🧒", rarity: 1, price: 4, desc: "アガるたび 小判+1", flags: { kobanOnAgari: 1 } },
    kappa:        { name: "河童", face: "🐢", rarity: 1, price: 4, desc: "索子1枚につき 符+2" },
    tengu:        { name: "天狗", face: "👺", rarity: 2, price: 6, desc: "混一色/清一色で +2翻" },
    yukionna:     { name: "雪女", face: "⛄", rarity: 2, price: 6, desc: "ステージ間のツモ回復 +2", flags: { recovery: 2 } },
    bakedanuki:   { name: "化け狸", face: "🦝", rarity: 3, price: 8, desc: "アガリの翻を最低2翻に" },
    kitsunebi:    { name: "狐火", face: "🦊", rarity: 3, price: 8, desc: "アガリの点数 ×1.5" },
    nurikabe:     { name: "ぬりかべ", face: "🧱", rarity: 2, price: 6, desc: "1ランに1度、敗北を無効化(ツモ回復)", flags: { lossNegate: 1 } },
    chochin:      { name: "提灯お化け", face: "🏮", rarity: 1, price: 4, desc: "ショップのリロールが1回の訪問につき3回まで無料", flags: { freeRerollLimit: 3 } },
    mitsumekozo:  { name: "三つ目小僧", face: "👁️", rarity: 1, price: 4, desc: "次のツモを先読み", flags: { peek: 3 } },
    azukiarai:    { name: "小豆洗い", face: "🫘", rarity: 1, price: 4, desc: "七対子で +2翻" },
    kamaitachi:   { name: "鎌鼬", face: "🌪️", rarity: 2, price: 6, desc: "この道中のアガリ数×300点 を加点" },
    nurarihyon:   { name: "ぬらりひょん", face: "👴", rarity: 3, price: 8, desc: "アガるたび +200点(ラン中累積)" },
    bakeneko:     { name: "化け猫", face: "🐈‍⬛", rarity: 3, price: 8, desc: "刻子3つ以上のアガリで +2翻" },
    karakasa:     { name: "唐傘小僧", face: "☂️", rarity: 1, price: 4, desc: "翻が奇数なら +1翻" },
    fukunokami:   { name: "福の神", face: "🧧", rarity: 2, price: 6, desc: "所持小判10ごとに +500点" },
    raiju:        { name: "雷獣", face: "⚡", rarity: 2, price: 6, desc: "三元牌の刻子で 点数×2" },
    daidarabocchi:{ name: "だいだらぼっち", face: "🗻", rarity: 3, price: 8, desc: "全てのアガリで 符+20" },
    // ---- サポート/ユーティリティ系（三つ目小僧の仲間） ----
    hyakume:      { name: "百目", face: "👀", rarity: 2, price: 7, desc: "ツモが6枚になる（毎回1枚多く選べる）", flags: { tsumoSize: 1 } },
    amefurikozo:  { name: "雨降小僧", face: "☔", rarity: 1, price: 4, desc: "ツモを引くたび 小判+1", flags: { kobanOnDraw: 1 } },
    wanyudo:      { name: "輪入道", face: "🎡", rarity: 2, price: 6, desc: "ショップの妖怪が2小判引き", flags: { shopDiscount: 2 } },
    sunekosuri:   { name: "すねこすり", face: "🐕", rarity: 1, price: 5, desc: "各ラウンド1回 手牌を引き直せる", flags: { mulligan: 1 } },
    tenome:       { name: "手の目", face: "✋", rarity: 1, price: 5, desc: "手が進むツモ牌を光らせる", flags: { highlight: true } },
    miagenyudo:   { name: "見上げ入道", face: "👹", rarity: 3, price: 8, desc: "各ラウンド1回 テンパイ中のツモに待ち牌を確定で1枚混ぜる", flags: { guaranteedDraw: 1 } },
    teruterubozu: { name: "てるてる坊主", face: "☀️", rarity: 2, price: 6, desc: "アガリ時 残りツモ回数×200点（速いほど得）" },
    bakezouri:    { name: "化け草鞋", face: "👡", rarity: 1, price: 5, desc: "各ラウンド2回 ツモだけ無料で引き直せる", flags: { freeTsumoReroll: 2 } },
    kanadama:     { name: "金霊", face: "💴", rarity: 2, price: 6, desc: "ラウンドクリアの小判報酬 ×2", flags: { rewardMult: 2 } },
    fukusuke:     { name: "福助", face: "🎎", rarity: 1, price: 4, desc: "ラウンド開始時 小判+3", flags: { kobanOnRound: 3 } },
    senrigan:     { name: "千里眼", face: "🔮", rarity: 2, price: 6, desc: "待ち牌の残り枚数に、まだ山に出ていない捨て牌分も含めて見える", flags: { countWaits: true } },
    // ---- ★D31 追加妖怪（基本3体）----
    fuuri:        { name: "風狸", face: "🍃", rarity: 2, price: 6, desc: "場風の刻子で さらに+2翻" },
    yamabiko:     { name: "山彦", face: "⛰️", rarity: 1, price: 4, desc: "鳴く(ポン/チー)たび 小判+2", flags: { kobanOnCall: 2 } },
    amanojaku:    { name: "天邪鬼", face: "😝", rarity: 2, price: 6, desc: "チャンタ/ジュンチャンのアガリで +2翻" },
    // ---- ★D30 メダル解放妖怪（妖怪茶屋の図鑑で解放 → minStage以降のショップに出現）----
    // 翻インフレ特化: D27の数え役満階段(16翻=5倍満/18翻=6倍満/+2翻毎+8000)を活かし、無限夜行の深部を攻略可能にする。
    onibi:        { name: "鬼火", face: "🔥", rarity: 2, price: 6, desc: "字牌の刻子1つにつき +1翻", unlock: { cost: 12, minStage: 4 } },
    nureonna:     { name: "濡女", face: "🐍", rarity: 2, price: 6, desc: "刻子の無いアガリ(全て順子)で +2翻", unlock: { cost: 12, minStage: 4 } },
    yosuzume:     { name: "夜雀", face: "🐦", rarity: 2, price: 6, desc: "鳴いている手のアガリで +2翻", unlock: { cost: 15, minStage: 5 } },
    ungaikyo:     { name: "雲外鏡", face: "🪞", rarity: 3, price: 8, desc: "七対子・二盃口のアガリで +3翻", unlock: { cost: 20, minStage: 6 } },
    shutendoji:   { name: "酒呑童子", face: "🍶", rarity: 3, price: 8, desc: "5翻以上のアガリで さらに+2翻", unlock: { cost: 25, minStage: 6 } },
    umibozu:      { name: "海坊主", face: "🌊", rarity: 3, price: 8, desc: "清一色のアガリで さらに+3翻", unlock: { cost: 25, minStage: 8 } },
    hakutaku:     { name: "白澤", face: "🐂", rarity: 3, price: 9, desc: "全てのアガリで +2翻", unlock: { cost: 30, minStage: 9 } },
    ryujin:       { name: "龍神", face: "🐲", rarity: 3, price: 10, desc: "13翻以上のアガリで さらに+4翻", unlock: { cost: 40, minStage: 10 } },
    // ---- ★D31 追加解放妖怪（2体）----
    tsukumogami:  { name: "九十九神", face: "📿", rarity: 3, price: 8, desc: "符50以上のアガリで +3翻", unlock: { cost: 20, minStage: 7 } },
    tamamonomae: { name: "玉藻前", face: "✨", rarity: 3, price: 10, desc: "役満・数え役満以上のアガリで 点数×1.5", unlock: { cost: 35, minStage: 12 } },
    // ---- ★D32 追加解放妖怪（6体: システム/サポート/経済/役満支援）----
    doraneko:     { name: "ドラ猫", face: "🐱", rarity: 3, price: 8, desc: "毎ラウンド、ランダムな牌1種がドラになる（手の中の1枚につき+1翻）", unlock: { cost: 20, minStage: 6 } },
    yakousan:     { name: "夜行さん", face: "👺", rarity: 2, price: 6, desc: "么九牌だけのアガリ(混老頭)で +3翻", unlock: { cost: 15, minStage: 7 } },
    itsumade:     { name: "以津真天", face: "🦅", rarity: 2, price: 7, desc: "ステージ間のツモ回復 +3", unlock: { cost: 25, minStage: 8 }, flags: { recovery: 3 } },
    takarabune:   { name: "宝船", face: "🚢", rarity: 3, price: 8, desc: "アガリ時、所持小判1枚につき +100点", unlock: { cost: 25, minStage: 9 } },
    fuujin:       { name: "風神", face: "🌀", rarity: 3, price: 9, desc: "風牌の刻子1つにつき +2翻", unlock: { cost: 25, minStage: 10 } },
    kudan:        { name: "件", face: "🐄", rarity: 3, price: 9, desc: "役満テンパイ中、ツモに待ち牌を確定で1枚混ぜる（各ラウンド1回）", unlock: { cost: 30, minStage: 10 }, flags: { yakumanDraw: 1 } },
  };
  const YOKAI_IDS = Object.keys(YOKAI);

  // ---- ボス妖怪ギミック（A1: ボスブラインド相当） ---------------------------
  // 参照: ../design/boss-gimmicks-a1.md
  const BOSS_GIMMICKS = {
    omoishi: { name: "重石", desc: "このボス戦は最終翻 -1（役満は対象外）" },
    kasumi: { name: "紗霧", desc: "ツモが1枚少ない（5→4）" },
    seijaku: { name: "静寂", desc: "妖怪の翻加算が無効（符・加点・倍率は有効）" },
    // ★A1 v2 面子無効/役無効（design/boss-gimmicks-a1.md §9）。メカニクス実装済み・stage割当は未（ユーザーレビュー保留）。
    junfuji: { name: "順封じ", desc: "順子を面子と認めない（刻子＋雀頭のみ）" },
    kokufuji: { name: "刻封じ", desc: "刻子を認めない（順子＋雀頭のみ）" },
    heiwafuji: { name: "和封じ", desc: "平和が付く手ではアガれない" },
    // ★A1 v3 新8種（design/boss-gimmicks-a1.md §10）。無限プールに追加・キャンペーンには自動割当しない。
    somefuji: { name: "染封じ", desc: "混一色・清一色ではアガれない" },
    chiitoifuji: { name: "七対子封じ", desc: "七対子ではアガれない" },
    tanyaofuji: { name: "断么封じ", desc: "断么九ではアガれない" },
    karesansui: { name: "枯山水", desc: "符が20固定（符加算が乗らない）" },
    sennichite: { name: "千日手", desc: "直前のアガリと共通の役ではアガれない（門前ツモは除く）" },
    kechi: { name: "吝嗇", desc: "このボス戦のクリア報酬・利子が半減" },
    nemuri: { name: "眠り", desc: "所持妖怪のうちランダム1体がこの戦だけ休眠（採点に不参加）" },
    nopperabou: { name: "のっぺらぼう", desc: "待ち残数表示・手の目ハイライトが無効" },
  };
  // 静寂(seijaku)=「妖怪の翻加算を全無効化」は強力なため、百鬼夜行(campaign)の最終ボス(ぬらりひょん)専用。
  // ★A1 v3: 無限夜行(endless)のボスは静寂を除く全ギミック(v1のkasumi/omoishi + v2の順封じ/刻封じ/和封じ + v3の新8種)を
  // 決定的な擬似乱数(endlessGimmickFor)でプールから選ぶ。直前の無限ボスと同じidは避ける（design §10-3）。
  const ENDLESS_POOL = [
    "kasumi", "omoishi", "junfuji", "kokufuji", "heiwafuji",
    "somefuji", "chiitoifuji", "tanyaofuji", "karesansui", "sennichite", "kechi", "nemuri", "nopperabou",
  ];
  function _mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // 無限ボス(index i)のgimmickを決定的に選ぶ純関数。直前の無限ボス(i-3)と同idなら次候補へずらす。
  function endlessGimmickFor(i) {
    const n = ENDLESS_POOL.length;
    const rnd = _mulberry32(((i + 1) * 2654435761) >>> 0)();
    let idx = Math.min(n - 1, Math.floor(rnd * n));
    const prevBossIndex = i - 3;
    if (prevBossIndex >= CAMPAIGN_ROUNDS.length) {
      const prevId = endlessGimmickFor(prevBossIndex);
      if (ENDLESS_POOL[idx] === prevId) idx = (idx + 1) % n;
    }
    return ENDLESS_POOL[idx];
  }
  function yokaiFlag(owned, key, reducer) {
    let acc = reducer === "sum" ? 0 : false;
    for (const id of owned) {
      const f = YOKAI[id] && YOKAI[id].flags;
      if (f && f[key] != null) acc = reducer === "sum" ? acc + f[key] : (acc || f[key]);
    }
    return acc;
  }

  // ---- ★A2 消耗品アイテム（使い切りの一発。妖怪とは別レイヤー） -----------------
  // 参照: ../design/consumables-a2.md 。usable: "round"(ラウンド中) / "shop"(ショップ中) /
  // "anytime"(常時) / "auto"(手動使用不可・自動発動のみ=migawari)。
  const ITEMS = {
    shinzuu:    { name: "神通力の札", face: "📜", rarity: 3, price: 9, desc: "手牌1枚を選んだ牌に変える(1回)", category: "牌操作", usable: "round" },
    habauchiwa: { name: "天狗の羽団扇", face: "🪭", rarity: 2, price: 6, desc: "手牌＋ツモを引き直す(ツモ回数を消費しない)", category: "手作り", usable: "round" },
    ema:        { name: "絵馬", face: "🎴", rarity: 2, price: 6, desc: "次のアガリの翻+2(予約・一発)", category: "打点", usable: "round" },
    migawari:   { name: "身代わり札", face: "🪆", rarity: 2, price: 7, desc: "次の敗北(ツモ切れ)を1回無効化", category: "保険", usable: "auto" },
    hamaya:     { name: "破魔矢", face: "🏹", rarity: 3, price: 9, desc: "このボス戦のギミックを無効化", category: "A1対策", usable: "round" },
    juzu:       { name: "数珠", face: "📿", rarity: 3, price: 8, desc: "このボス戦の目標点-20%", category: "敵弱体", usable: "round" },
    kozuchi:    { name: "打ち出の小槌", face: "🔨", rarity: 1, price: 5, desc: "小判+10(即時)", category: "経済", usable: "anytime" },
    yobimizu:   { name: "呼び水", face: "💧", rarity: 1, price: 4, desc: "ショップを1回無料リロール", category: "ショップ", usable: "shop" },
  };
  const ITEM_IDS = Object.keys(ITEMS);

  // ---- メタ進行（恒久強化） --------------------------------------------------
  const META_UPGRADES = {
    seed_koban:  { name: "軍資金",   face: "💰", desc: "開始時の小判 +2 /Lv", max: 3, costs: [8, 12, 16] },
    nebari:      { name: "粘り",     face: "🪢", desc: "ステージ間のツモ回復 +1 /Lv", max: 2, costs: [15, 25] },
    engimono:    { name: "縁起物",   face: "🎏", desc: "アガリの点数 +300 /Lv", max: 2, costs: [12, 20] },
    slot_plus:   { name: "妖怪の絆", face: "🤝", desc: "妖怪枠 +1 /Lv",       max: 2, costs: [18, 30] },
    item_slot:   { name: "道具袋",   face: "👝", desc: "消耗品枠 +1 /Lv",     max: 2, costs: [18, 30] },
    shop_size:   { name: "賑わう市", face: "🏮", desc: "ショップの妖怪 +1",    max: 1, costs: [15] },
    lucky_start: { name: "はじめの友", face: "🦊", desc: "開始時にランダムな妖怪1体", max: 1, costs: [25] },
  };
  const META_IDS = Object.keys(META_UPGRADES);
  function metaNextCost(id, level) {
    const u = META_UPGRADES[id];
    if (!u || level >= u.max) return null;
    return u.costs[level];
  }

  // ---- 得点（アガリ）: MJHand.analyze に妖怪フックを適用 ---------------------
  function computeAgari(codes, state) {
    const counts = MJHand.handToCounts(codes);
    // 規約: codes の最後の1枚がアガリ牌（平和の両面待ち判定等に使用）
    const winTile = MJHand.codeToIndex(codes[codes.length - 1]);
    const st = state || {};
    const owned = st.yokai || [];
    const gimmick = st.gimmick || null;
    // ★A1 v2 面子無効: 順封じ→順子(seq)禁止 / 刻封じ→刻子(trip)禁止 を analyze の列挙フィルタへ渡す（§9-1）。
    const forbidMeld = gimmick === "junfuji" ? "seq" : gimmick === "kokufuji" ? "trip" : null;
    const res = MJHand.analyze(counts, { winTile, baWind: st.baWind, openMelds: st.openMelds, forbidMeld });
    if (!res.agari) return { agari: false };
    const names = res.yaku.map((y) => y.name);
    const hasYaku = (n) => names.some((x) => x === n || x.startsWith(n));
    // ★A1 v2 役無効(和封じ): 平和が付く手ではアガれない（§9-2・簡易版=採点分解に平和を含めばブロック）。
    if (gimmick === "heiwafuji" && hasYaku("平和")) return { agari: false, blockedByGimmick: true };
    // ★A1 v3 役無効(染封じ/七対子封じ/断么封じ)・千日手（§10-2。役満手も弾く＝仕様通り）。
    if (gimmick === "somefuji" && (hasYaku("混一色") || hasYaku("清一色"))) return { agari: false, blockedByGimmick: true };
    if (gimmick === "chiitoifuji" && res.type === "chiitoi") return { agari: false, blockedByGimmick: true };
    if (gimmick === "tanyaofuji" && hasYaku("断么九")) return { agari: false, blockedByGimmick: true };
    if (gimmick === "sennichite" && st.lastAgariYaku) {
      const ALWAYS = new Set(["門前清自摸和"]);
      const now = names.filter((n) => !ALWAYS.has(n));
      if (now.some((n) => st.lastAgariYaku.includes(n))) return { agari: false, blockedByGimmick: true };
    }
    // 門前ツモが常に1翻付くため、アガリは必ず役あり(han>=1)。
    const log = res.yaku.map((y) => `${y.name}${y.han}翻`);
    const seqCount = res.seqCount || 0;
    const tripCount = res.tripCount || 0;
    const souCount = counts.slice(18, 27).reduce((a, b) => a + b, 0);
    const hasHaku = counts[31] > 0;
    const dragonTrip = counts[31] >= 3 || counts[32] >= 3 || counts[33] >= 3;

    // ★D22: 標準麻雀の点数計算（翻・符・満貫キャップ）。妖怪は 翻/符/加点/倍率 の4種フックに整理。
    const isYakuman = res.yakumanCount > 0;
    let han = res.han;
    let fu = res.fu;
    let flat = 0;          // 最終点数へのフラット加算
    const times = [];      // 最終点数への倍率
    const note = (m) => log.push(m);

    // --- 翻加算（役満時は既に最高位のため無効） ---
    // ★A1 静寂(seijaku): 妖怪由来の「翻加算」を全無効化。符加算/加点/倍率はここでは対象外＝生かす。
    const hanGate = gimmick !== "seijaku";
    if (!isYakuman) {
      if (hanGate) {
        for (const id of owned) {
          switch (id) {
            case "rokurokubi": if (seqCount >= 3) { han += 1; note("ろくろ首+1翻"); } break;
            case "ittanmomen": if (hasYaku("一気通貫") || hasYaku("三色同順")) { han += 1; note("一反木綿+1翻"); } break;
            case "tengu": if (hasYaku("混一色") || hasYaku("清一色")) { han += 2; note("天狗+2翻"); } break;
            case "azukiarai": if (res.type === "chiitoi") { han += 2; note("小豆洗い+2翻"); } break;
            case "bakeneko": if (hasYaku("三暗刻") || hasYaku("対々和")) { han += 2; note("化け猫+2翻"); } break;
          }
        }
        // --- ★D30 解放妖怪の翻加算 ---
        if (owned.includes("onibi")) {
          // 字牌の刻子数（手牌側の暗刻 + 晒した明刻）
          let honorTrips = 0;
          for (let i = 27; i <= 33; i++) if (counts[i] >= 3) honorTrips++;
          for (const m of (st.openMelds || [])) if (m.t === "trip" && m.i >= 27) honorTrips++;
          if (honorTrips > 0) { han += honorTrips; note(`鬼火+${honorTrips}翻`); }
        }
        if (owned.includes("nureonna") && res.type === "standard" && tripCount === 0) { han += 2; note("濡女+2翻"); }
        if (owned.includes("yosuzume") && (st.openMelds || []).length > 0) { han += 2; note("夜雀+2翻"); }
        if (owned.includes("ungaikyo") && (hasYaku("七対子") || hasYaku("二盃口"))) { han += 3; note("雲外鏡+3翻"); }
        if (owned.includes("umibozu") && hasYaku("清一色")) { han += 3; note("海坊主+3翻"); }
        if (owned.includes("hakutaku")) { han += 2; note("白澤+2翻"); }
        // --- ★D31 追加妖怪の翻加算 ---
        if (owned.includes("fuuri") && st.baWind != null) {
          const hasBaWindTrip = counts[st.baWind] >= 3 || (st.openMelds || []).some((m) => m.t === "trip" && m.i === st.baWind);
          if (hasBaWindTrip) { han += 2; note("風狸+2翻"); }
        }
        if (owned.includes("amanojaku") && (hasYaku("混全帯幺九") || hasYaku("純全帯幺九"))) { han += 2; note("天邪鬼+2翻"); }
        // --- ★D32 追加解放妖怪の翻加算 ---
        if (owned.includes("doraneko") && st.doraTile != null) {
          // ドラ枚数 = 手牌側counts + 晒し面子（刻子=3枚 / 順子=範囲内なら1枚）
          let dora = counts[st.doraTile] || 0;
          for (const m of (st.openMelds || [])) {
            if (m.t === "trip" && m.i === st.doraTile) dora += 3;
            else if (m.t === "seq" && st.doraTile >= m.i && st.doraTile <= m.i + 2) dora += 1;
          }
          if (dora > 0) { han += dora; note(`ドラ×${dora}: +${dora}翻`); }
        }
        if (owned.includes("yakousan") && hasYaku("混老頭")) { han += 3; note("夜行さん+3翻"); }
        if (owned.includes("fuujin")) {
          let windTrips = 0;
          for (let i = 27; i <= 30; i++) if (counts[i] >= 3) windTrips++;
          for (const m of (st.openMelds || [])) if (m.t === "trip" && m.i >= 27 && m.i <= 30) windTrips++;
          if (windTrips > 0) { han += 2 * windTrips; note(`風神+${2 * windTrips}翻`); }
        }
      }

      // --- 符加算（満貫以上では自然に無意味化＝インフレしない。九十九神より先に確定させる） ---
      // ★A1 静寂: 符加算は「翻加算」ではないため hanGate の対象外＝常に実行する。
      let fuAdd = 0;
      for (const id of owned) {
        switch (id) {
          case "tofukozo": if (hasHaku) { fuAdd += 10; note("豆腐小僧: 符+10"); } break;
          case "kappa": if (souCount > 0) { fuAdd += 2 * souCount; note(`河童: 符+${2 * souCount}`); } break;
          case "daidarabocchi": fuAdd += 20; note("だいだらぼっち: 符+20"); break;
        }
      }
      if (fuAdd > 0) fu = Math.ceil((fu + fuAdd) / 10) * 10;
      // ★A1 v3 枯山水(karesansui): 符を20固定（符加算・暗刻符等は乗らない）。役満は符を使わないので無害。
      if (gimmick === "karesansui") { fu = 20; note("【枯山水】符20固定"); }

      if (hanGate) {
        // --- ★D31 九十九神（最終符を参照するため符加算の後） ---
        if (owned.includes("tsukumogami") && fu >= 50) { han += 3; note("九十九神+3翻"); }

        // --- 翻の底上げ/パリティ ---
        if (owned.includes("bakedanuki") && han < 2) { han = 2; note("化け狸: 最低2翻"); }
        if (owned.includes("karakasa") && (han % 2 === 1)) { han += 1; note("唐傘+1翻"); }
        // --- ★D30 段階発動（他の加算が済んだ後に判定） ---
        if (owned.includes("shutendoji") && han >= 5) { han += 2; note("酒呑童子+2翻"); }
        if (owned.includes("ryujin") && han >= 13) { han += 4; note("龍神+4翻"); }
      }
      // --- ★A2 絵馬(ema): 消耗品由来の翻加算。妖怪由来ではないため静寂(hanGate)の対象外。 ---
      if (st.pendingHanBonus) { han += st.pendingHanBonus; note(`絵馬: +${st.pendingHanBonus}翻`); }
    }

    // --- フラット加点（役満にも乗る） ---
    for (const id of owned) {
      switch (id) {
        case "kamaitachi": { const a = st.agariThisRound || 0; if (a > 0) { flat += 300 * a; note(`鎌鼬: +${300 * a}点`); } } break;
        case "nurarihyon": { const a = st.totalAgari || 0; if (a > 0) { flat += 200 * a; note(`ぬらりひょん: +${200 * a}点`); } } break;
        case "fukunokami": { const m = Math.floor((st.koban || 0) / 10) * 500; if (m > 0) { flat += m; note(`福の神: +${m}点`); } } break;
        case "teruterubozu": { const d = st.drawsLeft || 0; if (d > 0) { flat += 200 * d; note(`てるてる坊主: +${200 * d}点`); } } break;
        case "takarabune": { const k = st.koban || 0; if (k > 0) { flat += 100 * k; note(`宝船: +${100 * k}点`); } } break;
        case "raiju": if (dragonTrip) { times.push(2); note("雷獣: 点数×2"); } break;
      }
    }
    // 縁起物(メタ): アガリの点数+300/Lv
    if (st.engimono) { flat += 300 * st.engimono; note(`縁起物: +${300 * st.engimono}点`); }
    if (owned.includes("kitsunebi")) { times.push(1.5); note("狐火: 点数×1.5"); }
    // ★D31 玉藻前: 役満級のアガリをさらに伸ばす（深部の到達深度を延長）
    if (owned.includes("tamamonomae") && (isYakuman || han >= 13)) { times.push(1.5); note("玉藻前: 点数×1.5"); }

    // ★A1 重石(omoishi): このボス戦の最終翻-1（下限1翻・役満は対象外）。scoreHanFu直前で適用。
    if (gimmick === "omoishi" && !isYakuman) { han = Math.max(1, han - 1); note("【重石】翻-1"); }

    const hf = MJHand.scoreHanFu(han, fu, res.yakumanCount);
    let score = hf.score + flat;
    for (const x of times) score *= x;
    score = Math.round(score);
    return { agari: true, han, fu, yakumanCount: res.yakumanCount, limit: hf.limit, score, yaku: res.yaku, log, type: res.type };
  }

  // ---- 山（デッキ） ----------------------------------------------------------
  function makeStartingDeck() {
    // 標準136枚: 数牌 m/p/s 1-9 ×4 + 字牌 z1-7 ×4
    const deck = [];
    for (const s of SUITS) for (let r = 1; r <= 9; r++) for (let k = 0; k < 4; k++) deck.push(s + r);
    for (let z = 1; z <= 7; z++) for (let k = 0; k < 4; k++) deck.push("z" + z);
    return deck;
  }
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor((rng ? rng() : Math.random()) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const _ORD = { m: 0, p: 1, s: 2, z: 3 };
  function sortCodes(arr) {
    return arr.slice().sort((a, b) => {
      const sa = _ORD[a[0]], sb = _ORD[b[0]];
      if (sa !== sb) return sa - sb;
      return parseInt(a.slice(1)) - parseInt(b.slice(1));
    });
  }

  function makeRounds() {
    // ★D22: 標準麻雀の点数レンジに合わせた敵HP。「1〜2回のアガリで届く」水準。
    // 目安: 1翻30符=1000 / 3翻=3900 / 満貫=8000 / 跳満=12000。最終ボスは跳満級1発 or 満貫+α。
    // ★A1: ボス3体にギミック付与（design/boss-gimmicks-a1.md §3）
    return [
      { name: "小豆洗い", target: 1000 }, { name: "唐傘小僧", target: 1600 }, { name: "【ボス】提灯お化け", target: 3200, boss: true, gimmick: "kasumi" },
      { name: "河童", target: 2600 }, { name: "ろくろ首", target: 3900 }, { name: "【ボス】天狗", target: 6400, boss: true, gimmick: "omoishi" },
      { name: "化け猫", target: 5800 }, { name: "【大ボス】ぬらりひょん", target: 8000, boss: true, gimmick: "seijaku" },
    ];
  }
  const CAMPAIGN_ROUNDS = makeRounds();
  const ENDLESS_NAMES = ["鵺", "がしゃどくろ", "九尾の狐", "大百足", "橋姫", "牛鬼", "塗仏", "土蜘蛛"];
  // ★D23(B1②): 場風ローテーション。2戦ごとに 東→南→西→北 と巡る（8戦でちょうど一周＝百鬼夜行の道中）。
  // 場風の刻子は2翻・他の風は1翻（全風牌が役牌）。tileIndex 27=東,28=南,29=西,30=北。
  const WIND_NAMES = { 27: "東", 28: "南", 29: "西", 30: "北" };
  function baWindFor(i) { return 27 + (Math.floor(i / 2) % 4); }
  // 任意のステージ番号の定義（8戦目以降は無限生成）
  function roundDefFor(i) {
    const wind = baWindFor(i);
    const windName = WIND_NAMES[wind] + "場";
    if (i < CAMPAIGN_ROUNDS.length) return Object.assign({ wind, windName }, CAMPAIGN_ROUNDS[i]);
    const boss = (i + 1) % 3 === 0;
    const over = i - (CAMPAIGN_ROUNDS.length - 1);
    // 満貫キャップがあるため無限モードの伸びは緩め(×1.25)。役満(32000)到達は約8戦先。
    const target = Math.round(CAMPAIGN_ROUNDS[CAMPAIGN_ROUNDS.length - 1].target * Math.pow(1.25, over) / 100) * 100;
    const name = (boss ? "【百鬼】" : "") + ENDLESS_NAMES[i % ENDLESS_NAMES.length];
    // ★A1 v3: 無限ボスはENDLESS_POOLから決定的な擬似乱数でローテ（非ボスはgimmickなし＝undefined）
    const gimmick = boss ? endlessGimmickFor(i) : undefined;
    return { name, target, boss, wind, windName, gimmick };
  }

  // ---- ゲーム ----------------------------------------------------------------
  class Game {
    constructor(opts = {}) {
      this.rng = opts.rng || Math.random;
      this.meta = opts.meta || { upgrades: {} };
      this._opts = opts;
      this.reset();
    }
    metaLvl(id) { return (this.meta && this.meta.upgrades && this.meta.upgrades[id]) || 0; }
    reset() {
      const o = this._opts || {};
      // ★D25: ツモは全ステージ共通の持ち越しリソース（HP相当）。ステージ間は+3(ボス撃破+3)のみ回復、上限=開始値。
      this.startDraws = o.draws || 15;
      this.drawsLeft = this.startDraws;
      this._baseSlots = (o.slots || 5) + this.metaLvl("slot_plus");
      this.shopYokaiCount = 3 + this.metaLvl("shop_size");
      this.engimono = this.metaLvl("engimono");
      this.deck = makeStartingDeck();
      this.koban = 4 + 2 * this.metaLvl("seed_koban");
      this.yokai = [];
      if (this.metaLvl("lucky_start") > 0) {
        const basePool = YOKAI_IDS.filter((id) => !YOKAI[id].unlock); // 解放妖怪は開始ボーナス対象外
        this.yokai.push(shuffle(basePool, this.rng)[0]);
      }
      this.mode = (this._opts && this._opts.mode) || "campaign"; // "campaign" | "endless"
      this.roundsCleared = 0;
      this.totalAgari = 0;
      this.roundIndex = 0;
      this.lossNegateUsed = 0;
      this.teaPrice = 4; // お茶(ツモ+3)の価格。ラン中はリセットせず購入のたびに+1
      this.extraSlots = 0; // 風呂敷(妖怪枠+1)の購入数 ★D29
      this.furoshikiPrice = 8; // 風呂敷の価格。購入のたびに+4
      this.items = []; // ★A2 消耗品アイテム(所持id配列)
      this.phase = "round";
      this.startRound();
    }
    currentRound() { return roundDefFor(this.roundIndex); }
    // 妖怪枠: 基礎(メタ強化込み) + 消費アイテム「風呂敷」の購入数(★D29)。上限10。
    get yokaiSlots() { return Math.min(10, this._baseSlots + (this.extraSlots || 0)); }
    // ★A2 消耗品スロット数: 基礎2 + メタ強化(item_slot)/Lv。上限は妖怪枠に倣い5でキャップ。
    get itemSlots() { return Math.min(5, 2 + this.metaLvl("item_slot")); }
    isLastCampaignStage() { return this.mode === "campaign" && this.roundIndex >= CAMPAIGN_ROUNDS.length - 1; }
    // ★A2/§5: 破魔矢(hamaya)/数珠(juzu)がボス戦のギミック/目標点を無効化・軽減するための実効値アクセサ。
    // gimmickNegated/targetReducedが未セット(false)の間はcurrentRound()の値をそのまま返す＝デフォルト挙動は不変。
    effectiveGimmick() { return this.gimmickNegated ? null : (this.currentRound().gimmick || null); }
    effectiveTarget() { const t = this.currentRound().target; return this.targetReduced ? Math.round(t * 0.8 / 100) * 100 : t; }

    startRound() {
      this.mulligansLeft = yokaiFlag(this.yokai, "mulligan", "sum");    // すねこすり
      this.guaranteedLeft = yokaiFlag(this.yokai, "guaranteedDraw", "sum"); // 見上げ入道
      this.kudanLeft = yokaiFlag(this.yokai, "yakumanDraw", "sum"); // ★D32 件
      // ★A2: 破魔矢/数珠/絵馬の予約フラグはラウンドごとにリセット(そのボス戦限りの効果のため)。
      this.gimmickNegated = false;
      this.targetReduced = false;
      this.pendingHanBonus = 0;
      this.doraTile = Math.floor(this.rng() * 34); // ★D32 ドラ牌（ドラ猫所持時のみ効果・表示）
      this.freeTsumoRerollLeft = yokaiFlag(this.yokai, "freeTsumoReroll", "sum"); // 化け草鞋
      this.koban += yokaiFlag(this.yokai, "kobanOnRound", "sum"); // 福助
      // ★A1 v3 眠り(nemuri): このボス戦だけ所持妖怪からランダム1体を休眠させる（採点に不参加。§10-2）。
      this.sleepingYokai = (this.effectiveGimmick() === "nemuri" && this.yokai.length)
        ? this.yokai[Math.floor(this.rng() * this.yokai.length)] : null;
      // ★A1 v3 千日手(sennichite)用: 直前のアガリ役の記憶はラウンドをまたがない（毎戦リセット）。
      this.lastAgariYaku = null;
      this.wall = shuffle(this.deck, this.rng);
      this.discardPile = [];
      this.roundScore = 0;
      this.agariThisRound = 0;
      this.phase = "round";
      this.dealNewHand();
    }
    // ★A1 紗霧(kasumi): ツモプールが1枚少ない(5→4)。百目等とはスタックする。
    _tsumoCount() { return Math.max(1, 5 + yokaiFlag(this.yokai, "tsumoSize", "sum") - (this.effectiveGimmick() === "kasumi" ? 1 : 0)); }
    // 手牌＋ツモ（既定5枚）を配る。★D24: 通常は晒し面子もリセット（keepMelds=trueはすねこすり用）
    dealNewHand(keepMelds) {
      if (!keepMelds) this.melds = [];
      this.mustDiscard = false;
      this.hand = sortCodes(this._drawN(this.expectedConcealed));
      this.tsumo = sortCodes(this._drawN(this._tsumoCount()));
    }
    // 鳴き後の手牌側の枚数（面子1つにつき3枚が晒しへ移動）
    get expectedConcealed() { return 13 - 3 * ((this.melds && this.melds.length) || 0); }
    // すねこすり: 手牌＋ツモを引き直す（1ラウンド回数制限・ツモ回数は消費しない）
    redealHand() {
      if (this.phase !== "round") return { ok: false };
      if (this.mulligansLeft <= 0) return { ok: false, message: "引き直しはできません" };
      for (const c of this.hand) this.discardPile.push(c);
      for (const c of this.tsumo) this.discardPile.push(c);
      this.dealNewHand(true); // 晒した面子はそのまま
      this.mulligansLeft--;
      return { ok: true };
    }
    // 手の目: 実際に手が進む（テンパイに近づく/待ちが広がる）ツモ牌だけを光らせる。
    // 「同スート近傍なら何でも光る」旧ロジックは範囲が広すぎたため、
    // 実際にどこかの手牌1枚とスワップしてテンパイ改善(非テンパイ→テンパイ、または待ち種類が増える)する牌だけを対象にする。
    usefulTsumo() {
      // ★A1 v3 のっぺらぼう(nopperabou): 手の目ハイライトを無効化。
      if (this.effectiveGimmick() === "nopperabou") return [];
      if (!yokaiFlag(this.yokai, "highlight", "or")) return [];
      if (this.hand.length !== this.expectedConcealed || this.mustDiscard) return [];
      const baseWaits = this.handWaits();
      const baseCount = baseWaits.length;
      const res = [];
      for (let j = 0; j < this.tsumo.length; j++) {
        const tCode = this.tsumo[j];
        let improves = false;
        for (let i = 0; i < this.hand.length && !improves; i++) {
          if (this.hand[i] === tCode) continue; // 同じ牌への交換は無意味
          const rest = this.hand.slice(0, i).concat(this.hand.slice(i + 1), [tCode]);
          const w = MJHand.waits(MJHand.handToCounts(rest), this.melds.length);
          if (baseCount === 0 ? w.length > 0 : w.length > baseCount) improves = true;
        }
        if (improves) res.push(j);
      }
      return res;
    }
    yokaiPrice(id) { return Math.max(1, YOKAI[id].price - yokaiFlag(this.yokai, "shopDiscount", "sum")); }
    _refillWall() {
      if (this.wall.length === 0 && this.discardPile.length) {
        this.wall = shuffle(this.discardPile, this.rng);
        this.discardPile = [];
      }
    }
    _drawN(n) {
      const out = [];
      for (let i = 0; i < n; i++) { this._refillWall(); if (!this.wall.length) break; out.push(this.wall.pop()); }
      return out;
    }
    peekNext() {
      const n = yokaiFlag(this.yokai, "peek", "sum");
      if (!n) return [];
      return this.wall.slice(-n).reverse();
    }
    _scoreState() {
      // ★A1 v3 眠り(nemuri): 休眠中の妖怪を採点上の実効リストから除外。
      const effYokai = this.sleepingYokai ? this.yokai.filter((id) => id !== this.sleepingYokai) : this.yokai;
      return { yokai: effYokai, koban: this.koban, totalAgari: this.totalAgari, agariThisRound: this.agariThisRound, engimono: this.engimono, drawsLeft: this.drawsLeft, baWind: this.currentRound().wind, openMelds: this.melds, doraTile: this.doraTile, gimmick: this.effectiveGimmick(), lastAgariYaku: this.lastAgariYaku, pendingHanBonus: this.pendingHanBonus || 0 };
    }
    // 化け草鞋: ツモだけ無料で引き直す（ツモ回数を消費しない・回数制限）
    rerollTsumo() {
      if (this.phase !== "round") return { ok: false };
      if (this.freeTsumoRerollLeft <= 0) return { ok: false, message: "無料引き直しがありません" };
      for (const c of this.tsumo) this.discardPile.push(c);
      this.tsumo = sortCodes(this._drawN(this._tsumoCount()));
      this.freeTsumoRerollLeft--;
      return { ok: true };
    }
    // 待ち牌が山(wall)にあと何枚あるか {tileIndex: count}。基本機能として常時有効。
    // 千里眼所持時は、まだ山に無くても捨て山(discardPile)に眠っている分まで見える（上位互換）。
    waitCounts() {
      // ★A1 v3 のっぺらぼう(nopperabou): 待ち残数表示を無効化。
      if (this.effectiveGimmick() === "nopperabou") return {};
      const seeDiscards = yokaiFlag(this.yokai, "countWaits", "or");
      const pool = seeDiscards ? this.wall.concat(this.discardPile) : this.wall;
      const m = {};
      for (const t of this.handWaits()) {
        let c = 0; for (const code of pool) if (MJHand.codeToIndex(code) === t) c++;
        m[t] = c;
      }
      return m;
    }
    // 手牌とツモ牌を自由に交換
    swapTile(handIdx, tsumoIdx) {
      if (this.phase !== "round" || this.mustDiscard) return { ok: false };
      if (handIdx < 0 || handIdx >= this.hand.length || tsumoIdx < 0 || tsumoIdx >= this.tsumo.length) return { ok: false };
      const h = this.hand[handIdx];
      this.hand[handIdx] = this.tsumo[tsumoIdx];
      this.tsumo[tsumoIdx] = h;
      this.hand = sortCodes(this.hand);
      this.tsumo = sortCodes(this.tsumo);
      return { ok: true };
    }
    // ---- ★D24 鳴き（ポン/チー） ----------------------------------------------
    // ツモの1枚＋手牌の2枚で刻子/順子が完成するとき宣言できる。
    // メリット: 宣言後に1枚捨てると、ツモプールが無料で全リフレッシュ（=ツモ回数の前借り）。
    // デメリット: 門前でなくなる（門前ツモ/平和/七対子/一盃口/二盃口/四暗刻/九蓮が消え、喰い下がりも適用）。
    callOptions() {
      if (this.phase !== "round" || this.mustDiscard) return [];
      if (this.melds.length >= 4) return [];
      const opts = [];
      const handCount = {};
      for (const c of this.hand) handCount[c] = (handCount[c] || 0) + 1;
      const seen = new Set();
      for (let j = 0; j < this.tsumo.length; j++) {
        const c = this.tsumo[j];
        if (seen.has(c)) continue; // 同一牌の重複オプションは1つで良い
        seen.add(c);
        const t = MJHand.codeToIndex(c);
        // ポン: 手牌に同じ牌が2枚
        if ((handCount[c] || 0) >= 2) {
          opts.push({ tsumoIdx: j, type: "pon", meldTile: t, use: [c, c], label: "ポン " + MJHand.tileLabel(t) });
        }
        // チー: 数牌のみ。(t-2,t-1) (t-1,t+1) (t+1,t+2) の3パターン
        if (t < 27) {
          const r = t % 9, base = t - r;
          const pats = [[r - 2, r - 1], [r - 1, r + 1], [r + 1, r + 2]];
          for (const [a, b] of pats) {
            if (a < 0 || b > 8) continue;
            const ca = MJHand.indexToCode(base + a), cb = MJHand.indexToCode(base + b);
            if ((handCount[ca] || 0) >= 1 && (handCount[cb] || 0) >= 1) {
              const low = Math.min(t, base + a, base + b);
              opts.push({ tsumoIdx: j, type: "chi", meldTile: low, use: [ca, cb], label: "チー " + MJHand.tileLabel(low) + "-" + MJHand.tileLabel(low + 1) + "-" + MJHand.tileLabel(low + 2) });
            }
          }
        }
      }
      return opts;
    }
    call(opt) {
      if (this.phase !== "round" || this.mustDiscard) return { ok: false };
      if (!opt || opt.tsumoIdx == null || opt.tsumoIdx >= this.tsumo.length) return { ok: false };
      // 手牌から使用する2枚を除去
      for (const u of opt.use) {
        const i = this.hand.indexOf(u);
        if (i < 0) return { ok: false, message: "手牌に必要な牌がありません" };
        this.hand.splice(i, 1);
      }
      this.tsumo.splice(opt.tsumoIdx, 1); // 鳴いた牌をプールから取得
      this.melds.push({ t: opt.type === "pon" ? "trip" : "seq", i: opt.meldTile, open: true });
      this.mustDiscard = true; // 1枚捨てるまで他の操作は不可
      this.koban += yokaiFlag(this.yokai, "kobanOnCall", "sum"); // ★D31 山彦
      return { ok: true, label: opt.label };
    }
    // 鳴き後の1枚捨て → ツモプールを無料で全リフレッシュ（テンポの前借り）
    discardForCall(handIdx) {
      if (this.phase !== "round" || !this.mustDiscard) return { ok: false };
      if (handIdx < 0 || handIdx >= this.hand.length) return { ok: false };
      this.discardPile.push(this.hand.splice(handIdx, 1)[0]);
      this.hand = sortCodes(this.hand);
      for (const c of this.tsumo) this.discardPile.push(c);
      this.tsumo = sortCodes(this._drawN(this._tsumoCount()));
      this.mustDiscard = false;
      return { ok: true };
    }
    // 手牌の待ち（テンパイ表示用）index配列。★D24: 鳴き後(13-3n枚)にも対応
    handWaits() {
      if (this.hand.length !== this.expectedConcealed || this.mustDiscard) return [];
      return MJHand.waits(MJHand.handToCounts(this.hand), this.melds.length);
    }
    // ★D1: テンパイ時、待ち牌ごとに「アガった場合の点数・翻・限度名」をプレビュー
    // 返り値: [{tile, count, score, han, fu, limit}]（countは山残り枚数、千里眼所持なら捨て山込み）
    waitPreviews() {
      const waits = this.handWaits();
      if (!waits.length) return [];
      const wc = this.waitCounts();
      const st = this._scoreState();
      return waits.map((t) => {
        const r = computeAgari(this.hand.concat([MJHand.indexToCode(t)]), st);
        if (!r.agari) return { tile: t, count: wc[t], yakuless: true }; // 鳴いた手の役なし形
        return { tile: t, count: wc[t], score: r.score, han: r.han, fu: r.fu, limit: r.limit };
      });
    }
    // ツモのいずれかで手牌側が完成するか（＋最高得点）。鳴き後は13-3n枚+1
    agariInfo() {
      if (this.hand.length !== this.expectedConcealed || this.mustDiscard) return { agari: false };
      let best = null, wtile = null;
      for (const t of this.tsumo) {
        const r = computeAgari(this.hand.concat([t]), this._scoreState());
        if (r.agari && (!best || r.score > best.score)) { best = r; wtile = t; }
      }
      if (!best) return { agari: false };
      return Object.assign({ winTile: wtile }, best);
    }
    // ★D34 手牌+ツモを自由に組み替えれば（役ありで）アガれる可能性が残っているか。
    // 交換は無料なので「現在の並び」ではなく18枚(手牌+ツモ)から必要な14枚を選べるかで判定する。
    // ツモ切れ時はこの判定で「アガリ確定不能」を確認してからゲームオーバーにする。
    _winReachable() {
      if (this.mustDiscard) return false;
      const combined = this.hand.concat(this.tsumo);
      const need = this.expectedConcealed + 1; // 和了に使う暗黙部分の枚数（＝手牌+アガリ牌）
      if (combined.length < need) return false;
      const st = this._scoreState();
      const seen = new Set();
      let found = false;
      const pick = (start, chosen) => {
        if (found) return;
        if (chosen.length === need) {
          const tiles = chosen.map((i) => combined[i]);
          const sig = tiles.slice().sort().join(",");
          if (seen.has(sig)) return;
          seen.add(sig);
          if (computeAgari(tiles, st).agari) found = true;
          return;
        }
        // 残り本数が足りる範囲だけ探索（早期枝刈り）
        for (let i = start; i <= combined.length - (need - chosen.length) && !found; i++) {
          chosen.push(i); pick(i + 1, chosen); chosen.pop();
        }
      };
      pick(0, []);
      return found;
    }
    // ★D34 手牌+ツモから最高得点の和了形を見つけ、その形に整列する（手牌13＋アガリ牌をツモ先頭へ）。
    // 「最後のツモ」で組み替えれば和了できる時の確定アガリ用。存在しなければ何もしない。
    arrangeWin() {
      if (this.mustDiscard || this.phase !== "round") return { ok: false };
      const combined = this.hand.concat(this.tsumo);
      const need = this.expectedConcealed + 1;
      if (combined.length < need) return { ok: false };
      const st = this._scoreState();
      const seen = new Set();
      let best = null; // { tiles(need枚), winIdxInTiles, score }
      const evalSubset = (tiles) => {
        const sig = tiles.slice().sort().join(",");
        if (seen.has(sig)) return;
        seen.add(sig);
        // 各牌を「アガリ牌（末尾）」候補として最高得点を探す
        const uniq = [...new Set(tiles)];
        for (const w of uniq) {
          const rest = tiles.slice(); rest.splice(rest.indexOf(w), 1);
          const r = computeAgari(rest.concat([w]), st);
          if (r.agari && (!best || r.score > best.score)) best = { concealed: rest, win: w, score: r.score };
        }
      };
      const pick = (start, chosen) => {
        if (chosen.length === need) { evalSubset(chosen.map((i) => combined[i])); return; }
        for (let i = start; i <= combined.length - (need - chosen.length); i++) { chosen.push(i); pick(i + 1, chosen); chosen.pop(); }
      };
      pick(0, []);
      if (!best) return { ok: false };
      // combined の残り（未使用）を算出してツモに回す
      const used = best.concealed.concat([best.win]);
      const leftovers = combined.slice();
      for (const t of used) leftovers.splice(leftovers.indexOf(t), 1);
      this.hand = sortCodes(best.concealed);
      this.tsumo = sortCodes([best.win].concat(leftovers));
      return { ok: true, score: best.score };
    }
    // ツモ5枚を捨てて新たに5枚引く（＝1手＝資源）
    drawTsumo() {
      if (this.phase !== "round") return { ok: false };
      if (this.drawsLeft <= 0) {
        // ★D34 ツモ切れ。まだ手牌+ツモを組み替えてアガれるならゲームオーバーにせず、組み替えを促す。
        if (this._winReachable()) return { ok: false, lastChance: true, message: "最後のツモです。手牌とツモを組み替えてアガリを狙えます" };
        const out = { ok: false, message: "ツモ回数がありません" }; this._handleDrawsOut(out); return out;
      }
      for (const c of this.tsumo) this.discardPile.push(c);
      const drawn = this._drawN(this._tsumoCount());
      // ★D32 件: 役満テンパイ中は「役満になる待ち牌」を確定で混ぜる（1ラウンド1回・見上げ入道より優先）
      if (this.kudanLeft > 0) {
        const st = this._scoreState();
        const ykWaits = this.handWaits().filter((t) => {
          const r = computeAgari(this.hand.concat([MJHand.indexToCode(t)]), st);
          return r.agari && (r.yakumanCount >= 1 || r.han >= 13);
        });
        if (ykWaits.length && !drawn.some((c) => ykWaits.includes(MJHand.codeToIndex(c)))) {
          const wi = this.wall.findIndex((c) => ykWaits.includes(MJHand.codeToIndex(c)));
          if (wi >= 0) {
            const wtile = this.wall.splice(wi, 1)[0];
            this.discardPile.push(drawn.pop());
            drawn.push(wtile);
            this.kudanLeft--;
          }
        }
      }
      // 見上げ入道: テンパイ中は待ち牌を1枚確定で混ぜる（1ラウンド回数制限）
      if (this.guaranteedLeft > 0) {
        const waits = this.handWaits();
        if (waits.length && !drawn.some((c) => waits.includes(MJHand.codeToIndex(c)))) {
          const wi = this.wall.findIndex((c) => waits.includes(MJHand.codeToIndex(c)));
          if (wi >= 0) {
            const wtile = this.wall.splice(wi, 1)[0];
            this.discardPile.push(drawn.pop());
            drawn.push(wtile);
            this.guaranteedLeft--;
          }
        }
      }
      this.tsumo = sortCodes(drawn);
      this.koban += yokaiFlag(this.yokai, "kobanOnDraw", "sum"); // 雨降小僧
      this.drawsLeft--;
      const out = { ok: true };
      if (this.drawsLeft <= 0 && !this._winReachable()) this._handleDrawsOut(out);
      return out;
    }
    _handleDrawsOut(out) {
      // ツモ切れ。まず妖怪(ぬりかべ=lossNegate)、次に消耗品(身代わり札=migawari)の順で救済し、
      // どちらも無ければ敗北(★A2/§4・§7: 救済ロジックは共通化・消費順=妖怪→アイテム)。
      const negate = yokaiFlag(this.yokai, "lossNegate", "sum");
      const migawariIdx = this.items.indexOf("migawari");
      if (this.lossNegateUsed < negate) {
        this.lossNegateUsed++;
        this.drawsLeft = Math.max(this.drawsLeft, 3);
        out.lossNegated = true;
      } else if (migawariIdx >= 0) {
        this.items.splice(migawariIdx, 1);
        this.drawsLeft = Math.max(this.drawsLeft, 3);
        out.itemSaved = true;
      } else {
        this.phase = "lost";
        out.gameOver = true;
      }
    }
    declareAgari() {
      if (this.phase !== "round") return { ok: false };
      const info = this.agariInfo();
      if (!info.agari) return { ok: false, message: "まだアガリの形ではありません（手牌13枚をテンパイに）" };
      // ★A1 v3 千日手(sennichite)用: 常時役(門前清自摸和)を除いたアガリ役を記憶する。
      this.lastAgariYaku = info.yaku.map((y) => y.name).filter((n) => n !== "門前清自摸和");
      this.roundScore += info.score;
      this.agariThisRound++;
      this.totalAgari++;
      this.koban += yokaiFlag(this.yokai, "kobanOnAgari", "sum");
      // ★A2 絵馬(ema): アガリ成立で予約していた翻ボーナスを消費(0へリセット)。
      this.pendingHanBonus = 0;
      const out = { ok: true, agari: true, score: info.score, han: info.han, fu: info.fu, limit: info.limit, yakumanCount: info.yakumanCount, yaku: info.yaku, log: info.log, winTile: info.winTile };
      if (this.roundScore >= this.effectiveTarget()) {
        this._finishRoundWin(out);
      } else {
        this.dealNewHand(); // 新しい手牌13＋ツモ5で続行
        if (this.drawsLeft <= 0 && !this._winReachable()) this._handleDrawsOut(out);
      }
      return out;
    }
    _finishRoundWin(out) {
      this.roundsCleared++;
      const interestRaw = Math.min(5, Math.floor(this.koban / 5));
      const rmult = Math.max(1, yokaiFlag(this.yokai, "rewardMult", "sum")); // 金霊
      // ★A1 v3 吝嗇(kechi): このボス戦のクリア報酬・利子(表示)を半減（切り上げ）。破魔矢で無効化されていれば通常通り。
      const isKechi = this.effectiveGimmick() === "kechi";
      // ★D25: 残ツモの小判ボーナスは廃止（残ツモの持ち越し自体が速アガリの報酬）
      let reward = (3 + interestRaw) * rmult;
      if (isKechi) reward = Math.ceil(reward / 2);
      const interest = isKechi ? Math.ceil(interestRaw / 2) : interestRaw;
      this.koban += reward;
      out.roundCleared = true;
      out.reward = { total: reward, interest };
      if (this.isLastCampaignStage()) { this.phase = "won"; out.runWon = true; } // キャンペーン制覇
      else {
        // ★D38 ステージクリアの「間」: 即ショップではなく clear フェーズを1枚挟む
        // （撃破→報酬確認→市へ、というフロー。状態機械の変更なのでUnityにも移植される）
        const r = this.currentRound();
        this.clearInfo = { enemyName: r.name, boss: !!r.boss, reward, interest };
        // ★A2 ボスドロップ(§6): ボス撃破時のみ、消耗品プールから重複なしランダム2種を提示(chooseDropで1つ取得)。
        if (r.boss) {
          const remaining = ITEM_IDS.slice();
          const picks = [];
          for (let k = 0; k < 2 && remaining.length; k++) {
            const ri = Math.floor(this.rng() * remaining.length);
            picks.push(remaining.splice(ri, 1)[0]);
          }
          this.clearInfo.drops = picks;
        }
        // ★A1 v3 事前告知(§10-4): 次ラウンドがボス+gimmickありなら開示する。
        const nr = roundDefFor(this.roundIndex + 1);
        if (nr.boss && nr.gimmick) {
          this.clearInfo.nextBoss = { name: nr.name, gimmick: nr.gimmick, gimmickName: BOSS_GIMMICKS[nr.gimmick].name, gimmickDesc: BOSS_GIMMICKS[nr.gimmick].desc };
        }
        this.phase = "clear";
        out.cleared = true;
      }
    }
    // ★A2 ボスドロップの選択(idx=clearInfo.drops内のindex)。満杯ならfull:trueを返し取得しない(UI側で入替/破棄へ)。
    // 「取らない」選択はUI側でこのメソッドを呼ばないだけで良い(clearInfo.dropsはそのまま残す)。
    chooseDrop(idx) {
      if (this.phase !== "clear" || !this.clearInfo || !this.clearInfo.drops) return { ok: false };
      if (idx < 0 || idx >= this.clearInfo.drops.length) return { ok: false };
      const id = this.clearInfo.drops[idx];
      if (this.items.length >= this.itemSlots) return { ok: false, full: true, id };
      this.items.push(id);
      this.clearInfo.drops = null; // 選択済み(取り直し不可)
      return { ok: true, gained: id };
    }

    // ---- ショップ -----------------------------------------------------------
    enterShop() { this.phase = "shop"; this.freeRerollsUsed = 0; this.rollShop(); }
    // レア度が高いほど出現しにくい重み付き抽選（★=10 / ★★=4 / ★★★=1）。重複無しでn体選ぶ（未指定はshopYokaiCount）。
    _weightedYokaiPool(pool, count) {
      const W = { 1: 10, 2: 4, 3: 1 };
      const remaining = pool.map((id) => ({ id, w: W[YOKAI[id].rarity] || 1 }));
      const picked = [];
      const n = Math.min(count == null ? this.shopYokaiCount : count, remaining.length);
      for (let k = 0; k < n; k++) {
        const total = remaining.reduce((a, x) => a + x.w, 0);
        let r = this.rng() * total;
        let idx = 0;
        for (; idx < remaining.length; idx++) { r -= remaining[idx].w; if (r <= 0) break; }
        if (idx >= remaining.length) idx = remaining.length - 1;
        picked.push(remaining[idx].id);
        remaining.splice(idx, 1);
      }
      return picked;
    }
    // ★D30: 解放妖怪の出現条件 = 図鑑で解放済み かつ 次のステージ番号 >= minStage
    // （ショップ中の roundIndex は「今クリアしたステージ」なので、次ステージ番号 = roundIndex + 2）
    _yokaiAvailable(id) {
      const u = YOKAI[id].unlock;
      if (!u) return true; // 基本妖怪は常時
      const unlocked = ((this.meta && this.meta.unlockedYokai) || []).includes(id);
      return unlocked && (this.roundIndex + 2) >= u.minStage;
    }
    // ★A2: 消耗品も妖怪と同じレア度重み付け（★=10/★★=4/★★★=1）でn種オファー(重複無し)。
    _weightedItemPool(pool, n) {
      const W = { 1: 10, 2: 4, 3: 1 };
      const remaining = pool.map((id) => ({ id, w: W[ITEMS[id].rarity] || 1 }));
      const picked = [];
      const k = Math.min(n, remaining.length);
      for (let i = 0; i < k; i++) {
        const total = remaining.reduce((a, x) => a + x.w, 0);
        let r = this.rng() * total;
        let idx = 0;
        for (; idx < remaining.length; idx++) { r -= remaining[idx].w; if (r <= 0) break; }
        if (idx >= remaining.length) idx = remaining.length - 1;
        picked.push(remaining[idx].id);
        remaining.splice(idx, 1);
      }
      return picked;
    }
    rollShop() {
      // ★D48: 上枠(shopYokaiCount)を妖怪と消耗品で「同じ枠から」混在配分する。
      // 各枠は独立に確率ITEM_RATEで消耗品、それ以外は妖怪。表示順もスロット順(order)で混ぜる。
      // 妖怪が主役のため「最低1枠は妖怪」を保証（消耗品はtotal-1まで）。
      const ITEM_RATE = 0.30;
      const total = this.shopYokaiCount;
      let itemN = 0;
      for (let k = 0; k < total; k++) if (this.rng() < ITEM_RATE) itemN++;
      itemN = Math.min(itemN, total - 1); // 最低1枠は妖怪を残す
      const ypool = YOKAI_IDS.filter((id) => !this.yokai.includes(id) && this._yokaiAvailable(id));
      const yokaiOffers = this._weightedYokaiPool(ypool, Math.min(total - itemN, ypool.length));
      itemN = total - yokaiOffers.length; // 妖怪プール枯渇時は消耗品で埋める
      const itemOffers = this._weightedItemPool(ITEM_IDS.slice(), Math.min(itemN, ITEM_IDS.length));
      // スロット順に妖怪/消耗品を混ぜた表示順（決定的rng）
      const order = [];
      const yq = yokaiOffers.slice(), iq = itemOffers.slice();
      while (yq.length || iq.length) {
        const takeItem = iq.length && (!yq.length || this.rng() < iq.length / (iq.length + yq.length));
        order.push(takeItem ? { kind: "item", id: iq.shift() } : { kind: "yokai", id: yq.shift() });
      }
      // ★D25: ツモ回復アイテム。お茶(+3)は常設(値上がり式)、甘露(全回復)は25%で出現。
      const hasKanro = this.rng() < 0.25;
      // ★D29: 風呂敷(妖怪枠+1)は30%で入荷。枠が上限(10)なら並ばない。
      const hasFuroshiki = this.rng() < 0.30 && this.yokaiSlots < 10;
      this.shop = { yokai: yokaiOffers, items: itemOffers.map((id) => ({ id, price: ITEMS[id].price })), order, tea: true, kanro: hasKanro, kanroPrice: 10, furoshiki: hasFuroshiki };
    }
    reroll() {
      if (this.phase !== "shop") return { ok: false };
      // 提灯お化け: 1回のショップ訪問につき指定回数まで無料（無限リロールで狙い撃ちできないよう上限あり）
      const freeLimit = yokaiFlag(this.yokai, "freeRerollLimit", "sum");
      const freeAvailable = (this.freeRerollsUsed || 0) < freeLimit;
      const cost = freeAvailable ? 0 : 1;
      if (this.koban < cost) return { ok: false, message: "小判が足りません" };
      this.koban -= cost;
      if (freeAvailable) this.freeRerollsUsed = (this.freeRerollsUsed || 0) + 1;
      this.rollShop(); return { ok: true };
    }
    buyYokai(id) {
      if (this.phase !== "shop" || !this.shop.yokai.includes(id)) return { ok: false, message: "在庫にありません" };
      if (this.yokai.length >= this.yokaiSlots) return { ok: false, message: "妖怪枠がいっぱいです（入れ替えできます）", slotsFull: true };
      const price = this.yokaiPrice(id);
      if (this.koban < price) return { ok: false, message: "小判が足りません" };
      this.koban -= price; this.yokai.push(id);
      this.shop.yokai = this.shop.yokai.filter((x) => x !== id);
      return { ok: true };
    }
    // 妖怪枠が埋まっている時、所持妖怪1体を手放して新しい妖怪と入れ替える
    swapYokai(releaseId, newId) {
      if (this.phase !== "shop" || !this.shop.yokai.includes(newId)) return { ok: false, message: "在庫にありません" };
      if (!this.yokai.includes(releaseId)) return { ok: false, message: "所持していません" };
      const price = this.yokaiPrice(newId);
      if (this.koban < price) return { ok: false, message: "小判が足りません" };
      this.koban -= price;
      this.yokai = this.yokai.filter((x) => x !== releaseId);
      this.yokai.push(newId);
      this.shop.yokai = this.shop.yokai.filter((x) => x !== newId);
      return { ok: true, released: releaseId, gained: newId };
    }

    // ---- ★A2 消耗品アイテム ---------------------------------------------------
    // 購入。満杯時は{ok:false, full:true}を返し購入せず、UI側で入替/破棄フローへ(§2)。
    buyItem(id) {
      if (this.phase !== "shop" || !this.shop.items || !this.shop.items.some((x) => x.id === id)) return { ok: false, message: "在庫にありません" };
      if (this.items.length >= this.itemSlots) return { ok: false, full: true, message: "アイテム枠がいっぱいです（入れ替えできます）" };
      const price = ITEMS[id].price;
      if (this.koban < price) return { ok: false, message: "小判が足りません" };
      this.koban -= price;
      this.items.push(id);
      this.shop.items = this.shop.items.filter((x) => x.id !== id);
      return { ok: true };
    }
    // アイテム枠の破棄（入替UIの「その場で破棄」導線用）。
    discardItem(idx) {
      if (idx < 0 || idx >= this.items.length) return { ok: false };
      const released = this.items.splice(idx, 1)[0];
      return { ok: true, released };
    }
    // アイテム枠が埋まっている時の入れ替え。ショップ在庫のnewIdなら購入(価格消費+在庫から除去)を伴い、
    // それ以外(ボスドロップ等・phase!=="shop"や在庫に無いid)は無償の差し替えとして扱う。
    swapItem(idx, newId) {
      if (idx < 0 || idx >= this.items.length) return { ok: false, message: "対象がありません" };
      const inShop = this.phase === "shop" && this.shop && this.shop.items && this.shop.items.some((x) => x.id === newId);
      if (inShop) {
        const price = ITEMS[newId].price;
        if (this.koban < price) return { ok: false, message: "小判が足りません" };
        this.koban -= price;
        this.shop.items = this.shop.items.filter((x) => x.id !== newId);
      }
      const released = this.items[idx];
      this.items[idx] = newId;
      return { ok: true, released, gained: newId };
    }
    // 使用。usable(§3)がラウンド中の項目はround以外で不可・ショップ限定はshop以外で不可。
    // migawariは自動発動専用でuseItemからは使用不可(§4)。
    useItem(idx, arg) {
      if (idx < 0 || idx >= this.items.length) return { ok: false };
      const id = this.items[idx];
      const def = ITEMS[id];
      if (!def || def.usable === "auto") return { ok: false, message: "今は使えません" };
      switch (id) {
        case "shinzuu": {
          // 神通力の札: 手牌1枚を選んだ牌へ変換(2段階UI＝アイテム→手牌牌→変換先牌)。
          if (this.phase !== "round" || this.mustDiscard) return { ok: false, message: "今は使えません" };
          const a = arg || {};
          if (a.handIdx == null || a.handIdx < 0 || a.handIdx >= this.hand.length || !a.toCode) return { ok: false, message: "対象を指定してください" };
          this.hand[a.handIdx] = a.toCode;
          this.hand = sortCodes(this.hand);
          break;
        }
        case "habauchiwa": {
          // 天狗の羽団扇: 手牌＋ツモを引き直す(redealHandと同ロジックだがツモ回数・引き直し回数どちらも消費しない)。
          if (this.phase !== "round") return { ok: false, message: "今は使えません" };
          for (const c of this.hand) this.discardPile.push(c);
          for (const c of this.tsumo) this.discardPile.push(c);
          this.dealNewHand(true); // 晒した面子はそのまま
          break;
        }
        case "ema": {
          // 絵馬: 次のアガリの翻+2を予約(複数回使えば加算)。
          if (this.phase !== "round") return { ok: false, message: "今は使えません" };
          this.pendingHanBonus = (this.pendingHanBonus || 0) + 2;
          break;
        }
        case "hamaya": {
          // 破魔矢: このボス戦のギミックを無効化。ギミック無し/非ボスでは使用不可。
          if (this.phase !== "round" || !this.currentRound().boss || !this.currentRound().gimmick) return { ok: false, message: "今は使えません" };
          this.gimmickNegated = true;
          break;
        }
        case "juzu": {
          // 数珠: このボス戦の目標点-20%。ボス戦のみ使用可。
          if (this.phase !== "round" || !this.currentRound().boss) return { ok: false, message: "今は使えません" };
          this.targetReduced = true;
          break;
        }
        case "kozuchi": {
          // 打ち出の小槌: 小判+10(即時・anytime)。
          this.koban += 10;
          break;
        }
        case "yobimizu": {
          // 呼び水: ショップを1回無料リロール(shop中のみ)。
          if (this.phase !== "shop") return { ok: false, message: "今は使えません" };
          this.rollShop();
          break;
        }
        default:
          return { ok: false };
      }
      this.items.splice(idx, 1);
      return { ok: true };
    }
    // ★D25: お茶＝ツモ+3の即時回復（上限=開始値）。価格はラン中に購入毎+1で上昇し続ける
    buyTea() {
      if (this.phase !== "shop" || !this.shop.tea) return { ok: false };
      if (this.koban < this.teaPrice) return { ok: false, message: "小判が足りません" };
      if (this.drawsLeft >= this.startDraws) return { ok: false, message: "ツモは満タンです" };
      this.koban -= this.teaPrice;
      this.teaPrice += 1;
      this.drawsLeft = Math.min(this.startDraws, this.drawsLeft + 3);
      return { ok: true };
    }
    // 甘露＝ツモ全回復（低確率出現）
    buyKanro() {
      if (this.phase !== "shop" || !this.shop.kanro) return { ok: false };
      if (this.koban < this.shop.kanroPrice) return { ok: false, message: "小判が足りません" };
      if (this.drawsLeft >= this.startDraws) return { ok: false, message: "ツモは満タンです" };
      this.koban -= this.shop.kanroPrice;
      this.drawsLeft = this.startDraws;
      this.shop.kanro = false; // 1回限り
      return { ok: true };
    }
    // ★D29: 風呂敷＝妖怪枠+1の消費アイテム（旧・妖怪「風呂敷お化け」は自身が枠を使い実質±0だったため転換）
    buyFuroshiki() {
      if (this.phase !== "shop" || !this.shop.furoshiki) return { ok: false };
      if (this.yokaiSlots >= 10) return { ok: false, message: "妖怪枠は上限です" };
      if (this.koban < this.furoshikiPrice) return { ok: false, message: "小判が足りません" };
      this.koban -= this.furoshikiPrice;
      this.furoshikiPrice += 4;
      this.extraSlots += 1;
      this.shop.furoshiki = false; // 1訪問1回
      return { ok: true };
    }
    // ステージ間のツモ回復量: 基礎3 + 粘り(メタ)/Lv + 雪女+2。直前がボスなら+3のマイルストーン回復。
    stageRecovery(clearedWasBoss) {
      return 3 + this.metaLvl("nebari") + yokaiFlag(this.yokai, "recovery", "sum") + (clearedWasBoss ? 3 : 0);
    }
    leaveShop() {
      if (this.phase !== "shop") return { ok: false };
      const clearedWasBoss = !!roundDefFor(this.roundIndex).boss; // いま倒したステージ
      this.roundIndex++;
      // ★D25: ツモは持ち越し＋一定回復のみ（上限=開始値）。ここがラン全体の消耗経済の心臓部。
      this.drawsLeft = Math.min(this.startDraws, this.drawsLeft + this.stageRecovery(clearedWasBoss));
      this.startRound();
      return { ok: true };
    }
    medalsEarned() {
      let m = this.roundsCleared;
      for (let i = 0; i < this.roundsCleared; i++) if (roundDefFor(i).boss) m += 2;
      if (this.phase === "won") m += 5;
      return m;
    }
  }

  return {
    YOKAI, YOKAI_IDS, SUITS, META_UPGRADES, META_IDS, metaNextCost,
    BOSS_GIMMICKS, ENDLESS_POOL, endlessGimmickFor,
    ITEMS, ITEM_IDS,
    tileLabelCode, computeAgari, makeStartingDeck, makeRounds, roundDefFor, shuffle, Game,
    CAMPAIGN_LENGTH: CAMPAIGN_ROUNDS.length,
    Hand: MJHand,
  };
});
