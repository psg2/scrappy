import { chromium, Page, Browser } from "playwright-core";
import Browserbase from "@browserbasehq/sdk";
import {
  SymplaEvent,
  TicketSector,
  EventDate,
  EventVenue,
  ScrapeOptions,
  ScrapeResult,
} from "./types.js";

export class SymplaEventScraper {
  private bb: Browserbase;
  private projectId: string;

  constructor() {
    const apiKey = process.env.BROWSERBASE_API_KEY;
    const projectId = process.env.BROWSERBASE_PROJECT_ID;

    if (!apiKey || !projectId) {
      throw new Error(
        "Missing required environment variables: BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID"
      );
    }

    this.bb = new Browserbase({ apiKey });
    this.projectId = projectId;
  }

  async scrape(
    eventUrl: string,
    options: ScrapeOptions = {}
  ): Promise<ScrapeResult> {
    const {
      includeAvailableDates = true,
      includeTicketSectors = true,
      timeout = 60000,
    } = options;

    let browser: Browser | null = null;
    let sessionId: string | undefined;

    try {
      // Create Browserbase session
      console.log("Creating Browserbase session...");
      const session = await this.bb.sessions.create({
        projectId: this.projectId,
      });
      sessionId = session.id;

      console.log(`Session ID: ${session.id}`);
      console.log(`Recording URL: https://browserbase.com/sessions/${session.id}`);

      // Connect to browser
      browser = await chromium.connectOverCDP(session.connectUrl);
      const context = browser.contexts()[0];
      const page = context.pages()[0];

      // Set desktop viewport
      await page.setViewportSize({ width: 1920, height: 1080 });

      // Navigate to event page
      console.log(`\nNavigating to: ${eventUrl}`);
      await page.goto(eventUrl, {
        waitUntil: "networkidle",
        timeout,
      });

      // Wait for page to fully load
      await page.waitForTimeout(2000);

      // Scrape all event data
      const event = await this.extractEventData(page, eventUrl);

      // Get available dates if requested
      if (includeAvailableDates) {
        console.log("Extracting available dates...");
        event.availableDates = await this.extractAvailableDates(page);
      }

      // Get ticket sectors if requested
      if (includeTicketSectors) {
        console.log("Extracting ticket sectors...");
        event.ticketSectors = await this.extractTicketSectors(page);
      }

      await browser.close();

      return {
        success: true,
        event,
        sessionId,
        sessionUrl: `https://browserbase.com/sessions/${sessionId}`,
      };
    } catch (error) {
      if (browser) {
        await browser.close().catch(() => {});
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`\nScraping error: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        sessionId,
        sessionUrl: sessionId
          ? `https://browserbase.com/sessions/${sessionId}`
          : undefined,
      };
    }
  }

  private async extractEventData(
    page: Page,
    url: string
  ): Promise<SymplaEvent> {
    console.log("Extracting event data...");

    const data = await page.evaluate(() => {
      // Helper to get text from element
      const getElementText = (selectors: string[]): string => {
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el?.textContent?.trim()) {
            return el.textContent.trim();
          }
        }
        return "";
      };

      // Helper to get all matching text
      const getAllText = (selector: string): string[] => {
        return Array.from(document.querySelectorAll(selector))
          .map((el) => el.textContent?.trim() || "")
          .filter((t) => t.length > 0);
      };

      // Extract title - usually the main h1 or h2
      const title = getElementText([
        "h1",
        "h2",
        '[data-testid="event-title"]',
        '[class*="EventTitle"]',
        '[class*="event-title"]',
        '[class*="titulo"]',
      ]);

      // Extract full page text for pattern matching
      const bodyText = document.body.innerText;

      // Extract date range - look for "X de Mês a Y de Mês" pattern
      let dateStart = "";
      let dateEnd = "";
      const dateRangeMatch = bodyText.match(
        /(\d{1,2})\s*de\s*(Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\s*(?:a|até|ao?)\s*(\d{1,2})\s*de\s*(Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)/i
      );
      if (dateRangeMatch) {
        dateStart = `${dateRangeMatch[1]} de ${dateRangeMatch[2]}`;
        dateEnd = `${dateRangeMatch[3]} de ${dateRangeMatch[4]}`;
      }

      // Extract schedule times - look for "às Xh00" patterns
      const scheduleMatches = bodyText.match(
        /(?:Sexta|Sábado|Domingo|Segunda|Terça|Quarta|Quinta)(?:[^,\n]*?)(?:às|as)\s*\d{1,2}h\d{2}/gi
      ) || [];
      const schedule = [...new Set(scheduleMatches)];

      // Extract venue info - look for address patterns
      let venueName = "";
      let venueAddress = "";
      let venueCity = "";
      let venueState = "";

      // Look for venue with address pattern
      const venueMatch = bodyText.match(
        /([A-Za-zÀ-ÿ\s]+(?:Hall|Teatro|Arena|Centro|Espaço|Auditório|Casa)[^-\n]*?)\s*-\s*([^,\n]+,\s*\d+[^,\n]*,\s*[^-\n]+)\s*-\s*([A-Za-zÀ-ÿ\s]+)/i
      );
      if (venueMatch) {
        venueName = venueMatch[1].trim();
        venueAddress = venueMatch[2].trim();
        const cityState = venueMatch[3].trim();
        const parts = cityState.split(/\s*-\s*/);
        if (parts.length >= 1) venueCity = parts[0].trim();
        if (parts.length >= 2) venueState = parts[1].trim();
      }

      // If no venue found, try simpler patterns
      if (!venueName) {
        const simpleVenueMatch = bodyText.match(
          /([A-Za-zÀ-ÿ\s]+(?:Hall|Teatro|Arena|Centro|Espaço|Auditório|Casa))/i
        );
        if (simpleVenueMatch) {
          venueName = simpleVenueMatch[1].trim();
        }
      }

      // Extract description
      let description = "";
      const descriptionEl = document.querySelector(
        '[class*="description"], [class*="Description"], [class*="descricao"], section p'
      );
      if (descriptionEl) {
        description = descriptionEl.textContent?.trim() || "";
      }

      // If description is too short, try to find more text
      if (description.length < 50) {
        const paragraphs = getAllText("p");
        for (const p of paragraphs) {
          if (p.length > 50 && !p.includes("R$") && !p.includes("@")) {
            description = p;
            break;
          }
        }
      }

      // Extract image URL
      let imageUrl = "";
      const imgSelectors = [
        'img[src*="sympla"]',
        'img[src*="event"]',
        '[class*="banner"] img',
        '[class*="header"] img',
        "header img",
      ];
      for (const selector of imgSelectors) {
        const img = document.querySelector(selector) as HTMLImageElement;
        if (img?.src && img.src.includes("http")) {
          imageUrl = img.src;
          break;
        }
      }

      // Extract organizer
      let organizer = "";
      const organizerMatch = bodyText.match(
        /(?:Organizado|Apresentado|Realizado)\s*(?:por|:)\s*([^\n]+)/i
      );
      if (organizerMatch) {
        organizer = organizerMatch[1].trim();
      }

      return {
        title,
        dateStart,
        dateEnd,
        schedule,
        venueName,
        venueAddress,
        venueCity,
        venueState,
        description,
        imageUrl,
        organizer,
      };
    });

    return {
      url,
      title: data.title,
      description: data.description,
      dateRange: {
        start: data.dateStart,
        end: data.dateEnd,
      },
      schedule: data.schedule,
      venue: {
        name: data.venueName,
        address: data.venueAddress,
        city: data.venueCity,
        state: data.venueState,
      },
      ticketSectors: [],
      availableDates: [],
      imageUrl: data.imageUrl || undefined,
      organizer: data.organizer || undefined,
      scrapedAt: new Date().toISOString(),
    };
  }

  private async extractAvailableDates(page: Page): Promise<EventDate[]> {
    try {
      // Click on buy/tickets button to open date selection
      const buyButtonSelectors = [
        'button:has-text("Comprar")',
        'a:has-text("Comprar")',
        'button:has-text("ingressos")',
        '[class*="buy"]',
        '[class*="ticket"]',
        '[class*="comprar"]',
      ];

      for (const selector of buyButtonSelectors) {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          await page.waitForTimeout(2000);
          break;
        }
      }

      // Extract dates from the page
      const dates = await page.evaluate(() => {
        const result: {
          date: string;
          dayOfWeek: string;
          time: string;
          minPrice: number;
          maxPrice: number;
        }[] = [];

        // Look for date items in lists
        const listItems = document.querySelectorAll(
          "li, [role='listitem'], [class*='date'], [class*='Date']"
        );

        const months = [
          "Janeiro",
          "Fevereiro",
          "Março",
          "Abril",
          "Maio",
          "Junho",
          "Julho",
          "Agosto",
          "Setembro",
          "Outubro",
          "Novembro",
          "Dezembro",
        ];
        const days = [
          "Domingo",
          "Segunda",
          "Terça",
          "Quarta",
          "Quinta",
          "Sexta",
          "Sábado",
        ];

        listItems.forEach((item) => {
          const text = item.textContent || "";

          // Match patterns like "Sexta 20 Março" or just "20 Março"
          for (const month of months) {
            const regex = new RegExp(
              `(${days.join("|")})?\\s*(\\d{1,2})\\s*${month}`,
              "i"
            );
            const match = text.match(regex);

            if (match) {
              // Extract price info
              const priceMatches = text.match(/R\$\s*([\d.,]+)/g) || [];
              const prices = priceMatches.map((p) => {
                const num = p.replace(/R\$\s*/, "").replace(/\./g, "").replace(",", ".");
                return parseFloat(num) || 0;
              });

              // Extract time if present
              const timeMatch = text.match(/(\d{1,2})h(\d{2})/);
              const time = timeMatch ? `${timeMatch[1]}h${timeMatch[2]}` : "";

              result.push({
                dayOfWeek: match[1] || "",
                date: `${match[2]} de ${month}`,
                time,
                minPrice: prices.length > 0 ? Math.min(...prices) : 0,
                maxPrice: prices.length > 0 ? Math.max(...prices) : 0,
              });
            }
          }
        });

        // Remove duplicates
        const unique: typeof result = [];
        const seen = new Set<string>();
        for (const item of result) {
          const key = `${item.date}-${item.time}`;
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(item);
          }
        }

        return unique;
      });

      return dates.map((d) => ({
        date: d.date,
        dayOfWeek: d.dayOfWeek,
        time: d.time,
        priceRange:
          d.minPrice > 0 || d.maxPrice > 0
            ? { min: d.minPrice, max: d.maxPrice }
            : undefined,
      }));
    } catch (error) {
      console.log("  Could not extract available dates");
      return [];
    }
  }

  private async extractTicketSectors(page: Page): Promise<TicketSector[]> {
    try {
      // Try to click on first available date to see sectors
      const dateItem = await page.$(
        '[class*="date"]:first-child, li:first-child'
      );
      if (dateItem) {
        await dateItem.click();
        await page.waitForTimeout(2000);
      }

      // Extract sector information
      const sectors = await page.evaluate(() => {
        const result: {
          name: string;
          minPrice: number;
          maxPrice: number;
          available: boolean;
        }[] = [];

        const sectorNames = [
          "PLATEIA VIP",
          "PLATEIA",
          "BALCÃO",
          "BALCAO",
          "FRISA ÍMPAR",
          "FRISA IMPAR",
          "FRISA PAR",
          "CAMAROTE",
          "PISTA",
          "ARENA",
          "SETOR A",
          "SETOR B",
          "SETOR C",
          "SETOR D",
          "VIP",
          "PREMIUM",
        ];

        // Search for sector elements
        const elements = document.querySelectorAll(
          '[class*="sector"], [class*="Sector"], [class*="ticket"], [class*="Ticket"], [class*="setor"], li, [role="listitem"]'
        );

        elements.forEach((el) => {
          const text = el.textContent?.toUpperCase() || "";

          for (const sectorName of sectorNames) {
            if (text.includes(sectorName)) {
              // Check availability
              const isUnavailable =
                text.includes("ESGOTADO") || text.includes("INDISPONÍVEL");

              // Extract prices
              const priceMatches =
                el.textContent?.match(/R\$\s*([\d.,]+)/g) || [];
              const prices = priceMatches.map((p) => {
                const num = p
                  .replace(/R\$\s*/, "")
                  .replace(/\./g, "")
                  .replace(",", ".");
                return parseFloat(num) || 0;
              });

              result.push({
                name: sectorName,
                minPrice: prices.length > 0 ? Math.min(...prices) : 0,
                maxPrice: prices.length > 0 ? Math.max(...prices) : 0,
                available: !isUnavailable,
              });
              break;
            }
          }
        });

        // Remove duplicates, keeping the one with most price info
        const unique: typeof result = [];
        const seen = new Set<string>();
        for (const item of result) {
          if (!seen.has(item.name)) {
            seen.add(item.name);
            unique.push(item);
          }
        }

        return unique;
      });

      return sectors.map((s) => ({
        name: s.name,
        priceRange: { min: s.minPrice, max: s.maxPrice },
        available: s.available,
      }));
    } catch (error) {
      console.log("  Could not extract ticket sectors");
      return [];
    }
  }
}

// Export for direct usage
export async function scrapeSymplaEvent(
  eventUrl: string,
  options?: ScrapeOptions
): Promise<ScrapeResult> {
  const scraper = new SymplaEventScraper();
  return scraper.scrape(eventUrl, options);
}
