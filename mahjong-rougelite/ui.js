/* ゆるかわ百鬼夜行 v0.2 — ブラウザUI（手牌13＋ツモ5・自由交換） */
(function () {
  "use strict";
  const MJ = window.MJ;
  const H = window.MJHand;

  const SUIT_KANJI = { m: "萬", p: "筒", s: "索" };
  const META_KEY = "yurukawa_mj_meta";
  function loadMeta() { try { const s = localStorage.getItem(META_KEY); if (s) return JSON.parse(s); } catch (e) {} return { medals: 0, upgrades: {}, endlessUnlocked: false, unlockedYokai: [] }; }
  function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {} }
  // ★D67 データの初期化(設定画面)で loadMeta の初期値経路を再利用するため、旧セーブ互換の移行処理を関数化。
  function normalizeMeta(m) {
    if (m.endlessUnlocked === undefined) m.endlessUnlocked = false;
    if (!Array.isArray(m.unlockedYokai)) m.unlockedYokai = []; // 旧セーブ互換
    // ★D60 id改名の移行(D59の改名に合わせidも統一)。mapは同時適用なので旧shutendoji→ibarakidoji/旧hakutaku→shutendojiが混線しない
    const RENAMED = { itsumade: "yukijoro", ungaikyo: "azukibaba", shutendoji: "ibarakidoji", hakutaku: "shutendoji" };
    m.unlockedYokai = m.unlockedYokai.map((id) => RENAMED[id] || id);
    if (m.confirmActions === undefined) m.confirmActions = true; // 誤タップ防止の確認画面（既定ON・慣れた人はOFF可）
    return m;
  }

  let meta = normalizeMeta(loadMeta());
  let screen = "title";
  let game = null;
  let sel = null; // 交換選択 {zone:'hand'|'tsumo', i}
  let callSelect = null; // ★D66 鳴き選択モード: null|"pon"|"chi"|"kan"（call-row の3ボタンで選択→候補実行ボタンをタップして実行）
  let settingsOpen = false; // ★D67 設定（⚙）オーバーレイ表示中
  let settingsGiveupConfirm = false; // ★D67「ランをあきらめる」の確認ステップ表示中
  let settingsResetStep = 0; // ★D67 データの初期化の段階(0=通常/1=1回目タップ後の確認表示)
  let pendingSwapId = null; // 妖怪枠が埋まっている時に購入しようとした妖怪id（誰を手放すか選択中）
  let awardedMedals = 0; // このラン中に既にmeta.medalsへ加算した累計（継続時の二重付与防止）
  let lastEarned = 0;
  let selectedMode = "campaign"; // タイトルで選ぶ次ランのモード
  let helpOpen = false; // ヘルプ（❓）表示中
  let helpTab = "basics"; // ヘルプの表示タブ: "basics"(麻雀の基本)/"game"(本作の遊び方)/"yaku"(役一覧)/"fb"(フィードバック)
  let helpAcc = new Set(); // ★D66 ヘルプのアコーディオン開閉キー集合（開いているキーを保持。ヘルプを閉じるとリセット）
  let yokaiPanelId = null; // タップで選択中の妖怪id（その1体の効果だけ表示・スマホ対応）
  let titleTab = "chaya"; // ★D41 タイトルのタブ: "chaya"(妖怪茶屋) / "zukan"(妖怪図鑑)
  // ---- ★A2 消耗品アイテム関連のUI状態 ----
  let itemPanelId = null; // タップで選択中のアイテム枠index（効果表示＋使う/捨てるボタン）
  let pendingShinzuu = null; // 神通力の札の2段階選択 {idx, handIdx}（handIdx未定なら手牌選択待ち・定まれば変換先選択待ち）
  let pendingSwapItemId = null; // アイテム枠が埋まっている時に購入しようとしたアイテムid（誰を手放すか選択中）
  let pendingDropIdx = null; // アイテム枠が埋まっている時のボスドロップ選択index（誰を手放すか選択中）
  let pendingConfirm = null; // 確認ダイアログ表示中 {message, yesLabel, onYes}（誤タップ防止）

  const $ = (id) => document.getElementById(id);

  // ---- 確認ダイアログ（誤タップ防止）----
  function showConfirm(opts) {
    // 設定で確認画面OFF（慣れた人向け）の場合は即実行
    if (!meta.confirmActions) { if (opts.onYes) opts.onYes(); return; }
    pendingConfirm = opts; // { message, yesLabel, noLabel?, onYes }
    renderConfirm();
  }
  function renderConfirm() {
    const el = $("confirm");
    if (!pendingConfirm) { el.className = "overlay confirm-overlay hidden"; el.innerHTML = ""; return; }
    const c = pendingConfirm;
    el.className = "overlay confirm-overlay";
    el.innerHTML =
      `<div class="card confirm-card">
        <div class="confirm-msg">${c.message}</div>
        <button class="btn play gold" data-confirmyes="1">${c.yesLabel || "はい"}</button>
        <button class="btn small indigo" data-confirmno="1">${c.noLabel || "やめる"}</button>
      </div>`;
  }

  // ---- ⚙ 設定（D67）: 確認画面ON/OFF・ランをあきらめる・データの初期化 -----------
  // タイトル/プレイ中どちらからでも開ける専用オーバーレイ。項目はscreen("title"/"run")で出し分ける。
  function settingsHtml() {
    const inRun = screen === "run";
    const confirmSection =
      `<div class="settings-item">
         <div class="settings-item-head">
           <span class="settings-item-title">🛡 確認画面</span>
           <button class="btn small ${meta.confirmActions ? "indigo" : "gold"}" data-toggleconfirm="1">${meta.confirmActions ? "ON" : "OFF"}</button>
         </div>
         <div class="settings-item-note">手牌引き直し・鳴き・カン・アガリ時のツモの確認。慣れたらOFFでサクサク操作。</div>
       </div>`;
    const giveupSection = !inRun ? "" : (
      settingsGiveupConfirm
        ? `<div class="settings-item settings-danger">
             <div class="settings-item-note">本当にあきらめますか？ 獲得メダルを精算してタイトルへ戻ります</div>
             <div class="settings-actions">
               <button class="btn small gold" data-giveupconfirm="1">あきらめる</button>
               <button class="btn small indigo" data-giveupcancel="1">やめる</button>
             </div>
           </div>`
        : `<div class="settings-item">
             <div class="settings-item-head">
               <span class="settings-item-title">🏳 ランをあきらめる</span>
               <button class="btn small indigo" data-giveupstart="1">あきらめる</button>
             </div>
           </div>`
    );
    const resetSection = inRun ? "" : (
      settingsResetStep >= 1
        ? `<div class="settings-item settings-danger">
             <div class="settings-item-note">本当に初期化しますか？元に戻せません</div>
             <div class="settings-actions">
               <button class="btn small gold" data-resetconfirm="1">初期化する</button>
               <button class="btn small indigo" data-resetcancel="1">やめる</button>
             </div>
           </div>`
        : `<div class="settings-item">
             <div class="settings-item-head">
               <span class="settings-item-title">🗑 データの初期化</span>
               <button class="btn small indigo" data-resetstart="1">初期化</button>
             </div>
             <div class="settings-item-note">メダル・茶屋の強化・図鑑の解放をすべて消して最初の状態に戻します（テスト用）</div>
           </div>`
    );
    return `<div class="help-panel settings-panel">
      <div class="help-head-row"><h2>⚙ 設定</h2><button class="help-close-x" data-settingsclose="1">✕ 閉じる</button></div>
      ${confirmSection}${giveupSection}${resetSection}
    </div>`;
  }
  function renderSettings() {
    const el = $("settings");
    el.className = settingsOpen ? "overlay" : "overlay hidden";
    el.innerHTML = settingsOpen ? settingsHtml() : "";
  }
  // ランをあきらめる: 敗北時と同じ差分方式(awardedMedals)でメダルを精算し、engineには触らずタイトルへ戻る。
  function giveUpRun() {
    const total = game.medalsEarned();
    const delta = total - awardedMedals;
    if (delta > 0) { meta.medals += delta; awardedMedals = total; lastEarned = delta; }
    saveMeta();
    settingsOpen = false; settingsGiveupConfirm = false; settingsResetStep = 0;
    renderSettings();
    toTitle();
  }
  // データの初期化: 保存キーを削除しmetaを初期値で再生成（loadMetaの初期値経路を再利用）
  function resetMetaData() {
    try { localStorage.removeItem(META_KEY); } catch (e) {}
    meta = normalizeMeta(loadMeta());
    saveMeta();
    settingsOpen = false; settingsGiveupConfirm = false; settingsResetStep = 0;
    renderSettings();
    renderTitle();
  }

  // ---- ❓ヘルプ（タブ式・4タブ）: D65 -----------------------------------------
  // 📜役一覧タブの唯一の正 = design/core-loop-v0.2-agari.md §3（転記のみ・翻数/条件の創作禁止）。
  // 役名は engine.js(hand.js) が実際に返す名称（門前清自摸和／断么九 等）に合わせる。タンヤオはengine内部名"断么九"の別名として併記。
  const YAKU_TABLE = [
    { name: "門前清自摸和(ツモ)", han: "1翻", cond: "常に門前ツモで一律+1翻になります。", naki: "鳴くと成立しません（門前限定）" },
    { name: "嶺上開花", han: "1翻", cond: "カン直後のアガリで成立します。ツモプールが更新されると消えます。", naki: "カン後限定の役です（門前・鳴きは問いません）" },
    { name: "断么九(タンヤオ)", han: "1翻", cond: "1・9・字牌を含まないと成立します。", naki: "鳴いても成立します（喰いタンも1翻のままです）" },
    { name: "平和", han: "1翻", cond: "4面子すべてが順子で、雀頭が役牌でなく、両面待ちで完成すると成立します。嵌張・辺張・単騎待ちでは成立しません。", naki: "鳴くと成立しません（門前限定）" },
    { name: "一盃口", han: "1翻", cond: "同一の順子が1組あると成立します。", naki: "鳴くと成立しません（門前限定）" },
    { name: "二盃口", han: "3翻", cond: "同一の順子が2組そろうと成立します（一盃口とは排他で、上位互換として置き換わります）。", naki: "鳴くと成立しません（門前限定）" },
    { name: "役牌(三元)", han: "1翻/組", cond: "白・發・中の刻子で成立します（各1翻）。", naki: "鳴いても成立します" },
    { name: "場風", han: "2翻", cond: "その道中の場風の刻子で成立します。2戦ごとに東→南→西→北とローテーションし、ソロでは自風＝場風のダブ扱いとして2翻になります。場風以外の風（客風）の刻子には役が付きません。", naki: "鳴いても成立します" },
    { name: "三色同順", han: "2翻", cond: "同じ数字の順子を3色（萬・筒・索）そろえると成立します。", naki: "鳴いても成立します（喰い下がりで2翻→1翻になります）" },
    { name: "三色同刻", han: "2翻", cond: "同じ数字の刻子を3色そろえると成立します。", naki: "鳴いても成立します" },
    { name: "一気通貫", han: "2翻", cond: "同じ種類で123-456-789をそろえると成立します。", naki: "鳴いても成立します（喰い下がりで2翻→1翻になります）" },
    { name: "対々和", han: "2翻", cond: "4面子すべてが刻子だと成立します。", naki: "鳴いても成立します（門前で4刻子がそろうと四暗刻に格上げされます）" },
    { name: "七対子", han: "2翻", cond: "異なる対子が7組そろうと成立します（25符固定）。", naki: "鳴くと成立しません（門前限定）" },
    { name: "三暗刻", han: "2翻", cond: "手牌側の暗刻が3つあると成立します（ポンした明刻は数えません。暗槓は数えます）。", naki: "鳴いても成立します（ただしポンした刻子は暗刻に数えません）" },
    { name: "小三元", han: "2翻", cond: "三元牌の刻子2つと三元牌の雀頭がそろうと成立します。", naki: "鳴いても成立します" },
    { name: "混老頭", han: "2翻", cond: "全て老頭牌(1・9)と字牌のみで構成され、字牌を含むと成立します（字牌がなければ清老頭という役満になります）。七対子の形でも成立します。", naki: "鳴いても成立します（么九牌のポンで対々和と複合しやすくなります）" },
    { name: "混全帯幺九(チャンタ)", han: "2翻", cond: "全ての面子と雀頭が么九牌(1・9・字牌)を含み、字牌もあると成立します。", naki: "鳴いても成立します（喰い下がりで2翻→1翻になります）" },
    { name: "純全帯幺九(ジュンチャン)", han: "3翻", cond: "全ての面子と雀頭が老頭牌(1・9)のみで構成され、字牌がないと成立します。", naki: "鳴いても成立します（喰い下がりで3翻→2翻になります）" },
    { name: "混一色", han: "3翻", cond: "1種類の数牌と字牌のみで構成されると成立します。", naki: "鳴いても成立します（喰い下がりで3翻→2翻になります）" },
    { name: "清一色", han: "6翻", cond: "1種類の数牌のみで構成されると成立します。", naki: "鳴いても成立します（喰い下がりで6翻→5翻になります）" },
  ];
  const YAKUMAN_TABLE = [
    { name: "国士無双", cond: "么九13種を各1枚以上そろえ、いずれか1枚が重複すると成立します。", naki: "鳴くと成立しません（門前限定）" },
    { name: "四暗刻", cond: "刻子4つで成立します（本作は全てツモ和了のため、実質すべて暗刻になります）。", naki: "鳴くと成立しません（門前限定）" },
    { name: "大三元", cond: "白・發・中がすべて刻子だと成立します。", naki: "鳴いても成立します" },
    { name: "字一色", cond: "全て字牌で構成されると成立します。", naki: "鳴いても成立します" },
    { name: "清老頭", cond: "全て1・9の数牌で構成されると成立します。", naki: "鳴いても成立します" },
    { name: "緑一色", cond: "索子2・3・4・6・8と發のみで構成されると成立します。", naki: "鳴いても成立します" },
    { name: "小四喜", cond: "風牌の刻子3つと、4つ目の風牌の雀頭がそろうと成立します。", naki: "鳴いても成立します" },
    { name: "大四喜", cond: "東・南・西・北がすべて刻子だと成立します（全暗刻のため四暗刻とも複合することがあります）。", naki: "鳴いても成立します" },
    { name: "九蓮宝燈", cond: "1種類の数牌で1112345678999に余剰1枚を加えた形で成立します。", naki: "鳴き・カンともできません（門前限定）" },
  ];

  // ★D66 ヘルプのアコーディオン化: 見出し(常時表示・タップで開閉)＋本文(hiddenクラスで開閉。
  // 本文はDOMには常に含める＝既存の「本文の存在確認」系テストがそのまま通る実装方針)。
  function accItem(key, title, bodyHtml) {
    const open = helpAcc.has(key);
    return `<div class="acc-item">
        <button class="acc-head" data-acc="${key}">${title}<span class="acc-indicator">${open ? "▾" : "▸"}</span></button>
        <div class="acc-body${open ? "" : " hidden"}">${bodyHtml}</div>
      </div>`;
  }

  function helpBasicsHtml() {
    return accItem("b-tiles", "🀄 牌の種類", `<ul>
        <li>牌は<b>萬子・筒子・索子</b>の数牌（1〜9）と、<b>字牌</b>（東・南・西・北・白・發・中）の合計34種類です。</li>
        <li>どの牌も<b>同じものが4枚ずつ</b>あります（全部で136枚）。</li>
      </ul>`) +
      accItem("b-mentsu", "🀄 面子（メンツ）と雀頭", `<ul>
        <li><b>面子</b>とは3枚1組のまとまりのことです。同じ種類で連番の<b>順子</b>（例: 2萬-3萬-4萬）か、同じ牌3枚の<b>刻子</b>（例: 5筒-5筒-5筒）の2種類があります。</li>
        <li><b>雀頭</b>とは同じ牌2枚の対のことです（例: 中-中）。</li>
      </ul>`) +
      accItem("b-agari", "🎉 アガリの形", `<ul>
        <li>基本は<b>4つの面子＋1つの雀頭＝14枚</b>がそろうと「アガリ」です。</li>
        <li>例: 1萬2萬3萬・4筒5筒6筒・7索8索9索・發發發・中中 → 面子4つ＋雀頭1つでアガリの形になります。</li>
        <li>例外として<b>七対子</b>（違う対子を7組そろえる＝14枚）でもアガれます。</li>
      </ul>`) +
      accItem("b-tenpai", "🀄 テンパイと待ち", `<ul>
        <li>あと1枚でアガリの形が完成する状態を<b>テンパイ</b>、その完成に必要な1枚を<b>待ち</b>と呼びます。</li>
      </ul>`) +
      accItem("b-naki", "🗣 鳴き（ポン・チー・カン）", `<ul>
        <li>一般の麻雀では、他家の捨てた牌をもらって面子を完成させることを<b>「鳴き」</b>と呼びます。<b>ポン</b>は刻子、<b>チー</b>は順子、<b>カン</b>は同じ牌4枚を作る鳴きです。</li>
        <li>鳴くと手を早く進められる代わりに、<b>門前（メンゼン）限定の役</b>が使えなくなります。</li>
        <li>本作では他家の代わりに<b>ツモプールの牌</b>を使って鳴きます。詳しい操作・損得は「🏮本作の遊び方」タブをご覧ください。</li>
      </ul>`) +
      accItem("b-hanfu", "📈 翻と符のざっくり理解", `<ul>
        <li><b>翻（ハン）</b>は役の強さを表し、多いほど高得点になります。<b>符（フ）</b>は手の細かい要素に応じた点数です。翻と符から最終的な得点が決まります。</li>
        <li>得点は<b>満貫8000点で一段落する階段状</b>になっていて、そこからさらに翻が伸びると跳満・倍満…と上がっていきます。数字の詳細は「📜役一覧」タブをご覧ください。</li>
      </ul>`) +
      accItem("b-noyaku", "❗ 役が無いとアガれない", `<ul>
        <li>普通の麻雀では「役」が無い手はアガれません。ただし本作は<b>門前清自摸和（門前ツモ）という役が常に1翻付く</b>ので、<b>鳴かなければ必ずアガれます</b>。鳴くとこの役が消えるので要注意です（詳しくは「🏮本作の遊び方」タブをご覧ください）。</li>
      </ul>`);
  }

  function helpGameHtml() {
    return accItem("g-purpose", "🎯 目的", `<ul>
        <li>ソロ麻雀ローグライトです。<b>アガリの点数で敵妖怪のHPを削ります</b>。敵のHPを0まで削れば道中クリアです。</li>
        <li>「百鬼夜行」は全8戦（3戦ごとにボス）を制覇すれば勝利です。初回制覇で「無限夜行」（スコアアタック）が解禁されます。</li>
        <li>点数計算は<b>ほぼ標準ルール</b>です（翻・符、満貫8000で頭打ちの階段）。全てツモ和了扱いで、ロンはありません。</li>
      </ul>`) +
      accItem("g-flow", "🀄 手牌の進め方（本作の独自ループ）", `<ul>
        <li><b>手牌13枚＋ツモプール5枚</b>が常に見えています。タップで<b>手牌⇔プールを自由に交換</b>できます（何回でも無料）。</li>
        <li>プールの1枚で手が完成していれば「🎉 アガリ」ボタンが光ります。</li>
        <li>良い牌が無ければ「🀄 ツモを引く」でプール5枚を総入れ替えできます。<b>これが消耗するリソースです</b>。</li>
        <li>テンパイすると待ち牌・山の残り枚数・アガった場合の点数が自動表示されます。</li>
      </ul>`) +
      accItem("g-hp", "💧 ツモ回数＝HP（最重要）", `<ul>
        <li>ツモ回数は<b>ラン全体で持ち越されます</b>。開始は<b>15回</b>で、<b>ステージ間は+3しか回復しません</b>（<b>ボス撃破後は+6</b>）。上限は開始値の15です。</li>
        <li>0になったとき、手牌とツモを組み替えてもアガれない場合は<b>ゲームオーバー</b>になります（最後のツモも判定に含みます）。</li>
        <li>ショップの🍵お茶(+3回復・買うたび値上がり)と✨甘露(全回復・レア入荷)で延命できます。</li>
        <li>つまり<b>速くアガるほど残りツモ＝体力が温存されます</b>。</li>
      </ul>`) +
      accItem("g-naki", "🗣 鳴き（ポン/チー）＝ツモの節約", `<ul>
        <li>手牌2枚＋プール1枚で刻子/順子が完成するとき、プール下の「ポン」「チー」ボタンが押せるようになります（候補が無い種類はグレーアウトのままです）。ボタンを押すと候補が表示され、タップして鳴きを実行します。</li>
        <li>鳴くと面子を晒し、1枚捨てると<b>プール5枚が無料で新しくなります（ツモ回数を消費しません）</b>。</li>
        <li>代わりに門前が崩れます。門前ツモ・平和・七対子・一盃口/二盃口・四暗刻・九蓮宝燈などが消え、喰い下がりも適用されます。</li>
        <li><b>役が無いとアガれない</b>ので、鳴くなら役の当てを考えましょう（喰いタン・対々和・混一色など）。待ち表示に「役なし」と出たら注意してください。</li>
        <li>ロンが無いので、対々和は鳴き経由でのみ成立します（門前で4刻子がそろうと四暗刻に昇格します）。</li>
      </ul>`) +
      accItem("g-kan", "🎴 カン（暗槓）", `<ul>
        <li>同一牌4枚（手牌4枚 or 手牌3枚+プール1枚）がそろうと、「カン」ボタンから宣言できます（候補が無いときはグレーアウトです）。</li>
        <li>宣言すると<b>カンドラが1枚公開</b>（誰でも複数累積）され、槓子は固定（手替え不可）、プールが無料で新しくなります（ツモ回数を消費しません）。</li>
        <li>直後にアガれば<b>嶺上開花+1翻</b>が付きます。槓符（暗刻符の4倍＝中張牌16符／么九牌32符）も付きます。</li>
      </ul>`) +
      accItem("g-dora", "🎴 ドラ", `<ul>
        <li>カンをするたびに<b>カンドラが1枚公開</b>され、そのドラ1枚につき+1翻になります（誰でも複数累積します）。</li>
        <li>妖怪「ドラ猫」を仲間にすると、ラウンドごとの通常ドラも表示されるようになります。</li>
      </ul>`) +
      accItem("g-kaze", "🌪 場風ローテーション", `<ul>
        <li>2戦ごとに東場→南場→西場→北場と巡ります（画面上部にバッジで表示されます）。</li>
        <li>役牌は<b>三元牌と「場風」のみ</b>です（本家準拠）。<b>場風の刻子は2翻</b>になります（ソロなので自風＝場風のダブ扱いです）。場風以外の風（客風）は役なしです。</li>
      </ul>`) +
      accItem("g-yokai", "👻 妖怪（ジョーカー）とショップ", `<ul>
        <li>道中クリアごとに「妖怪の市」が開きます。<b>小判</b>で妖怪（翻/符/点数を強化・サポート効果）や道具、常設アイテムを買えます。</li>
        <li>妖怪枠は5です（拡張可）。枠が埋まっていても<b>入れ替え購入</b>できます。</li>
        <li>一部の妖怪には<b>進化（⤴LvUP）</b>があり、進化元を持っていると市に上位版が出現します。購入すると進化元を上書きして強化されます。</li>
        <li>市の品ぞろえは<b>リロール（引き直し）</b>できます。<b>ラン中3回まで無料</b>で、それ以降は1小判かかります。妖怪「🔔招き鈴」を買うと無料回数が+3補充されます（6小判〜・買うたび値上がり）。</li>
      </ul>`) +
      accItem("g-medal", "🏅 メダルと妖怪茶屋・図鑑", `<ul>
        <li>ラン終了時（負けても）<b>メダル</b>を獲得します → タイトルの「🏯妖怪茶屋」タブで恒久強化が買えます。<b>負けて強くなる設計</b>なので、気軽に挑戦して大丈夫です。</li>
        <li>タイトルの「📖妖怪図鑑」タブでは、メダルを払って妖怪を解放すると、その妖怪が規定ステージ以降のショップに出現するようになります。</li>
      </ul>`) +
      accItem("g-mode", "🎮 モード", `<ul>
        <li><b>百鬼夜行</b>（既定）は、全8戦（3戦ごとにボス）を制覇すると勝利になります。</li>
        <li><b>無限夜行</b>は、百鬼夜行を一度制覇すると解禁されます。8戦目以降も無限にステージが続くスコアアタックで、力尽きるまで挑戦し続けます。</li>
      </ul>`);
  }

  // ★D66 役一覧のアコーディオン化: 役名＋翻数(常時表示)をタップすると条件・鳴き可否が展開する。
  function yakuRowHtml(y, key, hanLabel, extraCls) {
    const open = helpAcc.has(key);
    return `<div class="yaku-row${extraCls || ""}">
        <button class="acc-head yaku-head" data-acc="${key}"><span class="yaku-name">${y.name}</span><span class="yaku-han">${hanLabel}</span><span class="acc-indicator">${open ? "▾" : "▸"}</span></button>
        <div class="acc-body${open ? "" : " hidden"}"><div class="yaku-cond">${y.cond}</div><div class="yaku-naki">${y.naki}</div></div>
      </div>`;
  }
  function helpYakuHtml() {
    const rowsHtml = YAKU_TABLE.map((y, i) => yakuRowHtml(y, `yaku-${i}`, y.han)).join("");
    const yakumanRowsHtml = YAKUMAN_TABLE.map((y, i) => yakuRowHtml(y, `yakuman-${i}`, "役満(13翻)", " yakuman")).join("");
    const noteBody = `<p><b>喰い下がり</b>（鳴くと下がる翻）: 混一色3→2／清一色6→5／チャンタ2→1／ジュンチャン3→2／一気通貫2→1／三色同順2→1（喰いタンは1翻のまま変わりません）。</p>
      <p>役満が複合した場合は<b>ダブル役満・トリプル役満</b>として32000×該当数を単純加算します（例: 字一色+四暗刻＝ダブル役満64000点）。翻数が非常に高い手には「数え役満」の階段があります: 13〜15翻＝32000（数え役満）／16〜17翻＝40000（5倍満）／18〜19翻＝48000（6倍満）／以降2翻ごとに+8000。</p>`;
    return `<p class="help-lead">実装されている全役の早見表です（<code>core-loop-v0.2-agari.md</code> §3が正）。全てツモ和了・ロン無し前提の翻数です。</p>
      <h3>📜 通常役</h3>
      <div class="yaku-list">${rowsHtml}</div>
      <h3>👑 役満</h3>
      <div class="yaku-list">${yakumanRowsHtml}</div>
      <div class="yaku-list">${accItem("yaku-note", "📝 補足: 喰い下がりと役満の複合", noteBody)}</div>`;
  }

  function helpFeedbackHtml() {
    return `<h3>📝 フィードバックで知りたいこと</h3>
      <ul>
        <li>難易度: 何ステージまで行けたか／理不尽 or ぬるいと感じた場面</li>
        <li>テンポ: 操作がだるい・待たされると感じた瞬間</li>
        <li>鳴き・お茶・妖怪の「使いたくなる度」／点数や役判定がおかしいと感じた手（スクショ歓迎）</li>
      </ul>`;
  }

  function helpHtml() {
    const tabs = [
      { id: "basics", label: "🀄 麻雀の基本" },
      { id: "game", label: "🏮 本作の遊び方" },
      { id: "yaku", label: "📜 役一覧" },
      { id: "fb", label: "📝 フィードバック" },
    ];
    const tabBtns = tabs.map((t) => `<button class="help-tab ${helpTab === t.id ? "active" : ""}" data-helptab="${t.id}">${t.label}</button>`).join("");
    const body = helpTab === "yaku" ? helpYakuHtml() : helpTab === "fb" ? helpFeedbackHtml() : helpTab === "game" ? helpGameHtml() : helpBasicsHtml();
    return `<div class="help-panel">
      <div class="help-head-row"><h2>❓ ヘルプ</h2><button class="help-close-x" data-helpclose="1">✕ 閉じる</button></div>
      <div class="help-tabs">${tabBtns}</div>
      <div class="help-body">${body}</div>
      <button class="btn play start-btn" data-helpclose="1">← 戻る</button>
    </div>`;
  }
  function renderHelp() {
    const el = $("help");
    el.className = helpOpen ? "overlay" : "overlay hidden";
    el.innerHTML = helpOpen ? helpHtml() : "";
  }
  function renderTitle() {
    const metaRowHtml = (id) => {
      const u = MJ.META_UPGRADES[id];
      const lv = meta.upgrades[id] || 0;
      const cost = MJ.metaNextCost(id, lv);
      const maxed = cost === null;
      const afford = !maxed && meta.medals >= cost;
      const pips = "●".repeat(lv) + "○".repeat(u.max - lv);
      const btn = maxed ? `<span class="meta-max">MAX</span>` : `<button class="btn small gold" ${afford ? "" : "disabled"} data-metabuy="${id}">🏅${cost}</button>`;
      return `<div class="offer"><span class="face">${u.face}</span><div class="info"><div class="n">${u.name} <span class="pips">${pips}</span></div><div class="d">${u.desc}</div></div>${btn}</div>`;
    };
    // ★D50: late(枠開放系)は高額のエンドコンテンツ扱いとして「奥義」に分けて表示
    const rows = MJ.META_IDS.filter((id) => !MJ.META_UPGRADES[id].late).map(metaRowHtml).join("");
    const lateRows = MJ.META_IDS.filter((id) => MJ.META_UPGRADES[id].late).map(metaRowHtml).join("");
    // ★D30: 妖怪図鑑（メダルで解放 → 規定ステージ以降のショップに出現）★D50: 出現ステージの昇順
    const unlockIds = MJ.YOKAI_IDS.filter((id) => MJ.YOKAI[id].unlock)
      .sort((a, b) => (MJ.YOKAI[a].unlock.minStage - MJ.YOKAI[b].unlock.minStage) || (MJ.YOKAI[a].unlock.cost - MJ.YOKAI[b].unlock.cost));
    const zukanRows = unlockIds.map((id) => {
      const y = MJ.YOKAI[id];
      const owned = meta.unlockedYokai.includes(id);
      const afford = meta.medals >= y.unlock.cost;
      const btn = owned
        ? `<span class="meta-max">解放済</span>`
        : `<button class="btn small gold" ${afford ? "" : "disabled"} data-unlockyokai="${id}">🏅${y.unlock.cost}</button>`;
      const evo = y.evolvesFrom ? `<div class="d evo-note">⤴ ${MJ.YOKAI[y.evolvesFrom].name}を持っていると市に出現（進化・上書き）</div>` : "";
      return `<div class="offer${owned ? "" : " locked-yokai"}"><span class="face">${owned ? y.face : "❓"}</span><div class="info"><div class="n">${y.name} ${"★".repeat(y.rarity)} <span class="stage-gate">ステージ${y.unlock.minStage}〜</span></div><div class="d">${y.desc}</div>${evo}</div>${btn}</div>`;
    }).join("");
    // ★D41 タブ化: 茶屋/図鑑を切り替えて表示（タイトルが縦に長くなりテストプレイの妨げになっていた）
    const chaya = `<div class="shop-items">${rows}</div>
      <div class="meta-note" style="margin:10px 0 6px">🔮 奥義 — メダルを貯め込んで挑む大強化</div>
      <div class="shop-items">${lateRows}</div>`;
    const zukan = `<div class="meta-note" style="margin:0 0 8px">解放した妖怪は、記載ステージ以降の「妖怪の市」に並ぶようになります</div>
      <div class="shop-items">${zukanRows}</div>`;
    const tabsHtml = `<div class="title-tabs">
        <button class="title-tab ${titleTab === "chaya" ? "active" : ""}" data-titletab="chaya">🏯 妖怪茶屋</button>
        <button class="title-tab ${titleTab === "zukan" ? "active" : ""}" data-titletab="zukan">📖 妖怪図鑑</button>
      </div>
      <div class="tab-panel">${titleTab === "zukan" ? zukan : chaya}</div>`;
    const modeHtml = meta.endlessUnlocked
      ? `<div class="mode-select">
           <button class="mode-btn ${selectedMode === "campaign" ? "active" : ""}" data-mode="campaign">📖 百鬼夜行<span class="mode-sub">全8戦・制覇を目指す</span></button>
           <button class="mode-btn ${selectedMode === "endless" ? "active" : ""}" data-mode="endless">♾️ 無限夜行<span class="mode-sub">力尽きるまで・ハイスコア</span></button>
         </div>`
      : `<div class="mode-locked">♾️ 無限夜行は「百鬼夜行」を制覇すると解禁されます</div>`;
    $("title").innerHTML =
      `<div class="title-hero"><div class="game-logo">ゆるかわ百鬼夜行</div><div class="game-sub">〜麻雀ローグライト proto〜</div></div>
       <div class="medal-bar">所持メダル 🏅 <b>${meta.medals}</b></div>
       ${tabsHtml}
       ${modeHtml}
       <div class="settings-row">
         <button class="btn small indigo help-open" data-help="1" data-helptab="basics">❓ 遊び方</button>
         <button class="btn small indigo" data-settings="1">⚙ 設定</button>
       </div>
       <button class="btn play start-btn" data-startrun="1">▶ ${selectedMode === "endless" ? "無限夜行へ出発" : "百鬼夜行へ出発"}</button>
       <div class="meta-note">手牌13枚とツモ5枚を自由に交換。ツモの1枚で手が完成＝アガリ！役と翻で得点。</div>`;
  }

  // 牌1枚の中身(数字/字牌ラベル)HTML。tileHtml(手牌・ツモの大サイズ)とcallChipHtml(候補ボタンのミニ牌)で共有する。
  function tileBodyHtml(code) {
    const t = { suit: code[0], rank: parseInt(code.slice(1)) };
    return t.suit === "z" ? `<span class="num">${MJ.tileLabelCode(code)}</span>` : `<span class="num">${t.rank}</span><span class="suit">${SUIT_KANJI[t.suit]}</span>`;
  }
  function tileSuitCls(code) { return code[0] === "z" ? "z" : code[0]; }

  function tileHtml(code, index, zone, extraCls) {
    const s = (sel && sel.zone === zone && sel.i === index) ? " selected" : "";
    const cls = tileSuitCls(code);
    return `<div class="tile ${cls}${s}${extraCls || ""}" data-zone="${zone}" data-i="${index}">${tileBodyHtml(code)}</div>`;
  }

  function renderTopBar() {
    const r = game.currentRound();
    // ★A2: 破魔矢(gimmick無効化)/数珠(目標-20%)の効果を即座に反映するため、表示値はeffectiveGimmick/effectiveTargetを使う。
    const gimmick = game.effectiveGimmick();
    const target = game.effectiveTarget();
    // ★D66 バーを「敵HP」として表示: 残りHPの割合(=削るほど短くなる)。内部値・クリア判定は不変で表示のみ変更。
    const dealtPct = Math.min(100, Math.round((game.roundScore / target) * 100));
    const hpPct = Math.max(0, 100 - dealtPct);
    const hpCls = hpPct > 50 ? "hp-green" : (hpPct > 20 ? "hp-yellow" : "hp-red");
    const hpLeft = Math.max(0, target - game.roundScore);
    // ★A1: ボスラウンドかつgimmickありの時だけ警告バッジを表示（通常戦では出さない。破魔矢使用後はgimmickがnullになり消える）
    const gimmickHtml = (r.boss && gimmick)
      ? `<span class="gimmick-badge" data-gimmick="${gimmick}">⚠${MJ.BOSS_GIMMICKS[gimmick].name}: ${MJ.BOSS_GIMMICKS[gimmick].desc}</span>`
      : "";
    $("topbar").innerHTML =
      `<div class="title"><span class="home" data-home="1">🏠</span><span class="help-btn" data-help="1" data-helptab="game">❓</span><span class="help-btn" data-settings="1">⚙</span> ゆるかわ百鬼夜行 <span class="sub">🏅${meta.medals}</span></div>
       <div class="round-row"><span class="round-name ${r.boss ? "boss" : ""}">${game.mode === "endless" ? `♾️ ${game.roundIndex + 1}戦目` : `道中 ${game.roundIndex + 1}/${MJ.CAMPAIGN_LENGTH}`} ${r.name} <span class="ba-wind">${r.windName}</span></span><span class="stat">敵HP ${target}</span></div>
       ${gimmickHtml}
       <div class="bar hp ${hpCls}"><span style="width:${hpPct}%"></span></div>
       <div class="score-line">敵HP 残り${hpLeft} / ${target}</div>
       <div class="resources">
         <span class="chip koban">小判 ${game.koban}</span>
         <span class="chip plays">ツモ残り ${game.drawsLeft}</span>
         <span class="chip discards">アガリ ${game.agariThisRound}</span>
       </div>`;
  }

  function renderYokai() {
    const bar = $("yokai-bar");
    // ★妖怪をタップすると「その1体」の効果を表示（hoverの無いスマホ対応）。同じ妖怪を再タップで閉じる。
    if (yokaiPanelId && !game.yokai.includes(yokaiPanelId)) yokaiPanelId = null; // 手放した妖怪の表示を残さない
    bar.innerHTML = (game.yokai.length === 0
      ? `<span class="yokai-empty">まだ妖怪がいません（ショップで仲間に）</span>`
      // ★A1 v3 眠り(nemuri): 休眠中の妖怪を薄く＋💤表示（game.sleepingYokai参照）
      : game.yokai.map((id) => {
          const y = MJ.YOKAI[id]; const selCls = id === yokaiPanelId ? " selected" : "";
          const sleeping = id === game.sleepingYokai;
          const sleepCls = sleeping ? " sleeping" : "";
          const sleepBadge = sleeping ? `<span class="sleep-badge">💤</span>` : "";
          return `<div class="yokai${selCls}${sleepCls}" data-yokaipanel="${id}" title="${y.desc}"><span class="rar">${"★".repeat(y.rarity)}</span><span class="face">${y.face}</span><span class="yname">${y.name}</span>${sleepBadge}</div>`;
        }).join(""));
    bar.innerHTML += `<span class="slots">枠 ${game.yokai.length}/${game.yokaiSlots}</span>`;
    if (yokaiPanelId) {
      const y = MJ.YOKAI[yokaiPanelId];
      bar.innerHTML += `<div class="yokai-panel"><div class="yokai-detail"><span class="face">${y.face}</span><b>${y.name}</b> <span class="rar-inline">${"★".repeat(y.rarity)}</span><span class="ydesc">${y.desc}</span></div></div>`;
    }
  }

  // ★A2 消耗品スロット行（妖怪パネルの近くに表示。タップで効果＋使う/捨てるを表示）
  function itemUsableNow(id) {
    const def = MJ.ITEMS[id];
    if (!def || def.usable === "auto") return false;
    if (id === "hamaya") return game.phase === "round" && game.currentRound().boss && !!game.currentRound().gimmick;
    if (id === "juzu") return game.phase === "round" && game.currentRound().boss;
    if (id === "shinzuu") return game.phase === "round" && !game.mustDiscard;
    if (def.usable === "round") return game.phase === "round";
    if (def.usable === "shop") return game.phase === "shop";
    return def.usable === "anytime";
  }
  function renderItems() {
    const bar = $("item-bar");
    if (itemPanelId != null && itemPanelId >= game.items.length) itemPanelId = null; // 使用/破棄済みなら閉じる
    bar.innerHTML = (game.items.length === 0
      ? `<span class="item-empty">まだ消耗品がありません</span>`
      : game.items.map((id, i) => {
          const it = MJ.ITEMS[id]; const selCls = i === itemPanelId ? " selected" : "";
          return `<div class="item-chip${selCls}" data-itempanel="${i}" title="${it.desc}"><span class="rar">${"★".repeat(it.rarity)}</span><span class="face">${it.face}</span><span class="iname">${it.name}</span></div>`;
        }).join(""));
    bar.innerHTML += `<span class="slots">枠 ${game.items.length}/${game.itemSlots}</span>`;
    if (itemPanelId != null) {
      const id = game.items[itemPanelId];
      const it = MJ.ITEMS[id];
      const useBtn = it.usable === "auto"
        ? `<span class="item-auto-note">自動発動（敗北を1回だけ無効化）</span>`
        : `<button class="btn small gold" ${itemUsableNow(id) ? "" : "disabled"} data-usei="${itemPanelId}">使う</button>`;
      bar.innerHTML += `<div class="yokai-panel item-panel"><div class="yokai-detail"><span class="face">${it.face}</span><b>${it.name}</b> <span class="rar-inline">${"★".repeat(it.rarity)}</span><span class="ydesc">${it.desc}</span></div><div class="item-actions">${useBtn}<button class="btn small indigo" data-discardi="${itemPanelId}">捨てる</button></div></div>`;
    }
    // ★A2 神通力の札: 2段階選択（手牌の対象牌→変換先牌）
    if (pendingShinzuu) {
      if (pendingShinzuu.handIdx == null) {
        bar.innerHTML += `<div class="shinzuu-note">📜 手牌から変換する牌をタップしてください <button class="btn small indigo" data-cancelshinzuu="1">やめる</button></div>`;
      } else {
        const picker = Array.from({ length: 34 }, (_, t) => `<button class="btn small tile-pick" data-totile="${H.indexToCode(t)}">${H.tileLabel(t)}</button>`).join("");
        bar.innerHTML += `<div class="shinzuu-note">📜 変換先の牌を選んでください<div class="tile-picker">${picker}</div><button class="btn small indigo" data-cancelshinzuu="1">やめる</button></div>`;
      }
    }
  }

  function renderPeek() {
    const p = game.peekNext();
    // ★D32 ドラ猫: 今ラウンドのドラを表示
    const dora = game.yokai.includes("doraneko") ? `<span class="dora-ind">🐱 ドラ <b>${H.tileLabel(game.doraTile)}</b></span>` : "";
    // ★D61 カンドラ: カンで公開されたドラ（誰でも・複数累積）
    const kanDora = (game.kanDora || []).length ? `<span class="dora-ind">🎴 カンドラ <b>${game.kanDora.map((t) => H.tileLabel(t)).join("・")}</b></span>` : "";
    const peek = p.length ? `👁 山の次 → ` + p.map((c) => `<b>${MJ.tileLabelCode(c)}</b>`).join(" ") : "";
    $("peek").innerHTML = [dora, kanDora, peek].filter(Boolean).join("　");
  }

  // 翻・符・限度名の表示ラベル（★D22）
  function hanFuLabel(info) {
    if (info.limit) return info.limit + (info.yakumanCount >= 1 ? "" : `（${info.han}翻）`);
    return `${info.han}翻${info.fu}符`;
  }
  function renderBanner() {
    const el = $("preview");
    if (game.mustDiscard) {
      el.innerHTML = `<div class="tenpai">🀄 <b>鳴きました！</b> 手牌から要らない1枚をタップして捨ててください（捨てるとツモが無料で新しくなります）</div>`;
      return;
    }
    const info = game.agariInfo();
    // 待ち牌リストの共通描画（残枚数＋アガった場合の点数。プールに来ている待ちは強調）
    // ★A1 v3 のっぺらぼう(nopperabou): waitCountsが空になり残数countがnull/undefinedになる→「残?」表示
    const waitListHtml = (previews) => {
      const inPool = new Set(game.tsumo.map((c) => H.codeToIndex(c)));
      return previews.map((p) => {
        const countLabel = p.count == null ? "残?" : `残${p.count}`;
        const nowCls = inPool.has(p.tile) ? " now" : "";
        // ★D63 千里眼: あと何ツモで来るか（1=次のツモ）
        const far = p.drawsAway != null ? `<span class="wfar">${p.drawsAway === 1 ? "次のツモ" : `あと${p.drawsAway}ツモ`}</span>` : "";
        return p.yakuless
          ? `<span class="wait yakuless${nowCls}">${H.tileLabel(p.tile)}<span class="wcount">${countLabel}</span><span class="wscore">役なし</span>${far}</span>`
          : `<span class="wait${nowCls}">${H.tileLabel(p.tile)}<span class="wcount">${countLabel}</span><span class="wscore">${p.limit ? p.limit : p.score.toLocaleString() + "点"}</span>${far}</span>`;
      }).join(" ");
    };
    if (info.agari) {
      const yaku = info.yaku.map((y) => `${y.name}${y.han}翻`).join("・");
      const limitCls = info.limit ? " limit" : "";
      // ★D62: アガリ可能時も全ての待ちと点数を併記（別の待ちで高打点を狙う判断材料。今アガれる待ちは緑で強調）
      const previews = game.waitPreviews();
      const waitsHtml = previews.length > 1 ? `<div class="agari-waits">待ち: ${waitListHtml(previews)}</div>` : "";
      el.innerHTML = `<div class="agari-banner"><div class="big${limitCls}">🎉 ${MJ.tileLabelCode(info.winTile)} でアガリ！ ${info.score.toLocaleString()}点</div><div class="calc">${hanFuLabel(info)}</div><div class="detail">${yaku}</div>${waitsHtml}</div>`;
      return;
    }
    // ★D1: 待ち牌ごとの点数プレビュー（残枚数＋アガった場合の点数）
    const previews = game.waitPreviews();
    if (previews.length) {
      el.innerHTML = `<div class="tenpai">🀄 <b>テンパイ！</b> 待ち: ${waitListHtml(previews)} <br>この牌がツモに来れば「アガリ」</div>`;
      return;
    }
    // ★D66 ノーテン時の操作案内文は削除。ただし鳴きあり警告は重要情報のため単独で表示を継続する。
    el.innerHTML = game.melds.length > 0
      ? `<span class="open-note">⚠ 鳴きあり: 門前役(ツモ/平和/七対子等)は付きません。役が無いとアガれません</span>`
      : "";
  }

  // ★D66 鳴き選択モード中にハイライトする牌のindexを算出（プール側の対象牌＋消費される手牌。チーは全候補の和集合）
  function computeCallHi() {
    const hand = new Set(), tsumo = new Set();
    if (!callSelect || !game || game.phase !== "round") return { hand, tsumo };
    const markHand = (codes) => {
      const need = {};
      for (const c of codes) need[c] = (need[c] || 0) + 1;
      for (const code of Object.keys(need)) {
        let n = need[code];
        for (let i = 0; i < game.hand.length && n > 0; i++) {
          if (game.hand[i] === code && !hand.has(i)) { hand.add(i); n--; }
        }
      }
    };
    // ★D67 和集合ハイライトは誤読のもと(どの牌がどの候補ボタンに対応するか読めない)なので廃止。
    // 選択した種別の候補が1つの時だけ、その1候補分をハイライトする。2つ以上ある時は盤面側は出さない(候補ボタンのミニ牌表示で判別)。
    if (callSelect === "kan") {
      const opts = game.kanOptions();
      if (opts.length !== 1) return { hand, tsumo };
      const o = opts[0];
      if (o.from === "pool") {
        const ti = game.tsumo.indexOf(o.code);
        if (ti >= 0) tsumo.add(ti);
        markHand([o.code, o.code, o.code]);
      } else {
        markHand([o.code, o.code, o.code, o.code]);
      }
    } else {
      const matched = game.callOptions().filter((o) => o.type === callSelect);
      if (matched.length !== 1) return { hand, tsumo };
      const o = matched[0];
      tsumo.add(o.tsumoIdx);
      markHand(o.use);
    }
    return { hand, tsumo };
  }

  // ★D67 候補実行ボタンのミニ牌チップ1枚分。プール由来の牌は強調＋「ツモ」バッジで区別する。
  function callChipHtml(code, isPool) {
    const cls = tileSuitCls(code);
    const badge = isPool ? `<span class="pool-badge">ツモ</span>` : "";
    return `<span class="mini-tile ${cls}${isPool ? " pool" : ""}">${tileBodyHtml(code)}${badge}</span>`;
  }
  // pon/chi候補(callOptions()の要素)を構成する3枚のチップ({code,pool}の配列)を組み立てる。
  function callChipsForCall(o) {
    if (o.type === "pon") {
      const poolCode = game.tsumo[o.tsumoIdx];
      return [{ code: poolCode, pool: true }, { code: o.use[0], pool: false }, { code: o.use[1], pool: false }];
    }
    // チー: 3枚の並び(低い順)で表示し、ツモプールから取った1枚だけを強調する。
    const poolIdx = H.codeToIndex(game.tsumo[o.tsumoIdx]);
    const low = o.meldTile;
    return [low, low + 1, low + 2].map((idx) => ({ code: H.indexToCode(idx), pool: idx === poolIdx }));
  }
  // カン候補(kanOptions()の要素)を構成する4枚のチップ。プールカンは1枚だけ強調、手牌カンは4枚とも通常表示。
  function callChipsForKan(o) {
    const n = 4;
    return Array.from({ length: n }, (_, i) => ({ code: o.code, pool: o.from === "pool" && i === n - 1 }));
  }

  function renderHand() {
    // ★D43: 晒した面子（鳴き）は手牌の「1行上」に表示（手牌行を占有しない＝概念牌が読みやすい）
    const meldHtml = game.melds.map((m) => {
      const tiles = m.t === "trip"
        ? [m.i, m.i, m.i]
        : [m.i, m.i + 1, m.i + 2];
      return `<span class="open-meld"><span class="meld-tag">鳴</span>${tiles.map((t) => `<span class="meld-tile">${H.tileLabel(t)}</span>`).join("")}</span>`;
    }).join("");
    $("melds").innerHTML = meldHtml;
    const hi = computeCallHi();
    $("hand").innerHTML = game.hand.map((c, i) => tileHtml(c, i, "hand", hi.hand.has(i) ? " call-hi" : "")).join("");
  }
  function renderTsumo() {
    const info = game.agariInfo();
    const win = info.agari ? info.winTile : null;
    const useful = new Set(game.usefulTsumo());
    const hi = computeCallHi();
    let used = false;
    const tiles = game.tsumo.map((c, i) => {
      const isWin = (c === win && !used);
      if (isWin) used = true;
      const extra = (isWin ? " drawn" : (useful.has(i) ? " useful" : "")) + (hi.tsumo.has(i) ? " call-hi" : "");
      return tileHtml(c, i, "tsumo", extra);
    }).join("");
    // ★D66 鳴きボタン刷新: call-row は常時「ポン」「チー」「カン」の3ボタンのみ（候補が無い種類はdisabled）。
    // ★D24: 鳴き候補ボタン（ポン/チー） ★D61 カン候補（暗槓）
    // ★D35: チーは同一面子ラベルでも消費する手牌が異なる別選択肢になり得るため、消費手牌を併記して区別可能にする
    const calls = game.callOptions();
    const kans = game.kanOptions();
    const ponHas = calls.some((o) => o.type === "pon");
    const chiHas = calls.some((o) => o.type === "chi");
    const kanHas = kans.length > 0;
    const selBtn = (type, label, has) =>
      `<button class="btn small call-sel${callSelect === type ? " active" : ""}${type === "kan" ? " kan-btn" : ""}" data-callsel="${type}" ${has ? "" : "disabled"}>${label}</button>`;
    const callRowHtml = `<div class="call-row">${selBtn("pon", "ポン", ponHas)}${selBtn("chi", "チー", chiHas)}${selBtn("kan", "カン", kanHas)}</div>`;
    // ★D67 候補実行ボタンは「ミニ牌表示」に刷新: テキストラベルの代わりに面子を構成する牌チップを並べる
    // (プール由来の1枚を強調)。種別ラベル(ポン/チー/カン)はボタン先頭に小さく残す。
    let execHtml = "";
    if (callSelect === "pon" || callSelect === "chi") {
      const typeLabel = callSelect === "pon" ? "ポン" : "チー";
      execHtml = calls.map((o, k) => {
        if (o.type !== callSelect) return "";
        const chipsHtml = callChipsForCall(o).map((c) => callChipHtml(c.code, c.pool)).join("");
        return `<button class="btn small call-btn" data-call="${k}"><span class="call-type-tag">${typeLabel}</span><span class="call-chips">${chipsHtml}</span></button>`;
      }).join("");
    } else if (callSelect === "kan") {
      execHtml = kans.map((o, k) => {
        const chipsHtml = callChipsForKan(o).map((c) => callChipHtml(c.code, c.pool)).join("");
        return `<button class="btn small call-btn kan-btn" data-kan="${k}"><span class="call-type-tag">カン</span><span class="call-chips">${chipsHtml}</span></button>`;
      }).join("");
    }
    const execRowHtml = callSelect
      ? `<div class="call-exec-row">${execHtml}<button class="btn small indigo call-cancel" data-callcancel="1">✕ やめる</button></div>`
      : "";
    $("tsumo").innerHTML = `<span class="tsumo-label">ツモ${game.tsumo.length}枚</span>${tiles}${callRowHtml}${execRowHtml}`;
  }

  function renderActions() {
    const info = game.agariInfo();
    const busy = game.mustDiscard;
    const redeal = (!busy && game.mulligansLeft > 0) ? `<button class="btn small indigo" data-act="redeal">🔄 手牌引き直し (${game.mulligansLeft})</button>` : "";
    const rerollT = (!busy && game.freeTsumoRerollLeft > 0) ? `<button class="btn small indigo" data-act="rerolltsumo">🔄 ツモ引き直し(無料 x${game.freeTsumoRerollLeft})</button>` : "";
    // ★D34 ツモ切れでも組み替えれば和了できる場合は「ラストチャンス」を表示（誤ってゲームオーバーに見せない）
    const lastChance = !busy && game.drawsLeft <= 0 && !info.agari && game._winReachable();
    const lastChanceHtml = lastChance ? `<div class="last-chance">🔥 最後のツモ！手牌とツモを組み替えればアガれます <button class="btn small gold" data-act="autowin">自動で組む</button></div>` : "";
    $("actions").innerHTML =
      lastChanceHtml +
      `<button class="btn discard" ${(!busy && game.drawsLeft > 0) ? "" : "disabled"} data-act="draw">🀄 ツモを引く (残${game.drawsLeft})</button>
       <button class="btn play agari" ${info.agari ? "" : "disabled"} data-act="agari">🎉 アガリ</button>${redeal}${rerollT}`;
  }

  function renderShop() {
    const shop = game.shop;
    const slotsFull = game.yokai.length >= game.yokaiSlots;
    const itemSlotsFull = game.items.length >= game.itemSlots;
    if (pendingSwapItemId) {
      // アイテム枠が埋まっている状態で消耗品を購入しようとした→誰を手放すか選ぶ画面
      const target = MJ.ITEMS[pendingSwapItemId];
      const releaseHtml = game.items.map((id, ix) => {
        const it = MJ.ITEMS[id];
        return `<div class="offer"><span class="face">${it.face}</span><div class="info"><div class="n">${it.name} ${"★".repeat(it.rarity)}</div><div class="d">${it.desc}</div></div><button class="btn small discard" data-releaseitemshop="${ix}">手放す</button></div>`;
      }).join("");
      $("shop").innerHTML =
        `<h2>🏮 妖怪の市 🏮</h2>
         <div class="swap-note">消耗品の枠がいっぱいです。<b>${target.face} ${target.name}</b> と入れ替えるアイテムを選んでください</div>
         <div class="shop-items">${releaseHtml}</div>
         <div class="shop-actions"><button class="btn small indigo" data-cancelswapitem="1">← やめる</button></div>`;
      return;
    }
    if (pendingSwapId) {
      // 枠が埋まっている状態で妖怪を購入しようとした→誰を手放すか選ぶ画面
      const target = MJ.YOKAI[pendingSwapId];
      const releaseHtml = game.yokai.map((id) => {
        const y = MJ.YOKAI[id];
        return `<div class="offer"><span class="face">${y.face}</span><div class="info"><div class="n">${y.name} ${"★".repeat(y.rarity)}</div><div class="d">${y.desc}</div></div><button class="btn small discard" data-release="${id}">手放す</button></div>`;
      }).join("");
      $("shop").innerHTML =
        `<h2>🏮 妖怪の市 🏮</h2>
         <div class="swap-note">妖怪枠がいっぱいです。<b>${target.face} ${target.name}</b> と入れ替える妖怪を選んでください</div>
         <div class="shop-items">${releaseHtml}</div>
         <div class="shop-actions"><button class="btn small indigo" data-cancelswap="1">← やめる</button></div>`;
      return;
    }
    // ★D48: 妖怪と消耗品は「同じ上枠」からスロット順(shop.order)で混在表示する。
    const yokaiOfferHtml = (id) => {
      const y = MJ.YOKAI[id]; const price = game.yokaiPrice(id); const afford = game.koban >= price;
      const disc = price < y.price ? `<span class="disc">${y.price}</span>` : "";
      // ★D58 進化(A25): 進化元を上書きするため枠を消費しない＝枠フルでも「LvUP」で直接購入
      const isEvo = !!y.evolvesFrom && game.yokai.includes(y.evolvesFrom);
      const evoNote = isEvo ? `<div class="d evo-note">⤴ ${MJ.YOKAI[y.evolvesFrom].face}${MJ.YOKAI[y.evolvesFrom].name} から進化（上書き）</div>` : "";
      const label = isEvo ? `⤴ LvUP ${disc}${price}小判` : (slotsFull ? `入替 ${disc}${price}小判` : `${disc}${price}小判`); // 入替も購入と同額を消費するため価格を明示
      return `<div class="offer"><span class="face">${y.face}</span><div class="info"><div class="n">${y.name} ${"★".repeat(y.rarity)}</div><div class="d">${y.desc}</div>${evoNote}</div><button class="btn small ${isEvo || slotsFull ? "indigo" : "gold"}" ${afford ? "" : "disabled"} data-buy="${id}">${label}</button></div>`;
    };
    const itemOfferHtml = (o) => {
      const it = MJ.ITEMS[o.id]; const afford = game.koban >= o.price;
      const label = itemSlotsFull ? `入替 ${o.price}小判` : `${o.price}小判`;
      return `<div class="offer item-offer"><span class="face">${it.face}</span><div class="info"><div class="n">${it.name} ${"★".repeat(it.rarity)} <span class="kind-tag">道具</span></div><div class="d">${it.desc}</div></div><button class="btn small ${itemSlotsFull ? "indigo" : "gold"}" ${afford ? "" : "disabled"} data-buyitem="${o.id}">${label}</button></div>`;
    };
    const shopOrder = shop.order || [...shop.yokai.map((id) => ({ kind: "yokai", id })), ...(shop.items || []).map((o) => ({ kind: "item", id: o.id }))];
    const yokaiHtml = shopOrder
      .filter((e) => e.kind === "yokai" ? shop.yokai.includes(e.id) : (shop.items || []).some((x) => x.id === e.id))
      .map((e) => e.kind === "yokai" ? yokaiOfferHtml(e.id) : itemOfferHtml((shop.items || []).find((x) => x.id === e.id)))
      .join("");
    const teaFull = game.drawsLeft >= game.startDraws;
    const teaHtml = shop.tea ? `<div class="offer tile-offer"><span class="face">🍵</span><div class="info"><div class="n">お茶（ツモ +3）</div><div class="d">ツモ回数を3回復（現在 ${game.drawsLeft}/${game.startDraws}）</div></div><button class="btn small indigo" ${(!teaFull && game.koban >= game.teaPrice) ? "" : "disabled"} data-tea="1">${teaFull ? "満タン" : game.teaPrice + "小判"}</button></div>` : "";
    const kanroHtml = shop.kanro ? `<div class="offer tile-offer"><span class="face">✨</span><div class="info"><div class="n">甘露（ツモ全回復）</div><div class="d">ツモ回数を${game.startDraws}まで全回復（レア入荷）</div></div><button class="btn small gold" ${(!teaFull && game.koban >= shop.kanroPrice) ? "" : "disabled"} data-kanro="1">${shop.kanroPrice}小判</button></div>` : "";
    const furoshikiHtml = shop.furoshiki ? `<div class="offer tile-offer"><span class="face">🎒</span><div class="info"><div class="n">風呂敷（妖怪枠 +1）</div><div class="d">妖怪を持てる数が増える（現在 ${game.yokaiSlots}/10）</div></div><button class="btn small gold" ${game.koban >= game.furoshikiPrice ? "" : "disabled"} data-furoshiki="1">${game.furoshikiPrice}小判</button></div>` : "";
    // ★D53 招き鈴: 無料リロール+3回（ラン中持ち越し・即時反映）
    const suzuHtml = shop.suzu ? `<div class="offer tile-offer"><span class="face">🔔</span><div class="info"><div class="n">招き鈴（無料引き直し +3）</div><div class="d">市の引き直し無料回数を3回補充（現在 残${game.freeRerollAvailable()}回）</div></div><button class="btn small indigo" ${game.koban >= game.suzuPrice ? "" : "disabled"} data-suzu="1">${game.suzuPrice}小判</button></div>` : "";
    const drawsHtml = teaHtml + kanroHtml + furoshikiHtml + suzuHtml;
    // ★D53: 無料リロール=ラン中3回(共有ストック)＋提灯お化けの訪問毎3回。使い切ったら1小判
    const freeLeft = game.freeRerollAvailable();
    const rerollLabel = freeLeft > 0 ? `(無料 残${freeLeft})` : "(1小判)";
    $("shop").innerHTML =
      `<h2>🏮 妖怪の市 🏮</h2>
       <div class="resources"><span class="chip koban">小判 ${game.koban}</span></div>
       ${slotsFull ? '<div class="swap-note">妖怪枠がいっぱいです。妖怪を選ぶと入れ替え相手を選べます</div>' : ""}
       <div class="shop-items">${yokaiHtml}${drawsHtml}</div>
       <div class="shop-actions"><button class="btn small indigo" data-reroll="1">🎲 引き直し ${rerollLabel}</button><button class="btn small play" data-next="1">次の道中へ →</button></div>`;
  }

  function showScreen() {
    const inTitle = screen === "title";
    $("title").classList.toggle("hidden", !inTitle);
    ["topbar", "yokai-bar", "item-bar", "peek", "preview", "melds", "hand", "tsumo", "actions", "message", "shop"].forEach((id) => $(id).classList.toggle("hidden", inTitle));
    if (inTitle) $("overlay").classList.add("hidden");
  }
  function showByPhase() {
    // ★D38 clearフェーズ中も盤面・ショップは隠す（クリア画面オーバーレイを前面に）
    const hideBoard = game.phase === "shop" || game.phase === "clear";
    const inShop = game.phase === "shop";
    ["peek", "preview", "melds", "hand", "tsumo", "actions"].forEach((id) => $(id).classList.toggle("hidden", hideBoard));
    $("shop").classList.toggle("hidden", !inShop);
  }

  function renderOverlay() {
    const ov = $("overlay");
    // ★D38 ステージクリア画面（撃破→報酬確認→市へ）。決着(won/lost)とは別の「間」。
    if (game.phase === "clear") {
      const ci = game.clearInfo || {};
      ov.className = "overlay clear";
      const bossFlair = ci.boss ? `<p class="boss-flair">👹 ボス撃破！ 市を出るとツモが多めに回復します</p>` : "";
      const interestLine = ci.interest > 0 ? `<span class="reward-sub">（基本3 ＋ 利子 ${ci.interest}）</span>` : "";
      const nextLabel = game.mode === "endless" ? `${game.roundIndex + 2}戦目` : `道中 ${game.roundIndex + 2}/${MJ.CAMPAIGN_LENGTH}`;
      // ★A1 v3 事前告知(§10-4): 次の戦いがボス+gimmickありなら、クリア画面で先に開示する（Balatro式フェアネス）。
      const nb = ci.nextBoss;
      const nextBossHtml = nb
        ? `<div class="next-boss-warn" data-nextgimmick="${nb.gimmick}">⚠ 次のボス『${nb.name}』は【${nb.gimmickName}】: ${nb.gimmickDesc}</div>`
        : "";
      // ★A2(§6・§8) ボスドロップ: 2択カード(data-drop)＋「受け取らない」。枠フル時は入れ替え選択へ。
      let dropHtml = "";
      if (pendingDropIdx != null && ci.drops) {
        const dropId = ci.drops[pendingDropIdx];
        const dropDef = MJ.ITEMS[dropId];
        const releaseHtml = game.items.map((id, ix) => {
          const it = MJ.ITEMS[id];
          return `<div class="offer"><span class="face">${it.face}</span><div class="info"><div class="n">${it.name} ${"★".repeat(it.rarity)}</div><div class="d">${it.desc}</div></div><button class="btn small discard" data-releaseitem="${ix}">手放す</button></div>`;
        }).join("");
        dropHtml = `<div class="drop-choice"><div class="swap-note">消耗品の枠がいっぱいです。<b>${dropDef.face} ${dropDef.name}</b> と入れ替えるアイテムを選んでください</div><div class="shop-items">${releaseHtml}</div><button class="btn small indigo" data-canceldrop="1">← やめる</button></div>`;
      } else if (ci.drops && ci.drops.length) {
        const cards = ci.drops.map((id, ix) => {
          const it = MJ.ITEMS[id];
          return `<div class="offer drop-card" data-drop="${ix}"><span class="face">${it.face}</span><div class="info"><div class="n">${it.name} ${"★".repeat(it.rarity)}</div><div class="d">${it.desc}</div></div></div>`;
        }).join("");
        dropHtml = `<div class="drop-choice"><div class="drop-title">🎁 ボスドロップ：どちらか1つを選べます</div><div class="shop-items">${cards}</div><button class="btn small indigo" data-skipdrop="1">受け取らない</button></div>`;
      }
      ov.innerHTML = `<div class="card clear-card"><div class="emoji">🎊</div><h1>${ci.enemyName} を撃破！</h1>${bossFlair}<div class="reward-big">報酬 🪙 +${ci.reward} 小判 ${interestLine}</div><p class="next-note">次は ${nextLabel}</p>${nextBossHtml}${dropHtml}<button class="btn play gold" data-toshop="1">▶ 妖怪の市へ</button></div>`;
      return;
    }
    const ended = game.phase === "won" || game.phase === "lost";
    if (!ended) { ov.className = "overlay hidden"; ov.innerHTML = ""; return; }
    const medalLine = `<div class="earned">獲得メダル 🏅 +${lastEarned}　（所持 ${meta.medals}）</div>`;
    if (game.phase === "won") {
      ov.className = "overlay win";
      // ★D53: 「このまま無限夜行へ続ける」は廃止（無限夜行はボス構成が異なる別モードのため、タイトルから新規ランで開始する）
      ov.innerHTML = `<div class="card"><div class="emoji">🎉🦊🏮</div><h1>百鬼夜行 制覇！</h1><p>全8戦を打ち切りました。<br>仲間の妖怪: ${game.yokai.length}体 ／ 総アガリ ${game.totalAgari}回</p>${medalLine}<p class="unlock-note">♾️ 無限夜行モードが解禁されました！<br>タイトルのモード選択から挑戦できます</p><button class="btn play" data-totitle="1">茶屋へ戻る（強化）</button></div>`;
    } else {
      ov.className = "overlay lose";
      const label = game.mode === "endless" ? `♾️ 無限夜行 ${game.roundIndex + 1}戦目「${game.currentRound().name}」` : `道中 ${game.roundIndex + 1}/${MJ.CAMPAIGN_LENGTH}「${game.currentRound().name}」`;
      ov.innerHTML = `<div class="card"><div class="emoji">👻💦</div><h1>力尽きた…</h1><p>${label}でツモ切れ。<br>クリア数: ${game.roundsCleared}戦</p>${medalLine}<button class="btn play" data-totitle="1">茶屋へ戻る（強化）</button></div>`;
    }
  }

  function render() {
    if (screen === "title") { showScreen(); renderTitle(); return; }
    showScreen();
    if (game.phase === "won" || game.phase === "lost") {
      const total = game.medalsEarned();
      const delta = total - awardedMedals;
      if (delta > 0) { meta.medals += delta; awardedMedals = total; lastEarned = delta; }
      if (game.phase === "won" && !meta.endlessUnlocked) meta.endlessUnlocked = true;
      saveMeta();
    }
    renderTopBar(); renderYokai(); renderItems();
    if (game.phase === "shop") renderShop();
    else if (game.phase !== "clear") { renderPeek(); renderBanner(); renderHand(); renderTsumo(); renderActions(); }
    showByPhase(); renderOverlay(); renderConfirm();
  }
  function renderBoard() { renderBanner(); renderHand(); renderTsumo(); renderActions(); }

  function setMessage(m) { $("message").textContent = m || ""; }
  function startRun(mode) {
    game = new MJ.Game({ meta, mode: mode || selectedMode });
    sel = null; callSelect = null; awardedMedals = 0; lastEarned = 0;
    itemPanelId = null; pendingShinzuu = null; pendingSwapItemId = null; pendingDropIdx = null; pendingConfirm = null;
    screen = "run"; setMessage(""); render();
  }
  function toTitle() { screen = "title"; sel = null; callSelect = null; itemPanelId = null; pendingShinzuu = null; pendingSwapItemId = null; pendingDropIdx = null; pendingConfirm = null; render(); }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-zone],[data-act],[data-buy],[data-release],[data-cancelswap],[data-tea],[data-kanro],[data-furoshiki],[data-suzu],[data-call],[data-kan],[data-callsel],[data-callcancel],[data-reroll],[data-next],[data-metabuy],[data-startrun],[data-totitle],[data-home],[data-mode],[data-help],[data-helptab],[data-helpclose],[data-acc],[data-yokaipanel],[data-unlockyokai],[data-toshop],[data-titletab],[data-itempanel],[data-usei],[data-discardi],[data-cancelshinzuu],[data-totile],[data-buyitem],[data-releaseitemshop],[data-cancelswapitem],[data-drop],[data-skipdrop],[data-releaseitem],[data-canceldrop],[data-confirmyes],[data-confirmno],[data-toggleconfirm],[data-settings],[data-settingsclose],[data-giveupstart],[data-giveupconfirm],[data-giveupcancel],[data-resetstart],[data-resetconfirm],[data-resetcancel]");
    if (!t) return;
    // 確認ダイアログの応答（他の操作より優先）
    if (t.dataset.confirmno) { pendingConfirm = null; renderConfirm(); return; }
    if (t.dataset.confirmyes) { const cb = pendingConfirm && pendingConfirm.onYes; pendingConfirm = null; renderConfirm(); if (cb) cb(); return; }
    // 確認ダイアログ表示中は背後の操作を無効化（誤タップ防止）
    if (pendingConfirm) return;
    // ---- ⚙ 設定オーバーレイ(D67) ----
    if (t.dataset.settings) { settingsOpen = true; settingsGiveupConfirm = false; settingsResetStep = 0; renderSettings(); return; } // 開くたびに確認ステップの途中状態をリセット
    if (t.dataset.settingsclose) { settingsOpen = false; settingsGiveupConfirm = false; settingsResetStep = 0; renderSettings(); return; }
    if (t.dataset.giveupstart) { settingsGiveupConfirm = true; renderSettings(); return; }
    if (t.dataset.giveupcancel) { settingsGiveupConfirm = false; renderSettings(); return; }
    if (t.dataset.giveupconfirm) { giveUpRun(); return; }
    if (t.dataset.resetstart) { settingsResetStep = 1; renderSettings(); return; }
    if (t.dataset.resetcancel) { settingsResetStep = 0; renderSettings(); return; }
    if (t.dataset.resetconfirm) { resetMetaData(); return; }
    if (t.dataset.titletab) { titleTab = t.dataset.titletab; renderTitle(); return; } // ★D41 タイトルのタブ切替
    if (t.dataset.toggleconfirm) { meta.confirmActions = !meta.confirmActions; saveMeta(); if (settingsOpen) renderSettings(); else renderTitle(); return; } // 確認画面ON/OFF（慣れた人向け・設定パネル内）
    if (t.dataset.toshop) { pendingDropIdx = null; callSelect = null; game.enterShop(); setMessage(""); render(); return; } // ★D38 クリア画面→妖怪の市
    if (t.dataset.yokaipanel) { yokaiPanelId = (yokaiPanelId === t.dataset.yokaipanel) ? null : t.dataset.yokaipanel; renderYokai(); return; }
    if (t.dataset.itempanel != null) { const i = parseInt(t.dataset.itempanel, 10); itemPanelId = (itemPanelId === i) ? null : i; pendingShinzuu = null; renderItems(); return; }
    if (t.dataset.usei != null) {
      const i = parseInt(t.dataset.usei, 10);
      const id = game.items[i];
      if (id === "shinzuu") { pendingShinzuu = { idx: i, handIdx: null }; itemPanelId = null; render(); return; }
      const r = game.useItem(i);
      setMessage(r.ok ? `${MJ.ITEMS[id].name}を使った` : (r.message || ""));
      if (r.ok) itemPanelId = null;
      render();
      return;
    }
    if (t.dataset.discardi != null) { game.discardItem(parseInt(t.dataset.discardi, 10)); itemPanelId = null; render(); return; }
    if (t.dataset.cancelshinzuu) { pendingShinzuu = null; render(); return; }
    if (t.dataset.totile) {
      if (pendingShinzuu && pendingShinzuu.handIdx != null) {
        const r = game.useItem(pendingShinzuu.idx, { handIdx: pendingShinzuu.handIdx, toCode: t.dataset.totile });
        setMessage(r.ok ? "📜 神通力の札で牌を変換した" : (r.message || ""));
        pendingShinzuu = null;
      }
      render();
      return;
    }
    if (t.dataset.buyitem) {
      if (game.items.length >= game.itemSlots) { pendingSwapItemId = t.dataset.buyitem; render(); return; }
      const r = game.buyItem(t.dataset.buyitem); setMessage(r.ok ? "消耗品を手に入れた！" : (r.message || "")); render(); return;
    }
    if (t.dataset.releaseitemshop != null) {
      const ix = parseInt(t.dataset.releaseitemshop, 10);
      const r = game.swapItem(ix, pendingSwapItemId);
      pendingSwapItemId = null;
      setMessage(r.ok ? `${MJ.ITEMS[r.gained].name}と入れ替えた！` : (r.message || "")); render(); return;
    }
    if (t.dataset.cancelswapitem) { pendingSwapItemId = null; render(); return; }
    if (t.dataset.drop != null) {
      const i = parseInt(t.dataset.drop, 10);
      const r = game.chooseDrop(i);
      if (r.full) { pendingDropIdx = i; }
      else { pendingDropIdx = null; setMessage(r.ok ? `${MJ.ITEMS[r.gained].name}を手に入れた！` : (r.message || "")); }
      render();
      return;
    }
    if (t.dataset.skipdrop) { if (game.clearInfo) game.clearInfo.drops = null; pendingDropIdx = null; render(); return; }
    if (t.dataset.releaseitem != null) {
      const ix = parseInt(t.dataset.releaseitem, 10);
      const dropId = game.clearInfo.drops[pendingDropIdx];
      const r = game.swapItem(ix, dropId);
      if (r.ok) game.clearInfo.drops = null;
      pendingDropIdx = null;
      setMessage(r.ok ? `${MJ.ITEMS[dropId].name}と入れ替えた！` : (r.message || "")); render(); return;
    }
    if (t.dataset.canceldrop) { pendingDropIdx = null; render(); return; }
    if (t.dataset.unlockyokai) { unlockYokai(t.dataset.unlockyokai); return; }
    if (t.dataset.help) { helpOpen = true; if (t.dataset.helptab) helpTab = t.dataset.helptab; renderHelp(); return; } // ★D65 タイトル/ゲーム中どちらからでも同じヘルプを開く
    if (t.dataset.helptab) { helpTab = t.dataset.helptab; renderHelp(); return; } // ヘルプ内のタブ切替
    if (t.dataset.acc) { const k = t.dataset.acc; if (helpAcc.has(k)) helpAcc.delete(k); else helpAcc.add(k); renderHelp(); return; } // ★D66 アコーディオン開閉
    if (t.dataset.helpclose) { helpOpen = false; helpAcc.clear(); renderHelp(); return; } // ヘルプを閉じたらアコーディオン開閉状態もリセット
    if (t.dataset.metabuy) return buyMeta(t.dataset.metabuy);
    if (t.dataset.mode) { selectedMode = t.dataset.mode; renderTitle(); return; }
    if (t.dataset.startrun) return startRun();
    if (t.dataset.totitle || t.dataset.home) return toTitle();
    if (t.dataset.callsel) { // ★D66 鳴きボタン刷新: ポン/チー/カンの選択モード切替（候補が無い種類は選べない）
      const type = t.dataset.callsel;
      const has = type === "kan" ? game.kanOptions().length > 0 : game.callOptions().some((o) => o.type === type);
      if (!has) return;
      callSelect = (callSelect === type) ? null : type;
      renderBoard();
      return;
    }
    if (t.dataset.callcancel) { callSelect = null; renderBoard(); return; }
    if (t.dataset.call != null) return doCall(parseInt(t.dataset.call, 10));
    if (t.dataset.kan != null) return doKan(parseInt(t.dataset.kan, 10));
    if (t.dataset.zone) return onTile(t.dataset.zone, parseInt(t.dataset.i, 10));
    if (t.dataset.act === "draw") return doDraw();
    if (t.dataset.act === "redeal") return doRedeal();
    if (t.dataset.act === "rerolltsumo") return doRerollTsumo();
    if (t.dataset.act === "autowin") { game.arrangeWin(); callSelect = null; setMessage("🀄 最高得点のアガリ形に組みました"); render(); return; }
    if (t.dataset.act === "agari") return doAgari();
    if (t.dataset.buy) {
      // ★D58 進化(A25)は下位を上書きするため入替フロー不要（枠フルでも直接購入）
      const isEvo = MJ.YOKAI[t.dataset.buy] && MJ.YOKAI[t.dataset.buy].evolvesFrom && game.yokai.includes(MJ.YOKAI[t.dataset.buy].evolvesFrom);
      if (!isEvo && game.yokai.length >= game.yokaiSlots) { pendingSwapId = t.dataset.buy; render(); return; }
      const r = game.buyYokai(t.dataset.buy);
      setMessage(r.ok ? (r.evolved ? `⤴ ${MJ.YOKAI[r.released].name}が${MJ.YOKAI[t.dataset.buy].name}に進化した！` : "妖怪を仲間にした！") : (r.message || ""));
      render(); return;
    }
    if (t.dataset.release) {
      const r = game.swapYokai(t.dataset.release, pendingSwapId);
      pendingSwapId = null;
      setMessage(r.ok ? `${MJ.YOKAI[r.gained].name}と入れ替えた！` : (r.message || "")); render(); return;
    }
    if (t.dataset.cancelswap) { pendingSwapId = null; render(); return; }
    if (t.dataset.tea) { const r = game.buyTea(); setMessage(r.ok ? "🍵 ツモが3回復した" : (r.message || "")); render(); return; }
    if (t.dataset.kanro) { const r = game.buyKanro(); setMessage(r.ok ? "✨ ツモが全回復した！" : (r.message || "")); render(); return; }
    if (t.dataset.furoshiki) { const r = game.buyFuroshiki(); setMessage(r.ok ? "🎒 妖怪枠が1つ増えた！" : (r.message || "")); render(); return; }
    if (t.dataset.suzu) { const r = game.buySuzu(); setMessage(r.ok ? "🔔 無料引き直しが3回増えた！" : (r.message || "")); render(); return; }
    if (t.dataset.reroll) { pendingSwapId = null; pendingSwapItemId = null; const r = game.reroll(); setMessage(r.ok ? "" : (r.message || "")); render(); return; }
    if (t.dataset.next) { game.leaveShop(); sel = null; callSelect = null; pendingSwapId = null; pendingSwapItemId = null; setMessage(""); render(); return; }
  });

  function onTile(zone, i) {
    // ★A2 神通力の札: 2段階選択の1段階目（手牌の対象牌を選ぶ）。通常の手牌⇔ツモ交換より優先。
    if (pendingShinzuu && pendingShinzuu.handIdx == null) {
      if (zone !== "hand") return;
      pendingShinzuu = { idx: pendingShinzuu.idx, handIdx: i };
      renderItems();
      return;
    }
    // ★D24: 鳴き直後は手牌タップ＝1枚捨てて確定（ツモが無料リフレッシュ）
    if (game.mustDiscard) {
      if (zone !== "hand") return;
      const r = game.discardForCall(i);
      if (r.ok) setMessage("🀄 鳴き成立！ツモが新しくなった（ツモ回数は消費なし）");
      sel = null;
      callSelect = null; // ★D66 プール更新につき鳴き選択モードをリセット
      render();
      return;
    }
    if (!sel) { sel = { zone, i }; }
    else if (sel.zone === zone) { sel = (sel.i === i) ? null : { zone, i }; }
    else {
      const hi = zone === "hand" ? i : sel.i;
      const ti = zone === "tsumo" ? i : sel.i;
      game.swapTile(hi, ti);
      sel = null;
    }
    renderBoard();
  }

  function unlockYokai(id) {
    const y = MJ.YOKAI[id];
    if (!y || !y.unlock || meta.unlockedYokai.includes(id)) return;
    if (meta.medals < y.unlock.cost) return;
    meta.medals -= y.unlock.cost;
    meta.unlockedYokai.push(id);
    saveMeta();
    renderTitle();
  }
  function buyMeta(id) {
    const lv = meta.upgrades[id] || 0;
    const cost = MJ.metaNextCost(id, lv);
    if (cost === null || meta.medals < cost) return;
    meta.medals -= cost; meta.upgrades[id] = lv + 1; saveMeta(); renderTitle();
  }

  function doRedeal() {
    showConfirm({
      message: `🔄 手牌を引き直しますか？<br><span class="confirm-sub">今の手牌とツモは新しく引き直されます（残り ${game.mulligansLeft} 回）</span>`,
      yesLabel: "引き直す",
      onYes: () => {
        const res = game.redealHand();
        sel = null;
        callSelect = null; // ★D66 手牌・プール総入れ替えにつきリセット
        setMessage(res.ok ? "🔄 手牌を引き直した" : (res.message || ""));
        render();
      },
    });
  }
  // 化け草鞋のツモ引き直しは影響が小さい（手牌は崩れない）ため確認なしで即実行。
  // 確認を出すのは手牌ごと引き直すすねこすり(doRedeal)側だけ（誤タップ時の影響が大きい）。
  function doRerollTsumo() {
    const res = game.rerollTsumo();
    sel = null;
    callSelect = null; // ★D66 プール更新につきリセット
    setMessage(res.ok ? "🔄 ツモを引き直した（無料）" : (res.message || ""));
    render();
  }
  function doCall(k) {
    const opts = game.callOptions();
    if (k < 0 || k >= opts.length) return;
    const o = opts[k];
    // 鳴きは門前が崩れる不可逆な操作→確認（誤タップ防止）
    const useNote = o.type === "chi" && o.use ? `（手牌 ${o.use.map((c) => MJ.tileLabelCode(c)).join("・")} を使用）` : "";
    showConfirm({
      message: `🀄 「${o.label}」で鳴きますか？${useNote}<br><span class="confirm-sub">鳴くと門前が崩れ、門前役（ツモ・平和・七対子など）が付かなくなります。</span>`,
      yesLabel: "鳴く",
      onYes: () => {
        const r = game.call(o);
        sel = null;
        callSelect = null; // ★D66 実行後は鳴き選択モードをリセット
        setMessage(r.ok ? `${o.label}！ 捨てる牌を選んでください` : (r.message || ""));
        render();
      },
    });
  }
  // ★D61 カン（暗槓）。不可逆（槓子固定）＋資源に触れる操作なので確認を挟む
  function doKan(k) {
    const opts = game.kanOptions();
    if (k < 0 || k >= opts.length) return;
    const o = opts[k];
    showConfirm({
      message: `🀄 「${o.label}」しますか？<br><span class="confirm-sub">槓子は固定され手替えできません。ドラが1枚公開され、ツモが無料で新しくなります。</span>`,
      yesLabel: "カンする",
      onYes: () => {
        const r = game.declareKan(o);
        sel = null;
        callSelect = null; // ★D66 実行後は鳴き選択モードをリセット
        setMessage(r.ok ? `${o.label}！ 🎴 カンドラ公開: ${H.tileLabel(r.dora)}` : (r.message || ""));
        render();
      },
    });
  }
  function doDraw() {
    // アガリ可能な状態でツモを引くと今の和了形を捨ててしまう→確認（誤タップ防止）
    if (game.agariInfo().agari) {
      showConfirm({
        message: `🎉 今アガれる手です！<br><span class="confirm-sub">このままツモを引くと、今の和了形は崩れます。<br>アガらずにツモを引きますか？</span>`,
        yesLabel: "ツモを引く",
        noLabel: "やめる（アガる）",
        onYes: () => execDraw(),
      });
      return;
    }
    execDraw();
  }
  function execDraw() {
    const res = game.drawTsumo();
    sel = null;
    callSelect = null; // ★D66 プール更新につきリセット
    if (res.lossNegated) setMessage("🧱 ぬりかべが敗北を防いだ！ツモを回復。");
    else setMessage(res.ok ? "" : (res.message || ""));
    render();
  }
  function doAgari() {
    const res = game.declareAgari();
    if (!res.ok) { setMessage(res.message || ""); render(); return; }
    const yaku = res.yaku.map((y) => y.name).join("・");
    let msg = `🎉 ${MJ.tileLabelCode(res.winTile)}でアガリ +${res.score.toLocaleString()}点（${hanFuLabel(res)}: ${yaku}）`;
    if (res.roundCleared) msg += res.runWon ? " ／ 最終戦クリア！" : ` ／ クリア報酬 ${res.reward.total}小判`;
    if (res.lossNegated) msg += " 🧱ぬりかべ発動";
    sel = null;
    callSelect = null; // ★D66 アガリで手牌・プールが更新されるためリセット
    setMessage(msg); render();
  }

  render();
  renderHelp();
  renderSettings();
})();
