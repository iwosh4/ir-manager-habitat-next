# UX DECISIONS

Each decision: what, why, and the trade-off accepted.

1. **Labelled primary action in the header.** Current icon-only buttons were ambiguous. *Rychlý záznam* is now the one
   labelled orange action; QR and Hlas keep short labels. Trade-off: slightly wider header; labels collapse to icons
   below 1180 px.
2. **Header order fixed by the brief:** Rychlý záznam · QR · Hlas · Hledat · Oznámení · Profil · kajman. No recent records
   or tasks in the header — they belong to the dashboard and planner, where they can be acted on.
3. **Clock removed from the header.** Time is shown where it has meaning (TEĎ marker, relative times, live strip).
4. **Live strip, one message at a time.** A ticker that scrolls text is hard to read and distracting; stepping every 6.5 s
   with pause on hover/focus/hidden tab keeps it glanceable. Priority messages go first; users can switch it off.
5. **Orange = priority.** Completion is green, secondary graphite, tertiary text. When everything is orange nothing is.
6. **Verbs on buttons.** HOTOVO / NAKRMENO / KONTROLA / PODÁNO / ODLOŽIT / VYNECHAT / DETAIL instead of ✓ / +1 / ⊘.
   Type-specific verbs confirm *what* is being recorded.
7. **Undo instead of confirm.** Frequent actions never open “Are you sure?”; they complete with motion and a toast with
   ZPĚT (snapshot undo, also Ctrl Z). Confirmation dialogs are kept only for destructive resets.
8. **Group repetitive care.** “KRMENÍ ×8 · HOTOVO VŠE · ROZBALIT” — one tap for the usual case, expand to mark a refusal
   or select a subset. Open and finished work never share a card.
9. **One engine, many views.** Planner, dashboard widget, animal profile, notifications, voice and quick record all call
   the same actions layer — a feeding recorded anywhere advances the vitamin rotation and deducts stock identically.
10. **Honest biology.** Expected phases (pre-lay shed, clutch, hatching) are shown as **ranges** with their basis
    (“18–25 dní po ovulaci”), hatched; only observed events are solid. No fake exact dates.
11. **Extended schedule is optional.** The planner stays a calm list of work; the biological Gantt view is one toggle away
    (ROZŠÍŘENÝ HARMONOGRAM) for breeders who want it.
12. **Latin name first.** Species cards, profile titles and search results lead with the Latin name; Czech name and code
    follow. Codes are monospace amber so they are scannable.
13. **Profile action strip.** The most common interactions with one animal are one tap from its card; NAKRMIT completes
    the *scheduled* feeding (with supplement and stock) — if none is due it opens Quick Record pre-filled.
14. **Quick Record in three steps** (Co → Pro koho → Uložit). “Na řadě” pre-filters animals that are actually due; tapping a
    row records immediately, the checkbox enables multi-select; advanced overrides are behind a disclosure.
15. **Health: fast first, detail on demand.** Animal · observation · severity · save. Diagnosis, vet, follow-up and
    attachments sit behind *Více možností*.
16. **Calm default dashboard; customisation is opt-in.** A strong default layout for everyone; *UPRAVIT PŘEHLED* reveals
    the tools. Customisation is bounded (12-column grid, 5 sizes, 6 accents, 5 frames) so a user cannot make it chaotic.
17. **Personal widgets are documents.** Shopping lists, notes, checklists and links are stored separately from layout and
    from operational data — resetting demo data or undoing a feeding never deletes a note.
18. **Sklad = stock + list side by side.** The shopping list is where the need is noticed; low stock goes to the list in one
    tap and remembers supplier and price.
19. **Mobile: thumb zone.** Bottom nav with a raised “+”, sheets instead of modals, sticky planner controls, 40–56 px targets,
    16 px inputs. *Více* is an accordion — opening a section never reloads the page.
20. **Habitat Studio is an entry, not a module rewrite.** A premium card and page link to the studio; the studio itself is
    untouched and will live at `/app-manager/habitat-studio/`.
21. **Accessibility.** Visible focus rings, `aria-live` for the strip and toasts, `aria-pressed/expanded` on toggles,
    keyboard shortcuts, reduced-motion support, contrast of text on graphite ≥ 4.5 : 1 for body text.
22. **What was not taken from Concept B:** its visual density, dashboard look, colour-coded navigation and HUD-like
    styling. Only workflows (timeline, grouping, quick record, widgets, tools) were reused.
