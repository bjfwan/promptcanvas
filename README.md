# PromptCanvas

PromptCanvas 是一个本地优先的 AI 图片生成应用。前端使用 Vue 3 + Vite + TypeScript + Tailwind CSS，后端使用 Node.js + Express 调用 OpenAI Images API。

## 技术栈

- Vue 3
- Vite
- TypeScript
- Tailwind CSS
- Node.js
- Express
- OpenAI SDK

## 前后端分工

- **前端**：输入提示词、选择风格/尺寸/数量/格式、请求后端、展示图片、下载图片。
- **前端增强能力**：提示词模板、高级参数、本地历史、复制提示词、打开原图、重新生成。
- **后端**：保护 OpenAI API Key，调用 OpenAI 图片生成接口，按约定格式返回结果。

后端详细接口见：[`BACKEND_CONTRACT.md`](./BACKEND_CONTRACT.md)。

## 安装

```bash
npm install
```

## 配置

复制环境变量示例：

```bash
copy .env.example .env
```

`.env` 服务于本地 Express 后端（`npm run dev:backend`）。前端走 Vite 代理（`vite.config.ts` 已把 `/api` 转发到 `localhost:8787`），所以 `VITE_API_BASE_URL` **保持为空**即可，前端默认请求同源相对路径。仅在前后端部署到不同域名时才设置完整 URL。

`ACCESS_LOG=false` 可关闭访问日志输出。`/api/health` 会返回 `version` 和 `uptimeSeconds`，方便容器/反向代理做健康检查。

使用 OpenAI 中转站时，把 `OPENAI_BASE_URL` 设成中转站的完整 base URL（必须带 `/v1`，例如 `https://api.chshapi.cn/v1`）。本地 Express 走 OpenAI Node SDK 的 `baseURL` 选项，Cloudflare Pages Functions 直接用这个地址拼接 `/images/generations`。Cloudflare 部署时把变量写到 Pages → Settings → Environment variables。

## 启动开发环境

启动后端：

```bash
npm run dev:backend
```

启动前端：

```bash
npm run dev
```

默认访问：

```txt
http://localhost:5173
```

## 构建

```bash
npm run build
```

## 测试后端

```bash
npm run test:backend
```

完整检查后端语法和测试：

```bash
npm run check:backend
```

测试会使用 mock OpenAI Client，不会请求真实 OpenAI API，也不需要真实 `OPENAI_API_KEY`。

## 后端接口

后端服务文件位于 `server/index.mjs`。前端会请求：

```txt
POST /api/images/generate
```

健康检查：

```txt
GET /api/health
```

请求体示例：

```json
{
  "prompt": "一只穿着复古宇航服的橘猫，站在月球摄影棚里",
  "style": "poster",
  "size": "1024x1024",
  "count": 1,
  "outputFormat": "png",
  "negativePrompt": "低清晰度、模糊、水印、错误文字",
  "quality": "auto",
  "creativity": 7,
  "seed": "optional-seed"
}
```

其中 `negativePrompt`、`quality`、`creativity`、`seed` 是前端新增的可选字段。后端可以先忽略，也可以拼接进最终 OpenAI prompt。

成功返回示例：

```json
{
  "requestId": "req_123",
  "images": [
    {
      "id": "img_1",
      "url": "https://example.com/image.png",
      "b64Json": null,
      "mimeType": "image/png",
      "revisedPrompt": "A cinematic poster of an orange cat wearing a spacesuit on the moon"
    }
  ]
}
```

## Cloudflare Pages 部署

仓库已经把后端切成 Cloudflare Pages Functions（`functions/api/...`），同时保留了本地 Express 体验。

本地预览 Pages Functions（推荐先 `npm install`，确保 `wrangler` 装好）：

```bash
copy .dev.vars.example .dev.vars   # 填入真实 OPENAI_API_KEY
npm run dev:pages                  # wrangler 接管 /api/*，转发其他路径给 Vite
```

构建后用 wrangler 直接服务静态产物：

```bash
npm run preview:pages              # 等价于 npm run build && wrangler pages dev dist
```

部署到 Cloudflare Pages 的完整流程（含域名绑定与 WAF 速率限制）见：
[`docs/DEPLOY_CLOUDFLARE.md`](./docs/DEPLOY_CLOUDFLARE.md)。

部署架构要点：

- 同源部署：前端 `dist/` 与 `functions/api/*` 由 Pages 一起服务，无需 CORS。
- 密钥仅在 Cloudflare Dashboard 注入，前端任何 `VITE_*` 变量都会被打包公开，**不能**放 `OPENAI_API_KEY`。
- 速率限制由 Cloudflare WAF 在 Dashboard 配置，函数层不再实现内存版。
- `.dev.vars` 仅本地 wrangler 使用，已在 `.gitignore`。

## 注意事项

- OpenAI API Key 只能放在后端 / Cloudflare 环境变量里，不能放到 Vue 前端。
- 后端开发环境需要允许 `http://localhost:5173` 跨域访问（仅本地 Express 模式）。
- 前端同时兼容后端返回图片 URL 或 base64 图片。
- 生成历史只保存在浏览器本地 `localStorage`，不会上传到后端。
- PowerShell 如果遇到 `npm.ps1` 签名限制，可以改用 `npm.cmd run ...`。
