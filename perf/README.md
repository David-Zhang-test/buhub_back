# Local backend load test

This folder contains local-only load test scripts for backend HTTP + Redis + WebSocket paths.

## Coverage

Public HTTP (no token required):

- `GET /api/forum/search?q=test&page=1&limit={20|50|100}`
- `GET /api/feed/trending?timeframe=7d&page=1&limit={20|50|100}`
- `GET /api/forum/circles`
- `GET /api/forum/circles/general`
- `GET /api/ratings/course?page=1&limit={20|50|100}`

Authenticated HTTP (Redis-heavy):

- `GET /api/feed/following?page=1&limit={20|50|100}`

WebSocket:

- `GET /ws/messages?since=0&token=...` (handshake + hello/events receive)

## 1) k6 main script

File: `perf/k6-local-api.js`

Run default (medium tier, all scenarios enabled):

```bash
npm run perf:k6:local
```

### Key environment variables

- `BASE_URL` (default `http://127.0.0.1:3000`)
- `WS_BASE_URL` (default follows `BASE_URL`)
- `LOAD_TIER`: `light | medium | heavy`
- `LIMITS`: default `20,50,100`
- `SCENARIOS`: comma-separated scenario names
- `WS_ENABLED`: `1` or `0`

Auth for `auth_following` and `ws_messages`:

- Option A: pass token directly with `AUTH_TOKEN` (or `WS_TOKEN`)
- Option B: auto-login in `setup()` with `LOGIN_EMAIL` + `LOGIN_PASSWORD`

### Scenario names

- `public_search`
- `public_trending`
- `redis_circles`
- `public_ratings`
- `auth_following`
- `ws_messages`

### Example commands

Run only public HTTP in heavy tier:

```bash
LOAD_TIER=heavy SCENARIOS=public_search,public_trending,redis_circles,public_ratings npm run perf:k6:local
```

Run authenticated + WebSocket:

```bash
LOAD_TIER=medium LOGIN_EMAIL=your@email.com LOGIN_PASSWORD=your_password SCENARIOS=auth_following,ws_messages npm run perf:k6:local
```

Disable websocket temporarily:

```bash
WS_ENABLED=0 npm run perf:k6:local
```

## 2) autocannon fallback (HTTP quick check)

File: `perf/autocannon-local-api.js`

Run:

```bash
npm run perf:autocannon:local
```

Overrides:

```bash
BASE_URL=http://127.0.0.1:3000 CONNECTIONS=20 DURATION=20 npm run perf:autocannon:local
```

## Local-only reminder

Do not point `BASE_URL` or `WS_BASE_URL` to remote/staging/production while validating these scripts.
