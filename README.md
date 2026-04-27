# PromptCanvas

PromptCanvas 是一个**纯前端**的 AI 图片生成工作台。Vue 3 + Vite + TypeScript + Tailwind CSS。访客在「设置」中填入自己的 OpenAI 兼容 API 端点和 Key，浏览器**直接**调用上游服务，不经过任何中转后端。

## 为什么没有「业务后端」

之前版本走 Cloudflare Pages Functions 转发，但 Pages Functions 单请求最长只能跑 30 秒上下，而 `gpt-image-1` 类图片生成经常要 30–90 秒，会被边缘运行时杀掉返回 502（且因为是上游已生成→中途被斩，往往已经计费）。

凭据本来就只存在访客自己的 `localStorage` 里，后端代理零安全收益，于是干脆删掉，由浏览器直连，超时由用户的耐心和服务商决定。

## 但需要一个最小反代（`proxy/`）

实际跑起来发现绝大多数中转站**不为浏览器配 CORS**（它们的客户都是 Cherry Studio / Codex CLI 类桌面/命令行工具，没人在浏览器里直连）。少数配 CORS 的中转站又踩 60s 网关超时。所以仓库里附带了一个**最小反代**，**两种运行时同时支持**：

- **`proxy/worker.mjs`** + **`proxy/wrangler.toml`** — Cloudflare Workers，3 行配置 / 5 分钟 / 免费 / 零冷启动
- **`proxy/proxy.mjs`** + **`proxy/Dockerfile`** + **`proxy/render.yaml`** — Node.js HTTP 服务，部署到 Render Free / Fly / VPS

两种代码逻辑相同：转发上游请求 + 加 CORS 头，**不持久化任何凭据**（`Authorization` 透明转发）。

**推荐顺序**：先试 Cloudflare Workers（你已经在用 CF，零钱零设置）。如果 Workers fetch 子请求被 ~90s 切（社区有此反馈，文档说没限制），换 Render Free 兜底（有 15 分钟冷启动但能撑任意时长）。

部署完拿到代理 URL，去前端「设置」里的「反代 URL」字段填上即可。具体步骤见 [`@/proxy/README.md`](./proxy/README.md)。

**不部署反代也能跑** —— 如果你能找到一家既开 CORS、网关又不切 60s 的中转站，「反代 URL」留空走浏览器直连就行。

## 技术栈

- Vue 3 + Vite + TypeScript
- Tailwind CSS
- 部署：Cloudflare Pages 静态托管（也可放任意静态站托管）

## 安装

```bash
npm install
```

## 配置（仅访客端）

打开右上角「设置」→「Provider · 服务商」，填写：

- **API 端点**：完整 base URL（必须含 `/v1`），例如 `https://api.openai.com/v1` 或任何 OpenAI 兼容中转站。
- **API Key**：对应服务商的密钥。
- **模型**（在「生成参数」中可选）：`gpt-image-1` / `dall-e-3` 或自定义。

凭据加密后写入 `localStorage`，键名 `promptcanvas:provider-v1`，永远不会发到任何第三方服务器（除你填的 baseUrl 之外）。

> **重要**：浏览器直连要求中转站支持 CORS。`api.openai.com` 官方默认不开 CORS，因此请使用支持浏览器侧调用的中转站（多数 oneapi/newapi 类网关默认放开）。

## 启动开发环境

```bash
npm run dev
```

默认地址：

```txt
http://localhost:5173
```

## 构建

```bash
npm run build
```

产物在 `dist/`，丢到任意静态托管即可（Cloudflare Pages / Netlify / Vercel / nginx / GitHub Pages 都行）。

## 类型检查

```bash
npm run check
```

## 部署到 Cloudflare Pages

仓库已经包含最小化的 Pages 配置：

- `wrangler.toml` 指定 `pages_build_output_dir = "dist"`
- `public/_headers` 给静态资源加缓存与安全头
- `public/_redirects` 给前端路由做 SPA fallback

Dashboard 里直接选这个仓库 → 构建命令 `npm run build` → 输出目录 `dist`，无需任何环境变量。

## 接口约定（前端直接打）

```
POST {baseUrl}/images/generations
Authorization: Bearer {apiKey}
Content-Type: application/json

{
  "model": "gpt-image-1",
  "prompt": "...",
  "size": "1024x1024",
  "n": 1,
  "output_format": "png",
  "quality": "auto",
  "user": "req_xxxxx"
}
```

返回兼容 OpenAI Images API：`data[].url` 或 `data[].b64_json`。前端会自动归一成 `images[].url` / `images[].b64Json`。

错误映射在 `src/lib/imagesApi.ts` 的 `resolveOpenAIError`，覆盖：401/403、429、insufficient_quota、content_policy_violation、AbortError、TypeError（CORS / 网络故障）等。

## 注意事项

- **凭据在浏览器**：apiKey 仅存 `localStorage`（加密），但 Network 面板和 XSS 仍然可见，**不要**在公共机器或不信任的扩展环境里使用。
- **历史只存本地**：生成历史保存在 `localStorage`，**不包含** apiKey/baseUrl（类型 `Omit<>` 强制隔离）。
- **CORS**：直连模式要求服务商支持浏览器跨域。如果中转站不支持，请换一家或自建轻量代理（不在本仓库范围）。
- **PowerShell `npm.ps1` 签名问题**：可改用 `npm.cmd run ...`。
