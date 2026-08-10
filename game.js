/**
 * 心臟病 — 純邏輯：發牌、翻牌、對應數字判定、拍擊順位。
 * 純函式設計，方便單元測試。
 *
 * 規則（台灣童玩）：
 *  1. 撲克牌兩副（104 張）公平分給所有玩家。
 *  2. 依序翻牌；翻開的牌張數字等於「心臟病數字」時，全部人立即拍牌堆。
 *  3. 最慢拍到的人把整疊牌堆收走；牌堆 = 懲罰（越多越容易輸）。
 *  4. 手牌全部拍完出局；最後留在場上的人獲勝。
 */

/** A=1…13=K */
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

/** 心臟病號碼：A、2~10、J、Q、K（1..13）。 */
export function targetForRound(rand = Math.random) {
  return 1 + Math.floor(rand() * 13);
}

export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 產生 104 張牌（兩副）。 */
export function makeDeck() {
  const deck = [];
  for (let deckIdx = 0; deckIdx < 2; deckIdx++) {
    for (let s = 0; s < 4; s++) {
      for (const r of RANKS) deck.push({ rank: r, suit: s });
    }
  }
  return deck;
}

/**
 * 開新一局。playerCount = 玩家數（人＋AI，2~6）。
 * 回傳 state：
 *   hands: Card[][]（每人一疊，face-down 待翻）
 *   flipped: Card[]（已翻開牌堆，依序）
 *   played: Card[]（已被拍走的手牌）
 *   out: boolean[]（出局）
 *   turn: number（該翻牌的人）
 *   target: number（心臟病數字）
 *   result: null | { winner: number }
 */
export function newRound(playerCount, rand = Math.random) {
  const n = Math.max(2, Math.min(6, playerCount));
  const deck = shuffle(makeDeck(), rand);
  const hands = Array.from({ length: n }, () => []);
  deck.forEach((c, i) => hands[i % n].push(c));
  return {
    playerCount: n,
    hands,
    flipped: [],
    played: [],
    out: hands.map(() => false),
    turn: 0,
    target: targetForRound(rand),
    result: null,
  };
}

/** 是否為拍點：翻開這張牌時全員該拍（等於心臟病數字）。 */
export function isHeartbeat(rank, target) {
  return rank === target;
}

/**
 * 翻牌：players[turn] 翻一張到 flipped。
 * 回傳 { ok, card, heartbeat }。
 */
export function flipCard(state) {
  if (state.result) return { ok: false, reason: "finished" };
  if (state.out[state.turn]) return { ok: false, reason: "out" };
  const hand = state.hands[state.turn];
  if (!hand.length) return { ok: false, reason: "empty" };
  const card = hand.shift();
  state.flipped.push(card);
  const heartbeat = isHeartbeat(card.rank, state.target);
  if (hand.length === 0) {
    state.out[state.turn] = true;
  }
  return { ok: true, card, heartbeat };
}

/** 下一位未出局的玩家。 */
export function nextActive(state, after = state.turn) {
  const n = state.playerCount;
  for (let d = 1; d <= n; d++) {
    const p = (after + d) % n;
    if (!state.out[p] && state.hands[p].length > 0) return p;
  }
  return after;
}

/**
 * 拍擊判定：heartbeat 翻開後，所有在場玩家比反應時間。
 * 最慢者把 flipped 整疊收走（加到手牌底），並重設牌堆。
 * 回傳 { slowest, time, winner }（winner 若有則遊戲結束）。
 */
export function resolveSlap(state, reactionMs) {
  const out = state.out.map((o) => o);
  let slowest = -1;
  let slowestT = -1;
  const n = state.playerCount;
  // 每個未出局玩家一個反應時間（0..1s）；沒參與的先給 999
  for (let p = 0; p < n; p++) {
    const t = out[p] ? 999 : reactionMs(p);
    if (t > slowestT) {
      slowestT = t;
      slowest = p;
    }
  }
  // 最慢者收牌
  state.hands[slowest].push(...state.flipped);
  state.flipped = [];
  return checkWinner(state, slowest, slowestT);
}

/** 出局檢查：只剩一人有牌即勝利。 */
export function checkWinner(state, lastSlap, slackMs) {
  const remaining = [];
  for (let p = 0; p < state.playerCount; p++) {
    if (state.out[p]) continue;
    if (state.hands[p].length === 0) {
      state.out[p] = true;
    } else {
      remaining.push(p);
    }
  }
  if (remaining.length <= 1) {
    const winner = remaining.length === 1 ? remaining[0] : null;
    state.result = { winner, lastSlap, slackMs };
  }
  return state.result || null;
}

/** 是否有任何玩家已空手出局。 */
export function hasEmpty(state) {
  return state.hands.some((h, p) => !state.out[p] && h.length === 0);
}

/** 統計（用於結束畫面）。 */
export function tally(state, scores) {
  const next = scores.slice();
  if (state.result?.winner != null) {
    next[state.result.winner] = (next[state.result.winner] || 0) + 1;
  }
  return next;
}