import type { gmail_v1 } from "@googleapis/gmail";
import addressparser from "nodemailer/lib/addressparser";
import MailComposer from "nodemailer/lib/mail-composer";
import type { ReplyHeaders } from "./thread";

export interface Recipient {
  name: string;
  address: string;
}

export interface Recipients {
  to: Recipient[];
  cc: Recipient[];
}

const parse = function (value: string): Recipient[] {
  return addressparser(value, { flatten: true })
    .filter(entry => entry.address.includes("@"))
    .map(entry => ({ name: entry.name, address: entry.address.toLowerCase() }));
};

const unique = function (list: Recipient[], exclude: Set<string>) {
  const seen = new Set(exclude);
  return list.filter(entry => {
    if (seen.has(entry.address)) return false;
    seen.add(entry.address);
    return true;
  });
};

// Rule 2 of the product: recipients come from the original's headers, never from a model.
export const computeRecipients = function (original: ReplyHeaders, accountEmail: string, replyAll: boolean): Recipients {
  const self = new Set([accountEmail.toLowerCase()]);
  const to = unique(parse(original.replyTo || original.from), self);
  if (!replyAll) return { to, cc: [] };

  const taken = new Set([...self, ...to.map(entry => entry.address)]);
  return { to, cc: unique([...parse(original.to), ...parse(original.cc)], taken) };
};

export const replySubject = function (subject: string) {
  const clean = subject.trim() || "(no subject)";
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`;
};

interface BuildReplyInput {
  fromName: string | null;
  fromEmail: string;
  recipients: Recipients;
  original: ReplyHeaders;
  body: string;
}

export const buildReplyRaw = async function (input: BuildReplyInput) {
  const references = [...input.original.references.split(/\s+/), input.original.messageId].filter(Boolean);

  const message = new MailComposer({
    from: input.fromName ? { name: input.fromName, address: input.fromEmail } : input.fromEmail,
    to: input.recipients.to,
    ...(input.recipients.cc.length > 0 && { cc: input.recipients.cc }),
    subject: replySubject(input.original.subject),
    text: input.body,
    ...(input.original.messageId && { inReplyTo: input.original.messageId, references }),
    disableFileAccess: true,
    disableUrlAccess: true,
  });

  const raw = await message.compile().build();
  return raw.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const sendRaw = async function (client: gmail_v1.Gmail, raw: string, threadId: string) {
  const { data } = await client.users.messages.send({ userId: "me", requestBody: { raw, threadId } });
  return data.id!;
};
