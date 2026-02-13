/**
 * Email service for sending verification codes and transactional emails.
 * Replace the implementation with SMTP (nodemailer) or a provider (Resend, SendGrid, SES).
 */

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send email. In development, logs to console. Configure SMTP for production.
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const { to, subject, text } = options;

  if (process.env.NODE_ENV === "development") {
    // Log full text so devs can copy verification codes from console
    console.log("[Email] Development mode - not sending:\n", {
      to,
      subject,
      text,
    });
    return;
  }

  // TODO: Implement SMTP or email provider (Resend, SendGrid, AWS SES)
  // Example with nodemailer:
  // const transporter = nodemailer.createTransport({ ... });
  // await transporter.sendMail({ from: process.env.EMAIL_FROM, to, subject, text });
  console.warn("[Email] No email provider configured. Email not sent:", {
    to,
    subject,
  });
}
