/**
 * 国际化（i18n）核心
 * - 语言持久化在 localStorage，默认按 navigator.language 检测（zh 开头→中文，其余→英文）
 * - 游戏内 Canvas 文本与 DOM 页面共用同一语言状态
 * - 模板变量：t('key').replace('{n}', String(value))
 */

export type Lang = 'zh' | 'en';

const STORAGE_KEY = 'sn-lang';

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch { /* 无痕模式 */ }
  const nav = (navigator.language || '').toLowerCase();
  return nav.startsWith('zh') ? 'zh' : 'en';
}

let current: Lang = detectLang();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch { /* 无痕模式仅内存生效 */ }
}

const dict = {
  en: {
    // HUD
    best: 'BEST',
    combo: 'COMBO',
    // Ready 界面
    gameTitle: 'STACK NOVA',
    tapToStart: 'TAP TO START',
    hintDrop: 'Tap, click, or press Space to drop a block',
    hintAlign: 'The more precise, the steadier the tower',
    // Game Over 界面
    gameOver: 'GAME OVER',
    scoreLayers: '{n} layers',
    bestLayers: 'Best {n}',
    revive: 'Watch ad to revive',
    restart: 'Restart',
    waitHint: 'One moment, to avoid mis-taps',
    // 完美提示
    perfect: 'PERFECT',
    // DOM（footer / cookie 条）
    footerPrivacy: 'Privacy Policy',
    footerTerms: 'Terms of Service',
    footerAbout: 'About',
    cookieText: 'We use cookies and similar technologies (including third-party advertising partners such as Google) to keep the game free. See our Privacy Policy.',
    cookieAccept: 'Accept',
    cookieDecline: 'Decline',
    langSwitch: '中文',
  },
  zh: {
    best: '最高',
    combo: '连击',
    gameTitle: 'STACK NOVA',
    tapToStart: '点击开始',
    hintDrop: '点击、触摸或空格，让方块落下',
    hintAlign: '对齐越精准，塔越稳',
    gameOver: '游戏结束',
    scoreLayers: '本局 {n} 层',
    bestLayers: '最高 {n} 层',
    revive: '看广告复活',
    restart: '重新开始',
    waitHint: '稍等片刻，避免误触',
    perfect: '完美',
    footerPrivacy: '隐私政策',
    footerTerms: '服务条款',
    footerAbout: '关于',
    cookieText: '我们使用 Cookie 及类似技术（包括 Google 等第三方广告合作伙伴）以保证游戏免费畅玩。详见我们的隐私政策。',
    cookieAccept: '同意',
    cookieDecline: '拒绝',
    langSwitch: 'EN',
  },
} as const;

export type I18nKey = keyof typeof dict.en;

export function t(key: I18nKey): string {
  return dict[current][key];
}

/** 带单个数字占位的快捷方法 */
export function tn(key: I18nKey, n: number): string {
  return dict[current][key].replace('{n}', String(n));
}
