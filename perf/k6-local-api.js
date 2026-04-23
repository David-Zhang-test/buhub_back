import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:3000";
const API_PREFIX = __ENV.API_PREFIX || "/api";
const WS_BASE_URL = (__ENV.WS_BASE_URL || BASE_URL).replace(/^http/i, "ws");
const LOAD_TIER = (__ENV.LOAD_TIER || "medium").toLowerCase();
const LIMITS = (__ENV.LIMITS || "20,50,100")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);
const ENABLED_SCENARIOS = (__ENV.SCENARIOS ||
  "public_search,public_trending,redis_circles,public_ratings,auth_following,ws_messages")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const WS_ENABLED = (__ENV.WS_ENABLED || "1") === "1";

const explicitToken = __ENV.AUTH_TOKEN || __ENV.WS_TOKEN || "";
const loginEmail = __ENV.LOGIN_EMAIL || "";
const loginPassword = __ENV.LOGIN_PASSWORD || "";

const errorRate = new Rate("errors");
const status429Rate = new Rate("http_429_rate");
const authMissingRate = new Rate("auth_missing_rate");
const wsConnectRate = new Rate("ws_connect_rate");
const wsHelloRate = new Rate("ws_hello_rate");

const status2xx = new Counter("http_2xx_count");
const status4xx = new Counter("http_4xx_count");
const status5xx = new Counter("http_5xx_count");

const forumSearchLatency = new Trend("forum_search_latency", true);
const trendingLatency = new Trend("feed_trending_latency", true);
const circlesLatency = new Trend("forum_circles_latency", true);
const circleTagLatency = new Trend("forum_circle_tag_latency", true);
const ratingsLatency = new Trend("ratings_latency", true);
const followingLatency = new Trend("feed_following_latency", true);
const wsConnectTime = new Trend("ws_connect_time_ms", true);
const wsSessionTime = new Trend("ws_session_time_ms", true);

function resolveStages() {
  if (LOAD_TIER === "light") {
    return {
      http: [
        { duration: "15s", target: 4 },
        { duration: "30s", target: 8 },
        { duration: "15s", target: 0 },
      ],
      auth: [
        { duration: "15s", target: 2 },
        { duration: "30s", target: 4 },
        { duration: "15s", target: 0 },
      ],
      ws: [{ duration: "45s", target: 10 }, { duration: "10s", target: 0 }],
    };
  }

  if (LOAD_TIER === "heavy") {
    return {
      http: [
        { duration: "20s", target: 20 },
        { duration: "40s", target: 40 },
        { duration: "20s", target: 0 },
      ],
      auth: [
        { duration: "20s", target: 8 },
        { duration: "40s", target: 16 },
        { duration: "20s", target: 0 },
      ],
      ws: [{ duration: "60s", target: 60 }, { duration: "10s", target: 0 }],
    };
  }

  return {
    http: [
      { duration: "20s", target: 10 },
      { duration: "40s", target: 20 },
      { duration: "20s", target: 0 },
    ],
    auth: [
      { duration: "20s", target: 4 },
      { duration: "40s", target: 8 },
      { duration: "20s", target: 0 },
    ],
    ws: [{ duration: "50s", target: 30 }, { duration: "10s", target: 0 }],
  };
}

const STAGES = resolveStages();

export const options = {
  scenarios: {
    public_search: {
      executor: "ramping-vus",
      exec: "runForumSearch",
      stages: STAGES.http,
      gracefulRampDown: "10s",
      tags: { endpoint: "forum_search" },
    },
    public_trending: {
      executor: "ramping-vus",
      exec: "runFeedTrending",
      stages: STAGES.http,
      gracefulRampDown: "10s",
      tags: { endpoint: "feed_trending" },
    },
    redis_circles: {
      executor: "ramping-vus",
      exec: "runForumCircles",
      stages: STAGES.http,
      gracefulRampDown: "10s",
      tags: { endpoint: "forum_circles" },
    },
    public_ratings: {
      executor: "ramping-vus",
      exec: "runRatings",
      stages: STAGES.http,
      gracefulRampDown: "10s",
      tags: { endpoint: "ratings_course" },
    },
    auth_following: {
      executor: "ramping-vus",
      exec: "runFollowingFeed",
      stages: STAGES.auth,
      gracefulRampDown: "10s",
      tags: { endpoint: "feed_following" },
    },
    ws_messages: {
      executor: "ramping-vus",
      exec: "runWsMessages",
      stages: STAGES.ws,
      gracefulRampDown: "5s",
      tags: { endpoint: "ws_messages" },
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.10"],
    http_req_duration: ["p(95)<2000", "p(99)<4000"],
    errors: ["rate<0.10"],
    http_429_rate: ["rate<0.20"],
    ws_connect_rate: ["rate>0.90"],
    ws_hello_rate: ["rate>0.80"],
    forum_search_latency: ["p(95)<1800"],
    feed_trending_latency: ["p(95)<1800"],
    forum_circles_latency: ["p(95)<1800"],
    forum_circle_tag_latency: ["p(95)<1800"],
    ratings_latency: ["p(95)<2000"],
    feed_following_latency: ["p(95)<2200"],
  },
};

function shouldRun(name) {
  return ENABLED_SCENARIOS.includes(name);
}

function pickLimit() {
  if (LIMITS.length === 0) return 20;
  return LIMITS[Math.floor(Math.random() * LIMITS.length)];
}

function updateStatusMetrics(status) {
  if (status >= 200 && status < 300) status2xx.add(1);
  else if (status >= 400 && status < 500) status4xx.add(1);
  else if (status >= 500) status5xx.add(1);
}

function request(url, trendMetric, endpointName, token) {
  const headers = {
    "x-forwarded-for": `10.10.${(__VU % 50) + 1}.${(__ITER % 200) + 1}`,
    "x-client-source": "k6-local",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = http.get(url, {
    headers,
    tags: { endpoint: endpointName, load_tier: LOAD_TIER },
  });

  trendMetric.add(res.timings.duration);
  updateStatusMetrics(res.status);
  status429Rate.add(res.status === 429);

  const success = check(res, {
    "status is 2xx": (r) => r.status >= 200 && r.status < 300,
    "response json has success": (r) => {
      try {
        const body = r.json();
        return typeof body?.success === "boolean";
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);
  return res;
}

export function setup() {
  const setupData = { token: explicitToken || "" };
  if (setupData.token || !loginEmail || !loginPassword) return setupData;

  const loginRes = http.post(
    `${BASE_URL}${API_PREFIX}/auth/login`,
    JSON.stringify({ email: loginEmail, password: loginPassword }),
    {
      headers: { "Content-Type": "application/json", "x-client-source": "k6-local" },
      tags: { endpoint: "auth_login_for_perf_setup" },
    }
  );

  if (loginRes.status >= 200 && loginRes.status < 300) {
    try {
      const body = loginRes.json();
      if (body?.token) setupData.token = body.token;
    } catch {
      // Ignore parse error, setupData.token remains empty.
    }
  }

  return setupData;
}

export function runForumSearch() {
  if (!shouldRun("public_search")) {
    sleep(1);
    return;
  }

  const limit = pickLimit();
  request(
    `${BASE_URL}${API_PREFIX}/forum/search?q=test&page=1&limit=${limit}`,
    forumSearchLatency,
    "forum_search"
  );
  sleep(0.25);
}

export function runFeedTrending() {
  if (!shouldRun("public_trending")) {
    sleep(1);
    return;
  }

  const limit = pickLimit();
  request(
    `${BASE_URL}${API_PREFIX}/feed/trending?timeframe=7d&page=1&limit=${limit}`,
    trendingLatency,
    "feed_trending"
  );
  sleep(0.3);
}

export function runForumCircles() {
  if (!shouldRun("redis_circles")) {
    sleep(1);
    return;
  }

  request(`${BASE_URL}${API_PREFIX}/forum/circles`, circlesLatency, "forum_circles");
  request(
    `${BASE_URL}${API_PREFIX}/forum/circles/general`,
    circleTagLatency,
    "forum_circle_tag"
  );
  sleep(0.3);
}

export function runRatings() {
  if (!shouldRun("public_ratings")) {
    sleep(1);
    return;
  }

  const limit = pickLimit();
  request(
    `${BASE_URL}${API_PREFIX}/ratings/course?page=1&limit=${limit}`,
    ratingsLatency,
    "ratings_course"
  );
  sleep(0.35);
}

export function runFollowingFeed(data) {
  if (!shouldRun("auth_following")) {
    sleep(1);
    return;
  }

  if (!data?.token) {
    authMissingRate.add(true);
    sleep(1);
    return;
  }

  const limit = pickLimit();
  request(
    `${BASE_URL}${API_PREFIX}/feed/following?page=1&limit=${limit}`,
    followingLatency,
    "feed_following",
    data.token
  );
  sleep(0.35);
}

export function runWsMessages(data) {
  if (!WS_ENABLED || !shouldRun("ws_messages")) {
    sleep(1);
    return;
  }

  if (!data?.token) {
    authMissingRate.add(true);
    sleep(1);
    return;
  }

  const connectStarted = Date.now();
  const url = `${WS_BASE_URL}/ws/messages?since=0&token=${encodeURIComponent(data.token)}`;
  const response = ws.connect(url, { tags: { endpoint: "ws_messages", load_tier: LOAD_TIER } }, (socket) => {
    let gotHello = false;
    const sessionStart = Date.now();

    socket.on("open", () => {
      wsConnectRate.add(true);
      wsConnectTime.add(Date.now() - connectStarted);
    });

    socket.on("message", (message) => {
      const text = String(message || "");
      if (text.includes("\"type\":\"hello\"") || text.includes("\"type\":\"events\"")) {
        gotHello = true;
      }
    });

    socket.on("error", () => {
      wsConnectRate.add(false);
    });

    socket.setTimeout(() => {
      wsHelloRate.add(gotHello);
      wsSessionTime.add(Date.now() - sessionStart);
      socket.close();
    }, 2000 + Math.floor(Math.random() * 1000));
  });

  check(response, { "ws status is 101": (r) => r && r.status === 101 });
  sleep(0.1);
}
