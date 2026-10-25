/**
 * Canvas 渲染器
 * 深色主题，色块随层高循环变色，相机平移绘制塔身。
 * 全部用户可见文本走 i18n（中英双语切换）。
 */

import type { Engine } from './engine';
import type { ButtonRect } from './types';
import { t, tn } from '../i18n';

const FONT_STACK = '-apple-system, "PingFang SC", "Segoe UI", Roboto, sans-serif';

export class Renderer {
  constructor(private ctx: CanvasRenderingContext2D) {}

  draw(engine: Engine, best: number): void {
    const { ctx } = this;
    const W = engine.viewW;
    const H = engine.viewH;
    const camY = engine.camY;

    // ---- 背景：随高度缓慢变色的深色渐变 ----
    const bgHue = (200 + engine.score * 1.5) % 360;
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, `hsl(${bgHue}, 28%, 14%)`);
    grad.addColorStop(1, `hsl(${bgHue}, 24%, 9%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 远景装饰光斑（营造纵深，纯氛围不干扰）
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i++) {
      const r = 60 + i * 34;
      const y = H * 0.25 + i * 90 - (camY * 0.15) % 400;
      ctx.beginPath();
      ctx.arc(W * (0.2 + 0.16 * i), y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ---- 塔身（应用相机平移）----
    ctx.save();
    ctx.translate(0, camY);

    for (const b of engine.tower) {
      const screenY = b.y;
      if (screenY > H + 60 || screenY < -60) continue;
      this.drawBlock(b.x, screenY, b.w, b.h, b.hue, b.flash);
    }

    // 待落块
    if (engine.current) {
      const c = engine.current;
      // 落点参考线
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(c.x + c.w / 2, c.y + c.h);
      ctx.lineTo(c.x + c.w / 2, H);
      ctx.stroke();
      ctx.restore();
      this.drawBlock(c.x, c.y, c.w, c.h, c.hue, 0);
    }

    // 碎块
    for (const d of engine.debris) {
      ctx.save();
      ctx.translate(d.x + d.w / 2, d.y + d.h / 2);
      ctx.rotate(d.rot);
      this.drawBlockRect(-d.w / 2, -d.h / 2, d.w, d.h, d.hue, 0);
      ctx.restore();
    }

    ctx.restore();

    // ---- UI 层（不随相机移动）----
    // HUD 仅游戏进行中显示：准备/结束界面自带完整信息面板，
    // 若 HUD 画在半透明遮罩下层会透上来形成叠影模糊
    if (engine.status === 'playing') this.drawHUD(engine, best);
    this.drawPerfectNotice(engine);

    if (engine.status === 'ready') this.drawReady(engine);
    if (engine.status === 'dead') this.drawGameOver(engine, best);
  }

  private drawBlock(x: number, y: number, w: number, h: number, hue: number, flash: number): void {
    this.drawBlockRect(x, y, w, h, hue, flash);
  }

  private drawBlockRect(x: number, y: number, w: number, h: number, hue: number, flash: number): void {
    const { ctx } = this;
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, `hsl(${hue}, 62%, 58%)`);
    g.addColorStop(1, `hsl(${hue}, 58%, 46%)`);
    ctx.fillStyle = g;
    const r = 4;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.roundRect(x + 2, y + 2, w - 4, Math.max(2, h * 0.18), 2);
    ctx.fill();
    if (flash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, flash * 2.2);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawHUD(engine: Engine, best: number): void {
    const { ctx } = this;
    const W = engine.viewW;
    ctx.save();
    ctx.textAlign = 'center';
    // 分数
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = `700 ${Math.round(W * 0.14)}px ${FONT_STACK}`;
    ctx.fillText(String(engine.score), W / 2, W * 0.16);
    // 最高分
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `500 ${Math.round(W * 0.038)}px ${FONT_STACK}`;
    ctx.fillText(`${t('best')} ${best}`, W / 2, W * 0.16 + W * 0.05);
    // 连击
    if (engine.combo >= 2 && engine.status === 'playing') {
      ctx.fillStyle = `hsl(${45 + engine.combo * 8}, 90%, 62%)`;
      ctx.font = `700 ${Math.round(W * 0.045)}px ${FONT_STACK}`;
      ctx.fillText(`${t('combo')} ×${engine.combo}`, W / 2, W * 0.24);
    }
    ctx.restore();
  }

  /** 完美对齐提示：中央弹出，缩放+淡出 */
  private drawPerfectNotice(engine: Engine): void {
    if (engine.perfectNotice <= 0) return;
    const { ctx } = this;
    const W = engine.viewW;
    const H = engine.viewH;
    const p = 1 - engine.perfectNotice / 0.9; // 0→1 进度
    ctx.save();
    ctx.globalAlpha = Math.min(1, (1 - p) * 2.5);
    const scale = 1 + (1 - Math.min(1, p * 4)) * 0.35; // 初弹放大再回落
    ctx.translate(W / 2, H * 0.38);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd166';
    ctx.font = `800 ${Math.round(W * 0.09)}px ${FONT_STACK}`;
    ctx.fillText(`${t('perfect')}${engine.perfectNoticeCombo > 1 ? ` ×${engine.perfectNoticeCombo}` : ''}`, 0, 0);
    ctx.restore();
  }

  private drawReady(engine: Engine): void {
    const { ctx } = this;
    const W = engine.viewW;
    const H = engine.viewH;
    ctx.save();
    ctx.fillStyle = 'rgba(10,12,18,0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    // 标题
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(W * 0.11)}px ${FONT_STACK}`;
    ctx.fillText(t('gameTitle'), W / 2, H * 0.3);
    // 操作提示组（两行收紧，作为一组信息）
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `500 ${Math.round(W * 0.04)}px ${FONT_STACK}`;
    ctx.fillText(t('hintDrop'), W / 2, H * 0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `400 ${Math.round(W * 0.032)}px ${FONT_STACK}`;
    ctx.fillText(t('hintAlign'), W / 2, H * 0.45);
    // 开始按钮：pill 样式 + 呼吸效果，与结束界面按钮语言一致
    const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 400);
    ctx.globalAlpha = pulse;
    const btnW = Math.min(W * 0.52, 300);
    const btnH = Math.max(44, Math.round(W * 0.062));
    const btnX = W / 2 - btnW / 2;
    const btnY = H * 0.58 - btnH / 2;
    ctx.fillStyle = 'rgba(255,209,102,0.14)';
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, btnW, btnH, btnH / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,209,102,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.font = `700 ${Math.round(btnH * 0.42)}px ${FONT_STACK}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(t('tapToStart'), W / 2, btnY + btnH / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  private drawGameOver(engine: Engine, best: number): void {
    const { ctx } = this;
    const W = engine.viewW;
    const H = engine.viewH;
    const btnW = Math.min(W * 0.6, 280);
    const btnH = 52;
    const cx = W / 2;
    const buttons: ButtonRect[] = [];

    ctx.save();
    ctx.fillStyle = 'rgba(10,12,18,0.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';

    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(W * 0.09)}px ${FONT_STACK}`;
    ctx.fillText(t('gameOver'), cx, H * 0.34);

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `600 ${Math.round(W * 0.05)}px ${FONT_STACK}`;
    ctx.fillText(tn('scoreLayers', engine.score), cx, H * 0.42);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `400 ${Math.round(W * 0.036)}px ${FONT_STACK}`;
    ctx.fillText(tn('bestLayers', best), cx, H * 0.47);

    // 复活按钮（看广告）
    const reviveY = H * 0.56;
    this.drawButton(cx - btnW / 2, reviveY, btnW, btnH, '#f4a261', t('revive'), '#1a1208');
    buttons.push({ id: 'revive', x: cx - btnW / 2, y: reviveY, w: btnW, h: btnH });

    // 重开按钮
    const restartY = reviveY + btnH + 16;
    const restartActive = engine.deadElapsed >= engine.deadLock;
    ctx.globalAlpha = restartActive ? 1 : 0.35;
    this.drawButton(cx - btnW / 2, restartY, btnW, btnH, 'rgba(255,255,255,0.14)', t('restart'), '#ffffff', true);
    buttons.push({ id: 'restart', x: cx - btnW / 2, y: restartY, w: btnW, h: btnH });
    ctx.globalAlpha = 1;

    if (!restartActive) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = `400 ${Math.round(W * 0.03)}px ${FONT_STACK}`;
      ctx.fillText(t('waitHint'), cx, restartY + btnH + 22);
    }

    ctx.restore();
    engine.buttons = buttons;
  }

  private drawButton(
    x: number, y: number, w: number, h: number,
    bg: string, label: string, fg: string, stroke = false,
  ): void {
    const { ctx } = this;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fillStyle = fg;
    ctx.font = `700 ${Math.round(h * 0.4)}px ${FONT_STACK}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2);
    ctx.textBaseline = 'alphabetic';
  }
}
