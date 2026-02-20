/**
 * Parse a release date text from RT like "Latest Episode: Feb 19" or "Opened Feb 20, 2026"
 */
function parseReleaseDateText(text: string | undefined): Date | null {
  if (!text) return null;

  const cleaned = text
    .replace(/^Latest Episode:\s*/i, '')
    .replace(/^Opened\s*/i, '')
    .replace(/^Re-released\s*/i, '')
    .replace(/^Premieres?\s*/i, '')
    .replace(/^Streaming\s*/i, '')
    .trim();

  const currentYear = new Date().getFullYear();

  let dateStr = cleaned;
  if (!/\d{4}/.test(dateStr)) {
    dateStr = `${dateStr}, ${currentYear}`;
  }

  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

/**
 * Check if a date is in the past or today (already released)
 */
function isReleased(date: Date): boolean {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return date <= today;
}

/**
 * Check if a release date text indicates the content has been released (date <= today)
 */
export function hasBeenReleased(releaseDateText: string | undefined): boolean {
  const date = parseReleaseDateText(releaseDateText);
  if (!date) return false;
  return isReleased(date);
}
