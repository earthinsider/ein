module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/CNAME");
  eleventyConfig.addPassthroughCopy("src/ads.txt");
  eleventyConfig.addPassthroughCopy("src/robots.txt");

  eleventyConfig.addCollection("posts", function (collectionApi) {
    return collectionApi.getFilteredByGlob("src/_posts/*.md");
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

