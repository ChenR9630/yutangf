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

### 豆包 AI 自动回复

服务器支持接入火山方舟豆包模型，在房间在线人数较少时由“塘小逗”根据最近 12 条聊天自动接一句轻松回复。它会优先顺着上下文里的谐音、反转、职场梗和大众网络表达接龙，没有明显的梗时则自然回应。默认未配置密钥时不会启用。

可用环境变量：

- `DOUBAO_API_KEY` 或 `ARK_API_KEY`：火山方舟 API Key
- `DOUBAO_MODEL` 或 `ARK_MODEL`：方舟推理接入点 ID，通常是 `ep-...`
- `DOUBAO_BASE_URL`：接口地址，默认 `https://ark.cn-beijing.volces.com/api/v3`
- `YUTANG_AI_NAME`：AI 昵称，默认 `塘小逗`
- `YUTANG_AI_ONLINE_THRESHOLD`：房间在线人数小于等于该值时触发，默认 `2`
- `YUTANG_AI_COOLDOWN_MS`：单个房间自动回复冷却时间，默认 `45000`

### 鱼塘表情包

聊天侧栏内置可搜索、可分类的鱼塘表情包库。表情以独立消息类型持久化并通过 Socket.IO 广播，当前包含摸鱼、职场、情绪、互动四类共 18 个原创梗表情；豆包 AI 会读取表情对应的语义并继续接话。

### 牛维斯摆烂规划

聊天侧栏的“牛维斯摆烂规划”会根据用户当前状态、工作负荷和计划下班时间，生成三项低风险减压任务与今日摆烂指数。任务支持逐项打卡、勋章解锁、重新生成，并可将精简计划一键分享到当前聊天室。

## 部署

生产环境迁移到腾讯云香港轻量应用服务器。推荐使用仓库内的部署脚本：

```bash
sudo bash deploy/tencent-lighthouse/deploy.sh
```

脚本会在服务器上安装依赖、构建前端、创建 systemd 服务，并用 Nginx 反向代理到本地 Node 服务。
详细步骤见 `deploy/tencent-lighthouse/README.md`。通用容器平台仍可使用 `Dockerfile`。
