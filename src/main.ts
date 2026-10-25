/**
 * 入口：装配画布、引擎、渲染、输入、广告平台适配层，驱动主循环。
 * StackNova - 物理堆叠 H5 游戏
 */

declare global {
  interface Window {
    /** index.html 的 cookie 同意条写入：false 表示用户拒绝非必要 cookie（GDPR） */
    __snAdsAllowed?: boolean;
    /** 页面语言切换调用：同步游戏内 i18n 状态，Canvas 文本下一帧即生效 */
    __snSetLang?: (lang: 'zh' | 'en') => void;
    /** index.html 的音效 pill 调用：切换静音并刷新图标 */
    __snSound?: import('./platform/audio').SoundManager;
  }
}

import { Engine } from './game/engine';
import { setLang } from './i18n';
import { Renderer } from './game/render';
import { Input } from './game/input';
import { createAdProvider } from './platform/ads';
import { loadBest, saveBest } from './platform/storage';
import { sound } from './platform/audio';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// ---- 画布尺寸：CSS 像素 + DPR 缩放，防模糊 ----
function resizeCanvas(): { w: number; h: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}

let { w, h } = resizeCanvas();

// ---- 广告平台 ----
// GDPR：用户在 cookie 条选择 Decline 时不初始化任何广告 SDK
const adsAllowed = window.__snAdsAllowed !== false;
const ads = adsAllowed ? createAdProvider() : null;
ads?.init();
console.log(`[Ad] init ${adsAllowed ? 'enabled' : 'skipped (consent declined)'}`);

// ---- 引擎 ----
let best = loadBest();

const engine = new Engine({
  onScore: (score) => {
    if (score > 0) sound.land(); // 普通落层闷响（reset 传 0 不响；完美落层的叮声后叠加）
    if (score > best) {
      best = score;
      saveBest(best);
    }
  },
  onPerfect: (combo) => sound.perfect(combo),
  onGameOver: () => {
    sound.gameOver();
    // 死亡即 gameplayStop（平台钩子）
    engine; // noop，钩子已在 gameOver 内调用
  },
  onHappyTime: () => ads?.onHappyTime(),
  onGameplayStart: () => ads?.onGameplayStart(),
  onGameplayStop: () => ads?.onGameplayStop(),
});

engine.resize(w, h);

// ---- 渲染 ----
const renderer = new Renderer(ctx);

// ---- 输入 ----
// 输入监听在构造器内自绑定，无需持有引用
new Input(
  canvas,
  engine,
  () => {
    if (engine.status === 'ready') sound.start(); // 开局上行音
    engine.tap();
  },
  (id) => {
    sound.click();
    if (id === 'revive') {
      void (async () => {
        const result = await ads?.rewarded();
        if (result === 'completed') engine.revive();
      })();
    } else if (id === 'restart') {
      engine.start();
    }
  },
);

// ---- 页面隐藏时通知平台（暂停钩子）----
document.addEventListener('visibilitychange', () => {
  if (document.hidden && engine.status === 'playing') {
    ads?.onGameplayStop();
  } else if (!document.hidden && engine.status === 'playing') {
    ads?.onGameplayStart();
  }
});

// ---- 窗口尺寸变化 ----
window.addEventListener('resize', () => {
  const size = resizeCanvas();
  w = size.w;
  h = size.h;
  engine.resize(w, h);
});

// ---- 主循环 ----
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05); // 夹住 dt，防切后台后跳变
  last = now;
  engine.update(dt);
  renderer.draw(engine, best);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 调试挂载（控制台可玩）
(window as unknown as { game: Engine }).game = engine;

// 语言切换钩子：页面 pill 按钮点击时调用，Canvas 文本实时切换无需刷新
window.__snSetLang = setLang;

// 音效开关钩子：页面 pill 读取静音状态、切换后刷新图标
window.__snSound = sound;
