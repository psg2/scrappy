import { scrapeSymplaEvent } from "./src/scraper-browserbase";

async function main() {
  const url = process.argv[2];

  if (!url) {
    console.error("Usage: bun run index-browserbase.ts <sympla-event-url>");
    console.error(
      "Example: bun run index-browserbase.ts https://bileto.sympla.com.br/event/114143"
    );
    console.error("\nRequired environment variables:");
    console.error("  BROWSERBASE_API_KEY     - Your Browserbase API key");
    console.error("  BROWSERBASE_PROJECT_ID  - Your Browserbase project ID");
    process.exit(1);
  }

  if (!url.includes("sympla.com.br")) {
    console.error("Error: URL must be a Sympla event page");
    process.exit(1);
  }

  try {
    const event = await scrapeSymplaEvent(url);
    console.log("\n" + JSON.stringify(event, null, 2));
  } catch (error) {
    console.error("Error scraping event:", error);
    process.exit(1);
  }
}

main();
