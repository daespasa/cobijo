import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { CAMINO_STOPS } from "./restaurantTargets.mjs";
import { scrapeRestaurants } from "./mapsRestaurantsScraper.mjs";
import { buildRestaurantExport, restaurantsToMarkdown } from "./restaurantFormatters.mjs";

function parseArgs(argv) {
  const args = {
    outDir: "output",
    headed: false,
    limit: 8
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out" && argv[i + 1]) {
      args.outDir = argv[i + 1];
      i += 1;
    } else if (arg === "--limit" && argv[i + 1]) {
      args.limit = Number(argv[i + 1]) || args.limit;
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
    const results = await scrapeRestaurants(browser, CAMINO_STOPS, { limit: args.limit });
    const exportData = buildRestaurantExport(results);
    const jsonPath = path.join(args.outDir, "restaurants.json");
    const mdPath = path.join(args.outDir, "restaurants.md");

    await fs.writeFile(jsonPath, JSON.stringify(exportData, null, 2), "utf8");
    await fs.writeFile(mdPath, restaurantsToMarkdown(results), "utf8");

    console.log(JSON.stringify({
      jsonPath,
      mdPath,
      stops: results.length,
      restaurants: results.reduce((sum, stop) => sum + stop.restaurants.length, 0)
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
