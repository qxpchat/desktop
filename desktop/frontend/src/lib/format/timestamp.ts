// Mirror of iOS RelativeChatTimestampFormatter for chatlist rows:
//   today      -> short time (e.g. "14:32")
//   last 7 d   -> short weekday (e.g. "Mon")
//   older      -> short locale date (e.g. "5/3/26" / "03.05.2026")
//
// Input is the chatlist item's `last_updated`, which the daemon returns in
// **milliseconds** (multiplied by 1000 from the message's unix-seconds
// timestamp on the way out — see `chat_list.rs::get_chat_list_item_by_id`).

const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'short' });

export function formatRelativeTimestamp(unixMs: number | null | undefined): string {
  if (unixMs == null || unixMs <= 0) return '';
  const d = new Date(unixMs);
  const now = new Date();
  if (sameDay(d, now)) return time.format(d);
  const days = wholeDaysBetween(d, now);
  if (days < 7) return weekday.format(d);
  return date.format(d);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function wholeDaysBetween(earlier: Date, later: Date): number {
  const a = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  const b = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
  return Math.floor((b - a) / 86_400_000);
}
