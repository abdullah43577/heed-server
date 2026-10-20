import type { EmailCategory } from "../../generated/prisma/client";
import type { FullMessage } from "../gmail/message";

type Headers = Pick<FullMessage, "labels" | "to" | "listUnsubscribe" | "precedence">;

const NO_REPLY_SENDER = /^(no-?reply|do-?not-?reply|notifications?|mailer-daemon|bounces?)[@+.-]/i;

export const matchesSenderPattern = function (pattern: string, fromEmail: string) {
  return pattern.startsWith("@") ? fromEmail.endsWith(pattern) : fromEmail === pattern;
};

interface RuleLike {
  pattern: string;
  kind: "ALWAYS_LEAVE" | "ALWAYS_HANDLE" | "NEVER_DRAFT";
  mailAccountId: string | null;
}

export interface ResolvedRules {
  read: "LEAVE" | "HANDLE" | null;
  neverDraft: boolean;
}

// An address beats a domain, then this account's rule beats an every-account one; a tie goes to
// "leave it", the side that cannot mark something read by mistake.
const specificity = (rule: RuleLike) => (rule.pattern.startsWith("@") ? 0 : 2) + (rule.mailAccountId ? 1 : 0);

export const resolveSenderRules = function (rules: RuleLike[], fromEmail: string, mailAccountId: string): ResolvedRules {
  const matching = rules.filter(
    rule =>
      (rule.mailAccountId === null || rule.mailAccountId === mailAccountId) &&
      matchesSenderPattern(rule.pattern, fromEmail.toLowerCase()),
  );

  const readRules = matching
    .filter(rule => rule.kind !== "NEVER_DRAFT")
    .sort((a, b) => specificity(b) - specificity(a) || (a.kind === "ALWAYS_LEAVE" ? -1 : 1));

  const top = readRules[0];
  return {
    read: top ? (top.kind === "ALWAYS_LEAVE" ? "LEAVE" : "HANDLE") : null,
    neverDraft: matching.some(rule => rule.kind === "NEVER_DRAFT"),
  };
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
