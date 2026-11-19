import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { TARGET_URLS } from "./targets.mjs";
import { buildChatbotExport, toMarkdown } from "./formatters.mjs";
import { scrapeAll } from "./scraper.mjs";

function parseArgs(argv) {
  const args = {
    outDir: "output",
    headed: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out" && argv[i + 1]) {
      args.outDir = argv[i + 1];
      i += 1;
    } else if (arg === "--headed") {
      args.headed = true;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await fs.mkdir(args.outDir, { recursive: true });

  const browser = await chromium.launch({
    headless: !args.headed
  });

  try {
    const results = await scrapeAll(browser, TARGET_URLS);
    const exportData = buildChatbotExport(results);
    const jsonPath = path.join(args.outDir, "listings.json");
    const mdPath = path.join(args.outDir, "listings.md");

    await fs.writeFile(jsonPath, JSON.stringify(exportData, null, 2), "utf8");
    await fs.writeFile(mdPath, toMarkdown(results), "utf8");

    console.log(JSON.stringify({ jsonPath, mdPath, count: results.length, schema: exportData.schema_version }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
