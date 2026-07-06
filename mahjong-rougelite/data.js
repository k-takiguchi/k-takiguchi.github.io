/*
 * ゆるかわ百鬼夜行 — コンテンツデータ（D78: コンテンツテーブルのデータ分離/JSON化）
 * 仕様: ../design/data-json-spec.md（唯一の正）
 * 本ファイルは JSON.parse(JSON.stringify(MJ_DATA)) で完全往復できる純データのみを持つ
 * （関数・undefined値は禁止）。engine.js から機械的に移設（値・順序・フィールドは不変）。
 * ブラウザ（file://含む）と Node の両方から読み込める（index.htmlの読み込み順: data.js → hand.js → engine.js → ui.js）。
 */
(function (global) {
  "use strict";

  // ---- 妖怪（v0.2: 翻/基礎点/倍率に効く） -----------------------------------
  // hooks: hanAdd(ctx) 加算翻 / baseAdd(ctx) 基礎点加算 / baseTimes:係数 / multTimes:係数
  // flags: 進行系(小判/巡目/敗北無効/リロール/先読み)
  const yokai = {
    rokurokubi:   { name: "ろくろ首", face: "🦒", rarity: 1, price: 5, desc: "順子3つ以上のアガリで +1翻", lore: "首がするすると伸びる女の妖怪。きれいに並んだ手（順子）がお気に入り。" }, // ★D64 4→5小判(D56実測+0.72で★1最強。レア度は据え置き=「低レアの当たり枠」としてユーザー判断)
    tofukozo:     { name: "豆腐小僧", face: "🍮", rarity: 1, price: 4, desc: "白を含むアガリで 符+10", lore: "雨の夜、豆腐を載せた盆を持って現れる小さな妖怪。白いものに目がない。" },
    ittanmomen:   { name: "一反木綿", face: "🧻", rarity: 2, price: 6, desc: "一気通貫か三色を含むと +1翻", lore: "夜空をひらひらと飛ぶ布の妖怪。牌がまっすぐ並ぶと嬉しくなる。" },
    zashikiwarashi:{ name: "座敷童", face: "🧒", rarity: 1, price: 4, desc: "アガるたび 小判+2", lore: "住み着いた家に福を呼ぶ子どもの精。アガるたびに小判を運んでくる。", flags: { kobanOnAgari: 2 } }, // ★D54 +1→+2(雨降小僧との格差是正)
    kappa:        { name: "河童", face: "🐢", rarity: 1, price: 4, desc: "索子1枚につき 符+2", lore: "川に棲む皿頭の妖怪。竹（索子）の匂いがすると寄ってくる。" },
    tengu:        { name: "天狗", face: "👺", rarity: 2, price: 6, desc: "混一色/清一色で +2翻", lore: "山の奥に住まう鼻高の大妖。ひと色に染まった手を好む。" },
    yukionna:     { name: "雪女", face: "⛄", rarity: 2, price: 6, desc: "ステージ間のツモ回復 +2", lore: "雪の夜に現れる氷の美女。その冷気が旅の疲れを癒やす。", flags: { recovery: 2 } },
    bakedanuki:   { name: "化け狸", face: "🦝", rarity: 3, price: 8, desc: "アガリの翻を最低2翻に", lore: "化かし上手の狸。しょぼい手も、それなりに見せてしまう。" },
    kitsunebi:    { name: "狐火", face: "🦊", rarity: 3, price: 8, desc: "断么九のアガリで 点数×1.5", lore: "狐の吐息が灯る青い火。真ん中の牌だけの手を照らして輝かせる。" }, // ★D54で玉藻前と効果交換→D55: 5翻条件はSt8まで「5翻=目標8000到達済み」で過剰＝購入動機が無限専用というFBにより断么九条件へ再改定
    nurikabe:     { name: "ぬりかべ", face: "🧱", rarity: 2, price: 6, desc: "挑戦1回につき1度、敗北を無効化(ツモ回復)", lore: "夜道を塞ぐ大きな壁。一度だけ、倒れるあなたを受け止めてくれる。", flags: { lossNegate: 1 } },
    chochin:      { name: "提灯お化け", face: "🏮", rarity: 1, price: 4, desc: "市の無料引き直し +3回/訪問", lore: "破れ提灯から舌を出す妖怪。市の店先を照らして品を替えさせる。", flags: { freeRerollLimit: 3 } },
    mitsumekozo:  { name: "三つ目小僧", face: "👁️", rarity: 1, price: 4, desc: "次のツモを先読み", lore: "額に第三の目を持つ小僧。三つ目の目は、少しだけ先が見える。", flags: { peek: 3 } },
    azukiarai:    { name: "小豆洗い", face: "🫘", rarity: 1, price: 4, desc: "七対子で +2翻", lore: "川辺でしゃきしゃきと小豆を研ぐ音の主。対子を揃えるのが得意。" },
    kamaitachi:   { name: "鎌鼬", face: "🌪️", rarity: 2, price: 6, desc: "このステージのアガリ数×300点 を加点", lore: "つむじ風に乗る鼬の三兄弟。続けて斬るほど切れ味が増す。" },
    nurarihyon:   { name: "ぬらりひょん", face: "👴", rarity: 3, price: 8, desc: "アガるたび +200点(挑戦中累積)", lore: "いつの間にか家の上座に座っている妖怪の総大将。長い夜ほど、その貫禄が効いてくる。" },
    bakeneko:     { name: "化け猫", face: "🐈‍⬛", rarity: 3, price: 8, desc: "刻子3つ以上のアガリで +2翻", lore: "年を経て化ける力を得た猫。同じ牌を集めて丸くなる。" },
    karakasa:     { name: "唐傘小僧", face: "☂️", rarity: 1, price: 4, desc: "翻が奇数なら +1翻", lore: "一本足でけんけんする傘の妖怪。奇数の翻がお気に入り。" },
    fukunokami:   { name: "福の神", face: "🧧", rarity: 2, price: 6, desc: "所持小判10ごとに +500点", lore: "蓄える者に微笑む神さま。小判を貯めるほど点が伸びる。" },
    raiju:        { name: "雷獣", face: "⚡", rarity: 2, price: 6, desc: "三元牌の刻子で 点数×2", lore: "雷とともに天から落ちてくる獣。三元牌に雷を落とす。" },
    daidarabocchi:{ name: "だいだらぼっち", face: "🗻", rarity: 3, price: 8, desc: "全てのアガリで 符+20", lore: "山を作り湖を掘った大巨人。どんな手も一回り大きくしてくれる。" },
    // ---- サポート/ユーティリティ系（三つ目小僧の仲間） ----
    hyakume:      { name: "百目", face: "👀", rarity: 2, price: 7, desc: "ツモが6枚になる（毎回1枚多く選べる）", lore: "全身が目でできた妖怪。人より一枚多く見える。", flags: { tsumoSize: 1 } },
    amefurikozo:  { name: "雨降小僧", face: "☔", rarity: 1, price: 4, desc: "ツモを2回引くごとに 小判+1", lore: "雨師さまにお供する小僧。雨が降るたび、小銭が落ちている。", flags: { kobanPer2Draws: 1 } }, // ★D54 毎回+1はラン全体+40相当で他の経済★1を圧倒→半減
    wanyudo:      { name: "輪入道", face: "🎡", rarity: 2, price: 6, desc: "市の妖怪が2小判引き", lore: "燃える車輪に浮かぶ大首。市までの運び賃をまけてくれる。", flags: { shopDiscount: 2 } },
    sunekosuri:   { name: "すねこすり", face: "🐕", rarity: 1, price: 5, desc: "各ラウンド1回 手牌を引き直せる", lore: "雨の夜、足元にじゃれつく犬の妖怪。手の仕切り直しに付き合ってくれる。", flags: { mulligan: 1 } },
    tenome:       { name: "手の目", face: "✋", rarity: 1, price: 5, desc: "手が進むツモ牌を光らせる", lore: "手のひらに目を持つ座頭の妖怪。良い牌をそっと撫でて教えてくれる。", flags: { highlight: true } },
    miagenyudo:   { name: "見上げ入道", face: "👹", rarity: 3, price: 8, desc: "各ラウンド1回 テンパイ中のツモに待ち牌を確定で1枚混ぜる", lore: "見上げるほど大きくなる入道。欲しい牌を、高みから見つけてくる。", flags: { guaranteedDraw: 1 } },
    teruterubozu: { name: "てるてる坊主", face: "☀️", rarity: 2, price: 6, desc: "アガリ時 残りツモ回数×200点（速いほど得）", lore: "晴れを呼ぶ白い坊主。早くアガった夜の空は、よく晴れる。" },
    bakezouri:    { name: "化け草鞋", face: "👡", rarity: 1, price: 5, desc: "各ラウンド2回 ツモだけ無料で引き直せる", lore: "捨てられた草鞋に宿った妖怪。すり減るまで駆け直してくれる。", flags: { freeTsumoReroll: 2 } },
    kanadama:     { name: "金霊", face: "💴", rarity: 2, price: 6, desc: "ラウンドクリアの小判報酬 ×2", lore: "金運そのものが形になった精。ステージの報酬を倍にして返す。", flags: { rewardMult: 2 } },
    fukusuke:     { name: "福助", face: "🎎", rarity: 1, price: 4, desc: "ラウンド開始時 小判+3", lore: "大きな頭の縁起人形。ステージのはじめにご祝儀をくれる。", flags: { kobanOnRound: 3 } },
    senrigan:     { name: "千里眼", face: "🔮", rarity: 2, price: 6, desc: "待ち牌が山のどこにあるか見える（あと何ツモで来るか）", lore: "千里の先まで見通す眼力の主。欲しい牌までの距離を数えてくれる。", flags: { farsight: true } }, // ★D63 作り替え(旧:捨て山込み残数=自明値の導出で実質効果なし・ユーザー指摘)
    // ---- ★D31 追加妖怪（基本3体）----
    fuuri:        { name: "風狸", face: "🍃", rarity: 2, price: 6, desc: "場風の刻子で さらに+2翻", lore: "風に乗って空を駆ける狸。場に吹く風と相性抜群。" },
    yamabiko:     { name: "山彦", face: "⛰️", rarity: 1, price: 4, desc: "鳴く(ポン/チー)たび 小判+2", lore: "山で声を返してくる精。こちらが鳴くたび、小判が返ってくる。", flags: { kobanOnCall: 2 } },
    amanojaku:    { name: "天邪鬼", face: "😝", rarity: 2, price: 6, desc: "チャンタ/ジュンチャンのアガリで +2翻", lore: "天の邪魔ばかりするひねくれ小鬼。端っこの牌ばかり可愛がる。" },
    // ---- ★D30 メダル解放妖怪（妖怪茶屋の図鑑で解放 → minStage以降のショップに出現）----
    // 翻インフレ特化: D27の数え役満階段(16翻=5倍満/18翻=6倍満/+2翻毎+8000)を活かし、無限夜行の深部を攻略可能にする。
    // ★D52 コスト改定: 浅いステージ(minStage4〜7)組は10〜25へ引き下げ（初心者=2〜3🏅/ランでも3〜5ランで1体解放でき、
    // 周回強化の実感を作る）。St8以降の深部組はエンドコンテンツとして55〜80を維持。
    onibi:        { name: "鬼火", face: "🔥", rarity: 2, price: 6, desc: "字牌の刻子1つにつき +1翻", lore: "ゆらゆらと漂う怪火。字牌に宿って燃え上がる。", unlock: { cost: 10, minStage: 4 } },
    nureonna:     { name: "濡女", face: "🐍", rarity: 2, price: 6, desc: "刻子の無いアガリ(全て順子)で +2翻", lore: "濡れ髪の蛇身の女。流れるような順子だけの手を好む。", unlock: { cost: 10, minStage: 4 } },
    yosuzume:     { name: "夜雀", face: "🐦", rarity: 2, price: 6, desc: "鳴いている手のアガリで +2翻", lore: "夜道で群れて鳴く雀の妖怪。鳴く者の味方をしてくれる。", unlock: { cost: 15, minStage: 5 } },
    azukibaba:     { name: "小豆婆", face: "👵", rarity: 3, price: 8, desc: "七対子・二盃口のアガリで +4翻", lore: "小豆洗いの婆さま。対子の目利きは年季が違う。", unlock: { cost: 20, minStage: 6 }, evolvesFrom: "azukiarai" }, // ★D58 小豆洗いの進化先(+3→+4に強化)。D59 旧名:雲外鏡(旧id:ungaikyo)→小豆婆へ改名、D60でidも統一
    ibarakidoji:   { name: "茨木童子", face: "😈", rarity: 3, price: 8, desc: "5翻以上のアガリで さらに+2翻", lore: "酒呑童子の右腕と謳われた鬼。強い手ほど血が騒ぐ。", unlock: { cost: 25, minStage: 6 } }, // ★D59 旧名:酒呑童子(旧id:shutendoji)→茨木童子へ改名。D60でidも ibarakidoji に統一
    umibozu:      { name: "海坊主", face: "🌊", rarity: 3, price: 8, desc: "清一色のアガリで さらに+3翻", lore: "夜の海に立ち上がる黒い巨頭。ひと色に染まった大海を割って現れる。", unlock: { cost: 55, minStage: 8 } },
    shutendoji:     { name: "酒呑童子", face: "🍶", rarity: 3, price: 9, desc: "全てのアガリで +2翻", lore: "大江山に君臨した鬼の頭領。その酒気は、どんな手も強くする。", unlock: { cost: 65, minStage: 9 }, evolvesFrom: "ibarakidoji" }, // ★D58 進化先(D56で勝率+25ptの突出→下位所持を出現条件にする構造的ナーフ)。D59 旧名:白澤(旧id:hakutaku)→酒呑童子へ改名、D60でidも統一
    ryujin:       { name: "龍神", face: "🐲", rarity: 3, price: 10, desc: "13翻以上のアガリで さらに+4翻", lore: "天に昇る龍の神。役満の彼方で、その力が目を覚ます。", unlock: { cost: 80, minStage: 10 } },
    // ---- ★D31 追加解放妖怪（2体）----
    tsukumogami:  { name: "九十九神", face: "📿", rarity: 3, price: 8, desc: "符50以上のアガリで +3翻", lore: "百年を経た道具に宿る精。細かい積み重ね（符）を何より尊ぶ。", unlock: { cost: 20, minStage: 7 } },
    tamamonomae: { name: "玉藻前", face: "✨", rarity: 3, price: 10, desc: "アガリの点数 ×1.5", lore: "九尾の狐が化けた傾国の美女。すべてのアガリを妖しく輝かせる。", unlock: { cost: 75, minStage: 12 }, evolvesFrom: "kitsunebi" }, // ★D54 狐火と効果交換→D58 狐火の進化先(キツネ繋がり)。無条件×1.5は深部のご褒美
    // ---- ★D32 追加解放妖怪（6体: システム/サポート/経済/役満支援）----
    doraneko:     { name: "ドラ猫", face: "🐱", rarity: 3, price: 8, desc: "毎ラウンド、ランダムな牌1種がドラになる（手の中の1枚につき+1翻）", lore: "気まぐれに宝のありかを示す猫。今夜のドラを教えてくれる。", unlock: { cost: 20, minStage: 6 } },
    yakousan:     { name: "夜行さん", face: "👺", rarity: 2, price: 6, desc: "么九牌だけのアガリ(混老頭)で +3翻", lore: "節分の夜、首切れ馬に乗って巡る鬼。端と字だけの手に力を貸す。", unlock: { cost: 15, minStage: 7 } },
    yukijoro:     { name: "雪女郎", face: "❄️", rarity: 2, price: 7, desc: "ステージ間のツモ回復 +4", lore: "雪女の姉格。吹雪はより深く、癒やしもより深く。", unlock: { cost: 55, minStage: 8 }, flags: { recovery: 4 }, evolvesFrom: "yukionna" }, // ★D58 雪女の進化先(+3→+4に強化)。D59 旧名:以津真天(旧id:itsumade)→雪女郎へ改名、D60でidも統一
    takarabune:   { name: "宝船", face: "🚢", rarity: 3, price: 8, desc: "アガリ時、所持小判1枚につき +100点", lore: "七福神を乗せて初夢に現れる宝の船。積んだ小判がそのまま力になる。", unlock: { cost: 55, minStage: 9 } },
    fuujin:       { name: "風神", face: "🌀", rarity: 3, price: 9, desc: "風牌の刻子1つにつき +2翻", lore: "風の袋を担ぐ神。すべての風牌がその眷属。", unlock: { cost: 55, minStage: 10 } },
    kudan:        { name: "件", face: "🐄", rarity: 3, price: 9, desc: "役満テンパイ中、ツモに待ち牌を確定で1枚混ぜる（各ラウンド1回）", lore: "人の顔と牛の体を持つ予言獣。大きなアガリの予言は、必ず当たる。", unlock: { cost: 65, minStage: 10 }, flags: { yakumanDraw: 1 } },
  };
  const yokaiIds = Object.keys(yokai); // ★D78: 旧 YOKAI_IDS = Object.keys(YOKAI) と同一順序

  // ---- ボス妖怪ギミック（A1: ボスブラインド相当） ---------------------------
  // 参照: ../design/boss-gimmicks-a1.md
  const bossGimmicks = {
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

  // ★A1 v3: 無限夜行(endless)のボスが決定的な擬似乱数(engine.js内 endlessGimmickFor)で選ぶプール(id配列)。
  // 静寂(seijaku)は含まない（百鬼夜行の最終ボス専用のため）。
  const endlessGimmickPool = [
    "kasumi", "omoishi", "junfuji", "kokufuji", "heiwafuji",
    "somefuji", "chiitoifuji", "tanyaofuji", "karesansui", "sennichite", "kechi", "nemuri", "nopperabou",
  ];

  // ---- ★A2 消耗品アイテム（使い切りの一発。妖怪とは別レイヤー） -----------------
  // 参照: ../design/consumables-a2.md 。usable: "round"(ラウンド中) / "shop"(ショップ中) /
  // "anytime"(常時) / "auto"(手動使用不可・自動発動のみ=migawari)。
  const items = {
    shinzuu:    { name: "神通力の札", face: "📜", rarity: 3, price: 9, desc: "手牌1枚を選んだ牌に変える(1回)", category: "牌操作", usable: "round" },
    habauchiwa: { name: "天狗の羽団扇", face: "🪭", rarity: 2, price: 6, desc: "手牌＋ツモを引き直す(ツモ回数を消費しない)", category: "手作り", usable: "round" },
    ema:        { name: "絵馬", face: "🎴", rarity: 2, price: 6, desc: "次のアガリの翻+2(予約・一発)", category: "打点", usable: "round" },
    migawari:   { name: "身代わり札", face: "🪆", rarity: 2, price: 7, desc: "次の敗北(ツモ切れ)を1回無効化", category: "保険", usable: "auto" },
    hamaya:     { name: "破魔矢", face: "🏹", rarity: 3, price: 9, desc: "このボス戦のギミックを無効化", category: "A1対策", usable: "round" },
    juzu:       { name: "数珠", face: "📿", rarity: 3, price: 8, desc: "このボス戦の目標点-20%", category: "敵弱体", usable: "round" },
    kozuchi:    { name: "打ち出の小槌", face: "🔨", rarity: 1, price: 5, desc: "小判+10(即時)", category: "経済", usable: "anytime" },
    yobimizu:   { name: "呼び水", face: "💧", rarity: 1, price: 4, desc: "市を1回無料引き直し（★2以上を1枠確定）", category: "妖怪の市", usable: "shop" }, // ★D54 招き鈴の追加で単純リロールは下位互換化→質のリロールに。D55: 全枠★2確定は強すぎ→1枠のみ確定
  };

  // ---- メタ進行（恒久強化） --------------------------------------------------
  // ★D50 価格改定: 1Lv=5〜10プレイ相当（1周クリア≒19メダル基準）。
  // late:true の枠開放系は「半分エンドコンテンツ」としてガッツリ高額（15〜25プレイ相当）。
  const metaUpgrades = {
    seed_koban:  { name: "軍資金",   face: "💰", desc: "開始時の小判 +2 /Lv", max: 3, costs: [80, 110, 150] },
    nebari:      { name: "粘り",     face: "🪢", desc: "ステージ間のツモ回復 +1 /Lv", max: 2, costs: [90, 140] },
    engimono:    { name: "縁起物",   face: "🎏", desc: "アガリの点数 +300 /Lv", max: 2, costs: [80, 120] },
    yunomi:      { name: "湯呑み",   face: "🍵", desc: "ツモの上限 +1 /Lv",   max: 2, costs: [100, 160] },
    fukubukuro:  { name: "福袋",     face: "🎁", desc: "開始時にランダムな道具1つ", max: 1, costs: [120] },
    slot_plus:   { name: "妖怪の絆", face: "🤝", desc: "妖怪枠 +1 /Lv",       max: 2, costs: [300, 500], late: true },
    item_slot:   { name: "道具袋",   face: "👝", desc: "道具枠 +1 /Lv",     max: 2, costs: [300, 500], late: true },
    shop_size:   { name: "賑わう市", face: "🏮", desc: "市の妖怪 +1",    max: 1, costs: [350], late: true },
    lucky_start: { name: "はじめの友", face: "🦊", desc: "開始時にランダムな妖怪1体", max: 1, costs: [400], late: true },
  };
  const metaIds = Object.keys(metaUpgrades); // ★D78: 旧 META_IDS = Object.keys(META_UPGRADES) と同一順序

  // ---- キャンペーン全9戦（makeRounds()の戻り値。★D73全9戦化・★D75敵名改名） ----
  const campaignRounds = [
        // ★D75: 敵名は市の妖怪と重複しない専用ロースターに改名（表示のみ。大ボスぬらりひょんは総大将として続投・無限夜行の敵は重複可＝ユーザー承認）
        { name: "一つ目小僧", target: 1000 }, { name: "二口女", target: 1600 }, { name: "【ボス】朧車", target: 3200, boss: true, gimmick: "kasumi" },
        { name: "髪切り", target: 2600 }, { name: "泥田坊", target: 3900 }, { name: "【ボス】土蜘蛛", target: 6400, boss: true, gimmick: "omoishi" },
        { name: "牛鬼", target: 5800 }, { name: "鵺", target: 7000 },
        { name: "【大ボス】ぬらりひょん", target: 8000, boss: true, gimmick: "seijaku" },
  ];

  // ---- 無限夜行の敵名リスト ---------------------------------------------------
  const endlessEnemyNames = ["鵺", "がしゃどくろ", "九尾の狐", "大百足", "橋姫", "牛鬼", "塗仏", "土蜘蛛"];

  const MJ_DATA = {
    yokai, yokaiIds,
    bossGimmicks, endlessGimmickPool,
    items,
    metaUpgrades, metaIds,
    campaignRounds,
    endlessEnemyNames,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MJ_DATA;
  else global.MJ_DATA = MJ_DATA;
})(typeof self !== "undefined" ? self : this);
