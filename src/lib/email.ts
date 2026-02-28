/**
 * Email service for verification codes and transactional emails.
 * Supports: SMTP (nodemailer) or Resend API.
 *
 * Configure via env:
 * - SMTP: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM
 * - Resend: RESEND_API_KEY, EMAIL_FROM (e.g. noreply@yourdomain.com)
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transporter: Transporter | null = null;

function initTransporter(): Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

const RESEND_TIMEOUT_MS = 20000; // 20s - avoid hanging if Resend is slow/unreachable

async function sendViaResend(options: SendEmailOptions): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";

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

async function sendViaSmtp(options: SendEmailOptions): Promise<void> {
  const trans = initTransporter();
  if (!trans) throw new Error("SMTP not configured");

  const from = process.env.EMAIL_FROM || "noreply@buhub.app";

  await trans.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
}

/**
 * Send email. Uses Resend if RESEND_API_KEY is set, else SMTP if configured.
 * In development with no provider, logs to console.
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const { to, subject, text } = options;

  if (process.env.NODE_ENV === "development" && !process.env.SMTP_HOST && !process.env.RESEND_API_KEY) {
    console.log("[Email] Development mode - not sending:\n", { to, subject, text });
    return;
  }

  try {
    if (process.env.RESEND_API_KEY) {
      await sendViaResend(options);
    } else if (initTransporter()) {
      await sendViaSmtp(options);
    } else {
      console.warn("[Email] No provider configured (set SMTP_* or RESEND_API_KEY). Email not sent:", {
        to,
        subject,
      });
    }
  } catch (error) {
    console.error("[Email] Send failed:", error);
    throw error;
  }
}
