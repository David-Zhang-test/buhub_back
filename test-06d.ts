import { parseScheduleImage } from "./src/lib/schedule/index";

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

async function main() {
  const imgPath = "/Users/krabbypatty/Desktop/UHUB-Development/test_timetable/06d781e2d7dc422399d1c0b85271ad11.jpg";
  const t0 = Date.now();
  const { courses } = await parseScheduleImage(imgPath);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`Total: ${courses.length} courses, ${elapsed}s\n`);

  const byDay = new Map<number, typeof courses>();
  for (const c of courses) {
    if (!byDay.has(c.dayOfWeek)) byDay.set(c.dayOfWeek, []);
    byDay.get(c.dayOfWeek)!.push(c);
  }

  for (const d of [...byDay.keys()].sort((a, b) => a - b)) {
    const dc = byDay.get(d)!.sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (const c of dc) {
      console.log(`${DAY[d].padEnd(3)}  ${c.startTime}-${c.endTime}  ${c.name.padEnd(12)}  ${c.location}`);
    }
  }
}

main();
