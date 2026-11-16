# 短链工作台 · Render 独立版

React + Node.js 24 + SQLite。独立账号及密码登录、HttpOnly 会话、公开短链、多域名、直接跳转与中转页、按北京时间统计、用户管理及设置。普通访客打开短链不需要账号。

这是新系统，未复制或改动原站的域名、短链和统计数据。

## Render 部署

仓库必须只包含本目录的内容。选择 **Web Service / 网络服务**，连接本仓库：

- Node.js：24.22.1
- 构建命令：`npm ci --include=dev && npm run build`
- 启动命令：`npm start`
- 健康检查：`/healthz`
- 持久化磁盘：挂载 `/var/data`，建议初始 1 GB。
- 环境变量：`DATA_DIR=/var/data`，`SETUP_TOKEN` 为至少 24 位的随机密钥。Blueprint 会生成该密钥。
- 公开域名默认读取 Render 提供的 `RENDER_EXTERNAL_URL`；使用自定义域名时设 `PUBLIC_ORIGIN=https://你的域名`。服务只允许 HTTP(S) 目标。

**费用：** `render.yaml` 使用 `0.5c-512mb` Web Service 和 1 GB 持久化磁盘，它们不是免费资源。按核对时的服务基础价 $7/月与磁盘 $0.25/GB/月，基础费用约 $7.25/月，另有可能的税费、超额流量及工作区套餐费用。正式创建前先核对 Render 创建页价格并由所有者确认费用。免费 Web Service 的本地文件会在重启/重新部署后丢失，不适合直接保存本系统的数据库，因此不要以免费套餐直接运行正式短链。

部署后访问 `/setup`。在 Render 环境变量里查看 `SETUP_TOKEN`，由站点所有者亲自输入初始化密钥并设置管理员账号与密码（至少 12 位）。初始化入口只允许创建一次管理员；未知访客无法抢占管理员。密码使用独立随机盐和 scrypt 派生保存，不保存明文。默认关闭注册。

仓库不应上传 `.env`、数据文件或真实密码。GitHub 仓库可以保持私有，由 Render 的 GitHub 集成读取。

## 本地运行及验证

```powershell
npm ci
npm run build
$env:SETUP_TOKEN='替换成足够长的随机初始化密钥'
$env:DATA_DIR='./data'
npm start
```

默认端口 3000，服务监听 `0.0.0.0`，生产使用 Render 注入的 `PORT`。本地访问 `http://127.0.0.1:3000`。本地测试使用临时隔离数据库，不使用正式数据：

```text
npm run check
npm test
```

测试包含初始化令牌、账号登录、匿名访问、权限隔离、两种跳转、重复访问去重、软删除保留统计和重启后数据保留。

## 数据和运营

数据文件为 `DATA_DIR/workspace.sqlite`（含 SQLite WAL 文件）。维护数据库备份时使用 SQLite 一致性备份方式，不能只复制正在写入的单一主文件。新增业务表结构应追加版本化迁移。

添加域名记录只登记短码空间，还需要在 Render 配置该域名及 DNS。将域名从正常改为暂停新增，已有短链仍可访问；停用域名则停止全部相关短链。停用账号也会阻止其短链访问。

同浏览器、同短链滚动 10 分钟去重，HEAD 不计数。计数代表短链请求，不代表目标网站成功加载。不收集访客 IP；禁用 Cookie 可能重复计数。
