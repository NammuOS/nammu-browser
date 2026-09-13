import type { Bookmark, HistoryEntry, QuickDial } from '../services/browserEngine';
import { DEFAULT_NEW_TAB_WORKSPACES } from './newTabDefaults';
import { browserStorage } from '../../host/storage';

export const NEW_TAB_STORAGE_KEY = 'nammu_browser_new_tab_workspace_v1';
export const NEW_TAB_SCHEMA_VERSION = 4;
export const NEW_TAB_MAX_WORKSPACES = 12;
export const NEW_TAB_MAX_BOARDS = 48;
export const NEW_TAB_MAX_LINKS = 500;

export interface NewTabLink {
  id: string;
  title: string;
  url: string;
  note: string;
  createdAt: number;
}

export interface NewTabBoard {
  id: string;
  title: string;
  links: NewTabLink[];
  collapsed?: boolean;
}

export interface NewTabWorkspace {
  id: string;
  name: string;
  boards: NewTabBoard[];
}

export interface NewTabState {
  version: typeof NEW_TAB_SCHEMA_VERSION;
  activeWorkspaceId: string;
  density: 'comfortable' | 'compact';
  wallpaper: 'ambient' | 'midnight' | 'graphite' | 'aurora';
  showClock: boolean;
  showDate: boolean;
  showLinkDetails: boolean;
  workspaces: NewTabWorkspace[];
}

export interface NewTabSearchResult {
  id: string;
  title: string;
  url: string;
  note: string;
  source: 'workspace' | 'bookmark' | 'history';
  favicon?: string;
}

function id(prefix: string): string {
  const value =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function safeText(value: unknown, fallback: string, maxLength = 120): string {
  if (typeof value !== 'string') return fallback;
  const clean = Array.from(value.trim())
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    })
    .join('')
    .slice(0, maxLength);
  return clean || fallback;
}

export function normalizeNewTabUrl(value: string): string | null {
  const candidate = value.trim();
  if (!candidate || hasControlCharacters(candidate)) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(candidate) ? candidate : `https://${candidate}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function createLink(title: string, url: string, note = ''): NewTabLink {
  return {
    id: id('link'),
    title,
    url,
    note,
    createdAt: Date.now(),
  };
}

export function createDefaultNewTabState(_quickDials: QuickDial[]): NewTabState {
  const workspaces = DEFAULT_NEW_TAB_WORKSPACES.map((workspace) => ({
    id: `workspace-${workspace.id}`,
    name: workspace.name,
    boards: workspace.boards.map((board) => ({
      id: `board-${board.id}`,
      title: board.title,
      links: board.links.map((link) => ({
        id: `link-seed-${link.id}`,
        title: link.title,
        url: link.url,
        note: link.note,
        createdAt: 0,
      })),
    })),
  }));
  return {
    version: NEW_TAB_SCHEMA_VERSION,
    activeWorkspaceId: workspaces[0].id,
    density: 'comfortable',
    wallpaper: 'ambient',
    showClock: true,
    showDate: true,
    showLinkDetails: true,
    workspaces,
  };
}

function isRetiredStarterState(version: unknown, workspaces: NewTabWorkspace[]): boolean {
  if (version === 1 && workspaces.length === 1) {
    const workspace = workspaces[0];
    return (
      workspace.id === 'workspace-home' &&
      workspace.boards.length === 2 &&
      workspace.boards.every((board) => ['board-essentials', 'board-reference'].includes(board.id))
    );
  }
  if (version !== 2 || workspaces.length !== 4) return false;
  const expectedWorkspaceIds = [
    'workspace-focus',
    'workspace-studio',
    'workspace-intelligence',
    'workspace-operations',
  ];
  return (
    workspaces.every((workspace, index) => workspace.id === expectedWorkspaceIds[index]) &&
    workspaces.flatMap((workspace) => workspace.boards).length === 12 &&
    workspaces
      .flatMap((workspace) => workspace.boards.flatMap((board) => board.links))
      .every((link) => link.id.startsWith('link-seed-') && link.createdAt === 0)
  );
}

function sanitizeLink(value: unknown): NewTabLink | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<NewTabLink>;
  const url = normalizeNewTabUrl(typeof source.url === 'string' ? source.url : '');
  if (!url) return null;
  return {
    id: safeText(source.id, id('link'), 100),
    title: safeText(source.title, new URL(url).hostname, 100),
    url,
    note: safeText(source.note, '', 240),
    createdAt: Number.isFinite(source.createdAt) ? Number(source.createdAt) : Date.now(),
  };
}

export function sanitizeNewTabState(value: unknown, fallback: NewTabState): NewTabState {
  if (!value || typeof value !== 'object') return fallback;
  const source = value as Partial<NewTabState>;
  if (!Array.isArray(source.workspaces)) return fallback;

  let linkCount = 0;
  let boardCount = 0;
  const workspaceIds = new Set<string>();
  const workspaces: NewTabWorkspace[] = [];
  for (const candidate of source.workspaces.slice(0, NEW_TAB_MAX_WORKSPACES)) {
    if (!candidate || typeof candidate !== 'object') continue;
    const raw = candidate as Partial<NewTabWorkspace>;
    const workspaceId = safeText(raw.id, id('workspace'), 100);
    if (workspaceIds.has(workspaceId)) continue;
    workspaceIds.add(workspaceId);
    const boards: NewTabBoard[] = [];
    const boardIds = new Set<string>();
    for (const candidateBoard of Array.isArray(raw.boards) ? raw.boards : []) {
      if (boardCount >= NEW_TAB_MAX_BOARDS || !candidateBoard || typeof candidateBoard !== 'object')
        break;
      const rawBoard = candidateBoard as Partial<NewTabBoard>;
      const boardId = safeText(rawBoard.id, id('board'), 100);
      if (boardIds.has(boardId)) continue;
      boardIds.add(boardId);
      const links: NewTabLink[] = [];
      const linkIds = new Set<string>();
      for (const candidateLink of Array.isArray(rawBoard.links) ? rawBoard.links : []) {
        if (linkCount >= NEW_TAB_MAX_LINKS) break;
        const link = sanitizeLink(candidateLink);
        if (!link || linkIds.has(link.id)) continue;
        linkIds.add(link.id);
        links.push(link);
        linkCount += 1;
      }
      boards.push({
        id: boardId,
        title: safeText(rawBoard.title, 'Untitled board'),
        links,
        collapsed: rawBoard.collapsed === true,
      });
      boardCount += 1;
    }
    workspaces.push({ id: workspaceId, name: safeText(raw.name, 'Workspace', 60), boards });
  }

  if (!workspaces.length) return fallback;
  if (isRetiredStarterState(source.version, workspaces)) return fallback;
  const requestedActive =
    typeof source.activeWorkspaceId === 'string' ? source.activeWorkspaceId : '';
  return {
    version: NEW_TAB_SCHEMA_VERSION,
    activeWorkspaceId: workspaces.some((workspace) => workspace.id === requestedActive)
      ? requestedActive
      : workspaces[0].id,
    density: 'comfortable',
    wallpaper: ['ambient', 'midnight', 'graphite', 'aurora'].includes(String(source.wallpaper))
      ? (source.wallpaper as NewTabState['wallpaper'])
      : 'ambient',
    showClock: source.showClock !== false,
    showDate: true,
    showLinkDetails: source.showLinkDetails !== false,
    workspaces,
  };
}

export function readNewTabState(quickDials: QuickDial[]): NewTabState {
  const fallback = createDefaultNewTabState(quickDials);
  if (typeof window === 'undefined') return fallback;
  try {
    return sanitizeNewTabState(
      JSON.parse(browserStorage.getItem(NEW_TAB_STORAGE_KEY) || 'null'),
      fallback,
    );
  } catch {
    return fallback;
  }
}

export function writeNewTabState(state: NewTabState): void {
  if (typeof window === 'undefined') return;
  try {
    browserStorage.setItem(NEW_TAB_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be denied or exhausted; the in-memory workspace remains usable.
  }
}

export function createNewTabWorkspace(name: string): NewTabWorkspace {
  return { id: id('workspace'), name: safeText(name, 'Workspace', 60), boards: [] };
}

export function createNewTabBoard(title: string): NewTabBoard {
  return {
    id: id('board'),
    title: safeText(title, 'Untitled board'),
    links: [],
    collapsed: false,
  };
}

export function createNewTabLink(title: string, rawUrl: string, note = ''): NewTabLink | null {
  const url = normalizeNewTabUrl(rawUrl);
  if (!url) return null;
  return createLink(safeText(title, new URL(url).hostname, 100), url, safeText(note, '', 240));
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function searchNewTabContent(
  state: NewTabState,
  bookmarks: Bookmark[],
  history: HistoryEntry[],
  query: string,
): NewTabSearchResult[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const results: NewTabSearchResult[] = [];
  const seen = new Set<string>();
  const push = (result: NewTabSearchResult) => {
    const key = result.url.toLocaleLowerCase();
    if (seen.has(key)) return;
    const haystack = `${result.title} ${result.url} ${result.note}`.toLocaleLowerCase();
    if (!haystack.includes(needle)) return;
    seen.add(key);
    results.push(result);
  };
  state.workspaces.forEach((workspace) =>
    workspace.boards.forEach((board) =>
      board.links.forEach((link) =>
        push({
          ...link,
          note: [board.title, link.note].filter(Boolean).join(' / '),
          source: 'workspace',
        }),
      ),
    ),
  );
  bookmarks.forEach((bookmark) =>
    push({
      id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      note: 'Browser bookmark',
      source: 'bookmark',
      favicon: bookmark.favicon,
    }),
  );
  history.slice(0, 100).forEach((entry) =>
    push({
      id: entry.id,
      title: entry.title,
      url: entry.url,
      note: 'Recent history',
      source: 'history',
      favicon: entry.favicon,
    }),
  );
  return results.slice(0, 24);
}
