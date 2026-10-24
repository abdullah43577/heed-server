import type { EmailAction, EmailCategory } from "../../generated/prisma/client";

export interface BacklogCounts {
  total: number;
  unsorted: number;
  toMarkRead: number;
  markedRead: number;
  mightNeedReply: number;
  leftForYou: number;
  keptAsIs: number;
  byCategory: Record<EmailCategory, number>;
}

interface CountRow {
  category: EmailCategory | null;
  action: EmailAction | null;
  _count: { _all: number };
}

const HANDLED: EmailCategory[] = ["IMPORTANT", "ROUTINE", "NEWSLETTER", "PROMOTION"];

export const computeBacklogCounts = function (rows: CountRow[]): BacklogCounts {
  const counts: BacklogCounts = {
    total: 0,
    unsorted: 0,
    toMarkRead: 0,
    markedRead: 0,
    mightNeedReply: 0,
    leftForYou: 0,
    keptAsIs: 0,
    byCategory: { NEEDS_REPLY: 0, IMPORTANT: 0, ROUTINE: 0, NEWSLETTER: 0, PROMOTION: 0, UNSURE: 0 },
  };

  for (const { category, action, _count } of rows) {
    const count = _count._all;
    counts.total += count;

    if (!category) {
      counts.unsorted += count;
      continue;
    }

    counts.byCategory[category] += count;

    if (action === "PENDING_CONFIRM") counts.toMarkRead += count;
    else if (action === "MARKED_READ") counts.markedRead += count;
    else if (category === "NEEDS_REPLY") counts.mightNeedReply += count;
    else if (category === "UNSURE") counts.leftForYou += count;
    // A handled category left unread: a "leave it" rule, or the user read it before Heed got there.
    else if (HANDLED.includes(category)) counts.keptAsIs += count;
  }

  return counts;
};

// With nothing waiting to be marked read there is nothing to confirm, so the run is finished, not READY.
export const hasNothingToApply = (counts: BacklogCounts) => counts.toMarkRead === 0 && counts.unsorted === 0;

const formatCount = (count: number) => count.toLocaleString("en-US");

// Null when the run found nothing worth a push: no mail at all, or only mail the user had already dealt with.
export const backlogReadyPush = function (counts: BacklogCounts) {
  const title = "Your backlog is sorted";
  const mightNeedReply = counts.mightNeedReply > 0 && `${formatCount(counts.mightNeedReply)} might still need a reply`;

  if (counts.toMarkRead > 0) {
    const parts = [`${formatCount(counts.toMarkRead)} ready to mark as read`, mightNeedReply].filter(
      (part): part is string => !!part,
    );
    return { title, body: `${parts.join(" · ")}. Nothing changes until you confirm.` };
  }

  const setAside = [mightNeedReply, counts.leftForYou > 0 && `${formatCount(counts.leftForYou)} left for you`].filter(
    (part): part is string => !!part,
  );
  if (setAside.length === 0) return null;

  return { title, body: `Nothing to mark as read. ${setAside.join(" · ")}.` };
};
