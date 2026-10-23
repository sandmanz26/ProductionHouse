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
- The wordmark is always lowercase: **serat**, IBM Plex Serif 600, tracking −2%.
- Clear space = the width of one tail (¼ of the mark height). No shadows, gradients, or outlines.

## Decorative device

**Growth rings** (*end grain*) — slightly eccentric ellipses, because real tree rings are never
concentric. Used in only two places: the welcome panel and dead-end pages (404/error). Never
behind data.

## Colour

| Name | Role | Value |
|---|---|---|
| **Teak** (*Jati*) | accent, primary action, mark | `oklch(0.5 0.115 50)` (dark: `oklch(0.74 0.11 62)`) |
| **Charcoal** (*Arang*) | ink, welcome panel, favicon | `oklch(0.2 0.008 60)` |
| **Paper** (*Kertas*) | background | `oklch(0.972 0.005 85)` |
| **Sawdust** (*Serbuk*) | highlight on charcoal | `oklch(0.83 0.06 78)` |

Red/yellow/green are for status only (late, needs attention, complete) — never decoration.

## Typography

- **IBM Plex Serif** — page titles and the wordmark. The "book" voice.
- **IBM Plex Sans** — everything you work in: forms, tables, buttons.
- **IBM Plex Mono** — numbers that get compared: document codes, qty, money. Tabular figures.

One family, three voices: tidy like a shop drawing, not like a marketing dashboard.

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
rounded corners, soft shadows everywhere, 3D illustrations. Hairlines replace shadows;
radius 4 px.
