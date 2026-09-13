import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark as BookmarkIcon,
  ChevronLeft,
  Download,
  Globe2,
  Home,
  Lock,
  Menu,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  RotateCw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { getNammuSDK, type WebSurfaceSnapshot } from '@nammu/sdk';
import BrowserMenu from './BrowserMenu';
import ProxyManagerPanel from './ProxyManagerPanel';
import NammuNewTab from './new-tab/NammuNewTab';
import NativeWebSurface, { type NativeWebSurfaceHandle } from '../host/NativeWebSurface';
import {
  DEFAULT_QUICK_DIALS,
  getDomainFavicon,
  getStoredBookmarks,
  getStoredBrowserPreferences,
  getStoredHistory,
  normalizeBrowserUrl,
  reconcileBrowserHistoryPosition,
  sanitizeBookmarks,
  saveStoredBookmarks,
  saveStoredBrowserPreferences,
  saveStoredHistory,
  type Bookmark,
  type BrowserPreferences,
  type BrowserTab,
  type HistoryEntry,
} from './services/browserEngine';
import type { PublicProxyConnection } from './services/publicProxy';

type Panel = 'bookmarks' | 'history' | 'downloads' | 'settings' | null;

const INTERNAL_URLS = new Set(['about:home', 'about:bookmarks', 'about:history', 'about:downloads']);

function tabId() {
  return `tab-${crypto.randomUUID()}`;
}

function newTab(options: { url?: string; privateSession?: boolean; pinned?: boolean } = {}): BrowserTab {
  const url = options.url ?? 'about:home';
  return {
    id: tabId(),
    title: options.privateSession ? 'Private Tab' : 'New Tab',
    url,
    favicon: getDomainFavicon(url),
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    history: [url],
    historyIndex: 0,
    engineMode: 'gateway',
    isPinned: options.pinned,
    isPrivate: options.privateSession,
    isMuted: false,
    isAudioPlaying: false,
  };
}

function isRemoteUrl(url: string) {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

function hostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url === 'about:home' ? 'New Tab' : 'Browser';
  }
}

function browserError(error: unknown) {
  return error instanceof Error ? error.message : 'The Browser operation could not be completed.';
}

export default function BrowserApp() {
  const initialPreferences = useMemo(() => getStoredBrowserPreferences(), []);
  const [preferences, setPreferences] = useState<BrowserPreferences>(initialPreferences);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => getStoredBookmarks());
  const [history, setHistory] = useState<HistoryEntry[]>(() => getStoredHistory());
  const [tabs, setTabs] = useState<BrowserTab[]>(() => [newTab()]);
  const [activeTabId, setActiveTabId] = useState(() => '');
  const [omnibox, setOmnibox] = useState('');
  const [omniboxFocused, setOmniboxFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [closedTabs, setClosedTabs] = useState<BrowserTab[]>([]);
  const [zoom, setZoom] = useState(initialPreferences.defaultZoom);
  const [failure, setFailure] = useState('');
  const [surfaceReady, setSurfaceReady] = useState<Record<string, boolean>>({});
  const [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [proxyOpen, setProxyOpen] = useState(false);
  const [browserProxy, setBrowserProxy] = useState<PublicProxyConnection | null>(null);
  const [tabProxies, setTabProxies] = useState<Record<string, PublicProxyConnection>>({});
  const surfaceRefs = useRef(new Map<string, NativeWebSurfaceHandle>());
  const historyUrlRef = useRef(new Map<string, string>());
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useEffect(() => {
    if (!activeTabId && tabs[0]) setActiveTabId(tabs[0].id);
  }, [activeTabId, tabs]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const browserOverlayActive = menuOpen || panel !== null || tabMenu !== null || proxyOpen;

  useEffect(() => {
    setOmnibox(activeTab?.url === 'about:home' ? '' : activeTab?.url ?? '');
    setZoom(preferences.defaultZoom);
    setPanel(null);
    setMenuOpen(false);
  }, [activeTab?.id, preferences.defaultZoom]);

  useEffect(() => saveStoredBookmarks(bookmarks), [bookmarks]);
  useEffect(() => saveStoredHistory(history), [history]);
  useEffect(() => saveStoredBrowserPreferences(preferences), [preferences]);

  useEffect(() => {
    const dismiss = () => {
      setMenuOpen(false);
      setTabMenu(null);
    };
    window.addEventListener('pointerdown', dismiss);
    return () => window.removeEventListener('pointerdown', dismiss);
  }, []);

  const openTab = useCallback((url = 'about:home', privateSession = false) => {
    const tab = newTab({ url, privateSession });
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
    setFailure('');
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === id);
      const closing = current[index];
      if (!closing) return current;
      setClosedTabs((closed) => [closing, ...closed].slice(0, 20));
      surfaceRefs.current.delete(id);
      historyUrlRef.current.delete(id);
      if (current.length === 1) {
        const replacement = newTab();
        setActiveTabId(replacement.id);
        return [replacement];
      }
      const remaining = current.filter((tab) => tab.id !== id);
      if (id === activeTabId) setActiveTabId(remaining[Math.min(index, remaining.length - 1)].id);
      return remaining;
    });
  }, [activeTabId]);

  const navigate = useCallback(
    (raw: string, disposition: 'current' | 'new' = 'current') => {
      const url = normalizeBrowserUrl(raw, preferences.searchEngine);
      if (disposition === 'new') {
        openTab(url);
        return;
      }
      const id = activeTab?.id;
      if (!id) return;
      setFailure('');
      setTabs((current) =>
        current.map((tab) => {
          if (tab.id !== id) return tab;
          const nextHistory = [...tab.history.slice(0, tab.historyIndex + 1), url];
          return {
            ...tab,
            url,
            title: url === 'about:home' ? 'New Tab' : hostLabel(url),
            favicon: getDomainFavicon(url),
            isLoading: isRemoteUrl(url),
            history: nextHistory,
            historyIndex: nextHistory.length - 1,
          };
        }),
      );
      setOmnibox(url === 'about:home' ? '' : url);
    },
    [activeTab?.id, openTab, preferences.searchEngine],
  );

  const updateSurfaceState = useCallback((id: string, snapshot: WebSurfaceSnapshot) => {
    setTabs((current) =>
      current.map((tab) => {
        if (tab.id !== id) return tab;
        const observed = snapshot.url && isRemoteUrl(snapshot.url) ? snapshot.url : tab.url;
        const position = observed === tab.url
          ? { history: tab.history, historyIndex: tab.historyIndex }
          : reconcileBrowserHistoryPosition(tab.history, tab.historyIndex, observed);
        return {
          ...tab,
          url: observed,
          title: snapshot.title || hostLabel(observed),
          favicon: getDomainFavicon(observed),
          isLoading: snapshot.isLoading,
          canGoBack: snapshot.canGoBack,
          canGoForward: snapshot.canGoForward,
          isAudioPlaying: snapshot.isAudioPlaying,
          isMuted: snapshot.isMuted,
          ...position,
        };
      }),
    );

    if (snapshot.url && isRemoteUrl(snapshot.url) && historyUrlRef.current.get(id) !== snapshot.url) {
      historyUrlRef.current.set(id, snapshot.url);
      setHistory((current) => [
        {
          id: crypto.randomUUID(),
          title: snapshot.title || hostLabel(snapshot.url),
          url: snapshot.url,
          timestamp: Date.now(),
          favicon: getDomainFavicon(snapshot.url),
        },
        ...current.filter((entry) => entry.url !== snapshot.url),
      ].slice(0, 200));
    }
  }, []);

  useEffect(() => {
    if (!activeTab || omniboxFocused) return;
    setOmnibox(activeTab.url === 'about:home' ? '' : activeTab.url);
  }, [activeTab?.url, omniboxFocused]);

  useEffect(() => {
    const query = omnibox.trim();
    if (!omniboxFocused || query.length < 2 || query.includes('.') || /^https?:/i.test(query)) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void getNammuSDK().services
        .request<unknown>('browser.search', 'suggest', { query })
        .then((result) => {
          if (cancelled) return;
          const values = Array.isArray(result)
            ? result
            : result && typeof result === 'object' && Array.isArray((result as any).data)
              ? (result as any).data
              : [];
          setSuggestions(
            values
              .filter((item: unknown): item is string => typeof item === 'string')
              .slice(0, 6),
          );
        })
        .catch(() => !cancelled && setSuggestions([]));
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [omnibox, omniboxFocused]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('.browser-omnibox-input')?.focus();
      } else if (modifier && event.key.toLowerCase() === 't') {
        event.preventDefault();
        openTab();
      } else if (modifier && event.key.toLowerCase() === 'w' && activeTab) {
        event.preventDefault();
        closeTab(activeTab.id);
      } else if (modifier && event.shiftKey && event.key.toLowerCase() === 't') {
        event.preventDefault();
        const [last] = closedTabs;
        if (last) {
          const restored = { ...last, id: tabId(), isLoading: isRemoteUrl(last.url) };
          setClosedTabs((current) => current.slice(1));
          setTabs((current) => [...current, restored]);
          setActiveTabId(restored.id);
        }
      } else if (event.key === 'Escape') {
        setMenuOpen(false);
        setPanel(null);
        setTabMenu(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, closeTab, closedTabs, openTab]);

  const toggleBookmark = () => {
    if (!activeTab || !isRemoteUrl(activeTab.url)) return;
    const existing = bookmarks.find((bookmark) => bookmark.url === activeTab.url);
    if (existing) {
      setBookmarks((current) => current.filter((bookmark) => bookmark.id !== existing.id));
    } else {
      setBookmarks((current) => [...current, {
        id: crypto.randomUUID(),
        title: activeTab.title || hostLabel(activeTab.url),
        url: activeTab.url,
        favicon: activeTab.favicon,
      }]);
    }
  };

  const importBookmarks = async () => {
    try {
      const result = await getNammuSDK().files.pickBinary({
        filters: [{ name: 'Bookmarks', extensions: ['json'], mimeTypes: ['application/json'] }],
      });
      if (result.cancelled || !result.files[0]) return;
      const parsed = JSON.parse(new TextDecoder().decode(result.files[0].bytes));
      const imported = sanitizeBookmarks(Array.isArray(parsed) ? parsed : parsed.bookmarks);
      setBookmarks((current) => sanitizeBookmarks([...current, ...imported]));
    } catch (error) {
      setFailure(browserError(error));
    }
  };

  const exportBookmarks = async () => {
    try {
      await getNammuSDK().files.saveBinary(
        'nammu-browser-bookmarks.json',
        new TextEncoder().encode(JSON.stringify({ version: 1, bookmarks }, null, 2)),
        'application/json',
      );
    } catch (error) {
      setFailure(browserError(error));
    }
  };

  const goBack = () => void surfaceRefs.current.get(activeTab?.id ?? '')?.goBack();
  const goForward = () => void surfaceRefs.current.get(activeTab?.id ?? '')?.goForward();
  const reload = () => {
    const surface = surfaceRefs.current.get(activeTab?.id ?? '');
    if (surface) void (activeTab?.isLoading ? surface.stop() : surface.reload());
  };
  const setTabMuted = (id: string, muted: boolean) => {
    void surfaceRefs.current.get(id)?.setMuted(muted);
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, isMuted: muted } : tab));
  };
  const setZoomLevel = (next: number) => {
    const value = Math.min(200, Math.max(50, next));
    setZoom(value);
    setPreferences((current) => ({ ...current, defaultZoom: value }));
    void surfaceRefs.current.get(activeTab?.id ?? '')?.setZoom(value / 100);
  };

  const selectedBookmark = Boolean(activeTab && bookmarks.some((entry) => entry.url === activeTab.url));

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#07090d] text-white">
      <div className="browser-tab-strip flex shrink-0 items-stretch overflow-visible border-b border-white/[0.06] bg-black/35 pl-0">
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-visible">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                setTabMenu({ id: tab.id, x: event.clientX, y: event.clientY });
              }}
              className={`browser-tab group relative flex h-full shrink-0 items-center gap-1.5 border-r border-white/[0.06] px-2 text-[10px] transition ${
                tab.id === activeTab?.id ? 'bg-white/[0.09] text-white' : 'bg-white/[0.018] text-white/55 hover:bg-white/[0.06] hover:text-white/85'
              } ${tab.isPinned ? 'w-10 justify-center' : 'min-w-[116px] max-w-[190px] flex-1'}`}
              title={tab.title}
            >
              {tab.isPrivate ? <ShieldCheck size={11} className="shrink-0 text-violet-300" /> : tab.favicon && isRemoteUrl(tab.url) ? (
                <img src={tab.favicon} alt="" className="h-3 w-3 shrink-0" />
              ) : <Globe2 size={11} className="shrink-0 text-white/45" />}
              {!tab.isPinned && <span className="min-w-0 flex-1 truncate text-left">{tab.title}</span>}
              {!tab.isPinned && tab.isAudioPlaying && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => { event.stopPropagation(); setTabMuted(tab.id, !tab.isMuted); }}
                  className="grid h-4 w-4 place-items-center rounded-full hover:bg-white/10"
                >{tab.isMuted ? <VolumeX size={10} /> : <Volume2 size={10} />}</span>
              )}
              {!tab.isPinned && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }}
                  className="grid h-4 w-4 shrink-0 place-items-center rounded-full opacity-0 hover:bg-white/10 group-hover:opacity-100"
                ><X size={10} /></span>
              )}
              {tab.isLoading && <span className="absolute inset-x-0 bottom-0 h-px animate-pulse bg-[var(--hz-accent)]" />}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => openTab()} className="mx-1 grid h-6 w-6 shrink-0 place-items-center self-center rounded-full text-white/65 hover:bg-white/10 hover:text-white" aria-label="New tab"><Plus size={13} /></button>
      </div>

      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-white/[0.06] bg-black/25 px-2">
        <button type="button" onClick={goBack} disabled={!activeTab?.canGoBack} className="browser-control"><ArrowLeft size={14} /></button>
        <button type="button" onClick={goForward} disabled={!activeTab?.canGoForward} className="browser-control"><ArrowRight size={14} /></button>
        <button type="button" onClick={reload} className="browser-control"><RotateCw size={13} className={activeTab?.isLoading ? 'animate-spin' : ''} /></button>
        <button type="button" onClick={() => navigate('about:home')} className="browser-control"><Home size={13} /></button>

        <div
          className="browser-omnibox-shell relative flex h-7 min-w-0 flex-1 items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.055] px-3 shadow-inner focus-within:border-white/[0.2] focus-within:bg-white/[0.075]"
        >
          {activeTab && isRemoteUrl(activeTab.url) ? <Lock size={11} className="shrink-0 text-emerald-300/80" /> : <Search size={12} className="shrink-0 text-white/45" />}
          <input
            value={omnibox}
            onChange={(event) => setOmnibox(event.target.value)}
            onFocus={(event) => { setOmniboxFocused(true); event.currentTarget.select(); }}
            onBlur={() => window.setTimeout(() => setOmniboxFocused(false), 120)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                navigate(omnibox);
                setOmniboxFocused(false);
              }
            }}
            className="browser-omnibox-input min-w-0 flex-1 bg-transparent text-[11px] text-white outline-none placeholder:text-white/35"
            placeholder={`Search with ${preferences.searchEngine} or enter address`}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="button" onClick={toggleBookmark} disabled={!activeTab || !isRemoteUrl(activeTab.url)} className="text-white/45 hover:text-[var(--hz-accent)] disabled:opacity-20" aria-label="Bookmark page"><BookmarkIcon size={13} fill={selectedBookmark ? 'currentColor' : 'none'} /></button>
          {omniboxFocused && suggestions.length > 0 && (
            <div className="nammu-context-surface absolute left-0 right-0 top-[31px] z-[90] overflow-hidden rounded-xl p-1 shadow-2xl">
              {suggestions.map((suggestion) => (
                <button key={suggestion} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => navigate(suggestion)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] text-white/70 hover:bg-white/[0.08] hover:text-white"><Search size={11} />{suggestion}</button>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={() => setPanel(panel === 'bookmarks' ? null : 'bookmarks')} className="browser-control"><BookmarkIcon size={13} /></button>
        <button type="button" onClick={(event) => { event.stopPropagation(); setMenuOpen((open) => !open); }} className="browser-control"><Menu size={14} /></button>
      </div>

      {preferences.showBookmarksBar && (
        <div className="browser-bookmarks-bar flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/[0.055] bg-black/20 px-2">
          {bookmarks.slice(0, 24).map((bookmark) => (
            <button key={bookmark.id} type="button" onClick={() => navigate(bookmark.url)} className="flex h-5 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-[9px] text-white/58 hover:bg-white/[0.07] hover:text-white">
              {bookmark.favicon ? <img src={bookmark.favicon} alt="" className="h-3 w-3" /> : <Globe2 size={10} />}
              <span className="max-w-28 truncate">{bookmark.title}</span>
            </button>
          ))}
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {tabs.map((tab) => {
          if (!isRemoteUrl(tab.url)) return null;
          return (
            <div key={tab.id} className={tab.id === activeTab?.id ? 'absolute inset-0' : 'pointer-events-none absolute inset-0 opacity-0'} aria-hidden={tab.id !== activeTab?.id}>
              <NativeWebSurface
                ref={(handle) => { if (handle) surfaceRefs.current.set(tab.id, handle); else surfaceRefs.current.delete(tab.id); }}
                enabled
                active={tab.id === activeTab?.id}
                profileKey="browser-default"
                privateSession={tab.isPrivate === true}
                url={tab.url}
                zoom={zoom}
                muted={tab.isMuted === true}
                browserOverlayActive={browserOverlayActive && tab.id === activeTab?.id}
                surfaceLabel={tab.title}
                onState={(snapshot) => updateSurfaceState(tab.id, snapshot)}
                onReady={() => setSurfaceReady((current) => ({ ...current, [tab.id]: true }))}
                onFailure={(message) => setFailure(message)}
                onDiagnostic={() => {}}
                onOpenRequest={(url) => openTab(url, tab.isPrivate === true)}
              />
              {!surfaceReady[tab.id] && <div className="absolute inset-0 bg-[#07090d]" />}
            </div>
          );
        })}

        {activeTab?.url === 'about:home' && (
          <NammuNewTab
            bookmarks={bookmarks}
            history={history}
            quickDials={DEFAULT_QUICK_DIALS}
            searchEngine={preferences.searchEngine}
            onNavigate={(url) => navigate(url)}
            onOpenInNewTab={(url) => navigate(url, 'new')}
          />
        )}

        {activeTab && INTERNAL_URLS.has(activeTab.url) && activeTab.url !== 'about:home' && (
          <div className="grid h-full place-items-center bg-[#07090d] text-sm text-white/50">Open this section from the Browser toolbar.</div>
        )}

        {failure && (
          <div className="absolute inset-x-0 bottom-3 z-[70] mx-auto flex w-fit max-w-[80%] items-center gap-3 rounded-xl border border-red-300/15 bg-[#211318]/90 px-3 py-2 text-[11px] text-red-100 shadow-xl backdrop-blur-xl">
            <span>{failure}</span><button type="button" onClick={() => setFailure('')}><X size={12} /></button>
          </div>
        )}

        {panel && (
          <BrowserPanel
            panel={panel}
            bookmarks={bookmarks}
            history={history}
            preferences={preferences}
            onClose={() => setPanel(null)}
            onNavigate={(url) => { navigate(url); setPanel(null); }}
            onBookmarksChange={setBookmarks}
            onHistoryChange={setHistory}
            onPreferencesChange={setPreferences}
            onImportBookmarks={importBookmarks}
            onExportBookmarks={exportBookmarks}
          />
        )}
        {proxyOpen && activeTab && (
          <ProxyManagerPanel
            activeTabUrl={activeTab.url}
            engineReady={surfaceReady[activeTab.id] === true}
            browserConnection={browserProxy}
            tabConnection={tabProxies[activeTab.id] ?? null}
            onClose={() => setProxyOpen(false)}
            onConnect={async (scope, primary, failovers) => {
              const surface = surfaceRefs.current.get(activeTab.id);
              if (!surface) throw new Error('Open a website before connecting a proxy.');
              const endpoints = [primary, ...failovers].map(({ protocol, host, port }) => ({
                protocol,
                host,
                port,
              }));
              await surface.setProxyRoute(scope === 'browser' ? 'profile' : 'surface', endpoints);
              const connection: PublicProxyConnection = {
                scope,
                ...(scope === 'tab' ? { tabId: activeTab.id } : {}),
                primary,
                failovers,
                connectedAt: new Date().toISOString(),
              };
              if (scope === 'browser') setBrowserProxy(connection);
              else setTabProxies((current) => ({ ...current, [activeTab.id]: connection }));
              await surface.reload();
            }}
            onDisconnect={async (scope) => {
              const surface = surfaceRefs.current.get(activeTab.id);
              if (!surface) return;
              await surface.setProxyRoute(scope === 'browser' ? 'profile' : 'surface', []);
              if (scope === 'browser') setBrowserProxy(null);
              else setTabProxies((current) => {
                const next = { ...current };
                delete next[activeTab.id];
                return next;
              });
              await surface.reload();
            }}
            onDisconnectAll={async () => {
              const surface = surfaceRefs.current.get(activeTab.id);
              if (!surface) return;
              await surface.setProxyRoute('profile', []);
              for (const tab of tabsRef.current) {
                await surfaceRefs.current.get(tab.id)?.setProxyRoute('surface', []);
              }
              setBrowserProxy(null);
              setTabProxies({});
              await surface.reload();
            }}
          />
        )}
      </div>

      {menuOpen && (
        <div onPointerDown={(event) => event.stopPropagation()}>
          <BrowserMenu
            zoomLevel={zoom}
            canReopenClosedTab={closedTabs.length > 0}
            onClose={() => setMenuOpen(false)}
            onNewTab={() => openTab()}
            onNewPrivateTab={() => openTab('about:home', true)}
            onReopenClosedTab={() => {
              const [last] = closedTabs;
              if (!last) return;
              const restored = { ...last, id: tabId(), isLoading: isRemoteUrl(last.url) };
              setClosedTabs((current) => current.slice(1));
              setTabs((current) => [...current, restored]);
              setActiveTabId(restored.id);
            }}
            onShowBookmarks={() => setPanel('bookmarks')}
            onShowHistory={() => setPanel('history')}
            onShowDownloads={() => setPanel('downloads')}
            onShowSettings={() => setPanel('settings')}
            onShowProxyManager={() => setProxyOpen(true)}
            onZoomOut={() => setZoomLevel(zoom - 10)}
            onResetZoom={() => setZoomLevel(100)}
            onZoomIn={() => setZoomLevel(zoom + 10)}
          />
        </div>
      )}

      {tabMenu && (
        <div
          className="nammu-context-surface fixed z-[100] w-40 rounded-xl p-1.5 shadow-2xl"
          style={{ left: Math.min(tabMenu.x, window.innerWidth - 170), top: Math.min(tabMenu.y, window.innerHeight - 150) }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" className="browser-menu-item" onClick={() => {
            setTabs((current) => current.map((tab) => tab.id === tabMenu.id ? { ...tab, isPinned: !tab.isPinned } : tab));
            setTabMenu(null);
          }}><Pin size={12} />{tabs.find((tab) => tab.id === tabMenu.id)?.isPinned ? 'Unpin Tab' : 'Pin Tab'}</button>
          <button type="button" className="browser-menu-item" onClick={() => {
            const tab = tabs.find((item) => item.id === tabMenu.id);
            if (tab) setTabMuted(tab.id, !tab.isMuted);
            setTabMenu(null);
          }}>{tabs.find((tab) => tab.id === tabMenu.id)?.isMuted ? <Volume2 size={12} /> : <VolumeX size={12} />}Toggle Mute</button>
          <button type="button" className="browser-menu-item text-red-200" onClick={() => { closeTab(tabMenu.id); setTabMenu(null); }}><X size={12} />Close Tab</button>
        </div>
      )}
    </div>
  );
}

function BrowserPanel({
  panel,
  bookmarks,
  history,
  preferences,
  onClose,
  onNavigate,
  onBookmarksChange,
  onHistoryChange,
  onPreferencesChange,
  onImportBookmarks,
  onExportBookmarks,
}: {
  panel: Exclude<Panel, null>;
  bookmarks: Bookmark[];
  history: HistoryEntry[];
  preferences: BrowserPreferences;
  onClose(): void;
  onNavigate(url: string): void;
  onBookmarksChange(bookmarks: Bookmark[]): void;
  onHistoryChange(history: HistoryEntry[]): void;
  onPreferencesChange(preferences: BrowserPreferences): void;
  onImportBookmarks(): void;
  onExportBookmarks(): void;
}) {
  const [query, setQuery] = useState('');
  const bookmarkResults = bookmarks.filter((item) => `${item.title} ${item.url}`.toLowerCase().includes(query.toLowerCase()));
  const historyResults = history.filter((item) => `${item.title} ${item.url}`.toLowerCase().includes(query.toLowerCase()));
  const title = panel === 'bookmarks' ? 'Bookmarks' : panel === 'history' ? 'History' : panel === 'downloads' ? 'Downloads' : 'Browser Settings';

  return (
    <aside className="nammu-context-surface absolute bottom-3 right-3 top-3 z-[65] flex w-[min(360px,calc(100%-24px))] flex-col overflow-hidden rounded-2xl shadow-2xl">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-white/[0.08] px-3">
        <button type="button" onClick={onClose} className="browser-control"><ChevronLeft size={14} /></button>
        <h2 className="flex-1 text-sm font-semibold tracking-tight">{title}</h2>
        <button type="button" onClick={onClose} className="browser-control"><X size={13} /></button>
      </header>

      {(panel === 'bookmarks' || panel === 'history') && (
        <div className="border-b border-white/[0.07] p-2.5">
          <label className="flex h-8 items-center gap-2 rounded-xl border border-white/[0.09] bg-black/20 px-3"><Search size={12} className="text-white/40" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="browser-panel-search-input min-w-0 flex-1 bg-transparent text-[11px] outline-none" placeholder={`Search ${title.toLowerCase()}`} /></label>
          <div className="mt-2 flex gap-1.5">
            {panel === 'bookmarks' && <><button type="button" onClick={onImportBookmarks} className="panel-action"><Upload size={11} />Import</button><button type="button" onClick={onExportBookmarks} className="panel-action"><Download size={11} />Export</button></>}
            <button type="button" onClick={() => panel === 'bookmarks' ? onBookmarksChange([]) : onHistoryChange([])} className="panel-action ml-auto text-red-200"><Trash2 size={11} />Clear</button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {panel === 'bookmarks' && bookmarkResults.map((bookmark) => (
          <div key={bookmark.id} className="group mb-1 flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-white/[0.06]">
            {bookmark.favicon ? <img src={bookmark.favicon} alt="" className="h-4 w-4" /> : <Globe2 size={14} />}
            <button type="button" onClick={() => onNavigate(bookmark.url)} className="min-w-0 flex-1 text-left"><span className="block truncate text-[11px] text-white/85">{bookmark.title}</span><span className="block truncate text-[9px] text-white/35">{bookmark.url}</span></button>
            <button type="button" onClick={() => {
              const title = window.prompt('Bookmark name', bookmark.title)?.trim();
              if (title) onBookmarksChange(bookmarks.map((item) => item.id === bookmark.id ? { ...item, title } : item));
            }} className="browser-control opacity-0 group-hover:opacity-100"><Pencil size={11} /></button>
            <button type="button" onClick={() => onBookmarksChange(bookmarks.filter((item) => item.id !== bookmark.id))} className="browser-control opacity-0 group-hover:opacity-100"><Trash2 size={11} /></button>
          </div>
        ))}
        {panel === 'history' && historyResults.map((entry) => (
          <div key={entry.id} className="group mb-1 flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-white/[0.06]">
            {entry.favicon ? <img src={entry.favicon} alt="" className="h-4 w-4" /> : <Globe2 size={14} />}
            <button type="button" onClick={() => onNavigate(entry.url)} className="min-w-0 flex-1 text-left"><span className="block truncate text-[11px] text-white/85">{entry.title}</span><span className="block truncate text-[9px] text-white/35">{new Date(entry.timestamp).toLocaleString()}</span></button>
            <button type="button" onClick={() => onHistoryChange(history.filter((item) => item.id !== entry.id))} className="browser-control opacity-0 group-hover:opacity-100"><X size={11} /></button>
          </div>
        ))}
        {panel === 'downloads' && (
          <div className="grid h-full place-items-center px-8 text-center"><div><Download size={28} className="mx-auto mb-3 text-white/28" /><h3 className="text-sm font-medium">Downloads are host-managed</h3><p className="mt-1 text-[10px] leading-relaxed text-white/40">Website downloads stay isolated in the Core browser surface. File exports use Nammu's approved save dialog.</p></div></div>
        )}
        {panel === 'settings' && (
          <div className="space-y-3">
            <SettingRow icon={<Search size={13} />} title="Search engine" detail="Used for address-bar searches">
              <select value={preferences.searchEngine} onChange={(event) => onPreferencesChange({ ...preferences, searchEngine: event.target.value as BrowserPreferences['searchEngine'] })} className="rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-[10px] outline-none"><option value="google">Google</option><option value="duckduckgo">DuckDuckGo</option><option value="bing">Bing</option><option value="ecosia">Ecosia</option></select>
            </SettingRow>
            <SettingRow icon={<BookmarkIcon size={13} />} title="Bookmarks bar" detail="Show saved sites below the address bar"><input type="checkbox" checked={preferences.showBookmarksBar} onChange={(event) => onPreferencesChange({ ...preferences, showBookmarksBar: event.target.checked })} /></SettingRow>
            <SettingRow icon={<ShieldCheck size={13} />} title="Tracking protection" detail="Ask the host runtime to use its protected profile"><input type="checkbox" checked={preferences.trackingProtection} onChange={(event) => onPreferencesChange({ ...preferences, trackingProtection: event.target.checked })} /></SettingRow>
            <SettingRow icon={<VolumeX size={13} />} title="Block autoplay" detail="Preference retained for compatible host surfaces"><input type="checkbox" checked={preferences.blockAutoplay} onChange={(event) => onPreferencesChange({ ...preferences, blockAutoplay: event.target.checked })} /></SettingRow>
            <SettingRow icon={<Settings2 size={13} />} title="Default zoom" detail={`${preferences.defaultZoom}%`}><input type="range" min="50" max="200" step="10" value={preferences.defaultZoom} onChange={(event) => onPreferencesChange({ ...preferences, defaultZoom: Number(event.target.value) })} /></SettingRow>
          </div>
        )}
      </div>
    </aside>
  );
}

function SettingRow({ icon, title, detail, children }: { icon: ReactNode; title: string; detail: string; children: ReactNode }) {
  return <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><span className="text-white/45">{icon}</span><div className="min-w-0 flex-1"><div className="text-[11px] text-white/85">{title}</div><div className="text-[9px] text-white/35">{detail}</div></div>{children}</div>;
}
