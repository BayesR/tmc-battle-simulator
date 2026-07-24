import React, { useState, useMemo } from "react";
import { Swords, Save, Sparkles } from "lucide-react";

/* =========================================================================
 * TMC (TOMASON MONSTER'S CARD) BATTLE SIMULATOR — MVP
 * -------------------------------------------------------------------------
 * このファイルは「単一ファイル版プロトタイプ」です。
 * 実プロジェクトでは下記のセクション区切りに沿ってファイル分割してください。
 *
 *   types/card.ts
 *   constants/legacy.ts
 *   constants/result.ts
 *   constants/rules.ts
 *   logic/compareCards.ts
 *   utils/deckStorage.ts
 *   components/CardInput.tsx
 *   components/DeckEditor.tsx
 *   components/BattleMatrix.tsx
 *   components/SummaryCard.tsx
 *   components/RuleSettings.tsx
 *   components/SavedDecks.tsx
 *   App.tsx
 * ========================================================================= */

/* -------------------------------------------------------------------------
 * [types/card.ts] 相当
 *
 * @typedef {''|'未使用'|'制'|'愛'|'環'|'邪'|'聖'} PPLegacy
 * @typedef {''|'制'|'愛'|'環'|'邪'|'聖'} Legacy   - ''は未選択（初期状態）
 * @typedef {Object} PotentialPoint
 * @property {PPLegacy} legacy - 未使用の場合はvalueが常に0
 * @property {number|''} value - 0以上、小数点第1位までの数値、または未入力時は''（空欄）
 *
 * @typedef {Object} Card
 * @property {string} id
 * @property {Legacy} legacy            - カード自体のLegacy（属性）。初期値は未選択('')
 * @property {number} monsterPride      - 1〜6（①〜⑥）
 * @property {PotentialPoint[]} potentialPoints - 最大3枠固定
 * @property {boolean} hasVoid          - 初期値false
 * ----------------------------------------------------------------------- */

/* -------------------------------------------------------------------------
 * [constants/legacy.ts] 相当
 * TMCのLegacyは「記号・英語名・テーマカラー」の3情報を持つ。
 * ここを変更すればボタン表示・バッジ表示すべてに反映される。
 * ----------------------------------------------------------------------- */
const LEGACIES = ["環", "愛", "制", "邪", "聖"];

// 記号 / 英語名 / テーマカラー（公式カラー）
const LEGACY_INFO = {
  制: { symbol: "制", en: "Babylon", color: "#F4C542" },
  愛: { symbol: "愛", en: "Love", color: "#FF5FA2" },
  環: { symbol: "環", en: "Nature", color: "#4CAF50" },
  邪: { symbol: "邪", en: "Darkness", color: "#2B2B2B" },
  聖: { symbol: "聖", en: "Saint", color: "#F5F5F5" },
};

// Potential Point用の選択肢（未使用を含む）
const PP_LEGACY_OPTIONS = ["未使用", ...LEGACIES];

// 「未選択」「未使用」を含む全Legacy情報の統合マップ（バッジ表示等で共通利用）
const ALL_LEGACY_INFO = {
  "": { symbol: "未選択", en: "", color: "#4B5563" },
  未使用: { symbol: "未使用", en: "", color: "#4B5563" },
  ...LEGACY_INFO,
};

// 各テーマカラーの背景に載せたときに読みやすい文字色（視認性確保のため）
const LEGACY_CONTRAST = {
  制: "#1A1A1A",
  愛: "#1A1A1A",
  環: "#FFFFFF",
  邪: "#FFFFFF",
  聖: "#1A1A1A",
  "": "#FFFFFF",
  未使用: "#FFFFFF",
};

// Monster Pride用（①〜⑥ = 1〜6）
const MONSTER_PRIDE_OPTIONS = [1, 2, 3, 4, 5, 6];
const MONSTER_PRIDE_LABELS = { 1: "①", 2: "②", 3: "③", 4: "④", 5: "⑤", 6: "⑥" };

// Monster Prideの数値に応じた★表示（1 = ⭐️）
function starsForMonsterPride(mp) {
  return "⭐️".repeat(mp);
}

/* -------------------------------------------------------------------------
 * [constants/result.ts] 相当
 * 格闘ゲームの相性表のように「一目で勝敗がわかる」ことを重視しつつ、
 * 単色ベタ塗りではなくグラデーション＋シャドウで質感を出す。
 * ----------------------------------------------------------------------- */
const RESULT_META = {
  win: {
    symbol: "〇",
    label: "勝利",
    bg: "bg-gradient-to-br from-sky-400 via-sky-500 to-sky-700",
    border: "border-sky-200/70",
    text: "text-white",
    shadow: "shadow-[0_2px_10px_rgba(14,116,144,0.55)]",
  },
  loss: {
    symbol: "×",
    label: "敗北",
    bg: "bg-gradient-to-br from-rose-400 via-rose-500 to-rose-700",
    border: "border-rose-200/70",
    text: "text-white",
    shadow: "shadow-[0_2px_10px_rgba(159,18,57,0.55)]",
  },
  draw: {
    symbol: "△",
    label: "引分",
    bg: "bg-gradient-to-br from-neutral-400 via-neutral-500 to-neutral-700",
    border: "border-neutral-200/60",
    text: "text-white",
    shadow: "shadow-[0_2px_10px_rgba(38,38,38,0.55)]",
  },
};

/* -------------------------------------------------------------------------
 * [logic/compareCards.ts] 相当
 * TMCの正式な勝敗判定フローを実装する。
 *
 *   ① Root Counter（最優先）: Monster Pride ① は ⑤ に必ず勝つ
 *   ② Potential Point: 相手のLegacyと一致するPPだけをMonster Prideに加算
 *   ③ Void: 相手のPP加算のみを無効化する（自分のPPは通常通り適用）
 *   ④ 最終的なMonster Pride（+PP）を比較
 *   ⑤ 同値なら引き分け
 * ----------------------------------------------------------------------- */

// 小数点第1位までに丸める（PPが小数点第1位まで入力可能なため）
function round1(n) {
  return Math.round(n * 10) / 10;
}

// カード自身のPotential Pointのうち、「相手のLegacyと一致する枠」だけの合計を算出する。
function getMatchingPotentialPoints(card, opponent) {
  return card.potentialPoints.reduce((sum, p) => {
    if (p.legacy === "未使用") return sum;
    if (p.legacy !== opponent.legacy) return sum;
    const v = p.value === "" ? 0 : Number(p.value);
    return sum + v;
  }, 0);
}

/**
 * TMCの勝敗判定本体。
 * @param {Card} self  - 自分（行）側のカード
 * @param {Card} enemy - 相手（列）側のカード
 * @returns {{winner: 'self'|'enemy'|'draw', selfPower: number, enemyPower: number, rootCounter: boolean, voidActivated: boolean}}
 */
function compareCards(self, enemy) {
  // ① Root Counter（最優先）：① は ⑤ に必ず勝利する。他の判定より常に優先。
  if (self.monsterPride === 1 && enemy.monsterPride === 5) {
    return {
      winner: "self",
      selfPower: self.monsterPride,
      enemyPower: enemy.monsterPride,
      rootCounter: true,
      voidActivated: self.hasVoid || enemy.hasVoid,
    };
  }
  if (self.monsterPride === 5 && enemy.monsterPride === 1) {
    return {
      winner: "enemy",
      selfPower: self.monsterPride,
      enemyPower: enemy.monsterPride,
      rootCounter: true,
      voidActivated: self.hasVoid || enemy.hasVoid,
    };
  }

  // ② Potential Point：相手のLegacyと一致する枠だけを加算する
  const selfPPRaw = getMatchingPotentialPoints(self, enemy);
  const enemyPPRaw = getMatchingPotentialPoints(enemy, self);

  // ③ Void：相手のPP加算だけを無効化する（自分のPPは通常通り適用）
  const selfPPBonus = enemy.hasVoid ? 0 : selfPPRaw;
  const enemyPPBonus = self.hasVoid ? 0 : enemyPPRaw;

  // ④ 最終的なMonster Prideを比較
  const selfPower = round1(self.monsterPride + selfPPBonus);
  const enemyPower = round1(enemy.monsterPride + enemyPPBonus);

  // ⑤ 同値なら引き分け
  let winner = "draw";
  if (selfPower > enemyPower) winner = "self";
  else if (selfPower < enemyPower) winner = "enemy";

  return {
    winner,
    selfPower,
    enemyPower,
    rootCounter: false,
    voidActivated: self.hasVoid || enemy.hasVoid,
  };
}

// compareCardsの winner ('self'|'enemy'|'draw') を、表示用の 'win'|'loss'|'draw' に変換する
const WINNER_TO_RESULT = { self: "win", enemy: "loss", draw: "draw" };

/* -------------------------------------------------------------------------
 * カード / デッキ生成ヘルパー
 * ----------------------------------------------------------------------- */
function createEmptyPotentialPoint() {
  return { legacy: "未使用", value: 0 };
}

function createEmptyCard(seed) {
  return {
    id: `c_${seed}_${Math.random().toString(36).slice(2, 8)}`,
    legacy: "", // 初期値は未選択（空欄）
    monsterPride: 1,
    potentialPoints: [createEmptyPotentialPoint(), createEmptyPotentialPoint(), createEmptyPotentialPoint()],
    hasVoid: false,
  };
}

function createEmptyDeck(prefix) {
  return Array.from({ length: 5 }, (_, i) => createEmptyCard(`${prefix}${i}`));
}

/* -------------------------------------------------------------------------
 * [constants/rules.ts] 相当
 * 対戦ルール（デッキ構築制限）の定義。
 * evaluate(deck) はデッキを受け取り、判定に使う値と合否を返す。
 * 将来ルールが増えても、この配列に追加するだけで対応できる設計。
 * ----------------------------------------------------------------------- */
const RULE_DEFINITIONS = [
  {
    id: "seiJaVoidLimit",
    label: "聖・邪・Voidは1デッキ合計3枚（Void1枚）",
    defaultEnabled: true,
    evaluate: (deck) => {
      const count = deck.filter((c) => c.legacy === "聖" || c.legacy === "邪" || c.hasVoid).length;
      return { ok: count <= 3, text: `${count}/3` };
    },
  },
  {
    id: "mpTotalLimit",
    label: "MP合計は1デッキ15以下",
    defaultEnabled: true,
    evaluate: (deck) => {
      const total = deck.reduce((sum, c) => sum + c.monsterPride, 0);
      return { ok: total <= 15, text: `${total}/15` };
    },
  },
];

// ONになっているルールについて、patch適用後のデッキが「新たに違反状態になる」場合はfalseを返す。
// 既にルール違反状態のデッキ（保存データの読込直後など）を、それ以上悪化させない限り編集し続けられるように、
// 「違反 → 違反のまま」の変更は許可し、「適合 → 違反」になる変更だけを拒否する。
function isPatchAllowed(deck, index, patch, rules) {
  let next = deck.map((c, i) => (i === index ? { ...c, ...patch } : c));
  if (patch.hasVoid === true) {
    next = next.map((c, i) => (i === index ? c : { ...c, hasVoid: false }));
  }
  for (const rule of RULE_DEFINITIONS) {
    if (!rules[rule.id]) continue;
    const wasOk = rule.evaluate(deck).ok;
    const willBeOk = rule.evaluate(next).ok;
    if (wasOk && !willBeOk) return false;
  }
  return true;
}

/* -------------------------------------------------------------------------
 * [utils/deckStorage.ts] 相当
 * LocalStorageへの保存/読込。JSON形式・複数保存に対応。
 * 保存されたデッキは1つの共有プールとして扱い、MY DECK / OPPONENT DECK
 * どちらからでも保存・呼び出しできる（保存先・呼び出し先は同じデータ）。
 * ----------------------------------------------------------------------- */
const STORAGE_KEY = "tmc_saved_decks";

function loadSavedDecks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to load saved decks:", e);
    return [];
  }
}

function persistSavedDecks(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    console.error("Failed to persist saved decks:", e);
    return false;
  }
}

/* -------------------------------------------------------------------------
 * [components/CardInput.tsx] 相当
 * 1枚のカードの入力UI（Legacy / Monster Pride / Potential Point×3 / Void）
 * Legacyはプルダウンではなく色付きボタンで選択する。
 * ----------------------------------------------------------------------- */
function CardInput({ card, index, onChange, panelBorder }) {
  // トップレベルの単純なフィールド更新（legacy / monsterPride / hasVoid）。
  // legacyに「邪」を選んだ場合は、Potential Pointへ自動的に愛・制・環をセットする。
  // 邪以外のLegacyを選んだ場合は、Potential Pointを全て「未使用」にリセットする。
  const handleFieldChange = (field, value) => {
    if (field === "legacy") {
      if (value === "邪") {
        onChange(index, {
          legacy: value,
          potentialPoints: [
            { legacy: "愛", value: "" },
            { legacy: "制", value: "" },
            { legacy: "環", value: "" },
          ],
        });
        return;
      }
      onChange(index, {
        legacy: value,
        potentialPoints: [createEmptyPotentialPoint(), createEmptyPotentialPoint(), createEmptyPotentialPoint()],
      });
      return;
    }
    onChange(index, { [field]: value });
  };

  // Potential Point 1枠分の更新。
  // ・Legacyを「未使用」にする → valueは自動的に0固定(disabled)
  // ・Legacyを未使用以外にする → valueは空欄('')にリセットし、手入力可能にする
  // ・同じカード内の他の枠で既に使われているLegacyは選択させない（ボタンをdisabledにしている）
  const handlePPChange = (ppIndex, field, value) => {
    const nextPPs = card.potentialPoints.map((p, i) => {
      if (i !== ppIndex) return p;
      if (field === "legacy") {
        if (value === "未使用") return { legacy: value, value: 0 };
        const usedElsewhere = card.potentialPoints.some((pp, idx) => idx !== ppIndex && pp.legacy === value);
        if (usedElsewhere) return p;
        return { legacy: value, value: "" };
      }
      if (field === "value") {
        if (value === "") return { ...p, value: "" };
        const rounded = round1(Math.max(0, Number(value) || 0));
        return { ...p, value: rounded };
      }
      return p;
    });
    onChange(index, { potentialPoints: nextPPs });
  };

  // Legacyが選択されている場合、そのテーマカラーをカード全体の枠線・背景に反映する。
  // Voidを選択してもカードの配色は変化させない（識別はヘッダーの「V」バッジのみで行う）。
  const legacyColor = card.legacy ? LEGACY_INFO[card.legacy].color : null;
  const panelClassName = legacyColor
    ? "rounded-xl border p-2 sm:p-3 space-y-2 transition-colors"
    : `rounded-xl border p-2 sm:p-3 space-y-2 transition-colors ${panelBorder} bg-neutral-900/60`;
  const panelStyle = legacyColor
    ? { borderColor: `${legacyColor}99`, backgroundColor: `${legacyColor}14` }
    : undefined;

  return (
    <div className={panelClassName} style={panelStyle}>
      {/* ヘッダー：カード番号 + Voidチェックボックス（カード上は「Void」表記） */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-widest text-neutral-500">CARD {index + 1}</span>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={card.hasVoid}
            onChange={(e) => handleFieldChange("hasVoid", e.target.checked)}
            className="w-4 h-4 accent-fuchsia-500 shrink-0"
          />
          <span className={`text-xs font-semibold ${card.hasVoid ? "text-fuchsia-300" : "text-neutral-400"}`}>Void</span>
        </label>
      </div>

      {/* Legacy：1タップで選べる5つの色付き丸ボタン */}
      <div>
        <label className="block text-[10px] text-neutral-500 mb-1">Legacy</label>
        <div className="grid grid-cols-5 gap-1">
          {LEGACIES.map((l) => {
            const info = LEGACY_INFO[l];
            const isActive = card.legacy === l;
            return (
              <button
                type="button"
                key={l}
                onClick={() => handleFieldChange("legacy", l)}
                title={info.en}
                className={`h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
                  isActive ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-neutral-900 scale-105" : "opacity-40 active:opacity-90"
                }`}
                style={{ backgroundColor: info.color, color: LEGACY_CONTRAST[l] }}
              >
                {info.symbol}
              </button>
            );
          })}
        </div>
      </div>

      {/* Monster Pride */}
      <div>
        <label className="block text-[10px] text-neutral-500 mb-1">Monster Pride</label>
        <select
          value={card.monsterPride}
          onChange={(e) => handleFieldChange("monsterPride", Number(e.target.value))}
          className="w-full bg-neutral-950/70 border border-neutral-700 focus:border-amber-400 outline-none rounded-lg px-2 py-1.5 text-sm"
        >
          {MONSTER_PRIDE_OPTIONS.map((mp) => (
            <option key={mp} value={mp}>
              {MONSTER_PRIDE_LABELS[mp]}
            </option>
          ))}
        </select>
        <div className="mt-0.5 text-[10px] leading-none" title={`Monster Pride ${card.monsterPride}`}>
          {starsForMonsterPride(card.monsterPride)}
        </div>
      </div>

      {/* Potential Point（最大3枠固定） */}
      <div>
        <label className="block text-[10px] text-neutral-500 mb-1">Potential Point（最大3）</label>
        <div className="space-y-1.5">
          {card.potentialPoints.map((p, ppIndex) => {
            const disabled = p.legacy === "未使用";
            // 同じカード内の他の枠で使用中のLegacy（未使用は対象外）→ このボタン群では選べないようにする
            const usedElsewhere = card.potentialPoints
              .filter((_, i) => i !== ppIndex)
              .map((pp) => pp.legacy)
              .filter((l) => l !== "未使用");
            return (
              <div key={ppIndex} className="flex items-center gap-1">
                <span
                  className="w-3.5 h-3.5 rounded-full border border-black/30 shrink-0"
                  style={{ backgroundColor: ALL_LEGACY_INFO[p.legacy].color }}
                  title={ALL_LEGACY_INFO[p.legacy].en || ALL_LEGACY_INFO[p.legacy].symbol}
                />
                <select
                  value={p.legacy}
                  onChange={(e) => handlePPChange(ppIndex, "legacy", e.target.value)}
                  className="flex-1 min-w-0 bg-neutral-950/70 border border-neutral-700 focus:border-amber-400 outline-none rounded-lg px-1.5 py-1 text-xs text-neutral-100"
                >
                  {PP_LEGACY_OPTIONS.map((l) => (
                    <option key={l} value={l} disabled={l !== "未使用" && usedElsewhere.includes(l)}>
                      {ALL_LEGACY_INFO[l].en ? `${ALL_LEGACY_INFO[l].symbol} ${ALL_LEGACY_INFO[l].en}` : ALL_LEGACY_INFO[l].symbol}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={p.value}
                  disabled={disabled}
                  placeholder={disabled ? "" : "0"}
                  onChange={(e) => handlePPChange(ppIndex, "value", e.target.value)}
                  className="w-12 sm:w-14 shrink-0 bg-neutral-950/70 border border-neutral-700 focus:border-amber-400 outline-none rounded-lg px-1 py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed placeholder-neutral-600"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * [components/DeckEditor.tsx] 相当
 * 5枚分のCardInputをまとめて表示（自分/相手で共通利用）
 * ----------------------------------------------------------------------- */
const DECK_ACCENTS = {
  indigo: { border: "border-indigo-500/30", text: "text-indigo-300" },
  rose: { border: "border-rose-500/30", text: "text-rose-300" },
};

function DeckEditor({ title, deck, onChange, accent }) {
  const theme = DECK_ACCENTS[accent];
  return (
    <section className={`rounded-2xl border ${theme.border} bg-neutral-900/40 p-3 sm:p-4`}>
      <h2 className={`font-serif text-base sm:text-lg tracking-wide mb-2 ${theme.text}`}>{title}</h2>
      {/* 5枚を横並び・横スクロールで表示し、片手の親指操作でも入力しやすくする */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory">
        {deck.map((card, i) => (
          <div key={card.id} className="shrink-0 w-36 sm:w-44 snap-start">
            <CardInput card={card} index={i} onChange={onChange} panelBorder={theme.border} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------
 * [components/BattleMatrix.tsx] 相当
 * 5x5の対戦マトリクス。判定結果はAppで計算しpropsで受け取る（単一情報源）。
 * 格闘ゲームの相性表のように、ベタ塗りの色ですぐ勝敗が判別できるようにする。
 * ----------------------------------------------------------------------- */
// Potential Pointを「同じ数値ごと」にグルーピングする。
function getPPGroups(card) {
  const groups = [];
  card.potentialPoints.forEach((p) => {
    if (p.legacy === "未使用") return;
    const value = p.value === "" ? 0 : Number(p.value);
    let group = groups.find((g) => g.value === value);
    if (!group) {
      group = { value, legacies: [] };
      groups.push(group);
    }
    group.legacies.push(p.legacy);
  });
  return groups;
}

// マトリクスの見出しに使う「カード略称」。Legacyは色付きチップで視認性を上げる。
function CardHeaderLabel({ card, align }) {
  const legacyInfo = ALL_LEGACY_INFO[card.legacy];
  const ppGroups = getPPGroups(card);
  const alignClass = align === "right" ? "items-end text-right" : "items-center text-center";

  return (
    <div className={`flex flex-col gap-0.5 text-[10px] leading-tight ${alignClass}`}>
      <div className="flex items-center gap-0.5">
        {card.hasVoid && (
          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded bg-fuchsia-600 text-white text-[8px] font-black leading-none shrink-0">
            V
          </span>
        )}
        <span
          className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
          style={{ backgroundColor: legacyInfo.color, color: LEGACY_CONTRAST[card.legacy] }}
        >
          {legacyInfo.symbol.slice(0, 1)}
        </span>
        <span className="font-semibold text-neutral-100 text-[10px]">{MONSTER_PRIDE_LABELS[card.monsterPride]}</span>
      </div>
      <div className="text-neutral-500 text-[9px]">
        {ppGroups.length > 0
          ? ppGroups.map((g) => `+${g.value}（${g.legacies.join("、")}）`).join(" ")
          : "PP＋0"}
      </div>
    </div>
  );
}

// タップ順を表す丸数字（①〜⑳）。それ以上は (n) 表記にフォールバックする。
const CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
function circledNumber(n) {
  return CIRCLED_NUMBERS[n - 1] || `(${n})`;
}

function BattleMatrix({ myDeck, oppDeck, matrix }) {
  // タップした組み合わせ（自分×相手）を「対戦済み」としてグレーアウトし、タップした順番も記録する。
  // 配列なので、タップした順序＝インデックスがそのまま「Battle①」等の表示に使える。
  const [completedOrder, setCompletedOrder] = useState([]);

  const toggleCell = (i, j) => {
    setCompletedOrder((prev) => {
      const rowsUsed = new Set(prev.map((k) => Number(k.split("-")[0])));
      const colsUsed = new Set(prev.map((k) => Number(k.split("-")[1])));
      const isGrayed = rowsUsed.has(i) || colsUsed.has(j);
      if (isGrayed) {
        // グレーアウト済みの行・列に属するマスを押した場合は、
        // その行・列に紐づくタップ済みの組み合わせをまとめて解除する
        return prev.filter((key) => {
          const [ri, rj] = key.split("-").map(Number);
          return ri !== i && rj !== j;
        });
      }
      // まだグレーアウトされていないマスを押した場合は、新しい組み合わせとして追加する
      return [...prev, `${i}-${j}`];
    });
  };

  const handleClearLog = () => setCompletedOrder([]);

  // key -> タップ順（1始まり）
  const orderMap = {};
  completedOrder.forEach((key, idx) => {
    orderMap[key] = idx + 1;
  });

  // タップされた組み合わせの「自分カードの行」「相手カードの列」をまとめてグレーアウト対象にする
  const usedRows = new Set(completedOrder.map((key) => Number(key.split("-")[0])));
  const usedCols = new Set(completedOrder.map((key) => Number(key.split("-")[1])));

  // ログ用：タップした順番のまま一覧化する
  const completedList = completedOrder.map((key, idx) => {
    const [i, j] = key.split("-").map(Number);
    return { key, i, j, order: idx + 1, cell: matrix[i][j] };
  });

  // 5つタップされた時点（=1ラウンド完了想定）で、積み上げ結果の最終集計を表示する
  const showFinalTally = completedList.length >= 5;
  const finalWins = completedList.filter((c) => c.cell.winner === "self").length;
  const finalLosses = completedList.filter((c) => c.cell.winner === "enemy").length;
  const finalDraws = completedList.filter((c) => c.cell.winner === "draw").length;

  return (
    <section className="rounded-2xl border border-amber-900/30 bg-neutral-900/40 p-3 sm:p-5">
      <h2 className="font-serif text-base sm:text-lg tracking-wide mb-2 sm:mb-4 text-amber-300 flex items-center gap-2">
        <Swords className="w-4 h-4 sm:w-5 sm:h-5" />
        BATTLE MATRIX
      </h2>

      <div className="overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: "3px", minWidth: "100%" }}>
          <thead>
            <tr>
              <th className="w-24" />
              {oppDeck.map((opp, j) => (
                <th
                  key={opp.id}
                  className={`font-normal pb-1 align-bottom transition-opacity ${usedCols.has(j) ? "opacity-30 grayscale" : ""}`}
                  style={{ minWidth: "62px" }}
                >
                  <CardHeaderLabel card={opp} align="center" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {myDeck.map((my, i) => (
              <tr key={my.id}>
                <th
                  className={`font-normal pr-2 whitespace-nowrap align-middle transition-opacity ${usedRows.has(i) ? "opacity-30 grayscale" : ""}`}
                >
                  <CardHeaderLabel card={my} align="right" />
                </th>
                {oppDeck.map((opp, j) => {
                  const cell = matrix[i][j];
                  const meta = RESULT_META[WINNER_TO_RESULT[cell.winner]];
                  const key = `${i}-${j}`;
                  const tapOrder = orderMap[key];
                  const isGrayed = usedRows.has(i) || usedCols.has(j);
                  const tooltip = `${meta.label}（自${cell.selfPower} / 相手${cell.enemyPower}）${
                    cell.rootCounter ? " ・Root Counter" : ""
                  }${cell.voidActivated ? " ・Void" : ""}${tapOrder ? ` ・対戦済み Battle${circledNumber(tapOrder)}（タップで解除）` : " ・タップで対戦済みにする"}`;
                  return (
                    <td
                      key={opp.id}
                      onClick={() => toggleCell(i, j)}
                      className="relative w-11 h-11 sm:w-14 sm:h-14 p-0 cursor-pointer select-none"
                      title={tooltip}
                    >
                      {/* 色・記号はグレーアウト対象。タップ順バッジはこの外側に重ねるので影響を受けない */}
                      <div
                        className={`relative w-full h-full flex flex-col items-center justify-center leading-none gap-0.5 rounded-lg border-2 overflow-hidden transition-all ${meta.bg} ${meta.border} ${meta.shadow} ${
                          cell.rootCounter ? "ring-2 ring-amber-300 ring-offset-1 ring-offset-neutral-900" : ""
                        } ${isGrayed ? "opacity-30 grayscale" : ""} ${tapOrder ? "ring-2 ring-neutral-300" : ""}`}
                      >
                        {/* 上部にうっすら光沢を入れて単色ベタ塗りより質感を出す */}
                        <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
                        <span className={`relative text-lg sm:text-2xl font-black drop-shadow-md ${meta.text}`}>{meta.symbol}</span>
                        <span className={`relative text-[7px] sm:text-[9px] font-semibold ${meta.text} opacity-90`}>
                          {cell.rootCounter ? "RC" : `${cell.selfPower} - ${cell.enemyPower}`}
                        </span>
                      </div>
                      {tapOrder && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center rounded-full bg-neutral-950 border-2 border-amber-400 text-amber-300 text-[9px] sm:text-[10px] font-black shadow-lg">
                            {circledNumber(tapOrder)}
                          </span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* タップして「対戦済み」にした組み合わせの結果一覧をマトリクスの下に表示する（タップした順） */}
      {completedList.length > 0 && (
        <div className="mt-4 pt-4 border-t border-neutral-800/60">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold tracking-widest text-neutral-400">対戦結果ログ（タップ順）</h3>
            <button
              onClick={handleClearLog}
              className="text-[11px] px-2.5 py-1 rounded-lg border border-neutral-700 text-neutral-400 hover:bg-neutral-800 transition-colors"
            >
              ログをクリア
            </button>
          </div>
          <ul className="space-y-1.5">
            {completedList.map(({ key, i, j, order, cell }) => {
              const meta = RESULT_META[WINNER_TO_RESULT[cell.winner]];
              return (
                <li
                  key={key}
                  className="flex items-center justify-between gap-2 text-xs rounded-lg border border-neutral-700 bg-neutral-950/40 px-3 py-2"
                >
                  <span className="text-neutral-300">
                    Battle{circledNumber(order)}　MY #{i + 1} vs OPP #{j + 1}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold ${meta.bg} ${meta.text}`}>
                    {meta.symbol} {meta.label}（{cell.selfPower} - {cell.enemyPower}）
                    {cell.rootCounter ? " RC" : ""}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* 5つ選択された時点で、積み上げ結果の最終集計を表示する */}
          {showFinalTally && (
            <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-950/20 p-3">
              <div className="text-xs font-semibold tracking-widest text-amber-300 mb-2">
                FINAL RESULT（{completedList.length}戦終了）
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-sky-500/30 bg-sky-950/40 py-2">
                  <div className="text-lg font-bold text-sky-300">{finalWins}</div>
                  <div className="text-[9px] text-neutral-500 tracking-widest mt-0.5">WINS</div>
                </div>
                <div className="rounded-lg border border-rose-500/30 bg-rose-950/40 py-2">
                  <div className="text-lg font-bold text-rose-300">{finalLosses}</div>
                  <div className="text-[9px] text-neutral-500 tracking-widest mt-0.5">LOSS</div>
                </div>
                <div className="rounded-lg border border-neutral-500/30 bg-neutral-800/40 py-2">
                  <div className="text-lg font-bold text-neutral-300">{finalDraws}</div>
                  <div className="text-[9px] text-neutral-500 tracking-widest mt-0.5">DRAW</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------
 * [components/SummaryCard.tsx] 相当
 * 画面上部の総合結果表示。横並びでコンパクトに表示する。
 * ----------------------------------------------------------------------- */
function SummaryCard({ wins, losses, draws, winRate }) {
  return (
    <section className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-neutral-900 to-neutral-950 p-4 sm:p-6 shadow-2xl">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-amber-300" />
        <h2 className="font-serif text-xs sm:text-sm tracking-widest text-amber-300">TOTAL RESULT</h2>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:gap-3 text-center">
        <div className="rounded-xl border border-sky-500/30 bg-sky-950/40 py-2.5 sm:py-3">
          <div className="text-lg sm:text-2xl font-bold text-sky-300">{wins}</div>
          <div className="text-[9px] sm:text-xs text-neutral-500 tracking-widest mt-0.5">WINS</div>
        </div>
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 py-2.5 sm:py-3">
          <div className="text-lg sm:text-2xl font-bold text-rose-300">{losses}</div>
          <div className="text-[9px] sm:text-xs text-neutral-500 tracking-widest mt-0.5">LOSS</div>
        </div>
        <div className="rounded-xl border border-neutral-500/30 bg-neutral-800/40 py-2.5 sm:py-3">
          <div className="text-lg sm:text-2xl font-bold text-neutral-300">{draws}</div>
          <div className="text-[9px] sm:text-xs text-neutral-500 tracking-widest mt-0.5">DRAW</div>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/40 py-2.5 sm:py-3">
          <div className="text-lg sm:text-2xl font-bold text-amber-300">{winRate}%</div>
          <div className="text-[9px] sm:text-xs text-neutral-500 tracking-widest mt-0.5">WIN RATE</div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------
 * [components/RuleSettings.tsx] 相当
 * 対戦ルール（デッキ構築制限）をチェックボックスで選択できるようにする。
 * ONのルールについては、現在の自分/相手デッキがルールを満たしているかを表示する。
 * ----------------------------------------------------------------------- */
function RuleStatusRow({ rule, myDeck, oppDeck }) {
  const myResult = rule.evaluate(myDeck);
  const oppResult = rule.evaluate(oppDeck);
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
          myResult.ok ? "border-neutral-700 bg-neutral-950/40 text-neutral-400" : "border-rose-500/60 bg-rose-950/30 text-rose-300"
        }`}
      >
        MY {myResult.text}
      </span>
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
          oppResult.ok ? "border-neutral-700 bg-neutral-950/40 text-neutral-400" : "border-rose-500/60 bg-rose-950/30 text-rose-300"
        }`}
      >
        OPP {oppResult.text}
      </span>
    </div>
  );
}

function RuleGroup({ title, accentClass, ruleList, rules, onToggleRule, myDeck, oppDeck, dividerTop, checkable = true }) {
  return (
    <div className={dividerTop ? "pt-3 border-t border-neutral-800/60" : ""}>
      {title && <h3 className={`font-serif text-sm tracking-wide mb-1.5 ${accentClass}`}>{title}</h3>}
      <div className="space-y-1.5">
        {ruleList.map((rule) => {
          const isActive = checkable ? !!rules[rule.id] : true;
          return (
            <div key={rule.id}>
              {checkable ? (
                <label className="flex items-start gap-1.5 text-xs text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => onToggleRule(rule.id, e.target.checked)}
                    className="mt-0.5 w-3.5 h-3.5 accent-amber-500 shrink-0"
                  />
                  <span>{rule.label}</span>
                </label>
              ) : (
                <div className="flex items-start gap-1.5 text-xs text-neutral-300">
                  <span className="mt-0.5 text-amber-400">●</span>
                  <span>{rule.label}</span>
                </div>
              )}
              {isActive && <RuleStatusRow rule={rule} myDeck={myDeck} oppDeck={oppDeck} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RuleSettings({ rules, onToggleRule, myDeck, oppDeck }) {
  return (
    <section className="rounded-2xl border border-amber-900/30 bg-neutral-900/40 p-3 sm:p-4">
      <RuleGroup
        title="BATTLE RULES"
        accentClass="text-amber-300"
        ruleList={RULE_DEFINITIONS}
        rules={rules}
        onToggleRule={onToggleRule}
        myDeck={myDeck}
        oppDeck={oppDeck}
      />
    </section>
  );
}

/* -------------------------------------------------------------------------
 * [components/DeckControls.tsx] 相当
 * MY DECK / OPPONENT DECK それぞれの上部に置く保存・呼込・リセット操作。
 * 保存されたデッキは共有プール（savedDecks）に入るため、
 * 片方で保存したデッキをもう片方で呼び込むこともできる。
 * ----------------------------------------------------------------------- */
function DeckControls({ label, currentDeck, savedDecks, onSave, onDelete, onLoad, onReset }) {
  const [saveName, setSaveName] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const handleSave = () => {
    const name = saveName.trim();
    if (!name) return;
    onSave(name, currentDeck);
    setSaveName("");
  };

  const handleLoad = () => {
    const entry = savedDecks.find((d) => d.id === selectedId);
    if (entry) onLoad(entry.cards);
  };

  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-950/40 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold tracking-widest text-neutral-500">
        <Save className="w-3.5 h-3.5" />
        {label} SAVE / LOAD
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          placeholder="保存名"
          className="flex-1 min-w-[96px] bg-neutral-900/70 border border-neutral-700 focus:border-amber-400 outline-none rounded-lg px-2 py-1.5 text-sm"
        />
        <button
          onClick={handleSave}
          className="px-3 py-1.5 rounded-lg bg-amber-500/90 hover:bg-amber-400 text-neutral-950 text-xs font-semibold transition-colors"
        >
          保存
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="flex-1 min-w-[96px] bg-neutral-900/70 border border-neutral-700 focus:border-amber-400 outline-none rounded-lg px-2 py-1.5 text-sm"
        >
          <option value="">呼込むデッキを選択</option>
          {savedDecks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleLoad}
          disabled={!selectedId}
          className="px-3 py-1.5 rounded-lg border border-sky-500/40 text-sky-300 text-xs font-semibold hover:bg-sky-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          呼込
        </button>
        <button
          onClick={() => selectedId && onDelete(selectedId)}
          disabled={!selectedId}
          className="px-3 py-1.5 rounded-lg border border-rose-500/40 text-rose-300 text-xs font-semibold hover:bg-rose-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          削除
        </button>
        <button
          onClick={onReset}
          className="px-3 py-1.5 rounded-lg border border-neutral-600 text-neutral-300 text-xs font-semibold hover:bg-neutral-800 transition-colors"
        >
          リセット
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * [App.tsx] 相当
 * 状態管理のルート。自分/相手デッキ、対戦ルール、判定結果、保存デッキの読込を統括する。
 * ----------------------------------------------------------------------- */
function App() {
  const [myDeck, setMyDeck] = useState(() => createEmptyDeck("my"));
  const [oppDeck, setOppDeck] = useState(() => createEmptyDeck("op"));
  const [rules, setRules] = useState(() =>
    RULE_DEFINITIONS.reduce((acc, r) => ({ ...acc, [r.id]: r.defaultEnabled }), {})
  );

  const handleToggleRule = (id, checked) => {
    setRules((prev) => ({ ...prev, [id]: checked }));
  };

  // patchは変更したいフィールドだけを含むオブジェクト（例：{ legacy: '邪', potentialPoints: [...] }）。
  // hasVoidをtrueにする更新が来たら、同じデッキ内の他のカードのVoidは自動的にOFFにする（1デッキ1枚まで）。
  // ONになっているルールに新たに違反する変更は、isPatchAllowedで拒否する（選択できないようにする）。
  const updateMyCard = (index, patch) => {
    setMyDeck((prev) => {
      if (!isPatchAllowed(prev, index, patch, rules)) return prev;
      let next = prev.map((c, i) => (i === index ? { ...c, ...patch } : c));
      if (patch.hasVoid === true) {
        next = next.map((c, i) => (i === index ? c : { ...c, hasVoid: false }));
      }
      return next;
    });
  };

  const updateOppCard = (index, patch) => {
    setOppDeck((prev) => {
      if (!isPatchAllowed(prev, index, patch, rules)) return prev;
      let next = prev.map((c, i) => (i === index ? { ...c, ...patch } : c));
      if (patch.hasVoid === true) {
        next = next.map((c, i) => (i === index ? c : { ...c, hasVoid: false }));
      }
      return next;
    });
  };

  const [savedDecks, setSavedDecks] = useState(() => loadSavedDecks());

  const handleSaveDeck = (name, cards) => {
    const entry = { id: `d_${Date.now()}`, name, savedAt: new Date().toISOString(), cards };
    const next = [...savedDecks, entry];
    setSavedDecks(next);
    persistSavedDecks(next);
  };

  const handleDeleteSavedDeck = (id) => {
    const next = savedDecks.filter((d) => d.id !== id);
    setSavedDecks(next);
    persistSavedDecks(next);
  };

  // 各デッキを入力前の空の状態に戻す
  const handleResetMyDeck = () => setMyDeck(createEmptyDeck("my"));
  const handleResetOppDeck = () => setOppDeck(createEmptyDeck("op"));

  // 5x5マトリクスと集計結果を一元計算（BattleMatrix / SummaryCardで共有）
  // compareCardsは { winner, selfPower, enemyPower, rootCounter, voidActivated } を返す
  const { matrix, wins, losses, draws, winRate } = useMemo(() => {
    const mat = myDeck.map((my) => oppDeck.map((opp) => compareCards(my, opp)));
    const flat = mat.flat();
    const w = flat.filter((r) => r.winner === "self").length;
    const l = flat.filter((r) => r.winner === "enemy").length;
    const d = flat.filter((r) => r.winner === "draw").length;
    const total = flat.length;
    const rate = total > 0 ? Math.round((w / total) * 100) : 0;
    return { matrix: mat, wins: w, losses: l, draws: d, winRate: rate };
  }, [myDeck, oppDeck]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10 space-y-6">
        <header className="text-center space-y-1">
          <p className="text-xs tracking-[0.3em] text-amber-500/80">TOMASON MONSTER'S CARD</p>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-widest text-amber-200">
            TMC BATTLE SIMULATOR
          </h1>
          <p className="text-xs text-neutral-500">全相対戦結果シミュレーター（MVP）</p>
        </header>

        <RuleSettings rules={rules} onToggleRule={handleToggleRule} myDeck={myDeck} oppDeck={oppDeck} />

        {/* MY DECK / OPPONENT DECK はそれぞれ全幅で表示し、5枚は横スクロールの並びにする。
            それぞれの上に保存・呼込・リセットの操作を配置する（保存先は共通の1つのプール）。*/}
        <div className="space-y-3">
          <div className="space-y-2">
            <DeckControls
              label="MY DECK"
              currentDeck={myDeck}
              savedDecks={savedDecks}
              onSave={handleSaveDeck}
              onDelete={handleDeleteSavedDeck}
              onLoad={(cards) => setMyDeck(cards)}
              onReset={handleResetMyDeck}
            />
            <DeckEditor title="MY DECK" deck={myDeck} onChange={updateMyCard} accent="indigo" />
          </div>
          <div className="space-y-2">
            <DeckControls
              label="OPPONENT DECK"
              currentDeck={oppDeck}
              savedDecks={savedDecks}
              onSave={handleSaveDeck}
              onDelete={handleDeleteSavedDeck}
              onLoad={(cards) => setOppDeck(cards)}
              onReset={handleResetOppDeck}
            />
            <DeckEditor title="OPPONENT DECK" deck={oppDeck} onChange={updateOppCard} accent="rose" />
          </div>
        </div>

        <SummaryCard wins={wins} losses={losses} draws={draws} winRate={winRate} />

        <BattleMatrix myDeck={myDeck} oppDeck={oppDeck} matrix={matrix} />

        <footer className="text-center text-xs text-neutral-600 pt-2 pb-4">
          © TMC Project — Prototype build
        </footer>
      </div>
    </div>
  );
}

export default App;
