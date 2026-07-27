// Q69 inc.1 — the noise list the ladder's rung 4 reads.
//
// HONEST SCOPE: this is a FIRST TRANCHE (~90 domains), not the ~490 Macro
// carries. It is retyped from category knowledge, not copied from their file,
// and carries no upstream attribution (rules of engagement). The Phase-A plan
// puts this list in a `generic_email_domains` TABLE so Rob can edit it without
// a deploy; this constant is the seed for that table and the default for the
// pure ladder until the table exists.
//
// The stated intent, which the list must keep: block TOOLS, CONSUMER BRANDS and
// BULK SENDERS — never real correspondents. Law firms, banks, title companies,
// suppliers and roofing manufacturers are customers and referral sources in
// Rob's graph; not one of them belongs here.

// Consumer / free mailbox providers — where a homeowner or a one-man roofer mails from.
const CONSUMER = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "rocketmail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "comcast.net",
  "verizon.net",
  "att.net",
  "sbcglobal.net",
  "bellsouth.net",
  "cox.net",
  "charter.net",
  "earthlink.net",
  "juno.com",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "zoho.com",
  "proton.me",
  "protonmail.com",
  "yandex.com",
  "hey.com",
];

// Disposable / throwaway.
const DISPOSABLE = [
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
  "trashmail.com",
  "sharklasers.com",
  "getnada.com",
  "dispostable.com",
  "maildrop.cc",
  "throwawaymail.com",
];

// Privacy relays and forwarders — the address is a mask, never a company.
const RELAY = [
  "privaterelay.appleid.com",
  "icloud.com.relay",
  "duck.com",
  "simplelogin.com",
  "simplelogin.io",
  "anonaddy.com",
  "addy.io",
  "relay.firefox.com",
  "users.noreply.github.com",
];

// SaaS vendors — these mail us constantly and are never a customer record.
const SAAS = [
  "github.com",
  "gitlab.com",
  "stripe.com",
  "slack.com",
  "notion.so",
  "atlassian.com",
  "zoom.us",
  "docusign.net",
  "docusign.com",
  "calendly.com",
  "intercom.io",
  "hubspot.com",
  "salesforce.com",
  "quickbooks.com",
  "intuit.com",
  "vercel.com",
  "supabase.io",
  "supabase.com",
  "anthropic.com",
  "openai.com",
  "twilio.com",
  "n8n.io",
];

// Consumer brands — receipts and shipping mail, never a relationship.
const BRANDS = [
  "amazon.com",
  "apple.com",
  "google.com",
  "microsoft.com",
  "paypal.com",
  "venmo.com",
  "ebay.com",
  "walmart.com",
  "homedepot.com",
  "lowes.com",
  "ups.com",
  "fedex.com",
  "usps.com",
  "uber.com",
  "lyft.com",
  "doordash.com",
  "linkedin.com",
  "facebookmail.com",
  "x.com",
  "indeed.com",
];

// Bulk senders / ESP bounce domains — the envelope host, not the sender.
const BULK = [
  "mailchimp.com",
  "mcsv.net",
  "mandrillapp.com",
  "sendgrid.net",
  "sparkpostmail.com",
  "mailgun.org",
  "amazonses.com",
  "constantcontact.com",
  "cmail19.com",
  "createsend.com",
  "klaviyomail.com",
  "substack.com",
  "beehiiv.com",
  "eventbrite.com",
];

export const GENERIC_EMAIL_DOMAINS: string[] = [
  ...CONSUMER,
  ...DISPOSABLE,
  ...RELAY,
  ...SAAS,
  ...BRANDS,
  ...BULK,
];

export function genericDomainSet(extra: Iterable<string> = []): Set<string> {
  const set = new Set(GENERIC_EMAIL_DOMAINS.map((d) => d.toLowerCase()));
  for (const d of extra) {
    const clean = d.trim().toLowerCase();
    if (clean) set.add(clean);
  }
  return set;
}
