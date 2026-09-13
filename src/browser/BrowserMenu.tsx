import {
  Bookmark,
  Download,
  History,
  ListRestart,
  Minus,
  Network,
  Plus,
  Settings,
  UserRoundPlus,
} from 'lucide-react';

interface BrowserMenuProps {
  zoomLevel: number;
  canReopenClosedTab: boolean;
  onClose: () => void;
  onNewTab: () => void;
  onNewPrivateTab: () => void;
  onReopenClosedTab: () => void;
  onShowHistory: () => void;
  onShowBookmarks: () => void;
  onShowDownloads: () => void;
  onShowSettings: () => void;
  onShowProxyManager: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomIn: () => void;
}

const itemClass =
  'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[11px] text-white/75 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-35';

export default function BrowserMenu(props: BrowserMenuProps) {
  const run = (action: () => void) => () => {
    action();
    props.onClose();
  };

  return (
    <div className="nammu-context-surface absolute right-2 top-[50px] z-[80] w-56 rounded-xl p-1.5 shadow-2xl">
      <button type="button" onClick={run(props.onNewTab)} className={itemClass}>
        <span className="flex items-center gap-2"><Plus size={13} />New Tab</span>
        <span className="text-[9px] text-white/35">Ctrl T</span>
      </button>
      <button type="button" onClick={run(props.onNewPrivateTab)} className={itemClass}>
        <span className="flex items-center gap-2"><UserRoundPlus size={13} />New Private Tab</span>
        <span className="text-[9px] text-white/35">Ctrl Shift P</span>
      </button>
      <button
        type="button"
        onClick={run(props.onReopenClosedTab)}
        disabled={!props.canReopenClosedTab}
        className={itemClass}
      >
        <span className="flex items-center gap-2"><ListRestart size={13} />Reopen Closed Tab</span>
      </button>

      <div className="my-1 border-y border-white/[0.08] py-1">
        <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px] text-white/70">
          <span>Zoom</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={props.onZoomOut} className="grid h-6 w-6 place-items-center rounded-md hover:bg-white/10" aria-label="Zoom out"><Minus size={12} /></button>
            <button type="button" onClick={props.onResetZoom} className="min-w-11 rounded-md px-1.5 py-1 text-[10px] hover:bg-white/10">{props.zoomLevel}%</button>
            <button type="button" onClick={props.onZoomIn} className="grid h-6 w-6 place-items-center rounded-md hover:bg-white/10" aria-label="Zoom in"><Plus size={12} /></button>
          </div>
        </div>
      </div>

      <button type="button" onClick={run(props.onShowBookmarks)} className={itemClass}><span className="flex items-center gap-2"><Bookmark size={13} />Bookmarks</span></button>
      <button type="button" onClick={run(props.onShowHistory)} className={itemClass}><span className="flex items-center gap-2"><History size={13} />History</span></button>
      <button type="button" onClick={run(props.onShowDownloads)} className={itemClass}><span className="flex items-center gap-2"><Download size={13} />Downloads</span></button>
      <button type="button" onClick={run(props.onShowProxyManager)} className={itemClass}><span className="flex items-center gap-2"><Network size={13} />Proxy Manager</span></button>
      <button type="button" onClick={run(props.onShowSettings)} className={itemClass}><span className="flex items-center gap-2"><Settings size={13} />Browser Settings</span></button>
    </div>
  );
}
