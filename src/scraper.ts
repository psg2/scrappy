import { chromium, Page, BrowserContext } from "playwright-core";
import Browserbase from "@browserbasehq/sdk";
import {
  SymplaEvent,
  TicketSector,
  EventDate,
  EventVenue,
  ScrapeOptions,
  ScrapeResult,
} from "./types.js";

export class SymplaScraper {
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

  async scrapeEvent(
    eventUrl: string,
    options: ScrapeOptions = {}
  ): Promise<ScrapeResult> {
    const {
      includeAvailableDates = true,
      includeTicketSectors = true,
      timeout = 30000,
    } = options;

    let sessionId: string | undefined;

    try {
      // Create a new Browserbase session
      const session = await this.bb.sessions.create({
        projectId: this.projectId,
      });
      sessionId = session.id;

      console.log(`Session created: ${session.id}`);
      console.log(`View recording at: https://browserbase.com/sessions/${session.id}`);

      // Connect to the browser
      const browser = await chromium.connectOverCDP(session.connectUrl);
      const context = browser.contexts()[0];
      const page = context.pages()[0];

      // Set desktop viewport
      await page.setViewportSize({ width: 1920, height: 1080 });

      // Navigate to the event page
      console.log(`Navigating to: ${eventUrl}`);
      await page.goto(eventUrl, { waitUntil: "domcontentloaded", timeout });

      // Wait for main content to load
      await page.waitForSelector("h1, h2, [class*='title']", { timeout: 10000 });

      // Scrape basic event info
      const event = await this.scrapeBasicInfo(page, eventUrl);

      // Scrape available dates if requested
      if (includeAvailableDates) {
        event.availableDates = await this.scrapeAvailableDates(page, context);
      }

      // Scrape ticket sectors if requested
      if (includeTicketSectors && event.availableDates.length > 0) {
        event.ticketSectors = await this.scrapeTicketSectors(page, context);
      }

      await page.close();
      await browser.close();

      return {
        success: true,
        event,
        sessionId,
        sessionUrl: `https://browserbase.com/sessions/${sessionId}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Scraping failed: ${errorMessage}`);

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

  private async scrapeBasicInfo(page: Page, url: string): Promise<SymplaEvent> {
    console.log("Scraping basic event info...");

    // Extract event data from the page
    const eventData = await page.evaluate(() => {
      const getText = (selector: string): string => {
        const el = document.querySelector(selector);
        return el?.textContent?.trim() || "";
      };

      const getTexts = (selector: string): string[] => {
        const elements = document.querySelectorAll(selector);
        return Array.from(elements).map((el) => el.textContent?.trim() || "");
      };

      // Try multiple selectors for title
      let title = "";
      const titleSelectors = [
        "h1",
        "[class*='EventTitle']",
        "[class*='event-title']",
        "[data-testid='event-title']",
      ];
      for (const sel of titleSelectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) {
          title = el.textContent.trim();
          break;
        }
      }

      // Get description
      let description = "";
      const descSelectors = [
        "[class*='description']",
        "[class*='Description']",
        "[data-testid='event-description']",
        "section p",
        ".event-description",
      ];
      for (const sel of descSelectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim() && el.textContent.trim().length > 20) {
          description = el.textContent.trim();
          break;
        }
      }

      // Get date information
      let dateText = "";
      const dateSelectors = [
        "[class*='date']",
        "[class*='Date']",
        "[data-testid='event-date']",
        "time",
      ];
      for (const sel of dateSelectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const text = el.textContent?.trim();
          if (text && (text.includes("de") || text.includes("/"))) {
            dateText = text;
            break;
          }
        }
        if (dateText) break;
      }

      // Get schedule/times
      const scheduleText = Array.from(document.querySelectorAll("*"))
        .filter((el) => {
          const text = el.textContent || "";
          return (
            text.includes("h00") ||
            text.includes("h30") ||
            (text.includes("às") && text.includes(":"))
          );
        })
        .map((el) => el.textContent?.trim() || "")
        .filter((t) => t.length < 200)[0] || "";

      // Get venue information
      let venueName = "";
      let venueAddress = "";

      // Look for location/venue info
      const allText = document.body.innerText;
      const locationMatch = allText.match(
        /([A-Za-zÀ-ÿ\s]+(?:Hall|Teatro|Arena|Centro|Espaço)[^-\n]*)-\s*([^,\n]+,[^,\n]+,[^-\n]+)/i
      );
      if (locationMatch) {
        venueName = locationMatch[1].trim();
        venueAddress = locationMatch[2].trim();
      }

      // Try specific selectors for venue
      const venueSelectors = [
        "[class*='venue']",
        "[class*='Venue']",
        "[class*='location']",
        "[class*='Location']",
        "[data-testid='event-location']",
      ];
      for (const sel of venueSelectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) {
          const text = el.textContent.trim();
          if (text.includes("-")) {
            const parts = text.split("-");
            venueName = parts[0].trim();
            venueAddress = parts.slice(1).join("-").trim();
          } else {
            venueName = text;
          }
          break;
        }
      }

      // Get image URL
      let imageUrl = "";
      const imgSelectors = [
        "[class*='banner'] img",
        "[class*='Banner'] img",
        "[class*='event'] img",
        "img[src*='sympla']",
        "header img",
      ];
      for (const sel of imgSelectors) {
        const img = document.querySelector(sel) as HTMLImageElement;
        if (img?.src) {
          imageUrl = img.src;
          break;
        }
      }

      return {
        title,
        description,
        dateText,
        scheduleText,
        venueName,
        venueAddress,
        imageUrl,
      };
    });

    // Parse date range
    const dateRange = this.parseDateRange(eventData.dateText);

    // Parse venue
    const venue = this.parseVenue(eventData.venueName, eventData.venueAddress);

    // Parse schedule
    const schedule = this.parseSchedule(eventData.scheduleText);

    return {
      url,
      title: eventData.title,
      description: eventData.description,
      dateRange,
      schedule,
      venue,
      ticketSectors: [],
      availableDates: [],
      imageUrl: eventData.imageUrl || undefined,
      scrapedAt: new Date().toISOString(),
    };
  }

  private async scrapeAvailableDates(
    page: Page,
    context: BrowserContext
  ): Promise<EventDate[]> {
    console.log("Scraping available dates...");

    try {
      // Click on "Comprar ingressos" button if exists
      const buyButton = await page.$(
        'button:has-text("Comprar"), a:has-text("Comprar"), [class*="buy"], [class*="ticket"]'
      );
      if (buyButton) {
        await buyButton.click();
        await page.waitForTimeout(2000);
      }

      // Look for date selection
      const dates = await page.evaluate(() => {
        const dateItems: {
          date: string;
          dayOfWeek: string;
          time: string;
          priceText: string;
        }[] = [];

        // Find date list items
        const dateElements = document.querySelectorAll(
          '[class*="date"], [class*="Date"], [class*="calendar"], li, [role="listitem"]'
        );

        dateElements.forEach((el) => {
          const text = el.textContent || "";

          // Look for date patterns like "20 Março" or "Sexta 20 Março"
          const dateMatch = text.match(
            /(Sexta|Sábado|Domingo|Segunda|Terça|Quarta|Quinta)?\s*(\d{1,2})\s*(Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)/i
          );

          if (dateMatch) {
            // Look for price info
            const priceMatch = text.match(
              /R\$\s*[\d,.]+(?:\s*(?:e|a)\s*R\$\s*[\d,.]+)?/
            );

            dateItems.push({
              dayOfWeek: dateMatch[1] || "",
              date: `${dateMatch[2]} de ${dateMatch[3]}`,
              time: "",
              priceText: priceMatch?.[0] || "",
            });
          }
        });

        return dateItems;
      });

      return dates.map((d) => ({
        date: d.date,
        dayOfWeek: d.dayOfWeek,
        time: d.time,
        priceRange: this.parsePriceRange(d.priceText),
      }));
    } catch (error) {
      console.log("Could not scrape available dates:", error);
      return [];
    }
  }

  private async scrapeTicketSectors(
    page: Page,
    context: BrowserContext
  ): Promise<TicketSector[]> {
    console.log("Scraping ticket sectors...");

    try {
      // Wait for sector selection to appear
      await page.waitForTimeout(1000);

      const sectors = await page.evaluate(() => {
        const sectorItems: {
          name: string;
          priceText: string;
          available: boolean;
        }[] = [];

        // Find sector/ticket type elements
        const sectorElements = document.querySelectorAll(
          '[class*="sector"], [class*="Sector"], [class*="ticket"], [class*="Ticket"], [class*="ingresso"], li, [role="listitem"]'
        );

        sectorElements.forEach((el) => {
          const text = el.textContent || "";

          // Look for sector names like "PLATEIA VIP", "BALCAO", etc.
          const sectorPatterns = [
            /PLATEIA\s*VIP/i,
            /PLATEIA/i,
            /BALC[ÃA]O/i,
            /FRISA\s*[ÍI]MPAR/i,
            /FRISA\s*PAR/i,
            /CAMAROTE/i,
            /PISTA/i,
            /ARENA/i,
          ];

          for (const pattern of sectorPatterns) {
            if (pattern.test(text)) {
              const priceMatch = text.match(
                /R\$\s*[\d,.]+(?:\s*(?:e|a)\s*R\$\s*[\d,.]+)?/
              );
              const isUnavailable =
                text.toLowerCase().includes("esgotado") ||
                text.toLowerCase().includes("indisponível");

              sectorItems.push({
                name: text.match(pattern)?.[0].toUpperCase() || "",
                priceText: priceMatch?.[0] || "",
                available: !isUnavailable,
              });
              break;
            }
          }
        });

        // Remove duplicates
        const unique = sectorItems.filter(
          (item, index, self) =>
            index === self.findIndex((t) => t.name === item.name)
        );

        return unique;
      });

      return sectors.map((s) => ({
        name: s.name,
        priceRange: this.parsePriceRange(s.priceText),
        available: s.available,
      }));
    } catch (error) {
      console.log("Could not scrape ticket sectors:", error);
      return [];
    }
  }

  private parseDateRange(dateText: string): { start: string; end: string } {
    // Parse "20 de Março a 12 de Abril" format
    const match = dateText.match(
      /(\d{1,2})\s*de\s*(\w+)\s*(?:a|até)\s*(\d{1,2})\s*de\s*(\w+)/i
    );

    if (match) {
      return {
        start: `${match[1]} de ${match[2]}`,
        end: `${match[3]} de ${match[4]}`,
      };
    }

    // Single date
    const singleMatch = dateText.match(/(\d{1,2})\s*de\s*(\w+)/i);
    if (singleMatch) {
      const date = `${singleMatch[1]} de ${singleMatch[2]}`;
      return { start: date, end: date };
    }

    return { start: dateText, end: dateText };
  }

  private parseVenue(name: string, address: string): EventVenue {
    // Parse address like "R. Bento Branco de Andrade Filho, 722, São Paulo - São Paulo"
    let city = "";
    let state = "";

    const cityStateMatch = address.match(/([^,]+)\s*-\s*([^,\n]+)$/);
    if (cityStateMatch) {
      city = cityStateMatch[1].trim();
      state = cityStateMatch[2].trim();
    }

    return {
      name: name || "Unknown Venue",
      address: address || "",
      city,
      state,
    };
  }

  private parseSchedule(scheduleText: string): string[] {
    const schedules: string[] = [];

    // Parse patterns like "Sexta e Sábado às 20h00"
    const patterns = scheduleText.match(
      /(?:Sexta|Sábado|Domingo|Segunda|Terça|Quarta|Quinta)(?:\s*e\s*(?:Sexta|Sábado|Domingo|Segunda|Terça|Quarta|Quinta))?\s*(?:às|as)\s*\d{1,2}h\d{2}/gi
    );

    if (patterns) {
      schedules.push(...patterns);
    }

    return schedules;
  }

  private parsePriceRange(priceText: string): { min: number; max: number } {
    if (!priceText) {
      return { min: 0, max: 0 };
    }

    // Extract all prices from text
    const prices = priceText.match(/[\d,.]+/g)?.map((p) => {
      // Convert Brazilian format (1.234,56) to number
      return parseFloat(p.replace(/\./g, "").replace(",", "."));
    }) || [0];

    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
    };
  }
}
