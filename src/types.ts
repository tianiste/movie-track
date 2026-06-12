export type MediaType = 'anime' | 'movie' | 'youtube' | 'unknown';
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface AuthUser {
  id: string;
  email?: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  tokenType?: string;
  user?: AuthUser;
}

export interface WatchRecord {
  id: string;
  tabId: number;
  url: string;
  hostname: string;
  rawTitle: string;
  title: string;
  mediaType: MediaType;
  season: number | null;
  episode: number | null;
  confidence: number;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  lastPlaybackTime?: number;
  videoDurationSec?: number | null;
  identityKey?: string;
  syncStatus?: SyncStatus;
  syncError?: string;
  cloudId?: string;
  updatedAt?: number;
}
