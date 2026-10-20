import type { EmailCategory } from "../../generated/prisma/client";
import type { FullMessage } from "../gmail/message";

type Headers = Pick<FullMessage, "labels" | "to" | "listUnsubscribe" | "precedence">;

const NO_REPLY_SENDER = /^(no-?reply|do-?not-?reply|notifications?|mailer-daemon|bounces?)[@+.-]/i;

export const matchesSenderPattern = function (pattern: string, fromEmail: string) {
  return pattern.startsWith("@") ? fromEmail.endsWith(pattern) : fromEmail === pattern;
};

export const isBulkSender = function (fromEmail: string, message: Headers) {
  return (
    !!message.listUnsubscribe ||
    /^(bulk|list|junk)$/i.test(message.precedence.trim()) ||
    NO_REPLY_SENDER.test(fromEmail)
  );
};

export const isAddressedDirectly = function (accountEmail: string, message: Headers) {
  return message.to.toLowerCase().includes(accountEmail.toLowerCase());
};

// Gmail's own promotions tab is reliable enough to skip the model entirely.
export const headerCategory = function (message: Headers): EmailCategory | null {
  return message.labels.includes("CATEGORY_PROMOTIONS") ? "PROMOTION" : null;
};

// The backlog also trusts the Social tab: notifications from networks, never a person writing to you.
export const backlogHeaderCategory = function (message: Headers): EmailCategory | null {
  if (message.labels.includes("CATEGORY_SOCIAL")) return "ROUTINE";
  return headerCategory(message);
};
