# IPC dependencies — pending main-process work

This file documents IPC channels the renderer uses but that may need a
corresponding handler registration in `electron/main.ts`. It exists so the
onboarding/setup agent (or whoever owns the main-process side) can wire the
missing pieces without searching for "where is this called from".

## `config:open`

**Status:** invoked from renderer, handler may not yet exist on main.

**Where:** `src/App.tsx` — error CTA shown on `INVALID_API_KEY` /
`API_KEY_MISSING` ("Open config" / "Abrir config" / "Abrir config" button
inside the inline error pill).

**Expected behavior:** open the existing config window (the small API-key
prompt). Main already has a `createConfigWindow()` helper used by the tray
menu — the handler just needs to call it.

**Suggested implementation** (drop into the `registerHandlers({...})` block in
`electron/main.ts`):

```ts
'config:open': () => { createConfigWindow(); },
```

And add the channel to `shared/ipc-types.d.ts → IpcRequests`:

```ts
'config:open': () => void;
```

The renderer-side invocation is intentionally wrapped in a try/catch with a
generic `electronAPI.invoke` cast (bypassing the typed `invoke()` helper) so
the renderer keeps working even before the handler is registered — the click
just logs a warning to the console.

## Notes

- No new permissions or windows are required beyond what already exists.
- The renderer does NOT need to be aware of whether the handler exists — the
  CTA degrades gracefully (warning only) if it's missing.
