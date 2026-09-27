// Loads all 99-post chunk files from _data/archive/ and merges them into
// one array that Eleventy sees as the "migratedPosts" global data.
// This keeps each file under 99 posts so mobile GitHub uploads stay easy (18 files).
const fs = require("fs");
const path = require("path");

module.exports = function () {
  const archiveDir = path.join(__dirname, "archive");
  const files = fs.readdirSync(archiveDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  let all = [];
  for (const file of files) {
    const data = JSON.parse(
      fs.readFileSync(path.join(archiveDir, file), "utf-8")
    );
    all = all.concat(data);
  }
  return all;
};
