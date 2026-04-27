# promptcanvas-proxy

最小 Node.js 反代 —— 唯一的工作就是「**把请求转给上游 + 给响应塞 CORS 头**」，让 PromptCanvas 浏览器端能直连那些原本不开 CORS 的中转站。

- 单文件、零依赖（仅 Node 20+ 内置 `http` + `fetch`）
- 不持久化任何凭据，`Authorization` 头透明转发
- 无任何客户端/服务端超时（图片生成跑 200 秒也行）
- 不做业务校验（请求体原样转发）

## 工作方式

1. 浏览器把请求打给代理 `https://你的代理域名/v1/images/generations`
2. 浏览器在请求头里塞 `X-Upstream-Base: https://api.chshapi.cn/v1`（PromptCanvas 已自动加）
3. 代理把请求转发到 `https://api.chshapi.cn/v1/images/generations`
4. 代理把上游响应原封不动 + 加 `Access-Control-Allow-Origin: *` 回给浏览器

## 本地跑一下

```bash
cd proxy
node proxy.mjs
# [proxy] promptcanvas-proxy v0.1.0 listening on :8080
```

健康检查：

```bash
curl http://localhost:8080/health
```

PromptCanvas 「设置」里把 **Proxy URL** 填 `http://localhost:8080` 就能开始用了。

## 部署到 Render（免费）

1. 把这个仓库推到 GitHub（已经在了）
2. 注册 [render.com](https://render.com)，新建 → **Web Service** → 连 GitHub 仓库
3. 设置：
   - **Root Directory**: `proxy`
   - **Runtime**: Node
   - **Build Command**: 留空
   - **Start Command**: `node proxy.mjs`
   - **Plan**: Free
4. 部署完拿到地址比如 `https://promptcanvas-proxy.onrender.com`
5. PromptCanvas「设置」里 Proxy URL 填这个地址

**Render 免费档注意**：服务 15 分钟没访问会休眠，下一次请求要冷启动 ~30 秒。第一次点测试可能慢；之后只要不间隔 15 分钟以上就保持热。

或者用 `render.yaml` 一键部署：

```bash
# 在 Render Dashboard 选 "Blueprint"，指向这个仓库的 proxy/render.yaml
```

## 部署到 Fly.io / Railway

两家都直接吃 `Dockerfile`，把 `proxy/` 子目录设为构建上下文即可。

**Fly.io**:

```bash
cd proxy
fly launch --no-deploy
fly deploy
```

**Railway**：连 GitHub → 选仓库 → 设置 Root Directory = `proxy` → 部署。

## 部署到自己的 VPS

```bash
git clone https://github.com/bjfwan/promptcanvas
cd promptcanvas/proxy
node proxy.mjs &
# 用 nginx / Caddy 反代到 :8080，绑你的域名 + Let's Encrypt 证书
```

## 安全提醒

- 这个代理是**开放代理**：任何人知道你的代理 URL，都能用它中转请求（带他们自己的 Key）。带宽和上游账单算你的（Render 免费档带宽极少，先扛得住）。
- 想加保护：自己改 `proxy.mjs` 加一个 `X-Proxy-Token` 校验，前端「设置」也加同名头。
- 不要在代码里硬编码任何 API Key —— 设计上代理只负责转发，凭据永远来自浏览器。

## 健康检查

```
GET /health
→ { "ok": true, "name": "promptcanvas-proxy", "version": "0.1.0", "timestamp": "..." }
```

Render 的 `healthCheckPath` 已经指向这条。

## 接口规则速查

| 浏览器请求 | 代理把它打给 |
|---|---|
| `GET https://proxy/v1/models` + `X-Upstream-Base: https://api.chshapi.cn/v1` | `GET https://api.chshapi.cn/v1/v1/models` ⚠️ |
| `GET https://proxy/models` + `X-Upstream-Base: https://api.chshapi.cn/v1` | `GET https://api.chshapi.cn/v1/models` ✓ |

代理把 base + path 直接拼接，**所以前端不要在 path 里再加 `/v1`** —— 因为 base 里已经有了。PromptCanvas 已经处理对了。
