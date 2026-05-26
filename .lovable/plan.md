## Plan: Category support for variables

### 1. `VariablePanel.tsx` — Manage category
- Add `category` to `Row` interface and to all `select` queries.
- Display category as a colored badge on each row card (next to variable name).
- Add a top filter bar (segmented buttons): **All / Webhook / Python API / Uncategorized**, filters `rows` before pagination.
- In `VariableDialog` (used for both Add and Edit):
  - Add a `category` state with a `Select` field. Options: `webhook`, `python-api`, and `(none)` → stored as `null`.
  - Include `category` in both insert and update payloads.

### 2. `OcrPanel.tsx` — Filter dropdown by engine
- Map engine → required category:
  - `webhook` → `"webhook"`
  - `selfhosted` → `"python-api"`
  - `lovable` → no variable needed (unchanged)
- In `loadVariables`, also select `category` and add `.eq("category", requiredCategory)` filter when engine requires one.
- Re-run `loadVariables` whenever `engine` changes (add `engine` to dependency / effect).
- Reset `selectedVarId` on engine switch (already reset via `reset()` in engine toggle — confirm).
- Update empty-state placeholder text to say "No variables for this engine — add one with category X".
- Add `category` to `VarOption` interface.

### 3. No DB migration
The `category` column already exists on `variable` (text, nullable). No schema change needed.

### Out of scope
- No changes to OCR engines, server functions, or upload logic.
- No changes to history table or design tokens.
