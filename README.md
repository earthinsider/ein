# Earth Insider News — Content Site (Eleventy)

Eleventy build for **www.earthinsider.in**, migrated from the Blogger export
(Google Takeout). Same template/design as the Home site, kept as a fully
separate project folder as requested.

Could not run `npm install` / a real build in this sandbox (no network access) —
please build locally or let GitHub Actions do it on first push, and report back
anything that breaks.

## Migration results

- **1736** entries found in the Blogger export (`feed.atom`)
- **1687** live posts successfully migrated into `src/_posts/` as markdown files
  with front matter, original URLs preserved exactly (`permalink` matches the
  old Blogger path, e.g. `/2026/07/slug-name.html` — no redirects needed)
- **49** entries intentionally skipped: 14 drafts, 18 trashed posts, 16 Blogger
  Pages (About/Contact-type pages, not blog posts — see "Not yet done" below),
  1 stray comment entry
- Every post's original content HTML was kept as-is (images included, whichever
  host they were already on — some are Cloudinary, some are still on
  `blogger.googleusercontent.com`, both were left untouched rather than guessed at)
- Posts were auto-sorted into 10 categories based on their Blogger labels
  (World, United States, India, United Kingdom, Defense, Business & Markets,
  Technology, Science & Health, Energy & Commodities, Trending) — see the
  `CATEGORY_RULES` list in `migrate_news.py` (included in this zip) if you want
  to adjust the mapping and re-run it

## Category distribution (from this run)

| Category | Posts |
|---|---|
| United States | 464 |
| Defense | 227 |
| Technology | 216 |
| India | 173 |
| World | 162 |
| Business & Markets | 146 |
| United Kingdom | 135 |
| Trending | 119 |
| Science & Health | 45 |

## Not yet done / needs a decision

- **The 16 Blogger Pages** (About, Contact, Privacy, etc. — not posts) weren't
  migrated yet since they need their own layout decisions, not the post
  template. Say the word and these can be pulled in next.
- **Category pages aren't paginated yet** — United States alone has 464 posts
  on one page. Worth adding pagination within `category.njk` before going live.
- Some very old posts have Blogger's default un-slugged filenames (e.g.
  `/2025/12/blog-post.html`) — harmless, they still resolve correctly, just not
  pretty URLs. Left as-is to guarantee zero broken links.
- Ad placement markup itself isn't wired in yet — the design has the ad-slot
  zones from Home's template, but no live AdSense unit code is inserted. Share
  your ad unit IDs when ready and this gets wired in.

Everything else (structure, front-matter schema, n8n integration notes, GitHub
Pages/DNS setup) is the same as the Home site's README — see that project.
