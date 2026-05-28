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
- `POST /api/report` 消息举报
- `/socket.io` 实时消息连接

## 部署

Render 可直接使用仓库内的 `render.yaml`。通用容器平台可使用 `Dockerfile`。
