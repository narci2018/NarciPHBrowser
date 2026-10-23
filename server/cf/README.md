# NarciPHBrowser RBAC Server - Cloudflare Pages / Workers Edition

基于 **Cloudflare Pages / Workers + Cloudflare D1 (Serverless SQLite)** 的零运维轻量权限服务端。

## 特性
- ⚡ **全球 Edge 低延迟部署**：基于 Cloudflare V8 边缘计算网络。
- 💰 **完全免费起步**：享受 Cloudflare D1 每天 500 万行读取与 5GB 免费存储。
- 🔐 **Web Crypto 原生加解密**：PBKDF2 密码哈希 + HMAC-SHA256 JWT 签发，无任何本地原生编译依赖。
- 🛡️ **通用 RBAC 细粒度权限**：支持自主注册自动分配 `basic_user` 基础体验角色与权限。

## 部署步骤

### 1. 安装依赖
```bash
cd server/cf
npm install
```

### 2. 创建 Cloudflare D1 数据库
```bash
npx wrangler d1 create narciph_rbac
```
复制终端输出中的 `database_id`，粘贴到 `wrangler.toml` 中的 `database_id = "..."`。

### 3. 初始化数据库表结构与默认角色数据
```bash
# 本地测试初始化
npx wrangler d1 execute narciph_rbac --local --file=../shared/schema.sql

# 生产远程初始化
npx wrangler d1 execute narciph_rbac --remote --file=../shared/schema.sql
```

### 4. 本地启动开发预览
```bash
npm run dev
# 访问 http://127.0.0.1:8787/api/v1/health
```

### 5. 一键发布部署到 Cloudflare
```bash
npm run deploy
```
发布成功后，将生成的 `https://<your-project>.workers.dev` 复制并填入 NarciPHBrowser 桌面端的“账户”页面中即可连接！
