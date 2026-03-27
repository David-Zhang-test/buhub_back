import fs from "fs";
import path from "path";
import type { OCRWord, DocBlock } from "./types";

const VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate";

async function getImageBuffer(imageUrl: string): Promise<Buffer> {
  const uploadsRoot = path.resolve(process.cwd(), "public/uploads");
  const uploadsMatch = imageUrl.match(/\/(?:api\/)?uploads\/(.+)$/);
  if (uploadsMatch) {
    const resolved = path.resolve(uploadsRoot, uploadsMatch[1]);
    if ((resolved.startsWith(uploadsRoot + path.sep) || resolved === uploadsRoot) && fs.existsSync(resolved)) {
      return fs.readFileSync(resolved);
    }
  }
  if (imageUrl.startsWith("file://") || (imageUrl.startsWith("/") && fs.existsSync(imageUrl))) {
    return fs.readFileSync(imageUrl.replace("file://", ""));
  }
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export interface OCRResult {
  words: OCRWord[];
  blocks: DocBlock[];
  imageWidth: number;
  imageHeight: number;
}

export async function detectText(imageUrl: string): Promise<OCRResult> {
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
    throw new Error("Unsupported format (accepted: JPEG, PNG, GIF, WebP)");
  }

  const base64 = imgBuffer.toString("base64");

  const body = {
    requests: [{
      image: { content: base64 },
      features: [
        { type: "DOCUMENT_TEXT_DETECTION" },
      ],
      imageContext: { languageHints: ["en", "zh"] },
    }],
  };

  const doFetch = () => fetch(VISION_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  let response = await doFetch();

  if (response.status === 401 || response.status === 403) {
    throw new Error("GOOGLE_CLOUD_VISION_API_KEY invalid or unauthorized");
  }
  if (response.status === 429) {
    await new Promise(r => setTimeout(r, 1000));
    response = await doFetch();
    if (!response.ok) throw new Error(`Vision API rate limited: ${response.status}`);
  }
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Vision API error ${response.status}: ${errText}`);
  }

  return parseResponse(await response.json());
}

function boundsFromVertices(vertices: any[]): { x: number; y: number; width: number; height: number } {
  const xs = vertices.map((v: any) => v.x || 0);
  const ys = vertices.map((v: any) => v.y || 0);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function parseResponse(json: any): OCRResult {
  const resp = json.responses?.[0];
  if (!resp) return { words: [], blocks: [], imageWidth: 0, imageHeight: 0 };

  // ─── Words from TEXT_DETECTION ──────────────────────────────────────────────
  const annotations = resp.textAnnotations || [];
  let imageWidth = 0;
  let imageHeight = 0;

  if (annotations.length > 0) {
    const fullBounds = annotations[0].boundingPoly?.vertices || [];
    imageWidth = Math.max(...fullBounds.map((v: any) => v.x || 0));
    imageHeight = Math.max(...fullBounds.map((v: any) => v.y || 0));
  }

  const words: OCRWord[] = [];
  for (let i = 1; i < annotations.length; i++) {
    const ann = annotations[i];
    const vertices = ann.boundingPoly?.vertices || [];
    if (vertices.length < 4) continue;
    words.push({ text: ann.description || "", bounds: boundsFromVertices(vertices) });
  }

  // ─── Blocks from DOCUMENT_TEXT_DETECTION ────────────────────────────────────
  const blocks: DocBlock[] = [];
  const fullText = resp.fullTextAnnotation;
  if (fullText?.pages) {
    for (const page of fullText.pages) {
      if (page.width && page.height) {
        imageWidth = page.width;
        imageHeight = page.height;
      }
      for (const block of page.blocks || []) {
        const vertices = block.boundingBox?.vertices || [];
        if (vertices.length < 4) continue;

        // Extract all text from paragraphs → words → symbols
        const text = (block.paragraphs || []).map((p: any) =>
          (p.words || []).map((w: any) =>
            (w.symbols || []).map((s: any) => s.text).join("")
          ).join(" ")
        ).join(" | ");

        blocks.push({ text, bounds: boundsFromVertices(vertices) });
      }
    }
  }

  return { words, blocks, imageWidth, imageHeight };
}
