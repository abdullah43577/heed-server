import type { EmailAction, EmailCategory } from "../../generated/prisma/client";

export interface ReportTotals {
  total: number;
  read: number;
  worthALook: number;
  leftForYou: number;
  awaitingReply: number;
  byCategory: Record<EmailCategory, number>;
  byAccount: { mailAccountId: string; email: string; total: number; read: number }[];
}

interface CountableMessage {
  category: EmailCategory | null;
  action: EmailAction | null;
  mailAccount: { id: string; email: string };
}

const emptyCategories = (): Record<EmailCategory, number> => ({
  NEEDS_REPLY: 0,
  IMPORTANT: 0,
  ROUTINE: 0,
  NEWSLETTER: 0,
  PROMOTION: 0,
  UNSURE: 0,
});

export const computeTotals = function (messages: CountableMessage[]): ReportTotals {
  const byCategory = emptyCategories();
  const accounts = new Map<string, ReportTotals["byAccount"][number]>();
  let read = 0;

  for (const message of messages) {
    if (!message.category) continue;
    byCategory[message.category] += 1;

    const isRead = message.action === "MARKED_READ";
    if (isRead) read += 1;

    const account = accounts.get(message.mailAccount.id) ?? {
      mailAccountId: message.mailAccount.id,
      email: message.mailAccount.email,
      total: 0,
      read: 0,
    };
    account.total += 1;
    if (isRead) account.read += 1;
    accounts.set(account.mailAccountId, account);
  }

  return {
    total: Object.values(byCategory).reduce((sum, count) => sum + count, 0),
    read,
    worthALook: byCategory.IMPORTANT,
    leftForYou: byCategory.UNSURE,
    awaitingReply: messages.filter(message => message.action === "AWAITING_REPLY").length,
    byCategory,
    byAccount: [...accounts.values()].sort((a, b) => b.total - a.total),
  };
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const details = function (totals: ReportTotals) {
  return [
    totals.worthALook > 0 && `${totals.worthALook} worth a look`,
    totals.awaitingReply > 0 && `${totals.awaitingReply} waiting on a reply`,
    totals.leftForYou > 0 && `${totals.leftForYou} left for you`,
  ].filter((part): part is string => !!part);
};

export const reportHeadline = function (totals: ReportTotals) {
  if (totals.total === 0) return "A quiet day: no new mail";
  return [`${totals.read} read for you`, ...details(totals)].join(" · ");
};

export const reportPush = function (totals: ReportTotals) {
  const rest = details(totals);

  return {
    title: `Heed read ${plural(totals.read, "email", "emails")} today`,
    body: rest.length > 0 ? rest.join(" · ") : "Nothing needs you. Tap to see what came in.",
  };
};
