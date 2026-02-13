/**
 * Temp-mail / disposable email domain blocklist.
 * Expand this list or use an API (e.g. disposable-email-domains) for production.
 * @see https://github.com/disposable-email-domains/disposable-email-domains
 */

const TEMP_MAIL_DOMAINS = new Set([
  "10minutemail.com",
  "10minutemail.net",
  "guerrillamail.com",
  "guerrillamail.org",
  "mailinator.com",
  "tempmail.com",
  "tempmail.net",
  "throwaway.email",
  "yopmail.com",
  "maildrop.cc",
  "temp-mail.org",
  "fakeinbox.com",
  "trashmail.com",
  "getnada.com",
  "sharklasers.com",
  "guerrillamail.info",
  "grr.la",
  "guerrillamail.biz",
  "guerrillamail.de",
  "spam4.me",
  "dispostable.com",
  "mailnesia.com",
  "mohmal.com",
  "emailondeck.com",
  "33mail.com",
  "inboxkitten.com",
  "mintemail.com",
  "emailfake.com",
  "tmpeml.com",
  "burnermail.io",
  "mail.tm",
  "ethereal.email",
  "mailnesia.com",
  "tempail.com",
  "anonbox.net",
  "mytemp.email",
  "tempinbox.com",
  "tempinbox.co.uk",
  "discard.email",
  "discard.tk",
  "discardmail.com",
  "discardmail.de",
  "mytrashmail.com",
  "trashmail.ws",
  "trashmail.net",
  "trashmail.org",
  "jetable.org",
  "mail-temp.com",
  "emailondeck.com",
  "spamgourmet.com",
  "mailcatch.com",
  "inbox.com",
  "sharklasers.com",
  "spam4.me",
  "mintemail.com",
  "yep.it",
  "mohmal.in",
  "mintemail.com",
  "temp-mail.io",
]);

export function isTempMail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return TEMP_MAIL_DOMAINS.has(domain);
}
