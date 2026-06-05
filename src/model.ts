export type ModeId = "home" | "admin" | "word" | "excel" | "ppt" | "ps";
export type RoomId = Exclude<ModeId, "home" | "admin">;

export type ChatMessage = {
  id: number;
  room: RoomId;
  name: string;
  text: string;
  time: string;
  tag?: string;
};

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
};

export type RoomLabels = Record<RoomId, string>;
export type OnlineSnapshot = Partial<Record<RoomId, number>>;

export type BootstrapPolicies = {
  anonymous: boolean;
  maxMessageLength: number;
  mutedNotifications: boolean;
};

export type BootstrapModel = {
  rooms: RoomLabels;
  messages: ChatMessage[];
  online: OnlineSnapshot;
  user: AuthUser | null;
  policies: BootstrapPolicies;
};

export type AuthMode = "login" | "register";

export type AuthForm = {
  username: string;
  displayName: string;
  password: string;
};

export type ApiError =
  | "blocked_content"
  | "common_password"
  | "empty_message"
  | "invalid_credentials"
  | "invalid_display_name"
  | "invalid_room"
  | "invalid_username"
  | "admin_required"
  | "login_required"
  | "password_contains_username"
  | "password_too_long"
  | "rate_limited"
  | "username_taken"
  | "weak_password";

export type AuthResponse = {
  ok?: boolean;
  user?: AuthUser | null;
  error?: ApiError;
  retryAfter?: number;
};

export type MessageCreatePayload = {
  room: RoomId;
  text: string;
  tag?: string;
};

export type MessageCreateResult = {
  ok: boolean;
  error?: ApiError;
  message?: ChatMessage;
};

export type AdminStats = {
  generatedAt: string;
  totals: {
    users: number;
    messages: number;
    activeSessions: number;
    onlineSockets: number;
  };
  activity: {
    activeUsers15m: number;
    activeUsers24h: number;
    messagesLastHour: number;
    messagesToday: number;
    sessionsCreatedToday: number;
  };
  rooms: Array<{
    id: RoomId;
    label: string;
    online: number;
    messages: number;
  }>;
  registrationsByDay: Array<{
    date: string;
    count: number;
  }>;
  messagesByHour: Array<{
    hour: string;
    count: number;
  }>;
  recentUsers: Array<{
    id: string;
    username: string;
    displayName: string;
    createdAt: string;
    isAdmin: boolean;
    lastSeenAt: string | null;
    activeSessions: number;
  }>;
  latestMessages: ChatMessage[];
};

export type RoomPresentation = {
  title: string;
  file: string;
  subtitle: string;
};

export const roomIds: RoomId[] = ["word", "excel", "ppt", "ps"];

export const defaultRoomLabels: RoomLabels = {
  word: "闲聊大厅",
  excel: "话题分区广场",
  ppt: "趣味内容广场",
  ps: "设计专属聊天室",
};

export const defaultPolicies: BootstrapPolicies = {
  anonymous: false,
  maxMessageLength: 180,
  mutedNotifications: true,
};

export const roomPresentation: Record<RoomId, RoomPresentation> = {
  word: {
    title: defaultRoomLabels.word,
    file: "工作汇报.docx",
    subtitle: "文档协作人数",
  },
  excel: {
    title: defaultRoomLabels.excel,
    file: "数据统计表.xlsx",
    subtitle: "表格协作人数",
  },
  ppt: {
    title: defaultRoomLabels.ppt,
    file: "会议材料.pptx",
    subtitle: "演示浏览人数",
  },
  ps: {
    title: defaultRoomLabels.ps,
    file: "视觉方案.psd",
    subtitle: "画布浏览人数",
  },
};

export const initialMessages: ChatMessage[] = [
  { id: 1, room: "word", name: "锦鲤同事", text: "今天的日报已经写到像年度总结了。", time: "10:18", tag: "游水" },
  { id: 2, room: "word", name: "协作者小林", text: "有没有三分钟恢复精神的办法，除了下班。", time: "10:21", tag: "树洞" },
  { id: 3, room: "excel", name: "A17", text: "午饭投票：麻辣烫 3 票，轻食 0 票。", time: "10:27", tag: "美食" },
  { id: 4, room: "excel", name: "C04", text: "推荐一个周末短剧，节奏快，不费脑。", time: "10:29", tag: "影视" },
  { id: 5, room: "ppt", name: "第 6 页备注", text: "新表情包已喂鱼：老板说简单改改系列。", time: "10:32", tag: "喂鱼" },
  { id: 6, room: "ps", name: "图层 12", text: "甲方说要高级灰，但不要灰。", time: "10:35", tag: "甲方" },
  { id: 7, room: "ps", name: "蒙版用户", text: "有无免费商用字体清单，救一下交付。", time: "10:41", tag: "素材" },
];

export function mergeRoomPresentation(labels?: Partial<RoomLabels>): Record<RoomId, RoomPresentation> {
  return Object.fromEntries(
    roomIds.map((room) => [
      room,
      {
        ...roomPresentation[room],
        title: labels?.[room] || roomPresentation[room].title,
      },
    ]),
  ) as Record<RoomId, RoomPresentation>;
}

export function defaultOnline(room: RoomId) {
  return 19 + room.length * 3;
}
