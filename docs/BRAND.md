# Serat — brand identity

**Serat** is Indonesian for wood grain. The grain decides where wood may be cut; this workbook
decides where every offcut — and its price — goes.

## Promise

> **Every offcut has a price.**

One sentence that is only true of this product: offcuts have their own lot, size, and unit cost;
job cost is locked when the job is closed. The line appears on the welcome screen, in the metadata,
and in the sidebar footer — nowhere else, so it does not turn into an empty slogan.

*Descriptor*: **The production ledger for furniture workshops.** We call ourselves a "workbook"
or "ledger", not a "platform" or "solution". Our users are workshop owners, production heads, and
warehouse admins in Jepara, Klaten, Cirebon, Pasuruan — not software buyers.

## Mark (logo)

A **dovetail** joint seen from the face: two boards that only lock because every cut was
measured. The top board is full teak, the bottom board 38% — so the joint still reads at
16 px. Straight lines only: it survives as a favicon, in black-and-white print, and as a stamp.

- Code: `src/brand/Logo.tsx` (`LogoMark`, `Wordmark`), favicon `public/favicon.svg`.
- The wordmark is always lowercase: **serat**, IBM Plex Sans 600, tracking −2%.
- Clear space = the width of one tail (¼ of the mark height). No shadows, gradients, or outlines.

## Decorative device

**Growth rings** (*end grain*) — slightly eccentric ellipses, because real tree rings are never
concentric. Used in only two places: the welcome panel and dead-end pages (404/error). Never
behind data.

## Colour

v4.1 restyle, following tasteskill's app-screen rules ("achromatic ledger"): the chrome holds no
colour, so colour always means something.

| Name | Role | Value |
|---|---|---|
| **Stone** | page ground (one tone off white, low chroma, not cream) | `#f4f3f1` (dark: `#0b0b0b`) |
| **Ink** | text, and the primary action as a near-black button | `#0a0a0a` / `#141414` (dark: white) |
| **Grey** | secondary text, readable at 4.5:1 | `#5f5f5f` (dark: `#b4b4b4`) |
| **Teak** (*Jati*) | the mark, and the main data element on a screen (job progress, material flows) | `#964c1c` (dark: `#d08a52`) |
| **Charcoal** (*Arang*) | welcome panel, favicon | `oklch(0.2 0.008 60)` |

Surfaces are white cards with a 1px `#e6e6e6` border, no shadow; 8 px card corners, 6 px controls.
Red/amber/green are for status only (late, needs attention, complete), as text that reads at
4.5:1 or as pale pill pairs — never decoration.

## Typography

- **IBM Plex Sans** — everything: titles (24/600), forms, tables, buttons, the wordmark.
- **IBM Plex Mono** — every figure that gets compared: document codes, qty, money, in tabular
  figures, so money reads as a ledger's columns. This is the one deliberate second face.

Labels are sentence case at 12px, never small uppercase. No index numbers (01 / 02) as decoration.

## Voice

- Plain workshop English: *issue materials*, *offcut*, *dismantle*, *hand over*, *overdue*.
  Short sentences.
- Sentence case for labels, buttons, and headings: "New work order", not "New Work Order".
- Name the number and the document: "RN-0001 is 2 days late", not "There is a delay on a
  rental transaction".
- Error messages say **what to do next**: "Location Showroom still holds stock — move it first."
- Empty states say where the data will come from, not just "No data yet".
- No emoji, no exclamation marks, no "✨ AI", and no *seamless/powerful/revolutionary*.

## Deliberately left out

Purple-blue gradients, frosted-glass cards (*glassmorphism*), icons inside coloured circles, large
rounded corners, soft shadows everywhere, 3D illustrations, cream grounds, coloured chrome. Borders
replace shadows; radius 8 px for cards, 6 px for controls.
