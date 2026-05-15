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
const dateMedium = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function formatRelativeTimestamp(unixMs: number | null | undefined): string {
  if (unixMs == null || unixMs <= 0) return '';
  const d = new Date(unixMs);
  const now = new Date();
  if (sameDay(d, now)) return time.format(d);
  const days = wholeDaysBetween(d, now);
  if (days < 7) return weekday.format(d);
  return date.format(d);
}

/** Short HH:MM clock label for a message bubble's footer.
 *  Input is unix **seconds** (deltachat-core's message-payload format), not ms. */
export function formatShortTime(unixSec: number | null | undefined): string {
  if (unixSec == null || unixSec <= 0) return '';
  return time.format(new Date(unixSec * 1000));
}

/** Day-marker label between consecutive message bubbles:
 *    - "Today" / "Yesterday" for the two most-recent days
 *    - locale `medium` date for older messages.
 *  `t` is the i18n lookup; passed in so this stays a plain .ts module. */
export function formatDayLabel(unixSec: number, t: (k: string) => string): string {
  const d = new Date(unixSec * 1000);
  const today = new Date();
  if (sameDay(d, today)) return t('Today');
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (sameDay(d, yest)) return t('Yesterday');
  return dateMedium.format(d);
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
