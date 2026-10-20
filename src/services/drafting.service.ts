import type { gmail_v1 } from "@googleapis/gmail";
import { generateJson } from "../lib/ai";
import { buildDraftPrompt, buildRewritePrompt, draftResultSchema, draftSystemPrompt } from "../lib/drafting/prompt";
import { groundDraft } from "../lib/drafting/placeholders";
import { NotFoundError } from "../lib/errors";
import { fetchThread, type ThreadMessage } from "../lib/gmail/thread";
import { UserRepository } from "../repositories/user.repository";

export interface DraftAuthor {
  name: string | null;
  email: string;
  styleNote: string | null;
}

interface DraftSource {
  gmailThreadId: string;
  subject: string;
}

// Everything the draft may draw facts from: what the thread says, plus what the user wrote themselves.
const groundingSources = (thread: ThreadMessage[], subject: string, extra: string[] = []) => [
  subject,
  ...thread.flatMap(message => [message.from, message.to, message.date, message.bodyText]),
  ...extra,
];

export class DraftingService {
  private userRepo = new UserRepository();

  async authorFor(userId: string, account: { email: string; styleNote: string | null }): Promise<DraftAuthor> {
    const user = await this.userRepo.findById(userId, { first_name: true, last_name: true });
    const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
    return { name: name || null, email: account.email, styleNote: account.styleNote };
  }

  async compose(client: gmail_v1.Gmail, author: DraftAuthor, message: DraftSource) {
    const thread = await this.threadFor(client, message);

    const { result } = await generateJson({
      system: draftSystemPrompt(author),
      prompt: buildDraftPrompt(thread),
      schema: draftResultSchema,
      temperature: 0.3,
      maxTokens: 2000,
      reasoningEffort: "medium",
    });

    return groundDraft(result.body, groundingSources(thread, message.subject));
  }

  async recompose(
    client: gmail_v1.Gmail,
    author: DraftAuthor,
    message: DraftSource,
    currentBody: string,
    instruction: string,
  ) {
    const thread = await this.threadFor(client, message);

    const { result } = await generateJson({
      system: draftSystemPrompt(author),
      prompt: buildRewritePrompt(thread, currentBody, instruction),
      schema: draftResultSchema,
      temperature: 0.3,
      maxTokens: 2000,
      reasoningEffort: "medium",
    });

    return groundDraft(result.body, groundingSources(thread, message.subject, [currentBody]));
  }

  private async threadFor(client: gmail_v1.Gmail, message: DraftSource) {
    const thread = await fetchThread(client, message.gmailThreadId);
    if (thread.length === 0) throw new NotFoundError("This email is no longer in Gmail");
    return thread;
  }
}
