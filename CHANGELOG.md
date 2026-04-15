# Changelog
This file tracks user-visible features.

## 2026-04-15
- Added panel layout config support via `DL.config` (`panels`, `rows`, `cols`) with stack capacity handling.
- Added per-passage layout command tokens: `%%solo%%`, `%%resets%%`, `%%rows=N%%`, `%%cols=N%%`, and `%%panels=...%%`.
- Documented panel config behavior and command tokens in `README.md`.

## 2026-04-14
- Added iframe input mirroring: user input fields and submit buttons now render above choice buttons and sync back to the story iframe.
- Added shot control language: `DL.shot` supports cinematic shot tokens to auto-frame the camera around named objects.
