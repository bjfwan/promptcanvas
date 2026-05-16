# PromptCanvas

PromptCanvas 是一个**纯前端**的 AI 图片生成工作台。Vue 3 + Vite + TypeScript + Tailwind CSS。

访客在「设置」中填入自己的 OpenAI 兼容 API 端点和 Key，浏览器**直接**调用上游 `images/generations` / `images/edits`，不经过任何业务后端。凭据加密后只存在访客自己的 `localStorage`。


## 核心理念

- **本地优先**：凭据、草稿、历史元数据、长期偏好都只在浏览器（`localStorage` + `IndexedDB`），刷新仍在；项目方零知情。
- **不引入 LLM 做提示词增强**：所有"智能"全部来自一套结构化的提示词工程引擎（详见下文 [Studio Engine](#studio-engine--提示词工程引擎)），跑在前端、零外部调用。
- **可以不部署反代**：如果你能找到 CORS 开放、网关不切 60s 的中转站，可以直连。否则用仓库附带的最小反代（`proxy/`，详见下文）。


## 技术栈

- **Vue 3.5**（`<script setup>` + Composition API + `defineModel`）
- **Vite 6** + **TypeScript 5.7**（`strict: true`，`moduleResolution: "Bundler"`）
- **Tailwind CSS 3.4** + 自定义 CSS 变量（`src/style.css` 内 `@layer base/components/utilities`）
- **类型检查**：`vue-tsc --noEmit`
- **浏览器 API**：`localStorage` / `IndexedDB` / `crypto.subtle` / `fetch + AbortController` / `matchMedia + visualViewport`

## 常用命令

| 用途 | 命令 |
|------|------|
| 安装依赖 | `npm install` |
| 启动开发服务器（默认 5173） | `npm run dev` |
| 构建生产产物到 `dist/`（含类型检查） | `npm run build` |
| 仅做类型检查 | `npm run check` |
| 本地预览构建产物 | `npm run preview` |
| Workers 本地调试 | `cd proxy && npx wrangler dev` |
| Workers 部署 | `cd proxy && npx wrangler deploy` |

> Windows 上若 `npm.ps1` 触发签名策略，改用 `npm.cmd run ...`。


## 配置（仅访客端）

打开右上角「设置」→「Provider · 服务商」，填写：

- **API 端点**：完整 base URL（必须含 `/v1`），例如 `https://api.openai.com/v1` 或任何 OpenAI 兼容中转站
- **API Key**：对应服务商的密钥
- **模型**（在「生成参数」中可选）：`gpt-image-1` / `gpt-image-2` / `dall-e-3` 或自定义

凭据通过 `crypto.subtle` AES-GCM 加密后写入 `localStorage`，键名 `promptcanvas:provider-v1`，永远不会发到任何第三方服务器（除你填的 baseUrl 之外）。

> **重要**：浏览器直连要求中转站支持 CORS。`api.openai.com` 官方默认不开 CORS，因此请使用支持浏览器侧调用的中转站（多数 oneapi/newapi 类网关默认放开），或部署仓库附带的反代。


## Studio Engine · 提示词工程引擎

PromptCanvas 的差异化主战场。**完全不调用 LLM**，全部规则、词典、统计跑在前端，但能把一句话提示词扩展成接近 GPT-Image-2 / DALL·E 3 / Midjourney 的"七段式结构化提示词"，并按你正在用的模型族自动选最合适的渲染风格。

整套引擎分四层：

```
PromptCanvas Studio Engine
├─ 上下文层 Context
│  ├─ Brand Kit「我的画风」          手动编辑：始终包含 / 永远避免 / 常用色板镜头光位
│  ├─ Session Profile 短期画像        从最近 12 条历史按 0.85 衰减统计
│  ├─ Long-term Preference 长期偏好   每次成功生成累加进 localStorage，可在 Settings 里 review/采纳/清空
│  └─ Continuation 接着画继承         参考图模式自动把上一张的槽位作为 Preserve
├─ 槽位引擎 Slot Engine
│  ├─ Parser 10 槽位识别              subject/action/environment/lighting/camera/composition/palette/material/mood/styleAnchor
│  ├─ Filler 5 级优先链               continuation > brand > session(含长期) > vocab 字典 > 兜底
│  ├─ Lint 9 类规则 + 5 类一键修复     媒介冲突/时间冲突/数量漂移/修饰词疲劳/缺主体/缺光位/缺构图/token 过长/过短
│  ├─ Smart Negative                  按 style × subject 自动派生避免词
│  ├─ Camera Lookbook                10 套真实相机/胶片配方（Hasselblad/Leica/ARRI/Cinestill...）
│  └─ Reverse Parser                 把上游返回的 revised_prompt 反向解析回 PromptDoc
├─ 渲染层 Renderer
│  ├─ structured  默认  对应 gpt-image-1/2 系列，命名 section（Subject/Lighting/Camera/...）
│  ├─ narrative   对应 dall-e-3，自然语言成段
│  └─ compact     对应 Midjourney/SDXL/Flux，逗号列表
└─ 工作流层 Workflow
   ├─ 5 维矩阵候选                    智能/精准保真/成片交付/视觉冲击/创意探索
   ├─ 5 轴变体                        光位/镜头/色彩/氛围/构图，单轴换 4 个版本
   ├─ Prompt 树                       每次 enhance/fix/编辑生成节点，撤销/重做/跳转/分支
   └─ A/B 双轨                        原始 prompt 与优化版同时发，方便对比效果
```

**关键文件位置**：

```
src/lib/
├─ promptDoc.ts          类型与常量
├─ promptParser.ts       自然语言 → 槽位
├─ promptFiller.ts       按上下文填槽位
├─ promptLint.ts         9 类诊断规则 + LintFix 描述
├─ promptCompose.ts      Composer + 三种 Renderer
├─ revisedParser.ts      反向解析 revised_prompt
├─ negativeLib.ts        派生 negative 词库
├─ cameraLookbook.ts     10 套相机配方
├─ enhanceVocab.ts       原始六维（光/色/构/材/氛/镜）字典
├─ brandKit.ts           BrandKit 持久化
├─ sessionProfile.ts     短期画像 + 与长期偏好融合
├─ preferenceLearner.ts  长期偏好持久化（localStorage）
└─ magicEnhance.ts       对外门面：analyzePromptDoc / enhancePromptDoc / createPromptVariants ...
```

UI 入口在 `MagicEnhanceMenu.vue`：每个槽位卡片可编辑 / 重填 / 还原；camera 槽位有"图鉴"下拉；诊断报告可一键修复；候选方案有矩阵 / 5 轴切换；底部 A/B 双轨开关；Composer 下方有 Prompt 树时间线。


## 反代 `proxy/`（可选）

实际跑起来发现绝大多数中转站**不为浏览器配 CORS**（它们的客户都是 Cherry Studio / Codex CLI 类桌面/命令行工具，没人在浏览器里直连）。少数配 CORS 的中转站又踩 60s 网关超时。所以仓库里附带了一个**最小反代**，**两种运行时同时支持**：

- **`proxy/worker.mjs`** + **`proxy/wrangler.toml`** — Cloudflare Workers，3 行配置 / 5 分钟 / 免费 / 零冷启动
- **`proxy/proxy.mjs`** + **`proxy/Dockerfile`** + **`proxy/render.yaml`** — Node.js HTTP 服务，部署到 Render Free / Fly / VPS

两种代码逻辑相同：浏览器请求带 `X-Upstream-Base` 头，代理拼出 `${X-Upstream-Base}${path}` 透明转发并加 CORS 头，**不持久化任何凭据**（`Authorization` 透明转发）。

**推荐顺序**：先试 Cloudflare Workers（你已经在用 CF，零钱零设置）。如果 Workers fetch 子请求被 ~90s 切（社区有此反馈），换 Render Free 兜底（有 15 分钟冷启动但能撑任意时长）。

部署完拿到代理 URL，去前端「设置」里的「反代 URL」字段填上即可。具体步骤见 [`proxy/README.md`](./proxy/README.md)。

**不部署反代也能跑** —— 如果你能找到一家既开 CORS、网关又不切 60s 的中转站，「反代 URL」留空走浏览器直连就行。


## 接口约定（前端直接打）

文生图：

```
POST {baseUrl}/images/generations
Authorization: Bearer {apiKey}
Content-Type: application/json

{
  "model": "gpt-image-2",
  "prompt": "...（已被 Studio Engine 渲染成 structured 格式）",
  "size": "1024x1024",
  "n": 1,
  "output_format": "png",
  "quality": "auto",
  "user": "req_xxxxx"
}
```

参考图编辑（"接着画"）：

```
POST {baseUrl}/images/edits
Authorization: Bearer {apiKey}
Content-Type: multipart/form-data

prompt=...
image=<PNG blob>
image[]=<PNG blob>   # 第二张及之后
size=1024x1024
n=1
output_format=png
quality=auto
model=...
```

返回兼容 OpenAI Images API：`data[].url` 或 `data[].b64_json`。前端会自动归一成 `images[].url` / `images[].b64Json`。

错误映射在 `src/lib/imagesApi.ts` 的 `resolveOpenAIError`，覆盖：401/403、429、`insufficient_quota`、`content_policy_violation`、`AbortError`、`TypeError`（CORS / 网络故障）等。


## 持久化键名一览

所有 key 都以 `promptcanvas:` 前缀，集中在 `src/storage.ts` 与各引擎模块：

| Key | 位置 | 内容 |
|------|------|------|
| `promptcanvas:provider-v1` | localStorage | 凭据 + 反代 URL（`apiKey` AES-GCM 加密） |
| `promptcanvas:draft-v1` | localStorage | 输入草稿（带 debounce 自动保存） |
| `promptcanvas:generation-history` | localStorage | 最近 12 条历史元数据（**不含** apiKey/baseUrl，类型 `Omit<>` 强制隔离） |
| `promptcanvas:theme-v1` | localStorage | paper / night 主题选择 |
| `promptcanvas:brand-kit-v1` | localStorage | BrandKit「我的画风」 |
| `promptcanvas:long-term-prefs-v1` | localStorage | 长期偏好统计（焦距/色调/风格/模式…） |
| `promptcanvas:prompt-tree-v1` | sessionStorage | Prompt 树节点（关闭标签页清空） |
| `promptcanvas-history-images` | IndexedDB | 历史图片 base64 持久化 |

凭据读取失败时会容忍（返回空 key 而不是抛错），避免老版本数据格式变化时锁死用户。


## 部署

仓库已经包含最小化的 Cloudflare Pages 配置：

- `wrangler.toml` 指定 `pages_build_output_dir = "dist"`
- `public/_headers` 给静态资源加缓存与安全头
- `public/_redirects` 给前端路由做 SPA fallback

Dashboard 里直接选这个仓库 → 构建命令 `npm run build` → 输出目录 `dist`，无需任何环境变量。同样的产物也可以丢到 Netlify / Vercel / nginx / GitHub Pages。

## 注意事项

- **凭据在浏览器**：apiKey 仅存 `localStorage`（加密），但 Network 面板和 XSS 仍然可见，**不要**在公共机器或不信任的扩展环境里使用。
- **历史只存本地**：生成历史保存在 `localStorage`，**不包含** apiKey/baseUrl（类型 `Omit<>` 强制隔离）。
- **CORS**：直连模式要求服务商支持浏览器跨域。如果中转站不支持，请换一家或部署仓库附带的反代。
- **PowerShell `npm.ps1` 签名问题**：可改用 `npm.cmd run ...`。

## 项目结构（仅 `src/`）

```
src/
├─ App.vue                顶层布局，桌面三栏 / 移动 ChatStream + ChatDock
├─ main.ts                createApp(App).mount('#app')，含 vite:preloadError 自愈
├─ api.ts                 generateImage / checkHealth / testProvider
├─ storage.ts             localStorage + IndexedDB（凭据 / 草稿 / 历史 / 主题）
├─ presets.ts             风格、尺寸、质量、模型预设
├─ types.ts               全部领域类型
├─ style.css              Tailwind 入口 + CSS 变量 + 组件类
├─ components/            全部 UI 都是 Vue SFC
├─ composables/           业务无关的可复用 hook（含 usePromptContext / usePromptTree）
├─ icons/                 SVG 图标按主题分桶
└─ lib/                   纯函数 / 跨组件工具（含 Studio Engine 全部模块）
```

更详细的目录约定见 [`.kiro/steering/structure.md`](./.kiro/steering/structure.md)。
