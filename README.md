# 短链工作台 · 免费方案

React 前端、独立账号登录、多域名短链、直接跳转及中转页、访问统计、用户管理和账号设置。短链访客无需登录。

默认路线只使用免费额度：Cloudflare Workers + D1 持久化数据库。若接收者的网络无法访问 `workers.dev`，可用 Render Free 作为无状态入口，把请求交给同一免费后端。Render 入口不保存数据库，不配置磁盘，不使用收费 Web 实例。

**当前阶段：** `render.yaml` 的 `WORKER_ORIGIN` 指向连通性测试页。先验证手机能访问免费入口，再切换到完整后端。仅部署成功不代表接收者网络可用。

本项目未复制或改动原站正在使用的短链、域名或统计。仓库不包含真实密码、密钥或数据库文件。

## Cloudflare 免费后端

```text
npm ci --include=dev
npm run build
npx wrangler login
npx wrangler d1 migrations apply link-workspace-db --remote
npx wrangler secret put SETUP_TOKEN
npx wrangler deploy
```

`wrangler.jsonc` 中的 D1 属于本项目所有者账号；其他人部署时需创建自己的 D1 并替换数据库 ID。迁移只创建表结构，没有业务种子数据。只选择 Workers Free，不启用付费计划、R2 或付费数据库。

`SETUP_TOKEN` 需至少 24 位随机字符，仅由所有者保管。在首次访问 `/setup` 时由所有者亲自输入该密钥并设置管理员账号和密码。初始化只允许一次。密码采用随机盐和 Web Crypto PBKDF2-HMAC-SHA256（600,000 次）派生保存；会话 Cookie 为 HttpOnly、SameSite，HTTPS 下为 Secure。改密会撤销其他会话。

若入口为 Render，把 Worker 的 `PUBLIC_ORIGIN` 变量设为实际 `https://xxx.onrender.com` 网址，再重新部署。这样创建的短链使用接收者可访问的入口域名，后台仍要求独立登录及服务端权限校验。

## Render Free 可选入口

根目录 `render.yaml` 明确指定 `plan: free`，没有磁盘和收费数据库：

- 构建：`node --check cloudflare/proxy.mjs`
- 启动：`node cloudflare/proxy.mjs`
- 健康检查：`/healthz`
- `WORKER_ORIGIN`：后端 Worker 的 HTTPS 网址。验证通过后再由测试页切换到完整后端。

入口只转发到配置的 `workers.dev` 后端，不是任意网址代理。请求有体积及超时限制，登录和同源校验仍在后端执行。

Render 免费服务闲置后会休眠，首次唤醒通常约一分钟。仅使用免费服务，不添加付款方式，不开通付费工作区；免费额度不足则停止或暂停，不自动升级为收费方案。Cloudflare Free 达到相应请求或 D1 读写额度时也会受限。

## 验证

```text
npm run check
npm run build
npm test
node scripts/smoke-test.mjs --cloudflare
npx wrangler deploy --dry-run
```

两套测试均使用隔离本地数据库，包含初始化校验、匿名访问、权限隔离、两种跳转、HTML 转义、去重、HEAD 不计数、停用/软删除、历史保留、改密会话失效、注销及重启后数据保留。Cloudflare 测试只使用本地 D1，绝不写入远程数据库。

`src/server.ts` 保留为可自行托管的 Node + SQLite 版本，`cloudflare/worker.ts` 为免费 Worker 版本；二者共享界面及业务行为，认证和存储实现不同。Node 本地运行时设置私有 `SETUP_TOKEN` 和 `DATA_DIR`，生产持久化方式需自行配置。

## 数据

按北京时间统计；同浏览器同短链滚动 10 分钟去重。HEAD 请求不计数，访问数不代表目标网址加载成功。删除链接后保留历史。域名暂停新增不影响已有链接；停用域名或账号会阻止其相关短链。认证限流标识经哈希后保存，不记录访客明文 IP。

数据备份使用 D1 导出及其支持的恢复方式。新增域名记录仍需相应域名的 DNS 和托管绑定。
