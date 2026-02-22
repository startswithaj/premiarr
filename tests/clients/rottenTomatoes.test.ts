import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RottenTomatoesClient } from '../../src/clients/rottenTomatoes.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('RottenTomatoesClient', () => {
  let client: RottenTomatoesClient;

  beforeEach(() => {
    client = new RottenTomatoesClient();
    mockFetch.mockReset();
    // Suppress console.log during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('browseTvShowsWithFilter', () => {
    it('fetches TV shows with filter string', async () => {
      const mockResponse = {
        title: 'Best TV Shows',
        grid: {
          id: 'tv_series_browse',
          list: [
            {
              title: 'Test Show',
              mediaUrl: '/tv/test_show',
              type: 'TvSeries',
              releaseDateText: 'Latest Episode: Feb 19',
              posterUri: 'https://example.com/poster.jpg',
              criticsScore: { score: '95', certified: true },
              audienceScore: { score: '88' },
            },
          ],
        },
        pageInfo: { hasNextPage: false, hasPreviousPage: false },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const shows = await client.browseTvShowsWithFilter('critics:fresh~sort:newest');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.rottentomatoes.com/cnapi/browse/tv_series_browse/critics:fresh~sort:newest?page=1',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.any(String),
            Referer: 'https://www.rottentomatoes.com',
          }),
        })
      );

      expect(shows).toHaveLength(1);
      expect(shows[0].title).toBe('Test Show');
      expect(shows[0].url).toBe('https://www.rottentomatoes.com/tv/test_show');
      expect(shows[0].tomatoScore).toBe(95);
      expect(shows[0].audienceScore).toBe(88);
      expect(shows[0].certifiedFresh).toBe(true);
      expect(shows[0].premiereDate).toBe('Latest Episode: Feb 19');
    });

    it('filters out non-TV items', async () => {
      const mockResponse = {
        title: 'Mixed Content',
        grid: {
          id: 'browse',
          list: [
            { title: 'TV Show', mediaUrl: '/tv/show', type: 'TvSeries' },
            { title: 'Movie', mediaUrl: '/m/movie', type: 'Movie' },
          ],
        },
        pageInfo: {},
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const shows = await client.browseTvShowsWithFilter('sort:newest');
      expect(shows).toHaveLength(1);
      expect(shows[0].title).toBe('TV Show');
    });

    it('handles missing scores gracefully', async () => {
      const mockResponse = {
        title: 'Shows',
        grid: {
          id: 'browse',
          list: [
            { title: 'No Scores', mediaUrl: '/tv/no_scores', type: 'TvSeries' },
          ],
        },
        pageInfo: {},
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const shows = await client.browseTvShowsWithFilter('sort:newest');
      expect(shows[0].tomatoScore).toBeUndefined();
      expect(shows[0].audienceScore).toBeUndefined();
      expect(shows[0].certifiedFresh).toBe(false);
    });

    it('passes page parameter', async () => {
      const mockResponse = {
        title: 'Shows',
        grid: { id: 'browse', list: [] },
        pageInfo: {},
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await client.browseTvShowsWithFilter('sort:newest', 3);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('?page=3'),
        expect.any(Object)
      );
    });

    it('throws error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.browseTvShowsWithFilter('sort:newest')).rejects.toThrow(
        'RT API error: 500 Internal Server Error'
      );
    });
  });

  describe('browseMoviesWithFilter', () => {
    it('fetches movies with filter string', async () => {
      const mockResponse = {
        title: 'Movies at Home',
        grid: {
          id: 'movies_at_home',
          list: [
            {
              title: 'Test Movie',
              mediaUrl: '/m/test_movie',
              type: 'Movie',
              releaseDateText: 'Streaming Feb 15',
              posterUri: 'https://example.com/poster.jpg',
              criticsScore: { score: '82', certified: false },
              audienceScore: { score: '75' },
            },
          ],
        },
        pageInfo: {},
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const movies = await client.browseMoviesWithFilter('critics:fresh~sort:newest');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.rottentomatoes.com/cnapi/browse/movies_at_home/critics:fresh~sort:newest?page=1',
        expect.any(Object)
      );

      expect(movies).toHaveLength(1);
      expect(movies[0].title).toBe('Test Movie');
      expect(movies[0].url).toBe('https://www.rottentomatoes.com/m/test_movie');
      expect(movies[0].tomatoScore).toBe(82);
      expect(movies[0].audienceScore).toBe(75);
      expect(movies[0].certifiedFresh).toBe(false);
      expect(movies[0].releaseDate).toBe('Streaming Feb 15');
    });

    it('filters out non-movie items', async () => {
      const mockResponse = {
        title: 'Mixed Content',
        grid: {
          id: 'browse',
          list: [
            { title: 'TV Show', mediaUrl: '/tv/show', type: 'TvSeries' },
            { title: 'Movie', mediaUrl: '/m/movie', type: 'Movie' },
          ],
        },
        pageInfo: {},
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const movies = await client.browseMoviesWithFilter('sort:newest');
      expect(movies).toHaveLength(1);
      expect(movies[0].title).toBe('Movie');
    });
  });
});
