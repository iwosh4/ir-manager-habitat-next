# DYNAMIC UI SYSTEM — “active, not animated”

Motion only communicates **STATE, CHANGE, PROGRESS, ATTENTION, SUCCESS or TIME**. No decorative loops, no casino,
no HUD, no blinking, no fast marquee. Everything is event-driven and built from CSS `transform` / `opacity`
(no layout-animating properties, no video, no canvas loops).

## Timing tokens

| Token | Value | Used for |
|---|---|---|
| `--t-fast` | 130 ms | hover lift (1–2 px), press scale, colour changes |
| `--t` | 190 ms | menus, tabs, sub-navigation, panel/sheet entry, module transition |
| `--t-state` | 300 ms | completion, KPI value change, toast entry, live strip step, indicator glide |
| Easing | `cubic-bezier(.16,1,.3,1)` (out), `cubic-bezier(.2,.7,.2,1)` (standard) | |

`html[data-motion=off]` (Profil → *Omezit pohyb*, or Nastavení → Živý pás & pohyb) and `prefers-reduced-motion: reduce`
set all tokens to ~0 and stop every animation; the UI stays fully functional (instant state changes).

## 1. Live information strip (`js/ui/live.js`)

* **Content** is derived from live data every time it changes: overdue work (grouped), overdue health follow-up,
  today's progress, next care (grouped ×N, with supplement), incubation windows, next misting, low stock, next cycle step,
  last record, upcoming expo.
* **Priority:** messages marked `prio` (overdue, health) are placed first. When a *new* priority message appears (e.g. an
  item just became overdue) the strip jumps to it and plays one 900 ms amber wash (`.flash`) — once.
* **Step:** one message at a time, every **6.5 s**, vertical slide 300 ms (`enter` / `leave` classes). Never a marquee.
* **Pause:** on hover, on keyboard focus inside the strip, while the tab is hidden (`visibilitychange`), and via the pause
  button. Paused state stops the live-dot pulse.
* **Controls:** previous / pause / next, counter `3/11`, save state on the right.
* **Settings:** show/hide strip, auto-step on/off, priority on/off. Reduced motion → no auto-step (manual only).
* The only continuous element is the small live dot ring (2.8 s, opacity/scale, paused when the strip is paused).

## 2. Header animations

| Element | Trigger | Motion |
|---|---|---|
| Rychlý záznam | hover | lift 1 px, icon tilt −8° (190 ms) |
| QR | scanner open | `.scanning`: amber scan line sweeps inside the button; stops on close |
| Hlas | listening | `.listening`: glyph replaced by a 5-bar waveform; `.processing`: spinner (only while parsing) |
| Search | hover / focus | amber edge + 3 px focus ring |
| Bell | new notification (count grows) | one 700 ms swing + two ring pulses, then still; `.urgent` keeps a static amber ring and amber badge |
| Profile avatar dot | save state | saving → rotating arc, saved → one green ping, offline → grey |
| Caiman | hover | slight zoom + brighter eye glint (1.2 s ease-out) |

## 3. Notification / voice / QR / save states

* **Notifications** — categories PO TERMÍNU, ZDRAVÍ, INKUBACE, REPRODUKCE, SKLAD, UBIKACE; overdue items carry direct
  actions `NAKRMIT` / `HOTOVO` + `ODLOŽIT`; completing slides the card out (220 ms) before the list updates.
* **Voice** — idle → listening (orb pulse + waveform, header button mirrors the state) → processing (spinner 450 ms) →
  result card with *Zapsat*. The microphone never starts on its own; if SpeechRecognition is unavailable the same states
  are shown briefly and typed input is offered.
* **QR** — viewfinder with corner marks and a slow scan line (2 s alternate); on a match the frame turns green and the
  line stops.
* **Save / sync** — every mutation shows *Ukládám…* (rotating sync glyph) then *Uloženo* with a cloud-check; offline shows
  *Offline · ukládá se v zařízení*. Mirrored on the avatar dot and in the live strip.

## 4. Completion motion (≈ 280 ms) → toast

1. The row gets `.is-done`: card border and background turn green, the time node scales 1.35× green, the button fills green.
2. After 280 ms the record is written, the row folds (opacity .35, 6 px right) and the list re-renders.
3. Toast **“Zapsáno: krmení · ZPĚT”** slides up (300 ms), with a 6 s progress hairline; *Zpět* restores the snapshot
   (records, rotation step and stock deduction all revert). `Ctrl Z` does the same.
Group completion (*HOTOVO VŠE*) uses the same motion on the group card.

## 5. NOW marker

Orange pill **TEĎ · 10:40** with a gradient line across the axis. The dot inside breathes slowly (3.2 s, opacity/scale).
The page re-renders every 60 s so the marker and overdue states follow real time. On the planner the view scrolls to TEĎ
on entry; on mobile the sticky *TEĎ* button scrolls there.

## 6. KPI motion

KPI values animate **only when the value changes** (the previous value is remembered per card): 700 ms slide-up in amber,
settling to white. Static values never move. Hover: 2 px lift, photo zoom 1.04 (600 ms).

## 7. Activity motion

*Poslední aktivity* is grouped (Poslední hodina / Dnes / Včera / Dříve). Records created since the widget last rendered
get `.is-new`: a 2.4 s amber wash with a 3 px left edge that fades out once.

## 8. Widget motion

Edit mode switches cards to dashed outlines (no wobble). Dragging uses a ghost card and FLIP reordering (200 ms).
A newly added widget scrolls into view and shows a single 1.2 s amber outline. Collapse/expand is instant.

## 9. Navigation & module transitions

The amber sidebar indicator glides to the active item (`translateY`, 300 ms). Sub-navigation fades in (190 ms). On module
change the page content enters with 6 px rise + fade (300 ms, 30 ms stagger for the first three blocks). Tabs draw their
underline from the centre.

## 10. Toasts

Max three, bottom centre (above the mobile nav). Types ok / info / warn, optional *Zpět* and one action (*Upravit*,
*Otevřít*), 6 s auto-dismiss with a visible progress line.

## 11. Performance

* Only `transform` and `opacity` are animated (plus colour on hover). No `width`/`height`/`top` animation — bars use
  `scaleX` with `transform-origin: left`.
* In an idle state the only running animations are the live dot ring and the NOW dot (both tiny, compositor-only), and the
  incubation “window open” glow while a hatch window is actually open.
* Rendering is string templating per route; re-renders are coalesced with `requestAnimationFrame`.
* No video, no WebGL, no animation libraries; fonts are subset WOFF2 with `font-display: swap`.

## 12. Reduced motion

`prefers-reduced-motion: reduce` or the in-app switch: durations → ~0, all keyframe animations run once instantly,
the live strip stops auto-stepping, the completion delay is skipped, smooth scrolling becomes instant.
