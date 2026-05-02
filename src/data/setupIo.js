// setupIo.js — JSON file import/export for season setups (v4.5)
//
// Browser-only file IO. No server, no upload, no cloud. Export uses a
// temporary download link; import uses an injected file picker. Both flows
// validate the JSON against the schema before any state change.
//
// ════════════════════════════════════════════════════════════════════════════
// JSON FORMAT — Survivor Simulator Season Setup
// ════════════════════════════════════════════════════════════════════════════
//
// An exported file is a single JSON object matching the SavedSetup typedef
// (see schema.js). Top level:
//
//   {
//     "schemaVersion": 1,
//     "id":            "setup-1729123456789-abc12",
//     "setupName":     "Brutal Mode",
//     "savedAt":       "2026-04-29T12:34:56.789Z",
//     "format":        "json",
//     "template":      { ... }
//   }
//
// The `template` field is the full SeasonTemplate:
//
//   meta:        { id, name, description?, isDefault? }
//   tribes:      { initial: [{ label, name, color, size }, ...] }
//   swap:        { enabled, triggerCount | null }
//   merge:       { triggerCount, tribeName, tribeColor }
//   jury:        { startTrigger: "atMerge"|"custom", customStartCount: number|null }
//   finalTribal: { finalists }
//   idols:       { enabled }
//   pacing:      { campActionsPerRound }
//   cast:        [{ id, name,
//                    physicalChallengeSkill, mentalChallengeSkill, enduranceChallengeSkill,
//                    challenge,           // v9.1: legacy/derived; optional in new files
//                    social, strategy,
//                    description?, tribe? }, ...]
//
// Stat fields (the three challenge sub-skills, social, strategy) are
// integers 1–10. Legacy `challenge` is also accepted in 1–10 range; when
// new files omit it, it's recomputed at apply-template time from the
// three sub-skills (round of average).
// Colors are CSS color strings (e.g. "#e87c2b").
// Tribe labels are "A" or "B" in the current architecture.
//
// ── Compatibility ────────────────────────────────────────────────────────────
//
// schemaVersion is checked on import. Files NEWER than the current build's
// SCHEMA_VERSION are rejected with a friendly error. Files at or below the
// current SCHEMA_VERSION are accepted — schemas are additive, so older files
// are forward-compatible.
//
// ── Error handling ───────────────────────────────────────────────────────────
//
// All entry points return result objects rather than throwing:
//   { ok: true,  setup: SavedSetup }
//   { ok: false, errors: string[] }
// The caller is responsible for surfacing errors to the user.
//
// ════════════════════════════════════════════════════════════════════════════

// ── Export ────────────────────────────────────────────────────────────────────

// Triggers a JSON file download for the given saved setup.
// Filename is derived from setupName (sanitized) with a `.season.json` suffix.
//
// Uses a Blob + object URL + temporary anchor element — the standard
// browser-side download trick. Works in every modern browser without
// permissions or APIs beyond what HTML5 provides.
function downloadSavedSetup(setup) {
  const json = JSON.stringify(setup, null, 2);
  const filename = _setupFilename(setup);
  _downloadAsFile(filename, json, "application/json");
}

// ── Import ────────────────────────────────────────────────────────────────────

// Opens a file picker, reads the chosen file, parses + validates as a
// SavedSetup. Invokes callback(result) with:
//   { ok: true,  setup: SavedSetup }
//   { ok: false, errors: string[] }
//
// "No file selected" (cancelled picker) reports as an error so the UI can
// either ignore (most cases) or distinguish from real failures.
function pickAndImportSetup(callback) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) {
      callback({ ok: false, errors: ["No file selected."] });
      return;
    }

    const reader = new FileReader();
    reader.onload  = () => callback(parseSavedSetupJson(reader.result));
    reader.onerror = () => callback({
      ok: false,
      errors: [`Could not read file "${file.name}".`],
    });
    reader.readAsText(file);
  });

  input.click();
}

// Pure function: parses a JSON string and validates it as a SavedSetup.
// Exposed separately from pickAndImportSetup so future callers can handle
// pasted JSON (textarea import) without re-invoking the file picker.
//
// Returns:
//   { ok: true,  setup: SavedSetup }
//   { ok: false, errors: string[] }
function parseSavedSetupJson(jsonText) {
  if (typeof jsonText !== "string" || jsonText.trim() === "") {
    return { ok: false, errors: ["File is empty."] };
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return { ok: false, errors: [`Not valid JSON: ${e.message}`] };
  }

  const errors = validateSavedSetup(parsed);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, setup: parsed };
}

// ── Internals ─────────────────────────────────────────────────────────────────

// Builds a filesystem-safe filename from a SavedSetup. Strips characters
// that some operating systems reject, collapses whitespace, caps length.
// Falls back to "season" if nothing usable remains.
function _setupFilename(setup) {
  const raw = setup.setupName ?? setup.template?.meta?.name ?? "season";
  const safe = String(raw)
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .slice(0, 50)
    .replace(/\s+/g, "-") || "season";
  return `${safe}.season.json`;
}

// Triggers a browser-native download for the given content. The object URL
// is revoked shortly after the click to free memory; the timeout buys the
// browser time to start the download before we revoke (some need a tick).
function _downloadAsFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // Some browsers won't honor click() on a detached node.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
