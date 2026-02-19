import type {
  SeerrSearchResult,
  SeerrTvDetails,
  SeerrMovieDetails,
  SeerrRequest,
  SeerrRequestBody,
} from '../types/index.js';
import { logger } from '../utils/logger.js';

export class SeerrClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[SEERR] API Error ${response.status}: ${errorText}`);
      throw new Error(
        `Seerr API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    return (await response.json()) as T;
  }

  /**
   * Search for media (movies and TV shows)
   */
  async search(query: string, page: number = 1): Promise<SeerrSearchResult> {
    const encodedQuery = encodeURIComponent(query);
    return this.request<SeerrSearchResult>(`/search?query=${encodedQuery}&page=${page}`);
  }

  /**
   * Search specifically for TV shows
   */
  async searchTv(query: string): Promise<SeerrSearchResult['results']> {
    const results = await this.search(query);
    return results.results.filter((r) => r.mediaType === 'tv');
  }

  /**
   * Search specifically for movies
   */
  async searchMovies(query: string): Promise<SeerrSearchResult['results']> {
    const results = await this.search(query);
    return results.results.filter((r) => r.mediaType === 'movie');
  }

  /**
   * Get TV show details by TMDB ID
   */
  async getTvDetails(tmdbId: number): Promise<SeerrTvDetails> {
    return this.request<SeerrTvDetails>(`/tv/${tmdbId}`);
  }

  /**
   * Get movie details by TMDB ID
   */
  async getMovieDetails(tmdbId: number): Promise<SeerrMovieDetails> {
    return this.request<SeerrMovieDetails>(`/movie/${tmdbId}`);
  }

  /**
   * Request a TV show (all seasons or specific seasons)
   */
  async requestTv(
    tmdbId: number,
    seasons?: number[],
    is4k: boolean = false
  ): Promise<SeerrRequest> {
    const body: {
      mediaId: number;
      mediaType: 'tv';
      is4k: boolean;
      seasons?: number[];
    } = {
      mediaId: tmdbId,
      mediaType: 'tv',
      is4k,
    };

    if (seasons && seasons.length > 0) {
      body.seasons = seasons;
    }

    logger.debug(`[SEERR] POST /request body:`, JSON.stringify(body));

    return this.request<SeerrRequest>('/request', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Request a movie
   */
  async requestMovie(tmdbId: number, is4k: boolean = false): Promise<SeerrRequest> {
    const body: SeerrRequestBody = {
      mediaId: tmdbId,
      mediaType: 'movie',
      is4k,
    };

    logger.debug(`[SEERR] POST /request body:`, JSON.stringify(body));

    return this.request<SeerrRequest>('/request', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Check if a TV show is already available or requested
   */
  async getTvMediaStatus(
    tmdbId: number
  ): Promise<'available' | 'requested' | 'pending' | 'unavailable'> {
    try {
      const details = await this.getTvDetails(tmdbId);
      return this.parseMediaStatus(details.mediaInfo);
    } catch {
      return 'unavailable';
    }
  }

  /**
   * Check if a movie is already available or requested
   */
  async getMovieMediaStatus(
    tmdbId: number
  ): Promise<'available' | 'requested' | 'pending' | 'unavailable'> {
    try {
      const details = await this.getMovieDetails(tmdbId);
      return this.parseMediaStatus(details.mediaInfo);
    } catch {
      return 'unavailable';
    }
  }

  private parseMediaStatus(
    mediaInfo?: { status: number; requests?: SeerrRequest[] }
  ): 'available' | 'requested' | 'pending' | 'unavailable' {
    if (!mediaInfo) {
      return 'unavailable';
    }

    // Status codes: 1 = unknown, 2 = pending, 3 = processing, 4 = partially_available, 5 = available
    const status = mediaInfo.status;
    if (status === 5 || status === 4) {
      return 'available';
    }
    if (status === 2 || status === 3) {
      return 'pending';
    }
    if (mediaInfo.requests && mediaInfo.requests.length > 0) {
      return 'requested';
    }

    return 'unavailable';
  }

  /**
   * Find a TV show by title and optionally year
   * Returns the TMDB ID if found
   */
  async findTvByTitle(title: string, year?: number): Promise<number | null> {
    const results = await this.searchTv(title);

    if (results.length === 0) {
      return null;
    }

    // If year is provided, try to match by year
    if (year) {
      const matchByYear = results.find((r) => {
        const airYear = r.firstAirDate
          ? new Date(r.firstAirDate).getFullYear()
          : null;
        return airYear === year;
      });
      if (matchByYear) {
        return matchByYear.id;
      }
    }

    // Return the first result as best match
    return results[0].id;
  }

  /**
   * Find a movie by title and optionally year
   * Returns the TMDB ID if found
   */
  async findMovieByTitle(title: string, year?: number): Promise<number | null> {
    const results = await this.searchMovies(title);

    if (results.length === 0) {
      return null;
    }

    // If year is provided, try to match by year
    if (year) {
      const matchByYear = results.find((r) => {
        const releaseYear = r.releaseDate
          ? new Date(r.releaseDate).getFullYear()
          : null;
        return releaseYear === year;
      });
      if (matchByYear) {
        return matchByYear.id;
      }
    }

    // Return the first result as best match
    return results[0].id;
  }
}
