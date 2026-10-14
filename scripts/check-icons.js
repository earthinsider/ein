// Post-build safety check: warns if any page uses an icon name that is not in the
// self-hosted icon subset (it would show as plain text). Never fails the build.
//   node scripts/check-icons.js
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "src", "_data", "fonts.json");
const SITE = path.join(ROOT, "_site");

if (!fs.existsSync(DATA)) process.exit(0);
const fonts = JSON.parse(fs.readFileSync(DATA, "utf8"));
if (!fonts.local) {
  console.log("[icons] self-hosted fonts not active, nothing to check");
  process.exit(0);
}
const known = new Set(fonts.icons);
const missing = new Map();
const RE = /material-symbols-outlined[^>]*>\s*([a-z][a-z0-9_]*)\s*</g;

(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (p.endsWith(".html")) {
      const text = fs.readFileSync(p, "utf8");
      let m;
      RE.lastIndex = 0;
      while ((m = RE.exec(text))) if (!known.has(m[1]) && !missing.has(m[1])) missing.set(m[1], p);
    }
  }
})(SITE);

if (missing.size) {
  console.warn("[icons] WARNING: icons missing from the subset (add them to JS_ICONS in scripts/build-fonts.js):");
  for (const [n, p] of missing) console.warn("   " + n + "  (first seen in " + path.relative(ROOT, p) + ")");
} else {
  console.log("[icons] all icons used in _site are in the subset");
}
