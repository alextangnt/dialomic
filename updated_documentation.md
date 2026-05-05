# Dialomic Documentation Draft

## 1. Project Overview
Dialomic is a browser-based toolchain for creating and playing interactive 3D webcomics using Twine/SugarCube story logic. It combines:
- A **Player** that runs story flow and choices.
- A **Visual Editor** that lets authors edit scene composition, dialogue bubbles, narration, and passage content directly.

The core goal is to keep Twine's narrative and scripting strengths while giving authors a visual scene workflow that does not require rebuilding a custom game engine.

## 2. Problem and Motivation
Traditional visual-novel or game pipelines require heavy art and tooling overhead (scene layout, branching UI logic, state management, export/deploy). Twine solves branching narrative and scripting elegantly, but is text-first.

Dialomic started as a way to preserve Twine's simplicity while adding panelized 3D staging and comic-style presentation. Over time, the project shifted from a text-only authoring model to a hybrid visual system that lowers friction for scene authoring and iteration.

## 3. System Evolution: Text-Only to Visual Editor
### Initial Text-Based Phase
The original workflow was fully text-driven:
- Authors wrote SugarCube passages.
- Scene state lived in passage variables (primarily `$DL`).
- Dialogue bubbles used `speaker:: line` syntax.
- Choices remained native Twine links.
- A messaging bridge connected a hidden Twine runtime iframe to Dialomic's rendering layer.

This model proved the architecture: Twine drives logic, Dialomic renders panels.

### Transition to Visual Editing
As scene complexity grew (camera, model transforms, backgrounds, bubble placement, multi-panel layout), raw text editing became error-prone and harder to maintain.

The Visual Editor was introduced to:
- Select passages and edit scene state directly in 3D.
- Edit narration/speech/choices with immediate preview context.
- Keep passage text and scene preview synchronized.
- Support save/revert flows and safer mutation paths for story content.

The practical result is a hybrid workflow where authors can still inspect and edit text contracts, but day-to-day scene building happens visually.

## 4. Current Architecture (High Level)
### Player Runtime
- Entry/UI: `index.html`, `player.html`
- Orchestration: `src/layout.js`
- Panel rendering: `src/panel.js`
- Bubble engine: `src/speechBubbles.js`
- Iframe bridge: `public/messaging.js`

Flow:
1. Player loads selected story HTML into iframe.
2. Iframe emits passage events.
3. Dialomic parses passage body and `$DL` scene config.
4. Three.js panels, narration, and speech bubbles are rendered.
5. Choice/input events are forwarded back into the Twine runtime.

### Visual Editor Runtime
- Entry: `visual-editor.html`
- Main logic: `src/visualEditor.js`
- Reuses shared render/text modules (`panel`, `speechBubbles`, `passageText`).

Flow:
1. Load story HTML.
2. Parse passages into editor-selectable units.
3. Render selected passage scene in preview mode (story flow does not run).
4. Edit models/background/dialogue/narration/choices.
5. Save/export updated story HTML.

## 5. File Management Model (Contained, Browser-Local)
Dialomic now uses contained file management centered on browser-local state during editing sessions:
- Imported/active story content is staged in browser storage.
- Editor and Player share the active story context.
- Changes are applied in-memory first, then committed on explicit save/export actions.
- Default stories are discovered via `public/defaultstories/index.json` (generated from filesystem during build/dev).

This avoids requiring a server-side compiler/runtime and keeps author workflow portable for static hosting (including GitHub Pages).

## 6. Story Data Contracts
### Scene Contract (`$DL`)
Common keys include:
- `objects`
- `background`
- `skyColor`
- `camera`
- `config` (panel stacking/grid/aspect behavior)

### Dialogue Contract
- Speech lines: `speaker:: text`
- Non-speaker paragraphs: narration
- Hidden tail/system section marker: `%%%`
- Per-passage command tokens: `%%...%%`

These conventions remain compatible with text-first authoring while enabling deterministic visual parsing.

## 7. Author Workflow (Current)
1. Open Dialomic landing page.
2. Start from template/default story or upload an HTML story.
3. Open story in Player to test branching and pacing.
4. Enter Visual Editor from Player.
5. Edit passage-level scene and text content.
6. Save story, preview in Player, iterate.
7. Export final HTML.

## 8. Why the Current Design Works
- Twine remains the authoritative narrative logic engine.
- Visual tooling handles scene complexity without replacing story scripting.
- Shared parsing utilities reduce drift between Player and Editor behavior.
- Static-host friendly architecture keeps deployment simple.

## 9. Current Limitations / Open Areas
- Browser-side compilation from `.twee` is still not a first-class path in this workflow.
- Bubble layout and collision behavior is sophisticated but still an active tuning area.
- Editor/player parity needs continued regression checks as features evolve.

## 10. Next Documentation Additions (Placeholder)
- Annotated architecture diagram (Player ↔ iframe ↔ renderer ↔ editor sync)
- Before/after screenshots of text-only vs visual workflow
- Scene contract examples by complexity level
- Passage mutation safety notes and save/revert sequence diagrams
- UI walkthrough with images and interaction maps
