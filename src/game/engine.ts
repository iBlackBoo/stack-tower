/**
 * 物理堆叠核心引擎
 * 玩法：新方块在屏幕顶部左右往复移动，点击/触摸落下；
 * 与塔顶求交，重叠部分成为新一层，多余部分切除坠落；
 * 完全错开则游戏结束。支持看广告复活。
 *
 * 坐标系统：CSS 像素，y 向下增长。相机 cameraY 向上平滑跟随塔高。
 */

import type { Block, ButtonRect, Debris, GameStatus } from './types';

const BLOCK_H = 28;               // 每层厚度
const BASE_W_RATIO = 0.62;        // 基座宽度 / 画布宽
const PERFECT_TOLERANCE = 6;      // 完美对齐容差（px）
const COMBO_BONUS_EVERY = 3;      // 每 N 连完美奖励宽度
const COMBO_BONUS_W = 10;         // 奖励宽度（px）
const SPEED_BASE = 320;           // 初始移动速度 px/s
const SPEED_MAX = 900;
const SPEED_GROWTH = 14;          // 每层加速
const CAMERA_ANCHOR = 0.52;       // 塔顶保持在屏幕高度的此比例处
const GRAVITY = 2400;             // 碎块重力
const DEAD_INPUT_LOCK = 0.6;      // 死亡后输入锁定时长（防误触）

export interface EngineCallbacks {
  onScore(score: number): void;
  onPerfect(combo: number): void;
  onGameOver(score: number): void;
  onHappyTime(): void;
  onGameplayStart(): void;
  onGameplayStop(): void;
}

export class Engine {
  status: GameStatus = 'ready';
  tower: Block[] = [];
  current: Block | null = null;
  debris: Debris[] = [];
  combo = 0;
  score = 0;
  best = 0;
  /** 完美对齐提示文字剩余显示时间 */
  perfectNotice = 0;
  perfectNoticeCombo = 0;
  /** 死亡遮罩按钮区 */
  buttons: ButtonRect[] = [];

  private W = 0;
  private H = 0;
  private cameraY = 0;
  private moveDir: 1 | -1 = 1;
  private speed = SPEED_BASE;
  private deadTimer = 0;
  private hueSeed = Math.random() * 360;

  constructor(private cb: EngineCallbacks) {}

  resize(w: number, h: number): void {
    const first = this.W === 0;
    this.W = w;
    this.H = h;
    if (first) this.reset();
  }

  /** 开始新游戏 */
  start(): void {
    this.reset();
    this.status = 'playing';
    this.spawnNext();
    this.cb.onGameplayStart();
  }

  /** 完整重置回 ready 状态 */
  reset(): void {
    this.status = 'ready';
    this.tower = [];
    this.current = null;
    this.debris = [];
    this.combo = 0;
    this.score = 0;
    this.cameraY = 0;
    this.speed = SPEED_BASE;
    this.perfectNotice = 0;
    this.buttons = [];
    this.hueSeed = Math.random() * 360;
    const baseW = this.W * BASE_W_RATIO;
    this.tower.push({
      x: (this.W - baseW) / 2,
      y: this.H - BLOCK_H * 2,
      w: baseW,
      h: BLOCK_H,
      hue: this.hueFor(0),
      flash: 0,
    });
    this.cb.onScore(0);
  }

  /** 复活：在塔顶补一块完整宽度的方块，继续游戏 */
  revive(): void {
    const top = this.tower[this.tower.length - 1];
    if (!top) return;
    this.debris = [];
    this.combo = 0;
    this.speed = Math.min(SPEED_MAX, SPEED_BASE + this.tower.length * SPEED_GROWTH);
    this.status = 'playing';
    this.spawnNext();
    this.cb.onGameplayStart();
  }

  /** 主输入：落下当前方块（ready 开始 / dead 且过了锁定期重开） */
  tap(): void {
    if (this.status === 'ready') {
      this.start();
      return;
    }
    if (this.status === 'dead') {
      if (this.deadTimer >= DEAD_INPUT_LOCK) this.start();
      return;
    }
    if (this.current) this.drop();
  }

  update(dt: number): void {
    if (this.status === 'dead') this.deadTimer += dt;

    // 待落块往复移动
    if (this.status === 'playing' && this.current) {
      const c = this.current;
      c.x += this.moveDir * this.speed * dt;
      if (c.x <= 0) { c.x = 0; this.moveDir = 1; }
      else if (c.x + c.w >= this.W) { c.x = this.W - c.w; this.moveDir = -1; }
    }

    // 碎块物理
    for (const d of this.debris) {
      d.vy += GRAVITY * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.vr * dt;
    }
    // 与塔身剔除同一类问题：碎块存活判断也要加相机平移，
    // 否则高塔（camY 大）时碎块在屏幕外滞留到很晚才被回收
    this.debris = this.debris.filter((d) => d.y + this.cameraY < this.H + 200);

    // 相机平滑跟随
    const top = this.tower[this.tower.length - 1];
    if (top) {
      const targetY = Math.max(0, this.H * CAMERA_ANCHOR - top.y);
      this.cameraY += (targetY - this.cameraY) * Math.min(1, dt * 6);
    }

    // 闪光衰减
    for (const b of this.tower) if (b.flash > 0) b.flash = Math.max(0, b.flash - dt);
    if (this.perfectNotice > 0) this.perfectNotice = Math.max(0, this.perfectNotice - dt);
  }

  private drop(): void {
    const cur = this.current!;
    const prev = this.tower[this.tower.length - 1];
    const dx = cur.x - prev.x;
    const absDx = Math.abs(dx);

    if (absDx <= PERFECT_TOLERANCE) {
      // 完美对齐：宽度不缩减，连击 +1
      cur.x = prev.x;
      cur.w = prev.w;
      cur.flash = 0.4;
      this.combo += 1;
      this.perfectNotice = 0.9;
      this.perfectNoticeCombo = this.combo;
      if (this.combo > 0 && this.combo % COMBO_BONUS_EVERY === 0) {
        // 连击奖励：宽度回涨（不超过初始基座宽）
        const maxW = this.W * BASE_W_RATIO;
        cur.w = Math.min(maxW, cur.w + COMBO_BONUS_W);
      }
      if (this.combo >= 5) this.cb.onHappyTime();
      this.cb.onPerfect(this.combo);
    } else {
      // 求交切割
      const left = Math.max(prev.x, cur.x);
      const right = Math.min(prev.x + prev.w, cur.x + cur.w);
      const overlap = right - left;
      if (overlap <= 0) {
        this.gameOver();
        return;
      }
      // 生成被切除的碎块（左侧或右侧）
      if (cur.x < prev.x) {
        this.debris.push(this.makeDebris(cur.x, cur.y, prev.x - cur.x, cur));
      } else if (cur.x + cur.w > prev.x + prev.w) {
        this.debris.push(this.makeDebris(prev.x + prev.w, cur.y, cur.x + cur.w - (prev.x + prev.w), cur));
      }
      cur.x = left;
      cur.w = overlap;
      this.combo = 0;
    }

    this.tower.push(cur);
    this.current = null;
    this.score = this.tower.length - 1; // 基座不计分
    this.cb.onScore(this.score);

    if (this.score > this.best) this.best = this.score;

    this.speed = Math.min(SPEED_MAX, SPEED_BASE + this.score * SPEED_GROWTH);
    this.spawnNext();
  }

  private gameOver(): void {
    this.status = 'dead';
    this.current = null;
    this.deadTimer = 0;
    this.cb.onGameplayStop();
    this.cb.onGameOver(this.score);
  }

  private spawnNext(): void {
    const prev = this.tower[this.tower.length - 1];
    this.moveDir = this.tower.length % 2 === 1 ? 1 : -1;
    const hue = this.hueFor(this.tower.length);
    this.current = {
      x: this.moveDir === 1 ? -prev.w : this.W,
      y: prev.y - BLOCK_H,
      w: prev.w,
      h: BLOCK_H,
      hue,
      flash: 0,
    };
  }

  private makeDebris(x: number, y: number, w: number, src: Block): Debris {
    return {
      x, y, w, h: src.h,
      vx: (x < src.x ? -1 : 1) * (60 + Math.random() * 80),
      vy: -80,
      rot: 0,
      vr: (Math.random() - 0.5) * 4,
      hue: src.hue,
    };
  }

  private hueFor(layer: number): number {
    return (this.hueSeed + layer * 12) % 360;
  }

  // ---- 渲染辅助访问器 ----
  get viewW(): number { return this.W; }
  get viewH(): number { return this.H; }
  get camY(): number { return this.cameraY; }
  get deadElapsed(): number { return this.deadTimer; }
  get deadLock(): number { return DEAD_INPUT_LOCK; }
  get blockH(): number { return BLOCK_H; }
  get baseWRatio(): number { return BASE_W_RATIO; }
  get perfectTolerance(): number { return PERFECT_TOLERANCE; }
}
