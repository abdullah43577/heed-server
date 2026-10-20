const partsIn = function (date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
};

export const isValidTimeZone = function (timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
};

const pad = (value: number) => String(value).padStart(2, "0");

// The wall-clock date and time in a timezone, as "yyyy-mm-dd" and "HH:mm".
export const localNow = function (timeZone: string, now = new Date()) {
  const { year, month, day, hour, minute } = partsIn(now, timeZone);
  return { date: `${year}-${pad(month)}-${pad(day)}`, time: `${pad(hour)}:${pad(minute)}` };
};

const offsetMs = function (instant: Date, timeZone: string) {
  const { year, month, day, hour, minute, second } = partsIn(instant, timeZone);
  return Date.UTC(year, month - 1, day, hour, minute, second) - Math.floor(instant.getTime() / 1000) * 1000;
};

// The instant a wall-clock time happens in a timezone. The second pass corrects a guess
// that landed on the other side of a DST change.
export const zonedTimeToUtc = function (date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);

  const first = wallClock - offsetMs(new Date(wallClock), timeZone);
  return new Date(wallClock - offsetMs(new Date(first), timeZone));
};
