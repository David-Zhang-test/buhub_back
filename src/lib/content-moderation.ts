/**
 * Content moderation via OpenAI Moderation API (omni-moderation-latest).
 * Supports both text and image moderation. Free to use.
 *
 * Behaviour: fail-open — if the API is down or times out, content is allowed
 * through and the error is logged. Moderation should never be a single point
 * of failure that blocks the entire app.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODERATION_MODEL = "omni-moderation-latest";
const TIMEOUT_MS = 8_000;

export interface ModerationResult {
  flagged: boolean;
  categories: string[];
}

const PASS: ModerationResult = { flagged: false, categories: [] };

function isEnabled(): boolean {
  return !!OPENAI_API_KEY;
}

function extractCategories(result: Record<string, boolean>): string[] {
  return Object.entries(result)
    .filter(([, v]) => v)
    .map(([k]) => k);
}

async function callModeration(
  input: unknown
): Promise<ModerationResult> {
  if (!isEnabled()) return PASS;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODERATION_MODEL, input }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      console.error(`[moderation] OpenAI API error: ${res.status} ${res.statusText}`);
      return PASS;
    }

    const body = await res.json();
    const first = body?.results?.[0];
    if (!first) return PASS;

    return {
      flagged: first.flagged,
      categories: extractCategories(first.categories ?? {}),
    };
  } catch (err) {
    console.error("[moderation] Failed to call OpenAI Moderation API:", err);
    return PASS;
  }
}

/**
 * Moderate text content (posts, comments, messages).
 */
export async function moderateText(text: string): Promise<ModerationResult> {
  if (!text.trim()) return PASS;
  return callModeration(text);
}

/**
 * Moderate an image by its publicly accessible URL.
 * Use this when the image has already been saved and has a URL.
 */
export async function moderateImageUrl(imageUrl: string): Promise<ModerationResult> {
  return callModeration([{ type: "image_url", image_url: { url: imageUrl } }]);
}

/**
 * Moderate an image from a raw buffer (base64-encoded for the API).
 * Use this during upload before the file is persisted.
 */
export async function moderateImageBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<ModerationResult> {
  const base64 = buffer.toString("base64");
  const dataUri = `data:${mimeType};base64,${base64}`;
  return callModeration([{ type: "image_url", image_url: { url: dataUri } }]);
}
