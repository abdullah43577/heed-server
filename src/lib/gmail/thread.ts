import type { gmail_v1 } from "@googleapis/gmail";
import { extractBodyText } from "../triage/text";

const THREAD_DEPTH = 4;

export interface ThreadMessage {
  gmailMessageId: string;
  from: string;
  to: string;
  date: string;
  sentAt: string;
  fromMe: boolean;
  bodyText: string;
}

const header = (headers: gmail_v1.Schema$MessagePartHeader[], name: string) =>
  headers.find(entry => entry.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

// The last few messages of a thread, oldest first, as text. Read for a draft or the draft screen; never stored.
export const fetchThread = async function (client: gmail_v1.Gmail, threadId: string): Promise<ThreadMessage[]> {
  const { data } = await client.users.threads.get({ userId: "me", id: threadId, format: "full" });

  return (data.messages ?? [])
    .filter(message => !(message.labelIds ?? []).includes("DRAFT"))
    .slice(-THREAD_DEPTH)
    .map(message => {
      const headers = message.payload?.headers ?? [];
      return {
        gmailMessageId: message.id!,
        from: header(headers, "From"),
        to: header(headers, "To"),
        date: header(headers, "Date"),
        sentAt: new Date(Number(message.internalDate ?? Date.now())).toISOString(),
        fromMe: (message.labelIds ?? []).includes("SENT"),
        bodyText: extractBodyText(message.payload),
      };
    });
};

export interface ReplyHeaders {
  from: string;
  replyTo: string;
  to: string;
  cc: string;
  subject: string;
  messageId: string;
  references: string;
}

export const fetchReplyHeaders = async function (client: gmail_v1.Gmail, gmailMessageId: string): Promise<ReplyHeaders> {
  const { data } = await client.users.messages.get({
    userId: "me",
    id: gmailMessageId,
    format: "metadata",
    metadataHeaders: ["From", "Reply-To", "To", "Cc", "Subject", "Message-ID", "References"],
  });
  const headers = data.payload?.headers ?? [];

  return {
    from: header(headers, "From"),
    replyTo: header(headers, "Reply-To"),
    to: header(headers, "To"),
    cc: header(headers, "Cc"),
    subject: header(headers, "Subject"),
    messageId: header(headers, "Message-ID"),
    references: header(headers, "References"),
  };
};
