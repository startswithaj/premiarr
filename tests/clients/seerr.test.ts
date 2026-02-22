import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SeerrClient } from '../../src/clients/seerr.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('SeerrClient', () => {
  let client: SeerrClient;
  const baseUrl = 'http://jellyseerr.local';
  const apiKey = 'test-api-key';

  beforeEach(() => {
    client = new SeerrClient(baseUrl, apiKey);
    mockFetch.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('removes trailing slash from base URL', () => {
      const clientWithSlash = new SeerrClient('http://example.com/', apiKey);
      // We can verify by making a request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });
      clientWithSlash.search('test');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://example.com/api/v1/search?query=test&page=1',
        expect.any(Object)
      );
    });
  });

  describe('search', () => {
    it('searches with correct URL and headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ page: 1, totalPages: 1, totalResults: 0, results: [] }),
      });

      await client.search('Breaking Bad');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://jellyseerr.local/api/v1/search?query=Breaking%20Bad&page=1',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Api-Key': 'test-api-key',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('encodes special characters in query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await client.search('Test & Show');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('query=Test%20%26%20Show'),
        expect.any(Object)
      );
    });

    it('passes page parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await client.search('test', 5);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('page=5'),
        expect.any(Object)
      );
    });
  });

  describe('searchTv', () => {
    it('filters results to TV only', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { id: 1, mediaType: 'tv', name: 'TV Show' },
            { id: 2, mediaType: 'movie', title: 'Movie' },
            { id: 3, mediaType: 'tv', name: 'Another TV Show' },
          ],
        }),
      });

      const results = await client.searchTv('test');

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe(1);
      expect(results[1].id).toBe(3);
    });
  });

  describe('searchMovies', () => {
    it('filters results to movies only', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { id: 1, mediaType: 'tv', name: 'TV Show' },
            { id: 2, mediaType: 'movie', title: 'Movie' },
          ],
        }),
      });

      const results = await client.searchMovies('test');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(2);
    });
  });

  describe('getTvDetails', () => {
    it('fetches TV details by TMDB ID', async () => {
      const mockDetails = {
        id: 12345,
        name: 'Test Show',
        numberOfSeasons: 3,
        seasons: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockDetails,
      });

      const details = await client.getTvDetails(12345);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://jellyseerr.local/api/v1/tv/12345',
        expect.any(Object)
      );
      expect(details.name).toBe('Test Show');
    });
  });

  describe('getMovieDetails', () => {
    it('fetches movie details by TMDB ID', async () => {
      const mockDetails = {
        id: 67890,
        title: 'Test Movie',
        runtime: 120,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockDetails,
      });

      const details = await client.getMovieDetails(67890);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://jellyseerr.local/api/v1/movie/67890',
        expect.any(Object)
      );
      expect(details.title).toBe('Test Movie');
    });
  });

  describe('requestTv', () => {
    it('requests TV show with seasons', async () => {
      const mockResponse = { id: 1, status: 1 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await client.requestTv(12345, [1, 2]);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://jellyseerr.local/api/v1/request',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            mediaId: 12345,
            mediaType: 'tv',
            is4k: false,
            seasons: [1, 2],
          }),
        })
      );
    });

    it('requests TV show without seasons', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 1 }),
      });

      await client.requestTv(12345);

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.seasons).toBeUndefined();
    });

    it('supports 4K requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 1 }),
      });

      await client.requestTv(12345, [1], true);

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.is4k).toBe(true);
    });
  });

  describe('requestMovie', () => {
    it('requests movie', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 1, status: 1 }),
      });

      await client.requestMovie(67890);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://jellyseerr.local/api/v1/request',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            mediaId: 67890,
            mediaType: 'movie',
            is4k: false,
          }),
        })
      );
    });
  });

  describe('getTvMediaStatus', () => {
    it('returns available for status 5', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ mediaInfo: { status: 5 } }),
      });

      const status = await client.getTvMediaStatus(12345);
      expect(status).toBe('available');
    });

    it('returns available for status 4 (partially available)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ mediaInfo: { status: 4 } }),
      });

      const status = await client.getTvMediaStatus(12345);
      expect(status).toBe('available');
    });

    it('returns pending for status 2', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ mediaInfo: { status: 2 } }),
      });

      const status = await client.getTvMediaStatus(12345);
      expect(status).toBe('pending');
    });

    it('returns pending for status 3 (processing)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ mediaInfo: { status: 3 } }),
      });

      const status = await client.getTvMediaStatus(12345);
      expect(status).toBe('pending');
    });

    it('returns requested when has requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mediaInfo: { status: 1, requests: [{ id: 1 }] },
        }),
      });

      const status = await client.getTvMediaStatus(12345);
      expect(status).toBe('requested');
    });

    it('returns unavailable when no mediaInfo', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const status = await client.getTvMediaStatus(12345);
      expect(status).toBe('unavailable');
    });

    it('returns unavailable on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Not found',
      });

      const status = await client.getTvMediaStatus(12345);
      expect(status).toBe('unavailable');
    });
  });

  describe('findTvByTitle', () => {
    it('returns null when no results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      const id = await client.findTvByTitle('Unknown Show');
      expect(id).toBeNull();
    });

    it('returns first result ID when no year specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { id: 100, mediaType: 'tv' },
            { id: 200, mediaType: 'tv' },
          ],
        }),
      });

      const id = await client.findTvByTitle('Test Show');
      expect(id).toBe(100);
    });

    it('matches by year when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { id: 100, mediaType: 'tv', firstAirDate: '2020-01-01' },
            { id: 200, mediaType: 'tv', firstAirDate: '2022-01-01' },
          ],
        }),
      });

      const id = await client.findTvByTitle('Test Show', 2022);
      expect(id).toBe(200);
    });

    it('falls back to first result when year not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { id: 100, mediaType: 'tv', firstAirDate: '2020-01-01' },
          ],
        }),
      });

      const id = await client.findTvByTitle('Test Show', 2025);
      expect(id).toBe(100);
    });
  });

  describe('findMovieByTitle', () => {
    it('returns null when no results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      const id = await client.findMovieByTitle('Unknown Movie');
      expect(id).toBeNull();
    });

    it('matches by year when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { id: 100, mediaType: 'movie', releaseDate: '2020-06-15' },
            { id: 200, mediaType: 'movie', releaseDate: '2023-03-20' },
          ],
        }),
      });

      const id = await client.findMovieByTitle('Test Movie', 2023);
      expect(id).toBe(200);
    });
  });

  describe('error handling', () => {
    it('throws error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid API key',
      });

      await expect(client.search('test')).rejects.toThrow(
        'Seerr API error: 401 Unauthorized - Invalid API key'
      );
    });
  });
});
