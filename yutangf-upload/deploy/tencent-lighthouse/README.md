# 腾讯云香港轻量服务器部署

目标环境：腾讯云 Lighthouse 香港实例，Ubuntu 22.04/24.04 或 Debian 12。

## 服务器准备

1. 在腾讯云控制台确认安全组/防火墙放行 `80`、`443`、`22`。
2. 将代码推送到 GitHub 仓库 `https://github.com/ChenR9630/yutangf.git`。
3. SSH 登录服务器后执行：

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates nginx
git clone https://github.com/ChenR9630/yutangf.git /opt/yutang
cd /opt/yutang
sudo bash deploy/tencent-lighthouse/deploy.sh
```

如果仓库已存在，脚本会自动拉取最新 `main` 分支。

## 服务信息

- 应用目录：`/opt/yutang`
- Node 服务：`yutang.service`
- 本地端口：`8787`
- 健康检查：`http://127.0.0.1:8787/api/health`
- Nginx 配置：`/etc/nginx/sites-available/yutang.conf`

## 常用命令

```bash
sudo systemctl status yutang
sudo journalctl -u yutang -f
sudo systemctl restart yutang
curl http://127.0.0.1:8787/api/health
```

## 数据持久化

当前 MVP 使用文件存储：

- `data/messages.json`
- `data/auth.sqlite`
- `data/auth.sqlite-wal`
- `data/auth.sqlite-shm`

`data/auth.sqlite` 保存用户和登录 session；首次启动会从旧的 `data/users.json` 自动迁移用户。服务器重启不会清空这些文件，但重新克隆、覆盖目录或迁移服务器前需要备份 `data/`。正式长期运行建议挂载独立云硬盘，或迁移到托管数据库。
