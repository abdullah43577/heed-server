import type { gmail_v1 } from "@googleapis/gmail";

// Gmail's own search, the same syntax as its search box. Spam and trash are left out by Gmail.
export const searchMessageIds = async function (client: gmail_v1.Gmail, q: string, max: number) {
  const { data } = await client.users.messages.list({ userId: "me", q, maxResults: max });
  return (data.messages ?? []).flatMap(message => (message.id ? [message.id] : []));
};
