# Read Document / Folder — Design Spec

**Date:** 2026-05-20
**Project:** Claude Buddy
**Status:** Design approved, ready for implementation plan
**Author:** brainstormed with the user

---

## Problem

The mascot today can read selections from the foreground window, parse a
single attached file (PDF/DOCX/text/image), and accept clipboard content.
What it cannot do is reason about **multiple files at once** or about a
**project folder**. Common requests like "explain this codebase", "compare
these three PDFs", or "find the bug in this folder" require the user to
manually open each file and copy-paste content — defeating the whole point
of an in-OS assistant.

## Goal

Let the user drop a file or a folder onto the mascot bubble (or attach one
via the existing `+` picker), and let the agent intelligently navigate and
read it on demand. The agent decides what to read; the user only points at
*what's in scope*.

## Non-goals

- Editing files (write/delete/rename) — read-only this iteration. Edits
  remain via `edit_in_place` (which pastes back into the active app).
- Cloud storage / Google Drive / Dropbox — local filesystem only.
- Path-mention auto-attach (e.g. typing "explain `C:\foo\bar.md`" doesn't
  trigger anything) — user must drop or pick.
- Configurable size limits — hardcoded defaults this iteration, surfaceable
  in settings later if real usage demands it.

---

## User-facing behavior

### Attach flows

1. **Drag-and-drop** any file or folder onto the mascot bubble. An overlay
   appears while dragging (dashed orange border, "Drop to attach" copy).
2. **`+` picker** has two new options below the existing Print/Clipboard/
   File trio: a "Pasta" option that opens an OS folder dialog. (Single
   file already works today.)

### Lifecycle

Attached paths **persist** across messages — the user can ask five things
about the same folder in a row without re-attaching. They go away when:

- User clicks the `x` on the chip.
- Mascot goes to sleep (idle timeout or explicit close).
- User clicks the close button on the bubble.

Each attached path is represented as a chip in the input area:

- File: `📄 nome.ext` + size
- Folder: `📁 nome` (no count — computing it requires a walk; agent surfaces it via `list_folder` on first call)

### Agent behavior

When at least one path is attached, the system prompt grows by a small
discreet block (~50 tokens) listing the paths with their kind. The agent
is told it can call `list_folder` and `read_file` as needed.

For a folder drop, the canonical agent flow is:

1. `list_folder(rootPath, recursive: true)` — get the tree (already
   filtered).
2. Decide which 3-5 files are most relevant (README, configs,
   src/main-like entrypoints).
3. Call `read_file(...)` on each.
4. Answer the user's question with the gathered context.

Each tool call shows up in the UI as a step (`listed folder`, `read file:
README.md`), same as the existing tool indicators.

---

## Architecture

### New module: `electron/files.ts`

The single source of truth for filesystem reads. Self-contained, easy to
unit-test, no Electron-specific imports (uses only `node:fs/promises`,
`node:path`).

Public API:

```typescript
export interface FolderEntry {
  name: string;
  type: 'file' | 'folder';
  size: number;       // bytes; 0 for folder (don't recursively sum)
  modified: number;   // ms epoch
}

export interface FolderListing {
  path: string;
  entries: FolderEntry[];
  truncated: boolean; // true when max_entries was hit
}

export interface FileContent {
  path: string;
  kind: 'text' | 'image';
  // For text/code/PDF/DOCX: the parsed string
  text?: string;
  // For images: base64 + mime, fed to the model as an image block
  base64?: string;
  mimeType?: string;
  bytesRead: number;
  truncated: boolean;
}

export async function listFolder(
  rootPath: string,
  opts: { recursive?: boolean; maxEntries?: number; respectGitignore?: boolean }
): Promise<FolderListing>;

export async function readFile(
  filePath: string,
  opts: { maxBytes?: number }
): Promise<FileContent>;

export const IGNORE_PATTERNS: string[]; // exported so the renderer can show the user what's filtered if asked
```

Internal helpers:

- `applyIgnores(name, isFolder, rules) → boolean` — checks both the
  hardcoded `IGNORE_PATTERNS` and parsed `.gitignore` rules if present.
- `routeReader(ext) → 'text' | 'pdf' | 'docx' | 'image' | 'unsupported'`
- `truncateAtBytes(buffer, maxBytes) → { content, truncated }`

### `.gitignore` parsing

Uses the [`ignore`](https://www.npmjs.com/package/ignore) npm package
(~6KB, zero deps, the de-facto standard). Added as a runtime dependency.

When `listFolder` is called with `respectGitignore: true` (always, in
practice), it:

1. Looks for `.gitignore` at the root of the folder being listed.
2. If present, instantiates an `ignore()` matcher with the file's contents
   plus `IGNORE_PATTERNS`.
3. Filters entries through the matcher.
4. Nested `.gitignore` files inside subfolders are **not** consulted in
   this iteration (would require recursive parsing — wait for real demand).

### Hardcoded `IGNORE_PATTERNS`

```
.git/
node_modules/
dist/
build/
.next/
target/
__pycache__/
.venv/
venv/
*.lock
*.log
.DS_Store
.env
.env.*
```

### Security: scope guard

The `electron/files.ts` API itself **doesn't** know about user-attached
scope — it's a pure FS module. The scope check happens one layer up, in
the IPC handler:

```typescript
// electron/main.ts
'files:list-folder': async ({ path, options }) => {
  if (!isPathInAttachedScope(path)) {
    return { error: 'path not in attached scope' };
  }
  return listFolder(path, options);
},
```

`isPathInAttachedScope(p)` is fed the set of currently-attached paths
(maintained in main process state, synced from the renderer via a new
`files:set-scope` IPC). A path is in scope if it `path.resolve()`s to a
location that starts with one of the attached roots.

This prevents the agent from reading arbitrary files on the user's
machine — a non-trivial guarantee for an LLM-driven tool.

### Limits (hardcoded)

```typescript
const LIMITS = {
  maxBytesText:  200 * 1024,         //  200 KB
  maxBytesPdf:    5 * 1024 * 1024,   //    5 MB
  maxBytesDocx:   2 * 1024 * 1024,   //    2 MB
  maxBytesImage:  1 * 1024 * 1024,   //    1 MB
  maxEntries:    200,                // per list_folder call
  maxRecursionDepth: 5,
};
```

The agent does **not** control limits — they're hardcoded server-side and
not exposed in the tool schemas. This keeps the tool API minimal and
prevents the model from blowing the token budget by passing huge
`max_bytes`. The IPC layer accepts an optional `maxBytes` override for
debugging only — the renderer never passes it on agent-initiated calls.

### New IPC channels

```typescript
// shared/ipc-types.ts additions
'files:list-folder': (params: { path: string; options: { recursive?: boolean; maxEntries?: number } }) =>
  Promise<FolderListing | { error: string }>;
'files:read-file': (params: { path: string; maxBytes?: number }) =>
  Promise<FileContent | { error: string }>;
'files:set-scope': (paths: string[]) => void; // renderer pushes the current scope on every change
'files:pick-folder': () => Promise<{ path: string; name: string } | null>; // for the AttachPicker
'files:resolve-dropped': (paths: string[]) => Promise<Array<{ path: string; kind: 'file' | 'folder'; name: string; size: number }>>;
// resolve-dropped takes paths obtained via webUtils.getPathForFile and stats them in main
```

### Tool definitions (renderer, `src/services/skills.ts`)

```typescript
{
  name: 'list_folder',
  description: 'List files and subfolders inside a user-attached folder. Use this BEFORE read_file when you need to know what is there. The result is already filtered for noise (.git, node_modules, dist, lock files, plus user .gitignore if present). Limited to 200 entries per call (use a deeper path for narrowing).',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path of the folder to list. MUST be within or equal to a path the user attached.' },
      recursive: { type: 'boolean', description: 'If true, lists subfolders up to 5 levels deep. Default false.' },
    },
    required: ['path'],
  },
}

{
  name: 'read_file',
  description: 'Read the contents of a file (text/code/PDF/DOCX/image). For images you receive an image block you can analyze directly. Text/code/PDF/DOCX come as a string. Files larger than the limit (200KB text, 5MB PDF, 2MB DOCX, 1MB image) are truncated with a [truncated, total Xmb] suffix.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path. MUST be within an attached scope.' },
    },
    required: ['path'],
  },
}
```

The tool result for `read_file` of an image is a `tool_result` block whose
`content` is an array containing one `image` block (base64) — same shape
the SDK already uses for inline image attachments.

### Renderer state (`src/state/conversation.ts`)

```typescript
export type AttachedPath = {
  id: string;       // uuid
  path: string;     // absolute
  kind: 'file' | 'folder';
  name: string;     // basename
  size: number;     // bytes; for folder, sum of immediate readable children
};

interface ConversationState {
  // ...existing...
  attachedPaths: AttachedPath[];

  addAttachedPath: (p: AttachedPath) => void;
  removeAttachedPath: (id: string) => void;
}
```

`reset()` clears `attachedPaths` (so sleep clears scope).

Every change to `attachedPaths` triggers `invoke('files:set-scope', paths)`
so the main process knows what's currently allowed.

### System prompt extension (`src/services/claude.ts`)

When `attachedPaths.length > 0`, inject a discreet block after the
existing `memoriesBlock`:

```typescript
function attachedPathsBlock(paths: AttachedPath[], locale: Locale): string {
  if (paths.length === 0) return '';
  const lines = paths.map(p => `- [${p.kind}] ${p.path}`).join('\n');
  return `\n\nATTACHED PATHS (use list_folder / read_file when relevant):\n${lines}`;
}
```

Doesn't dump content. The agent decides what to read.

### UI additions

| Where | Change |
|---|---|
| `src/App.tsx` | Add `onDragOver` + `onDrop` listeners on the bubble container. Show drag overlay (orange dashed border, "Drop to attach"). On drop: call `webUtils.getPathForFile(file)` for each, send to `files:resolve-dropped`, push resolved entries into `attachedPaths`. |
| `src/components/AttachPicker.tsx` | New "📁 Pasta" option below "Arquivo". Click invokes `files:pick-folder`. |
| `src/components/AttachmentChip.tsx` | New variant when `attachedPath` prop is passed (instead of `attachment`). Renders `📄 nome.ext` (+size for files) or `📁 nome`, plus the existing `×` button. |
| `src/components/ResponseView.tsx` | New `STEP_LABELS` entries: `list_folder: 'listed folder'`, `read_file: 'read file'`. |
| `src/i18n/dict` | i18n strings for: `attach.folder` ("Folder" / "Pasta" / "Carpeta"), `attach.folderSub`, `attach.dropHere` ("Drop to attach" / "Solte aqui" / "Suelta aquí"), `steps.list_folder`, `steps.read_file`. |

Visual styling follows the existing `product-ui-style` skill:

- Drag overlay: position absolute over the bubble; near-white fill at 95%
  opacity; 2px dashed border in `#d97757`; large radius (`16-20px`);
  centered "Drop to attach" text in serif display (small).
- Folder/file chip: same pill anatomy as today's `cb-chip`; monochrome line
  icon for `📄`/`📁` (consider unicode emoji is acceptable here, matches
  the existing `📁` in the manage-agents row); muted secondary text for
  the size.

---

## Error handling

| Condition | Behavior |
|---|---|
| Path doesn't exist | Tool returns `{ error: 'path not found' }`; agent typically retries with `list_folder` to verify. |
| Permission denied (OS-level) | `{ error: 'permission denied' }`. |
| Path outside scope | `{ error: 'path not in attached scope: <path>' }`. Triggered by the IPC handler before the FS call. |
| Unsupported binary | `{ error: 'unsupported binary format (.zip)' }` with the actual extension. |
| PDF parse error | `{ error: 'failed to parse PDF: <pdf-parse message>' }`. |
| DOCX parse error | Same shape. |
| Size > limit | Reads up to limit, returns content + `truncated: true` + a hint in the text suffix. |

A drag-and-drop with no path (rare on Windows when dragging from non-file
sources like browser) is silently rejected — overlay vanishes, no chip
added.

---

## Token budget reasoning

- The system prompt grows by ~10-50 tokens per attached path (negligible).
- Each `list_folder` result is bounded to ~200 entries × ~40 chars =
  ~8 KB raw, ~2k tokens. Manageable.
- Each `read_file` is bounded by the per-type byte limits. The PDF limit
  (5 MB) is the worst case: a dense text-only PDF can be ~50k tokens.
  This is intentional — for a single PDF the user explicitly attached,
  burning 50k tokens in one call is correct.
- Prompt caching still applies because the `TOOL_INSTRUCTIONS` block and
  the `agent.systemPrompt` block don't change between iterations of the
  same turn. The `ATTACHED PATHS` block changes on attach/detach but
  rarely otherwise.

---

## Testing

### Unit (`tests/files.test.ts`, vitest)

- `listFolder(tmp, { recursive: false })` returns the immediate children
- `listFolder(tmp, { recursive: true })` walks up to depth 5
- `listFolder` truncates at `maxEntries`
- `applyIgnores` matches `node_modules`, `.git`, `*.lock`
- `applyIgnores` honors a `.gitignore` containing `secrets/` and `*.bak`
- `readFile(.txt)` returns plain text
- `readFile(.pdf)` returns parsed text (uses a tiny fixture PDF)
- `readFile(.docx)` returns parsed text (tiny fixture)
- `readFile(.png)` returns `kind: 'image'` with base64
- `readFile` truncates at `maxBytes`
- `readFile(.exe)` returns unsupported error

### IPC contract (`tests/files-ipc.test.ts`)

- Scope guard rejects out-of-scope path
- Scope guard allows attached path
- Scope guard allows children of attached folder

### Smoke (manual, after impl)

- Drop the `claude-buddy/` repo on the mascot → "explain this project" →
  agent calls `list_folder` (recursive), `read_file` on README and
  package.json, answers coherently. Steps visible in UI.
- Drop a single PDF → "summarize" → agent reads, answers.
- Drop a PNG screenshot → "what's in this image" → vision works.
- Attach a folder, ask 3 sequential questions about it without re-
  attaching, confirm the system prompt keeps the attachment between
  turns.
- Click `×` on chip mid-conversation, ask the same question again,
  confirm the agent no longer references the file (and would error if it
  tried to call `read_file` on the removed path).
- Drag a file from outside, drop, confirm overlay disappears and chip
  appears.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Agent reads files it shouldn't (private docs in attached folder) | Scope guard limits to user-attached paths. User-attached implies user-blessed. We do not deep-recurse-and-read by default — agent must request each file via `read_file`, each one shows as a step. |
| Massive PDF eats the token budget in one shot | Per-type limits enforced. User sees the bill in the model picker indicator; can ask the agent for a summary instead of full read. |
| `.gitignore` parsing edge cases (negation rules, glob complexity) | Using the standard `ignore` npm package — handles spec compliance. |
| Drag-drop on different OSes (Mac/Linux) | Out of scope this iteration — same as the rest of the app, Win32-only currently. The drop handler itself uses standard HTML5 events, which are cross-platform. The `webUtils.getPathForFile` API is also Electron-cross-platform. So the drop UX should "just work" if we ever ship Mac/Linux. |
| Path with Unicode / spaces / special chars | `path.resolve` + Node FS handle these natively. Tests will include a fixture with a Unicode name. |

---

## Out of scope (deferred to v2 if real demand)

- Watch attached folders for changes (auto-refresh)
- Edit/write files via the agent
- Multi-root attached scope visualization (tree view in the chip)
- Configurable limits in the settings UI
- Path mention in user text auto-attaches
- Nested `.gitignore` recursion
- Symlink following (currently: not followed, treated as the link itself)

---

## Open questions

None — design fully nailed down via brainstorming.

---

## Estimated implementation size

- New code: ~600-800 LOC (mostly `electron/files.ts` + UI glue)
- Modified code: ~300 LOC (state, claude.ts system prompt, AttachPicker, App.tsx drop handlers)
- Tests: ~300 LOC
- New dependency: `ignore` (~6KB, devDeps + runtime)

Net: 1-2 working sessions if focused.
