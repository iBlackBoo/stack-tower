/** 游戏核心类型定义 */

export interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  hue: number;
  /** 完美落层闪光计时（渲染用，秒） */
  flash: number;
}

export interface Debris {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  hue: number;
}

export type GameStatus = 'ready' | 'playing' | 'dead';

/** UI 按钮命中区（Canvas 内绘制，供输入检测） */
export interface ButtonRect {
  id: 'revive' | 'restart' | 'start';
  x: number;
  y: number;
  w: number;
  h: number;
}
