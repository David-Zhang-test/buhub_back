// buhub_back/src/lib/schedule/cv-detect.ts
// Calls Python OpenCV script to detect colored course block rectangles
import { execFile } from "child_process";
import path from "path";
import type { CVBlock } from "./types";

const SCRIPT_PATH = path.resolve(process.cwd(), "scripts/detect-blocks.py");

export async function detectCVBlocks(imagePath: string): Promise<{
  blocks: CVBlock[];
  imageWidth: number;
  imageHeight: number;
}> {
  return new Promise((resolve, reject) => {
    // Use system Python which has cv2 installed (Homebrew Python may not)
    // macOS: /usr/bin/python3 (system Python with cv2)
    // Docker: python3 (installed via apt in Dockerfile)
    const pythonPath = process.env.PYTHON_CV_PATH || (process.platform === "darwin" ? "/usr/bin/python3" : "python3");
    execFile(pythonPath, [SCRIPT_PATH, imagePath], { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        console.log("[cv-detect] Python script failed:", error.message);
        resolve({ blocks: [], imageWidth: 0, imageHeight: 0 });
        return;
      }

      try {
        const result = JSON.parse(stdout);
        if (result.error) {
          console.log("[cv-detect] Script error:", result.error);
          resolve({ blocks: [], imageWidth: 0, imageHeight: 0 });
          return;
        }

        resolve({
          blocks: (result.blocks || []).map((b: any) => ({
            x: Number(b.x),
            y: Number(b.y),
            width: Number(b.width),
            height: Number(b.height),
          })),
          imageWidth: Number(result.imageWidth) || 0,
          imageHeight: Number(result.imageHeight) || 0,
        });
      } catch (parseErr) {
        console.log("[cv-detect] JSON parse error:", parseErr);
        resolve({ blocks: [], imageWidth: 0, imageHeight: 0 });
      }
    });
  });
}
