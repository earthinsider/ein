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

  eleventyConfig.addFilter("mgidConfig", function (m, pageKey) {
    if (!m || !m.enabled || !pageKey || !m.pages || !m.pages[pageKey]) return "";
    var cfg = Object.assign(
      { loader: m.loader, hosts: m.hosts, gapMs: m.gapMs, minWords: m.minWordsBetween, page: pageKey },
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
