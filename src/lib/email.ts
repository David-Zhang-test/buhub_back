/**
 * Transactional email via Resend HTTP API only (no SMTP).
 *
 * Configure: RESEND_API_KEY, EMAIL_FROM (e.g. noreply@yourdomain.com)
 */

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const RESEND_TIMEOUT_MS = 20000;

async function sendViaResend(options: SendEmailOptions): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM must be set when using Resend");

  if (!apiKey) throw new Error("RESEND_API_KEY not set");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Resend API error ${res.status}: ${err}`);
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Email service timeout - Resend API unreachable or slow");
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Send email via Resend. In development without RESEND_API_KEY, logs to console only.
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const { to, subject, text } = options;

  if (process.env.NODE_ENV === "development" && !process.env.RESEND_API_KEY) {
    console.log("[Email] Development mode - not sending:\n", { to, subject, text });
    return;
  }

  try {
    if (process.env.RESEND_API_KEY) {
      await sendViaResend(options);
    } else {
      console.warn("[Email] No provider configured (set RESEND_API_KEY). Email not sent:", {
        to,
        subject,
      });
    }
  } catch (error) {
    console.error("[Email] Send failed:", error);
    throw error;
  }
}
