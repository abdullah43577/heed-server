const PLACEHOLDER = /\[[^[\]\n]{1,80}\]/g;
const SPLIT_ON_PLACEHOLDERS = /(\[[^[\]\n]{1,80}\])/;
// One pass over links, addresses and numbers, so a replacement is never scanned again.
// A link ends before trailing punctuation, so "see https://x.io." keeps its full stop.
const CHECKED_TOKEN = /(https?:\/\/[^\s)>\]]*[^\s)>\].,;:!?'"])|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|(\d+(?:[.,:/-]\d+)*)/gi;

// Computed in code every time, never taken from the model: a draft with one left cannot be sent.
export const findPlaceholders = function (body: string) {
  return [...new Set(body.match(PLACEHOLDER) ?? [])];
};

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const appearsIn = function (source: string, token: string, numeric: boolean) {
  const needle = token.toLowerCase();
  if (!numeric) return source.includes(needle);
  return new RegExp(`(^|[^\\d])${escape(needle)}([^\\d]|$)`).test(source);
};

// Rule 5: a number, link or address the sources do not contain is the model's invention.
// It becomes a placeholder, so Send stays disabled until the user has looked at it.
export const groundDraft = function (body: string, sources: string[]) {
  const source = sources.join("\n").toLowerCase();

  return body
    .split(SPLIT_ON_PLACEHOLDERS)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part.replace(CHECKED_TOKEN, (token, url, email) =>
        appearsIn(source, token, !url && !email) ? token : `[check: ${token}]`,
      );
    })
    .join("");
};
