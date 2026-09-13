import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Gauge,
  Globe2,
  LoaderCircle,
  Network,
  RefreshCw,
  ShieldAlert,
  Unplug,
  X,
  Zap,
} from 'lucide-react';
import {
  formatProxyEndpoint,
  PUBLIC_PROXY_NOTICE,
  type PublicProxyConnection,
  type PublicProxyEndpoint,
  type PublicProxyHealth,
  type PublicProxyProtocol,
} from './services/publicProxy';
import { getNammuSDK } from '@nammu/sdk';

interface ProxyManagerPanelProps {
  activeTabUrl: string;
  engineReady: boolean;
  browserConnection: PublicProxyConnection | null;
  tabConnection: PublicProxyConnection | null;
  onClose: () => void;
  onConnect: (
    scope: 'browser' | 'tab',
    primary: PublicProxyHealth,
    failovers: PublicProxyHealth[],
  ) => Promise<void>;
  onDisconnect: (scope: 'browser' | 'tab') => Promise<void>;
  onDisconnectAll: () => Promise<void>;
}

const protocolLabels: Record<PublicProxyProtocol, string> = {
  http: 'HTTP',
  https: 'HTTPS',
  socks4: 'SOCKS4',
  socks5: 'SOCKS5',
};

function countryFlag(countryCode: string) {
  if (!/^[A-Z]{2}$/.test(countryCode)) return '🌐';
  return String.fromCodePoint(
    ...[...countryCode].map((character) => 127397 + character.charCodeAt(0)),
  );
}

function latencyTone(latency: number) {
  if (latency < 350) return 'text-[#49e6ae]';
  if (latency < 900) return 'text-[#f5c45b]';
  return 'text-[#ff7b78]';
}

export default function ProxyManagerPanel({
  activeTabUrl,
  engineReady,
  browserConnection,
  tabConnection,
  onClose,
  onConnect,
  onDisconnect,
  onDisconnectAll,
}: ProxyManagerPanelProps) {
  const [scope, setScope] = useState<'browser' | 'tab'>(() =>
    browserConnection && !tabConnection ? 'browser' : 'tab',
  );
  const [protocol, setProtocol] = useState<'all' | PublicProxyProtocol>('https');
  const [country, setCountry] = useState('all');
  const [anonymity, setAnonymity] = useState('all');
  const [candidates, setCandidates] = useState<PublicProxyEndpoint[]>([]);
  const [healthy, setHealthy] = useState<PublicProxyHealth[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingId, setConnectingId] = useState('');
  const operationRef = useRef(0);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const targetOrigin = useMemo(() => {
    try {
      const url = new URL(activeTabUrl);
      return url.protocol === 'https:' ? url.origin : '';
    } catch {
      return '';
    }
  }, [activeTabUrl]);

  const discoverAndCheck = useCallback(
    async (signal: AbortSignal, forceRefresh = false) => {
      setLoading(true);
      setError('');
      setHealthy([]);
      try {
        const discoveryBody = await getNammuSDK().services.request<{
          data?: PublicProxyEndpoint[];
          countries?: string[];
          error?: string;
        }>('browser.public-proxies', 'discover', {
          protocol: protocol === 'all' ? undefined : protocol,
          country: country === 'all' ? undefined : country,
          limit: 100,
          refresh: forceRefresh,
        });
        if (!discoveryBody.data) {
          throw new Error(discoveryBody.error || 'Could not discover public proxies.');
        }

        const nextCandidates = discoveryBody.data.filter(
          (proxy) => anonymity === 'all' || proxy.anonymity === anonymity,
        );
        setCandidates(nextCandidates);
        setCountries(discoveryBody.countries || []);
        if (nextCandidates.length === 0) return;

        // Only endpoints proven live by our own health check are rendered as connectable.
        if (signal.aborted) return;
        const checkBody = await getNammuSDK().services.request<{
          data?: PublicProxyHealth[];
          error?: string;
        }>('browser.public-proxies', 'check', {
          ids: nextCandidates.slice(0, 20).map((proxy) => proxy.id),
          ...(targetOrigin ? { targetUrl: targetOrigin } : {}),
        });
        if (!checkBody.data) {
          throw new Error(checkBody.error || 'Could not verify public proxies.');
        }
        setHealthy(
          checkBody.data
            .filter((proxy) => proxy.alive)
            .sort((a, b) => (a.latencyMs || 99999) - (b.latencyMs || 99999)),
        );
      } catch (reason) {
        if ((reason as Error).name !== 'AbortError') {
          setError(reason instanceof Error ? reason.message : 'Proxy discovery failed.');
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [anonymity, country, protocol, targetOrigin],
  );

  useEffect(() => {
    const controller = new AbortController();
    void discoverAndCheck(controller.signal, refreshKey > 0);
    return () => controller.abort();
  }, [discoverAndCheck, refreshKey]);

  useEffect(() => {
    operationRef.current += 1;
    setConnectingId('');
  }, [targetOrigin]);

  const selectedConnection = scope === 'browser' ? browserConnection : tabConnection;
  const primaryId = selectedConnection?.primary.id;
  const standbyIds = useMemo(
    () => new Set((selectedConnection?.failovers || []).map((proxy) => proxy.id)),
    [selectedConnection],
  );

  const connect = async (proxy: PublicProxyHealth) => {
    if (!engineReady) {
      setError('The browser engine is still starting. Try Connect again in a moment.');
      return;
    }
    const operation = ++operationRef.current;
    setConnectingId(proxy.id);
    setError('');
    try {
      const proposedFailovers = healthy
        .filter((candidate) => candidate.id !== proxy.id && candidate.protocol === proxy.protocol)
        .slice(0, 3);
      const verificationBody = await getNammuSDK().services.request<{
        data?: PublicProxyHealth[];
        error?: string;
      }>('browser.public-proxies', 'check', {
        ids: [proxy.id, ...proposedFailovers.map((item) => item.id)],
        ...(targetOrigin ? { targetUrl: targetOrigin } : {}),
      });
      if (!verificationBody.data) {
        throw new Error(verificationBody.error || 'Could not verify this proxy route.');
      }
      if (operation !== operationRef.current) return;

      const verifiedById = new Map(
        verificationBody.data.filter((item) => item.alive).map((item) => [item.id, item]),
      );
      setHealthy((current) =>
        current
          .map((item) => verificationBody.data?.find((fresh) => fresh.id === item.id) || item)
          .filter((item) => item.alive),
      );
      const verifiedPrimary = verifiedById.get(proxy.id);
      if (!verifiedPrimary) {
        throw new Error(
          'That proxy could not sustain encrypted traffic to this website. Choose another.',
        );
      }

      const verifiedFailovers = proposedFailovers
        .map((item) => verifiedById.get(item.id))
        .filter((item): item is PublicProxyHealth => Boolean(item));
      await onConnect(scope, verifiedPrimary, verifiedFailovers);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not apply the proxy route.');
    } finally {
      if (operation === operationRef.current) setConnectingId('');
    }
  };

  const disconnect = async (targetScope: 'browser' | 'tab' | 'all') => {
    const operation = ++operationRef.current;
    setConnectingId('disconnect');
    setError('');
    try {
      if (targetScope === 'all') await onDisconnectAll();
      else await onDisconnect(targetScope);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not disconnect the proxy route.');
    } finally {
      if (operation === operationRef.current) setConnectingId('');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 font-sans">
      <div className="flex items-center justify-between border-b border-white/6 pb-2">
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-electric">
          <Network size={12} /> Proxy Manager
        </span>
        <button
          onClick={onClose}
          className="text-[#69849b] hover:text-white"
          aria-label="Close proxy manager"
        >
          <X size={12} />
        </button>
      </div>

      <div className="border border-[#f1b84b]/25 bg-[#f1b84b]/[0.055] p-2.5">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold text-[#f5c45b]">
          <ShieldAlert size={12} /> Not a VPN · untrusted route
        </div>
        <p className="text-[10px] leading-4 text-[#aebdca]">{PUBLIC_PROXY_NOTICE}</p>
        <p className="mt-1.5 text-[9px] text-[#7f93a5]">
          Connecting confirms that you will use this route only for non-sensitive browsing.
        </p>
      </div>

      <div>
        <div className="mb-1.5 font-mono text-[9px] uppercase tracking-wider text-[#668096]">
          Apply route to
        </div>
        <div className="grid grid-cols-2 border border-white/8 bg-black/25 p-0.5">
          <button
            type="button"
            onClick={() => setScope('tab')}
            className={`px-2 py-1.5 text-[10px] transition-colors ${scope === 'tab' ? 'bg-electric/15 text-[#b8dcff]' : 'text-[#71899d] hover:text-white'}`}
          >
            This tab
          </button>
          <button
            type="button"
            onClick={() => setScope('browser')}
            className={`px-2 py-1.5 text-[10px] transition-colors ${scope === 'browser' ? 'bg-electric/15 text-[#b8dcff]' : 'text-[#71899d] hover:text-white'}`}
          >
            Whole browser
          </button>
        </div>
        <div className="mt-1 truncate text-[9px] text-[#60798e]">
          {scope === 'tab'
            ? 'This tab only · other tabs keep their current route'
            : 'Every web tab in this Browser window'}
        </div>
      </div>

      {selectedConnection && (
        <div className="border border-[#2ee6a6]/25 bg-[#2ee6a6]/[0.055] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#61e8b8]">
                <Check size={11} /> Connected · {scope === 'tab' ? 'this tab' : 'whole browser'}
              </div>
              <div className="mt-1 truncate font-mono text-[10px] text-[#c4d6e4]">
                {formatProxyEndpoint(selectedConnection.primary)}
              </div>
              <div className="mt-0.5 text-[9px] text-[#668096]">
                {selectedConnection.failovers.length} automatic failover
                {selectedConnection.failovers.length === 1 ? '' : 's'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void disconnect(scope)}
              className="flex shrink-0 items-center gap-1 border border-[#ff6b6b]/25 px-2 py-1 text-[9px] text-[#ff8d8d] hover:bg-[#ff6b6b]/10"
            >
              <Unplug size={10} /> Disconnect
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => void disconnect('all')}
        className="flex w-full items-center justify-center gap-1.5 border border-[#ff6b6b]/25 bg-[#ff6b6b]/[0.045] px-2 py-1.5 text-[10px] text-[#ff9999] hover:bg-[#ff6b6b]/10"
      >
        {connectingId === 'disconnect' ? (
          <LoaderCircle size={10} className="animate-spin" />
        ) : (
          <Unplug size={10} />
        )}
        {browserConnection || tabConnection
          ? 'Disconnect all proxy routes'
          : 'Reset to direct connection'}
      </button>

      <div className="grid grid-cols-3 gap-1">
        <select
          value={protocol}
          onChange={(event) => setProtocol(event.target.value as 'all' | PublicProxyProtocol)}
          className="min-w-0 border border-white/8 bg-[#080d15] px-1.5 py-1.5 text-[10px] text-[#bcd0df] outline-none focus:border-electric/50"
          aria-label="Filter protocol"
        >
          <option value="all">All types</option>
          <option value="https">HTTPS · Recommended</option>
          <option value="socks5">SOCKS5</option>
          <option value="socks4">SOCKS4</option>
          <option value="http">HTTP</option>
        </select>
        <select
          value={country}
          onChange={(event) => setCountry(event.target.value)}
          className="min-w-0 border border-white/8 bg-[#080d15] px-1.5 py-1.5 text-[10px] text-[#bcd0df] outline-none focus:border-electric/50"
          aria-label="Filter country"
        >
          <option value="all">All regions</option>
          {countries.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        <select
          value={anonymity}
          onChange={(event) => setAnonymity(event.target.value)}
          className="min-w-0 border border-white/8 bg-[#080d15] px-1.5 py-1.5 text-[10px] text-[#bcd0df] outline-none focus:border-electric/50"
          aria-label="Filter anonymity"
        >
          <option value="all">Any privacy</option>
          <option value="elite">Elite</option>
          <option value="anonymous">Anonymous</option>
          <option value="transparent">Transparent</option>
        </select>
      </div>

      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[9px] text-[#668096]">
          {loading ? (
            <LoaderCircle size={10} className="animate-spin text-electric" />
          ) : (
            <Gauge size={10} className="text-[#49e6ae]" />
          )}
          {loading
            ? `Testing ${Math.min(candidates.length || 20, 20)} candidates…`
            : `${healthy.length} live · TLS + traffic verified`}
        </span>
        <button
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={loading}
          className="flex items-center gap-1 border border-white/8 px-2 py-1 text-[9px] text-[#91a9bc] hover:bg-white/4 hover:text-white disabled:opacity-40"
        >
          <RefreshCw size={9} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-1.5 border border-[#ff6b6b]/20 bg-[#ff6b6b]/5 p-2 text-[10px] leading-4 text-[#ff9999]">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5 os-scrollbar">
        {!loading && healthy.length === 0 && !error && (
          <div className="border border-white/6 bg-black/20 px-3 py-7 text-center text-[10px] leading-4 text-[#668096]">
            No live proxy passed the current health check. Try another protocol, region, or refresh.
          </div>
        )}
        {healthy.map((proxy) => {
          const isActive = primaryId === proxy.id;
          const isStandby = standbyIds.has(proxy.id);
          return (
            <div
              key={proxy.id}
              className={`border p-2.5 ${isActive ? 'border-[#2ee6a6]/40 bg-[#2ee6a6]/[0.06]' : isStandby ? 'border-electric/25 bg-electric/[0.035]' : 'border-white/6 bg-black/20 hover:border-white/12'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm" aria-label={proxy.countryCode}>
                      {countryFlag(proxy.countryCode)}
                    </span>
                    <span className="truncate font-mono text-[10px] text-[#d7e4ed]">
                      {formatProxyEndpoint(proxy)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-[#69849b]">
                    <span className="border border-electric/20 bg-electric/[0.06] px-1 py-0.5 text-[#8bc5f8]">
                      {protocolLabels[proxy.protocol]}
                    </span>
                    <span>
                      {proxy.countryCode}
                      {proxy.city && proxy.city !== 'Unknown' ? ` · ${proxy.city}` : ''}
                    </span>
                    <span className={latencyTone(proxy.latencyMs || 99999)}>
                      {proxy.latencyMs} ms
                    </span>
                    <span>{proxy.anonymity}</span>
                  </div>
                  <div className="mt-1 text-[8px] text-[#506a80]">
                    {proxy.source}
                    {proxy.uptimePercent !== null
                      ? ` · ${Math.round(proxy.uptimePercent)}% source uptime`
                      : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void connect(proxy)}
                  disabled={connectingId !== '' || isActive}
                  title={!engineReady ? 'The browser engine is still starting' : undefined}
                  className="flex shrink-0 items-center gap-1 border border-electric/30 bg-electric/10 px-2 py-1 text-[9px] text-[#a8d5ff] hover:bg-electric/20 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {connectingId === proxy.id ? (
                    <LoaderCircle size={9} className="animate-spin" />
                  ) : (
                    <Zap size={9} />
                  )}
                  {isActive ? 'Active' : isStandby ? 'Make active' : 'Connect'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 border-t border-white/6 pt-2 text-[8px] text-[#506a80]">
        <Globe2 size={9} /> Sources refresh every five minutes · dead endpoints are hidden
      </div>
    </div>
  );
}
