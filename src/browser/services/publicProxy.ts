export type PublicProxyProtocol = 'http' | 'https' | 'socks4' | 'socks5';

export type PublicProxyAnonymity = 'elite' | 'anonymous' | 'transparent' | 'unknown';

export interface PublicProxyEndpoint {
  id: string;
  host: string;
  port: number;
  protocol: PublicProxyProtocol;
  country: string;
  countryCode: string;
  city: string;
  anonymity: PublicProxyAnonymity;
  source: 'ProxyScrape' | 'Proxifly';
  sourceLatencyMs: number | null;
  uptimePercent: number | null;
  lastCheckedAt: string | null;
}

export interface PublicProxyHealth extends PublicProxyEndpoint {
  alive: boolean;
  latencyMs: number | null;
  checkedAt: string;
  error?: string;
}

export interface PublicProxyConnection {
  scope: 'browser' | 'tab';
  tabId?: string;
  primary: PublicProxyHealth;
  failovers: PublicProxyHealth[];
  connectedAt: string;
}

export const PUBLIC_PROXY_NOTICE =
  'Public proxies are untrusted third-party servers, not a VPN. Never use them for passwords, banking, email, private messages, payments, or any signed-in account.';

export function formatProxyEndpoint(proxy: Pick<PublicProxyEndpoint, 'host' | 'port'>) {
  return `${proxy.host}:${proxy.port}`;
}
