import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, type Socket } from "socket.io-client";
import {
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
  UsersRound,
  Wifi,
} from "lucide-react";
import "./styles.css";

type ModeId = "home" | "word" | "excel" | "ppt" | "ps";
type RoomId = Exclude<ModeId, "home">;

type Message = {
  id: number;
  room: RoomId;
  name: string;
  text: string;
  time: string;
  tag?: string;
};

type ServerToClientEvents = {
  "message:new": (message: Message) => void;
  "online:update": (online: Partial<Record<RoomId, number>>) => void;
};

type ClientToServerEvents = {
  "room:join": (room: RoomId) => void;
  "message:create": (
    payload: Pick<Message, "room" | "name" | "text"> & { tag?: string },
    acknowledge?: (result: { ok: boolean; error?: string; message?: Message }) => void,
  ) => void;
};

const rooms: Record<RoomId, { title: string; file: string; subtitle: string }> = {
  word: {
    title: "闲聊大厅",
    file: "工作汇报.docx",
    subtitle: "文档协作人数",
  },
  excel: {
    title: "话题分区广场",
    file: "数据统计表.xlsx",
    subtitle: "表格协作人数",
  },
  ppt: {
    title: "趣味内容广场",
    file: "会议材料.pptx",
    subtitle: "演示浏览人数",
  },
  ps: {
    title: "设计专属聊天室",
    file: "视觉方案.psd",
    subtitle: "画布浏览人数",
  },
};

const seedMessages: Message[] = [
  { id: 1, room: "word", name: "匿名锦鲤", text: "今天的日报已经写到像年度总结了。", time: "10:18", tag: "游水" },
  { id: 2, room: "word", name: "临时协作者", text: "有没有三分钟恢复精神的办法，除了下班。", time: "10:21", tag: "树洞" },
  { id: 3, room: "excel", name: "A17", text: "午饭投票：麻辣烫 3 票，轻食 0 票。", time: "10:27", tag: "美食" },
  { id: 4, room: "excel", name: "C04", text: "推荐一个周末短剧，节奏快，不费脑。", time: "10:29", tag: "影视" },
  { id: 5, room: "ppt", name: "第 6 页备注", text: "新表情包已喂鱼：老板说简单改改系列。", time: "10:32", tag: "喂鱼" },
  { id: 6, room: "ps", name: "图层 12", text: "甲方说要高级灰，但不要灰。", time: "10:35", tag: "甲方" },
  { id: 7, room: "ps", name: "蒙版用户", text: "有无免费商用字体清单，救一下交付。", time: "10:41", tag: "素材" },
];

const topics = ["摸鱼段子", "美食分享", "影视推荐", "职场树洞", "日常好物", "下班倒计时"];
const quickTools = ["牛维斯摆烂规划", "扫雷", "华容道", "松弛文案", "表情包库"];

function App() {
  const [mode, setMode] = useState<ModeId>("home");
  const [messages, setMessages] = useState(seedMessages);
  const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [online, setOnline] = useState<Partial<Record<RoomId, number>>>({});
  const [nickname, setNickname] = useState("匿名小鱼");
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState("");
  const [privateMode, setPrivateMode] = useState(false);
  const [now, setNow] = useState(new Date());

  const activeRoom = mode === "home" ? undefined : rooms[mode];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch("/api/bootstrap")
      .then((response) => response.json())
      .then((data) => {
        if (!mounted) return;
        if (Array.isArray(data.messages)) setMessages(data.messages);
        if (data.online) setOnline(data.online);
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
  }, []);

  useEffect(() => {
    if (activeRoom) document.title = activeRoom.file;
    else document.title = "职场协作综合工作台";
  }, [activeRoom]);

  useEffect(() => {
    if (mode !== "home") socket?.emit("room:join", mode);
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
    if (mode === "home") return [];
    return messages.filter((message) => message.room === mode);
  }, [messages, mode]);

  const sendMessage = () => {
    if (mode === "home" || !draft.trim()) return;
    const text = draft.trim();
    setSendError("");
    setDraft("");

    if (socket?.connected) {
      socket.emit(
        "message:create",
        {
          room: mode,
          name: nickname || "匿名小鱼",
          text,
          tag: mode === "ps" ? "图层" : "游水",
        },
        (result) => {
          if (!result.ok) setSendError(errorText(result.error));
        },
      );
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        room: mode,
        name: nickname || "匿名小鱼",
        text,
        time: now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        tag: mode === "ps" ? "图层" : "游水",
      },
    ]);
  };

  return (
    <div className={`app ${mode === "ps" ? "theme-dark" : "theme-office"}`}>
      {mode === "home" ? (
        <Home now={now} onEnter={setMode} />
      ) : (
        <Workspace
          mode={mode}
          now={now}
          messages={visibleMessages}
          nickname={nickname}
          draft={draft}
          online={online}
          sendError={sendError}
          privateMode={privateMode}
          onMode={setMode}
          onNickname={setNickname}
          onDraft={setDraft}
          onSend={sendMessage}
          onPrivacy={() => setPrivateMode((value) => !value)}
        />
      )}
    </div>
  );
}

function Home({ now, onEnter }: { now: Date; onEnter: (mode: ModeId) => void }) {
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

function Workspace(props: {
  mode: Exclude<ModeId, "home">;
  now: Date;
  messages: Message[];
  online: Partial<Record<RoomId, number>>;
  nickname: string;
  draft: string;
  sendError: string;
  privateMode: boolean;
  onMode: (mode: ModeId) => void;
  onNickname: (value: string) => void;
  onDraft: (value: string) => void;
  onSend: () => void;
  onPrivacy: () => void;
}) {
  const room = rooms[props.mode];
  const online = props.online[props.mode] ?? 19 + props.mode.length * 3;

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
              临时昵称
              <input value={props.nickname} onChange={(event) => props.onNickname(event.target.value)} maxLength={12} />
            </label>
            <div className="topic-chips">
              {(props.mode === "excel" ? topics : quickTools).map((topic) => (
                <button key={topic}>{topic}</button>
              ))}
            </div>
            <div className="compose-row">
              <input
                value={props.draft}
                placeholder="输入协作备注..."
                onChange={(event) => props.onDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") props.onSend();
                }}
              />
              <button className="send-button" onClick={props.onSend} title="发送">
                <Send size={17} />
              </button>
            </div>
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

function errorText(error?: string) {
  if (error === "blocked_content") return "这条内容触发了安全过滤，换个说法再发。";
  if (error === "empty_message") return "协作备注不能为空。";
  return "发送失败，请稍后再试。";
}

function Toolbar({
  mode,
  onMode,
  onPrivacy,
  privateMode,
}: {
  mode: Exclude<ModeId, "home">;
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

function WordCanvas({ messages, privateMode }: { messages: Message[]; privateMode: boolean }) {
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

function ExcelCanvas({ messages, privateMode }: { messages: Message[]; privateMode: boolean }) {
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

function PptCanvas({ messages, privateMode }: { messages: Message[]; privateMode: boolean }) {
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

function PsCanvas({ messages, privateMode }: { messages: Message[]; privateMode: boolean }) {
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
