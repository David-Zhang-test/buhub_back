import { parseScheduleImage } from "./src/lib/schedule/index";

const images = [
  { name: "bef064fd", path: "/Users/krabbypatty/Desktop/UHUB-Development/test_timetable/bef064fd19137f58ad69b97c95f2b01d.jpg" },
  { name: "ff52ea4d", path: "/Users/krabbypatty/Desktop/UHUB-Development/test_timetable/ff52ea4d633dafbe2b088503e41e06a9.jpg" },
  { name: "96bb03cb", path: "/Users/krabbypatty/Desktop/UHUB-Development/test_timetable/96bb03cb266056ffb6b3eaf4e726e06e.jpg" },
  { name: "06d781e2", path: "/Users/krabbypatty/Desktop/UHUB-Development/test_timetable/06d781e2d7dc422399d1c0b85271ad11.jpg" },
  { name: "65ea9c24", path: "/Users/krabbypatty/Desktop/UHUB-Development/test_timetable/65ea9c247ce9fdbbc2d6f4994a72157f.jpg" },
];

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

async function main() {
  for (const img of images) {
    console.log(`\n=== ${img.name} ===`);
    const t0 = Date.now();
    try {
      const courses = await parseScheduleImage(img.path);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const byDay = new Map<number, typeof courses>();
      for (const c of courses) {
        if (!byDay.has(c.dayOfWeek)) byDay.set(c.dayOfWeek, []);
        byDay.get(c.dayOfWeek)!.push(c);
      }
      const days = [...byDay.keys()].sort((a, b) => a - b);
      console.log(`  ${courses.length} courses, days: [${days.map(d => DAY_NAMES[d]).join(", ")}], ${elapsed}s`);
      for (const d of days) {
        const dc = byDay.get(d)!;
        dc.sort((a, b) => a.startTime.localeCompare(b.startTime));
        for (const c of dc) {
          console.log(`  ${DAY_NAMES[d].padEnd(3)} ${c.startTime}-${c.endTime}  ${c.name.padEnd(12)} ${c.location}`);
        }
      }
    } catch (e: any) {
      console.log(`  ERROR: ${e.message}`);
    }
  }
}

main();
