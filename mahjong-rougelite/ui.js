/* ゆるかわ百鬼夜行 v0.2 — ブラウザUI（手牌13＋ツモ5・自由交換） */
(function () {
  "use strict";
  const MJ = window.MJ;
  const H = window.MJHand;

  const SUIT_KANJI = { m: "萬", p: "筒", s: "索" };
  const META_KEY = "yurukawa_mj_meta";
  function loadMeta() { try { const s = localStorage.getItem(META_KEY); if (s) return JSON.parse(s); } catch (e) {} return { medals: 0, upgrades: {}, endlessUnlocked: false, unlockedYokai: [] }; }
  function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {} }

  let meta = loadMeta();
  if (meta.endlessUnlocked === undefined) meta.endlessUnlocked = false;
  if (!Array.isArray(meta.unlockedYokai)) meta.unlockedYokai = []; // 旧セーブ互換
  let screen = "title";
  let game = null;
  let sel = null; // 交換選択 {zone:'hand'|'tsumo', i}
  let pendingSwapId = null; // 妖怪枠が埋まっている時に購入しようとした妖怪id（誰を手放すか選択中）
  let awardedMedals = 0; // このラン中に既にmeta.medalsへ加算した累計（継続時の二重付与防止）
  let lastEarned = 0;
  let selectedMode = "campaign"; // タイトルで選ぶ次ランのモード
  let helpOpen = false; // 遊び方（チュートリアル）表示中
  let yokaiPanelId = null; // タップで選択中の妖怪id（その1体の効果だけ表示・スマホ対応）
  let titleTab = "chaya"; // ★D41 タイトルのタブ: "chaya"(妖怪茶屋) / "zukan"(妖怪図鑑)
  // ---- ★A2 消耗品アイテム関連のUI状態 ----
  let itemPanelId = null; // タップで選択中のアイテム枠index（効果表示＋使う/捨てるボタン）
  let pendingShinzuu = null; // 神通力の札の2段階選択 {idx, handIdx}（handIdx未定なら手牌選択待ち・定まれば変換先選択待ち）
  let pendingSwapItemId = null; // アイテム枠が埋まっている時に購入しようとしたアイテムid（誰を手放すか選択中）
  let pendingDropIdx = null; // アイテム枠が埋まっている時のボスドロップ選択index（誰を手放すか選択中）

  const $ = (id) => document.getElementById(id);

  // ★テストプレイヤー向けチュートリアル（麻雀既習者向け: 役の説明は省略、本作特有ルールに絞る）
  function helpHtml() {
    return `<div class="help-panel">
      <h2>❓ 遊び方（テストプレイヤー向け）</h2>
      <p class="help-lead">麻雀のルールは知っている前提で、<b>このゲーム特有の仕様</b>だけ説明します。</p>

      <h3>🎯 目的</h3>
      <ul>
        <li>ソロ麻雀ローグライト。<b>アガリの点数で敵妖怪のHP（目標点）を削る</b>。目標点に届いたら道中クリア。</li>
        <li>「百鬼夜行」= 全8戦（3戦ごとにボス）を制覇すれば勝利。初回制覇で「無限夜行」（スコアアタック）が解禁。</li>
        <li>点数計算は<b>ほぼ標準ルール</b>（翻・符、満貫8000/跳満12000/…/役満32000）。全てツモ和了扱い・ロンなし。</li>
      </ul>

      <h3>🀄 手牌の進め方（本作の独自ループ）</h3>
      <ul>
        <li><b>手牌13枚＋ツモプール5枚</b>が常に見えている。タップで<b>手牌⇔プールを自由交換</b>（何回でも無料）。</li>
        <li>プールの1枚で手が完成していれば「🎉 アガリ」ボタンが光る。</li>
        <li>良い牌が無ければ「🀄 ツモを引く」でプール5枚を総入れ替え。<b>これが消耗リソース</b>。</li>
        <li>テンパイすると待ち牌・山の残り枚数・アガった場合の点数が自動表示される。</li>
      </ul>

      <h3>💧 ツモ回数＝HP（最重要）</h3>
      <ul>
        <li>ツモ回数は<b>ラン全体で持ち越し</b>。開始15、<b>ステージ間は+3しか回復しない</b>（ボス撃破後は+6）。上限15。</li>
        <li>0になった時、手牌とツモを組み替えてもアガれない場合に<b>ゲームオーバー</b>（最後のツモも判定に含みます）。</li>
        <li>ショップの🍵お茶(+3回復・買うたび値上がり)と✨甘露(全回復・レア入荷)で延命できる。</li>
        <li>つまり<b>速くアガるほど残りツモ＝体力が温存される</b>。</li>
      </ul>

      <h3>🗣 鳴き（ポン/チー）＝ツモの節約</h3>
      <ul>
        <li>手牌2枚＋プール1枚で刻子/順子が完成する時、プール下に「ポン/チー」ボタンが出る。</li>
        <li>鳴く → 面子を晒す → 1枚捨てる → <b>プール5枚が無料で新しくなる（ツモ回数を消費しない）</b>。</li>
        <li>代わりに門前が崩れる: 門前ツモ・平和・七対子・一盃口/二盃口・四暗刻などが消え、喰い下がりも通常通り。</li>
        <li><b>役が無いとアガれない</b>ので、鳴くなら役の当てを（喰いタン・対々和・混一色など）。待ち表示に「役なし」と出たら注意。</li>
        <li>ロンが無いので対々和は鳴き経由でのみ成立（門前4刻子は四暗刻に昇格）。カンは無し。</li>
      </ul>

      <h3>🌪 場風ローテーション</h3>
      <ul>
        <li>2戦ごとに東場→南場→西場→北場と巡る（画面上部にバッジ表示）。</li>
        <li>役牌は<b>三元牌と「場風」のみ</b>（本家準拠）。<b>場風の刻子は2翻</b>（ソロなので自風＝場風のダブ扱い）。場風以外の風（客風）は役なしです。</li>
      </ul>

      <h3>👻 妖怪（ジョーカー）とお金</h3>
      <ul>
        <li>道中クリアごとにショップ。<b>小判</b>で妖怪（翻/符/点数を強化・サポート効果）や回復を買う。</li>
        <li>妖怪枠は5（拡張可）。枠が埋まっていても<b>入れ替え購入</b>できる。</li>
        <li>ラン終了時（負けても）<b>メダル</b>を獲得 → タイトルの「妖怪茶屋」で恒久強化。<b>負けて強くなる設計</b>なので気軽に死んでOK。</li>
      </ul>

      <h3>📝 フィードバックで知りたいこと</h3>
      <ul>
        <li>難易度: 何ステージまで行けたか／理不尽 or ぬるいと感じた場面</li>
        <li>テンポ: 操作がだるい・待たされると感じた瞬間</li>
        <li>鳴き・お茶・妖怪の「使いたくなる度」／点数や役判定がおかしいと感じた手（スクショ歓迎）</li>
      </ul>
      <button class="btn play start-btn" data-helpclose="1">← タイトルへ戻る</button>
    </div>`;
  }
  function renderTitle() {
    if (helpOpen) { $("title").innerHTML = helpHtml(); return; }
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
      return `<div class="offer${owned ? "" : " locked-yokai"}"><span class="face">${owned ? y.face : "❓"}</span><div class="info"><div class="n">${y.name} ${"★".repeat(y.rarity)} <span class="stage-gate">ステージ${y.unlock.minStage}〜</span></div><div class="d">${y.desc}</div></div>${btn}</div>`;
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
       <button class="btn small indigo help-open" data-help="1">❓ 遊び方（はじめての方へ）</button>
       <button class="btn play start-btn" data-startrun="1">▶ ${selectedMode === "endless" ? "無限夜行へ出発" : "百鬼夜行へ出発"}</button>
       <div class="meta-note">手牌13枚とツモ5枚を自由に交換。ツモの1枚で手が完成＝アガリ！役と翻で得点。</div>`;
  }

  function tileHtml(code, index, zone, extraCls) {
    const s = (sel && sel.zone === zone && sel.i === index) ? " selected" : "";
    const t = { suit: code[0], rank: parseInt(code.slice(1)) };
    const cls = t.suit === "z" ? "z" : t.suit;
    const body = t.suit === "z" ? `<span class="num">${MJ.tileLabelCode(code)}</span>` : `<span class="num">${t.rank}</span><span class="suit">${SUIT_KANJI[t.suit]}</span>`;
    return `<div class="tile ${cls}${s}${extraCls || ""}" data-zone="${zone}" data-i="${index}">${body}</div>`;
  }

  function renderTopBar() {
    const r = game.currentRound();
    // ★A2: 破魔矢(gimmick無効化)/数珠(目標-20%)の効果を即座に反映するため、表示値はeffectiveGimmick/effectiveTargetを使う。
    const gimmick = game.effectiveGimmick();
    const target = game.effectiveTarget();
    const pct = Math.min(100, Math.round((game.roundScore / target) * 100));
    // ★A1: ボスラウンドかつgimmickありの時だけ警告バッジを表示（通常戦では出さない。破魔矢使用後はgimmickがnullになり消える）
    const gimmickHtml = (r.boss && gimmick)
      ? `<span class="gimmick-badge" data-gimmick="${gimmick}">⚠${MJ.BOSS_GIMMICKS[gimmick].name}: ${MJ.BOSS_GIMMICKS[gimmick].desc}</span>`
      : "";
    $("topbar").innerHTML =
      `<div class="title"><span class="home" data-home="1">🏠</span> ゆるかわ百鬼夜行 <span class="sub">🏅${meta.medals}</span></div>
       <div class="round-row"><span class="round-name ${r.boss ? "boss" : ""}">${game.mode === "endless" ? `♾️ ${game.roundIndex + 1}戦目` : `道中 ${game.roundIndex + 1}/${MJ.CAMPAIGN_LENGTH}`} ${r.name} <span class="ba-wind">${r.windName}</span></span><span class="stat">目標 ${target}</span></div>
       ${gimmickHtml}
       <div class="bar"><span style="width:${pct}%"></span></div>
       <div class="score-line">得点 ${game.roundScore} / ${target}</div>
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
    const peek = p.length ? `👁 山の次 → ` + p.map((c) => `<b>${MJ.tileLabelCode(c)}</b>`).join(" ") : "";
    $("peek").innerHTML = [dora, peek].filter(Boolean).join("　");
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
    if (info.agari) {
      const yaku = info.yaku.map((y) => `${y.name}${y.han}翻`).join("・");
      const limitCls = info.limit ? " limit" : "";
      el.innerHTML = `<div class="agari-banner"><div class="big${limitCls}">🎉 ${MJ.tileLabelCode(info.winTile)} でアガリ！ ${info.score.toLocaleString()}点</div><div class="calc">${hanFuLabel(info)}</div><div class="detail">${yaku}</div></div>`;
      return;
    }
    // ★D1: 待ち牌ごとの点数プレビュー（残枚数＋アガった場合の点数）
    const previews = game.waitPreviews();
    if (previews.length) {
      // ★A1 v3 のっぺらぼう(nopperabou): waitCountsが空になり残数countがnull/undefinedになる→「残?」表示
      const list = previews.map((p) => {
        const countLabel = p.count == null ? "残?" : `残${p.count}`;
        return p.yakuless
          ? `<span class="wait yakuless">${H.tileLabel(p.tile)}<span class="wcount">${countLabel}</span><span class="wscore">役なし</span></span>`
          : `<span class="wait">${H.tileLabel(p.tile)}<span class="wcount">${countLabel}</span><span class="wscore">${p.limit ? p.limit : p.score.toLocaleString() + "点"}</span></span>`;
      }).join(" ");
      el.innerHTML = `<div class="tenpai">🀄 <b>テンパイ！</b> 待ち: ${list} <br>この牌がツモに来れば「アガリ」</div>`;
      return;
    }
    const openNote = game.melds.length > 0 ? "<br><span class=\"open-note\">⚠ 鳴きあり: 門前役(ツモ/平和/七対子等)は付きません。役が無いとアガれません</span>" : "";
    el.innerHTML = `<span class="invalid">手牌をテンパイに。ツモの良い牌をタップ→手牌の要らない牌をタップで交換${openNote}</span>`;
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
    $("hand").innerHTML = game.hand.map((c, i) => tileHtml(c, i, "hand")).join("");
  }
  function renderTsumo() {
    const info = game.agariInfo();
    const win = info.agari ? info.winTile : null;
    const useful = new Set(game.usefulTsumo());
    let used = false;
    const tiles = game.tsumo.map((c, i) => {
      const isWin = (c === win && !used);
      if (isWin) used = true;
      const extra = isWin ? " drawn" : (useful.has(i) ? " useful" : "");
      return tileHtml(c, i, "tsumo", extra);
    }).join("");
    // ★D24: 鳴き候補ボタン（ポン/チー）
    // ★D35: チーは同一面子ラベルでも消費する手牌が異なる別選択肢になり得るため、消費手牌を併記して区別可能にする
    const calls = game.callOptions();
    const callHtml = calls.length
      ? `<div class="call-row">${calls.map((o, k) => {
          const useNote = o.type === "chi"
            ? `<span class="call-use">手牌 ${o.use.map((c) => MJ.tileLabelCode(c)).join("・")}</span>`
            : "";
          return `<button class="btn small call-btn" data-call="${k}">${o.label}${useNote}</button>`;
        }).join("")}</div>`
      : "";
    $("tsumo").innerHTML = `<span class="tsumo-label">ツモ${game.tsumo.length}枚</span>${tiles}${callHtml}`;
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
      const label = slotsFull ? "入替" : `${disc}${price}小判`;
      return `<div class="offer"><span class="face">${y.face}</span><div class="info"><div class="n">${y.name} ${"★".repeat(y.rarity)}</div><div class="d">${y.desc}</div></div><button class="btn small ${slotsFull ? "indigo" : "gold"}" ${afford ? "" : "disabled"} data-buy="${id}">${label}</button></div>`;
    };
    const itemOfferHtml = (o) => {
      const it = MJ.ITEMS[o.id]; const afford = game.koban >= o.price;
      const label = itemSlotsFull ? "入替" : `${o.price}小判`;
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
    const drawsHtml = teaHtml + kanroHtml + furoshikiHtml;
    const freeLimit = game.yokai.includes("chochin") ? MJ.YOKAI.chochin.flags.freeRerollLimit : 0;
    const freeLeft = Math.max(0, freeLimit - (game.freeRerollsUsed || 0));
    const rerollLabel = freeLeft > 0 ? `(無料 残${freeLeft})` : "(1小判)";
    $("shop").innerHTML =
      `<h2>🏮 妖怪の市 🏮</h2>
       <div class="resources"><span class="chip koban">小判 ${game.koban}</span><span class="slots">妖怪枠 ${game.yokai.length}/${game.yokaiSlots}</span><span class="slots">道具枠 ${game.items.length}/${game.itemSlots}</span></div>
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
      const endlessBtn = `<button class="btn play gold" data-continueendless="1">♾️ このまま無限夜行へ続ける</button>`;
      ov.innerHTML = `<div class="card"><div class="emoji">🎉🦊🏮</div><h1>百鬼夜行 制覇！</h1><p>全8戦を打ち切りました。<br>仲間の妖怪: ${game.yokai.length}体 ／ 総アガリ ${game.totalAgari}回</p>${medalLine}<p class="unlock-note">♾️ 無限夜行モードが解禁されました！</p>${endlessBtn}<button class="btn play" data-totitle="1">茶屋へ戻る（強化）</button></div>`;
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
    showByPhase(); renderOverlay();
  }
  function renderBoard() { renderBanner(); renderHand(); renderTsumo(); renderActions(); }

  function setMessage(m) { $("message").textContent = m || ""; }
  function startRun(mode) {
    game = new MJ.Game({ meta, mode: mode || selectedMode });
    sel = null; awardedMedals = 0; lastEarned = 0;
    itemPanelId = null; pendingShinzuu = null; pendingSwapItemId = null; pendingDropIdx = null;
    screen = "run"; setMessage(""); render();
  }
  function doContinueEndless() {
    game.mode = "endless";
    game.enterShop();
    render();
  }
  function toTitle() { screen = "title"; sel = null; itemPanelId = null; pendingShinzuu = null; pendingSwapItemId = null; pendingDropIdx = null; render(); }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-zone],[data-act],[data-buy],[data-release],[data-cancelswap],[data-tea],[data-kanro],[data-furoshiki],[data-call],[data-reroll],[data-next],[data-metabuy],[data-startrun],[data-totitle],[data-home],[data-mode],[data-continueendless],[data-help],[data-helpclose],[data-yokaipanel],[data-unlockyokai],[data-toshop],[data-titletab],[data-itempanel],[data-usei],[data-discardi],[data-cancelshinzuu],[data-totile],[data-buyitem],[data-releaseitemshop],[data-cancelswapitem],[data-drop],[data-skipdrop],[data-releaseitem],[data-canceldrop]");
    if (!t) return;
    if (t.dataset.titletab) { titleTab = t.dataset.titletab; renderTitle(); return; } // ★D41 タイトルのタブ切替
    if (t.dataset.toshop) { pendingDropIdx = null; game.enterShop(); setMessage(""); render(); return; } // ★D38 クリア画面→妖怪の市
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
    if (t.dataset.help) { helpOpen = true; renderTitle(); return; }
    if (t.dataset.helpclose) { helpOpen = false; renderTitle(); return; }
    if (t.dataset.metabuy) return buyMeta(t.dataset.metabuy);
    if (t.dataset.mode) { selectedMode = t.dataset.mode; renderTitle(); return; }
    if (t.dataset.startrun) return startRun();
    if (t.dataset.continueendless) return doContinueEndless();
    if (t.dataset.totitle || t.dataset.home) return toTitle();
    if (t.dataset.call != null) return doCall(parseInt(t.dataset.call, 10));
    if (t.dataset.zone) return onTile(t.dataset.zone, parseInt(t.dataset.i, 10));
    if (t.dataset.act === "draw") return doDraw();
    if (t.dataset.act === "redeal") return doRedeal();
    if (t.dataset.act === "rerolltsumo") return doRerollTsumo();
    if (t.dataset.act === "autowin") { game.arrangeWin(); setMessage("🀄 最高得点のアガリ形に組みました"); render(); return; }
    if (t.dataset.act === "agari") return doAgari();
    if (t.dataset.buy) {
      if (game.yokai.length >= game.yokaiSlots) { pendingSwapId = t.dataset.buy; render(); return; }
      const r = game.buyYokai(t.dataset.buy); setMessage(r.ok ? "妖怪を仲間にした！" : (r.message || "")); render(); return;
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
    if (t.dataset.reroll) { pendingSwapId = null; pendingSwapItemId = null; const r = game.reroll(); setMessage(r.ok ? "" : (r.message || "")); render(); return; }
    if (t.dataset.next) { game.leaveShop(); sel = null; pendingSwapId = null; pendingSwapItemId = null; setMessage(""); render(); return; }
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
    const res = game.redealHand();
    sel = null;
    setMessage(res.ok ? "🔄 手牌を引き直した" : (res.message || ""));
    render();
  }
  function doRerollTsumo() {
    const res = game.rerollTsumo();
    sel = null;
    setMessage(res.ok ? "🔄 ツモを引き直した（無料）" : (res.message || ""));
    render();
  }
  function doCall(k) {
    const opts = game.callOptions();
    if (k < 0 || k >= opts.length) return;
    const r = game.call(opts[k]);
    sel = null;
    setMessage(r.ok ? `${opts[k].label}！ 捨てる牌を選んでください` : (r.message || ""));
    render();
  }
  function doDraw() {
    const res = game.drawTsumo();
    sel = null;
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
    setMessage(msg); render();
  }

  render();
})();
