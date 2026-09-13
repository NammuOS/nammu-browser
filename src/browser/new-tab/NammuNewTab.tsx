import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bookmark as BookmarkIcon,
  Check,
  ChevronDown,
  Clock3,
  Download,
  ExternalLink,
  FileUp,
  Globe2,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import type { Bookmark, HistoryEntry, QuickDial, SearchEngine } from '../services/browserEngine';
import { getDomainFavicon, normalizeBrowserUrl } from '../services/browserEngine';
import {
  NEW_TAB_MAX_BOARDS,
  NEW_TAB_MAX_LINKS,
  NEW_TAB_MAX_WORKSPACES,
  createDefaultNewTabState,
  createNewTabBoard,
  createNewTabLink,
  createNewTabWorkspace,
  moveItem,
  readNewTabState,
  searchNewTabContent,
  writeNewTabState,
  sanitizeNewTabState,
  type NewTabBoard,
  type NewTabLink,
  type NewTabState,
  type NewTabWorkspace,
} from './newTabModel';
import styles from './NammuNewTab.module.css';

interface NammuNewTabProps {
  bookmarks: Bookmark[];
  history: HistoryEntry[];
  quickDials: QuickDial[];
  searchEngine: SearchEngine;
  onNavigate: (url: string) => void;
  onOpenInNewTab: (url: string) => void;
}

type EditorState =
  | { kind: 'workspace'; mode: 'add' | 'edit'; id?: string; name: string }
  | { kind: 'board'; mode: 'add' | 'edit'; id?: string; name: string }
  | {
      kind: 'link';
      mode: 'add' | 'edit';
      boardId: string;
      id?: string;
      title: string;
      url: string;
      note: string;
    };

type DragPayload =
  | { kind: 'workspace'; id: string }
  | { kind: 'board'; id: string }
  | { kind: 'link'; boardId: string; id: string };

const dragMime = 'application/x-nammu-new-tab';
type NewTabView = 'workspace' | 'bookmarks' | 'recent' | 'settings';

function bookmarkGroup(bookmark: Bookmark): string {
  if (bookmark.group?.trim()) return bookmark.group.trim().slice(0, 40);
  const host = hostname(bookmark.url);
  if (/github|gitlab|developer|vercel|stack|npmjs|codepen/.test(host)) return 'Development';
  if (/youtube|spotify|soundcloud|netflix|twitch|reddit/.test(host)) return 'Media';
  if (/docs|wikipedia|medium|substack|notion/.test(host)) return 'Reading & research';
  if (/mail|calendar|slack|discord|whatsapp|telegram/.test(host)) return 'Communication';
  return 'Saved sites';
}

function writeDragPayload(event: React.DragEvent, payload: DragPayload) {
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData(dragMime, JSON.stringify(payload));
  event.dataTransfer.setData('text/plain', payload.id);
}

function readDragPayload(event: React.DragEvent): DragPayload | null {
  try {
    const value = JSON.parse(event.dataTransfer.getData(dragMime)) as DragPayload;
    return value && ['workspace', 'board', 'link'].includes(value.kind) ? value : null;
  } catch {
    return null;
  }
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function SiteFavicon({ url, explicit }: { url: string; explicit?: string }) {
  const sources = useMemo(
    () =>
      [explicit, getDomainFavicon(url)].filter(
        (source, index, values): source is string =>
          Boolean(source) && values.indexOf(source) === index,
      ),
    [explicit, url],
  );
  const [sourceIndex, setSourceIndex] = useState(0);
  useEffect(() => setSourceIndex(0), [sources]);
  const source = sources[sourceIndex];

  return (
    <span className={styles.favicon} aria-hidden="true">
      {source ? (
        <img src={source} alt="" onError={() => setSourceIndex((index) => index + 1)} />
      ) : (
        <Globe2 size={16} />
      )}
    </span>
  );
}

export default function NammuNewTab({
  bookmarks,
  history,
  quickDials,
  searchEngine,
  onNavigate,
  onOpenInNewTab,
}: NammuNewTabProps) {
  const [state, setState] = useState<NewTabState>(() => createDefaultNewTabState(quickDials));
  const [storageReady, setStorageReady] = useState(false);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<NewTabView>('workspace');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [now, setNow] = useState<Date | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [boardMenuId, setBoardMenuId] = useState<string | null>(null);
  const [linkMenuId, setLinkMenuId] = useState<string | null>(null);
  const [lastDeletedState, setLastDeletedState] = useState<NewTabState | null>(null);
  const [validationError, setValidationError] = useState('');
  const [settingsNotice, setSettingsNotice] = useState('');
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const activeWorkspace =
    state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ??
    state.workspaces[0];
  const searchResults = useMemo(
    () => searchNewTabContent(state, bookmarks, history, query),
    [bookmarks, history, query, state],
  );
  const recent = useMemo(() => {
    const seen = new Set<string>();
    return history
      .filter((entry) => {
        if (!/^https?:\/\//i.test(entry.url) || seen.has(entry.url)) return false;
        seen.add(entry.url);
        return true;
      })
      .slice(0, 30);
  }, [history]);
  const bookmarkGroups = useMemo(() => {
    const groups = new Map<string, Bookmark[]>();
    bookmarks.forEach((bookmark) => {
      const group = bookmarkGroup(bookmark);
      groups.set(group, [...(groups.get(group) ?? []), bookmark]);
    });
    return [...groups.entries()];
  }, [bookmarks]);

  useEffect(() => {
    setState(readNewTabState(quickDials));
    setStorageReady(true);
  }, [quickDials]);
  useEffect(() => {
    if (storageReady) writeNewTabState(state);
  }, [state, storageReady]);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditor(null);
        setBoardMenuId(null);
        setLinkMenuId(null);
        if (query) setQuery('');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [query]);
  useEffect(() => {
    const closeMenus = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest(`.${styles.menuRoot}`)) return;
      setBoardMenuId(null);
      setLinkMenuId(null);
    };
    window.addEventListener('pointerdown', closeMenus);
    return () => window.removeEventListener('pointerdown', closeMenus);
  }, []);

  const updateActiveWorkspace = (update: (workspace: NewTabWorkspace) => NewTabWorkspace) => {
    setState((current) => ({
      ...current,
      workspaces: current.workspaces.map((workspace) =>
        workspace.id === current.activeWorkspaceId ? update(workspace) : workspace,
      ),
    }));
  };

  const rememberBeforeDelete = () => setLastDeletedState(state);

  const addWorkspace = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newWorkspaceName.trim();
    if (!name || state.workspaces.length >= NEW_TAB_MAX_WORKSPACES) return;
    const workspace = createNewTabWorkspace(name);
    setState((current) => ({
      ...current,
      activeWorkspaceId: workspace.id,
      workspaces: [...current.workspaces, workspace],
    }));
    setNewWorkspaceName('');
  };

  const exportNewTab = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `nammu-new-tab-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setSettingsNotice('New-tab configuration exported.');
  };

  const importNewTab = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Backup is too large');
      const parsed = JSON.parse(await file.text()) as unknown;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !Array.isArray((parsed as NewTabState).workspaces)
      ) {
        throw new Error('Invalid new-tab backup');
      }
      setState(sanitizeNewTabState(parsed, createDefaultNewTabState(quickDials)));
      setConfirmDeleteAll(false);
      setSettingsNotice('New-tab configuration imported.');
    } catch {
      setSettingsNotice('That file is not a valid Nammu new-tab backup.');
    }
  };

  const deleteAllNewTabData = () => {
    const workspace = createNewTabWorkspace('Workspace');
    setState((current) => ({
      ...current,
      activeWorkspaceId: workspace.id,
      workspaces: [workspace],
    }));
    setConfirmDeleteAll(false);
    setSettingsNotice('All workspace boards and links were removed.');
  };

  const deleteBoard = (boardId: string) => {
    rememberBeforeDelete();
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      boards: workspace.boards.filter((board) => board.id !== boardId),
    }));
    setBoardMenuId(null);
  };

  const deleteLink = (boardId: string, linkId: string) => {
    rememberBeforeDelete();
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      boards: workspace.boards.map((board) =>
        board.id === boardId
          ? { ...board, links: board.links.filter((link) => link.id !== linkId) }
          : board,
      ),
    }));
    setLinkMenuId(null);
  };

  const deleteWorkspace = (workspaceId: string) => {
    if (state.workspaces.length === 1) return;
    rememberBeforeDelete();
    setState((current) => {
      const workspaces = current.workspaces.filter((workspace) => workspace.id !== workspaceId);
      return {
        ...current,
        workspaces,
        activeWorkspaceId:
          current.activeWorkspaceId === workspaceId ? workspaces[0].id : current.activeWorkspaceId,
      };
    });
  };

  const submitEditor = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editor) return;
    setValidationError('');
    if (editor.kind === 'workspace') {
      if (!editor.name.trim()) return setValidationError('Enter a workspace name.');
      if (editor.mode === 'add') {
        if (state.workspaces.length >= NEW_TAB_MAX_WORKSPACES) {
          return setValidationError(`You can create up to ${NEW_TAB_MAX_WORKSPACES} workspaces.`);
        }
        const workspace = createNewTabWorkspace(editor.name);
        setState((current) => ({
          ...current,
          activeWorkspaceId: workspace.id,
          workspaces: [...current.workspaces, workspace],
        }));
      } else {
        setState((current) => ({
          ...current,
          workspaces: current.workspaces.map((workspace) =>
            workspace.id === editor.id
              ? { ...workspace, name: editor.name.trim().slice(0, 60) }
              : workspace,
          ),
        }));
      }
    } else if (editor.kind === 'board') {
      if (!editor.name.trim()) return setValidationError('Enter a board name.');
      if (editor.mode === 'add') {
        const boardCount = state.workspaces.reduce(
          (total, workspace) => total + workspace.boards.length,
          0,
        );
        if (boardCount >= NEW_TAB_MAX_BOARDS)
          return setValidationError(`You can create up to ${NEW_TAB_MAX_BOARDS} boards.`);
        updateActiveWorkspace((workspace) => ({
          ...workspace,
          boards: [...workspace.boards, createNewTabBoard(editor.name)],
        }));
      } else {
        updateActiveWorkspace((workspace) => ({
          ...workspace,
          boards: workspace.boards.map((board) =>
            board.id === editor.id ? { ...board, title: editor.name.trim().slice(0, 120) } : board,
          ),
        }));
      }
    } else {
      const link = createNewTabLink(editor.title, editor.url, editor.note);
      if (!link) return setValidationError('Enter a valid public HTTP or HTTPS address.');
      const linkCount = state.workspaces.reduce(
        (total, workspace) =>
          total + workspace.boards.reduce((sum, board) => sum + board.links.length, 0),
        0,
      );
      if (editor.mode === 'add' && linkCount >= NEW_TAB_MAX_LINKS) {
        return setValidationError(`You can save up to ${NEW_TAB_MAX_LINKS} workspace links.`);
      }
      updateActiveWorkspace((workspace) => ({
        ...workspace,
        boards: workspace.boards.map((board) => {
          if (board.id !== editor.boardId) return board;
          return {
            ...board,
            links:
              editor.mode === 'add'
                ? [...board.links, link]
                : board.links.map((existing) =>
                    existing.id === editor.id
                      ? { ...link, id: existing.id, createdAt: existing.createdAt }
                      : existing,
                  ),
          };
        }),
      }));
    }
    setEditor(null);
  };

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    const first = searchResults[0];
    onNavigate(first?.url ?? normalizeBrowserUrl(query, searchEngine));
  };

  const moveBoard = (sourceId: string, targetId: string) => {
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      boards: moveItem(
        workspace.boards,
        workspace.boards.findIndex((board) => board.id === sourceId),
        workspace.boards.findIndex((board) => board.id === targetId),
      ),
    }));
  };

  const toggleBoard = (boardId: string) => {
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      boards: workspace.boards.map((board) =>
        board.id === boardId ? { ...board, collapsed: !board.collapsed } : board,
      ),
    }));
  };

  const moveLink = (
    payload: Extract<DragPayload, { kind: 'link' }>,
    targetBoardId: string,
    targetLinkId?: string,
  ) => {
    updateActiveWorkspace((workspace) => {
      const sourceBoard = workspace.boards.find((board) => board.id === payload.boardId);
      const moving = sourceBoard?.links.find((link) => link.id === payload.id);
      if (!moving) return workspace;
      const boards = workspace.boards.map((board) => ({
        ...board,
        links: board.links.filter((link) => link.id !== payload.id),
      }));
      return {
        ...workspace,
        boards: boards.map((board) => {
          if (board.id !== targetBoardId) return board;
          const index = targetLinkId
            ? board.links.findIndex((link) => link.id === targetLinkId)
            : board.links.length;
          const links = [...board.links];
          links.splice(index < 0 ? links.length : index, 0, moving);
          return { ...board, links };
        }),
      };
    });
  };

  const renderLink = (link: NewTabLink, board: NewTabBoard) => (
    <div
      key={link.id}
      className={styles.linkRow}
      draggable
      onDragStart={(event) => {
        event.stopPropagation();
        writeDragPayload(event, { kind: 'link', boardId: board.id, id: link.id });
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const payload = readDragPayload(event);
        if (payload?.kind === 'link') moveLink(payload, board.id, link.id);
      }}
    >
      <button
        type="button"
        className={styles.linkMain}
        onClick={() => onNavigate(link.url)}
        title={link.url}
      >
        <SiteFavicon url={link.url} />
        <span className={styles.linkCopy}>
          <strong>{link.title}</strong>
          {state.showLinkDetails && <small>{link.note || hostname(link.url)}</small>}
        </span>
      </button>
      <button
        type="button"
        className={styles.iconButton}
        onClick={() => onOpenInNewTab(link.url)}
        title="Open in new tab"
      >
        <ExternalLink size={13} />
      </button>
      <div className={styles.menuRoot}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => setLinkMenuId(linkMenuId === link.id ? null : link.id)}
          aria-label={`Actions for ${link.title}`}
        >
          <MoreHorizontal size={14} />
        </button>
        {linkMenuId === link.id && (
          <div className={`${styles.actionMenu} nammu-new-tab-menu`}>
            <button
              type="button"
              onClick={() => {
                setEditor({
                  kind: 'link',
                  mode: 'edit',
                  boardId: board.id,
                  id: link.id,
                  title: link.title,
                  url: link.url,
                  note: link.note,
                });
                setLinkMenuId(null);
              }}
            >
              <Pencil size={12} /> Edit
            </button>
            <button
              type="button"
              className={styles.danger}
              onClick={() => deleteLink(board.id, link.id)}
            >
              <Trash2 size={12} /> Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <section
      className={`${styles.root} ${styles[`wallpaper${state.wallpaper[0].toUpperCase()}${state.wallpaper.slice(1)}`]}`}
    >
      <div className={styles.ambient} aria-hidden="true" />
      <header className={styles.hero}>
        {(state.showClock || state.showDate) && (
          <div className={styles.timeBlock}>
            {state.showClock && (
              <time>
                {now ? now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
              </time>
            )}
            <span>
              {now
                ? now.toLocaleDateString([], {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'Your new tab'}
            </span>
          </div>
        )}
        <form className={styles.search} onSubmit={handleSearchSubmit}>
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the web, bookmarks, history, or your workspace"
            aria-label="Search the web and new tab workspace"
          />
        </form>
        {query && (
          <div className={styles.searchResults}>
            {searchResults.map((result) => (
              <button
                type="button"
                key={`${result.source}:${result.id}`}
                onClick={() => onNavigate(result.url)}
              >
                <SiteFavicon url={result.url} explicit={result.favicon} />
                <span>
                  <strong>{result.title}</strong>
                  <small>{result.note || hostname(result.url)}</small>
                </span>
                <em>{result.source}</em>
              </button>
            ))}
            {!searchResults.length && (
              <button
                type="submit"
                onClick={() => onNavigate(normalizeBrowserUrl(query, searchEngine))}
              >
                <Search size={15} />
                <span>
                  <strong>Search the web</strong>
                  <small>{query}</small>
                </span>
              </button>
            )}
          </div>
        )}
      </header>

      <div className={styles.workspaceShell}>
        <aside className={styles.workspaceSidebar}>
          <form className={styles.workspaceCreate} onSubmit={addWorkspace}>
            <input
              className="new-tab-workspace-input"
              value={newWorkspaceName}
              onChange={(event) => setNewWorkspaceName(event.target.value)}
              maxLength={60}
              placeholder="New workspace"
              aria-label="New workspace name"
            />
            <button
              type="submit"
              disabled={
                !newWorkspaceName.trim() || state.workspaces.length >= NEW_TAB_MAX_WORKSPACES
              }
              title="Add workspace"
              aria-label="Add workspace"
            >
              <Plus size={14} />
            </button>
          </form>
          <div className={styles.workspaceList} aria-label="Workspaces">
            {state.workspaces.map((workspace) => (
              <div
                key={workspace.id}
                draggable
                onDragStart={(event) =>
                  writeDragPayload(event, { kind: 'workspace', id: workspace.id })
                }
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const payload = readDragPayload(event);
                  if (payload?.kind !== 'workspace') return;
                  setState((current) => ({
                    ...current,
                    workspaces: moveItem(
                      current.workspaces,
                      current.workspaces.findIndex((item) => item.id === payload.id),
                      current.workspaces.findIndex((item) => item.id === workspace.id),
                    ),
                  }));
                }}
                className={
                  view === 'workspace' && workspace.id === state.activeWorkspaceId
                    ? styles.activeWorkspace
                    : ''
                }
              >
                <button
                  type="button"
                  className={styles.workspaceSelect}
                  onClick={() => {
                    setView('workspace');
                    setState((current) => ({ ...current, activeWorkspaceId: workspace.id }));
                  }}
                >
                  <span>{workspace.name}</span>
                  <small>{workspace.boards.length}</small>
                </button>
                <button
                  type="button"
                  className={styles.workspaceRename}
                  onClick={() =>
                    setEditor({
                      kind: 'workspace',
                      mode: 'edit',
                      id: workspace.id,
                      name: workspace.name,
                    })
                  }
                  aria-label={`Rename ${workspace.name}`}
                  title="Rename workspace"
                >
                  <Pencil size={11} />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <section className={styles.workspaceContent}>
          <div className={styles.workspaceBar}>
            <div className={styles.workspaceOverview}>
              <div>
                {view !== 'workspace' && (
                  <button
                    type="button"
                    className={styles.backButton}
                    onClick={() => setView('workspace')}
                    title="Back to workspace"
                    aria-label="Back to workspace"
                  >
                    <ArrowLeft size={12} />
                  </button>
                )}
                <strong>
                  {view === 'workspace'
                    ? activeWorkspace?.name
                    : view === 'bookmarks'
                      ? 'Bookmarks'
                      : view === 'recent'
                        ? 'Recently visited'
                        : 'New tab settings'}
                </strong>
                {view === 'workspace' && activeWorkspace && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setEditor({
                          kind: 'workspace',
                          mode: 'edit',
                          id: activeWorkspace.id,
                          name: activeWorkspace.name,
                        })
                      }
                      title="Rename workspace"
                      aria-label="Rename active workspace"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      type="button"
                      className={styles.titleAddBoard}
                      onClick={() => setEditor({ kind: 'board', mode: 'add', name: '' })}
                      title="Add board"
                      aria-label="Add board"
                    >
                      <Plus size={11} />
                    </button>
                  </>
                )}
              </div>
              <span>
                {view === 'workspace'
                  ? `${activeWorkspace?.boards.length ?? 0} boards / ${activeWorkspace?.boards.reduce((total, board) => total + board.links.length, 0) ?? 0} links`
                  : view === 'bookmarks'
                    ? `${bookmarks.length} saved across ${bookmarkGroups.length} groups`
                    : view === 'recent'
                      ? `${recent.length} recent pages`
                      : 'Appearance, layout and backup'}
              </span>
            </div>
            <nav className={styles.utilityNav} aria-label="New tab shortcuts">
              <button
                type="button"
                className={view === 'bookmarks' ? styles.activeUtility : ''}
                onClick={() => setView(view === 'bookmarks' ? 'workspace' : 'bookmarks')}
              >
                <BookmarkIcon size={13} /> <span>Bookmarks</span>
              </button>
              <button
                type="button"
                className={view === 'recent' ? styles.activeUtility : ''}
                onClick={() => setView(view === 'recent' ? 'workspace' : 'recent')}
              >
                <Clock3 size={13} /> <span>Recent</span>
              </button>
              <button
                type="button"
                className={view === 'settings' ? styles.activeUtility : ''}
                onClick={() => setView(view === 'settings' ? 'workspace' : 'settings')}
              >
                <Settings2 size={13} /> <span>Settings</span>
              </button>
            </nav>
          </div>

          {view === 'workspace' && (
            <main className={styles.boardGrid}>
              {activeWorkspace?.boards.map((board) => (
                <article
                  key={board.id}
                  className={`${styles.board} ${board.collapsed ? styles.collapsedBoard : ''}`}
                  draggable
                  onDragStart={(event) => writeDragPayload(event, { kind: 'board', id: board.id })}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const payload = readDragPayload(event);
                    if (payload?.kind === 'board') moveBoard(payload.id, board.id);
                    if (payload?.kind === 'link') moveLink(payload, board.id);
                  }}
                >
                  <div className={styles.boardHeader}>
                    <div>
                      <strong>{board.title}</strong>
                      <span>
                        {board.links.length} {board.links.length === 1 ? 'link' : 'links'}
                      </span>
                    </div>
                    <div className={styles.boardActions}>
                      <button
                        type="button"
                        className={`${styles.collapseButton} ${board.collapsed ? styles.isCollapsed : ''}`}
                        onClick={() => toggleBoard(board.id)}
                        title={board.collapsed ? 'Expand board' : 'Collapse board'}
                        aria-expanded={!board.collapsed}
                      >
                        <ChevronDown size={13} />
                      </button>
                      {board.links.length > 0 && (
                        <button
                          type="button"
                          onClick={() => board.links.forEach((link) => onOpenInNewTab(link.url))}
                          title="Open all links"
                        >
                          <ExternalLink size={13} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setEditor({
                            kind: 'link',
                            mode: 'add',
                            boardId: board.id,
                            title: '',
                            url: '',
                            note: '',
                          })
                        }
                        title="Add link"
                      >
                        <Plus size={14} />
                      </button>
                      <div className={styles.menuRoot}>
                        <button
                          type="button"
                          onClick={() => setBoardMenuId(boardMenuId === board.id ? null : board.id)}
                          aria-label={`Actions for ${board.title}`}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                        {boardMenuId === board.id && (
                          <div className={`${styles.actionMenu} nammu-new-tab-menu`}>
                            <button
                              type="button"
                              onClick={() => {
                                setEditor({
                                  kind: 'board',
                                  mode: 'edit',
                                  id: board.id,
                                  name: board.title,
                                });
                                setBoardMenuId(null);
                              }}
                            >
                              <Pencil size={12} /> Rename
                            </button>
                            <button
                              type="button"
                              className={styles.danger}
                              onClick={() => deleteBoard(board.id)}
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {!board.collapsed && (
                    <div className={styles.linkList}>
                      {board.links.map((link) => renderLink(link, board))}
                      {!board.links.length && (
                        <button
                          type="button"
                          className={styles.emptyBoard}
                          onClick={() =>
                            setEditor({
                              kind: 'link',
                              mode: 'add',
                              boardId: board.id,
                              title: '',
                              url: '',
                              note: '',
                            })
                          }
                        >
                          <Plus size={15} /> Add the first link
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}

              {!activeWorkspace?.boards.length && (
                <button
                  type="button"
                  className={styles.addBoardCard}
                  onClick={() => setEditor({ kind: 'board', mode: 'add', name: '' })}
                >
                  <LayoutGrid size={20} />
                  <strong>Build your workspace</strong>
                  <span>Add boards to organize links by project or purpose.</span>
                </button>
              )}
            </main>
          )}

          {view === 'bookmarks' && (
            <main className={styles.boardGrid}>
              {bookmarkGroups.map(([group, groupBookmarks]) => (
                <article key={group} className={`${styles.board} ${styles.systemBoard}`}>
                  <div className={styles.boardHeader}>
                    <div>
                      <strong>{group}</strong>
                      <span>{groupBookmarks.length} saved</span>
                    </div>
                    <BookmarkIcon size={15} />
                  </div>
                  <div className={styles.linkList}>
                    {groupBookmarks.map((bookmark) => (
                      <div className={styles.linkRow} key={bookmark.id}>
                        <button
                          type="button"
                          className={styles.linkMain}
                          onClick={() => onNavigate(bookmark.url)}
                        >
                          <SiteFavicon url={bookmark.url} explicit={bookmark.favicon} />
                          <span className={styles.linkCopy}>
                            <strong>{bookmark.title}</strong>
                            {state.showLinkDetails && <small>{hostname(bookmark.url)}</small>}
                          </span>
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={() => onOpenInNewTab(bookmark.url)}
                          title="Open in new tab"
                        >
                          <ExternalLink size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
              {!bookmarks.length && (
                <div className={styles.sectionEmpty}>
                  <BookmarkIcon size={21} />
                  <strong>No bookmarks yet</strong>
                  <span>Star a page and it will appear here.</span>
                </div>
              )}
            </main>
          )}

          {view === 'recent' && (
            <main className={styles.boardGrid}>
              <article className={`${styles.board} ${styles.systemBoard} ${styles.wideBoard}`}>
                <div className={styles.boardHeader}>
                  <div>
                    <strong>Recently visited</strong>
                    <span>Your latest pages</span>
                  </div>
                  <Clock3 size={15} />
                </div>
                <div className={styles.linkList}>
                  {recent.map((entry) => (
                    <div className={styles.linkRow} key={entry.id}>
                      <button
                        type="button"
                        className={styles.linkMain}
                        onClick={() => onNavigate(entry.url)}
                      >
                        <SiteFavicon url={entry.url} explicit={entry.favicon} />
                        <span className={styles.linkCopy}>
                          <strong>{entry.title}</strong>
                          {state.showLinkDetails && <small>{hostname(entry.url)}</small>}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => onOpenInNewTab(entry.url)}
                        title="Open in new tab"
                      >
                        <ExternalLink size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                {!recent.length && (
                  <div className={styles.systemEmpty}>Your recent pages will appear here.</div>
                )}
              </article>
            </main>
          )}

          {view === 'settings' && (
            <main className={styles.settingsSection}>
              <section className={styles.settingsGroup}>
                <div className={styles.settingsHeading}>
                  <strong>Wallpaper</strong>
                  <span>Choose the atmosphere behind your new-tab workspace.</span>
                </div>
                <div className={styles.wallpaperGrid}>
                  {(['ambient', 'midnight', 'graphite', 'aurora'] as const).map((wallpaper) => (
                    <button
                      type="button"
                      key={wallpaper}
                      className={`${styles.wallpaperChoice} ${styles[`wallpaperPreview${wallpaper[0].toUpperCase()}${wallpaper.slice(1)}`]} ${state.wallpaper === wallpaper ? styles.selectedWallpaper : ''}`}
                      onClick={() => setState((current) => ({ ...current, wallpaper }))}
                    >
                      <span />
                      <strong>{wallpaper}</strong>
                    </button>
                  ))}
                </div>
              </section>

              <section className={styles.settingsGroup}>
                <div className={styles.settingsHeading}>
                  <strong>Layout and information</strong>
                  <span>Keep the page focused on what is useful to you.</span>
                </div>
                <div className={styles.settingRows}>
                  {[
                    ['showClock', 'Show clock', 'Display the current time above search.'],
                    ['showLinkDetails', 'Show link details', 'Show notes or domains below links.'],
                  ].map(([key, title, description]) => (
                    <label key={key} className={styles.settingRow}>
                      <span>
                        <strong>{title}</strong>
                        <small>{description}</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={
                          state[
                            key as keyof Pick<
                              NewTabState,
                              'showClock' | 'showDate' | 'showLinkDetails'
                            >
                          ]
                        }
                        onChange={(event) =>
                          setState((current) => ({
                            ...current,
                            [key]: event.target.checked,
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section className={styles.settingsGroup}>
                <div className={styles.settingsHeading}>
                  <strong>Backup and restore</strong>
                  <span>Move your complete new-tab layout between Nammu installations.</span>
                </div>
                <div className={styles.settingsActions}>
                  <button type="button" onClick={exportNewTab}>
                    <Download size={14} /> Export configuration
                  </button>
                  <button type="button" onClick={() => importInputRef.current?.click()}>
                    <FileUp size={14} /> Import configuration
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={importNewTab}
                  />
                </div>
              </section>

              <section className={`${styles.settingsGroup} ${styles.dangerZone}`}>
                <div className={styles.settingsHeading}>
                  <strong>Workspace data</strong>
                  <span>Reset defaults or permanently clear every workspace board and link.</span>
                </div>
                <div className={styles.settingsActions}>
                  <button
                    type="button"
                    onClick={() => {
                      setState(createDefaultNewTabState(quickDials));
                      setSettingsNotice('Default workspaces restored.');
                      setConfirmDeleteAll(false);
                    }}
                  >
                    <RotateCcw size={14} /> Restore defaults
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() =>
                      confirmDeleteAll ? deleteAllNewTabData() : setConfirmDeleteAll(true)
                    }
                  >
                    <Trash2 size={14} />
                    {confirmDeleteAll ? 'Confirm delete all' : 'Delete all workspace data'}
                  </button>
                  {activeWorkspace && state.workspaces.length > 1 && (
                    <button type="button" onClick={() => deleteWorkspace(activeWorkspace.id)}>
                      <Trash2 size={14} /> Delete active workspace
                    </button>
                  )}
                </div>
              </section>

              {settingsNotice && (
                <div className={styles.settingsNotice} role="status">
                  {settingsNotice}
                  <button type="button" onClick={() => setSettingsNotice('')} aria-label="Dismiss">
                    <X size={12} />
                  </button>
                </div>
              )}
            </main>
          )}
        </section>
      </div>

      {lastDeletedState && (
        <div className={styles.undoToast}>
          <Check size={14} />
          <span>Item removed</span>
          <button
            type="button"
            onClick={() => {
              setState(lastDeletedState);
              setLastDeletedState(null);
            }}
          >
            Undo
          </button>
          <button type="button" onClick={() => setLastDeletedState(null)} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}

      {editor && (
        <div
          className={`${styles.dialogBackdrop} nammu-glass-dialog-backdrop`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditor(null);
          }}
        >
          <form className={`${styles.dialog} nammu-glass-dialog`} onSubmit={submitEditor}>
            <div className={styles.dialogHeader}>
              <div>
                <small>New tab workspace</small>
                <strong>
                  {editor.mode === 'add' ? 'Add' : 'Edit'} {editor.kind}
                </strong>
              </div>
              <button type="button" onClick={() => setEditor(null)} aria-label="Close">
                <X size={15} />
              </button>
            </div>
            <div className={styles.dialogBody}>
              {editor.kind === 'link' ? (
                <>
                  <label>
                    Title
                    <input
                      autoFocus
                      value={editor.title}
                      maxLength={100}
                      onChange={(event) => setEditor({ ...editor, title: event.target.value })}
                      placeholder="Project dashboard"
                    />
                  </label>
                  <label>
                    Web address
                    <input
                      value={editor.url}
                      onChange={(event) => setEditor({ ...editor, url: event.target.value })}
                      placeholder="https://example.com"
                    />
                  </label>
                  <label>
                    Note
                    <textarea
                      value={editor.note}
                      maxLength={240}
                      onChange={(event) => setEditor({ ...editor, note: event.target.value })}
                      placeholder="Optional context"
                    />
                  </label>
                </>
              ) : (
                <label>
                  {editor.kind === 'board' ? 'Board name' : 'Workspace name'}
                  <input
                    autoFocus
                    value={editor.name}
                    maxLength={editor.kind === 'board' ? 120 : 60}
                    onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                    placeholder={editor.kind === 'board' ? 'Research' : 'Personal'}
                  />
                </label>
              )}
              {validationError && <p role="alert">{validationError}</p>}
            </div>
            <div className={styles.dialogFooter}>
              <button type="button" onClick={() => setEditor(null)}>
                Cancel
              </button>
              <button type="submit" className={styles.primary}>
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
