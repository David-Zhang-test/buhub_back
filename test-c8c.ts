import { parseScheduleImage } from "./src/lib/schedule/index";

const IMAGE_PATH = "/Users/krabbypatty/Desktop/文件夹/UHUB-Development/c8cd5fbd3ec7300a3ab23aca379008b6.jpg";
const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

async function main() {
  console.log(`\n=== c8cd5fbd ===`);
  const t0 = Date.now();
  const { courses, meta } = await parseScheduleImage(IMAGE_PATH);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const byDay = new Map<number, typeof courses>();
  for (const c of courses) {
    if (!byDay.has(c.dayOfWeek)) byDay.set(c.dayOfWeek, []);
    byDay.get(c.dayOfWeek)!.push(c);
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  console.log(`  ${courses.length} courses, days: [${days.map(d => DAY_NAMES[d]).join(", ")}], ${elapsed}s`);
  console.log(`  meta: tier=${meta.dayDetectionTier} headers=${meta.dayHeadersFound} cols=${meta.columnCount}`);
  for (const d of days) {
    const dc = byDay.get(d)!;
    dc.sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (const c of dc) {
      console.log(`  ${DAY_NAMES[d].padEnd(3)} ${c.startTime}-${c.endTime}  ${c.name.padEnd(12)} ${c.location}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
