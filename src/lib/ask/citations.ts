export interface AskCitation {
  n: number;
  emailMessageId: string | null;
  mailAccountId: string;
  accountEmail: string;
  gmailMessageId: string;
  fromName: string | null;
  fromEmail: string;
  subject: string;
  receivedAt: string;
}

// gpt-oss sometimes cites in its own 【2】 or 【2†L1-L3】 form instead of the [2] it was asked for.
const NATIVE_MARKER = /【(\d{1,2})(?:†[^】]*)?】/g;
const MARKER = /([ \t]*)\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g;

// The answer's [n] markers decide what is cited; a number outside the list is dropped from the
// text, so every marker the user sees points at an email that was really read.
export const resolveCitations = function <T extends { n: number }>(text: string, sources: T[]) {
  const byNumber = new Map(sources.map(source => [source.n, source]));
  const cited: T[] = [];

  const content = text
    .replace(NATIVE_MARKER, "[$1]")
    .replace(MARKER, (_, space: string, list: string) => {
      const markers = list
        .split(",")
        .map(part => Number(part.trim()))
        .filter(n => byNumber.has(n))
        .map(n => {
          const source = byNumber.get(n)!;
          if (!cited.includes(source)) cited.push(source);
          return `[${n}]`;
        })
        .join("");
      return markers ? space + markers : "";
    })
    .trim();

  return { content, cited };
};
