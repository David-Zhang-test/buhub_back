/**
 * hCaptcha server-side token verification
 * @see https://docs.hcaptcha.com/#verify-the-user-response-server-side
 */

const HCAPTCHA_VERIFY_URL = "https://api.hcaptcha.com/siteverify";

export interface HCaptchaVerifyResult {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
}

export async function verifyHcaptchaToken(
  token: string,
  remoteip?: string
): Promise<HCaptchaVerifyResult> {
  const secret = process.env.HCAPTCHA_SECRET_KEY;
  if (!secret) {
    throw new Error("HCAPTCHA_SECRET_KEY not configured");
  }

  const formData = new URLSearchParams();
  formData.append("secret", secret);
  formData.append("response", token);
  if (remoteip) formData.append("remoteip", remoteip);

  const res = await fetch(HCAPTCHA_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  const data = (await res.json()) as HCaptchaVerifyResult;
  return data;
}
