import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  normalizeBrowserUrl,
  reconcileBrowserHistoryPosition,
  sanitizeBookmarks,
} from '../src/browser/services/browserEngine';

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
});
