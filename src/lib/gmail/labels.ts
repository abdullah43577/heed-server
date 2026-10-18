import type { gmail_v1 } from "@googleapis/gmail";

export const HEED_LABELS = {
  parent: "Heed",
  handled: "Heed/Handled",
  reply: "Heed/Needs reply",
} as const;

export const ensureHeedLabels = async function (client: gmail_v1.Gmail) {
  const { data } = await client.users.labels.list({ userId: "me" });
  const existing = new Map((data.labels ?? []).map(label => [label.name, label.id]));

  const ensure = async function (name: string) {
    const found = existing.get(name);
    if (found) return found;

    const { data: created } = await client.users.labels.create({
      userId: "me",
      requestBody: { name, labelListVisibility: "labelShow", messageListVisibility: "show" },
    });
    return created.id!;
  };

  // Gmail only nests "Heed/…" under a parent that already exists.
  await ensure(HEED_LABELS.parent);

  return {
    handledLabelId: await ensure(HEED_LABELS.handled),
    replyLabelId: await ensure(HEED_LABELS.reply),
  };
};
