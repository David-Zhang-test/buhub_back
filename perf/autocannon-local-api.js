#!/usr/bin/env node
/* eslint-disable no-console */
const autocannon = require("autocannon");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const API_PREFIX = process.env.API_PREFIX || "/api";
const CONNECTIONS = Number(process.env.CONNECTIONS || 30);
const DURATION = Number(process.env.DURATION || 30);
const PIPELINING = Number(process.env.PIPELINING || 1);

const endpoints = [
  "/forum/search?q=test&page=1&limit=20",
  "/feed/trending?timeframe=7d&page=1&limit=20",
  "/forum/circles",
  "/ratings/course?page=1&limit=20",
];

function runOne(path) {
  return new Promise((resolve, reject) => {
    const instance = autocannon({
      url: `${BASE_URL}${API_PREFIX}${path}`,
      connections: CONNECTIONS,
      duration: DURATION,
      pipelining: PIPELINING,
      method: "GET",
      headers: {
        "x-forwarded-for": "10.20.30.40",
        "x-client-source": "autocannon-local",
      },
    });

    autocannon.track(instance, { renderProgressBar: true });

    instance.on("done", (result) => resolve({ path, result }));
    instance.on("error", reject);
  });
}

async function main() {
  console.log(
    `Running local API load tests on ${BASE_URL}${API_PREFIX} (connections=${CONNECTIONS}, duration=${DURATION}s)`
  );

  const summaries = [];
  for (const path of endpoints) {
    console.log(`\n=== Testing ${path} ===`);
    const data = await runOne(path);
    summaries.push(data);
  }

  console.log("\n=== Summary ===");
  for (const { path, result } of summaries) {
    console.log(
      `${path} | req/sec(avg): ${result.requests.average.toFixed(2)} | p99(ms): ${result.latency.p99} | errors: ${result.errors}`
    );
  }
}

main().catch((error) => {
  console.error("Load test failed:", error.message);
  process.exit(1);
});
