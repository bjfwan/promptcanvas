# promptcanvas-proxy

最小反代 —— **唯一的工作就是「把请求转给上游 + 给响应塞 CORS 头」**，让 PromptCanvas 浏览器端能直连那些原本不开 CORS 的中转站。

仓库里**同时**提供两种运行时，挑一种部署即可：

| 运行时 | 入口 | 用在哪 |
|---|---|---|
| **Cloudflare Workers** | `worker.mjs` + `wrangler.toml` | 推荐先试。免费、零冷启动、5 分钟搞定 |
| **Node.js** (HTTP 服务) | `proxy.mjs` + `Dockerfile` + `render.yaml` | 备选。Render Free / Fly / VPS 都吃 |

代码几乎一样，区别只是 Workers 用 Web 标准 API、Node 用 `node:http`。

---

## 工作方式（共通）

1. 浏览器发请求到代理 `https://你的代理/v1/images/generations`
2. 浏览器在请求头里塞 `X-Upstream-Base: https://api.chshapi.cn/v1`（PromptCanvas 已自动加）
3. 代理把请求转发到 `https://api.chshapi.cn/v1/images/generations`
4. 代理把上游响应原封不动 + 加 `Access-Control-Allow-Origin: *` 回给浏览器

代理**不持久化任何凭据**，`Authorization` 头透明转发。

---

## 路线 A：Cloudflare Workers（推荐先试）

**优点**：免费、零冷启动、跟 PromptCanvas 同一个 Cloudflare 账号、3 行配置。

**风险**：Cloudflare 文档说 Workers HTTP 触发**没有时长限制**、fetch 子请求**没有时间限制**（"As long as the client remains connected"）；但社区有反馈说子请求 ~90s 会被切。如果你的中转站出图 > 90s，可能踩到这个坑——踩到了就跳到路线 B。

### 部署步骤

```bash
cd proxy
npm install   # 装 wrangler
npx wrangler login   # 浏览器弹出 Cloudflare 登录
npx wrangler deploy
```

部署完拿到地址类似 `https://promptcanvas-proxy.<你的-cloudflare-子域>.workers.dev`，验证：

```bash
curl https://promptcanvas-proxy.xxx.workers.dev/health
# {"ok":true,"name":"promptcanvas-proxy","runtime":"cloudflare-workers",...}
```

PromptCanvas「设置」里 **反代 URL** 填这个地址。

### 实时日志

```bash
cd proxy
npx wrangler tail
```

看每条请求的 method / status / 上游 host。

### 本地跑一下

```bash
cd proxy
npx wrangler dev
# 默认 http://localhost:8787
```

---

## 路线 B：Node.js 服务（兜底）

**优点**：长请求一定能撑（200s+ 没问题），不踩 Workers 的子请求限制。

**缺点**：要选个能跑 Node 进程的家。免费选 Render（有冷启动），收费选 Fly / VPS。

### B1 · Render Free（最常见免费选择）

1. 把这个仓库推到 GitHub（已经在了）
2. 进 [render.com](https://render.com)，注册后：**New** → **Blueprint** → 选 `bjfwan/promptcanvas` 仓库
3. Render 自动读 `proxy/render.yaml`，确认部署
4. 拿到地址比如 `https://promptcanvas-proxy.onrender.com`
5. 验证 `https://你的代理.onrender.com/health`，OK 就把它填到 PromptCanvas 设置里

⚠️ **Render 免费档**：15 分钟没访问会休眠，下一次首请求要冷启动 ~30 秒。第一次点测试可能慢；之后只要不间隔 15 分钟以上就保持热。如果嫌冷启动烦，升 Starter 档 $7/月就常驻不睡。

### B2 · Fly.io（要绑卡 ~$5/月）

```bash
cd proxy
npx fly launch --no-deploy   # 跟着提示走，会自动检测 Dockerfile
npx fly deploy
```

### B3 · 自己 VPS

```bash
git clone https://github.com/bjfwan/promptcanvas
cd promptcanvas/proxy
node proxy.mjs &
# 用 nginx / Caddy 反代到 :8080，绑你的域名 + Let's Encrypt 证书
```

---

## 接口规则速查

```
浏览器 → 代理:
  POST https://proxy/v1/images/generations
  X-Upstream-Base: https://api.chshapi.cn/v1
  Authorization: Bearer sk-xxx
  Content-Type: application/json
  body: {...}

代理 → 上游:
  POST https://api.chshapi.cn/v1/v1/images/generations  ⚠️ 双 v1，错！
  POST https://api.chshapi.cn/v1/images/generations     ✓
```

代理把 `X-Upstream-Base` + `path` 直接拼接，**所以 baseUrl 已经含 `/v1` 的话，path 不要再带 `/v1`**——PromptCanvas 已经处理对了。

## 健康检查

```
GET /health
→ { "ok": true, "name": "promptcanvas-proxy", "runtime": "...", "version": "0.1.0", "timestamp": "..." }
```

Render 的 `healthCheckPath` 已经指向这条；Cloudflare Workers 也响应这条。

## 安全提醒

- 这个代理是**开放代理**：任何人知道你的代理 URL，都能用它中转请求（带他们自己的 Key）。带宽和上游账单算你的。
- Workers 免费档每天 100k 请求够用，超了也只是你的额度被耗光，不会扣钱。
- Render 免费档每月 750 小时（差不多 7×24 全开），带宽几十 GB，单人用绰绰有余。
- 想加保护：自己改代码加一个 `X-Proxy-Token` 校验，前端「设置」也加同名头。

## 切换运行时

**从 Workers 换到 Render**：把前端「反代 URL」从 Workers URL 改成 Render URL 即可，前端代码、上游配置都不用动。

**从 Render 换到 Workers**：反过来。

我们就是为了让你能两边切才两份代码都备好。
