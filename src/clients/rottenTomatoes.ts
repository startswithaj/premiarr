import type { RTTvShow } from '../types/index.js';
import { logger } from '../utils/logger.js';

const RT_BASE_URL = 'https://www.rottentomatoes.com';
const RT_API_URL = `${RT_BASE_URL}/cnapi/browse`;

// Browser-like headers required for the API
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
  Accept: '*/*',
  Referer: RT_BASE_URL,
};

// API response types
interface RTApiResponse {
  title: string;
  grid: {
    id: string;
    list: RTApiItem[];
  };
  pageInfo: {
    startCursor: string;
    endCursor: string;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

interface RTApiItem {
  title: string;
  mediaUrl: string;
  type: 'TvSeries' | 'Movie';
  releaseDateText?: string;
  posterUri?: string;
  emsId?: string;
  criticsScore?: {
    score?: string;
    scorePercent?: string;
    certified?: boolean;
    sentiment?: string;
  };
  audienceScore?: {
    score?: string;
    scorePercent?: string;
    certified?: boolean;
    sentiment?: string;
  };
}

export interface RTMovie {
  title: string;
  url: string;
  tomatoScore?: number;
  audienceScore?: number;
  certifiedFresh: boolean;
  posterUrl?: string;
  releaseDate?: string;
}

export class RottenTomatoesClient {
  /**
   * Browse TV shows with a raw filter string (e.g., "critics:fresh~sort:newest")
   */
  async browseTvShowsWithFilter(filterString: string, page: number = 1): Promise<RTTvShow[]> {
    const url = `${RT_API_URL}/tv_series_browse/${filterString}?page=${page}`;
    const data = await this.fetchApi(url);
    return this.transformToTvShows(data.grid.list);
  }

  /**
   * Browse movies with a raw filter string (e.g., "critics:fresh~sort:newest")
   */
  async browseMoviesWithFilter(filterString: string, page: number = 1): Promise<RTMovie[]> {
    const url = `${RT_API_URL}/movies_at_home/${filterString}?page=${page}`;
    const data = await this.fetchApi(url);
    return this.transformToMovies(data.grid.list);
  }

  private async fetchApi(url: string): Promise<RTApiResponse> {
    logger.debug(`[RT] Fetching: ${url}`);
    const response = await fetch(url, { headers: HEADERS });

    if (!response.ok) {
      throw new Error(`RT API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as RTApiResponse;
    logger.debug(`[RT] Got ${data.grid.list.length} items`);
    return data;
  }

  private transformToTvShows(items: RTApiItem[]): RTTvShow[] {
    const tvItems = items.filter((item) => item.type === 'TvSeries');

    // Log raw RT data for debugging
    logger.debug(`[RT] TV Shows from API:`);
    for (const item of tvItems) {
      logger.debug(`[RT]   "${item.title}" - date: "${item.releaseDateText}" - url: ${item.mediaUrl}`);
    }

    return tvItems.map((item) => ({
      title: item.title,
      url: `${RT_BASE_URL}${item.mediaUrl}`,
      tomatoScore: item.criticsScore?.score
        ? parseInt(item.criticsScore.score, 10)
        : undefined,
      audienceScore: item.audienceScore?.score
        ? parseInt(item.audienceScore.score, 10)
        : undefined,
      certifiedFresh: item.criticsScore?.certified ?? false,
      posterUrl: item.posterUri,
      premiereDate: item.releaseDateText,
    }));
  }

  private transformToMovies(items: RTApiItem[]): RTMovie[] {
    const movieItems = items.filter((item) => item.type === 'Movie');

    // Log raw RT data for debugging
    logger.debug(`[RT] Movies from API:`);
    for (const item of movieItems) {
      logger.debug(`[RT]   "${item.title}" - date: "${item.releaseDateText}" - url: ${item.mediaUrl}`);
    }

    return movieItems.map((item) => ({
      title: item.title,
      url: `${RT_BASE_URL}${item.mediaUrl}`,
      tomatoScore: item.criticsScore?.score
        ? parseInt(item.criticsScore.score, 10)
        : undefined,
      audienceScore: item.audienceScore?.score
        ? parseInt(item.audienceScore.score, 10)
        : undefined,
      certifiedFresh: item.criticsScore?.certified ?? false,
      posterUrl: item.posterUri,
      releaseDate: item.releaseDateText,
    }));
  }
}
