# AGENTS.md

This file is a working project memory for Codex/LLM agents.
Update it whenever architecture, data contracts, or workflows change.

## Project
Dialomic: a Twine/SugarCube player + visual scene editor that renders 3D comic-style panels (Three.js), narration, and speech bubbles.

## Core Runtime Architecture

### Player (play mode)
- Entry page: `index.html`
- Main runtime: `src/layout.js`
- 3D panel runtime: `src/panel.js`
- Bubble layout/physics: `src/speechBubbles.js`
- Background catalog/configs: `src/backgrounds.js`
- Story content usually loaded into iframe from `public/defaultstories/*.html`
- Default story list is generated from disk via `public/defaultstories/index.json`
- Messaging bridge script: `public/messaging.js`

Flow:
1. Player loads story HTML into iframe (default or imported).
2. Iframe posts passage/init messages.
3. `layout.js` parses passage text + `$DL` scene vars.
4. `panel.js` renders Three.js panel(s), narration, and bubbles.
5. User choice/input events are posted back to iframe.

### Visual Editor
- Entry page: `visual-editor.html`
- Main runtime: `src/visualEditor.js`
- Reuses `Panel` from `src/panel.js`
- Uses same bubble engine (`src/speechBubbles.js`) with editor-specific behavior flags

Flow:
1. Load source story HTML/Twee.
2. Parse passages into selectable entries.
3. Render selected passage as non-running scene preview.
4. Edit scene/model/speech/narration/choices.
5. Save/export updated story HTML.

## Shared Text/Data Utilities
- Shared helper module: `src/passageText.js`
- Contains shared passage/body operations used by player and editor:
  - HTML stripping/parsing
  - paragraph splitting
  - scene-object map building
  - hidden-tail split/compose (`%%%` convention)
  - speaker-line cleanup by model

## Data Contracts & Conventions

### Scene variable contract
- Scene data is read from `$DL` in SugarCube passages.
- Common keys:
  - `objects`
  - `background`
  - `skyColor`
  - `camera`
  - `config` (panel/grid/aspect options)

### Speech lines
- Speaker lines use: `speaker:: text`
- In editor, deleting a model should also delete its speech lines.

### Hidden command tail
- `%%% ...` is treated as hidden/system tail in passage body processing.

### Panel tokens
- `%%...%%` tokens are used for per-passage Dialomic commands.

## Current Engineering Direction
- Reduce duplication between player/editor parsing logic (ongoing).
- Keep player behavior stable while editor evolves.
- Centralize body mutation paths to prevent desync between:
  - passage text
  - scene preview
  - draft/editor buffers

## Known Critical Files
- `src/layout.js` — player orchestration + iframe bridge
- `src/panel.js` — panel rendering lifecycle
- `src/speechBubbles.js` — bubble positioning, tails, stacking, editor/player variants
- `src/visualEditor.js` — editor workflows and save/export logic
- `src/passageText.js` — shared body/text helpers
- `public/messaging.js` — iframe-side messaging relay

## Build/Run
- Build: `npm run build`
- Dev: `npm run dev`
- Default story manifest generator: `scripts/generate-default-stories-manifest.js`
  - Runs automatically in `predev` and `prebuild`

## Agent Update Checklist
When you make changes, update this file with:
1. New/changed modules and ownership.
2. New data contracts or token syntax.
3. Behavior changes that affect player vs editor parity.
4. Migration notes (if old formats/paths break).
5. Any temporary hacks/toggles that future agents must remove.

## Notes for Future Agents
- Prefer shared helpers over local duplicate parsing code.
- Avoid introducing player-side regressions while working on editor UX.
- Verify passage-body mutations do not reorder/duplicate unrelated content.
- Keep speech/model linkage deterministic (speaker key normalization is important).
