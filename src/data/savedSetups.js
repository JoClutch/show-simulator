// savedSetups.js — localStorage-backed save/load for SeasonTemplates (v4.4)
//
// Persists user-built season setups in this browser only. No server, no
// account — everything lives under a single localStorage key. Each saved
// entry is a SavedSetup (per schema.js): a wrapper with id + setupName +
// timestamp + the full template.
//
// ── Why localStorage ─────────────────────────────────────────────────────────
//
// Simplest reliable browser-local storage for plain JSON. Synchronous reads
// keep the API straightforward (the saved-setups screen reads on render).
// Quota is generous (5–10 MB across browsers); each setup is ~5–20 KB, so
// hundreds of saves fit before any pressure.
//
// All entry points handle storage being unavailable (private browsing, blocked
// cookies, exceeded quota) gracefully — they return failure objects rather
// than throwing, so the UI can show a friendly message.
//
// ── Data isolation ───────────────────────────────────────────────────────────
//
// Saved setups are PURE CONFIG (templates). They never carry runtime state —
// no current round, no relationships, no idol holders. Loading a setup goes
// through applyTemplate() which is the same path used by the in-memory
// editors, so the runtime is rebuilt cleanly via main.js's onSavedSetupsDone.

// Single localStorage key for the saved-setups list.
// Stored value: a JSON-stringified array of SavedSetup objects.
const SAVED_SETUPS_KEY = "survivorSim.savedSetups";

// ── Public API ────────────────────────────────────────────────────────────────

// Returns the list of valid saved setups, sorted newest first.
// Invalid entries (corrupt JSON, schema mismatch) are silently dropped from
// the returned list — but kept in storage so a future build with an updated
// schema could read them. Use clearAllSetups() to actually wipe.
function listSavedSetups() {
  const raw = _readRawList();
  const valid = raw.filter(s => validateSavedSetup(s).length === 0);
  return valid.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

// Saves a template under the given setupName. setupName is optional; if
// omitted or blank, falls back to template.meta.name.
//
// Returns:
//   { ok: true,  setup: SavedSetup }     on success
//   { ok: false, errors: string[] }      on failure (validation or storage)
function saveSetup(template, setupName) {
  if (!isStorageAvailable()) {
    return { ok: false, errors: ["browser storage is unavailable in this environment"] };
  }

  const finalName = (typeof setupName === "string" && setupName.trim() !== "")
    ? setupName.trim()
    : (template?.meta?.name ?? "Untitled");

  const setup = {
    schemaVersion: SCHEMA_VERSION,
    id:            _generateSetupId(),
    setupName:     finalName,
    savedAt:       new Date().toISOString(),
    format:        "json",
    template,
  };

  const errors = validateSavedSetup(setup);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const existing = _readRawList();
  existing.push(setup);

  if (!_writeRawList(existing)) {
    return { ok: false, errors: ["failed to write to storage (quota exceeded?)"] };
  }

  return { ok: true, setup };
}

// Removes a saved setup by id. Returns true on success, false if the id
// wasn't found or storage write failed.
function deleteSetup(id) {
  if (!isStorageAvailable()) return false;
  const existing = _readRawList();
  const filtered = existing.filter(s => s.id !== id);
  if (filtered.length === existing.length) return false;   // not found
  return _writeRawList(filtered);
}

// Returns the SavedSetup with the given id, or null if not found / invalid.
// Use this then pass setup.template into applyTemplate.
function loadSetup(id) {
  return listSavedSetups().find(s => s.id === id) ?? null;
}

// Returns true if localStorage is available in this environment.
// Tested with a write/remove of a sentinel key — covers private-mode browsers
// and policies that throw on writes.
function isStorageAvailable() {
  try {
    const t = "__survivorSim_storage_test__";
    localStorage.setItem(t, "1");
    localStorage.removeItem(t);
    return true;
  } catch (_) {
    return false;
  }
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _readRawList() {
  if (!isStorageAvailable()) return [];
  try {
    const raw = localStorage.getItem(SAVED_SETUPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("[savedSetups] read failed:", e);
    return [];
  }
}

function _writeRawList(setups) {
  try {
    localStorage.setItem(SAVED_SETUPS_KEY, JSON.stringify(setups));
    return true;
  } catch (e) {
    console.error("[savedSetups] write failed:", e);
    return false;
  }
}

// Generates a reasonably unique id. Collisions are virtually impossible for
// human-paced saves. crypto.randomUUID() would be cleaner but isn't available
// in older browsers — this works everywhere.
function _generateSetupId() {
  const r = Math.floor(Math.random() * 100000).toString(36);
  return `setup-${Date.now()}-${r}`;
}
