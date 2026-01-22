import { SymplaEventScraper } from "./sympla-scraper.js";
import { ScrapeResult, SymplaEvent } from "./types.js";

function printEventSummary(event: SymplaEvent): void {
  console.log("\n" + "=".repeat(60));
  console.log("EVENT DETAILS");
  console.log("=".repeat(60));

  console.log(`\nTitle: ${event.title}`);
  console.log(`URL: ${event.url}`);

  if (event.dateRange.start || event.dateRange.end) {
    console.log(
      `\nDate Range: ${event.dateRange.start} - ${event.dateRange.end}`
    );
  }

  if (event.schedule.length > 0) {
    console.log("\nSchedule:");
    event.schedule.forEach((s) => console.log(`  - ${s}`));
  }

  if (event.venue.name) {
    console.log("\nVenue:");
    console.log(`  Name: ${event.venue.name}`);
    if (event.venue.address) console.log(`  Address: ${event.venue.address}`);
    if (event.venue.city || event.venue.state) {
      console.log(`  Location: ${event.venue.city}, ${event.venue.state}`);
    }
  }

  if (event.description) {
    console.log("\nDescription:");
    const desc =
      event.description.length > 300
        ? event.description.substring(0, 300) + "..."
        : event.description;
    console.log(`  ${desc}`);
  }

  if (event.ticketSectors.length > 0) {
    console.log("\nTicket Sectors:");
    event.ticketSectors.forEach((sector) => {
      const status = sector.available ? "Available" : "Sold Out";
      const price =
        sector.priceRange.min > 0
          ? `R$ ${sector.priceRange.min.toFixed(2)} - R$ ${sector.priceRange.max.toFixed(2)}`
          : "Price not available";
      console.log(`  - ${sector.name}: ${price} (${status})`);
    });
  }

  if (event.availableDates.length > 0) {
    console.log("\nAvailable Dates:");
    event.availableDates.slice(0, 10).forEach((date) => {
      const dayInfo = date.dayOfWeek ? `${date.dayOfWeek}, ` : "";
      const timeInfo = date.time ? ` at ${date.time}` : "";
      const priceInfo = date.priceRange
        ? ` (R$ ${date.priceRange.min.toFixed(2)} - R$ ${date.priceRange.max.toFixed(2)})`
        : "";
      console.log(`  - ${dayInfo}${date.date}${timeInfo}${priceInfo}`);
    });
    if (event.availableDates.length > 10) {
      console.log(`  ... and ${event.availableDates.length - 10} more dates`);
    }
  }

  if (event.organizer) {
    console.log(`\nOrganizer: ${event.organizer}`);
  }

  console.log(`\nScraped at: ${event.scrapedAt}`);
}

async function main() {
  const eventUrl =
    process.argv[2] || "https://bileto.sympla.com.br/event/114143";

  console.log("=".repeat(60));
  console.log("  SYMPLA EVENT SCRAPER");
  console.log("  Powered by Browserbase");
  console.log("=".repeat(60));

  // Validate environment variables
  if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID) {
    console.error("\nError: Missing required environment variables.\n");
    console.error("Please set the following environment variables:");
    console.error("  - BROWSERBASE_API_KEY");
    console.error("  - BROWSERBASE_PROJECT_ID");
    console.error("\nYou can get these from https://browserbase.com/settings\n");
    console.error("Example usage:");
    console.error('  export BROWSERBASE_API_KEY="your-api-key"');
    console.error('  export BROWSERBASE_PROJECT_ID="your-project-id"');
    console.error("  npm run scrape https://bileto.sympla.com.br/event/114143\n");
    process.exit(1);
  }

  console.log(`\nTarget URL: ${eventUrl}\n`);

  try {
    const scraper = new SymplaEventScraper();

    const result: ScrapeResult = await scraper.scrape(eventUrl, {
      includeAvailableDates: true,
      includeTicketSectors: true,
      timeout: 60000,
    });

    if (result.success && result.event) {
      // Print human-readable summary
      printEventSummary(result.event);

      // Print full JSON
      console.log("\n" + "=".repeat(60));
      console.log("FULL JSON OUTPUT");
      console.log("=".repeat(60));
      console.log(JSON.stringify(result.event, null, 2));

      console.log("\n" + "=".repeat(60));
      console.log(`Session Recording: ${result.sessionUrl}`);
      console.log("=".repeat(60) + "\n");
    } else {
      console.error("\nFailed to scrape event:", result.error);
      if (result.sessionUrl) {
        console.error(`\nDebug by viewing session: ${result.sessionUrl}\n`);
      }
      process.exit(1);
    }
  } catch (error) {
    console.error("\nUnexpected error:", error);
    process.exit(1);
  }
}

main();
