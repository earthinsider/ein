// Reads the compiled Tailwind CSS so base.njk can inline it in <head>
// (removes one render-blocking request). Returns "" if the file is missing,
// in which case base.njk falls back to the normal <link rel="stylesheet">.
const fs = require("fs");
const path = require("path");

module.exports = function () {
  try {
    const file = path.join(__dirname, "..", "assets", "code", "css", "style.css");
    return fs.readFileSync(file, "utf8").replace(/<\/style/gi, "<\\/style").trim();
  } catch (e) {
    return "";
  }
};
