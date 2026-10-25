# StackNova · H5 物理堆叠

平台发行方向的第一个游戏。原生 TypeScript + Canvas 2D，零游戏引擎依赖。

## 快速开始

```bash
# 1. 安装依赖（esbuild + typescript）
npm install

# 2. 构建（输出 dist/game.js）
npm run build:dev   # 开发构建（未压缩，便于调试）
npm run build       # 发布构建（压缩）

# 3. 运行
# 方式 A：任意静态服务器 serve 项目根目录
npx serve .         # 或 python -m http.server 8000
# 方式 B：直接双击 index.html（IIFE bundle 支持 file:// 打开）
```

浏览器打开后：点击 / 触摸 / 空格 = 方块落下。死亡后可看广告复活（本地为模拟）。

## 目录结构

```
stack-tower/
├── index.html            # 入口页（含 CrazySDK script 标签）
├── favicon.svg / favicon-16/32.png / apple-touch-icon.png / icon-192/512.png  # 站点图标（堆叠方块）
├── src/
│   ├── main.ts           # 装配：画布/引擎/渲染/输入/广告 + 主循环
│   ├── game/
│   │   ├── engine.ts     # 核心玩法：移动、求交切割、连击、复活、相机
│   │   ├── render.ts     # Canvas 渲染：塔身/碎块/HUD/遮罩
│   │   ├── input.ts      # Pointer 事件（鼠标/触摸/笔统一）+ 键盘
│   │   └── types.ts      # 共享类型
│   └── platform/
│       ├── ads.ts        # 广告适配层：AdProvider 接口 + Dev/CrazyGames/GoogleH5 三实现
│       ├── audio.ts      # 音效：WebAudio 程序化合成（落层/完美/结束/点击/开局）
│       └── storage.ts    # 最高分存储（localStorage + 内存降级）
└── dist/                 # 构建产物（gitignore）
```

## 架构要点

- **平台无感**：游戏核心只依赖 `AdProvider` 接口。检测到 `window.CrazyGames` 走平台 SDK，否则走 Dev 空实现——同一份代码跑平台 iframe / 自托管 / 本地。
- **中英双语（i18n）**：`src/i18n.ts` 为单一语言源——Canvas 内文本（HUD/按钮/提示）与 DOM（footer/cookie 条/合规三页）共用。语言持久化在 `localStorage['sn-lang']`，默认按 `navigator.language` 检测。切换入口：游戏页底栏「中文/EN」、各合规页右上角按钮。Canvas 文本实时切换无需刷新；DOM 部分由各页脚本即时重绘。
- **GDPR 同意门控**：用户在 cookie 条选 Decline → `window.__snAdsAllowed = false` → 广告 SDK 完全不初始化。
- **音效（WebAudio）**：`src/platform/audio.ts` 程序化合成，零音频资源文件——落层闷响+切削、完美双音叮（音高随连击上升）、结束三连下行音、开局上行音、按钮 tick。AudioContext 懒创建（首次用户手势时初始化，符合自动播放策略）；右上角 🔊/🔇 pill 开关，偏好持久化 `localStorage['sn-muted']`。
- **DPR 缩放**：画布按 devicePixelRatio 渲染，高清屏不模糊。
- **dt 夹紧**：主循环 dt 上限 50ms，切后台回来不会跳变。
- **无后端**：最高分走 localStorage；死亡/复活/广告全部本地闭环。

## 平台接入清单（上线前）

- [ ] CrazyGames 开发者门户提交（本地可用官方 `sdk.html` 模板模拟平台环境测试）
- [ ] Poki 提交（质量门槛最高，可后于 CrazyGames）
- [ ] GameDistribution（GD_SDK，铺 4000+ 门户走量）
- [ ] Google H5 Games Ads 申请（自有域名流量，需先过 AdSense 站点审核）

## Google 合规文件（已内置，占位信息已替换为真实值）

| 文件 | 作用 | 状态 |
|------|------|------|
| `privacy-policy.html` | 隐私政策：本地存储披露、第三方广告 cookie、GDPR/CCPA 权利、儿童条款 | ✅ 域名 `stacknova.cn` + 邮箱 `hello@blackgames.cn` 已填入 |
| `terms-of-service.html` | 服务条款：许可、广告、免责、责任限制 | ✅ 域名 + 邮箱已填入 |
| `about.html` | 关于页：游戏介绍、技术栈、联系方式 | ✅ 域名 + 邮箱已填入（平台审核会查联系渠道） |
| `index.html` 内 cookie 条 | GDPR 同意：选 Decline 则**不初始化任何广告 SDK** | ✅ 已生效，无需改动 |
| `robots.txt` / `sitemap.xml` | 爬虫与收录 | ✅ 域名已替换为 `stacknova.cn` |
| `ads.txt` | 广告授权（AdSense 后台生成后粘贴） | ✅ 已按发布商 ID 填入（`google.com, pub-6465192362290250, DIRECT, f08c47fec0942fa0`，与后台核对） |

## 广告来源：三种环境，三个广告源

「看广告复活」看到的广告**取决于游戏跑在哪里**，代码按环境自动路由（`src/platform/ads.ts` 工厂）：

| 运行环境 | 复活广告来源 | 触发代码 | 你的收入 |
|---------|------------|---------|---------|
| CrazyGames 等平台 iframe | **CrazyGames 广告网络**（平台对接的广告主需求） | `crazysdk.requestAd("rewarded")` | 平台分成（CrazyGames 给 60%） |
| 自托管官网（你的域名） | **Google H5 Games Ads**（AdSense 广告主需求） | `window.adBreak({ type: 'reward' })` | AdSense 发布商分成（约 68%） |
| 本地开发 | 无（Dev 模拟） | — | — |

**平台规则**：CrazyGames 明确只允许自家 SDK 请求广告，所以平台环境看的不可能是 Google 广告；Google H5 Games Ads 只在自托管域名生效（需 AdSense 账户批准 + 单独申请 H5 资格）。

**Google 广告已接入**（发布商 ID `ca-pub-6465192362290250`）：`index.html` 内为官方两段式代码——① `adsbygoogle.js` script 标签（站点验证 + 自动广告，4 个页面均已挂载）② 内联 boilerplate 定义 `adBreak()`/`adConfig()`（H5 Games Ads 必需）。域名过 AdSense 审核后去申请 H5 Games Ads 资格；代码检测到 `window.adBreak` 存在即自动切换 GoogleH5AdProvider，复活/插屏全部走 Google 需求。**上传 CrazyGames 等平台前必须删除 index.html 内该段**（平台只允许自家 SDK）。

**广告内容**：具体放什么广告由广告主竞价、平台/Google 按上下文匹配，开发者不控制单条内容（可在 AdSense/平台后台按类别屏蔽）。

- 音效已上线（WebAudio 合成）；后续可按平台要求补横幅音/振动反馈
- 无横幅广告 API 接线（CrazySDK v3 banner 接口后续接入）
- 复活无限次（商业上可保留，后续按数据加频控）
