import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type MutableRefObject,
} from 'react';
import { getNammuSDK, type WebSurfaceHandle, type WebSurfaceSnapshot } from '@nammu/sdk';
import type { WebSurfaceProxyEndpoint } from '@nammu/sdk';

export interface NativeWebSurfaceHandle {
  navigate(url: string): Promise<void>;
  goBack(): Promise<void>;
  goForward(): Promise<void>;
  reload(): Promise<void>;
  stop(): Promise<void>;
  focus(): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  setZoom(zoom: number): Promise<void>;
  setProxyRoute(
    scope: 'profile' | 'surface',
    endpoints: readonly WebSurfaceProxyEndpoint[],
  ): Promise<void>;
}

interface Props {
  enabled: boolean;
  active: boolean;
  profileKey?: string;
  privateSession?: boolean;
  url: string | null;
  zoom: number;
  muted: boolean;
  browserOverlayActive: boolean;
  overlayActive?: boolean;
  surfaceLabel?: string;
  onState(snapshot: WebSurfaceSnapshot): void;
  onReady(): void;
  onFailure(message: string): void;
  onDiagnostic(message: string): void;
  onOpenRequest?(url: string): void;
}

function bounds(node: HTMLElement) {
  const rect = node.getBoundingClientRect();
  return {
    x: Math.max(0, rect.left),
    y: Math.max(0, rect.top),
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height),
  };
}

function invoke(
  ref: MutableRefObject<WebSurfaceHandle | null>,
  operation: (surface: WebSurfaceHandle) => Promise<void>,
) {
  return ref.current ? operation(ref.current) : Promise.resolve();
}

const NativeWebSurface = forwardRef<NativeWebSurfaceHandle, Props>(function NativeWebSurface(
  {
    enabled,
    active,
    profileKey = 'default',
    privateSession = false,
    url,
    muted,
    zoom,
    browserOverlayActive,
    overlayActive = false,
    surfaceLabel = 'Website viewport',
    onState,
    onReady,
    onFailure,
    onDiagnostic,
    onOpenRequest,
  },
  forwardedRef,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<WebSurfaceHandle | null>(null);
  const latestRef = useRef({ onState, onReady, onFailure, onDiagnostic, onOpenRequest });
  latestRef.current = { onState, onReady, onFailure, onDiagnostic, onOpenRequest };

  useImperativeHandle(
    forwardedRef,
    () => ({
      navigate: (next) => invoke(surfaceRef, (surface) => surface.navigate(next)),
      goBack: () => invoke(surfaceRef, (surface) => surface.control('go-back')),
      goForward: () => invoke(surfaceRef, (surface) => surface.control('go-forward')),
      reload: () => invoke(surfaceRef, (surface) => surface.control('reload')),
      stop: () => invoke(surfaceRef, (surface) => surface.control('stop')),
      focus: () => invoke(surfaceRef, (surface) => surface.focus()),
      setMuted: (next) =>
        invoke(surfaceRef, (surface) => surface.control(next ? 'mute' : 'unmute')),
      setZoom: (next) => invoke(surfaceRef, (surface) => surface.setZoom(next)),
      setProxyRoute: (scope, endpoints) =>
        invoke(surfaceRef, (surface) => surface.setProxyRoute(scope, endpoints)),
    }),
    [],
  );

  useEffect(() => {
    if (!enabled || !url || !hostRef.current) return;
    let cancelled = false;
    let unsubscribeState = () => {};
    let unsubscribeOpenRequest = () => {};
    const sdk = getNammuSDK();
    void sdk.webSurfaces
      .create({
        capability: 'browser-public',
        profileKey,
        privateSession,
        url,
        bounds: bounds(hostRef.current),
        visible: active && !browserOverlayActive && !overlayActive,
      })
      .then((surface) => {
        if (cancelled) return surface.destroy();
        surfaceRef.current = surface;
        unsubscribeState = surface.onState((state) => latestRef.current.onState(state));
        unsubscribeOpenRequest = surface.onOpenRequest((nextUrl) =>
          latestRef.current.onOpenRequest?.(nextUrl),
        );
        void surface.setZoom(zoom / 100).catch((error) =>
          latestRef.current.onDiagnostic(String(error)),
        );
        latestRef.current.onReady();
      })
      .catch((error) => latestRef.current.onFailure(String(error)));
    return () => {
      cancelled = true;
      unsubscribeState();
      unsubscribeOpenRequest();
      const surface = surfaceRef.current;
      surfaceRef.current = null;
      void surface?.destroy().catch((error) => latestRef.current.onDiagnostic(String(error)));
    };
  }, [enabled, privateSession, profileKey]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !url) return;
    void surface.navigate(url).catch((error) => latestRef.current.onFailure(String(error)));
  }, [url]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    void surface
      .setVisible(active && !browserOverlayActive && !overlayActive)
      .catch((error) => latestRef.current.onDiagnostic(String(error)));
  }, [active, browserOverlayActive, overlayActive]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    void surface.control(muted ? 'mute' : 'unmute').catch((error) =>
      latestRef.current.onDiagnostic(String(error)),
    );
  }, [muted]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    void surface
      .setZoom(zoom / 100)
      .catch((error) => latestRef.current.onDiagnostic(String(error)));
  }, [zoom]);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (surfaceRef.current) void surfaceRef.current.setBounds(bounds(node));
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0" aria-label={surfaceLabel} />;
});

export default NativeWebSurface;
