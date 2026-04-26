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

如果后端运行在 `http://localhost:8787`，保持：

```env
VITE_API_BASE_URL=http://localhost:8787
OPENAI_API_KEY=sk-xxxx
PORT=8787
CLIENT_ORIGIN=http://localhost:5173
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_TIMEOUT_MS=120000
RATE_LIMIT_WINDOW_MS=600000
RATE_LIMIT_MAX=20
ACCESS_LOG=true
```

`ACCESS_LOG=false` 可关闭访问日志输出。`/api/health` 会返回 `version` 和 `uptimeSeconds`，方便容器/反向代理做健康检查。

如果前后端部署在同一个域名下，可以不设置 `VITE_API_BASE_URL`，前端会请求当前域名下的 `/api/images/generate`。

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

## 注意事项

- OpenAI API Key 只能放在后端，不能放到 Vue 前端。
- 后端开发环境需要允许 `http://localhost:5173` 跨域访问。
- 前端同时兼容后端返回图片 URL 或 base64 图片。
- 生成历史只保存在浏览器本地 `localStorage`，不会上传到后端。
- PowerShell 如果遇到 `npm.ps1` 签名限制，可以改用 `npm.cmd run ...`。
