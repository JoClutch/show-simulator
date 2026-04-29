// util.js — small shared utilities used across UI files
//
// Loaded early in index.html so every screen can call escapeHtml without
// importing or duplicating the implementation.

// HTML-escape a string for safe interpolation into innerHTML/template literals.
//
// Use this for any user-typed value that ends up inside HTML — tribe names,
// merged-tribe name, season title, contestant names, contestant descriptions,
// season log event text. Without escaping, characters like "<" or "&" would
// be parsed as markup and break (or silently corrupt) the rendered layout.
//
// Returns "" for null / undefined so callers don't have to null-check.
function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
