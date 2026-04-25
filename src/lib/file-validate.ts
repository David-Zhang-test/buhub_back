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

const M4A_FTYP_BRANDS = new Set(["M4A ", "M4B ", "M4P ", "isom", "iso2", "mp41", "mp42"]);

function validateM4aMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  if (buffer.subarray(4, 8).toString("ascii") !== "ftyp") return false;

  const majorBrand = buffer.subarray(8, 12).toString("ascii");
  if (M4A_FTYP_BRANDS.has(majorBrand)) return true;

  for (let offset = 16; offset + 4 <= Math.min(buffer.length, 40); offset += 4) {
    const brand = buffer.subarray(offset, offset + 4).toString("ascii");
    if (M4A_FTYP_BRANDS.has(brand)) return true;
  }

  return false;
}

function validateCafMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return buffer.subarray(0, 4).toString("ascii") === "caff";
}

function validateWavMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  const riff = buffer.subarray(0, 4).toString("ascii");
  const wave = buffer.subarray(8, 12).toString("ascii");
  return riff === "RIFF" && wave === "WAVE";
}

function validateAacMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 2) return false;
  // ADTS syncword 0xFFF (first 12 bits) commonly starts with 0xFFF1 / 0xFFF9.
  return buffer[0] === 0xff && (buffer[1] & 0xf0) === 0xf0;
}

/** AMR-WB MIME storage (RFC 4867 style) or 3GP container from Android MediaRecorder. */
function validateAmrWbMagicBytes(buffer: Buffer): boolean {
  if (buffer.length >= 9) {
    const magic = buffer.subarray(0, 9).toString("ascii");
    if (magic === "#!AMR-WB\n") return true;
  }
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const major = buffer.subarray(8, 12).toString("ascii");
    if (/^3gp[0-9]$/.test(major) || major === "3g2a" || major === "3ge7") return true;
  }
  return false;
}

export function validateFileMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "audio/amr-wb") {
    return validateAmrWbMagicBytes(buffer);
  }
  if (mimeType === "audio/m4a" || mimeType === "audio/mp4" || mimeType === "audio/x-m4a") {
    return validateM4aMagicBytes(buffer);
  }
  if (mimeType === "audio/x-caf") {
    return validateCafMagicBytes(buffer);
  }
  if (mimeType === "audio/wav") {
    return validateWavMagicBytes(buffer);
  }
  if (mimeType === "audio/aac") {
    return validateAacMagicBytes(buffer);
  }

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

export function validateImageMagicBytes(buffer: Buffer, mimeType: string): boolean {
  return validateFileMagicBytes(buffer, mimeType);
}
