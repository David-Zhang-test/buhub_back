const http = require("http");
const next = require("next");
const jwt = require("jsonwebtoken");
const Redis = require("ioredis");
const { PrismaClient } = require("@prisma/client");
const WS = require("next/dist/compiled/ws");

const { WebSocketServer } = WS;

const dev = process.argv.includes("--dev");
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const SESSION_TTL = 7 * 24 * 60 * 60;
const EVENT_CHANNEL = "message:events:notify";
const EVENT_LIST_KEY_PREFIX = "message:events:user:";
const MAX_EVENTS_PER_USER = 200;

const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });
const subscriber = redis.duplicate();
const prisma = new PrismaClient();

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
  console.error("[ws] failed to subscribe event channel:", error);
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
    console.error("[ws] failed to load backlog:", error);
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
      console.log(
        `[ws] server ready at http://${hostname}:${port} (${dev ? "dev" : "prod"})`
      );
    });
  })
  .catch((error) => {
    console.error("[ws] failed to start server:", error);
    process.exit(1);
  });

const shutdown = async () => {
  clearInterval(heartbeatTimer);
  await Promise.allSettled([subscriber.quit(), redis.quit(), prisma.$disconnect()]);
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
