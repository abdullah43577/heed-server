import type { EmailCategory } from "../../generated/prisma/client";
import type { FullMessage } from "../gmail/message";

const NO_REPLY_SENDER = /^(no-?reply|do-?not-?reply|notifications?|mailer-daemon|bounces?)[@+.-]/i;

export const matchesSenderPattern = function (pattern: string, fromEmail: string) {
  return pattern.startsWith("@") ? fromEmail.endsWith(pattern) : fromEmail === pattern;
};

export const isBulkSender = function (fromEmail: string, message: FullMessage) {
  return (
    !!message.listUnsubscribe ||
    /^(bulk|list|junk)$/i.test(message.precedence.trim()) ||
    NO_REPLY_SENDER.test(fromEmail)
  );
};

export const isAddressedDirectly = function (accountEmail: string, message: FullMessage) {
  return message.to.toLowerCase().includes(accountEmail.toLowerCase());
};

// Gmail's own promotions tab is reliable enough to skip the model entirely.
export const headerCategory = function (message: FullMessage): EmailCategory | null {
  return message.labels.includes("CATEGORY_PROMOTIONS") ? "PROMOTION" : null;
};
