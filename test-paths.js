const fs = require("fs");
const path = require("path");

// Colors to make output more readable
const colors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

function checkFileExists(filePath) {
  const fullPath = path.join("public", filePath);
  return fs.existsSync(fullPath);
}

function extractPathsFromObject(obj, parentKey = "") {
  const paths = [];

  if (Array.isArray(obj)) {
    obj.forEach((item) => {
      if (typeof item === "string") {
        paths.push(item);
      }
    });
  } else if (typeof obj === "object" && obj !== null) {
    Object.entries(obj).forEach(([key, value]) => {
      if (typeof value === "string") {
        paths.push(value);
      } else if (Array.isArray(value)) {
        value.forEach((item) => {
          if (typeof item === "string") {
            paths.push(item);
          }
        });
      } else if (typeof value === "object") {
        paths.push(...extractPathsFromObject(value, key));
      }
    });
  }

  return paths;
}

function testJsonFile(filename) {
  console.log(
    `${colors.bold}${colors.blue}Testing ${filename}...${colors.reset}`,
  );

  try {
    const jsonContent = JSON.parse(
      fs.readFileSync(`constants/data/${filename}`, "utf8"),
    );
    const allPaths = extractPathsFromObject(jsonContent);

    console.log(`Found ${allPaths.length} paths to check`);

    const results = {
      existing: [],
      missing: [],
      total: allPaths.length,
    };

    allPaths.forEach((filePath) => {
      // Clean the path - remove leading slash if present
      const cleanPath = filePath.startsWith("/")
        ? filePath.substring(1)
        : filePath;

      if (checkFileExists(cleanPath)) {
        results.existing.push(cleanPath);
      } else {
        results.missing.push(cleanPath);
      }
    });

    console.log(
      `${colors.green}✓ Existing files: ${results.existing.length}${colors.reset}`,
    );
    console.log(
      `${colors.red}✗ Missing files: ${results.missing.length}${colors.reset}`,
    );

    if (results.missing.length > 0) {
      console.log(`${colors.yellow}Missing files:${colors.reset}`);
      results.missing.forEach((file) => {
        console.log(`  ${colors.red}✗${colors.reset} ${file}`);
      });
    }

    console.log(""); // Empty line for spacing
    return results;
  } catch (error) {
    console.error(
      `${colors.red}Error reading ${filename}: ${error.message}${colors.reset}`,
    );
    return { existing: [], missing: [], total: 0, error: error.message };
  }
}

function main() {
  console.log(
    `${colors.bold}${colors.blue}🔍 Testing file paths in JSON configuration files${colors.reset}\n`,
  );

  const jsonFiles = ["colors.json", "designs.json", "products.json"];
  const allResults = {};

  jsonFiles.forEach((filename) => {
    allResults[filename] = testJsonFile(filename);
  });

  // Summary
  console.log(`${colors.bold}${colors.blue}📊 SUMMARY${colors.reset}`);
  console.log("=" * 50);

  let totalFiles = 0;
  let totalExisting = 0;
  let totalMissing = 0;

  Object.entries(allResults).forEach(([filename, results]) => {
    if (!results.error) {
      totalFiles += results.total;
      totalExisting += results.existing.length;
      totalMissing += results.missing.length;

      const percentage =
        results.total > 0
          ? ((results.existing.length / results.total) * 100).toFixed(1)
          : 0;
      console.log(
        `${filename}: ${colors.green}${results.existing.length}${colors.reset}/${results.total} (${percentage}%)`,
      );
    } else {
      console.log(
        `${filename}: ${colors.red}ERROR - ${results.error}${colors.reset}`,
      );
    }
  });

  console.log("".padEnd(50, "-"));
  const overallPercentage =
    totalFiles > 0 ? ((totalExisting / totalFiles) * 100).toFixed(1) : 0;
  console.log(
    `${colors.bold}Total: ${colors.green}${totalExisting}${colors.reset}/${totalFiles} (${overallPercentage}%)${colors.reset}`,
  );

  if (totalMissing > 0) {
    console.log(
      `${colors.red}${colors.bold}⚠️  ${totalMissing} files are missing!${colors.reset}`,
    );
    process.exit(1);
  } else {
    console.log(
      `${colors.green}${colors.bold}✅ All files exist!${colors.reset}`,
    );
  }
}

main();
