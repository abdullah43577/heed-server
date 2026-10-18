import type { gmail_v1 } from "@googleapis/gmail";
import { extractBodyText } from "../triage/text";

const SKIPPED_LABELS = ["SENT", "DRAFT", "SPAM", "TRASH", "CHAT"];

export interface IncomingMessage {
  gmailMessageId: string;
  gmailThreadId: string;
  fromName: string | null;
  fromEmail: string;
  subject: string;
  receivedAt: Date;
}

const header = (headers: gmail_v1.Schema$MessagePartHeader[], name: string) =>
  headers.find(entry => entry.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

const parseAddress = function (value: string) {
  const match = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1]?.trim() || null, email: match[2]!.trim().toLowerCase() };
  return { name: null, email: value.trim().toLowerCase() };
};

export interface FullMessage {
  labels: string[];
  to: string;
  cc: string;
  date: string;
  listUnsubscribe: string;
  precedence: string;
  bodyText: string;
}

export const fetchFullMessage = async function (client: gmail_v1.Gmail, id: string): Promise<FullMessage> {
  const { data } = await client.users.messages.get({ userId: "me", id, format: "full" });
  const headers = data.payload?.headers ?? [];

  return {
    labels: data.labelIds ?? [],
    to: header(headers, "To"),
    cc: header(headers, "Cc"),
    date: header(headers, "Date"),
    listUnsubscribe: header(headers, "List-Unsubscribe"),
    precedence: header(headers, "Precedence"),
    bodyText: extractBodyText(data.payload),
  };
};

export const modifyLabels = async function (
  client: gmail_v1.Gmail,
  id: string,
  change: { add?: string[]; remove?: string[] },
) {
  await client.users.messages.modify({
    userId: "me",
    id,
    requestBody: { addLabelIds: change.add ?? [], removeLabelIds: change.remove ?? [] },
  });
};

// Null for anything Heed should not treat as new mail: outgoing, drafts, spam,
// or already read by the time Heed looked.
export const fetchIncomingMessage = async function (
  client: gmail_v1.Gmail,
  id: string,
): Promise<IncomingMessage | null> {
  const { data } = await client.users.messages.get({
    userId: "me",
    id,
    format: "metadata",
    metadataHeaders: ["From", "Subject"],
  });

  const labels = data.labelIds ?? [];
  if (!labels.includes("INBOX") || !labels.includes("UNREAD")) return null;
  if (labels.some(label => SKIPPED_LABELS.includes(label))) return null;

  const headers = data.payload?.headers ?? [];
  const from = parseAddress(header(headers, "From"));

  return {
    gmailMessageId: data.id!,
    gmailThreadId: data.threadId!,
    fromName: from.name,
    fromEmail: from.email,
    subject: header(headers, "Subject") || "(no subject)",
    receivedAt: new Date(Number(data.internalDate ?? Date.now())),
  };
};
