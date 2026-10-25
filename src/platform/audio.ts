/**
 * 音效引擎：WebAudio 程序化合成，零音频资源文件。
 * - AudioContext 懒创建（自动播放策略：首次用户手势时才初始化）
 * - 全部音效由振荡器 + 噪声缓冲实时合成，打包体积零增加
 * - 静音偏好持久化 localStorage['sn-muted']
 */

type AudioContextCtor = typeof AudioContext;

export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private _muted = false;

  constructor() {
    try {
      this._muted = localStorage.getItem('sn-muted') === '1';
    } catch (e) { /* 无痕模式 */ }
  }

  get muted(): boolean {
    return this._muted;
  }

  /** 切换静音并持久化，返回切换后的状态 */
  toggleMute(): boolean {
    this._muted = !this._muted;
    try {
      localStorage.setItem('sn-muted', this._muted ? '1' : '0');
    } catch (e) { /* noop */ }
    if (!this._muted) this.ensure(); // 取消静音时顺手激活音频上下文
    return this._muted;
  }

  /** 必须在用户手势中调用；静音或环境不可用时返回 null */
  private ensure(): AudioContext | null {
    if (this._muted) return null;
    if (!this.ctx) {
      const AC: AudioContextCtor | undefined =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
      } catch (e) {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** 复用的噪声缓冲（切削/碎裂声） */
  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const len = Math.floor(ctx.sampleRate * 0.25);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
    return buf;
  }

  /** 普通落层：低频闷响 + 切削噪声 */
  land(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    // 闷响（正弦下滑）
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.09);
    g.gain.setValueAtTime(0.5, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.13);
    // 切削（带通噪声）
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.16, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    src.connect(bp).connect(ng).connect(this.master);
    src.start(now);
    src.stop(now + 0.1);
  }

  /** 完美对齐：双音叮，音高随连击半音上升（封顶 12 级） */
  perfect(combo: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const semis = Math.min(Math.max(combo, 1), 12);
    const f = 659.25 * Math.pow(2, semis / 12); // E5 起步
    for (const [ratio, vol] of [[1, 0.28], [1.5, 0.14]] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f * ratio;
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.connect(g).connect(this.master);
      osc.start(now);
      osc.stop(now + 0.34);
    }
  }

  /** 游戏结束：三连下行音 */
  gameOver(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const master = this.master;
    const now = ctx.currentTime;
    const notes = [392, 329.63, 246.94]; // G4 → E4 → B3
    notes.forEach((freq, i) => {
      const t = now + i * 0.16;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.28);
    });
  }

  /** UI 点击：极短 tick（按钮） */
  click(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1050;
    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  /** 开局：上行双音 */
  start(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const master = this.master;
    const now = ctx.currentTime;
    [523.25, 783.99].forEach((freq, i) => {
      const t = now + i * 0.09;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  }
}

export const sound = new SoundManager();
