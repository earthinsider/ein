// ---- Cloudinary responsive images ----
// Set to false to go back to the original full-size image URLs everywhere.
const CLOUDINARY_TRANSFORM = true;
const CLOUDINARY_WIDTHS = [400, 800, 1200];

function cloudinaryParts(url) {
  var m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/.exec(url || "");
  if (!m) return null;
  var first = m[2].split("/")[0];
  // URL already carries a transformation (e.g. f_auto,q_auto/..., w_400/...): leave it alone
  if (first.indexOf(",") !== -1 || /^[a-z]{1,3}_/.test(first)) return null;
  return m;
}

function cloudinaryUrl(url, width) {
  var m = CLOUDINARY_TRANSFORM && cloudinaryParts(url);
  if (!m) return url;
  return m[1] + "f_auto,q_auto,c_limit,w_" + width + "/" + m[2];
}

function ogUrl(url, w, h) {
  var m = cloudinaryParts(url);
  if (!m) return url;
  return m[1] + "f_jpg,q_auto,c_fill,g_auto,w_" + w + ",h_" + h + "/" + m[2];
}

function leadSlug(u) {
  return (u || "").split("?")[0].replace(/\/+$/, "").split("/").pop().replace(/\.[a-z0-9]+$/i, "");
}

// Removes the first block of an article body when it is only the featured image again
// (Blogger/n8n content starts with the same photo that the post template already shows as the hero).
function dedupeLead(html, image) {
  if (!html || !image) return html;
  var slug = leadSlug(image);
  if (!slug) return html;
  var m = /^\s*<(div|p)\b[^>]*>[\s\S]*?<\/\1>/i.exec(html);
  if (!m) return html;
  var blk = m[0];
  if (blk.indexOf("<img") < 0 || blk.indexOf(slug) < 0) return html;
  if (blk.replace(/<[^>]+>/g, "").trim().length > 40) return html;
  return html.slice(m[0].length).replace(/^\s+/, "");
}

function ldJson(ctx, site) {
  if (!ctx || !site) return "";
  var base = site.url, abs = function (p) { return /^https?:/.test(p) ? p : base + p; };
  var out = [];
  if (ctx.kind === "post") {
    var d = ctx.date ? new Date(ctx.date) : null;
    var iso = d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : undefined;
    var url = base + (ctx.url || "");
    var imgs = [];
    if (ctx.image) imgs = cloudinaryParts(ctx.image)
      ? [ogUrl(ctx.image, 1280, 720), ogUrl(ctx.image, 1200, 900), ogUrl(ctx.image, 1200, 1200)]
      : [ctx.image];
    var art = {
      "@context": "https://schema.org", "@type": "NewsArticle",
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      headline: String(ctx.title || "").slice(0, 110),
      description: ctx.description || site.description,
      image: imgs.length ? imgs : undefined,
      datePublished: iso, dateModified: iso,
      author: { "@type": "Organization", name: "Earth Insider Team", url: base + "/" },
      publisher: { "@type": "Organization", name: site.name, logo: { "@type": "ImageObject", url: abs(site.logo) } },
      articleSection: ctx.categoryLabel || undefined, inLanguage: "en"
    };
    out.push(art);
    var items = [{ "@type": "ListItem", position: 1, name: "Home", item: base + "/" }];
    if (ctx.categorySlug) items.push({ "@type": "ListItem", position: 2, name: ctx.categoryLabel || ctx.categorySlug, item: base + "/category/" + ctx.categorySlug + "/" });
    items.push({ "@type": "ListItem", position: items.length + 1, name: art.headline, item: url });
    out.push({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items });
  } else if (ctx.kind === "home") {
    var same = site.social ? Object.keys(site.social).map(function (k) { return site.social[k]; }).filter(function (v) { return typeof v === "string" && /^https?:/.test(v); }) : [];
    out.push({ "@context": "https://schema.org", "@type": "WebSite", name: site.name, url: base + "/", inLanguage: "en" });
    out.push({ "@context": "https://schema.org", "@type": "Organization", name: site.name, url: base + "/", logo: abs(site.logo), sameAs: same.length ? same : undefined });
  } else return "";
  return JSON.stringify(out).replace(/</g, "\\u003c");
}

// Real publish date of a collection item.
// Paginated migrated posts get page.date = build time (eleventyComputed can't set it),
// so read the date field from the post's own data (YYYY-MM-DD from the archive JSON,
// or the front-matter date of .md posts). Falls back to Eleventy's page date.
function realDate(item) {
  var raw = item && item.data && item.data.date;
  if (raw) {
    var d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(item && item.date);
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/llms.txt");
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/CNAME");
  eleventyConfig.addPassthroughCopy("src/ads.txt");
  eleventyConfig.addPassthroughCopy("src/robots.txt");

  // New posts added by n8n automation (individual .md files)
  eleventyConfig.addCollection("newPosts", function (collectionApi) {
    return collectionApi.getFilteredByGlob("src/_posts/*.md");
  });

  // All posts: migrated (from JSON via migrated-post.njk pagination) + new .md posts
  // addAllPagesToCollections: true on migrated-post.njk means Eleventy already adds them;
  // this collection merges both sources sorted by REAL date, oldest first (ascending).
  // Templates call "| reverse" to get newest first, so keep ascending here.
  eleventyConfig.addCollection("posts", function (collectionApi) {
    const all = collectionApi.getAll().filter(function (item) {
      return (
        item.data.categorySlug !== undefined &&
        item.data.title !== undefined
      );
    });
    return all.sort(function (a, b) {
      return realDate(a) - realDate(b);
    });
  });

  eleventyConfig.addFilter("cldOg", function (url, w, h) { return ogUrl(url, w, h); });
  eleventyConfig.addFilter("dedupeLead", function (html, image) { return dedupeLead(html, image); });
  eleventyConfig.addFilter("ldJson", function (ctx, site) { return ldJson(ctx, site); });

  eleventyConfig.addFilter("mgidConfig", function (m, pageKey) {
    if (!m || !m.enabled || !pageKey || !m.pages || !m.pages[pageKey]) return "";
    var cfg = Object.assign(
      { loader: m.loader, hosts: m.hosts, gapMs: m.gapMs, startAfterMs: m.startAfterMs, minWords: m.minWordsBetween, page: pageKey },
      m.pages[pageKey]
    );
    return JSON.stringify(cfg).replace(/</g, "\\u003c");
  });

  eleventyConfig.addFilter("cld", function (url, width) {
    return cloudinaryUrl(url, width);
  });

  eleventyConfig.addFilter("cldSet", function (url) {
    if (!CLOUDINARY_TRANSFORM || !cloudinaryParts(url)) return "";
    return CLOUDINARY_WIDTHS.map(function (w) {
      return cloudinaryUrl(url, w) + " " + w + "w";
    }).join(", ");
  });

  eleventyConfig.addFilter("postDate", function (item) {
    return realDate(item);
  });

  eleventyConfig.addFilter("utcDate", function (dateObj) {
    return new Date(dateObj).toUTCString();
  });

  eleventyConfig.addFilter("dateDisplay", function (dateObj) {
    if (!dateObj) return "";
    var d = new Date(dateObj);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  });

  eleventyConfig.addFilter("isoDate", function (dateObj) {
    if (!dateObj) return "";
    return new Date(dateObj).toISOString().split("T")[0];
  });

  eleventyConfig.addFilter("readingTime", function (content) {
    var text = (content || "").toString().replace(/<[^>]+>/g, " ");
    var words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
  });

  eleventyConfig.addFilter("limit", function (arr, n) {
    return (arr || []).slice(0, n);
  });

  eleventyConfig.addFilter("plus1", function (n) {
    return (n || 0) + 1;
  });

  eleventyConfig.addGlobalData("allSubCategories", function () {
    const categories = require("./src/_data/categories.json");
    const flat = [];
    for (const main of categories) {
      for (const sub of main.subs) {
        flat.push({
          mainSlug: main.slug,
          mainLabel: main.label,
          subSlug: sub.slug,
          subLabel: sub.label,
        });
      }
    }
    return flat;
  });

  eleventyConfig.addFilter("whereMainCategory", function (posts, slug) {
    return (posts || []).filter((p) => p.data.categorySlug === slug);
  });

  eleventyConfig.addFilter("whereSubCategory", function (posts, slug) {
    return (posts || []).filter((p) => p.data.subCategorySlug === slug);
  });

  eleventyConfig.addFilter("whereCategory", function (posts, slug) {
    return (posts || []).filter(function (p) {
      return (
        p.data.categorySlug === slug ||
        p.data.subCategorySlug === slug ||
        (p.data.categories || []).indexOf(slug) !== -1
      );
    });
  });

  eleventyConfig.addShortcode("year", function () {
    return new Date().getFullYear().toString();
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html"],
  };
};
