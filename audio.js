/**
 * 心臟病 — Web Audio 合成音效（無第三方取樣）。
 */

export class XinzangAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = 0.22;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
  }

  async unlock() {
    this.ensure();
    if (this.ctx?.state === "suspended") await this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
  }

  tone(freq, dur, type = "sine", gain = 0.12, when = 0) {
    if (!this.enabled) return;
    this.ensure();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * this.master, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.04, dur));
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  noise(dur, gain = 0.3, when = 0) {
    if (!this.enabled) return;
    this.ensure();
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * this.master, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(g);
    g.connect(ctx.destination);
    src.start(t0);
  }

  flip() {
    // 翻牌「撇」的一聲
    this.noise(0.06, 0.2);
    this.tone(500, 0.05, "triangle", 0.1);
  }

  heartbeat() {
    // 心跳 ±
    this.tone(160, 0.07, "sine", 0.2);
    this.tone(160, 0.07, "sine", 0.2, 0.13);
  }

  slap() {
    this.noise(0.08, 0.5);
    this.tone(90, 0.1, "square", 0.25);
  }

  collect() {
    this.noise(0.2, 0.2);
    for (let i = 0; i < 4; i++) this.tone(240 + i * 40, 0.06, "triangle", 0.08, i * 0.05);
  }

  win() {
    const seq = [523, 659, 784, 1047];
    seq.forEach((f, i) => this.tone(f, 0.16, "sine", 0.14, i * 0.11));
    this.tone(1319, 0.4, "sine", 0.1, seq.length * 0.11);
  }

  lose() {
    const seq = [330, 262, 196, 147];
    seq.forEach((f, i) => this.tone(f, 0.22, "sawtooth", 0.11, i * 0.16));
  }

  error() {
    this.tone(140, 0.12, "square", 0.08);
  }
}