import fs from "fs";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = process.env.OPENROUTER_API_KEY!;

const MODELS = [
  "google/gemini-2.5-flash",
  "qwen/qwen3-vl-235b-a22b-instruct",
  "qwen/qwen-vl-max",
];

const IMAGES = [
  { name: "bef064fd (mobile, 5 days)", path: "/Users/krabbypatty/Desktop/UHUB-Development/test_timetable/bef064fd19137f58ad69b97c95f2b01d.jpg" },
  { name: "96bb03cb (web, 6 days)", path: "/Users/krabbypatty/Desktop/UHUB-Development/test_timetable/96bb03cb266056ffb6b3eaf4e726e06e.jpg" },
];

function detectMime(buf: Buffer): string {
  if (buf[0] === 0xFF && buf[1] === 0xD8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  return "image/jpeg";
}

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const PROMPT = `Extract ALL courses from this HKBU timetable image.

Rules:
- Course codes: [A-Z]{2,4}\\d{3,4} (e.g. COMP2112)
- dayOfWeek: Mon=1 Tue=2 Wed=3 Thu=4 Fri=5 Sat=6 Sun=7
- startTime/endTime: "HH:mm" 24h, on :00 or :30 boundaries
- Duration: integer hours (1h, 2h, or 3h)
- location: HKBU room code or ""
- No overlapping courses on the same day

Return ONLY a JSON array: [{"name","location","dayOfWeek","startTime","endTime"}]`;

async function testModel(model: string, imgPath: string): Promise<{ courses: any[]; elapsed: number }> {
  const buf = fs.readFileSync(imgPath);
  const mime = detectMime(buf);
  const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;

  const t0 = Date.now();
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://uhub.help",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Return ONLY a JSON array. No markdown, no explanation." },
        { role: "user", content: [
          { type: "image_url", image_url: { url: dataUrl } },
          { type: "text", text: PROMPT },
        ]},
      ],
      max_tokens: 2048,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const elapsed = (Date.now() - t0) / 1000;

  if (!res.ok) {
    const err = await res.text();
    return { courses: [{ error: `HTTP ${res.status}: ${err.slice(0, 100)}` }], elapsed };
  }

  const data = await res.json() as any;
  const content = data?.choices?.[0]?.message?.content || "";
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  
  try {
    const parsed = JSON.parse(cleaned);
    return { courses: Array.isArray(parsed) ? parsed : [], elapsed };
  } catch {
    return { courses: [{ error: "JSON parse failed", raw: cleaned.slice(0, 200) }], elapsed };
  }
}

async function main() {
  for (const img of IMAGES) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`IMAGE: ${img.name}`);
    console.log("=".repeat(70));

    for (const model of MODELS) {
      console.log(`\n--- ${model} ---`);
      try {
        const { courses, elapsed } = await testModel(model, img.path);
        if (courses[0]?.error) {
          console.log(`  ERROR: ${courses[0].error}`);
          continue;
        }
        const byDay = new Map<number, any[]>();
        for (const c of courses) {
          const d = c.dayOfWeek || 0;
          if (!byDay.has(d)) byDay.set(d, []);
          byDay.get(d)!.push(c);
        }
        const days = [...byDay.keys()].sort((a, b) => a - b);
        console.log(`  ${courses.length} courses, days: [${days.map(d => DAY[d] || "?").join(", ")}], ${elapsed.toFixed(1)}s`);
        for (const d of days) {
          for (const c of byDay.get(d)!.sort((a: any, b: any) => (a.startTime || "").localeCompare(b.startTime || ""))) {
            console.log(`  ${(DAY[d]||"?").padEnd(3)} ${c.startTime}-${c.endTime}  ${(c.name||"").padEnd(12)} ${c.location || ""}`);
          }
        }
      } catch (e: any) {
        console.log(`  FAIL: ${e.message}`);
      }
    }
  }
}

main();
