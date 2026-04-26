# Cloudflare Pages 改造任务（前后端工程师阅读）

> 你拿到这份文档时，仓库里已经有完整的 Vue 3 前端 + Node Express 后端。需要把它改成"可以一键部署到 Cloudflare Pages"的形态，同时**保留本地 Express 开发体验和现有测试**。

## 0. 不可改动 / 必须保留

- **API 合约不变**：`POST /api/images/generate` 和 `GET /api/health` 的请求/响应结构与现有 `BACKEND_CONTRACT.md` 一致。
- **前端 `src/` 不动**。前端默认请求同源 `/api/...`。
- **现有 `server/index.test.mjs` 必须继续通过**。
- **本地仍能 `npm run dev:backend` + `npm run dev` 跑通**，保持 Express 调试体验。

## 1. 目标结构

```
server/
  lib.mjs           ← 新建，所有纯函数（无 Node-only 依赖）
  index.mjs         ← 改为 import server/lib.mjs，仅保留 Express 包装
  index.test.mjs    ← 不变
functions/          ← 新建，Cloudflare Pages Functions
  _middleware.ts    ← 注入 requestId / 安全头 / JSON 大小限制
  api/
    health.ts
    images/
      generate.ts
  __tests__/
    generate.test.mjs   ← 复用 server/lib.mjs 的单测
wrangler.toml        ← 可选，仅本地 wrangler pages dev 用
```

## 2. 第一步：抽出 `server/lib.mjs`

把 `server/index.mjs` 中下列内容**原样移动**到新文件 `server/lib.mjs` 并 `export`：

- 常量：`allowedSizes`、`allowedFormats`、`allowedQualities`、`mimeTypes`、`stylePrompts`
- 纯函数：`validatePayload`、`buildPrompt`、`normalizeImages`、`resolveOpenAIError`、`isMissingApiKey`、`resolveCreativityInstruction`

注意：这些函数**不能依赖** `process`、`node:fs`、`node:http`、`express`、`cors`、`dotenv`。它们目前已经是纯函数，直接搬即可。

`server/index.mjs` 改成：

```js
import {
  validatePayload,
  buildPrompt,
  normalizeImages,
  resolveOpenAIError,
  isMissingApiKey,
  mimeTypes,
} from './lib.mjs'
// 其余 Express / OpenAI SDK 包装代码保持不变
```

## 3. 第二步：新建 `functions/_middleware.ts`

Cloudflare Pages Functions 的全局中间件。职责：

1. 读取或生成 `requestId`（`X-Request-Id` header；否则 `req_<crypto.randomUUID()>`）。
2. 设置安全 headers：`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`、`Cross-Origin-Resource-Policy: same-site`、`X-Request-Id: <id>`。
3. 把 `requestId` 挂到 `context.data.requestId`，下游 handler 直接读。
4. 对 `POST` 请求拒绝超过 64KB 的 body。

伪代码：

```ts
export const onRequest: PagesFunction = async (context) => {
  const incoming = context.request.headers.get('x-request-id')?.trim()
  const requestId = incoming || `req_${crypto.randomUUID()}`
  context.data.requestId = requestId

  const contentLength = Number(context.request.headers.get('content-length') || 0)
  if (context.request.method === 'POST' && contentLength > 64 * 1024) {
    return jsonError(413, 'INVALID_REQUEST', '请求体不能超过 64KB', requestId)
  }

  const response = await context.next()
  response.headers.set('X-Request-Id', requestId)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('Cross-Origin-Resource-Policy', 'same-site')
  return response
}
```

## 4. 第三步：`functions/api/health.ts`

```ts
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const model = context.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'
  return Response.json({
    ok: true,
    model,
    requestId: context.data.requestId,
  })
}
```

## 5. 第四步：`functions/api/images/generate.ts`

**关键决策：不要使用 OpenAI Node SDK**，直接 `fetch` 调用 OpenAI REST，原因：
- Workers runtime 默认不带 Node polyfill，引入 SDK 会强迫开 `nodejs_compat` 兼容性 flag，bundle 体积也大。
- `POST /v1/images/generations` 是非常简单的 REST 调用。

实现要点：

```ts
import {
  validatePayload,
  buildPrompt,
  normalizeImages,
  resolveOpenAIError,
  isMissingApiKey,
} from '../../../server/lib.mjs'

interface Env {
  OPENAI_API_KEY: string
  OPENAI_IMAGE_MODEL?: string
  OPENAI_TIMEOUT_MS?: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const requestId = context.data.requestId

  let body: unknown
  try {
    body = await context.request.json()
  } catch {
    return jsonError(400, 'INVALID_REQUEST', '请求体不是合法 JSON', requestId)
  }

  const validation = validatePayload(body)
  if (validation.error) {
    return jsonError(400, 'INVALID_REQUEST', validation.error, requestId)
  }
  if (isMissingApiKey(context.env.OPENAI_API_KEY)) {
    return jsonError(500, 'MISSING_API_KEY', '后端没有配置 OPENAI_API_KEY', requestId)
  }

  const payload = validation.value
  const model = context.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'
  const timeoutMs = Number(context.env.OPENAI_TIMEOUT_MS || 120_000)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const upstream = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${context.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt: buildPrompt(payload),
        size: payload.size,
        n: payload.count,
        output_format: payload.outputFormat,
        quality: payload.quality,
      }),
    })

    if (!upstream.ok) {
      const errorBody = await upstream.json().catch(() => ({}))
      const mapped = resolveOpenAIError({
        status: upstream.status,
        code: errorBody?.error?.code,
        message: errorBody?.error?.message,
      })
      return jsonError(mapped.status, mapped.code, mapped.message, requestId)
    }

    const data = await upstream.json()
    const images = normalizeImages(data, payload.outputFormat)
    if (!images.length) {
      return jsonError(502, 'OPENAI_REQUEST_FAILED', 'OpenAI 没有返回图片', requestId)
    }
    return Response.json({
      requestId,
      images,
      usage: { model },
    })
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return jsonError(504, 'OPENAI_REQUEST_FAILED', 'OpenAI 响应超时，请稍后再试', requestId)
    }
    const mapped = resolveOpenAIError(error)
    return jsonError(mapped.status, mapped.code, mapped.message, requestId)
  } finally {
    clearTimeout(timer)
  }
}

function jsonError(status: number, code: string, message: string, requestId: string) {
  return Response.json({ error: { code, message }, requestId }, { status })
}
```

## 6. 速率限制（不要在 Pages Function 里实现）

Pages Functions 是无状态边缘函数，原 Express in-memory rate limit 不可用。**不要**用全局变量假装实现，会被多个实例打穿。

正确做法：**部署后在 Cloudflare Dashboard 里加规则**：

- Security → WAF → Rate limiting rules → Create rule
- 路径匹配 `/api/images/generate`，方法 `POST`
- 阈值：10 次 / 1 分钟 / 单 IP（按需调整）
- 动作：Block 60s

如果业务后续需要更细粒度，再用 Workers KV 或 Durable Object 实现。本次改造**不做**。

## 7. 测试

### 7.1 保留现有 Express 测试
`server/index.test.mjs` 不动，确保 `npm run test:backend` 仍然 7 个全过。

### 7.2 新增 lib 单测
`server/lib.test.mjs`，对 `validatePayload`、`buildPrompt`、`normalizeImages`、`resolveOpenAIError` 写独立用例（脱离 Express）。

### 7.3 新增 functions 端到端测试（可选）
`functions/__tests__/generate.test.mjs`：mock `globalThis.fetch` 模拟 OpenAI 响应，验证 `onRequestPost` 行为与 Express 版完全等价。

## 8. 本地预览 Pages Functions

新增 devDependency：

```bash
npm install -D wrangler
```

新增 npm script：

```jsonc
"scripts": {
  "dev:pages": "wrangler pages dev -- npm run dev",
  "preview:pages": "npm run build && wrangler pages dev dist"
}
```

`wrangler pages dev` 会自动识别 `functions/` 目录，本地把 `/api/*` 路由到 Functions，把其他路由到 Vite。

## 9. 提交规范

- 改造分支建议名 `feat/cloudflare-pages-functions`
- PR 标题：`feat(deploy): migrate backend to Cloudflare Pages Functions`
- PR 描述里务必写：
  - Express 后端是否仍可本地启动（`npm run dev:backend`）
  - `npm run test:backend` 输出截图
  - `wrangler pages dev` 本地访问 `/api/health` 截图

## 10. 验收清单

- [ ] `server/lib.mjs` 抽出，`server/index.mjs` 引用之
- [ ] `npm run test:backend` 全绿
- [ ] `functions/api/health.ts` 返回 `{ok:true, model, requestId}`
- [ ] `functions/api/images/generate.ts` 校验、错误码、成功响应都与 Express 版一致
- [ ] `functions/_middleware.ts` 注入 `requestId` 与安全 header
- [ ] `wrangler pages dev` 本地能联调通过
- [ ] 不引入 OpenAI Node SDK 到 functions
- [ ] PR 描述符合第 9 节
