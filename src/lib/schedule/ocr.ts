import fs from "fs";
import path from "path";
import type { OCRWord } from "./types";

const VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate";

async function getImageBuffer(imageUrl: string): Promise<Buffer> {
  const uploadsMatch = imageUrl.match(/\/(?:api\/)?uploads\/(.+)$/);
  if (uploadsMatch) {
    const filePath = path.join(path.resolve(process.cwd(), "public/uploads"), uploadsMatch[1]);
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath);
  }
  if (imageUrl.startsWith("file://") || (imageUrl.startsWith("/") && fs.existsSync(imageUrl))) {
    return fs.readFileSync(imageUrl.replace("file://", ""));
  }
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function detectText(imageUrl: string): Promise<{ words: OCRWord[]; imageWidth: number; imageHeight: number }> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_CLOUD_VISION_API_KEY not configured");

  const imgBuffer = await getImageBuffer(imageUrl);

  if (imgBuffer.length > 20 * 1024 * 1024) {
    throw new Error("Image too large (max 20MB)");
  }
  const magic = imgBuffer.slice(0, 4);
  const isJPEG = magic[0] === 0xFF && magic[1] === 0xD8;
  const isPNG = magic[0] === 0x89 && magic[1] === 0x50;
  const isGIF = magic[0] === 0x47 && magic[1] === 0x49;
  const isWebP = magic[0] === 0x52 && magic[1] === 0x49;
  if (!isJPEG && !isPNG && !isGIF && !isWebP) {
    throw new Error("Image too large or unsupported format (accepted: JPEG, PNG, GIF, WebP)");
  }

  const base64 = imgBuffer.toString("base64");

  const body = {
    requests: [{
      image: { content: base64 },
      features: [{ type: "TEXT_DETECTION", maxResults: 500 }],
      imageContext: { languageHints: ["en", "zh"] },
    }],
  };

  const response = await fetch(`${VISION_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("GOOGLE_CLOUD_VISION_API_KEY invalid or unauthorized");
  }
  if (response.status === 429) {
    await new Promise(r => setTimeout(r, 1000));
    const retry = await fetch(`${VISION_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!retry.ok) throw new Error(`Vision API rate limited: ${retry.status}`);
    return parseVisionResponse(await retry.json());
  }
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Vision API error ${response.status}: ${errText}`);
  }

  return parseVisionResponse(await response.json());
}

function parseVisionResponse(json: any): { words: OCRWord[]; imageWidth: number; imageHeight: number } {
  const annotations = json.responses?.[0]?.textAnnotations;
  if (!annotations || annotations.length === 0) {
    return { words: [], imageWidth: 0, imageHeight: 0 };
  }

  const fullBounds = annotations[0].boundingPoly?.vertices || [];
  const imageWidth = Math.max(...fullBounds.map((v: any) => v.x || 0));
  const imageHeight = Math.max(...fullBounds.map((v: any) => v.y || 0));

  const words: OCRWord[] = [];
  for (let i = 1; i < annotations.length; i++) {
    const ann = annotations[i];
    const vertices = ann.boundingPoly?.vertices || [];
    if (vertices.length < 4) continue;

    const xs = vertices.map((v: any) => v.x || 0);
    const ys = vertices.map((v: any) => v.y || 0);
    const x = Math.min(...xs);
    const y = Math.min(...ys);

    words.push({
      text: ann.description || "",
      bounds: {
        x,
        y,
        width: Math.max(...xs) - x,
        height: Math.max(...ys) - y,
      },
    });
  }

  return { words, imageWidth, imageHeight };
}
