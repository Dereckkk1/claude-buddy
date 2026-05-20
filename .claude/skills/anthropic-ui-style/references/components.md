# Component anatomy

Read this when you need the construction recipe for a specific UI piece. These are starting values tuned to look right and save time — adjust to context; they're estimates, not a locked spec. Colors are exact (brand palette); pixel values are sensible defaults.

Palette reference: Dark `#141413` · Light/paper `#faf9f5` · Mid gray `#b0aea5` · Light gray `#e8e6dc` · Orange `#d97757` · Blue `#6a9bcc` · Green `#788c5d`.

## Buttons

**App primary (signature send/submit):** small rounded-square, orange `#d97757` fill, white/light glyph (e.g. an up-arrow). This is the one orange action. Radius ~10–12px, compact.

**App neutral / suggestion chip:** pill or near-pill (radius ~999px or ~14px), transparent/near-white fill, hairline `#e8e6dc` border, dark sans label, optional small leading line icon. Quiet. Used for the suggestion row and most in-app secondary actions.

**Landing primary:** solid black `#141413`, white text, rectangular with gentle radius (~8px), comfortable horizontal padding (~20–28px), sans medium weight. No shadow.

**Landing/secondary outline:** transparent fill on paper, hairline `#e8e6dc`–`#141413`-ish border, dark text, same radius family. Optional leading glyph.

Hover: nudge the fill one step (neutral buttons get a faint `#e8e6dc` wash; black button lightens slightly to a warm near-black). Keep transitions short and subtle.

## Inputs

**Text input:** near-white fill (lighter than the page), hairline `#e8e6dc` border, large radius (~12px), comfortable padding (~12–14px vertical), muted `#b0aea5` placeholder, dark `#141413` typed text, sans. Focus = soft orange `#d97757` ring/border, not browser blue.

**The big prompt/composer card (app):** a large rounded rectangle (radius ~16–20px), near-white, hairline border, generous internal padding. Placeholder line at top in muted gray. A control row docked at the bottom edge inside the card: left a `+` attach (line icon, muted), right a cluster of [model selector: text + chevron] · [mic line icon] · [orange send square]. The composer reads as one calm surface, not a noisy toolbar.

**Search input (sidebar/settings):** smaller version of the text input, often with a leading magnifier line icon and muted placeholder ("Procurar", "Search").

## Cards

**Generic card:** near-white fill on the warm page, hairline `#e8e6dc` border, large radius (~14–16px), generous padding (~20–24px), little or no shadow. Separation comes from fill-contrast + border + space.

**Action/list card (app):** card + left icon in a soft rounded/circular muted container + a sans semibold title line + a muted `#b0aea5` description line. Vertically stacked when listed, with comfortable gaps between cards.

**Plan card (landing pricing):** card + top line glyph + serif plan name + muted tagline + big sans price + muted billing note + full-width black button + hairline divider + checklist (small check glyph + sans label per row, with a bold "Everything in X, plus:" lead).

## Toggles (switch)

Rounded pill track with a circular knob. **On = a saturated blue** (the settings screen shows a clear blue active state) with knob to the right; off = muted `#b0aea5`/`#e8e6dc` track, knob left. Smooth short transition. Toggles sit right-aligned in a settings row opposite the label+description.

## Selects / dropdowns

Rectangular-rounded field (radius ~10–12px), near-white, hairline border, sans label text, a trailing chevron. The model picker in the composer is a lighter-weight inline variant: just text + chevron, no full border box. Menus open as a near-white rounded panel with hairline border, soft elevation, quiet rows with a subtle hover wash.

## Badges / tags / status

- **Status dot:** small filled circle; color carries meaning (blue `#6a9bcc` active/info, green `#788c5d` success/done, orange for attention). Pairs with a label.
- **Soft badge/pill:** muted fill (`#e8e6dc`) with dark or muted text, small radius — e.g. a "Beta" tag, a "Desativado" state, a "78 novo(s)" count. Low-contrast and informative, never alarming.

## Sidebar items

Row = [thin line icon, monochrome] + [sans label], generously padded, comfortable vertical rhythm. Active row = subtle `#e8e6dc` fill wash + slightly stronger text, NOT a loud colored highlight. Group headers = tiny muted `#b0aea5` label above a cluster of rows.

## Modal / dialog

Centered panel, near-white, large radius, over a dim scrim (the backdrop dims; the modal doesn't rely on a hard shadow). Quiet "×" top-right. Can nest its own left nav + scrollable detail pane for settings-style content.

## Icons

Thin-stroke line icons, monochrome (`#141413` or muted `#b0aea5`), consistent stroke weight, never filled-and-colorful. Small motifs (a plant/branch on plan cards, a triangle by a section title) are simple line geometry. The orange asterisk/sunburst is the one branded mark and stays orange.

## Code / monospace surfaces

Monospace stack for code, terminal, and font-name fields. Light theme = near-white with warm-tinted syntax; dark theme = warm near-black (`#141413` family, not blue-black) with light text. Diff rows use soft red/green washes. The product even exposes a custom code-font setting, so treat the mono surface as a first-class, themeable element.

## Quick default token set (starting point)

```
radius:   sm 8px · md 12px · lg 16px · xl 20px · pill 999px
space:    4 · 8 · 12 · 16 · 24 · 32 · 48 · 64
border:   1px solid #e8e6dc (hairline)
text:     primary #141413 · secondary #b0aea5
surface:  page #faf9f5 · raised #ffffff (near-white, lighter than page)
accent:   orange #d97757 (rationed) · info blue #6a9bcc · success green #788c5d
shadow:   none-to-faint; prefer fill-contrast + hairline border + space
```

Treat these as a fast on-ramp, not law — swap in real team tokens whenever they exist.
