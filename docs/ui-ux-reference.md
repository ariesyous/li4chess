# Four-player game UI/UX reference

**Status:** product reference, 2026-09-06. This records the maintainer's
preference for a board-first, information-dense four-player experience informed
by live Chess.com FFA use. It is a design direction for li4chess, not a request
to copy Chess.com's branding, artwork, wording, assets, or implementation.
Rules remain governed by the versioned li4chess ruleset, not by presentation.

## Evidence and boundaries

The observations come from the current Chess.com FFA / Modern analysis editor
and [a completed game replay](https://www.chess.com/variants/4-player-chess/game/108222020),
viewed on 2026-09-06. They describe interaction patterns seen in a real
four-player game:

- the cross board is the dominant visual object;
- four colour-coded player panels sit around it and combine player identity,
  score, clock, and state;
- a compact header states time control, game mode, and rating range;
- move navigation, chat, and final placement/rating feedback stay available
  without displacing the board; and
- the mobile view retains the board, edge player panels, compact header, and
  bottom replay controls rather than becoming a desktop page shrunk to fit.

These observations are **reference evidence**, not compatibility evidence for
rules. The target must use li4chess naming, original visual design, accessible
text alternatives, and its own components. Do not carry over account data,
avatars, ratings, or opponent identities from reference games.

## Product principles

1. **Board first.** On a playable viewport, the board remains the largest
   element. Supporting information must be scannable during a move, not hidden
   behind a modal or a page transition.
2. **All four players legible at once.** Every seat has a stable panel near its
   board edge. A panel carries a colour name/icon, display name or CPU label,
   score, clock when applicable, and an explicit state such as *to move*,
   *checked*, *dead*, *disconnected*, or *finished*.
3. **State changes have two signals.** Colour may reinforce a player/state but
   never be its only indicator. Use text, shape/icon, and announced status for
   current turn, check, dead armies, timer danger, and result placement.
4. **The game tells its story.** A concise move list and replay controls make
   checks, promotions, castles, resignations, timeouts, score awards, and
   terminal reasons inspectable. The score ledger must explain rule-derived
   deltas rather than display a mysterious total.
5. **Fast play, calm recovery.** During live play, primary inputs are board
   selection/move and essential controls. On terminal states, replace urgency
   with a clear result panel, final placements, exact score awards, replay, and
   play-again/exit choices.
6. **One responsive information architecture.** Desktop can place secondary
   details beside the board; narrow screens stack or collapse them below it.
   The board must not be horizontally clipped, and touch controls need visible
   labels and practical targets.

## Li4chess experience blueprint

| Area | Desired li4chess experience | Implemented M2 frame (2026-09-06) | Delivery / acceptance evidence |
| --- | --- | --- | --- |
| Game frame | Original, low-distraction shell with a compact game header: ruleset label, mode, time control, and connection/game state. | Original header states Standard FFA, Hotseat/Human + CPU/Four CPUs, Local, and No clock. | Desktop and 360 px-wide captures retain a legible header and full board. |
| Player panels | Four stable edge panels with colour name/icon, human/CPU label, score, clock, status, and turn emphasis. Dead players remain visible with an explicit state. | Four directional cards follow rotation and show color name, human/CPU level, points, and To move/Check/Dead army/Walking King/Finished. | At every game phase, each seat can be identified without relying on hue; active, checked, dead, and CPU states are announced. |
| Board feedback | Maintain legal-target, last-move, check, selected-piece, and turn feedback; make score/event feedback close to the board without obstructing squares. | Legal targets, last move/check, rotation, arrow-key navigation and Enter/Space selection have textual accessible names. | Keyboard and touch tests verify a player can discover the mover, a legal destination, and a check without parsing move history. |
| History and replay | Colour-labelled, compact move list with event tokens and Back/Next controls; later support shareable, versioned replay. | Scrollable color-named move, action and ordered award lists; validated replay-v2 import/export and local resume. Navigation is later work. | A completed replay renders the same state from a versioned event log; event text explains timeout/resign/award reasons. |
| Clocks and urgency | When M3 clocks exist, show each seat's authoritative remaining time and an accessible low-time warning. Never derive time locally for network play. | No game clocks. | Clock values follow authoritative server events; warning has text/icon and can be tested without colour. |
| Result | First-class terminal panel: placement, final points, per-event awards, terminal reason, rating change when relevant, and next actions. | M1 standard FFA final points, shared placements, claims and distinct aborts; focused result heading and ordered awards. No ratings. | Results reflect the accepted FFA ruleset/replay and make aborts distinct from completed games. |
| Mobile | Board-led layout; edge panels may condense but remain readable, with history/chat/replay in a bottom sheet or below-board region. | Board-first desktop/sidebar and tablet/phone stacking; 360/768/1280 browser captures and touch/keyboard acceptance tests. | Tested at 360, 768, and desktop widths with no clipped board, inaccessible controls, or colour-only state. |

## Interaction details worth preserving

- Keep player panels anchored to their board direction, even if board rotation
  is enabled. Rotation must not make a player's identity or orientation
  ambiguous.
- Show score deltas at the time they are awarded and retain them in the event
  ledger. This is especially important for FFA checks, mate/stalemate, dead
  pieces, and final live-king awards.
- Make non-move events visually distinct in history: timeout, resignation,
  disconnect forfeit, abort, and rules-driven random king action need a reason
  plus a normal readable move notation.
- Use safe confirmations for consequential actions such as resign and abort;
  never let a small-screen mis-tap immediately end a game.
- Separate social chat from game-critical event notices and make chat optional.
  FFA fair-play rules prohibit coordinating moves, so system messaging should
  not encourage collusion.
- Treat the score/clock panel as an accessible live region with restrained,
  non-spammy announcements. Provide reduced-motion behavior for turn changes,
  timers, and score deltas.

## Phased work and guardrails

1. **M1/M1-03 complete:** standard FFA results, ordered awards, dead armies,
   walking Kings and replay-v2 are implemented. Historical house rules are not
   the current baseline.
2. **M2:** redesign the local game frame and player panels using original
   components. Add responsive, keyboard, and accessibility-tree acceptance coverage
   while preserving local CPU/hotseat play.
3. **M3:** add authoritative clocks, connection/reconnect states, resignation,
   timeout, and replay playback to the same game frame.
4. **M4:** add account-aware rating/placement presentation and matchmaking
   transitions. Anonymous casual play must not imply a rating result.

Before implementation, turn the desired rows above into a small component
inventory and visual acceptance captures. Validate browser-visible changes with
the repository's lint, unit, build, and Playwright checks, then add manual
desktop/mobile/accessibility observations. Do not copy the reference client's
trade dress or claim exact Chess.com UX parity.

## M2 validation scope

The original frame uses text and shape in addition to seat color, restrained
turn/selection status regions, visible focus and a reduced-motion stylesheet.
Native dialogs confirm reset, resign, timeout and Claim Win. The dense 14-square
board stays full-width on phones and retains browser zoom; surrounding controls
have at least 44 px height. Actual rendered captures and manual keyboard/AX
observations are browser emulation, not physical-device or screen-reader tests.
Clocks, connection/account/rating/chat states and full replay navigation remain
outside M2. Calibration and complete-game evidence are tracked in
[M2 acceptance](m2-acceptance.md).
