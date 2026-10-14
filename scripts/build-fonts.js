// Self-hosts the site fonts so the browser does not need fonts.googleapis.com / fonts.gstatic.com.
//
//  * Inter + Manrope: same Google Fonts CSS the site used before, but every woff2 file is
//    downloaded and served from /assets/fonts/ (all unicode-range subsets are kept, so
//    rendering is identical; the browser still only downloads the subsets a page needs).
//  * Material Symbols: instead of the full 317 KB icon font, only the icons the site really
//    uses are requested (Google's icon_names subsetting), ~5-10 KB.
//
// Output: src/assets/fonts/*.woff2 and src/_data/fonts.json (read by base.njk).
// If ANYTHING fails, fonts.json gets { "local": false } and base.njk falls back to the
// original Google Fonts <link> tags, so a failed fetch can never break the site.
//
// Run from the repo root:  node scripts/build-fonts.js

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");
const FONT_DIR = path.join(SRC, "assets", "fonts");
const DATA_FILE = path.join(SRC, "_data", "fonts.json");
const URL_PATH = "/assets/fonts/";

// Modern Chrome UA => Google returns woff2 files.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const TEXT_CSS_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@700;800&display=swap";
const ICON_BASE =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0";

// Icons that are set by JavaScript at runtime (not visible as <span> text in the templates).
const JS_ICONS = ["light_mode", "dark_mode", "bookmark", "bookmark_border"];
// Fallback used by templates: {{ cat.icon or "label" }}
const DEFAULT_ICONS = ["label"];

// Standard Material Symbols class (used only if Google's response does not include it).
const DEFAULT_ICON_CLASS =
  ".material-symbols-outlined{font-family:'Material Symbols Outlined';font-weight:normal;font-style:normal;font-size:24px;line-height:1;letter-spacing:normal;text-transform:none;display:inline-block;white-space:nowrap;word-wrap:normal;direction:ltr;-webkit-font-feature-settings:'liga';-webkit-font-smoothing:antialiased}";

// ---------- icon discovery ----------

const ICON_SPAN_RE = /material-symbols-outlined[^>]*>\s*([a-z][a-z0-9_]*)\s*</g;

function walk(dir, exts, skip, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (skip(p)) continue;
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, exts, skip, out);
    else if (exts.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

function collectJsonIcons(value, set) {
  if (Array.isArray(value)) return value.forEach((v) => collectJsonIcons(v, set));
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "icon" && typeof v === "string" && /^[a-z][a-z0-9_]*$/.test(v)) set.add(v);
      else collectJsonIcons(v, set);
    }
  }
}

function collectIcons() {
  const set = new Set([...JS_ICONS, ...DEFAULT_ICONS]);
  const skip = (p) => p.includes(path.join("_data", "archive")) || p.includes("node_modules");

  for (const f of walk(SRC, [".njk", ".html", ".md"], skip, [])) {
    const text = fs.readFileSync(f, "utf8");
    let m;
    ICON_SPAN_RE.lastIndex = 0;
    while ((m = ICON_SPAN_RE.exec(text))) set.add(m[1]);
  }
  for (const f of walk(path.join(SRC, "_data"), [".json"], skip, [])) {
    try {
      collectJsonIcons(JSON.parse(fs.readFileSync(f, "utf8")), set);
    } catch (e) {
      /* ignore unreadable data file */
    }
  }
  return Array.from(set);
}

// ---------- Google CSS parsing ----------

function parseFaces(css) {
  const faces = [];
  const re = /(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const body = m[2];
    const get = (prop) => {
      const r = new RegExp(prop + "\\s*:\\s*([^;]+);?", "i").exec(body);
      return r ? r[1].trim() : "";
    };
    const url = /url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(body);
    if (!url) continue;
    faces.push({
      subset: m[1] || "",
      family: get("font-family").replace(/^['"]|['"]$/g, ""),
      style: get("font-style") || "normal",
      weight: get("font-weight") || "400",
      range: get("unicode-range"),
      url: url[1],
    });
  }
  return faces;
}

function parseIconClass(css) {
  const m = /\.material-symbols-outlined\s*\{[^}]*\}/.exec(css);
  return m ? m[0].replace(/\s+/g, " ") : "";
}

// ---------- network ----------

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
  return res.text();
}

async function fetchFile(url, dest) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 200) throw new Error("suspiciously small font file for " + url);
      fs.writeFileSync(dest, buf);
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function fileNameFor(face) {
  const slug = face.family.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const hash = crypto.createHash("md5").update(face.url).digest("hex").slice(0, 8);
  return slug + "-" + (face.subset || "all") + "-" + hash + ".woff2";
}

async function localise(faces, display, files) {
  const css = [];
  for (const f of faces) {
    const name = fileNameFor(f);
    if (!files.has(name)) {
      await fetchFile(f.url, path.join(FONT_DIR, name));
      files.add(name);
    }
    css.push(
      "@font-face{font-family:'" + f.family + "';font-style:" + f.style + ";font-weight:" + f.weight +
        ";font-display:" + display + ";src:url(" + URL_PATH + name + ") format('woff2')" +
        (f.range ? ";unicode-range:" + f.range : "") + "}"
    );
    f.localName = name;
  }
  return css.join("");
}

async function fetchIconCss(icons) {
  const orders = [
    icons.slice().sort(), // plain alphabetical
    icons.slice().sort((a, b) => a.localeCompare(b)), // locale alphabetical (fallback)
  ];
  let lastErr;
  for (const list of orders) {
    try {
      return await fetchText(ICON_BASE + "&icon_names=" + list.join(",") + "&display=block");
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function main() {
  fs.mkdirSync(FONT_DIR, { recursive: true });
  const files = new Set();

  // 1) Inter + Manrope
  const textFaces = parseFaces(await fetchText(TEXT_CSS_URL));
  const hasLatin = (fam) => textFaces.some((f) => f.family === fam && f.subset === "latin");
  if (!hasLatin("Inter") || !hasLatin("Manrope")) {
    throw new Error("Google text-font CSS did not contain the expected latin faces");
  }
  const textCss = await localise(textFaces, "swap", files);
  const preload = [];
  for (const f of textFaces) {
    if (f.subset === "latin" && !preload.includes(URL_PATH + f.localName)) preload.push(URL_PATH + f.localName);
  }

  // 2) Material Symbols subset
  const icons = collectIcons().sort();
  const iconResponse = await fetchIconCss(icons);
  const iconFaces = parseFaces(iconResponse);
  if (iconFaces.length < 1) throw new Error("Google icon CSS contained no @font-face");
  const iconFace = iconFaces[0];
  iconFace.family = "Material Symbols Outlined";
  const iconCss = await localise([iconFace], "block", files);
  preload.push(URL_PATH + iconFace.localName);
  const iconClass = parseIconClass(iconResponse) || DEFAULT_ICON_CLASS;

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({ local: true, css: textCss + iconCss + iconClass, preload, icons }, null, 2)
  );
  console.log(
    "[fonts] self-hosted OK: " + files.size + " font files, " + icons.length + " icons, " + preload.length + " preloads"
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.warn("[fonts] FAILED, keeping Google Fonts links: " + err.message);
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({ local: false, error: String(err.message) }, null, 2));
  });
}

module.exports = { parseFaces, parseIconClass, collectIcons, fileNameFor };
