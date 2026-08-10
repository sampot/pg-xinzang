/**
 * 心臟病 — 介面與互動。
 * 你 vs 阿強（AI）：翻牌、心臟病拍點賽跑。
 */
import {
  newRound,
  flipCard,
  nextActive,
  resolveSlap,
  isHeartbeat,
  checkWinner,
  tally,
  RANKS,
} from "./game.js";
import { XinzangAudio } from "./audio.js";

const audio = new XinzangAudio();

const els = {
  status: document.getElementById("status"),
  target: document.getElementById("target"),
  targetPick: document.getElementById("target-pick"),
  center: document.getElementById("center"),
  recent: document.getElementById("recent"),
  players: document.getElementById("players"),
  btnNew: document.getElementById("btn-new"),
  btnMute: document.getElementById("btn-mute"),
  btnSlap: document.getElementById("btn-slap"),
  best: document.getElementById("best-label"),
};

const BEST_KEY = "pg-xinzang-best";

const PLAYER = 0;
const NAMES = ["你", "阿強"];
const COLORS = ["#3b82f6", "#ef4444"];

let state = null;
let scores = [0, 0];
let phase = "idle"; // idle | flipping | reacting | result | ending
let wins = 0;
let bestStars = 0;

const cardFile = (r, s) => {
  const rank =
    r === 1 ? "A" : r === 11 ? "J" : r === 12 ? "Q" : r === 13 ? "K" : String(r).padStart(2, "0");
  const suit = s === 0 ? "spades" : s === 1 ? "hearts" : s === 2 ? "diamonds" : "clubs";
  return `card_${suit}_${rank}.png`;
};

const rankText = (r) =>
  r === 1 ? "A" : r === 11 ? "J" : r === 12 ? "Q" : r === 13 ? "K" : String(r);

function setStatus(msg, tone = "") {
  els.status.textContent = msg;
  els.status.dataset.tone = tone;
}

/* ---------- 對局 ---------- */
function startRound(pickTarget = null) {
  audio.unlock();
  state = newRound(2);
  if (pickTarget) state.target = pickTarget;
  scores = scores.slice(0, state.playerCount);
  phase = "idle";
  renderState();
  setStatus("準備好就按「開始翻牌」！先選心臟病號碼再開始。");
  renderButtons();
}

function beginFlips() {
  phase = "flipping";
  setStatus("翻牌中…盯緊號碼！");
  renderButtons();
  scheduleNextFlip();
}

let flipTimer = null;
function scheduleNextFlip(delay = 1100) {
  clearTimeout(flipTimer);
  if (phase !== "flipping" && phase !== "reacting") return;
  flipTimer = setTimeout(() => {
    if (phase === "flipping") doFlip();
  }, delay);
}

function doFlip() {
  if (!state || state.result) return;
  const res = flipCard(state);
  if (!res.ok) {
    if (!res.reason) finalize();
    else if (state.result) finalize();
    else advance();
    return;
  }
  renderState();
  audio.flip();
  if (res.heartbeat) {
    enterReaction();
  } else {
    setStatus(`翻開 ${rankText(res.card.rank)} — 不是心臟病，繼續。`);
    advance();
  }
}

/** AI 反應基準線：每連輸給阿強一次，下一輪給點補償；連勝超過 3 次則稍加快。 */
let aiBase = 400;
let humanWinsInARow = 0;
let aiWinsInARow = 0;

/** 心臟病拍點賽跑：玩家可在視窗內按「拍！」，AI 在隨機延遲後「拍」。 */
function enterReaction() {
  phase = "reacting";
  const aiReactionMs = aiBase + Math.random() * 340;
  const started = performance.now();
  setStatus("💓 心臟病！快拍！！", "win");
  audio.heartbeat();
  renderButtons();
  aiSlapTimer = setTimeout(() => {
    if (phase !== "reacting") return;
    const aiTime = performance.now() - started;
    onSlap({ who: 1, time: aiReactionMs + 90 });
  }, aiReactionMs + 60);
}

let aiSlapTimer = null;

function onSlap({ who, time }) {
  if (phase !== "reacting") return;
  clearTimeout(aiSlapTimer);
  phase = "result";
  renderState();
  if (who === PLAYER) {
    setStatus(
      `👏 你拍到了（${Math.round(time)}ms）——阿強慢了，牌堆給阿強。`,
      "warn"
    );
    slowestCollect(1);
    adjustAI(true);
    audio.collect();
  } else {
    setStatus(
      `🤖 阿強先拍（${Math.round(time)}ms）——你慢了，牌堆歸你。`,
      "lose"
    );
    slowestCollect(0);
    adjustAI(false);
    audio.collect();
  }
  advance();
}

function adjustAI(humanWon) {
  if (humanWon) {
    humanWinsInARow++;
    aiWinsInARow = 0;
    if (humanWinsInARow >= 3) aiBase = 320;
    else aiBase = 400;
  } else {
    aiWinsInARow++;
    humanWinsInARow = 0;
    aiBase = 400 + Math.min(160, aiWinsInARow * 40);
  }
}

function slowestCollect(p) {
  if (!state) return;
  state.hands[p].push(...state.flipped);
  state.flipped = [];
  checkWinner(state, p, 0);
}

/** 前進到下一位（若非「拍點」，翻完就換人；若是拍點，收完也換人）。 */
function advance() {
  if (!state || state.result) {
    finalize();
    return;
  }
  const next = nextActive(state, state.turn);
  state.turn = next;
  renderState();
  if (phase === "result") {
    phase = "flipping";
    renderButtons();
  }
  if (state.result) {
    finalize();
    return;
  }
  scheduleNextFlip(1300);
}

function finalize() {
  phase = "ending";
  clearTimeout(aiSlapTimer);
  renderButtons();
  if (!state.result) state.result = { winner: null };
  if (state.result.winner === PLAYER) {
    setStatus("🎉 你撐到最後，贏了！", "win");
    audio.win();
    wins++;
    if (wins > bestStars) {
      bestStars = wins;
      saveBest();
    }
  } else if (state.result.winner === 1) {
    setStatus("阿強撐到最後。再來一局！", "lose");
    audio.lose();
  } else {
    setStatus("平手／對局結束。", "");
  }
  renderState();
}

async function loadBest() {
  try {
    const res = await fetch(`/api/kv/${BEST_KEY}`);
    if (res.ok) {
      const t = (await res.text()).trim();
      if (/^\d+$/.test(t)) {
        bestStars = Number(t);
        wins = bestStars;
        els.best.textContent = `${bestStars} 連勝`;
        return;
      }
    }
  } catch {
    /* 無 KV */
  }
  els.best.textContent = "—";
}

async function saveBest() {
  els.best.textContent = `${bestStars} 連勝`;
  try {
    await fetch(`/api/kv/${BEST_KEY}`, { method: "PUT", body: String(bestStars) });
  } catch {
    /* 無 KV */
  }
}

/* ---------- 渲染 ---------- */
function renderState() {
  renderTarget();
  renderCenter();
  renderPlayers();
}

function renderTarget() {
  els.targetPick.innerHTML = "";
  RANKS.forEach((r) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rank-pick" + (state && state.target === r ? " on" : "");
    btn.textContent = rankText(r);
    btn.disabled = phase !== "idle";
    btn.addEventListener("click", () => {
      startRound(r);
      setStatus("已選「" + rankText(r) + "」。按「開始翻牌」開局。");
    });
    els.targetPick.appendChild(btn);
  });
  els.target.textContent = state ? rankText(state.target) : "–";
}

function renderCenter() {
  els.center.innerHTML = "";
  const inner = document.createElement("div");
  inner.className = "center-inner";

  const main = document.createElement("div");
  if (state && state.flipped.length) {
    const card = state.flipped[state.flipped.length - 1];
    const img = document.createElement("img");
    img.src = `assets/cards/${cardFile(card.rank, card.suit)}`;
    img.alt = rankText(card.rank);
    main.className = "center-card" + (phase === "reacting" ? " heartbeat" : "");
    main.appendChild(img);
  } else {
    main.className = "center-card empty";
    main.textContent = "?";
  }
  inner.appendChild(main);

  const note = document.createElement("p");
  note.className = "center-note";
  note.textContent = state ? (state.flipped.length ? `${state.flipped.length} 張在牌堆` : "還沒翻牌") : "準備開始";
  inner.appendChild(note);
  els.center.appendChild(inner);
}

function renderPlayers() {
  els.players.innerHTML = "";
  for (let p = 0; p < state.playerCount; p++) {
    const isMe = p === PLAYER;
    const wrap = document.createElement("section");
    const active = phase === "flipping" && state.turn === p;
    wrap.className =
      "player" +
      (isMe ? " me" : "") +
      (active ? " active" : "") +
      (state.out[p] ? " out" : "");
    wrap.style.setProperty("--pc", COLORS[p % COLORS.length]);

    const head = document.createElement("div");
    head.className = "player-head";
    const name = document.createElement("strong");
    name.textContent = `${isMe ? "🙋" : "🤖"} ${NAMES[p]}`;
    const pts = document.createElement("span");
    pts.className = "points";
    pts.textContent = `${scores[p] ?? 0} 勝`;
    head.append(name, pts);
    wrap.appendChild(head);

    const meter = document.createElement("div");
    meter.className = "hand-meter";
    meter.innerHTML = "";
    const h = state.hands[p];
    if (h.length) {
      const got = document.createElement("div");
      got.className = "hand-bar";
      got.style.width = `${Math.min(100, (h.length / 52) * 100)}%`;
      meter.appendChild(got);
    }
    const count = document.createElement("span");
    count.className = "hand-count";
    count.textContent = `${h.length} 張`;
    meter.appendChild(count);
    wrap.appendChild(meter);

    els.players.appendChild(wrap);
  }
}

function renderButtons() {
  if (phase === "idle") {
    els.btnNew.textContent = "開始翻牌";
    els.btnSlap.disabled = true;
  } else if (phase === "reacting") {
    els.btnNew.textContent = "…";
    els.btnNew.disabled = true;
    els.btnSlap.disabled = false;
    els.btnSlap.textContent = "拍！（點擊）";
  } else if (phase === "ending") {
    els.btnNew.textContent = "再來一局";
    els.btnNew.disabled = false;
    els.btnSlap.disabled = true;
    els.btnSlap.textContent = "拍！";
  } else {
    els.btnNew.textContent = "翻牌中…";
    els.btnNew.disabled = true;
    els.btnSlap.disabled = true;
    els.btnSlap.textContent = "拍！";
  }
}

/* ---------- 事件 ---------- */
function bindEvents() {
  els.btnNew.addEventListener("click", () => {
    audio.unlock();
    if (phase === "idle") beginFlips();
    else startRound();
  });
  els.btnSlap.addEventListener("click", () => {
    audio.unlock();
    if (phase !== "reacting") return;
    audio.slap();
    onSlap({ who: PLAYER, time: 40 + Math.random() * 40 });
  });
  els.btnMute.addEventListener("click", () => {
    const on = audio.enabled;
    audio.setEnabled(!on);
    els.btnMute.setAttribute("aria-pressed", String(!on));
    els.btnMute.textContent = on ? "音效關" : "音效開";
  });
  // 鍵盤：空白鍵＝拍
  document.addEventListener("keydown", (e) => {
    if (e.key === " " || e.code === "Space") {
      if (phase === "reacting") {
        e.preventDefault();
        els.btnSlap.click();
      }
    }
  });
}

/* ---------- 啟動 ---------- */
async function init() {
  bindEvents();
  await loadBest();
  startRound();
}

init();