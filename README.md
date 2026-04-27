# PromptCanvas

PromptCanvas 是一个本地优先的 AI 图片生成应用。前端使用 Vue 3 + Vite + TypeScript + Tailwind CSS；后端是 Cloudflare Pages Functions / Express 的透明代理，负责转发到任意 OpenAI 兼容服务。

**凭据主模型**：每个访客在页面的「设置」中填入自己的 API 端点和 API Key，凭据仅存于该访客的浏览器 localStorage，不在后端进行任何持久化。项目本身不提供也不需要 OpenAI Key。

## 技术栈

- Vue 3
- Vite
- TypeScript
- Tailwind CSS
- Node.js
- Express
- OpenAI SDK

## 前后端分工

- **前端**：输入提示词、选择风格/尺寸/数量/格式、展示图片、下载图片。在「设置」中配置 API 端点 + Key + 模型，凭据仅存 localStorage。
- **前端增强能力**：提示词模板、高级参数、本地历史（不包含凭据）、复制提示词、打开原图、重新生成。
- **后端（透明代理）**：接收请求 → 校验负载 → 带上访客提供的 baseUrl + apiKey 调上游 → 返回。后端不持有任何凭据、不记录 apiKey。

后端详细接口见：[`BACKEND_CONTRACT.md`](./BACKEND_CONTRACT.md)。

## 安装

```bash
npm install
```

## 配置

### 访客侧（面向用户）

打开右上角「设置」→ 「Provider·服务商」区块，填写：

- **API 端点**：完整 base URL（必须带 `/v1`）。例：`https://api.openai.com/v1` 或任何中转站的 base URL。
- **API Key**：对应服务商发给你的密钥。
- **模型**（可在「生成参数」区选）：`gpt-image-1` / `dall-e-3` 或自定义。

凭据仅写入访客自己浏览器的 localStorage（`promptcanvas:provider-v1`），项目后端不会持久化任何凭据。

### 部署侧（面向运维）

复制环境变量示例：

```bash
copy .env.example .env
```

里面只剩运营性配置（端口 / CORS / 速率限制 / 访问日志）。**不需要设置任何 `OPENAI_*` 变量。**
Cloudflare Pages 部署时，`wrangler.toml` 已不含业务变量，Dashboard 上也不需要配置任何 OpenAI 凭据。

`VITE_API_BASE_URL` 仅在前后端跨域部署时使用，同源部署（Pages / Vite proxy）保持空即可。

`ACCESS_LOG=false` 可关闭访问日志输出。`/api/health` 返回 `version` 和 `uptimeSeconds`，方便容器/反向代理做健康检查。

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

测试会使用 mock OpenAI Client / mock fetch，不会请求真实上游，也不需要真实凭据。

## 后端接口

后端服务文件位于 `server/index.mjs`。前端会请求：

```txt
POST /api/images/generate
```

健康检查：

```txt
GET /api/health
```

请求体示例（v2 新增 `apiKey` 与 `baseUrl` 字段，由前端从 localStorage 读入）：

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
  "seed": "optional-seed",
  "model": "gpt-image-1",
  "apiKey": "sk-...",
  "baseUrl": "https://api.openai.com/v1"
}
```

详细接口合约见 [`BACKEND_CONTRACT.md`](./BACKEND_CONTRACT.md)。

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
npm run dev:pages                  # wrangler 接管 /api/*，转发其他路径给 Vite
```

不需要创建 `.dev.vars`。Pages Function 本身不读任何 OpenAI 环境变量；凭据都走带在请求体里。

构建后用 wrangler 直接服务静态产物：

```bash
npm run preview:pages              # 等价于 npm run build && wrangler pages dev dist
```

部署到 Cloudflare Pages 的完整流程（含域名绑定与 WAF 速率限制）见：
[`docs/DEPLOY_CLOUDFLARE.md`](./docs/DEPLOY_CLOUDFLARE.md)。

部署架构要点：

- 同源部署：前端 `dist/` 与 `functions/api/*` 由 Pages 一起服务，无需 CORS。
- **后端零凭据**：`wrangler.toml` 不含 `[vars]`，Cloudflare Dashboard 也不需要配置任何 OpenAI 变量；API Key 只存于访客浏览器。
- 前端任何 `VITE_*` 变量都会被打包公开，里面也不要放任何 key。
- 速率限制由 Cloudflare WAF 在 Dashboard 配置，函数层不再实现内存版。

## 注意事项

- **凭据在访客浏览器里**：apiKey 仅存 `localStorage`，不上传到后端数据库；但 Network 面板仍可见，被 XSS 也会被读取。不要在可能被别人打开的公共机器上使用。
- **任何访客都能用你部署的 backend 做转发**（带他们自己的 key），这是设计使然；backend 应只转发不记录。
- 前端同时兼容后端返回图片 URL 或 base64 图片。
- 生成历史只保存在浏览器本地 `localStorage`，**不包含 apiKey/baseUrl**（类型系统以 `Omit<>` 硬性隔离）。
- 后端开发环境需要允许 `http://localhost:5173` 跨域访问（仅本地 Express 模式）。
- PowerShell 如果遇到 `npm.ps1` 签名限制，可以改用 `npm.cmd run ...`。
