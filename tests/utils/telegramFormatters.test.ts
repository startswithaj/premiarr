import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  isHeartEmoji,
  formatReleaseDate,
  formatShowMessage,
  HEART_EMOJIS,
} from '../../src/utils/telegramFormatters.js';
import type { PremierShow } from '../../src/types/index.js';

describe('telegramFormatters', () => {
  describe('escapeHtml', () => {
    it('escapes ampersand', () => {
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('escapes less than', () => {
      expect(escapeHtml('a < b')).toBe('a &lt; b');
    });

    it('escapes greater than', () => {
      expect(escapeHtml('a > b')).toBe('a &gt; b');
    });

    it('escapes double quotes', () => {
      expect(escapeHtml('She said "hello"')).toBe('She said &quot;hello&quot;');
    });

    it('escapes multiple special characters', () => {
      expect(escapeHtml('<script>alert("XSS")</script>')).toBe(
        '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
      );
    });

    it('handles empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('returns unchanged if no special characters', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
    });
  });

  describe('isHeartEmoji', () => {
    it('returns true for red heart', () => {
      expect(isHeartEmoji('❤')).toBe(true);
      expect(isHeartEmoji('❤️')).toBe(true);
    });

    it('returns true for pink hearts', () => {
      expect(isHeartEmoji('🩷')).toBe(true);
      expect(isHeartEmoji('💗')).toBe(true);
      expect(isHeartEmoji('💖')).toBe(true);
    });

    it('returns false for non-heart emojis', () => {
      expect(isHeartEmoji('👍')).toBe(false);
      expect(isHeartEmoji('🔥')).toBe(false);
      expect(isHeartEmoji('😀')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isHeartEmoji('')).toBe(false);
    });

    it('exports HEART_EMOJIS array', () => {
      expect(HEART_EMOJIS).toContain('❤');
      expect(HEART_EMOJIS).toContain('❤️');
      expect(HEART_EMOJIS.length).toBeGreaterThan(0);
    });
  });

  describe('formatReleaseDate', () => {
    const fixedToday = new Date('2026-02-21T12:00:00');

    it('returns null for undefined', () => {
      expect(formatReleaseDate(undefined, fixedToday)).toBeNull();
    });

    it('adds (today) suffix for today\'s date', () => {
      expect(formatReleaseDate('Feb 21', fixedToday)).toBe('Feb 21 (today)');
    });

    it('adds (yesterday) suffix for yesterday\'s date', () => {
      expect(formatReleaseDate('Feb 20', fixedToday)).toBe('Feb 20 (yesterday)');
    });

    it('returns date without suffix for other dates', () => {
      expect(formatReleaseDate('Feb 19', fixedToday)).toBe('Feb 19');
      expect(formatReleaseDate('Mar 1', fixedToday)).toBe('Mar 1');
    });

    it('handles "Latest Episode:" prefix', () => {
      expect(formatReleaseDate('Latest Episode: Feb 21', fixedToday)).toBe('Feb 21 (today)');
    });

    it('handles date with year', () => {
      expect(formatReleaseDate('Feb 21, 2026', fixedToday)).toBe('Feb 21, 2026 (today)');
    });

    it('returns original string if no date pattern found', () => {
      expect(formatReleaseDate('Coming Soon', fixedToday)).toBe('Coming Soon');
    });
  });

  describe('formatShowMessage', () => {
    const fixedToday = new Date('2026-02-21T12:00:00');

    const baseShow: PremierShow = {
      title: 'Test Show',
      rtUrl: 'https://www.rottentomatoes.com/tv/test_show',
      mediaType: 'tv',
      certifiedFresh: false,
    };

    it('formats TV show with basic info', () => {
      const message = formatShowMessage(baseShow, fixedToday);

      expect(message).toContain('🎬');
      expect(message).toContain('<b>Test Show</b>');
      expect(message).toContain('📌 TV Show');
      expect(message).toContain('href="https://www.rottentomatoes.com/tv/test_show">RT</a>');
      expect(message).toContain('❤️ React to request this show');
    });

    it('formats movie with movie emoji', () => {
      const movie: PremierShow = { ...baseShow, mediaType: 'movie' };
      const message = formatShowMessage(movie, fixedToday);

      expect(message).toContain('🎥');
      expect(message).toContain('📌 Movie');
    });

    it('includes IMDB link when imdbId present', () => {
      const showWithImdb: PremierShow = { ...baseShow, imdbId: 'tt1234567' };
      const message = formatShowMessage(showWithImdb, fixedToday);

      expect(message).toContain('href="https://www.imdb.com/title/tt1234567">IMDB</a>');
    });

    it('formats release date', () => {
      const showWithDate: PremierShow = { ...baseShow, releaseDate: 'Feb 21' };
      const message = formatShowMessage(showWithDate, fixedToday);

      expect(message).toContain('📅 Feb 21 (today)');
    });

    it('shows tomato score with correct emoji', () => {
      const freshShow: PremierShow = { ...baseShow, tomatoScore: 85 };
      const message = formatShowMessage(freshShow, fixedToday);
      expect(message).toContain('🍅 85%');

      const rottenShow: PremierShow = { ...baseShow, tomatoScore: 45 };
      const rottenMessage = formatShowMessage(rottenShow, fixedToday);
      expect(rottenMessage).toContain('🤢 45%');
    });

    it('shows certified fresh badge', () => {
      const certifiedShow: PremierShow = { ...baseShow, certifiedFresh: true, tomatoScore: 90 };
      const message = formatShowMessage(certifiedShow, fixedToday);

      expect(message).toContain('✨ <b>Certified Fresh</b>');
    });

    it('shows audience score with correct emoji', () => {
      const goodAudience: PremierShow = { ...baseShow, audienceScore: 75 };
      const message = formatShowMessage(goodAudience, fixedToday);
      expect(message).toContain('🍿 75%');

      const badAudience: PremierShow = { ...baseShow, audienceScore: 40 };
      const badMessage = formatShowMessage(badAudience, fixedToday);
      expect(badMessage).toContain('👎 40%');
    });

    it('shows network', () => {
      const showWithNetwork: PremierShow = { ...baseShow, network: 'HBO' };
      const message = formatShowMessage(showWithNetwork, fixedToday);

      expect(message).toContain('📺 HBO');
    });

    it('shows seerr status', () => {
      const available: PremierShow = { ...baseShow, seerrStatus: 'available' };
      expect(formatShowMessage(available, fixedToday)).toContain('✅ Available');

      const requested: PremierShow = { ...baseShow, seerrStatus: 'requested' };
      expect(formatShowMessage(requested, fixedToday)).toContain('📥 Already Requested');

      const pending: PremierShow = { ...baseShow, seerrStatus: 'pending' };
      expect(formatShowMessage(pending, fixedToday)).toContain('⏳ Pending');

      const unavailable: PremierShow = { ...baseShow, seerrStatus: 'unavailable' };
      expect(formatShowMessage(unavailable, fixedToday)).toContain('➕ Not in library');
    });

    it('truncates long synopsis', () => {
      const longSynopsis = 'A'.repeat(250);
      const showWithSynopsis: PremierShow = { ...baseShow, synopsis: longSynopsis };
      const message = formatShowMessage(showWithSynopsis, fixedToday);

      expect(message).toContain('...');
      expect(message).not.toContain('A'.repeat(250));
    });

    it('shows full synopsis if under 200 chars', () => {
      const shortSynopsis = 'A short synopsis about the show.';
      const showWithSynopsis: PremierShow = { ...baseShow, synopsis: shortSynopsis };
      const message = formatShowMessage(showWithSynopsis, fixedToday);

      expect(message).toContain(`<i>${shortSynopsis}</i>`);
    });

    it('escapes HTML in title', () => {
      const showWithHtml: PremierShow = { ...baseShow, title: 'Test <script>alert("XSS")</script>' };
      const message = formatShowMessage(showWithHtml, fixedToday);

      expect(message).toContain('&lt;script&gt;');
      expect(message).not.toContain('<script>');
    });
  });
});
