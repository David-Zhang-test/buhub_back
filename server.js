const http = require("http");
const next = require("next");
const jwt = require("jsonwebtoken");
const Redis = require("ioredis");
const { PrismaClient } = require("@prisma/client");
const WS = require("next/dist/compiled/ws");

let log;
try {
  const { child } = require("./src/lib/logger");
  log = child("http");
} catch (e) {
  log = {
    info: (msg, meta) => console.log("[http]", msg, meta ? JSON.stringify(meta) : ""),
    warn: (msg, meta) => console.warn("[http]", msg, meta ? JSON.stringify(meta) : ""),
    error: (msg, meta) => console.error("[http]", msg, meta ? JSON.stringify(meta) : ""),
  };
}

const { WebSocketServer } = WS;

const dev = process.argv.includes("--dev");
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

const WEAK_SECRET_PATTERNS = [
  "change-me-in-production",
  "change-this-to-a-secure-random-string",
  "your-secret-key",
  "your-secret",
];

const isWeakSecret = (s) => {
  const lower = s.toLowerCase();
  return WEAK_SECRET_PATTERNS.some((p) => lower.includes(p));
};

const JWT_SECRET = (() => {
  const s = process.env.JWT_SECRET;
  if (!s || isWeakSecret(s)) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET must be set to a strong random string in production");
    }
    return "dev-secret-not-for-production";
  }
  return s;
})();
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const SESSION_TTL = 7 * 24 * 60 * 60;
const EVENT_CHANNEL = "message:events:notify";
const EVENT_LIST_KEY_PREFIX = "message:events:user:";
const MAX_EVENTS_PER_USER = 200;

const REDIS_ERROR_LOG_INTERVAL_MS = 60 * 1000;
let lastRedisErrorLog = 0;
let lastSubscriberErrorLog = 0;

const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });
const subscriber = redis.duplicate();

redis.on("error", (err) => {
  const now = Date.now();
  if (now - lastRedisErrorLog >= REDIS_ERROR_LOG_INTERVAL_MS) {
    lastRedisErrorLog = now;
    log.warn("Redis error", { message: err.message });
  }
});
subscriber.on("error", (err) => {
  const now = Date.now();
  if (now - lastSubscriberErrorLog >= REDIS_ERROR_LOG_INTERVAL_MS) {
    lastSubscriberErrorLog = now;
    log.warn("Redis subscriber error", { message: err.message });
  }
});

const prisma = new PrismaClient();

// ── Auto-expire: mark posts as expired when expiresAt has passed ──
const EXPIRE_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
let expireTimer;

async function runExpireInline() {
  const now = new Date();
  const [partner, errand, secondhand] = await Promise.all([
    prisma.partnerPost.updateMany({
      where: { expired: false, expiresAt: { lt: now } },
      data: { expired: true },
    }),
    prisma.errand.updateMany({
      where: { expired: false, expiresAt: { lt: now } },
      data: { expired: true },
    }),
    prisma.secondhandItem.updateMany({
      where: { expired: false, expiresAt: { lt: now } },
      data: { expired: true },
    }),
  ]);
  const total = partner.count + errand.count + secondhand.count;
  if (total > 0) {
    log.info("expire job completed (inline, no pushes)", {
      partner: partner.count,
      errand: errand.count,
      secondhand: secondhand.count,
    });
  }
}

async function runExpireJob() {
  const cronSecret = process.env.CRON_SECRET;
  // Without CRON_SECRET we can't authenticate to /api/cron/expire, so fall
  // back to the inline DB sweep. Push notifications won't fire in this mode —
  // configure CRON_SECRET in production to enable task-reminder pushes.
  if (!cronSecret) {
    try {
      await runExpireInline();
    } catch (err) {
      log.warn("expire job failed (inline)", { message: err.message });
    }
    return;
  }

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/cron/expire`, {
      method: "GET",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    if (!response.ok) {
      log.warn("expire job HTTP failure", { status: response.status });
      return;
    }
    const json = await response.json();
    if (!json.success) {
      log.warn("expire job returned failure", { error: json.error });
      return;
    }
    const data = json.data || {};
    const expired = data.expired || {};
    const pushes = data.pushes || {};
    const expiredTotal = expired.total ?? 0;
    const expiringSoonDelivered = pushes.expiringSoon?.delivered ?? 0;
    const expiredDelivered = pushes.expired?.delivered ?? 0;
    if (expiredTotal > 0 || expiringSoonDelivered > 0 || expiredDelivered > 0) {
      log.info("expire job completed", {
        expired,
        pushes: {
          expiringSoon: pushes.expiringSoon,
          expired: pushes.expired,
        },
      });
    }
  } catch (err) {
    log.warn("expire job failed", { message: err.message });
  }
}

const userSockets = new Map();
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const wss = new WebSocketServer({ noServer: true });

function parseSince(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function getWsUrl(req) {
  const host = req.headers.host || `${hostname}:${port}`;
  return new URL(req.url || "/", `http://${host}`);
}

function getTokenFromRequest(req, wsUrl) {
  const fromQuery = wsUrl.searchParams.get("token");
  if (fromQuery) return fromQuery;
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== "string") return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function authenticateSocket(req, wsUrl) {
  const token = getTokenFromRequest(req, wsUrl);
  if (!token) throw new Error("Missing authorization token");

  const decoded = jwt.verify(token, JWT_SECRET);
  if (!decoded || typeof decoded !== "object") {
    throw new Error("Invalid token payload");
  }
  const jti = decoded.jti;
  const userIdFromToken = decoded.userId;
  if (typeof jti !== "string" || typeof userIdFromToken !== "string") {
    throw new Error("Invalid token payload");
  }

  const sessionJson = await redis.get(`session:${jti}`);
  if (!sessionJson) {
    throw new Error("Session expired");
  }

  const session = JSON.parse(sessionJson);
  const userId = session?.userId;
  if (typeof userId !== "string") {
    throw new Error("Invalid session");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true, isBanned: true },
  });

  if (!user) throw new Error("User not found");
  if (!user.isActive) throw new Error("Account deactivated");
  if (user.isBanned) throw new Error("Account banned");

  session.lastUsedAt = Date.now();
  redis
    .setex(`session:${jti}`, SESSION_TTL, JSON.stringify(session))
    .catch(() => {});

  return user.id;
}

async function readEventsSince(userId, since) {
  const key = `${EVENT_LIST_KEY_PREFIX}${userId}`;
  const rawEvents = await redis.lrange(key, 0, MAX_EVENTS_PER_USER - 1);
  if (!rawEvents.length) return [];

  return rawEvents
    .map((raw) => {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })
    .filter((event) => event && Number(event.createdAt || 0) > since)
    .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
}

function addUserSocket(userId, ws) {
  const sockets = userSockets.get(userId);
  if (sockets) {
    sockets.add(ws);
    return;
  }
  userSockets.set(userId, new Set([ws]));
}

function removeUserSocket(userId, ws) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  sockets.delete(ws);
  if (sockets.size === 0) {
    userSockets.delete(userId);
  }
}

function pushEventsToUser(userId, events) {
  const sockets = userSockets.get(userId);
  if (!sockets || events.length === 0) return;
  const payload = JSON.stringify({
    type: "events",
    events,
    now: Date.now(),
  });
  for (const ws of sockets) {
    if (ws.readyState === WS.OPEN) {
      ws.send(payload);
    }
  }
}

subscriber.on("message", (_channel, payload) => {
  try {
    const envelope = JSON.parse(payload);
    const userId = envelope?.userId;
    const event = envelope?.event;
    if (typeof userId !== "string" || !event) return;
    pushEventsToUser(userId, [event]);
  } catch {
    // Ignore malformed events.
  }
});

subscriber.subscribe(EVENT_CHANNEL).catch((error) => {
  log.error("ws subscribe event channel failed", { message: error.message });
});

wss.on("connection", async (ws, req) => {
  const wsMeta = req.__buhubWsMeta;
  const userId = wsMeta?.userId;
  const since = wsMeta?.since ?? 0;
  if (!userId) {
    ws.close(1008, "Unauthorized");
    return;
  }

  addUserSocket(userId, ws);
  ws.isAlive = true;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("close", () => {
    removeUserSocket(userId, ws);
  });

  ws.on("error", () => {
    removeUserSocket(userId, ws);
  });

  try {
    const backlogEvents = await readEventsSince(userId, since);
    if (backlogEvents.length > 0 && ws.readyState === WS.OPEN) {
      ws.send(
        JSON.stringify({
          type: "events",
          events: backlogEvents,
          now: Date.now(),
        })
      );
    } else if (ws.readyState === WS.OPEN) {
      ws.send(
        JSON.stringify({
          type: "hello",
          now: Date.now(),
        })
      );
    }
  } catch (error) {
    log.error("ws load backlog failed", { message: error.message });
  }
});

const heartbeatTimer = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

app
  .prepare()
  .then(() => {
    const server = http.createServer((req, res) => {
      const start = Date.now();
      const onFinish = () => {
        res.removeListener("finish", onFinish);
        res.removeListener("close", onFinish);
        const status = res.statusCode;
        const method = req.method || "?";
        const url = req.url?.split("?")[0] || "/";
        log.info("request", { method, path: url, status, ms: Date.now() - start });
      };
      res.once("finish", onFinish);
      res.once("close", onFinish);
      handle(req, res);
    });

    const nextUpgradeHandler =
      typeof app.getUpgradeHandler === "function"
        ? app.getUpgradeHandler()
        : null;

    server.on("upgrade", async (req, socket, head) => {
      let wsUrl;
      try {
        wsUrl = getWsUrl(req);
      } catch {
        socket.destroy();
        return;
      }

      if (wsUrl.pathname !== "/ws/messages") {
        if (nextUpgradeHandler) {
          nextUpgradeHandler(req, socket, head).catch(() => {
            socket.destroy();
          });
        } else {
          socket.destroy();
        }
        return;
      }

      try {
        const userId = await authenticateSocket(req, wsUrl);
        req.__buhubWsMeta = {
          userId,
          since: parseSince(wsUrl.searchParams.get("since")),
        };
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit("connection", ws, req);
        });
      } catch {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
      }
    });

    server.listen(port, hostname, () => {
      log.info("server ready", { hostname, port, env: dev ? "dev" : "prod" });
    });

    // Start auto-expire timer after server is ready
    runExpireJob();
    expireTimer = setInterval(runExpireJob, EXPIRE_INTERVAL_MS);
  })
  .catch((error) => {
    log.error("server start failed", { message: error.message });
    process.exit(1);
  });

const shutdown = async () => {
  clearInterval(heartbeatTimer);
  if (expireTimer) clearInterval(expireTimer);
  await Promise.allSettled([subscriber.quit(), redis.quit(), prisma.$disconnect()]);
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
