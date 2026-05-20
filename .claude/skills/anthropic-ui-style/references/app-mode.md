# App Mode — building product screens

Read this when building anything that lives behind a login: dashboards, settings, panels, in-product flows, internal tools, CRUD screens, chat-like layouts, list/detail views.

App mode is **calm and functional**. The UI gets out of the way so the work is the focus. Quiet color, weight-driven hierarchy, lots of breathing room, soft everything.

## The frame: sidebar + content

The dominant layout is a **persistent left sidebar** next to a **wide content area**.

**Sidebar:**
- Sits on the warm page background (`#faf9f5`), often a hair different from the content area so the two zones read as distinct without a hard line.
- Width is modest — enough for an icon + label, not a wide panel.
- Top: a small segmented control or primary nav (e.g. the Chat / Cowork / Code switch) and a prominent **"New —"** primary action (new chat, new task) as the first item.
- Then a short list of top-level destinations, each as **icon + label**, generously spaced, label in sans. Icons are thin-stroke line icons, monochrome (`#141413` or muted), never filled/colorful.
- Section groups get a tiny muted uppercase-ish label (`Recents`, `Scheduled`) in `#b0aea5`, followed by their items. Items are quiet text rows; the active row gets a subtle fill wash (`#e8e6dc`-ish), not a loud highlight.
- **Account pinned at the very bottom** — avatar + name + plan, with a small affordance. The bottom-pinned account block is a recognizable Claude pattern.
- An update/notice pill can sit just above the account block as a soft rounded card.

**Content area:**
- Centered within a comfortable max-width — it does **not** run full-bleed. It breathes inside the column with wide gutters.
- Top-left may carry a back affordance + page label (e.g. "← Customize") in sans; this is the in-app page title, kept small and functional.

## The welcome / empty state (signature moment)

This is the one place the serif display shows up in the app, and it's worth getting right because it's instantly recognizable.

- Center the content vertically-ish in the content area.
- **Orange asterisk immediately before the title**, same line or just above.
- **Title in serif display**, medium-large, e.g. a greeting ("Bom dia, [name]") or a prompt ("Vamos riscar algo da sua lista"). Personal, warm, low-key confident.
- Optional one-line muted subtitle in sans (`#b0aea5`), sometimes a quiet underlined link.
- Below it, the **primary input affordance** as a large rounded card (see input anatomy in components.md): a big rounded rectangle, near-white, hairline border, placeholder in muted gray ("Como posso ajudar você hoje?"), with controls docked inside — a `+` attach on the left, and on the right a model selector (text + chevron), a mic icon, and the **send button as a small orange rounded square** (the one spot orange earns its place).
- Under the input, a row of **suggestion chips/buttons**: pill-ish, hairline border, icon + short label, quiet. They offer next actions without shouting.

That whole stack — asterisk, serif greeting, big rounded input, quiet chips — is the canonical Claude app home. Reuse the *structure* for new empty states even when the content differs.

## Cards & list rows in-app

- **Action cards** (like the Customize page's "Connect your apps", "Create new skills"): a wide rounded rectangle, near-white fill, hairline `#e8e6dc` border, generous padding. Left: a small icon in a soft circular/rounded muted container. Right of it: a sans **title (semibold, modest)** on line one, and a **muted description** (`#b0aea5`) on line two. Stacked vertically with comfortable gaps. No shadow needed.
- **List rows** (like the task list): a small status dot (color carries meaning — e.g. blue for active), the item title in sans, a tiny inline icon if needed, and a muted timestamp/subtitle below (`há 31 minutos`). Rows are separated by space and maybe a hairline divider, not by boxing each one.
- A small **count/notice badge** (e.g. "78 novo(s)") sits inline, muted, low-contrast — informative, not alarming.

## Section headings inside the app

Use **sans semibold**, modest size — NOT serif. Inside dense product UI the serif is reserved for the single welcome moment. Settings sections like "Geral", "Sessões locais", "Aparência do código" are sans headings with muted helper text beneath. Each setting row is: a sans label, a muted multi-line description, and the control (toggle/select/input) aligned to the right.

## Modals & settings dialogs

- A large centered modal over a dim scrim. The modal itself is near-white, big radius, soft (the page behind dims rather than the modal casting a hard shadow).
- Internally it can have its **own left nav** (settings categories with line icons) + a scrollable detail pane on the right — essentially the sidebar pattern nested inside the dialog.
- Close affordance is a quiet "×" top-right.
- Controls inside: see components.md for toggle, select, input.

## App-mode tone summary

Quiet > loud. Space > density. Weight & color hierarchy > borders. One serif moment (the welcome), sans everywhere else. One orange touch (the send/primary signature), black or neutral for the rest. If it feels busy or boxed-in, you've drifted off-style.
