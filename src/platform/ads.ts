/**
 * 广告平台适配层
 * 设计原则：游戏核心逻辑只依赖 AdProvider 接口，不感知任何平台 SDK。
 * 同一份代码可运行于：CrazyGames 等平台 iframe / 自托管官网 / 本地开发。
 */

export type RewardedResult = 'completed' | 'failed' | 'unavailable';

export interface AdProvider {
  /** 实现名称，用于调试 */
  readonly name: string;
  init(): void;
  /** 激励广告（复活/道具），resolve 观看结果 */
  rewarded(): Promise<RewardedResult>;
  /** 插屏广告（关卡间自然停顿），resolve 是否实际展示 */
  midgame(): Promise<boolean>;
  /** 展示横幅广告（传入容器元素） */
  showBanner(container: HTMLElement): void;
  clearBanners(): void;
  // ---- 平台生命周期钩子（平台方用于广告节奏与资源调度）----
  onGameplayStart(): void;
  onGameplayStop(): void;
  onLoadingStart(): void;
  onLoadingStop(): void;
  /** 成就时刻（高连击等），平台会播放庆祝效果 */
  onHappyTime(): void;
}

/** CrazyGames SDK 最小类型声明（只声明用到的部分） */
interface CrazySDK {
  init(): void;
  requestAd(type?: 'midgame' | 'rewarded'): void;
  addEventListener(event: 'adStarted' | 'adFinished' | 'adError', cb: () => void): void;
  removeEventListener(event: 'adStarted' | 'adFinished' | 'adError', cb: () => void): void;
  hasAdBlock(): Promise<boolean>;
  gameplayStart(): void;
  gameplayStop(): void;
  loadingStart(): void;
  loadingStop(): void;
  happytime(): void;
}

declare global {
  interface Window {
    CrazyGames?: { CrazySDK: { getInstance(): CrazySDK } };
  }
}

/** 本地开发 / 无平台环境：全部空实现 + 日志，保证游戏完整体验 */
export class DevAdProvider implements AdProvider {
  readonly name = 'dev';

  init(): void { /* 无需初始化 */ }

  async rewarded(): Promise<RewardedResult> {
    console.log('[Ad:dev] rewarded requested -> simulated completed');
    return 'completed';
  }

  async midgame(): Promise<boolean> {
    console.log('[Ad:dev] midgame requested -> simulated skipped');
    return false;
  }

  showBanner(_container: HTMLElement): void { /* 本地无横幅 */ }
  clearBanners(): void { /* 本地无横幅 */ }
  onGameplayStart(): void { /* noop */ }
  onGameplayStop(): void { /* noop */ }
  onLoadingStart(): void { /* noop */ }
  onLoadingStop(): void { /* noop */ }
  onHappyTime(): void { /* noop */ }
}

/** CrazyGames 平台实现 */
export class CrazyAdProvider implements AdProvider {
  readonly name = 'crazygames';
  private sdk: CrazySDK | null = null;

  init(): void {
    try {
      this.sdk = window.CrazyGames!.CrazySDK.getInstance();
      this.sdk.init();
    } catch (e) {
      console.warn('[Ad] CrazySDK init failed, fallback to no-op', e);
      this.sdk = null;
    }
  }

  rewarded(): Promise<RewardedResult> {
    return new Promise((resolve) => {
      if (!this.sdk) { resolve('unavailable'); return; }
      let settled = false;
      const done = (r: RewardedResult) => {
        if (settled) return;
        settled = true;
        this.sdk!.removeEventListener('adFinished', onFinish);
        this.sdk!.removeEventListener('adError', onError);
        resolve(r);
      };
      const onFinish = () => done('completed');
      const onError = () => done('failed');
      this.sdk.addEventListener('adFinished', onFinish);
      this.sdk.addEventListener('adError', onError);
      try {
        this.sdk.requestAd('rewarded');
      } catch {
        done('unavailable');
      }
    });
  }

  midgame(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.sdk) { resolve(false); return; }
      let settled = false;
      const done = (shown: boolean) => {
        if (settled) return;
        settled = true;
        this.sdk!.removeEventListener('adFinished', onFinish);
        this.sdk!.removeEventListener('adError', onError);
        resolve(shown);
      };
      const onFinish = () => done(true);
      const onError = () => done(false);
      this.sdk.addEventListener('adFinished', onFinish);
      this.sdk.addEventListener('adError', onError);
      try {
        this.sdk.requestAd('midgame');
      } catch {
        done(false);
      }
    });
  }

  showBanner(_container: HTMLElement): void {
    // 横幅在原型阶段不启用（v3 的 banner API 与 v2 不同，后续接平台时再接入）
    console.log('[Ad] banner requested (not yet wired)');
  }

  clearBanners(): void { /* noop */ }
  onGameplayStart(): void { this.safe(() => this.sdk!.gameplayStart()); }
  onGameplayStop(): void { this.safe(() => this.sdk!.gameplayStop()); }
  onLoadingStart(): void { this.safe(() => this.sdk!.loadingStart()); }
  onLoadingStop(): void { this.safe(() => this.sdk!.loadingStop()); }
  onHappyTime(): void { this.safe(() => this.sdk!.happytime()); }

  private safe(fn: () => void): void {
    try { fn(); } catch { /* 平台钩子失败不应影响游戏 */ }
  }
}

/**
 * Google H5 Games Ads 实现（仅自托管域名可用）
 * 依赖页面加载 Ad Placement API（adsbygoogle.js），调用 adConfig()/adBreak()。
 * 申请前提：已批准的 AdSense 账户 + 单独的 H5 Games Ads 资格（by application）。
 *
 * 关键行为：
 * - Google 自动频率限制：广告过密时 adBreakDone 仍回调但不播放（breakStatus=frequencyCapped），
 *   此时 rewarded 必须判 failed——不能白送奖励；
 * - 全屏广告只允许出现在自然转换点（关卡间/暂停），start 类型不被允许用于插播。
 */
interface AdBreakOptions {
  type: 'preroll' | 'start' | 'pause' | 'next' | 'browse' | 'reward';
  name?: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  adBreakDone?: (info?: { breakStatus?: string }) => void;
}

declare global {
  interface Window {
    adConfig?: (o: { preloadAdBreaks?: 'on' | 'off' }) => void;
    adBreak?: (o: AdBreakOptions) => void;
  }
}

export class GoogleH5AdProvider implements AdProvider {
  readonly name = 'google-h5';

  init(): void {
    try {
      window.adConfig?.({ preloadAdBreaks: 'on' });
    } catch (e) {
      console.warn('[Ad] Google adConfig failed', e);
    }
  }

  rewarded(): Promise<RewardedResult> {
    return new Promise((resolve) => {
      if (!window.adBreak) { resolve('unavailable'); return; }
      let started = false;
      let settled = false;
      const done = (r: RewardedResult) => {
        if (settled) return;
        settled = true;
        resolve(r);
      };
      try {
        window.adBreak({
          type: 'reward',
          name: 'revive',
          beforeAd: () => { started = true; },
          afterAd: () => { /* 恢复由调用方处理 */ },
          adBreakDone: (info) => {
            // 频率限制未实际播放 → 不发奖励
            if (started && info?.breakStatus !== 'frequencyCapped') done('completed');
            else done('failed');
          },
        });
      } catch {
        done('unavailable');
      }
    });
  }

  midgame(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!window.adBreak) { resolve(false); return; }
      let started = false;
      let settled = false;
      const done = (shown: boolean) => {
        if (settled) return;
        settled = true;
        resolve(shown);
      };
      try {
        window.adBreak({
          type: 'next', // 关卡间自然停顿（政策要求的合法位置）
          name: 'level-break',
          beforeAd: () => { started = true; },
          afterAd: () => { /* noop */ },
          adBreakDone: (info) => {
            done(started && info?.breakStatus !== 'frequencyCapped');
          },
        });
      } catch {
        done(false);
      }
    });
  }

  showBanner(_container: HTMLElement): void {
    // H5 Games Ads 不提供 banner；横幅走 AdSense 展示广告单元，后续单独接入
    console.log('[Ad] banner not supported by H5 Games Ads API');
  }

  clearBanners(): void { /* noop */ }
  onGameplayStart(): void { /* Google 无对应钩子 */ }
  onGameplayStop(): void { /* Google 无对应钩子 */ }
  onLoadingStart(): void { /* Google 无对应钩子 */ }
  onLoadingStop(): void { /* Google 无对应钩子 */ }
  onHappyTime(): void { /* Google 无对应钩子 */ }
}

/**
 * 工厂：检测运行环境，按优先级选择广告提供方。
 * 1. CrazyGames 等平台 iframe → 平台 SDK（平台方规定只允许自家 SDK 请求广告）
 * 2. 自托管域名（检测到 Google Ad Placement API）→ Google H5 Games Ads
 * 3. 本地开发 → Dev 空实现
 */
export function createAdProvider(): AdProvider {
  const hasCrazy = typeof window !== 'undefined'
    && !!window.CrazyGames && typeof window.CrazyGames.CrazySDK?.getInstance === 'function';
  if (hasCrazy) {
    const provider = new CrazyAdProvider();
    console.log(`[Ad] provider = ${provider.name}`);
    return provider;
  }
  const hasGoogle = typeof window !== 'undefined' && typeof window.adBreak === 'function';
  const provider: AdProvider = hasGoogle ? new GoogleH5AdProvider() : new DevAdProvider();
  console.log(`[Ad] provider = ${provider.name}`);
  return provider;
}
