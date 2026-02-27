/**
 * Validate file content by magic bytes (file signatures).
 * Prevents upload of disguised executable files.
 */

const SIGNATURES: Record<string, number[][]> = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  "image/gif": [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
  ],
  "image/webp": [
    // RIFF (4) + size (4) + WEBP (4) at offset 8
    [0x52, 0x49, 0x46, 0x46],
  ],
};

export function validateImageMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const sigs = SIGNATURES[mimeType];
  if (!sigs) return false;

  for (const sig of sigs) {
    if (buffer.length >= sig.length) {
      const match = sig.every((byte, i) => buffer[i] === byte);
      if (match) {
        if (mimeType === "image/webp" && buffer.length >= 12) {
          return buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
        }
        return true;
      }
    }
  }
  return false;
}
