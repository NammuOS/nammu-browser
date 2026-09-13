# Nammu Browser

Independent `os.nammu.browser` application for NammuOS. Its product UI and state live in this package; remote content is hosted only through the permission-controlled generic Nammu WebSurface API.

- Web: Core-owned pooled Gecko/WASM + Wisp
- Desktop: Core-owned WebView2
- Package: React UI, tabs, bookmarks, history, preferences and new-tab workspace

The package never imports Tauri, WebView2, Gecko internals, Wisp credentials, Core filesystem APIs, signing internals or nmu internals.

```sh
bun install
bun run build
```

Official releases are signed outside this repository with the NammuOS release signer.
