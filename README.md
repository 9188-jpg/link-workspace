# 短链工作台 · 免费方案

React 前端、独立账号登录、多域名短链、直接跳转及中转页、访问统计、用户管理和账号设置。短链访客无需登录。

当前默认上线方案是 Cloudflare Pages + D1 持久化数据库，使用免费额度，生产地址为 https://link-workspace-9188.pages.dev/ 。接收者的手机网络已确认可以打开 Pages 测试页。

Cloudflare Workers 的默认 workers.dev 地址未通过接收者手机访问测试，因此不作为当前分享入口。Render 账号要求银行卡验证，所有者选择不绑定，所以当前不启用 Render。

另一个免费入口为 https://link-share-9188.pages.dev/ ，部署配置在 `cloudflare/pages-share/wrangler.jsonc`。两个项目共用 D1 和相同的 `AUTH_PEPPER` secret，使用同一套账号和数据，但浏览器需在各域名分别登录。更新代码后须分别部署两个 Pages 项目。第二个入口不要设置 `PUBLIC_ORIGIN`，这样每个域名的短码按实际访问域名解析。

新域名已登记为非默认的“备用分享域名”，不会更改原默认域名或旧短链；新建短链时在域名选项中选择它。原域名下的短码不会自动复制到新域名。第二个项目的发布命令为 `npx wrangler pages deploy --cwd cloudflare/pages-share --project-name link-share-9188 --branch main`。两个项目仍共享账号免费额度。

本项目未复制或改动原站正在使用的短链、域名或统计。仓库不包含真实密码、密钥或数据库文件。

## 从飞书打开系统浏览器

后台列表及创建结果中的“复制飞书链接”会在当前短链上携带 `lk_mobile_jump_to_browser=true` 和 `lk_jump_to_browser=true`。请将复制的完整地址分享到飞书聊天，再从飞书内点击。桌面端参数见 [飞书官方说明](https://open.feishu.cn/document/embed-web-app-into-feishu-workbench/step-1-create-and-configure-an-app)；移动端参数来自飞书自身外链确认页当前的跳转实现，需按接收者客户端实际验证。

新建短链默认选择“中转页”，配合带上述两个参数的复制结果，沿用所有者确认的分享形式。已有链接保持各自的原跳转方式；新建时仍可手动选择“直接跳转”。此默认值仅影响创建表单，不执行任何历史数据更新。

“复制原链接”仍提供不带这些参数的地址。数据库中的短码、目标网址和访问历史不变；浏览器参数不会透传到目标网址。直接跳转/中转页控制到达浏览器后的短链行为，与从飞书切到浏览器是独立的设置。此功能依赖飞书客户端支持，不能用于保证微信等其他应用强制唤起浏览器，也不会生成或复用飞书安全检查签名。

所有者已在手机飞书实测确认：带上述参数的有效测试短链会切到系统浏览器，并正常打开百度。此结论只覆盖本次实际测试的客户端环境。

## 资源中转页

选择“中转页”的短链统一使用资源入口：链接标题、点击获取资源、真实目标链接复制和“在浏览器中打开”指引。普通浏览器显示网页版入口；检测到手机应用内浏览器且目标为 HTTPS `pan.quark.cn/s/...` 分享时，点击获取资源才尝试唤起夸克，同时提供独立的网页版入口。其他目标仍使用普通 HTTP(S) 访问。

安卓使用 `quark://open?url=...`；iOS 使用夸克公开分享页的 UC HTTPS handoff 格式，应用唤起失败的最终 fallback 仍为原分享。不会自动循环唤起、自动下载或载入第三方脚本。复制功能优先 Clipboard API，失败时选中文字尝试复制，再失败则提示长按复制，不伪报成功。链接和标题转义，保留提取码和 URL 片段。页面保持 `no-referrer` 与 nonce CSP，不接收查询参数改写目标。

这是按参考站交互升级的资源页，不是强制切出 X 或改变 IP 的实现。应用内识别依赖 User-Agent，夸克原生唤起及 iPhone 兼容性仍需真机验收。已有链接的目标、两种模式、权限和统计规则均保留；无需数据库迁移。新旧 `page` 模式链接都会显示新资源页，`direct` 模式继续立即前往目标。

`src/resource-page.ts` 同时供 Node 和 Cloudflare 使用；`scripts/resource-page.test.mjs` 验证不同设备分支、目标与提取码保留、转义、复制回退和点击前无唤起。模拟运行不代表真机应用唤起成功。

## X 外部浏览器兼容性测试（尚未验收）

GitHub 实现对照测试：`/assets/github-browser-test.html`。安卓 `?run=android-auto` 在页面加载时单次发起 `astro-inapp-escape` 同结构的无 package 精简 Intent；页面按钮可对照用户点击场景。iPhone 测试仅是 `inapp-debugger` 记载的 Safari scheme 候选，不能宣称 X 已支持。所有方法统一指向新建的 `/github-browser-1116` 中转验收短链，显示中转页后用户再点百度，避免与直接唤起夸克混淆。电脑端不会发起手机协议。

2026-11-16 所有者真实安卓 X 验收反馈：该精简 Intent 的进入页面自动发起和点击按钮发起均未成功切到系统浏览器（失败或仍留在 X）。中转页本身的 HTTP 200、标题和点击访问目标已单独确认，不能把页面可达当作应用切换成功。iPhone 仍未真机验收。此结果只覆盖本次设备环境，既不能宣称 Github 方案已解决，也不能据此证明所有设备和实现都不可能。

`scripts/github-browser-probe-test.mjs` 在隔离的模拟对象中核对上游控制流及本页单次请求：`marco1cc/inapp-escape` 对 iPhone/X 返回 fallback，安卓指定 Chrome 且 success 回调只表示发起；`vdaluz/astro-inapp-escape` 安卓不指定 package、iOS 为 banner。上游只读源码下载和 SHA256 测试结果保存在被 Git 忽略的 `outputs`，不向线上页面引入远程第三方脚本。此类模拟断言不能证明手机实际切换了应用，最终必须在真实 X 客户端验收。

当前实测未通过：所有者确认安卓默认浏览器及指定 Chrome 的两个 Intent 按钮均提示“没有应用能执行此操作”，未能切出 X。普通 HTTPS `target=_blank` 新窗口对照也已实测，到达页加载成功但仍留在 X 内，不能算外部浏览器唤起。用户只接受系统默认浏览器，不以指定 Chrome 为目标。iPhone 暂无设备可测试，尚无成功结论。目前没有已验证可交付的 X 强制默认浏览器方案，不满足安卓与 iPhone 均必须切出的要求。

测试页： https://link-share-9188.pages.dev/assets/x-browser-test.html 。包含普通 HTTPS 新窗口对照、安卓默认浏览器 Intent 和 iPhone Safari 候选。到达页为 `/assets/browser-arrival.html`，加载该页本身不能证明切出了 X，必须核实独立浏览器应用实际启动。指定 Chrome 的选项已从当前测试页移除。

目前只发布隔离测试页，未添加“X 强制跳转”功能或改动业务短链。安卓机制参考 [Chrome Intent 文档](https://developer.chrome.com/docs/android/intents)；iOS Chrome scheme 参考 [Chromium 官方说明](https://chromium.googlesource.com/chromium/src.git/+/master/docs/ios/opening_links.md)。Safari `x-safari-https` 为实验候选，不是已经确认的 X 官方接口，不承诺系统默认浏览器或所有 iOS 版本可用。点击按钮遵循客户端的正常应用打开流程，不使用自动循环唤起、签名复用或安全告警绕过。

验收目标是安卓与 iPhone 的 X 客户端均实际切到外部浏览器并打开有效目标；普通网页中转、复制指引或只加载出到达页均不能代替该目标。`scripts/build-pages.mjs` 将 `cloudflare/browser-probe` 下的静态测试页一起复制进发布目录。

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

