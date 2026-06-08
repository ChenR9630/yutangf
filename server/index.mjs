import compression from "compression";
import express from "express";
import helmet from "helmet";
import http from "node:http";
import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import morgan from "morgan";
import { Server } from "socket.io";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const messagesPath = path.join(dataDir, "messages.json");
const usersPath = path.join(dataDir, "users.json");
const authDbPath = path.join(dataDir, "auth.sqlite");
const distDir = path.join(rootDir, "dist");
const indexPath = path.join(distDir, "index.html");
const port = Number(process.env.PORT || 8787);
const sessionTtlMs = 1000 * 60 * 60 * 24 * 14;
const aiName = process.env.YUTANG_AI_NAME || "塘小逗";
const aiTag = process.env.YUTANG_AI_TAG || "冒泡";
const aiOnlineThreshold = Number(process.env.YUTANG_AI_ONLINE_THRESHOLD || 2);
const aiCooldownMs = Number(process.env.YUTANG_AI_COOLDOWN_MS || 45_000);
const doubaoBaseUrl = String(process.env.DOUBAO_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");
const doubaoApiKey = process.env.DOUBAO_API_KEY || process.env.ARK_API_KEY || "";
const doubaoModel = process.env.DOUBAO_MODEL || process.env.ARK_MODEL || "";

const rooms = ["word", "excel", "ppt", "ps"];
const roomLabels = {
  word: "闲聊大厅",
  excel: "话题分区广场",
  ppt: "趣味内容广场",
  ps: "设计专属聊天室",
};

const seedMessages = [
  { id: 1, room: "word", name: "锦鲤同事", text: "今天的日报已经写到像年度总结了。", time: "10:18", tag: "游水" },
  { id: 2, room: "word", name: "协作者小林", text: "有没有三分钟恢复精神的办法，除了下班。", time: "10:21", tag: "树洞" },
  { id: 3, room: "excel", name: "A17", text: "午饭投票：麻辣烫 3 票，轻食 0 票。", time: "10:27", tag: "美食" },
  { id: 4, room: "excel", name: "C04", text: "推荐一个周末短剧，节奏快，不费脑。", time: "10:29", tag: "影视" },
  { id: 5, room: "ppt", name: "第 6 页备注", text: "新表情包已喂鱼：老板说简单改改系列。", time: "10:32", tag: "喂鱼" },
  { id: 6, room: "ps", name: "图层 12", text: "甲方说要高级灰，但不要灰。", time: "10:35", tag: "甲方" },
  { id: 7, room: "ps", name: "蒙版用户", text: "有无免费商用字体清单，救一下交付。", time: "10:41", tag: "素材" },
];

const blockedWords = ["暴力", "造谣", "人身攻击", "低俗"];
const maxMessagesPerRoom = 120;
let messages = await loadMessages();
await mkdir(dataDir, { recursive: true });
const authDb = new DatabaseSync(authDbPath);
initializeAuthDb();
await migrateUsersFromJson();
ensureInitialAdmin();
let saveTimer;
const rateLimitBuckets = new Map();
const onlineByRoom = new Map(rooms.map((room) => [room, new Set()]));
const aiCooldownByRoom = new Map();
const aiPendingRooms = new Set();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:5173", "http://localhost:5174"],
  },
});

app.disable("x-powered-by");
app.set("trust proxy", "loopback");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: "24kb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.use((request, _response, next) => {
  request.currentUser = userFromRequest(request);
  next();
});

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "yutang-workbench",
    uptime: Math.round(process.uptime()),
    rooms: roomLabels,
  });
});

app.get("/api/bootstrap", (_request, response) => {
  response.json({
    rooms: roomLabels,
    messages,
    online: onlineSnapshot(),
    user: safeUser(_request.currentUser),
    policies: {
      anonymous: false,
      maxMessageLength: 180,
      mutedNotifications: true,
    },
  });
});

app.get("/api/auth/me", (request, response) => {
  response.json({ user: safeUser(request.currentUser) });
});

app.get("/api/admin/stats", (request, response) => {
  if (!request.currentUser) {
    response.status(401).json({ ok: false, error: "login_required" });
    return;
  }
  if (!isAdmin(request.currentUser)) {
    response.status(403).json({ ok: false, error: "admin_required" });
    return;
  }

  response.json({ ok: true, stats: adminStats() });
});

app.post("/api/auth/register", async (request, response) => {
  const username = normalizeUsername(request.body?.username);
  const displayName = sanitizeText(request.body?.displayName || username).slice(0, 12);
  const password = String(request.body?.password || "");

  if (!username || username.length < 3) {
    response.status(400).json({ ok: false, error: "invalid_username" });
    return;
  }
  if (!displayName) {
    response.status(400).json({ ok: false, error: "invalid_display_name" });
    return;
  }
  const passwordCheck = validatePassword(password, username);
  if (!passwordCheck.ok) {
    response.status(400).json({ ok: false, error: passwordCheck.error });
    return;
  }
  if (getUserByUsername(username)) {
    response.status(409).json({ ok: false, error: "username_taken" });
    return;
  }

  const rateLimit = consumeRateLimit(request, "register", username, 5, 15 * 60 * 1000);
  if (!rateLimit.ok) {
    response.status(429).json({ ok: false, error: "rate_limited", retryAfter: rateLimit.retryAfter });
    return;
  }

  const user = createUser({
    id: crypto.randomUUID(),
    username,
    displayName,
    password: hashPassword(password),
    createdAt: new Date().toISOString(),
    isAdmin: shouldCreateAdminUser(),
  });
  const sessionId = createSession(user.id);
  setSessionCookie(response, sessionId);
  response.status(201).json({ ok: true, user: safeUser(user) });
});

app.post("/api/auth/login", (request, response) => {
  const username = normalizeUsername(request.body?.username);
  const password = String(request.body?.password || "");
  const rateLimit = consumeRateLimit(request, "login", username, 8, 10 * 60 * 1000);

  if (!rateLimit.ok) {
    response.status(429).json({ ok: false, error: "rate_limited", retryAfter: rateLimit.retryAfter });
    return;
  }

  const user = getUserByUsername(username);

  if (!user || !verifyPassword(password, user.password)) {
    response.status(401).json({ ok: false, error: "invalid_credentials" });
    return;
  }

  const sessionId = createSession(user.id);
  setSessionCookie(response, sessionId);
  response.json({ ok: true, user: safeUser(user) });
});

app.post("/api/auth/logout", (request, response) => {
  const sessionId = readCookie(request, "yt_session");
  if (sessionId) deleteSession(sessionId);
  clearSessionCookie(response);
  response.json({ ok: true });
});

app.post("/api/report", (request, response) => {
  const messageId = Number(request.body?.messageId);
  const reason = String(request.body?.reason || "用户举报").slice(0, 80);
  const message = messages.find((item) => item.id === messageId);
  if (!message) {
    response.status(404).json({ ok: false, error: "message_not_found" });
    return;
  }
  console.warn("[report]", { messageId, room: message.room, reason });
  response.json({ ok: true });
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDir, { maxAge: "1h", index: false }));
  app.use(async (_request, response, next) => {
    try {
      response.type("html").send(await readFile(indexPath, "utf8"));
    } catch (error) {
      next(error);
    }
  });
}

io.on("connection", (socket) => {
  const user = userFromCookieHeader(socket.handshake.headers.cookie || "");
  socket.data.user = user ? safeUser(user) : null;
  socket.emit("online:update", onlineSnapshot());

  socket.on("room:join", (room) => {
    if (!rooms.includes(room)) return;
    leaveAllRooms(socket);
    socket.join(room);
    onlineByRoom.get(room)?.add(socket.id);
    io.emit("online:update", onlineSnapshot());
  });

  socket.on("message:create", (payload, acknowledge) => {
    const user = userFromCookieHeader(socket.handshake.headers.cookie || "");
    socket.data.user = user ? safeUser(user) : null;
    const result = createMessage(payload, socket.data.user);
    if (!result.ok) {
      acknowledge?.(result);
      return;
    }
    appendMessage(result.message);
    io.to(result.message.room).emit("message:new", result.message);
    acknowledge?.({ ok: true, message: result.message });
    maybeReplyWithAi(result.message);
  });

  socket.on("disconnect", () => {
    leaveAllRooms(socket);
    io.emit("online:update", onlineSnapshot());
  });
});

server.listen(port, () => {
  console.log(`Yutang server listening on http://localhost:${port}`);
});

async function loadMessages() {
  try {
    const raw = await readFile(messagesPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : seedMessages;
  } catch {
    await mkdir(dataDir, { recursive: true });
    await writeFile(messagesPath, JSON.stringify(seedMessages, null, 2));
    return seedMessages;
  }
}

function createMessage(payload = {}, user) {
  const room = String(payload.room || "");
  if (!user) return { ok: false, error: "login_required" };

  const name = sanitizeText(user.displayName).slice(0, 12) || "已登录用户";
  const text = sanitizeText(payload.text || "").slice(0, 180);
  const tag = sanitizeText(payload.tag || roomDefaultTag(room)).slice(0, 8);

  if (!rooms.includes(room)) return { ok: false, error: "invalid_room" };
  if (!text.trim()) return { ok: false, error: "empty_message" };
  if (blockedWords.some((word) => text.includes(word))) return { ok: false, error: "blocked_content" };

  return {
    ok: true,
    message: {
      id: Date.now(),
      room,
      name,
      text,
      tag,
      time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }),
    },
  };
}

function appendMessage(message) {
  messages = [...messages, message].slice(-maxMessagesPerRoom * rooms.length);
  scheduleSave();
}

function maybeReplyWithAi(message) {
  if (!isAiEnabled()) return;
  if (!rooms.includes(message.room) || message.name === aiName) return;
  if ((onlineByRoom.get(message.room)?.size || 0) > aiOnlineThreshold) return;

  const now = Date.now();
  if ((aiCooldownByRoom.get(message.room) || 0) > now) return;
  if (aiPendingRooms.has(message.room)) return;

  aiPendingRooms.add(message.room);
  aiCooldownByRoom.set(message.room, now + aiCooldownMs);
  setTimeout(() => {
    createAiReply(message).catch((error) => {
      console.warn("[doubao-ai]", error?.message || error);
    }).finally(() => {
      aiPendingRooms.delete(message.room);
    });
  }, 1200);
}

function isAiEnabled() {
  return Boolean(doubaoApiKey && doubaoModel);
}

async function createAiReply(triggerMessage) {
  const text = await generateDoubaoReply(triggerMessage);
  if (!text) return;

  const message = {
    id: Date.now() + 1,
    room: triggerMessage.room,
    name: aiName,
    text: sanitizeText(text).slice(0, 160),
    tag: aiTag,
    time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }),
  };

  if (!message.text.trim()) return;
  if (blockedWords.some((word) => message.text.includes(word))) return;

  appendMessage(message);
  io.to(message.room).emit("message:new", message);
}

async function generateDoubaoReply(triggerMessage) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(`${doubaoBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${doubaoApiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: doubaoModel,
        messages: buildAiMessages(triggerMessage),
        temperature: 0.9,
        max_tokens: 120,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Doubao API ${response.status}: ${detail.slice(0, 160)}`);
    }

    const data = await response.json();
    return String(data?.choices?.[0]?.message?.content || "").trim();
  } finally {
    clearTimeout(timeout);
  }
}

function buildAiMessages(triggerMessage) {
  const roomMessages = messages
    .filter((item) => item.room === triggerMessage.room)
    .slice(-8)
    .map((item) => ({
      role: item.name === aiName ? "assistant" : "user",
      content: `${item.name}：${item.text}`,
    }));

  return [
    {
      role: "system",
      content: [
        `你是鱼塘社区里的 AI 气氛同事，名字叫${aiName}。`,
        "当房间人少或冷场时，你会依据最近聊天接一句有趣、轻松、短小的中文回复。",
        "风格像办公室摸鱼搭子：机灵但不油腻，不说教，不营销，不提自己是大模型。",
        "每次只回 1 句，控制在 60 字以内，可以带轻微谐音梗，但不要刷屏。",
      ].join(""),
    },
    ...roomMessages,
    {
      role: "user",
      content: `请接住这条消息，给一个有趣但自然的回复：${triggerMessage.name}：${triggerMessage.text}`,
    },
  ];
}

function sanitizeText(value) {
  return String(value)
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function initializeAuthDb() {
  authDb.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);
  addColumnIfMissing("users", "is_admin", "INTEGER NOT NULL DEFAULT 0");
  authDb.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
}

function addColumnIfMissing(table, column, definition) {
  const columns = authDb.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((item) => item.name === column)) return;
  authDb.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function migrateUsersFromJson() {
  try {
    const raw = await readFile(usersPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;

    const insertUser = authDb.prepare(`
      INSERT OR IGNORE INTO users (id, username, display_name, password, created_at, is_admin)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const user of parsed) {
      const username = normalizeUsername(user?.username);
      const displayName = sanitizeText(user?.displayName || username).slice(0, 12);
      if (!user?.id || !username || !displayName || !user?.password) continue;
      insertUser.run(user.id, username, displayName, String(user.password), user.createdAt || new Date().toISOString(), user.isAdmin ? 1 : 0);
    }
  } catch {
    // Fresh installs no longer need users.json; SQLite is the source of truth.
  }
}

function createUser(user) {
  authDb
    .prepare("INSERT INTO users (id, username, display_name, password, created_at, is_admin) VALUES (?, ?, ?, ?, ?, ?)")
    .run(user.id, user.username, user.displayName, user.password, user.createdAt, user.isAdmin ? 1 : 0);
  return user;
}

function getUserByUsername(username) {
  return rowToUser(authDb.prepare("SELECT * FROM users WHERE username = ?").get(username));
}

function getUserById(userId) {
  return rowToUser(authDb.prepare("SELECT * FROM users WHERE id = ?").get(userId));
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    password: row.password,
    createdAt: row.created_at,
    isAdmin: Boolean(row.is_admin),
  };
}

function shouldCreateAdminUser() {
  return Number(authDb.prepare("SELECT COUNT(*) AS count FROM users").get().count) === 0;
}

function ensureInitialAdmin() {
  const adminCount = Number(authDb.prepare("SELECT COUNT(*) AS count FROM users WHERE is_admin = 1").get().count);
  if (adminCount > 0) return;

  const firstUser = authDb.prepare("SELECT id FROM users ORDER BY created_at ASC LIMIT 1").get();
  if (firstUser) authDb.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(firstUser.id);
}

function isAdmin(user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  const configuredAdmins = String(process.env.ADMIN_USERNAMES || "")
    .split(",")
    .map((item) => normalizeUsername(item))
    .filter(Boolean);
  return configuredAdmins.includes(normalizeUsername(user.username));
}

function validatePassword(password, username) {
  if (password.length < 10) return { ok: false, error: "weak_password" };
  if (password.length > 128) return { ok: false, error: "password_too_long" };
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    return { ok: false, error: "password_contains_username" };
  }

  const requiredClasses = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/];
  if (!requiredClasses.every((pattern) => pattern.test(password))) {
    return { ok: false, error: "weak_password" };
  }

  const common = ["password", "123456", "qwerty", "admin", "letmein", "yutang"];
  if (common.some((item) => password.toLowerCase().includes(item))) {
    return { ok: false, error: "common_password" };
  }

  return { ok: true };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `pbkdf2:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [method, salt, expected] = String(stored || "").split(":");
  if (method !== "pbkdf2" || !salt || !expected) return false;
  const actual = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256");
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(expectedBuffer, actual);
}

function createSession(userId) {
  const sessionId = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  authDb
    .prepare("INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)")
    .run(sessionId, userId, now + sessionTtlMs, now, now);
  return sessionId;
}

function userFromRequest(request) {
  return userFromCookieHeader(request.headers.cookie || "");
}

function userFromCookieHeader(cookieHeader) {
  const sessionId = readCookie({ headers: { cookie: cookieHeader } }, "yt_session");
  if (!sessionId) return null;
  const session = authDb.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
  if (!session) return null;
  if (session.expires_at < Date.now()) {
    deleteSession(sessionId);
    return null;
  }
  authDb.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(Date.now(), sessionId);
  return getUserById(session.user_id);
}

function deleteSession(sessionId) {
  authDb.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

function consumeRateLimit(request, action, username, limit, windowMs) {
  const now = Date.now();
  const ip = request.ip || request.socket?.remoteAddress || "unknown";
  const key = `${action}:${ip}:${username || "anonymous"}`;
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    cleanupRateLimitBuckets(now);
    return { ok: true };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  return { ok: true };
}

function cleanupRateLimitBuckets(now) {
  if (rateLimitBuckets.size < 2000) return;
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
}

function readCookie(request, name) {
  const cookies = String(request.headers.cookie || "").split(";").map((item) => item.trim());
  const cookie = cookies.find((item) => item.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : "";
}

function setSessionCookie(response, sessionId) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `yt_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.round(sessionTtlMs / 1000)}${secure}`,
  );
}

function clearSessionCookie(response) {
  response.setHeader("Set-Cookie", "yt_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

function safeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    isAdmin: isAdmin(user),
  };
}

function roomDefaultTag(room) {
  if (room === "excel") return "话题";
  if (room === "ppt") return "喂鱼";
  if (room === "ps") return "图层";
  return "游水";
}

function leaveAllRooms(socket) {
  for (const room of rooms) {
    onlineByRoom.get(room)?.delete(socket.id);
    socket.leave(room);
  }
}

function onlineSnapshot() {
  return Object.fromEntries(rooms.map((room) => [room, 19 + room.length * 3 + (onlineByRoom.get(room)?.size || 0)]));
}

function adminStats() {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const activeSessions = Number(authDb.prepare("SELECT COUNT(*) AS count FROM sessions WHERE expires_at >= ?").get(now).count);
  const activeUsers15m = Number(
    authDb.prepare("SELECT COUNT(DISTINCT user_id) AS count FROM sessions WHERE expires_at >= ? AND last_seen_at >= ?").get(now, now - 15 * 60 * 1000).count,
  );
  const activeUsers24h = Number(
    authDb.prepare("SELECT COUNT(DISTINCT user_id) AS count FROM sessions WHERE expires_at >= ? AND last_seen_at >= ?").get(now, now - dayMs).count,
  );
  const totalUsers = Number(authDb.prepare("SELECT COUNT(*) AS count FROM users").get().count);
  const sessionsCreatedToday = Number(
    authDb.prepare("SELECT COUNT(*) AS count FROM sessions WHERE created_at >= ?").get(todayMs).count,
  );
  const onlineSockets = rooms.reduce((total, room) => total + (onlineByRoom.get(room)?.size || 0), 0);
  const realMessages = messages.filter((message) => Number(message.id) > 1000000000000);

  return {
    generatedAt: new Date(now).toISOString(),
    totals: {
      users: totalUsers,
      messages: messages.length,
      activeSessions,
      onlineSockets,
    },
    activity: {
      activeUsers15m,
      activeUsers24h,
      messagesLastHour: realMessages.filter((message) => Number(message.id) >= now - 60 * 60 * 1000).length,
      messagesToday: realMessages.filter((message) => Number(message.id) >= todayMs).length,
      sessionsCreatedToday,
    },
    rooms: rooms.map((room) => ({
      id: room,
      label: roomLabels[room],
      online: onlineByRoom.get(room)?.size || 0,
      messages: messages.filter((message) => message.room === room).length,
    })),
    registrationsByDay: registrationBuckets(7),
    messagesByHour: messageBuckets(12, now),
    recentUsers: recentUsers(),
    latestMessages: messages.slice(-8).reverse(),
  };
}

function recentUsers() {
  return authDb
    .prepare(`
      SELECT
        users.id,
        users.username,
        users.display_name,
        users.created_at,
        users.is_admin,
        MAX(sessions.last_seen_at) AS last_seen_at,
        COUNT(sessions.id) AS active_sessions
      FROM users
      LEFT JOIN sessions ON sessions.user_id = users.id AND sessions.expires_at >= ?
      GROUP BY users.id
      ORDER BY users.created_at DESC
      LIMIT 8
    `)
    .all(Date.now())
    .map((user) => ({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      createdAt: user.created_at,
      isAdmin: Boolean(user.is_admin),
      lastSeenAt: user.last_seen_at ? new Date(user.last_seen_at).toISOString() : null,
      activeSessions: Number(user.active_sessions || 0),
    }));
}

function registrationBuckets(days) {
  const buckets = [];
  const now = new Date();
  const users = authDb.prepare("SELECT created_at FROM users").all();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    buckets.push({
      date: key,
      count: users.filter((user) => String(user.created_at || "").slice(0, 10) === key).length,
    });
  }

  return buckets;
}

function messageBuckets(hours, now) {
  const buckets = [];
  const hourMs = 60 * 60 * 1000;
  const realMessages = messages.filter((message) => Number(message.id) > 1000000000000);

  for (let offset = hours - 1; offset >= 0; offset -= 1) {
    const start = Math.floor((now - offset * hourMs) / hourMs) * hourMs;
    const end = start + hourMs;
    buckets.push({
      hour: new Date(start).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }),
      count: realMessages.filter((message) => Number(message.id) >= start && Number(message.id) < end).length,
    });
  }

  return buckets;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(messagesPath, JSON.stringify(messages.slice(-maxMessagesPerRoom * rooms.length), null, 2));
  }, 250);
}
