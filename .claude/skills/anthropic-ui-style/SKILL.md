---
name: anthropic-ui-style
description: Design system and screen-construction rules for building NEW interfaces in the visual language of Anthropic's Claude product (the desktop app UI and the marketing site). Use this skill whenever building, designing, restyling, or reviewing any frontend screen — dashboards, app views, settings panels, landing pages, login screens, pricing pages, forms, cards, modals, sidebars — that should look like it belongs to the Claude product family instead of looking generically AI-generated. Trigger this even when the user only says "make it look like Claude", "use the Anthropic style", "make this on-brand", "match our app", or describes a screen without naming the style explicitly but is clearly working inside an Anthropic/Claude product context. This skill defines HOW to construct screens (color usage, typography placement, spacing, borders, component anatomy, the two distinct app-vs-landing modes) — it is not for cloning specific existing screens pixel-for-pixel.
license: Internal use.
---

# Anthropic / Claude UI Style

## What this skill is for

Build **new** screens that feel native to the Claude product family. The goal is to skip the "generic AI slop" baseline and land on something that reads as deliberate, calm, and on-brand from the first draft — so the human spends time on the actual product logic, not on reformatting every screen by hand.

This is a **construction system**, not a clone kit. Do not reproduce a specific existing Claude screen pixel-for-pixel. Apply the rules below to whatever new screen is being built. Fidelity is a target, not a contract: getting ~80% of the look right on the first pass is the win, because that's what kills the "this looks AI-generated" problem.

## The single most important decision: which mode

Claude's design language splits into **two distinct modes**. Picking the wrong one is the #1 way a screen ends up looking off. Decide this first, before writing any markup.

| | **App mode** | **Landing mode** |
|---|---|---|
| What it's for | Product interfaces: dashboards, settings, chat-like views, internal tools, CRUD, panels, in-product flows | Marketing & entry: landing pages, pricing, login/signup, announcements, hero sections |
| Personality | Calm, functional, quiet. Gets out of the way. | Editorial, confident, spacious. Makes a statement. |
| Headings | Sans-serif, modest size, weight-driven hierarchy | **Large serif display** — this is the signature move |
| Density | Comfortable but efficient; sidebar + content | Generous; lots of negative space, few elements per viewport |
| Primary button | Soft, rounded, low-key (often pill or large radius) | **Solid black, rectangular** with slight rounding |
| Default background | Warm off-white (`#faf9f5`) | Warm off-white (`#faf9f5`), same paper |

If the request is ambiguous, default to **app mode** for anything that lives behind a login and **landing mode** for anything a logged-out visitor sees.

Full per-mode construction recipes live in the reference files — read the one you need:
- Building a product screen → read `references/app-mode.md`
- Building a marketing/entry screen → read `references/landing-mode.md`
- Need a specific component's anatomy (button, card, input, toggle, modal, sidebar, badge) → read `references/components.md`

Read the relevant reference file before constructing — the SKILL body below is the shared foundation that both modes inherit.

---

## Foundation (shared by both modes)

### Color

These hex values are the official Anthropic brand palette. Use them exactly.

```
Dark        #141413   primary text, dark surfaces, solid black buttons
Light       #faf9f5   the default page background — a WARM off-white, never pure #fff
Mid Gray    #b0aea5   secondary text, muted labels, placeholder, inactive icons
Light Gray  #e8e6dc   hairline borders, dividers, subtle fills, hover wash
Orange      #d97757   THE brand accent — the asterisk mark, send button, focus, active accent
Blue        #6a9bcc   secondary accent — links/info inside product, status dots
Green       #788c5d   tertiary accent — success, occasional category color
```

**Rules that make it look right, not just on-palette:**

- **The background is warm, never sterile white.** Default surfaces are `#faf9f5`. Pure `#ffffff` reads as cold and immediately "not Claude." If you need a surface to pop above the page (a card, a modal, an input), go *whiter* than the page (`#ffffff` or very close) so it lifts off the warm paper — the contrast is what reads as premium. So: page = warm off-white, raised surfaces = near-white. Never the reverse.
- **Orange is precious. Spend it sparingly.** It is an accent, not a theme color. In a whole screen it should appear in only one or two places: the brand asterisk, the primary send/submit affordance, a focus ring, an active-state dot. A screen washed in orange looks wrong. When in doubt, the primary action button is **black** (`#141413`), not orange — orange is reserved for the product's signature touches.
- **Hierarchy comes from gray, not from lines.** Primary text `#141413`, secondary/supporting text `#b0aea5`. Most visual separation is done by color and spacing, not by drawing borders everywhere. Reach for `#e8e6dc` borders only when a true edge is needed (an input, a card boundary, a divider) — and keep them hairline.
- **Blue and green are situational.** Blue for in-product links/info and status; green for success/categories. They're not part of the everyday surface palette — don't sprinkle them decoratively.
- **Dark mode** flips the paper to near-black (`#141413` family) with light text (`#faf9f5`), and the same accent rules hold — orange stays the one accent. The settings screen shows both Light and Dark coexisting; if building dark, keep the warm character (warm near-blacks, not blue-blacks).

### Typography

Two type personalities, used in specific places. This is where most "off-brand" mistakes happen, so be deliberate.

**Serif display** — the editorial voice.
- This is the signature of the brand: large serif headings ("Pense rápido", "Pricing", "Bom dia, Dereck", "Vamos riscar algo da sua lista", "Explore the latest releases").
- Use it for hero titles, page titles, welcome headers, and big statements.
- It is a **display serif** (think Tiempos / Copernicus / a high-contrast modern serif). The brand kit names **Lora** as the documented heading font with **Georgia** as fallback — use that stack when you need installed-font reliability, but know the real product uses a tighter, higher-contrast display serif, so if a true display serif is available it'll read closer to the product. Set it large, with tight-ish line-height and normal/medium weight (not bold-heavy).
- Suggested stack: `"Tiempos Headline", "Lora", Georgia, "Times New Roman", serif`.

**Sans-serif** — the functional voice.
- All UI chrome: buttons, labels, nav items, menu items, table text, form fields, badges, body copy inside the app, supporting paragraphs on landing pages.
- The brand kit documents **Poppins** for headings in artifact/document contexts (Arial fallback); for live UI the product uses a clean grotesk/neo-grotesk sans. Use a neutral, slightly warm sans.
- Suggested stack: `"Styrene", "Poppins", "Inter", -apple-system, system-ui, Arial, sans-serif`.

**Where each goes:**
- Landing hero / page title → serif display, large.
- App welcome header (the greeting line) → serif display, medium-large.
- Section headings inside the app (e.g. "Geral", "Sessões locais") → sans, semibold, modest size. *Not* serif. Inside dense product UI the serif is reserved for the one welcome moment, not every section.
- Everything interactive or dense → sans.
- Monospace (code, font-name fields, terminal) → a real mono stack; the product even lets users set a custom code font. Use `"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace`.

**Rule of thumb:** if a piece of text is something you *read as a statement*, it's serif. If it's something you *act on or scan*, it's sans.

### Shape, border & elevation

- **Generous rounding.** Corners are soft throughout. Inputs and cards use a large radius; buttons in the app lean very round (pill or near-pill); landing buttons are rectangular with a gentle radius. Nothing is sharp-cornered.
- **Hairline borders.** Borders are 1px, `#e8e6dc`, low-contrast. They define an edge, they don't decorate. A card is a near-white fill on warm paper with a hairline border and a large radius — that's the whole recipe.
- **Elevation is barely-there.** Shadows are extremely soft and diffuse, or absent. Separation comes mostly from the fill-contrast (raised surface lighter than page) + the hairline border + spacing. Avoid heavy drop shadows; they read as un-Claude immediately.
- **Focus state** uses the orange accent (a soft ring/border), not the default browser blue.

### Spacing & layout

- **Air is a feature.** Both modes use a lot of negative space. When unsure, add more padding, not less. Cramped UI is the fastest tell of "generic."
- Use a consistent spacing rhythm (a 4px base scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64). Pad cards and sections on the larger end.
- **App layout:** persistent left sidebar (navigation, recents, account pinned at the bottom) + a wide content area that is often centered with comfortable max-width. Content rarely runs full-bleed edge-to-edge; it breathes inside the column.
- **Landing layout:** centered or split hero, strong vertical rhythm, few elements per section, big type carrying the page. Navbar is minimal — wordmark left, sparse links center/right, one or two buttons (a quiet "Contact sales" outline + a solid black "Try Claude").

### The brand asterisk

The Anthropic/Claude mark — the orange multi-spoke asterisk/sunburst — is a recurring construction element, not just a logo in the corner. It appears as the **opening gesture before a display heading** on welcome/empty states ("✷ Bom dia, Dereck", "✷ Vamos riscar algo da sua lista") and as the wordmark lockup on landing navbars. When building a welcome or hero moment, placing the orange asterisk immediately before/above the seric title is an authentic, recognizable move. Keep it the orange accent; don't recolor it.

---

## Construction checklist (run this before calling a screen done)

Use this to catch the common "looks AI-generated" mistakes:

1. **Mode picked on purpose?** App vs landing chosen, and the heading style matches (sans for app chrome / serif display for statements).
2. **Background warm?** Page is `#faf9f5`-family, not pure white. Raised surfaces are lighter than the page, not darker.
3. **Orange rationed?** Accent appears in only one or two intentional places. Primary button is black unless there's a reason.
4. **Hierarchy by color + space, not lines?** Borders are hairline `#e8e6dc` and only where a real edge exists. No box-everything.
5. **Corners soft, shadows barely there?** Large radii, hairline borders, minimal elevation.
6. **Enough air?** Padding generous, sections breathe, nothing cramped.
7. **Serif used as a statement, not everywhere?** Display serif on the title moment; sans on everything functional.
8. **Asterisk present on welcome/hero?** If it's an empty state or hero, the orange mark anchors the title.

If all eight pass, it'll read as Claude. If the screen still feels generic, the usual culprit is #2 (cold white background) or #3 (too much accent / colored primary button).

---

## When to read what

- Start here (this body) for any screen — it's the shared foundation.
- Then read **one** mode file: `references/app-mode.md` or `references/landing-mode.md`.
- Pull `references/components.md` when you need the exact anatomy of a specific UI piece.
- These are guidelines tuned to economize time and get close, not a spec sheet — when real design tokens or component code from the team become available, prefer those values over the estimates here.
