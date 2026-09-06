# M2 frame inspection — 2026-09-06

Captured by Chromium Playwright on Windows/Node 24.18.0 during slice 3 from
`a61031b` plus the reviewed frame diff (committed with this evidence).
Images are actual renders, not mockups. Widths are CSS pixels, height 900 px;
full-page captures include below-fold controls. Tablet/phone tests enable touch.

- [Desktop game](ui/game-1280.png), [desktop abort](ui/result-1280.png).
- [768 px tablet game](ui/game-768.png), [tablet abort](ui/result-768.png).
- [360 px phone game](ui/game-360.png), [phone abort](ui/result-360.png).
- [80-move phone history](ui/long-history-360.png), with keyboard-scrolled history,
  visible focus, a dead Red army, readable score ledger and current Green panel.

Visual inspection confirmed the complete cross board remains within the viewport,
all four cards identify direction, owner, control, points and state, and supporting
panels stack without horizontal overflow. Desktop height can require page scrolling;
phone history and controls intentionally sit below the board. Dense phone board
squares are approximately 24 px; browser zoom remains enabled. Surrounding buttons
and labelled controls have at least 44 px height. Original Unicode pieces have
owner initials and dead markers, dark outlines and accessible full piece names.

Manual CUA keyboard observation on the running 360×800 local app: Tab reached
Red g2, Enter selected it, arrows reached g4, legal-destination text was exposed
in the accessibility tree, Enter played the move, focus remained visible and
Blue became the mover. Automated checks additionally cover keyboard-only setup,
Escape clearing, all four rotations, Save/Resume, cancel/confirm, focused results,
non-current check, score awards and active/walking King elimination announcements.
The independent reviewer inspected the phone render and probed narrow cards with
106.67 points and Walking King. Both live-announcement findings were resolved.

These are browser emulation, actual rendered-image inspection and accessibility-tree
observations. No physical-device, screen-reader or comprehensive WCAG audit was
performed. Full histories are not live regions; concise turn/action/selection
updates are polite. The stylesheet preserves visible focus and disables motion
under reduced-motion preference. Complete-game result captures and production
responsiveness measurements follow in slice 4.
