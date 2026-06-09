import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, type Socket } from "socket.io-client";
import {
  Activity,
  BarChart3,
  BellOff,
  Brush,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
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
  RefreshCw,
  Save,
  Search,
  Send,
  Share2,
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
import { stickerById, stickerCategories, stickers, type StickerCategory } from "./stickers";
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
const slackMoods = ["脑子冒烟", "还能坚持", "心已下班"] as const;
const slackLoads = ["事情不多", "有点忙", "忙到离谱"] as const;
const mineScenarios = ["群聊发言", "催进度", "请假", "工作汇报", "拒绝加班"] as const;

type SlackMood = typeof slackMoods[number];
type SlackLoad = typeof slackLoads[number];
type SlackTask = { time: string; title: string; detail: string };
type SlackPlan = { score: number; title: string; comment: string; badge: string; tasks: SlackTask[] };
type MineScenario = typeof mineScenarios[number];
type MineRisk = "低" | "中" | "高";
type MineItem = {
  title: string;
  signal: string;
  advice: string;
  reply: string;
  risk: MineRisk;
};

const mineScenarioData: Record<MineScenario, { context: string; items: MineItem[] }> = {
  "群聊发言": {
    context: "消息发出去之前，先检查语气、边界和围观压力。",
    items: [
      { title: "只说结论", signal: "缺少背景，容易被理解成甩锅或突然施压。", advice: "补一句背景和你已经做过的动作。", reply: "同步一下背景：目前我已完成前置确认，现需要大家帮忙确认下一步安排。", risk: "中" },
      { title: "公开点名", signal: "在大群直接点人，容易让协作变成公开问责。", advice: "先描述事项，再温和邀请相关人补充。", reply: "这块可能需要相关同学补充一下进展，方便时帮忙同步即可。", risk: "高" },
      { title: "连续追问", signal: "短时间多条消息会放大催促感。", advice: "合并成一条，给出明确回复时点。", reply: "信息合并在这里，今天下班前能否帮忙确认一下？如有卡点也可以直接说。", risk: "中" },
      { title: "玩梗过界", signal: "熟人语境里的玩笑，在群聊中可能失去上下文。", advice: "保留轻松感，但不要指向个人能力或失误。", reply: "今天这个进度有点惊险，咱们一起把最后一段稳稳收住。", risk: "低" },
      { title: "情绪上头", signal: "反问句和感叹号容易被当成攻击。", advice: "先写事实，再写影响，最后提出请求。", reply: "目前还缺少这份信息，会影响后续排期。麻烦确认一下预计提供时间。", risk: "高" },
      { title: "范围不清", signal: "“大家看看”通常意味着没人知道该做什么。", advice: "明确谁看、看什么、何时反馈。", reply: "请负责接口和设计的同学重点看标注处，明天 12 点前反馈即可。", risk: "中" },
    ],
  },
  "催进度": {
    context: "催的是事情，不是审判同事。把时间、影响和求助说清楚。",
    items: [
      { title: "灵魂拷问", signal: "“怎么还没好”只制造压力，没有提供信息。", advice: "询问当前状态与预计时间。", reply: "想确认一下目前进展和预计完成时间，我好同步调整后续安排。", risk: "高" },
      { title: "越级催促", signal: "直接抄送上级会迅速提高对抗感。", advice: "先私下确认卡点，必要时再共同升级。", reply: "如果当前有资源或决策卡点，我们可以一起同步相关负责人协助推进。", risk: "高" },
      { title: "假装不急", signal: "嘴上说不急，紧接着追问，会让人更难判断优先级。", advice: "坦诚说明真实截止时间。", reply: "这项需要在周三 15 点前完成，能否在明天上午给我一个进度判断？", risk: "中" },
      { title: "不给出口", signal: "只要求按时完成，却不允许反馈困难。", advice: "主动询问卡点和所需支持。", reply: "如果按当前时间有风险，请直接告诉我卡点，我来协调资源或调整范围。", risk: "中" },
      { title: "多头轰炸", signal: "私聊、群聊、电话同时追，会打断实际工作。", advice: "选一个渠道，约定下一次同步节点。", reply: "先在这里统一同步，今天 16 点我们再对一次状态，期间不用重复回复。", risk: "低" },
      { title: "模糊截止", signal: "“尽快”无法形成共同预期。", advice: "给出具体时间并说明原因。", reply: "为了赶上明天的评审，麻烦今天 17 点前给到可预览版本。", risk: "中" },
    ],
  },
  "请假": {
    context: "请假不是答辩。信息够用、交接明确、隐私适度即可。",
    items: [
      { title: "过度解释", signal: "披露太多私人细节，反而增加沟通负担。", advice: "说明时间、类型和工作安排即可。", reply: "我计划周五请假一天，手头事项会在周四完成交接，紧急情况可电话联系。", risk: "低" },
      { title: "临时消失", signal: "没有交接人和状态说明，会让团队被动补位。", advice: "列出进行中事项和接手人。", reply: "今天下午请假，A 项已交给小林跟进，B 项资料已放在共享目录。", risk: "高" },
      { title: "请求式卑微", signal: "反复道歉会削弱信息重点，也容易形成不必要承诺。", advice: "礼貌提出安排，不做情绪补偿。", reply: "申请下周一上午请假，相关会议已调整，下午恢复在线。", risk: "中" },
      { title: "时间含糊", signal: "“晚点回来”不利于同事安排协作。", advice: "给出预计离线和恢复时间。", reply: "我今天 14:00 至 17:00 离线，17:30 后可以处理消息。", risk: "中" },
      { title: "强行在线", signal: "请假期间承诺随时响应，休息和交接都会失效。", advice: "只保留真正紧急的联系方式。", reply: "请假期间不定时查看消息，如遇影响上线的紧急事项请电话联系。", risk: "低" },
      { title: "群里首发", signal: "未先与直接负责人同步，可能造成流程误解。", advice: "先确认，再向协作群同步安排。", reply: "已与负责人确认，我将在周三请假一天，相关交接如下。", risk: "中" },
    ],
  },
  "工作汇报": {
    context: "汇报不是流水账。让对方迅速看到结果、风险和下一步。",
    items: [
      { title: "过程堆砌", signal: "大量动作没有结果，听众难以判断价值。", advice: "先说结果，再补关键过程。", reply: "本周已完成首版并通过内部评审，主要调整了流程和异常提示。", risk: "中" },
      { title: "只报喜讯", signal: "隐藏风险会让问题在最后时刻集中爆发。", advice: "同步风险、影响和解决方案。", reply: "主流程按期完成；数据接口晚一天，已用模拟数据保证评审不受影响。", risk: "高" },
      { title: "没有数字", signal: "“效果不错”缺少可判断的依据。", advice: "补充一到两个关键指标。", reply: "上线后一周，完成率从 62% 提升到 74%，平均操作时长下降 18%。", risk: "中" },
      { title: "责任漂移", signal: "反复强调他人问题，会削弱你对项目的掌控感。", advice: "客观说明依赖，并给出推进动作。", reply: "当前依赖法务确认，我已整理争议点，今天会组织一次集中确认。", risk: "高" },
      { title: "下一步空白", signal: "汇报结束后没人知道接下来做什么。", advice: "明确下一动作、负责人和时间。", reply: "下一步由我在周四前完成优化版，周五安排第二轮验证。", risk: "低" },
      { title: "细节失控", signal: "所有信息同等展开，会淹没真正的决策点。", advice: "正文只放结论，把细节放附件。", reply: "需要确认的只有两点：上线时间和资源安排，详细记录见附件。", risk: "中" },
    ],
  },
  "拒绝加班": {
    context: "拒绝的是不合理安排，不是合作本身。提供边界，也提供选项。",
    items: [
      { title: "直接硬顶", signal: "只有“不行”会让对方听不到你的实际限制。", advice: "说明客观约束，并给出可执行选项。", reply: "今晚无法继续处理，我可以明早优先完成，或现在先交付最关键的部分。", risk: "高" },
      { title: "含糊答应", signal: "勉强说“尽量”容易被当成已经承诺。", advice: "明确可完成范围和时间。", reply: "今晚能完成框架，完整版本需要明天下午给到。", risk: "高" },
      { title: "情绪算账", signal: "翻旧账会让当前问题升级成人际冲突。", advice: "只讨论本次安排和长期改进。", reply: "这次我先按优先级处理；后续建议提前一天确认需求，避免临时加班。", risk: "中" },
      { title: "没有取舍", signal: "新增任务却不调整旧任务，最终所有承诺都失真。", advice: "请对方明确优先级。", reply: "如果今晚优先做这项，原定的 A 任务会顺延，请帮忙确认取舍。", risk: "中" },
      { title: "私人辩护", signal: "过度证明私人安排合理，会让边界变成可谈判事项。", advice: "简洁说明无法加班，无需展开隐私。", reply: "今晚已有不可调整的安排，无法加班。我会在明早九点继续推进。", risk: "低" },
      { title: "群里对抗", signal: "公开拒绝容易让双方都难以下台。", advice: "私下沟通限制，再公开同步结果。", reply: "我先私下和你确认一下今晚的范围，确认后我在群里同步交付安排。", risk: "中" },
    ],
  },
};

const slackTaskPool: Record<SlackLoad, Array<Omit<SlackTask, "time">>> = {
  "事情不多": [
    { title: "战略性巡游", detail: "带着水杯绕工位一圈，顺便确认世界还在运转。" },
    { title: "桌面考古", detail: "整理三个文件，再郑重地把其中一个改名为“最终版”。" },
    { title: "窗外调研", detail: "远眺两分钟，给眼睛和脑子同时松个绑。" },
    { title: "茶水间会晤", detail: "补水并进行一次不超过五分钟的友好交流。" },
  ],
  "有点忙": [
    { title: "五分钟缓存", detail: "暂停新任务五分钟，只处理手头这一件事。" },
    { title: "Excel 凝视术", detail: "打开正在做的文件，先圈出今天真正要完成的三格。" },
    { title: "消息静音窗口", detail: "关闭提醒十分钟，给注意力划一块临时保护区。" },
    { title: "低电量伸展", detail: "离开椅背伸展肩颈，回来后只推进最小一步。" },
  ],
  "忙到离谱": [
    { title: "任务急救分诊", detail: "把任务分成现在、稍后、不归我，先救最要紧的一个。" },
    { title: "十分钟免打扰", detail: "暂时静音消息，用十分钟结束一个最小交付物。" },
    { title: "合理求援", detail: "把卡点写成一句话，向最合适的人发出明确求助。" },
    { title: "下班线保卫战", detail: "删掉一个非必要动作，保住今天最基本的休息时间。" },
  ],
};

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

  const sendSticker = (stickerId: string) => {
    if (mode === "home" || mode === "admin" || !user) {
      setSendError("登录后才能发表情。");
      return;
    }
    const sticker = stickerById[stickerId];
    if (!sticker || !socket?.connected) {
      setSendError("实时服务连接中，请稍后再发。");
      return;
    }
    setSendError("");
    socket.emit(
      "message:create",
      {
        room: mode,
        text: sticker.label,
        tag: "表情",
        kind: "sticker",
        stickerId,
      },
      (result) => {
        if (!result.ok) setSendError(errorText(result.error));
      },
    );
  };

  const shareSlackPlan = (text: string) => {
    if (mode === "home" || mode === "admin" || !user) {
      setSendError("登录后才能分享计划。");
      return;
    }
    if (!socket?.connected) {
      setSendError("实时服务连接中，请稍后再分享。");
      return;
    }
    setSendError("");
    socket.emit(
      "message:create",
      { room: mode, text, tag: "摆烂" },
      (result) => {
        if (!result.ok) setSendError(errorText(result.error));
      },
    );
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
          onSendSticker={sendSticker}
          onShareSlackPlan={shareSlackPlan}
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
  onSendSticker: (stickerId: string) => void;
  onShareSlackPlan: (text: string) => void;
  onPrivacy: () => void;
  onLogout: () => void;
}) {
  const room = props.rooms[props.mode];
  const online = props.online[props.mode] ?? defaultOnline(props.mode);
  const [stickerPanelOpen, setStickerPanelOpen] = useState(false);
  const [slackPanelOpen, setSlackPanelOpen] = useState(false);
  const [minePanelOpen, setMinePanelOpen] = useState(false);
  const [stickerCategory, setStickerCategory] = useState<"全部" | StickerCategory>("全部");
  const [stickerQuery, setStickerQuery] = useState("");
  const filteredStickers = useMemo(() => {
    const query = stickerQuery.trim().toLowerCase();
    return stickers.filter((sticker) => {
      const matchesCategory = stickerCategory === "全部" || sticker.category === stickerCategory;
      const haystack = [sticker.label, sticker.caption, ...sticker.keywords].join(" ").toLowerCase();
      return matchesCategory && (!query || haystack.includes(query));
    });
  }, [stickerCategory, stickerQuery]);

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
                <button
                  key={topic}
                  onClick={
                    topic === "表情包库"
                      ? () => {
                          setSlackPanelOpen(false);
                          setMinePanelOpen(false);
                          setStickerPanelOpen((value) => !value);
                        }
                      : topic === "牛维斯摆烂规划"
                        ? () => {
                            setStickerPanelOpen(false);
                            setMinePanelOpen(false);
                            setSlackPanelOpen((value) => !value);
                          }
                        : topic === "扫雷"
                          ? () => {
                              setStickerPanelOpen(false);
                              setSlackPanelOpen(false);
                              setMinePanelOpen((value) => !value);
                            }
                        : undefined
                  }
                >
                  {topic}
                </button>
              ))}
            </div>
            <div className="compose-row">
              <button
                className={stickerPanelOpen ? "sticker-toggle active" : "sticker-toggle"}
                onClick={() => {
                  setSlackPanelOpen(false);
                  setMinePanelOpen(false);
                  setStickerPanelOpen((value) => !value);
                }}
                title="表情包库"
                disabled={!props.user}
              >
                <Image size={17} />
              </button>
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
            {slackPanelOpen && props.user && (
              <SlackPlanner
                now={props.now}
                onShare={(text) => {
                  props.onShareSlackPlan(text);
                  setSlackPanelOpen(false);
                }}
              />
            )}
            {minePanelOpen && props.user && (
              <WorkplaceMinefield
                onShare={(text) => {
                  props.onShareSlackPlan(text);
                  setMinePanelOpen(false);
                }}
              />
            )}
            {stickerPanelOpen && props.user && (
              <section className="sticker-picker" aria-label="表情包库">
                <div className="sticker-picker-head">
                  <strong>鱼塘表情包</strong>
                  <span>{stickers.length} 个</span>
                </div>
                <label className="sticker-search">
                  <Search size={14} />
                  <input
                    value={stickerQuery}
                    onChange={(event) => setStickerQuery(event.target.value)}
                    placeholder="搜梗、情绪或场景"
                  />
                </label>
                <div className="sticker-tabs">
                  {stickerCategories.map((category) => (
                    <button
                      key={category}
                      className={category === stickerCategory ? "active" : ""}
                      onClick={() => setStickerCategory(category)}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                <div className="sticker-grid">
                  {filteredStickers.map((sticker) => (
                    <button
                      key={sticker.id}
                      className={`sticker-option tone-${sticker.tone}`}
                      onClick={() => {
                        props.onSendSticker(sticker.id);
                        setStickerPanelOpen(false);
                      }}
                      title={sticker.caption}
                    >
                      <span className="sticker-emoji">{sticker.emoji}</span>
                      <strong>{sticker.label}</strong>
                      <small>{sticker.caption}</small>
                    </button>
                  ))}
                </div>
                {filteredStickers.length === 0 && <p className="sticker-empty">这片水域暂时没搜到，换个词试试。</p>}
              </section>
            )}
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

function SlackPlanner({
  now,
  onShare,
}: {
  now: Date;
  onShare: (text: string) => void;
}) {
  const [planNow] = useState(() => now);
  const [mood, setMood] = useState<SlackMood>("脑子冒烟");
  const [load, setLoad] = useState<SlackLoad>("有点忙");
  const [offTime, setOffTime] = useState("18:00");
  const [generation, setGeneration] = useState(0);
  const [completed, setCompleted] = useState<number[]>([]);
  const plan = useMemo(
    () => createSlackPlan(planNow, mood, load, offTime, generation),
    [generation, load, mood, offTime, planNow],
  );
  const allDone = completed.length === plan.tasks.length;

  const regenerate = () => {
    setGeneration((value) => value + 1);
    setCompleted([]);
  };

  const toggleTask = (index: number) => {
    setCompleted((current) => (
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index]
    ));
  };

  return (
    <section className="slack-planner" aria-label="牛维斯摆烂规划">
      <div className="slack-head">
        <span className="slack-avatar"><Coffee size={22} /></span>
        <div>
          <strong>牛维斯摆烂规划</strong>
          <small>科学喘气，低风险续航</small>
        </div>
        <span className="slack-score">{plan.score}</span>
      </div>

      <div className="slack-control">
        <span>当前状态</span>
        <div className="slack-segments">
          {slackMoods.map((item) => (
            <button
              key={item}
              className={mood === item ? "active" : ""}
              onClick={() => {
                setMood(item);
                setCompleted([]);
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="slack-control">
        <span>工作负荷</span>
        <div className="slack-segments">
          {slackLoads.map((item) => (
            <button
              key={item}
              className={load === item ? "active" : ""}
              onClick={() => {
                setLoad(item);
                setCompleted([]);
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <label className="slack-time">
        <span>计划下班</span>
        <input
          type="time"
          value={offTime}
          onChange={(event) => {
            setOffTime(event.target.value);
            setCompleted([]);
          }}
        />
      </label>

      <div className="slack-summary">
        <span>今日摆烂指数 {plan.score}</span>
        <strong>{plan.title}</strong>
        <p>{plan.comment}</p>
      </div>

      <div className="slack-tasks">
        {plan.tasks.map((task, index) => {
          const isDone = completed.includes(index);
          return (
            <button key={`${generation}-${task.time}-${task.title}`} className={isDone ? "slack-task done" : "slack-task"} onClick={() => toggleTask(index)}>
              <span className="task-check">{isDone ? <Check size={14} /> : index + 1}</span>
              <span className="task-time">{task.time}</span>
              <span className="task-copy">
                <strong>{task.title}</strong>
                <small>{task.detail}</small>
              </span>
            </button>
          );
        })}
      </div>

      <div className={allDone ? "slack-badge earned" : "slack-badge"}>
        <Sparkles size={15} />
        <span>{allDone ? `勋章已解锁：${plan.badge}` : `完成三项解锁“${plan.badge}”`}</span>
      </div>

      <div className="slack-actions">
        <button onClick={regenerate} title="重新生成">
          <RefreshCw size={15} />
          换一套
        </button>
        <button
          className="primary"
          onClick={() => onShare(formatSlackPlanForChat(plan))}
          title="分享到当前聊天室"
        >
          <Share2 size={15} />
          分享到鱼塘
        </button>
      </div>
    </section>
  );
}

function WorkplaceMinefield({ onShare }: { onShare: (text: string) => void }) {
  const [scenario, setScenario] = useState<MineScenario>("群聊发言");
  const [revealed, setRevealed] = useState<number[]>([]);
  const [copied, setCopied] = useState<number | null>(null);
  const data = mineScenarioData[scenario];
  const cleared = revealed.length;
  const riskScore = data.items.reduce((total, item) => total + ({ "低": 8, "中": 14, "高": 22 }[item.risk]), 0);

  const changeScenario = (next: MineScenario) => {
    setScenario(next);
    setRevealed([]);
    setCopied(null);
  };

  const reveal = (index: number) => {
    setRevealed((current) => current.includes(index) ? current : [...current, index]);
  };

  const copyReply = async (index: number, reply: string) => {
    await navigator.clipboard.writeText(reply);
    setCopied(index);
    window.setTimeout(() => setCopied((current) => current === index ? null : current), 1600);
  };

  return (
    <section className="minefield" aria-label="职场扫雷">
      <div className="mine-head">
        <span className="mine-avatar"><ShieldCheck size={22} /></span>
        <div>
          <strong>职场扫雷</strong>
          <small>发出去之前，先替你踩一遍</small>
        </div>
        <span className="mine-progress">{cleared}/6</span>
      </div>

      <div className="mine-scenarios">
        {mineScenarios.map((item) => (
          <button key={item} className={scenario === item ? "active" : ""} onClick={() => changeScenario(item)}>
            {item}
          </button>
        ))}
      </div>

      <div className="mine-brief">
        <span>风险预判 · {riskScore} 分</span>
        <p>{data.context}</p>
      </div>

      <div className="mine-grid">
        {data.items.map((item, index) => {
          const isRevealed = revealed.includes(index);
          return (
            <article key={item.title} className={isRevealed ? `mine-card revealed risk-${item.risk}` : "mine-card"}>
              {!isRevealed ? (
                <button className="mine-cover" onClick={() => reveal(index)} aria-label={`排查第 ${index + 1} 格`}>
                  <span>{index + 1}</span>
                  <small>点击排雷</small>
                </button>
              ) : (
                <>
                  <div className="mine-card-title">
                    <strong>{item.title}</strong>
                    <span>{item.risk}风险</span>
                  </div>
                  <p>{item.signal}</p>
                  <small>{item.advice}</small>
                  <div className="mine-reply">
                    <span>{item.reply}</span>
                    <button onClick={() => copyReply(index, item.reply)} title="复制稳妥表达">
                      {copied === index ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>

      <div className={cleared === data.items.length ? "mine-report complete" : "mine-report"}>
        <Activity size={15} />
        <span>{cleared === data.items.length ? "排雷完成：可以带着边界感出发了" : `已排除 ${cleared} 项，剩余 ${data.items.length - cleared} 项待检查`}</span>
      </div>

      <div className="mine-actions">
        <button onClick={() => {
          setRevealed([]);
          setCopied(null);
        }}>
          <RefreshCw size={15} />
          重扫
        </button>
        <button className="primary" onClick={() => onShare(formatMineReportForChat(scenario, data.items))}>
          <Share2 size={15} />
          分享排雷报告
        </button>
      </div>
    </section>
  );
}

function formatMineReportForChat(scenario: MineScenario, items: MineItem[]) {
  const highRisks = items.filter((item) => item.risk === "高").map((item) => item.title).join("、");
  return `职场扫雷报告｜${scenario}：重点避开“${highRisks}”。推荐表达：${items.find((item) => item.risk === "高")?.reply}`.slice(0, 180);
}

function createSlackPlan(now: Date, mood: SlackMood, load: SlackLoad, offTime: string, generation: number): SlackPlan {
  const loadScore = { "事情不多": 12, "有点忙": 24, "忙到离谱": 38 }[load];
  const moodScore = { "还能坚持": 12, "脑子冒烟": 25, "心已下班": 31 }[mood];
  const score = Math.min(96, 28 + loadScore + moodScore + (generation % 6));
  const pool = slackTaskPool[load];
  const start = (generation + mood.length + load.length) % pool.length;
  const selected = Array.from({ length: 3 }, (_, index) => pool[(start + index) % pool.length]);
  const times = slackPlanTimes(now, offTime);
  const titles = score >= 85
    ? ["建议立即开启省电模式", "今天适合稳住，不适合硬刚"]
    : score >= 68
      ? ["可以摆，但要摆得有章法", "给大脑留一点缓存空间"]
      : ["状态尚可，批准小摆一下", "劳逸结合，水到渠成"];
  const comments: Record<SlackMood, string> = {
    "脑子冒烟": "牛维斯建议：先降温，再输出。硬撑不会让进度条跑得更快。",
    "还能坚持": "牛维斯建议：趁电量尚可，把休息安排进流程，别等自动关机。",
    "心已下班": "牛维斯建议：身体留在工位，任务缩到最小，灵魂不必强制返岗。",
  };
  const badges = load === "忙到离谱"
    ? ["任务分诊专家", "下班线守门员"]
    : load === "有点忙"
      ? ["工位续航大师", "注意力保护员"]
      : ["战略巡游专员", "带薪呼吸冠军"];

  return {
    score,
    title: titles[generation % titles.length],
    comment: comments[mood],
    badge: badges[generation % badges.length],
    tasks: selected.map((task, index) => ({ ...task, time: times[index] })),
  };
}

function slackPlanTimes(now: Date, offTime: string) {
  const [hours, minutes] = offTime.split(":").map(Number);
  const end = new Date(now);
  end.setHours(Number.isFinite(hours) ? hours : 18, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  if (end.getTime() <= now.getTime() + 10 * 60_000) end.setTime(now.getTime() + 2 * 60 * 60_000);
  const available = end.getTime() - now.getTime();
  return [0.16, 0.52, 0.86].map((ratio) => {
    const date = new Date(now.getTime() + available * ratio);
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  });
}

function formatSlackPlanForChat(plan: SlackPlan) {
  const tasks = plan.tasks.map((task) => `${task.time} ${task.title}`).join("；");
  return `牛维斯今日摆烂计划｜指数 ${plan.score}：${tasks}。完成可解锁“${plan.badge}”。`.slice(0, 180);
}

function errorText(error?: ApiError) {
  if (error === "login_required") return "登录后才能发言。";
  if (error === "admin_required") return "需要管理员权限。";
  if (error === "blocked_content") return "这条内容触发了安全过滤，换个说法再发。";
  if (error === "empty_message") return "协作备注不能为空。";
  if (error === "invalid_room") return "这个聊天室暂不可用。";
  if (error === "invalid_sticker") return "这个表情暂不可用，请刷新后重试。";
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
                  <MessageContent message={message} compact />
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
                  {message && <MessageContent message={message} compact />}
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
                <MessageContent message={message} />
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
            <MessageContent message={message} compact />
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

function MessageContent({ message, compact = false }: { message: ChatMessage; compact?: boolean }) {
  const sticker = message.stickerId ? stickerById[message.stickerId] : undefined;
  if (message.kind !== "sticker" || !sticker) return <span>{message.text}</span>;

  return (
    <span className={`message-sticker tone-${sticker.tone}${compact ? " compact" : ""}`}>
      <span className="message-sticker-emoji">{sticker.emoji}</span>
      <span>
        <strong>{sticker.label}</strong>
        {!compact && <small>{sticker.caption}</small>}
      </span>
    </span>
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
