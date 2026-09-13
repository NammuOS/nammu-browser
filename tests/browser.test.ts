import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  normalizeBrowserUrl,
  getStoredBrowserPreferences,
  getStoredHistory,
  reconcileBrowserHistoryPosition,
  sanitizeBookmarks,
  saveStoredBrowserPreferences,
  saveStoredHistory,
  type Bookmark,
  type HistoryEntry,
  type QuickDial,
} from '../src/browser/services/browserEngine';
import {
  NEW_TAB_MAX_BOARDS,
  NEW_TAB_MAX_LINKS,
  NEW_TAB_MAX_WORKSPACES,
  createDefaultNewTabState,
  createNewTabLink,
  moveItem,
  normalizeNewTabUrl,
  sanitizeNewTabState,
  searchNewTabContent,
} from '../src/browser/new-tab/newTabModel';
import { initializeBrowserStorage } from '../src/host/storage';

const dials: QuickDial[] = Array.from({ length: 6 }, (_, index) => ({
  id: `dial-${index}`,
  title: `Dial ${index}`,
  url: `https://dial-${index}.example`,
  icon: '',
  color: '#fff',
  desc: `Reference ${index}`,
}));

function sourceFiles(path: string): string[] {
  return readdirSync(path).flatMap((name) => {
    const entry = resolve(path, name);
    return statSync(entry).isDirectory() ? sourceFiles(entry) : /\.(ts|tsx)$/.test(name) ? [entry] : [];
  });
}

describe('os.nammu.browser package boundary', () => {
  it('normalizes addresses and searches without granting local-origin navigation', () => {
    expect(normalizeBrowserUrl('example.com')).toBe('https://example.com');
    expect(normalizeBrowserUrl('nammu browser', 'duckduckgo')).toBe(
      'https://duckduckgo.com/?q=nammu%20browser',
    );
  });

  it('reconciles observed host navigation without duplicating back/forward history', () => {
    expect(reconcileBrowserHistoryPosition(['https://a.test/', 'https://b.test/'], 1, 'https://a.test/'))
      .toEqual({ history: ['https://a.test/', 'https://b.test/'], historyIndex: 0 });
    expect(reconcileBrowserHistoryPosition(['https://a.test/'], 0, 'https://b.test/')).toEqual({
      history: ['https://a.test/', 'https://b.test/'],
      historyIndex: 1,
    });
  });

  it('imports only bounded public HTTP(S) bookmarks', () => {
    expect(
      sanitizeBookmarks([
        { id: 'one', title: 'One', url: 'https://example.com' },
        { id: 'two', title: 'Local file', url: 'file:///C:/secret.txt' },
        { id: 'three', title: 'Script', url: 'javascript:alert(1)' },
      ]),
    ).toEqual([
      {
        id: 'one',
        title: 'One',
        url: 'https://example.com/',
        favicon: undefined,
        group: undefined,
      },
    ]);
  });

  it('ships no Core-owned runtime authority in package source', () => {
    const source = sourceFiles(resolve(import.meta.dir, '..', 'src'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    for (const forbidden of [
      'geckoEvalChrome',
      'gBrowser',
      'firefox-wisp',
      'WebView2',
      '@tauri-apps',
      '__TAURI__',
      'nmuEngine',
      'capabilityBroker',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('routes restored product commands only through the typed WebSurface SDK', () => {
    const browser = readFileSync(resolve(import.meta.dir, '..', 'src/browser/BrowserApp.tsx'), 'utf8');
    const host = readFileSync(resolve(import.meta.dir, '..', 'src/host/NativeWebSurface.tsx'), 'utf8');
    for (const command of [
      ": 'find'",
      "surface.control('clear-find')",
      "surface.control('print')",
      "surface.control('save-page')",
      "'enable-tracking-protection'",
      "'block-autoplay'",
    ]) {
      expect(host).toContain(command);
    }
    expect(browser).toContain('Duplicate Tab');
    expect(browser).toContain('Close Other Tabs');
    expect(browser).toContain('Close Tabs to the Right');
    expect(browser).toContain('requestFullscreen');
  });

  it('restores history and preferences from host-owned app settings after reopen', async () => {
    const persisted = new Map<string, unknown>();
    const app = {
      settings: {
        getAll: async () => Object.fromEntries(persisted),
        set: async (key: string, value: unknown) => {
          persisted.set(key, value);
          return { success: true };
        },
      },
      migration: {
        readLegacyStorage: async () => null,
        completeLegacyStorage: async () => ({ completed: true }),
      },
    } as any;

    await initializeBrowserStorage(app);
    saveStoredHistory([{ id: 'visit', title: 'Example', url: 'https://example.com/', timestamp: 1 }]);
    saveStoredBrowserPreferences({
      searchEngine: 'duckduckgo',
      showBookmarksBar: false,
      trackingProtection: true,
      blockAutoplay: true,
      defaultZoom: 130,
    });
    await Promise.resolve();
    await initializeBrowserStorage(app);

    expect(getStoredHistory()).toEqual([
      { id: 'visit', title: 'Example', url: 'https://example.com/', timestamp: 1 },
    ]);
    expect(getStoredBrowserPreferences()).toMatchObject({
      searchEngine: 'duckduckgo',
      showBookmarksBar: false,
      trackingProtection: true,
      blockAutoplay: true,
      defaultZoom: 130,
    });
  });

  it('ships the complete deterministic productive new-tab workspace', () => {
    const state = createDefaultNewTabState(dials);
    expect(state.workspaces).toHaveLength(9);
    expect(state.workspaces.flatMap((workspace) => workspace.boards)).toHaveLength(32);
    expect(
      state.workspaces.flatMap((workspace) => workspace.boards.flatMap((board) => board.links)),
    ).toHaveLength(148);
    expect(createDefaultNewTabState(dials)).toEqual(state);
    expect(state.wallpaper).toBe('ambient');
    expect(state.showClock).toBe(true);
    expect(state.showDate).toBe(true);
  });

  it('sanitizes untrusted new-tab links and bounded persisted state', () => {
    expect(normalizeNewTabUrl('example.com')).toBe('https://example.com/');
    expect(normalizeNewTabUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeNewTabUrl('file:///C:/secret.txt')).toBeNull();
    expect(normalizeNewTabUrl('https://example.com/\u0000bad')).toBeNull();
    expect(createNewTabLink('Unsafe', 'javascript:alert(1)')).toBeNull();

    const fallback = createDefaultNewTabState(dials);
    const oversized = {
      version: 999,
      activeWorkspaceId: 'missing',
      workspaces: Array.from({ length: NEW_TAB_MAX_WORKSPACES + 5 }, (_, workspaceIndex) => ({
        id: `workspace-${workspaceIndex}`,
        name: `Workspace ${workspaceIndex}`,
        boards: Array.from({ length: NEW_TAB_MAX_BOARDS + 5 }, (_, boardIndex) => ({
          id: `board-${workspaceIndex}-${boardIndex}`,
          title: `Board ${boardIndex}`,
          links: Array.from({ length: NEW_TAB_MAX_LINKS + 5 }, (_, linkIndex) => ({
            id: `link-${workspaceIndex}-${boardIndex}-${linkIndex}`,
            title: `Link ${linkIndex}`,
            url: `https://example.com/${workspaceIndex}/${boardIndex}/${linkIndex}`,
          })),
        })),
      })),
    };
    const sanitized = sanitizeNewTabState(oversized, fallback);
    expect(sanitized.workspaces.length).toBeLessThanOrEqual(NEW_TAB_MAX_WORKSPACES);
    expect(sanitized.workspaces.flatMap((workspace) => workspace.boards).length).toBeLessThanOrEqual(
      NEW_TAB_MAX_BOARDS,
    );
    expect(
      sanitized.workspaces.flatMap((workspace) =>
        workspace.boards.flatMap((board) => board.links),
      ).length,
    ).toBeLessThanOrEqual(NEW_TAB_MAX_LINKS);
  });

  it('keeps immutable reordering and deduplicated workspace search behavior', () => {
    const source = ['one', 'two', 'three'];
    expect(moveItem(source, 0, 2)).toEqual(['two', 'three', 'one']);
    expect(source).toEqual(['one', 'two', 'three']);

    const state = createDefaultNewTabState(dials);
    const bookmarks: Bookmark[] = [
      { id: 'bookmark-1', title: 'Nammu Docs', url: 'https://docs.nammu.test' },
    ];
    const history: HistoryEntry[] = [
      {
        id: 'history-1',
        title: 'Nammu changelog',
        url: 'https://changes.nammu.test',
        timestamp: Date.now(),
      },
    ];
    const results = searchNewTabContent(state, bookmarks, history, 'nammu');
    expect(results.map((result) => result.source)).toEqual(['bookmark', 'history']);
    expect(new Set(results.map((result) => result.url)).size).toBe(results.length);
  });
});
