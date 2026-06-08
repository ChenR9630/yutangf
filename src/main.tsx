import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, type Socket } from "socket.io-client";
import {
  Activity,
  BarChart3,
  BellOff,
  Brush,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Columns3,
  Copy,
  EyeOff,
  FileText,
  FolderOpen,
  Grid3X3,
  Image,
  Layers3,
  MessageSquareText,
  MonitorCheck,
  MousePointer2,
  Palette,
  PanelLeft,
  Presentation,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Table2,
  TerminalSquare,
  UserRound,
  UserPlus,
  UsersRound,
  Wifi,
  LogOut,
} from "lucide-react";
import {
  defaultOnline,
  defaultPolicies,
  initialMessages,
  mergeRoomPresentation,
  type ApiError,
  type AdminStats,
  type AuthForm,
  type AuthMode,
  type AuthResponse,
  type AuthUser,
  type BootstrapModel,
  type BootstrapPolicies,
  type ChatMessage,
  type MessageCreatePayload,
  type MessageCreateResult,
  type ModeId,
  type OnlineSnapshot,
  type RoomId,
  type RoomPresentation,
} from "./model";
import "./styles.css";

type ServerToClientEvents = {
  "message:new": (message: ChatMessage) => void;
  "online:update": (online: OnlineSnapshot) => void;
};

type ClientToServerEvents = {
  "room:join": (room: RoomId) => void;
  "message:create": (
    payload: MessageCreatePayload,
    acknowledge?: (result: MessageCreateResult) => void,
  ) => void;
};

const topics = ["摸鱼段子", "美食分享", "影视推荐", "职场树洞", "日常好物", "下班倒计时"];
const quickTools = ["牛维斯摆烂规划", "扫雷", "华容道", "松弛文案", "表情包库"];

function App() {
  const [mode, setMode] = useState<ModeId>("home");
  const [rooms, setRooms] = useState<Record<RoomId, RoomPresentation>>(() => mergeRoomPresentation());
  const [messages, setMessages] = useState(initialMessages);
  const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [online, setOnline] = useState<OnlineSnapshot>({});
  const [nickname, setNickname] = useState("未登录");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authForm, setAuthForm] = useState<AuthForm>({ username: "", displayName: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState("");
  const [policies, setPolicies] = useState<BootstrapPolicies>(defaultPolicies);
  const [privateMode, setPrivateMode] = useState(false);
  const [now, setNow] = useState(new Date());

  const activeRoom = mode === "home" || mode === "admin" ? undefined : rooms[mode];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch("/api/bootstrap")
      .then((response) => response.json() as Promise<BootstrapModel>)
      .then((data) => {
        if (!mounted) return;
        if (Array.isArray(data.messages)) setMessages(data.messages);
        if (data.rooms) setRooms(mergeRoomPresentation(data.rooms));
        if (data.online) setOnline(data.online);
        if (data.policies) setPolicies({ ...defaultPolicies, ...data.policies });
        if (data.user) {
          setUser(data.user);
          setNickname(data.user.displayName);
        }
      })
      .catch(() => {
        if (mounted) setSendError("后端暂未连接，已使用本地演示数据。");
      });

    const nextSocket: Socket<ServerToClientEvents, ClientToServerEvents> = io();
    nextSocket.on("message:new", (message) => {
      setMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]));
    });
    nextSocket.on("online:update", setOnline);
    setSocket(nextSocket);

    return () => {
      mounted = false;
      nextSocket.disconnect();
    };
  }, [user?.id]);

  const submitAuth = async () => {
    setAuthBusy(true);
    setAuthError("");
    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authForm),
      });
      const result = (await response.json()) as AuthResponse;
      if (!response.ok || !result.user) {
        setAuthError(authErrorText(result.error));
        return;
      }
      setUser(result.user);
      setNickname(result.user.displayName);
      setAuthForm({ username: "", displayName: "", password: "" });
    } catch {
      setAuthError("账户服务暂时不可用，请稍后再试。");
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = async () => {
    socket?.disconnect();
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setSocket(null);
    setUser(null);
    setNickname("未登录");
  };

  useEffect(() => {
    if (activeRoom) document.title = activeRoom.file;
    else document.title = "职场协作综合工作台";
  }, [activeRoom]);

  useEffect(() => {
    if (mode !== "home" && mode !== "admin") socket?.emit("room:join", mode);
  }, [mode, socket]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setPrivateMode((value) => !value);
      }
      if (event.key === "Escape") setPrivateMode(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let idleTimer: number;
    const reset = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => setPrivateMode(true), 45000);
    };
    reset();
    ["mousemove", "keydown", "click", "scroll"].forEach((name) => window.addEventListener(name, reset));
    return () => {
      window.clearTimeout(idleTimer);
      ["mousemove", "keydown", "click", "scroll"].forEach((name) => window.removeEventListener(name, reset));
    };
  }, []);

  const visibleMessages = useMemo(() => {
    if (mode === "home" || mode === "admin") return [];
    return messages.filter((message) => message.room === mode);
  }, [messages, mode]);

  const sendMessage = () => {
    if (mode === "home" || mode === "admin" || !draft.trim()) return;
    if (!user) {
      setSendError("登录后才能发言。");
      return;
    }
    const text = draft.trim();
    setSendError("");
    setDraft("");

    if (socket?.connected) {
      socket.emit(
        "message:create",
        {
          room: mode,
          text,
          tag: mode === "ps" ? "图层" : "游水",
        },
        (result) => {
          if (!result.ok) {
            if (result.error === "login_required") {
              setUser(null);
              setNickname("未登录");
              socket.disconnect();
            }
            setSendError(errorText(result.error));
          }
        },
      );
      return;
    }

    setDraft(text);
    setSendError("实时服务连接中，请稍后再发。");
  };

  return (
    <div className={`app ${mode === "ps" ? "theme-dark" : "theme-office"}`}>
      {mode === "home" || (mode === "admin" && !user?.isAdmin) ? (
        <Home
          now={now}
          user={user}
          authMode={authMode}
          authForm={authForm}
          authError={authError}
          authBusy={authBusy}
          onAuthMode={setAuthMode}
          onAuthForm={setAuthForm}
          onSubmitAuth={submitAuth}
          onLogout={logout}
          onEnter={setMode}
        />
      ) : mode === "admin" && user?.isAdmin ? (
        <AdminDashboard now={now} user={user} onMode={setMode} onLogout={logout} />
      ) : (
        <Workspace
          mode={mode as RoomId}
          rooms={rooms}
          now={now}
          messages={visibleMessages}
          nickname={nickname}
          draft={draft}
          online={online}
          policies={policies}
          sendError={sendError}
          privateMode={privateMode}
          user={user}
          onMode={setMode}
          onNickname={setNickname}
          onDraft={setDraft}
          onSend={sendMessage}
          onPrivacy={() => setPrivateMode((value) => !value)}
          onLogout={logout}
        />
      )}
    </div>
  );
}

function Home({
  now,
  user,
  authMode,
  authForm,
  authError,
  authBusy,
  onAuthMode,
  onAuthForm,
  onSubmitAuth,
  onLogout,
  onEnter,
}: {
  now: Date;
  user: AuthUser | null;
  authMode: AuthMode;
  authForm: AuthForm;
  authError: string;
  authBusy: boolean;
  onAuthMode: (mode: AuthMode) => void;
  onAuthForm: (form: AuthForm) => void;
  onSubmitAuth: () => void;
  onLogout: () => void;
  onEnter: (mode: ModeId) => void;
}) {
  return (
    <main className="home-shell">
      <header className="home-topbar">
        <div className="brand-lockup">
          <div className="fish-logo" aria-label="鱼塘">
            <span>鱼</span>
          </div>
          <div>
            <h1>鱼塘</h1>
            <p>职场协作综合工作台</p>
          </div>
        </div>
        <SystemStatus now={now} />
      </header>

      <div className="home-main">
        <section className="launch-panel" aria-label="模式入口">
          <button className="launch-card" onClick={() => onEnter("word")}>
            <div className="launch-icon office-icon">
              <FileText size={34} />
            </div>
            <div>
              <strong>办公职员模式</strong>
              <span>文档、表格、演示协作套件</span>
            </div>
            <ChevronRight size={20} />
          </button>
          <button className="launch-card" onClick={() => onEnter("ps")}>
            <div className="launch-icon design-icon">
              <Brush size={34} />
            </div>
            <div>
              <strong>设计职员模式</strong>
              <span>专业设计工作台</span>
            </div>
            <ChevronRight size={20} />
          </button>
        </section>
        <AuthPanel
          user={user}
          mode={authMode}
          form={authForm}
          error={authError}
          busy={authBusy}
          onMode={onAuthMode}
          onForm={onAuthForm}
          onSubmit={onSubmitAuth}
          onLogout={onLogout}
          onAdmin={() => onEnter("admin")}
        />
      </div>

      <section className="status-grid">
        <div>
          <MonitorCheck size={18} />
          <span>服务状态</span>
          <strong>运行正常</strong>
        </div>
        <div>
          <ShieldCheck size={18} />
          <span>协作环境</span>
          <strong>静默模式</strong>
        </div>
        <div>
          <BellOff size={18} />
          <span>消息提示</span>
          <strong>已关闭</strong>
        </div>
      </section>

      <footer className="home-footer">
        <span>Yutang Workbench v0.1.0</span>
        <span>请合理安排工作与休息，遵守所在组织的信息安全规范。</span>
      </footer>
    </main>
  );
}

function AuthPanel({
  user,
  mode,
  form,
  error,
  busy,
  onMode,
  onForm,
  onSubmit,
  onLogout,
  onAdmin,
}: {
  user: AuthUser | null;
  mode: AuthMode;
  form: AuthForm;
  error: string;
  busy: boolean;
  onMode: (mode: AuthMode) => void;
  onForm: (form: AuthForm) => void;
  onSubmit: () => void;
  onLogout: () => void;
  onAdmin: () => void;
}) {
  if (user) {
    return (
      <aside className="auth-panel account-panel">
        <div className="auth-heading">
          <UserRound size={19} />
          <div>
            <strong>{user.displayName}</strong>
            <span>@{user.username}</span>
          </div>
        </div>
        <div className="account-meter">
          <span>账户状态</span>
          <strong>{user.isAdmin ? "管理员" : "已登录"}</strong>
        </div>
        {user.isAdmin && (
          <button className="auth-submit" onClick={onAdmin}>
            <BarChart3 size={16} />
            运营面板
          </button>
        )}
        <button className="auth-submit secondary" onClick={onLogout}>
          <LogOut size={16} />
          退出账户
        </button>
      </aside>
    );
  }

  return (
    <aside className="auth-panel">
      <div className="auth-tabs" role="tablist" aria-label="账户入口">
        <button className={mode === "login" ? "active" : ""} onClick={() => onMode("login")}>
          <UserRound size={15} />
          登录
        </button>
        <button className={mode === "register" ? "active" : ""} onClick={() => onMode("register")}>
          <UserPlus size={15} />
          注册
        </button>
      </div>
      <label className="field-label">
        用户名
        <input
          value={form.username}
          autoComplete="username"
          onChange={(event) => onForm({ ...form, username: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSubmit();
          }}
        />
      </label>
      {mode === "register" && (
        <label className="field-label">
          昵称
          <input
            value={form.displayName}
            maxLength={12}
            onChange={(event) => onForm({ ...form, displayName: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSubmit();
            }}
          />
        </label>
      )}
      <label className="field-label">
        密码
        <input
          type="password"
          value={form.password}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={mode === "register" ? 10 : undefined}
          maxLength={128}
          aria-describedby={mode === "register" ? "register-password-hint" : undefined}
          onChange={(event) => onForm({ ...form, password: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSubmit();
          }}
        />
        {mode === "register" && (
          <span id="register-password-hint" className="field-hint">
            至少 10 位，须包含大写字母、小写字母、数字和符号。
          </span>
        )}
      </label>
      {error && <p className="send-error">{error}</p>}
      <button className="auth-submit" onClick={onSubmit} disabled={busy}>
        {mode === "login" ? <UserRound size={16} /> : <UserPlus size={16} />}
        {busy ? "处理中" : mode === "login" ? "进入账户" : "创建账户"}
      </button>
    </aside>
  );
}

function AdminDashboard({
  now,
  user,
  onMode,
  onLogout,
}: {
  now: Date;
  user: AuthUser | null;
  onMode: (mode: ModeId) => void;
  onLogout: () => void;
}) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState("");
  const peakMessages = Math.max(1, ...(stats?.messagesByHour.map((item) => item.count) || [1]));
  const peakRegistrations = Math.max(1, ...(stats?.registrationsByDay.map((item) => item.count) || [1]));

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    const loadStats = () => {
      fetch("/api/admin/stats")
        .then((response) => response.json())
        .then((result) => {
          if (!mounted) return;
          if (!result.stats) {
            setError(errorText(result.error));
            return;
          }
          setStats(result.stats);
          setError("");
        })
        .catch(() => {
          if (mounted) setError("控制台服务暂时不可用。");
        });
    };
    loadStats();
    const timer = window.setInterval(loadStats, 15000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [user]);

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-title">
          <button className="icon-button" onClick={() => onMode("home")} title="返回工作台">
            <ChevronLeft size={17} />
          </button>
          <div>
            <h1>运营面板</h1>
            <p>注册、活跃、在线与消息运营状态</p>
          </div>
        </div>
        <div className="admin-actions">
          <SystemStatus now={now} compact />
          {user && (
            <button className="account-inline" onClick={onLogout}>
              <LogOut size={15} />
              退出 @{user.username}
            </button>
          )}
        </div>
      </header>

      {!user ? (
        <section className="admin-empty">
          <ShieldCheck size={28} />
          <strong>登录后查看控制台</strong>
          <button className="auth-submit" onClick={() => onMode("home")}>去登录</button>
        </section>
      ) : !user.isAdmin ? (
        <section className="admin-empty">
          <ShieldCheck size={28} />
          <strong>需要管理员权限</strong>
          <span>当前账户不能查看运营控制台</span>
          <button className="auth-submit secondary" onClick={() => onMode("home")}>返回工作台</button>
        </section>
      ) : error ? (
        <section className="admin-empty">
          <ShieldCheck size={28} />
          <strong>{error}</strong>
        </section>
      ) : !stats ? (
        <section className="admin-empty">
          <Activity size={28} />
          <strong>正在读取运营数据</strong>
        </section>
      ) : (
        <section className="admin-content">
          <div className="metric-grid">
            <MetricCard label="注册用户" value={stats.totals.users} detail="账户总数" />
            <MetricCard label="24 小时活跃" value={stats.activity.activeUsers24h} detail="有会话访问的用户" />
            <MetricCard label="实时在线" value={stats.totals.onlineSockets} detail="当前房间连接数" />
            <MetricCard label="今日消息" value={stats.activity.messagesToday} detail={`近 1 小时 ${stats.activity.messagesLastHour}`} />
          </div>

          <div className="admin-grid">
            <section className="admin-panel">
              <div className="panel-heading">
                <strong>实时活跃度</strong>
                <span>{new Date(stats.generatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div className="activity-list">
                <AdminFact label="15 分钟活跃用户" value={stats.activity.activeUsers15m} />
                <AdminFact label="有效会话" value={stats.totals.activeSessions} />
                <AdminFact label="今日新增会话" value={stats.activity.sessionsCreatedToday} />
                <AdminFact label="消息总量" value={stats.totals.messages} />
              </div>
            </section>

            <section className="admin-panel">
              <div className="panel-heading">
                <strong>房间分布</strong>
                <span>在线 / 消息</span>
              </div>
              <div className="room-stat-list">
                {stats.rooms.map((room) => (
                  <div key={room.id} className="room-stat-row">
                    <span>{room.label}</span>
                    <strong>{room.online}</strong>
                    <small>{room.messages} 条</small>
                  </div>
                ))}
              </div>
            </section>

            <section className="admin-panel wide">
              <div className="panel-heading">
                <strong>近 12 小时消息</strong>
                <span>按小时</span>
              </div>
              <div className="bar-chart">
                {stats.messagesByHour.map((item) => (
                  <div key={item.hour} className="bar-item">
                    <div style={{ height: `${Math.max(8, (item.count / peakMessages) * 100)}%` }} />
                    <span>{item.hour}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="admin-panel">
              <div className="panel-heading">
                <strong>近 7 天注册</strong>
                <span>账户创建</span>
              </div>
              <div className="mini-bars">
                {stats.registrationsByDay.map((item) => (
                  <div key={item.date}>
                    <span>{item.date.slice(5)}</span>
                    <b style={{ width: `${Math.max(8, (item.count / peakRegistrations) * 100)}%` }} />
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="admin-panel">
              <div className="panel-heading">
                <strong>最新消息</strong>
                <span>最近 8 条</span>
              </div>
              <div className="latest-list">
                {stats.latestMessages.map((message) => (
                  <div key={message.id}>
                    <strong>{message.name}</strong>
                    <span>{message.text}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="admin-panel wide">
              <div className="panel-heading">
                <strong>最近注册用户</strong>
                <span>角色 / 会话</span>
              </div>
              <div className="user-table">
                <div className="user-row head">
                  <span>用户</span>
                  <span>角色</span>
                  <span>注册时间</span>
                  <span>有效会话</span>
                </div>
                {stats.recentUsers.map((item) => (
                  <div key={item.id} className="user-row">
                    <span>
                      <strong>{item.displayName}</strong>
                      <small>@{item.username}</small>
                    </span>
                    <span>{item.isAdmin ? "管理员" : "成员"}</span>
                    <span>{new Date(item.createdAt).toLocaleDateString("zh-CN")}</span>
                    <span>{item.activeSessions}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      )}
    </main>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function AdminFact({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Workspace(props: {
  mode: RoomId;
  rooms: Record<RoomId, RoomPresentation>;
  now: Date;
  messages: ChatMessage[];
  online: OnlineSnapshot;
  policies: BootstrapPolicies;
  nickname: string;
  draft: string;
  sendError: string;
  privateMode: boolean;
  user: AuthUser | null;
  onMode: (mode: ModeId) => void;
  onNickname: (value: string) => void;
  onDraft: (value: string) => void;
  onSend: () => void;
  onPrivacy: () => void;
  onLogout: () => void;
}) {
  const room = props.rooms[props.mode];
  const online = props.online[props.mode] ?? defaultOnline(props.mode);

  return (
    <main className={`workspace workspace-${props.mode}`}>
      <header className="window-titlebar">
        <button className="icon-button" onClick={() => props.onMode("home")} title="返回工作台">
          <ChevronLeft size={17} />
        </button>
        <span className="file-title">{room.file}</span>
        <div className="titlebar-actions">
          <SystemStatus now={props.now} compact />
        </div>
      </header>

      <nav className="menu-strip" aria-label="主菜单">
        {["文件", "编辑", "视图", "插入", "格式", "工具", "协作", "窗口", "帮助"].map((item) => (
          <button key={item}>{item}</button>
        ))}
      </nav>

      <Toolbar mode={props.mode} onMode={props.onMode} onPrivacy={props.onPrivacy} privateMode={props.privateMode} />

      <div className="work-area">
        {props.mode === "word" && <WordCanvas messages={props.messages} privateMode={props.privateMode} />}
        {props.mode === "excel" && <ExcelCanvas messages={props.messages} privateMode={props.privateMode} />}
        {props.mode === "ppt" && <PptCanvas messages={props.messages} privateMode={props.privateMode} />}
        {props.mode === "ps" && <PsCanvas messages={props.messages} privateMode={props.privateMode} />}
        {!props.privateMode && (
          <aside className="collab-panel">
            <div className="panel-header">
              <div>
                <strong>{room.title}</strong>
                <span>{room.subtitle} {online}</span>
              </div>
              <UsersRound size={18} />
            </div>
            <label className="field-label">
              {props.user ? "账户昵称" : "发言身份"}
              <input
                value={props.user?.displayName || "未登录"}
                onChange={(event) => props.onNickname(event.target.value)}
                maxLength={12}
                disabled
              />
            </label>
            {props.user && (
              <button className="account-inline" onClick={props.onLogout}>
                <LogOut size={15} />
                退出 @{props.user.username}
              </button>
            )}
            <div className="topic-chips">
              {(props.mode === "excel" ? topics : quickTools).map((topic) => (
                <button key={topic}>{topic}</button>
              ))}
            </div>
            <div className="compose-row">
              <input
                value={props.draft}
                maxLength={props.policies.maxMessageLength}
                placeholder={props.user ? "输入协作备注..." : "登录后才能发言"}
                onChange={(event) => props.onDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") props.onSend();
                }}
                disabled={!props.user}
              />
              <button className="send-button" onClick={props.onSend} title="发送" disabled={!props.user}>
                <Send size={17} />
              </button>
            </div>
            {!props.user && (
              <div className="login-required">
                <ShieldCheck size={15} />
                <span>登录账户后才能发言</span>
                <button onClick={() => props.onMode("home")}>去登录</button>
              </div>
            )}
            {props.sendError && <p className="send-error">{props.sendError}</p>}
          </aside>
        )}
      </div>

      <footer className="statusbar">
        <span>页码 1/1</span>
        <span>{room.subtitle}: {online}</span>
        <span>自动保存: 开</span>
        <span>防窥: {props.privateMode ? "已启用" : "待命"}</span>
      </footer>
    </main>
  );
}

function errorText(error?: ApiError) {
  if (error === "login_required") return "登录后才能发言。";
  if (error === "admin_required") return "需要管理员权限。";
  if (error === "blocked_content") return "这条内容触发了安全过滤，换个说法再发。";
  if (error === "empty_message") return "协作备注不能为空。";
  if (error === "invalid_room") return "这个聊天室暂不可用。";
  return "发送失败，请稍后再试。";
}

function authErrorText(error?: ApiError) {
  if (error === "invalid_username") return "用户名至少 3 个字符。";
  if (error === "invalid_display_name") return "昵称不能为空。";
  if (error === "weak_password") return "密码至少 10 位，须包含大写字母、小写字母、数字和符号。";
  if (error === "password_too_long") return "密码太长，请控制在 128 位以内。";
  if (error === "password_contains_username") return "密码不能包含用户名。";
  if (error === "common_password") return "这个密码太常见，请换一个更安全的。";
  if (error === "username_taken") return "这个用户名已经被占用。";
  if (error === "invalid_credentials") return "用户名或密码不正确。";
  if (error === "rate_limited") return "尝试次数过多，请稍后再试。";
  return "账户操作失败，请稍后再试。";
}

function Toolbar({
  mode,
  onMode,
  onPrivacy,
  privateMode,
}: {
  mode: RoomId;
  onMode: (mode: ModeId) => void;
  onPrivacy: () => void;
  privateMode: boolean;
}) {
  return (
    <section className="toolbar" aria-label="工具栏">
      <div className="tool-group">
        <button title="保存"><Save size={17} /></button>
        <button title="打开"><FolderOpen size={17} /></button>
        <button title="复制"><Copy size={17} /></button>
      </div>
      <div className="tool-group mode-switch">
        <button className={mode === "word" ? "active" : ""} onClick={() => onMode("word")} title="文档">
          <FileText size={17} />
        </button>
        <button className={mode === "excel" ? "active" : ""} onClick={() => onMode("excel")} title="表格">
          <Table2 size={17} />
        </button>
        <button className={mode === "ppt" ? "active" : ""} onClick={() => onMode("ppt")} title="演示">
          <Presentation size={17} />
        </button>
        <button className={mode === "ps" ? "active" : ""} onClick={() => onMode("ps")} title="设计">
          <Palette size={17} />
        </button>
      </div>
      <div className="tool-group">
        <button title="搜索"><Search size={17} /></button>
        <button title="设置"><Settings size={17} /></button>
        <button className={privateMode ? "danger active" : "danger"} onClick={onPrivacy} title="一键防窥 Ctrl/Cmd + J">
          <EyeOff size={17} />
        </button>
      </div>
    </section>
  );
}

function WordCanvas({ messages, privateMode }: { messages: ChatMessage[]; privateMode: boolean }) {
  return (
    <section className="document-stage">
      <div className="ruler horizontal" />
      <article className="paper">
        {privateMode ? (
          <div className="empty-caret" />
        ) : (
          <>
            <h2>周工作进展汇总</h2>
            <p className="doc-line">本周围绕项目协作、素材整理与流程优化展开，以下为实时协作备注。</p>
            <div className="doc-comments">
              {messages.map((message) => (
                <p key={message.id}>
                  <span>{message.time}</span>
                  <strong>{message.name}</strong>
                  {message.text}
                </p>
              ))}
            </div>
          </>
        )}
      </article>
    </section>
  );
}

function ExcelCanvas({ messages, privateMode }: { messages: ChatMessage[]; privateMode: boolean }) {
  return (
    <section className="sheet-stage">
      <div className="formula-bar">fx&nbsp;&nbsp;=WORKDAY_STATUS()</div>
      <div className="sheet-grid">
        {Array.from({ length: 48 }).map((_, index) => {
          const message = messages[index % Math.max(messages.length, 1)];
          return (
            <div key={index} className={index % 7 === 0 ? "sheet-cell topic-cell" : "sheet-cell"}>
              {!privateMode && index < messages.length * 2 ? (
                <>
                  <b>{message?.tag}</b>
                  <span>{message?.text}</span>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PptCanvas({ messages, privateMode }: { messages: ChatMessage[]; privateMode: boolean }) {
  return (
    <section className="ppt-stage">
      <aside className="slide-list">
        {[1, 2, 3, 4].map((item) => <div key={item} className="slide-thumb">{item}</div>)}
      </aside>
      <div className="slide-canvas">
        {privateMode ? null : (
          <div className="meme-board">
            {messages.map((message) => (
              <div key={message.id}>
                <Image size={20} />
                <strong>{message.tag}</strong>
                <span>{message.text}</span>
              </div>
            ))}
            <div>
              <Sparkles size={20} />
              <strong>素材</strong>
              <span>工位静悄悄，塘里真热闹。</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function PsCanvas({ messages, privateMode }: { messages: ChatMessage[]; privateMode: boolean }) {
  return (
    <section className="ps-stage">
      <aside className="ps-tools">
        {[MousePointer2, Brush, Columns3, MessageSquareText, Palette, Search].map((Icon, index) => (
          <button key={index}><Icon size={18} /></button>
        ))}
      </aside>
      <div className="ps-canvas">
        {!privateMode && messages.map((message, index) => (
          <div key={message.id} className="layer-note" style={{ top: `${22 + index * 19}%`, left: `${18 + index * 9}%` }}>
            <span>{message.name}</span>
            {message.text}
          </div>
        ))}
      </div>
      <aside className="layers-panel">
        <div className="panel-title"><Layers3 size={16} /> 图层</div>
        {(privateMode ? ["背景", "画布"] : ["背景", "备注", "素材", "参考", "导出"]).map((name) => (
          <div key={name} className="layer-row">
            <EyeOff size={13} />
            <span>{name}</span>
          </div>
        ))}
      </aside>
    </section>
  );
}

function SystemStatus({ now, compact = false }: { now: Date; compact?: boolean }) {
  return (
    <div className={compact ? "system-status compact" : "system-status"}>
      <span><Wifi size={15} /> 内网</span>
      <span><Clock3 size={15} /> {now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
      {!compact && <span><TerminalSquare size={15} /> v0.1.0</span>}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
