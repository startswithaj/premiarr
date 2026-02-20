// Rotten Tomatoes types
export interface RTTvShow {
  title: string;
  url: string;
  tomatoScore?: number;
  audienceScore?: number;
  posterUrl?: string;
  synopsis?: string;
  network?: string;
  premiereDate?: string;
  certifiedFresh?: boolean;
}

// Seerr/Jellyseerr types
export interface SeerrSearchResult {
  page: number;
  totalPages: number;
  totalResults: number;
  results: SeerrMediaResult[];
}

export interface SeerrMediaResult {
  id: number;
  mediaType: 'movie' | 'tv';
  title?: string;
  name?: string;
  overview?: string;
  posterPath?: string;
  firstAirDate?: string;
  releaseDate?: string;
  mediaInfo?: {
    id: number;
    status: number;
    requests?: SeerrRequest[];
  };
}

export interface SeerrTvDetails {
  id: number;
  name: string;
  overview: string;
  posterPath?: string;
  backdropPath?: string;
  firstAirDate: string;
  lastAirDate?: string;
  numberOfSeasons: number;
  numberOfEpisodes: number;
  seasons: SeerrSeason[];
  status: string;
  externalIds?: {
    imdbId?: string;
    tvdbId?: number;
  };
  mediaInfo?: {
    id: number;
    status: number;
    requests?: SeerrRequest[];
  };
}

export interface SeerrMovieDetails {
  id: number;
  title: string;
  overview: string;
  posterPath?: string;
  backdropPath?: string;
  releaseDate: string;
  runtime?: number;
  status: string;
  externalIds?: {
    imdbId?: string;
  };
  mediaInfo?: {
    id: number;
    status: number;
    requests?: SeerrRequest[];
  };
}

export interface SeerrSeason {
  id: number;
  seasonNumber: number;
  episodeCount: number;
  airDate?: string;
  name: string;
  overview?: string;
}

export interface SeerrRequest {
  id: number;
  status: number;
  media: {
    id: number;
    mediaType: string;
    tmdbId: number;
  };
  seasons?: { seasonNumber: number }[];
  requestedBy: {
    id: number;
    displayName: string;
  };
}

export interface SeerrRequestBody {
  mediaId: number;
  mediaType: 'tv' | 'movie';
  seasons?: number[];
  is4k?: boolean;
}

// Internal types
export interface PremierShow {
  title: string;
  rtUrl: string;
  tomatoScore?: number;
  audienceScore?: number;
  certifiedFresh: boolean;
  posterUrl?: string;
  synopsis?: string;
  network?: string;
  mediaType: 'tv' | 'movie';
  releaseDate?: string;
  seerrId?: number;
  seerrStatus?: 'available' | 'requested' | 'pending' | 'unavailable';
  currentSeason?: number;
  imdbId?: string;
}

export interface Config {
  telegram: {
    botToken: string;
    chatId: string;
    topicId?: number;
  };
  seerr: {
    url: string;
    apiKey: string;
  };
  schedule: {
    dailyCron: string;
  };
  rt: {
    tvFilter: string;
    movieFilter: string;
  };
  runMode: 'daemon' | 'cron';
  runOnStartup: boolean;
  dbPath: string;
}
