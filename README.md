# 短链工作台 · 免费方案

React 前端、独立账号登录、多域名短链、直接跳转及中转页、访问统计、用户管理和账号设置。短链访客无需登录。

当前默认上线方案是 Cloudflare Pages + D1 持久化数据库，使用免费额度，生产地址为 https://link-workspace-9188.pages.dev/ 。接收者的手机网络已确认可以打开 Pages 测试页。

Cloudflare Workers 的默认 workers.dev 地址未通过接收者手机访问测试，因此不作为当前分享入口。Render 账号要求银行卡验证，所有者选择不绑定，所以当前不启用 Render。

另一个免费入口为 https://link-share-9188.pages.dev/ ，部署配置在 `cloudflare/pages-share/wrangler.jsonc`。两个项目共用 D1 和相同的 `AUTH_PEPPER` secret，使用同一套账号和数据，但浏览器需在各域名分别登录。更新代码后须分别部署两个 Pages 项目。第二个入口不要设置 `PUBLIC_ORIGIN`，这样每个域名的短码按实际访问域名解析。

新域名已登记为非默认的“备用分享域名”，不会更改原默认域名或旧短链；新建短链时在域名选项中选择它。原域名下的短码不会自动复制到新域名。第二个项目的发布命令为 `npx wrangler pages deploy --cwd cloudflare/pages-share --project-name link-share-9188 --branch main`。两个项目仍共享账号免费额度。

本项目未复制或改动原站正在使用的短链、域名或统计。仓库不包含真实密码、密钥或数据库文件。

## Cloudflare Pages 免费部署

```text
npm ci --include=dev
npm run cf:pages-build
npx wrangler login
npx wrangler d1 migrations apply link-workspace-db --remote
npx wrangler pages secret put SETUP_TOKEN --project-name link-workspace-9188 --cwd cloudflare/pages
npx wrangler pages secret put AUTH_PEPPER --project-name link-workspace-9188 --cwd cloudflare/pages
npx wrangler pages deploy --cwd cloudflare/pages --project-name link-workspace-9188 --branch main
```

`wrangler.jsonc` 中的 D1 属于本项目所有者账号；其他人部署时需创建自己的 D1 并替换数据库 ID。迁移只创建表结构，没有业务种子数据。只选择 Workers Free，不启用付费计划、R2 或付费数据库。

`SETUP_TOKEN` 需至少 24 位随机字符，仅由所有者保管。在首次访问 `/setup` 时由所有者亲自输入该密钥并设置管理员账号和密码。初始化只允许一次。`AUTH_PEPPER` 必须另外生成至少 32 位随机字符并保存为服务器 secret，不能与初始化密钥相同或存进数据库、仓库；请保留它，直接替换会使现有密码无法校验。

密码使用随机盐、Web Crypto PBKDF2-HMAC-SHA256（100,000 次）再以独立 `AUTH_PEPPER` 做 HMAC-SHA256 保存。Cloudflare 生产环境拒绝超过 100,000 次的 PBKDF2，而本地 workerd 不会复现该限制，参见 [Cloudflare 运行时问题 #1346](https://github.com/cloudflare/workerd/issues/1346)。已在线验证参数限制以及修复后错误密码返回 401。会话 Cookie 为 HttpOnly、SameSite，HTTPS 下为 Secure。改密会撤销其他会话。

若入口为 Render，把 Worker 的 `PUBLIC_ORIGIN` 变量设为实际 `https://xxx.onrender.com` 网址，再重新部署。这样创建的短链使用接收者可访问的入口域名，后台仍要求独立登录及服务端权限校验。

## 已停用的 Render 可选入口（当前不部署）

可选示例 `render.free.optional.yaml` 明确指定 `plan: free`，没有磁盘和收费数据库；该账号要求银行卡验证，因此它不属于当前上线流程：

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


Cloudflare Pages 的本地完整流程测试：
node scripts/smoke-test.mjs --pages

