import { scrapeSymplaEvent } from "./src/scraper";

async function main() {
  const url = process.argv[2];

  if (!url) {
    console.error("Usage: bun run index.ts <sympla-event-url>");
    console.error("Example: bun run index.ts https://bileto.sympla.com.br/event/114143");
    process.exit(1);
  }

  // Validate URL
  if (!url.includes("sympla.com.br")) {
    console.error("Error: URL must be a Sympla event page");
    process.exit(1);
  }

  console.log(`Scraping event from: ${url}\n`);

  try {
    const event = await scrapeSymplaEvent(url);
    console.log(JSON.stringify(event, null, 2));
  } catch (error) {
    console.error("Error scraping event:", error);
    process.exit(1);
  }
}

main();
