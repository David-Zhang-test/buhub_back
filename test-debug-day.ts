import { detectText } from "./src/lib/schedule/ocr";
import { detectCVBlocks } from "./src/lib/schedule/cv-detect";
import { detectHeaders, buildColumnIntervals, assignDayByInterval } from "./src/lib/schedule/day-detect";

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const imgPath = process.argv[2] || "/Users/krabbypatty/Desktop/UHUB-Development/test_timetable/06d781e2d7dc422399d1c0b85271ad11.jpg";

async function main() {
  console.log(`\n=== Diagnosing: ${imgPath.split("/").pop()} ===\n`);

  // Step 1: OCR
  const ocr = await detectText(imgPath);
  console.log(`[OCR] ${ocr.words.length} words, image ${ocr.imageWidth}x${ocr.imageHeight}`);

  // Step 2: Time scale (simplified)
  const timePat = /^\d{1,2}([:.]\d{2})?$/;
  const statusBarY = ocr.imageHeight * 0.08;
  const timeWords = ocr.words.filter(w => w.bounds.y > statusBarY && timePat.test(w.text.trim()));
  const sortedTime = [...timeWords].sort((a, b) => a.bounds.x - b.bounds.x);
  const leftX = sortedTime[0]?.bounds.x || 0;
  const colWords = sortedTime.filter(w => Math.abs(w.bounds.x - leftX) < ocr.imageWidth * 0.05);
  const timeColumnMaxX = colWords.length > 0 ? Math.max(...colWords.map(w => w.bounds.x + w.bounds.width)) : 0;
  console.log(`[TimeCol] timeColumnMaxX = ${timeColumnMaxX}`);

  // Step 3: Headers
  const headers = detectHeaders(ocr.words, ocr.imageHeight);
  console.log(`\n[Headers] ${headers.length} detected:`);
  for (const h of headers) {
    console.log(`  ${DAY[h.dayOfWeek].padEnd(3)} xCenter=${h.xCenter.toFixed(0)}`);
  }

  // Step 4: CV
  const cv = await detectCVBlocks(imgPath);
  console.log(`\n[CV] ${cv.blocks.length} blocks, ${cv.gridColumns.length} gridColumns`);
  for (const gc of cv.gridColumns) {
    console.log(`  gridCol: L=${gc.left} R=${gc.right} C=${gc.center} W=${gc.right - gc.left}`);
  }

  // Step 5: Build column intervals
  const intervals = buildColumnIntervals({
    gridColumns: cv.gridColumns,
    headers,
    cvBlocks: cv.blocks,
    timeColumnMaxX,
    imageWidth: ocr.imageWidth,
  });
  console.log(`\n[Intervals] ${intervals.length} column intervals (strategy used: ${cv.gridColumns.filter(gc => gc.center >= timeColumnMaxX).length >= 2 ? "GRID" : headers.length >= 2 ? "HEADERS" : "CLUSTERING"}):`);
  for (const iv of intervals) {
    console.log(`  ${DAY[iv.dayOfWeek].padEnd(3)} xMin=${iv.xMin.toFixed(0).padStart(5)} xMax=${iv.xMax.toFixed(0).padStart(5)} xCenter=${iv.xCenter.toFixed(0).padStart(5)}`);
  }

  // Step 6: Map each block to a day
  console.log(`\n[Block → Day mapping]`);
  const blocksSorted = [...cv.blocks].sort((a, b) => a.x - b.x || a.y - b.y);
  for (const b of blocksSorted) {
    const cx = b.x + b.width / 2;
    const day = assignDayByInterval(cx, intervals);

    // Find OCR text inside block
    const textsInBlock: string[] = [];
    for (const w of ocr.words) {
      const wcx = w.bounds.x + w.bounds.width / 2;
      const wcy = w.bounds.y + w.bounds.height / 2;
      if (wcx >= b.x - 10 && wcx <= b.x + b.width + 10 && wcy >= b.y - 10 && wcy <= b.y + b.height + 10) {
        textsInBlock.push(w.text.trim());
      }
    }
    const label = textsInBlock.slice(0, 3).join(" ") || "(no text)";
    console.log(`  block cx=${cx.toFixed(0).padStart(5)} → ${DAY[day].padEnd(3)}  [${label}]  (x=${b.x}, w=${b.width}, y=${b.y})`);
  }
}

main().catch(e => console.error(e.message));
