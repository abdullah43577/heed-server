import type { gmail_v1 } from "@googleapis/gmail";
import { isGmailNotFound } from "./client";

export class HistoryExpiredError extends Error {
  constructor() {
    super("Gmail no longer holds history from this cursor");
    this.name = "HistoryExpiredError";
  }
}

export const getCurrentHistoryId = async function (client: gmail_v1.Gmail) {
  const { data } = await client.users.getProfile({ userId: "me" });
  return data.historyId!;
};

// Not filtered to INBOX, so mail the user sends shows up too: a sent message in a thread
// is how a reply made from Gmail itself is noticed.
export const listAddedInboxMessageIds = async function (client: gmail_v1.Gmail, startHistoryId: string) {
  const ids = new Set<string>();
  const sentThreadIds = new Set<string>();
  let historyId = startHistoryId;
  let pageToken: string | undefined;

  try {
    do {
      const { data } = await client.users.history.list({
        userId: "me",
        startHistoryId,
        historyTypes: ["messageAdded"],
        maxResults: 500,
        ...(pageToken && { pageToken }),
      });

      for (const record of data.history ?? []) {
        for (const added of record.messagesAdded ?? []) {
          const labels = added.message?.labelIds ?? [];
          if (added.message?.id && labels.includes("INBOX")) ids.add(added.message.id);
          if (added.message?.threadId && labels.includes("SENT")) sentThreadIds.add(added.message.threadId);
        }
      }

      if (data.historyId) historyId = data.historyId;
      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (error) {
    if (isGmailNotFound(error)) throw new HistoryExpiredError();
    throw error;
  }

  return { ids: [...ids], sentThreadIds: [...sentThreadIds], historyId };
};

export const listUnreadInboxPage = async function (
  client: gmail_v1.Gmail,
  windowDays: number,
  pageToken?: string,
) {
  const { data } = await client.users.messages.list({
    userId: "me",
    q: `in:inbox is:unread newer_than:${windowDays}d`,
    maxResults: 500,
    ...(pageToken && { pageToken }),
  });

  return {
    ids: (data.messages ?? []).flatMap(message => (message.id ? [message.id] : [])),
    nextPageToken: data.nextPageToken ?? null,
  };
};

export const listInboxMessageIdsSince = async function (client: gmail_v1.Gmail, since: Date) {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const { data } = await client.users.messages.list({
      userId: "me",
      q: `in:inbox after:${Math.floor(since.getTime() / 1000)}`,
      maxResults: 500,
      ...(pageToken && { pageToken }),
    });

    ids.push(...(data.messages ?? []).flatMap(message => (message.id ? [message.id] : [])));
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  return ids;
};
