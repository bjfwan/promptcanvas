# Cloudflare Pages 部署与域名绑定（项目 owner 操作手册）

这份文档是给你（项目所有者）一步步对照操作的，**不需要写代码**。前置条件是工程师已经按 `docs/HANDOFF_CLOUDFLARE_REWRITE.md` 完成改造并合入主分支。

---

## 1. 前置准备

- 一个 Cloudflare 账户（免费档够用）
- 一个 GitHub 仓库（私有/公开均可）
- 一个域名（已经在 Cloudflare 管理 DNS，或愿意把 DNS 切到 Cloudflare）
- 一个有效的 OpenAI API Key

## 2. 把域名 DNS 接入 Cloudflare（如果还没接）

1. 登录 https://dash.cloudflare.com → **Add a site** → 输入你的域名 → 选 Free 档。
2. Cloudflare 会列出现有 DNS 记录，先全部接受默认。
3. 复制它给的两条 nameserver，到你买域名的注册商后台（阿里云/腾讯云/Namecheap/GoDaddy 等）把 nameserver 改成 Cloudflare 给的两条。
4. 等几分钟到几小时 DNS 生效，dashboard 顶部会从 "Pending" 变 "Active"。

## 3. 创建 Pages 项目并连接 GitHub

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
2. 授权 Cloudflare GitHub App，**只授权 PromptCanvas 这一个仓库**（不要 All repos）。
3. 选中仓库 → **Begin setup**。
4. 构建配置：
   - **Production branch**: `main`
   - **Framework preset**: `Vue` 或 `Vite`（任选其一即可）
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/`
5. **Environment variables (Production)** 添加：
   - `OPENAI_API_KEY` = `sk-...`（点 **Encrypt** 加密）
   - `OPENAI_IMAGE_MODEL` = `gpt-image-1`（明文）
   - `OPENAI_TIMEOUT_MS` = `120000`（明文）
   - `OPENAI_BASE_URL`（可选明文）= 中转站完整 base URL（必须带 `/v1`，如 `https://api.chshapi.cn/v1`）；走官方 OpenAI 留空即可
6. **Save and Deploy**。第一次会跑 1-2 分钟。
7. 部署完成后会得到一个 `xxx.pages.dev` 临时域名，先打开这个域名验证：
   - 页面能加载
   - 右上角显示“后端在线”
   - 控制台 Network 看到 `GET /api/health` → 200

## 4. 绑定自定义域名

假设你的域名是 `example.com`，想用 `promptcanvas.example.com`：

1. 进入 Pages 项目 → **Custom domains** → **Set up a custom domain** → 输入 `promptcanvas.example.com`。
2. Cloudflare 会自动帮你创建一条 CNAME 记录（因为 DNS 已托管在 Cloudflare）。点 **Activate domain**。
3. 等 1-2 分钟 SSL 证书签发完成，状态从 "Pending" → "Active"。
4. 浏览器访问 `https://promptcanvas.example.com` 验证。

如果想用裸域 `example.com` 直接绑也可以，步骤一样。

## 5. （可选）设置 API 速率限制

Pages Functions 自身没做 rate limit。在 Cloudflare 加：

1. 域名 Dashboard → **Security** → **WAF** → **Rate limiting rules** → **Create rule**。
2. 配置：
   - Name: `Limit image generation`
   - Field: `URI Path`，Operator: `equals`，Value: `/api/images/generate`
   - And: `Request Method` `equals` `POST`
   - Rate: `10` requests per `1 minute` per `IP`
   - Action: `Block` for `1 minute`
3. Deploy。

## 6. （可选）开启基础防护

- **Security → Bots** → 开 "Bot Fight Mode"（免费）
- **Security → Settings** → Security Level: `Medium`
- **SSL/TLS** → 模式选 `Full (strict)`，确保浏览器到 Cloudflare 全程 HTTPS。

## 7. 后续部署流程

每次 `git push` 到 `main`，Cloudflare Pages 自动触发新构建并部署。回滚也在 Pages Dashboard → **Deployments** → 找到目标版本 → **Rollback to this deployment** 一键完成。

## 8. 监控

- **Pages → Functions → Metrics**：看每个 Function 的请求量、错误率、CPU 时间。
- **Logs**：Functions 的实时日志（5 分钟保留）。如果需要长期日志，把 Logpush 接到 R2 或第三方。

## 9. 故障排查

| 现象 | 怎么查 |
| --- | --- |
| 页面 200 但 `/api/health` 404 | Pages 没识别到 `functions/` 目录，确认仓库根目录有 `functions/api/health.ts` |
| `/api/images/generate` 返回 `MISSING_API_KEY` | 环境变量没设或没加密成 production，去 Settings → Environment variables 检查 |
| 自定义域名 SSL Pending 超过 30 分钟 | 检查 DNS 解析是否真的到了 Cloudflare（`nslookup promptcanvas.example.com`），或重新触发 Activate |
| 函数执行超时 | Pages Function 单次执行上限 30 秒（免费档），把 `OPENAI_TIMEOUT_MS` 调到 25000 |

## 10. 不要做的事

- 不要把 `OPENAI_API_KEY` 加到前端 `.env` 或 `VITE_*` 变量。前端任何 `VITE_` 变量都会被打包进 `dist/` 暴露给浏览器。
- 不要在 GitHub 仓库里 commit `.env` 文件，`.gitignore` 已经排除。
- 不要把 Cloudflare API Token / OpenAI Key 贴到 issue、PR、聊天截图里。
