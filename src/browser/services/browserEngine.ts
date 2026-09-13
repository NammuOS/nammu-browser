import { browserStorage } from '../../host/storage';

export type SearchEngine = 'google' | 'duckduckgo' | 'bing' | 'ecosia';
export type BrowserEngineMode = 'gateway' | 'wasm';

export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  favicon: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  history: string[];
  historyIndex: number;
  engineMode: BrowserEngineMode;
  isPinned?: boolean;
  isMuted?: boolean;
  isAudioPlaying?: boolean;
  isPrivate?: boolean;
}

export interface BrowserHistoryPosition {
  history: string[];
  historyIndex: number;
}

export function reconcileBrowserHistoryPosition(
  history: string[],
  historyIndex: number,
  observedUrl: string,
): BrowserHistoryPosition {
  const previousIndex = historyIndex - 1;
  if (previousIndex >= 0 && history[previousIndex] === observedUrl) {
    return { history, historyIndex: previousIndex };
  }

  const nextIndex = historyIndex + 1;
  if (nextIndex < history.length && history[nextIndex] === observedUrl) {
    return { history, historyIndex: nextIndex };
  }

  const currentHistory = history.slice(0, historyIndex + 1);
  return {
    history: [...currentHistory, observedUrl],
    historyIndex: currentHistory.length,
  };
}

export interface BrowserPreferences {
  searchEngine: SearchEngine;
  showBookmarksBar: boolean;
  trackingProtection: boolean;
  blockAutoplay: boolean;
  defaultZoom: number;
}

export const DEFAULT_BROWSER_PREFERENCES: BrowserPreferences = {
  searchEngine: 'google',
  showBookmarksBar: true,
  trackingProtection: true,
  blockAutoplay: false,
  defaultZoom: 100,
};

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  group?: string;
}

export interface HistoryEntry {
  id: string;
  title: string;
  url: string;
  timestamp: number;
  favicon?: string;
}

export interface QuickDial {
  id: string;
  title: string;
  url: string;
  icon: string;
  color: string;
  desc: string;
}

export const DEFAULT_QUICK_DIALS: QuickDial[] = [
  {
    id: 'google',
    title: 'Google',
    url: 'https://www.google.com',
    icon: '🔍',
    color: '#4285f4',
    desc: 'Search the World',
  },
  {
    id: 'youtube',
    title: 'YouTube',
    url: 'https://www.youtube.com',
    icon: '▶️',
    color: '#ff0000',
    desc: 'Watch & Stream Videos',
  },
  {
    id: 'github',
    title: 'GitHub',
    url: 'https://github.com',
    icon: '🐙',
    color: '#ffffff',
    desc: 'Where the World Builds Software',
  },
  {
    id: 'reddit',
    title: 'Reddit',
    url: 'https://www.reddit.com',
    icon: '🤖',
    color: '#ff4500',
    desc: 'The Front Page of the Internet',
  },
  {
    id: 'wikipedia',
    title: 'Wikipedia',
    url: 'https://www.wikipedia.org',
    icon: '🌐',
    color: '#638096',
    desc: 'Free Online Encyclopedia',
  },
  {
    id: 'hackernews',
    title: 'Hacker News',
    url: 'https://news.ycombinator.com',
    icon: '⚡',
    color: '#ff6600',
    desc: 'Tech & Startup Discussions',
  },
  {
    id: 'nammu',
    title: 'Nammu Cloud',
    url: 'https://nammu.os',
    icon: '☁️',
    color: '#4aa3ff',
    desc: 'Unified Multi-Cloud Engine',
  },
  {
    id: 'mdn',
    title: 'MDN Web Docs',
    url: 'https://developer.mozilla.org',
    icon: '🦊',
    color: '#83b4ff',
    desc: 'Mozilla Developer Network',
  },
];

export const DEFAULT_BOOKMARKS: Bookmark[] = [
  {
    id: 'b1',
    title: 'Google Search',
    url: 'https://www.google.com',
    favicon: 'https://www.google.com/favicon.ico',
  },
  {
    id: 'b2',
    title: 'YouTube',
    url: 'https://www.youtube.com',
    favicon: 'https://www.youtube.com/favicon.ico',
  },
  {
    id: 'b3',
    title: 'GitHub',
    url: 'https://github.com',
    favicon: 'https://github.githubassets.com/favicons/favicon.png',
  },
  {
    id: 'b4',
    title: 'Reddit',
    url: 'https://www.reddit.com',
    favicon: 'https://www.reddit.com/favicon.ico',
  },
  {
    id: 'b5',
    title: 'Wikipedia',
    url: 'https://www.wikipedia.org',
    favicon: 'https://www.wikipedia.org/static/favicon/wikipedia.ico',
  },
];

const BOOKMARKS_STORAGE_KEY = 'nammu_browser_bookmarks';
const HISTORY_STORAGE_KEY = 'nammu_browser_history';
const PREFERENCES_STORAGE_KEY = 'nammu_browser_preferences';

export function getStoredBrowserPreferences(): BrowserPreferences {
  try {
    const saved = JSON.parse(
      browserStorage.getItem(PREFERENCES_STORAGE_KEY) || '{}',
    ) as Partial<BrowserPreferences>;
    const searchEngine = ['google', 'duckduckgo', 'bing', 'ecosia'].includes(
      saved.searchEngine || '',
    )
      ? saved.searchEngine!
      : DEFAULT_BROWSER_PREFERENCES.searchEngine;

    return {
      ...DEFAULT_BROWSER_PREFERENCES,
      ...saved,
      searchEngine,
      defaultZoom: Math.min(200, Math.max(50, Number(saved.defaultZoom) || 100)),
      showBookmarksBar: saved.showBookmarksBar !== false,
      trackingProtection: saved.trackingProtection !== false,
      blockAutoplay: saved.blockAutoplay === true,
    };
  } catch {
    return { ...DEFAULT_BROWSER_PREFERENCES };
  }
}

export function saveStoredBrowserPreferences(preferences: BrowserPreferences): void {
  try {
    browserStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {}
}

export function getStoredBookmarks(): Bookmark[] {
  try {
    const raw = browserStorage.getItem(BOOKMARKS_STORAGE_KEY);
    if (!raw) return DEFAULT_BOOKMARKS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sanitizeBookmarks(parsed) : DEFAULT_BOOKMARKS;
  } catch {
    return DEFAULT_BOOKMARKS;
  }
}

export function saveStoredBookmarks(bookmarks: Bookmark[]): void {
  try {
    browserStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(sanitizeBookmarks(bookmarks)));
  } catch {}
}

export function sanitizeBookmarks(input: unknown): Bookmark[] {
  if (!Array.isArray(input)) return [];

  const bookmarks: Bookmark[] = [];
  const ids = new Set<string>();
  for (const [index, candidate] of input.slice(0, 2_000).entries()) {
    if (!candidate || typeof candidate !== 'object') continue;
    const raw = candidate as Partial<Bookmark>;
    if (typeof raw.url !== 'string') continue;

    let url: URL;
    try {
      url = new URL(raw.url.trim());
    } catch {
      continue;
    }
    if (!['http:', 'https:'].includes(url.protocol)) continue;

    const requestedId = typeof raw.id === 'string' ? raw.id.trim().slice(0, 120) : '';
    let id = requestedId || `imported-${index}-${url.hostname}`;
    while (ids.has(id)) id = `${id}-${index}`;
    ids.add(id);

    const title =
      typeof raw.title === 'string' && raw.title.trim()
        ? raw.title.trim().slice(0, 240)
        : url.hostname;
    const group =
      typeof raw.group === 'string' && raw.group.trim()
        ? raw.group.trim().slice(0, 120)
        : undefined;
    const favicon =
      typeof raw.favicon === 'string' && /^https?:\/\//i.test(raw.favicon.trim())
        ? raw.favicon.trim().slice(0, 2_048)
        : undefined;
    bookmarks.push({ id, title, url: url.href, favicon, group });
  }
  return bookmarks;
}

export function getStoredHistory(): HistoryEntry[] {
  try {
    const raw = browserStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveStoredHistory(history: HistoryEntry[]): void {
  try {
    browserStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 200)));
  } catch {}
}

/**
 * Normalizes input string to a valid URL or search engine query
 */
export function normalizeBrowserUrl(input: string, searchEngine: SearchEngine = 'google'): string {
  const trimmed = input.trim();
  if (!trimmed) return 'about:home';

  if (/^about:[a-z0-9-]+(?:[?#].*)?$/i.test(trimmed) || /^view-source:/i.test(trimmed)) {
    return trimmed;
  }

  // Already a full protocol
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    return trimmed;
  }

  // Check if it's a domain name (contains dot and no spaces, e.g. google.com, localhost:3000)
  const isDomain =
    /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$/i.test(trimmed) ||
    /^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(trimmed);

  if (isDomain) {
    return `https://${trimmed}`;
  }

  // Otherwise, treat as search query
  const query = encodeURIComponent(trimmed);
  switch (searchEngine) {
    case 'duckduckgo':
      return `https://duckduckgo.com/?q=${query}`;
    case 'bing':
      return `https://www.bing.com/search?q=${query}`;
    case 'ecosia':
      return `https://www.ecosia.org/search?q=${query}`;
    case 'google':
    default:
      return `https://www.google.com/search?q=${query}`;
  }
}

/**
 * Converts a target URL to the backend proxy URL
 */
export function getProxiedUrl(targetUrl: string): string {
  if (!targetUrl || targetUrl.startsWith('about:') || targetUrl.startsWith('data:')) {
    return targetUrl;
  }
  return `/api/browser/proxy?url=${encodeURIComponent(targetUrl)}`;
}

/**
 * Extracts a favicon URL for a given domain
 */
export function getDomainFavicon(urlStr: string): string {
  if (!urlStr || urlStr.startsWith('about:')) return '';
  try {
    const parsed = new URL(urlStr);
    return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=32`;
  } catch {
    return '';
  }
}
