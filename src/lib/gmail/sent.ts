import type { gmail_v1 } from "@googleapis/gmail";
import { extractBodyText } from "../triage/text";

const FETCH_CONCURRENCY = 5;
const MAX_SAMPLE_CHARS = 1200;

// The text of the user's own recent sent mail, quotes stripped. Read to learn a style and then dropped.
export const fetchRecentSentBodies = async function (client: gmail_v1.Gmail, max: number) {
  const { data } = await client.users.messages.list({ userId: "me", q: "in:sent -in:chats", maxResults: max });
  const ids = (data.messages ?? []).flatMap(message => (message.id ? [message.id] : []));

  const bodies: string[] = [];
  for (let index = 0; index < ids.length; index += FETCH_CONCURRENCY) {
    const results = await Promise.allSettled(
      ids
        .slice(index, index + FETCH_CONCURRENCY)
        .map(id => client.users.messages.get({ userId: "me", id, format: "full" })),
    );
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const text = extractBodyText(result.value.data.payload).trim();
      if (text.length >= 20) bodies.push(text.slice(0, MAX_SAMPLE_CHARS));
    }
  }

  return bodies;
};
