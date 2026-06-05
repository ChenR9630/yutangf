# 鱼塘 - 职场协作综合工作台

高伪装度职场轻社交网页 MVP。前端提供办公/设计软件拟态界面，后端提供匿名房间、实时消息、在线人数、基础内容过滤和静态站点托管。

## 本地开发

```bash
npm install
npm run dev:full
```

前端默认运行在 `http://localhost:5173`，后端默认运行在 `http://localhost:8787`。如果端口被占用，Vite 会自动切换前端端口。

## 生产运行

```bash
npm run build
npm start
```

生产服务会在同一个 Node 进程里托管：

- `GET /` 前端页面
- `GET /api/health` 健康检查
- `GET /api/bootstrap` 初始化数据
- `GET /api/auth/me` 当前登录用户
- `POST /api/auth/register` 注册
- `POST /api/auth/login` 登录
- `POST /api/auth/logout` 退出
- `POST /api/report` 消息举报
- `/socket.io` 实时消息连接

账户使用 SQLite 持久化到 `data/auth.sqlite`，登录 session 也保存在同一个数据库中。首次启动会自动把旧的 `data/users.json` 用户迁移到 SQLite。

## 部署

生产环境迁移到腾讯云香港轻量应用服务器。推荐使用仓库内的部署脚本：

```bash
sudo bash deploy/tencent-lighthouse/deploy.sh
```

脚本会在服务器上安装依赖、构建前端、创建 systemd 服务，并用 Nginx 反向代理到本地 Node 服务。
详细步骤见 `deploy/tencent-lighthouse/README.md`。通用容器平台仍可使用 `Dockerfile`。
