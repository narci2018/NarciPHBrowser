# NarciPHBrowser RBAC Server - Docker Edition

基于 **Docker 容器化 (Node.js + Better-SQLite3)** 的常规私有化部署版本，适合部署在自建 VPS、内网 NAS 或私有云服务器。

## 特性
- 🐳 **一键容器化**：开箱即用，自动初始化 SQLite 数据库与默认角色权限。
- 📦 **零复杂依赖**：自带持久化数据卷挂载 (`./data`)，不依赖额外 MySQL 或 Postgres 容器。
- 🔄 **100% API 对齐**：与 Cloudflare 版本对外暴露的 API 完全一致。

## 启动步骤

### 方式一：Docker Compose 一键启动 (推荐)
```bash
cd server/docker
docker compose up -d
```
启动后服务监听在宿主机的 `http://127.0.0.1:29988`。
健康检查访问：`http://127.0.0.1:29988/api/v1/health`

### 方式二：本地 Node.js 直接运行
```bash
cd server/docker
npm install
npm run build
npm start
```
数据默认保存在 `server/docker/data/narciph_rbac.db` 中。

将服务器地址（如 `http://<your-vps-ip>:29988`）填入桌面端“账户”页面的服务器配置中即可对接！
