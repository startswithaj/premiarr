import type { PremierShow } from '../types/index.js';

// Heart emoji variants to check
export const HEART_EMOJIS = ['❤', '❤️', '🩷', '💗', '💖'];

/**
 * Check if an emoji is a heart variant
 */
export function isHeartEmoji(emoji: string): boolean {
  return HEART_EMOJIS.includes(emoji);
}

/**
 * Escape HTML special characters for Telegram HTML parse mode
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format a release date string with today/yesterday indicator
 */
export function formatReleaseDate(dateStr: string | undefined, today: Date = new Date()): string | null {
  if (!dateStr) return null;

  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  const yesterday = new Date(todayStart);
  yesterday.setDate(yesterday.getDate() - 1);

  // Try to extract a date from various formats like "Latest Episode: Feb 19" or "Streaming Jan 27, 2026"
  const monthMatch = dateStr.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:,?\s+\d{4})?/i);
  if (monthMatch) {
    const dateText = monthMatch[0];
    // Add current year if not present
    const fullDateText = dateText.includes('202') ? dateText : `${dateText}, ${todayStart.getFullYear()}`;
    const parsed = new Date(fullDateText);
    parsed.setHours(0, 0, 0, 0);

    if (parsed.getTime() === todayStart.getTime()) {
      return `${dateText} (today)`;
    } else if (parsed.getTime() === yesterday.getTime()) {
      return `${dateText} (yesterday)`;
    }
    return dateText;
  }
  return dateStr;
}

/**
 * Format a show into a Telegram HTML message
 */
export function formatShowMessage(show: PremierShow, today: Date = new Date()): string {
  const lines: string[] = [];

  // Title with link - different emoji and label for movies vs TV
  const emoji = show.mediaType === 'movie' ? '🎥' : '🎬';
  const typeLabel = show.mediaType === 'movie' ? 'Movie' : 'TV Show';
  const titleLinks: string[] = [];
  if (show.imdbId) {
    titleLinks.push(`<a href="https://www.imdb.com/title/${show.imdbId}">IMDB</a>`);
  }
  titleLinks.push(`<a href="${show.rtUrl}">RT</a>`);
  lines.push(`${emoji} <b>${escapeHtml(show.title)}</b> (${titleLinks.join(' | ')})`);
  lines.push(`📌 ${typeLabel}`);

  // Release date
  const formattedDate = formatReleaseDate(show.releaseDate, today);
  if (formattedDate) {
    lines.push(`📅 ${formattedDate}`);
  }

  // Scores
  const scores: string[] = [];
  if (show.tomatoScore !== undefined) {
    const icon = show.certifiedFresh ? '🍅' : show.tomatoScore >= 60 ? '🍅' : '🤢';
    scores.push(`${icon} ${show.tomatoScore}%`);
  }
  if (show.audienceScore !== undefined) {
    const icon = show.audienceScore >= 60 ? '🍿' : '👎';
    scores.push(`${icon} ${show.audienceScore}%`);
  }
  if (scores.length > 0) {
    lines.push(scores.join(' | '));
  }

  // Certified fresh badge
  if (show.certifiedFresh) {
    lines.push('✨ <b>Certified Fresh</b>');
  }

  // Network
  if (show.network) {
    lines.push(`📺 ${show.network}`);
  }

  // Status
  if (show.seerrStatus) {
    const statusEmoji = {
      available: '✅',
      requested: '📥',
      pending: '⏳',
      unavailable: '➕',
    };
    const statusText = {
      available: 'Available',
      requested: 'Already Requested',
      pending: 'Pending',
      unavailable: 'Not in library',
    };
    lines.push(`${statusEmoji[show.seerrStatus]} ${statusText[show.seerrStatus]}`);
  }

  // Synopsis (truncated)
  if (show.synopsis) {
    const truncated =
      show.synopsis.length > 200
        ? show.synopsis.substring(0, 197) + '...'
        : show.synopsis;
    lines.push('');
    lines.push(`<i>${escapeHtml(truncated)}</i>`);
  }

  // Call to action
  lines.push('');
  lines.push('❤️ React to request this show');

  return lines.join('\n');
}
