// buhub_back/src/lib/schedule/cv-detect.ts
// Calls Python OpenCV script to detect colored course block rectangles
import { execFile } from "child_process";
import path from "path";
import type { CVBlock, GridColumn } from "./types";

const SCRIPT_PATH = path.resolve(process.cwd(), "scripts/detect-blocks.py");

export async function detectCVBlocks(source: string | Buffer): Promise<{
  blocks: CVBlock[];
  gridColumns: GridColumn[];
  imageWidth: number;
  imageHeight: number;
}> {
  return new Promise((resolve) => {
    const isBuffer = Buffer.isBuffer(source);
    const arg = isBuffer ? "-" : source;

    const pythonPath = process.env.PYTHON_CV_PATH || (process.platform === "darwin" ? "/usr/bin/python3" : "python3");
    
    const child = execFile(pythonPath, [SCRIPT_PATH, arg], { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        console.error("[CV] Process error:", error.message);
        if (stderr) console.error("[CV] stderr:", stderr);
        resolve({ blocks: [], gridColumns: [], imageWidth: 0, imageHeight: 0 });
        return;
      }

      try {
        const result = JSON.parse(stdout);
        if (result.error) {
          console.warn("[CV] Script returned error:", result.error);
          resolve({ blocks: [], gridColumns: [], imageWidth: 0, imageHeight: 0 });
          return;
        }

        resolve({
          blocks: (result.blocks || []).map((b: any) => ({
            x: Number(b.x),
            y: Number(b.y),
            width: Number(b.width),
            height: Number(b.height),
          })),
          gridColumns: (result.gridColumns || []).map((c: any) => ({
            left: Number(c.left),
            right: Number(c.right),
            center: Number(c.center),
            index: Number(c.index),
          })),
          imageWidth: Number(result.imageWidth) || 0,
          imageHeight: Number(result.imageHeight) || 0,
        });
      } catch (parseErr) {
        console.error("[CV] Failed to parse JSON output:", stdout);
        resolve({ blocks: [], gridColumns: [], imageWidth: 0, imageHeight: 0 });
      }
    });

    if (isBuffer && child.stdin) {
      child.stdin.write(source);
      child.stdin.end();
    }
  });
}
