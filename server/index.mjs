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

const rooms = ["word", "excel", "ppt", "ps"];
const roomLabels = {
  word: "闲聊大厅",
  excel: "话题分区广场",
  ppt: "趣味内容广场",
  ps: "设计专属聊天室",
};

const seedMessages = [
  { id: 1, room: "word", name: "匿名锦鲤", text: "今天的日报已经写到像年度总结了。", time: "10:18", tag: "游水" },
  { id: 2, room: "word", name: "临时协作者", text: "有没有三分钟恢复精神的办法，除了下班。", time: "10:21", tag: "树洞" },
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
let saveTimer;
const rateLimitBuckets = new Map();
const onlineByRoom = new Map(rooms.map((room) => [room, new Set()]));

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

app.post("/api/auth/register", async (request, response) => {
  const username = normalizeUsername(request.body?.username);
  const displayName = sanitizeText(request.body?.displayName || username).slice(0, 12);
  const password = String(request.body?.password || "");
  const rateLimit = consumeRateLimit(request, "register", username, 5, 15 * 60 * 1000);

  if (!rateLimit.ok) {
    response.status(429).json({ ok: false, error: "rate_limited", retryAfter: rateLimit.retryAfter });
    return;
  }

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

  const user = createUser({
    id: crypto.randomUUID(),
    username,
    displayName,
    password: hashPassword(password),
    createdAt: new Date().toISOString(),
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
    const result = createMessage(payload, socket.data.user);
    if (!result.ok) {
      acknowledge?.(result);
      return;
    }
    messages = [...messages, result.message].slice(-maxMessagesPerRoom * rooms.length);
    scheduleSave();
    io.to(result.message.room).emit("message:new", result.message);
    acknowledge?.({ ok: true, message: result.message });
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
      created_at TEXT NOT NULL
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
  authDb.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
}

async function migrateUsersFromJson() {
  try {
    const raw = await readFile(usersPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;

    const insertUser = authDb.prepare(`
      INSERT OR IGNORE INTO users (id, username, display_name, password, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const user of parsed) {
      const username = normalizeUsername(user?.username);
      const displayName = sanitizeText(user?.displayName || username).slice(0, 12);
      if (!user?.id || !username || !displayName || !user?.password) continue;
      insertUser.run(user.id, username, displayName, String(user.password), user.createdAt || new Date().toISOString());
    }
  } catch {
    // Fresh installs no longer need users.json; SQLite is the source of truth.
  }
}

function createUser(user) {
  authDb
    .prepare("INSERT INTO users (id, username, display_name, password, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(user.id, user.username, user.displayName, user.password, user.createdAt);
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
  };
}

function validatePassword(password, username) {
  if (password.length < 10) return { ok: false, error: "weak_password" };
  if (password.length > 128) return { ok: false, error: "password_too_long" };
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    return { ok: false, error: "password_contains_username" };
  }

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  if (classes < 3) return { ok: false, error: "weak_password" };

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

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(messagesPath, JSON.stringify(messages.slice(-maxMessagesPerRoom * rooms.length), null, 2));
  }, 250);
}
