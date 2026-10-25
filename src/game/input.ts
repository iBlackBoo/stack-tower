/**
 * 输入适配层：Pointer 事件统一处理触摸/鼠标/笔，另支持空格/回车。
 * 游戏内没有 DOM 控件，按钮命中由渲染器写入 engine.buttons，这里做矩形检测。
 */

import type { Engine } from './engine';

export class Input {
  private lastTapTime = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private engine: Engine,
    private onTap: () => void,
    private onButton: (id: 'revive' | 'restart' | 'start') => void,
  ) {
    canvas.addEventListener('pointerdown', this.handlePointer);
    window.addEventListener('keydown', this.handleKey);
  }

  private handlePointer = (e: PointerEvent): void => {
    e.preventDefault();
    this.lastTapTime = performance.now();

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 死亡状态：优先检测按钮命中
    if (this.engine.status === 'dead') {
      for (const btn of this.engine.buttons) {
        if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
          if (btn.id === 'restart' && this.engine.deadElapsed < this.engine.deadLock) return;
          this.onButton(btn.id);
          return;
        }
      }
    }
    this.onTap();
  };

  private handleKey = (e: KeyboardEvent): void => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      // 死亡状态的复活/重开由按钮点击触发，键盘只负责主操作
      this.onTap();
    }
  };

  get lastInteraction(): number { return this.lastTapTime; }
}
