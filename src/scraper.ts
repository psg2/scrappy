import { chromium, type Page, type Browser } from "playwright";
import type { SymplaEvent, TicketSection } from "./types";

export async function scrapeSymplaEvent(url: string): Promise<SymplaEvent> {
  return await scrapeWithBrowser(url);
}

async function scrapeWithBrowser(url: string): Promise<SymplaEvent> {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
      viewport: { width: 390, height: 844 },
    });

    const page = await context.newPage();

    // Intercept API responses to capture event data
    let eventApiData: any = null;
    let ticketApiData: any = null;

    page.on("response", async (response) => {
      const url = response.url();
      const contentType = response.headers()["content-type"] || "";

      if (contentType.includes("json")) {
        try {
          const data = await response.json();
          // Look for event data in API responses
          if (url.includes("event") || data?.event || data?.name) {
            eventApiData = data;
          }
          if (url.includes("ticket") || url.includes("sector") || data?.sectors) {
            ticketApiData = data;
          }
        } catch {
          // Ignore parse errors
        }
      }
    });

    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(3000);

    // Extract data from page
    const pageData = await extractEventData(page, url);

    // Try to get ticket sections
    const sections = await extractTicketSections(page);

    // Merge API data if captured
    if (eventApiData) {
      if (eventApiData.name) pageData.title = eventApiData.name;
      if (eventApiData.description) pageData.description = eventApiData.description;
      if (eventApiData.image) pageData.imageUrl = eventApiData.image;
    }

    return {
      ...pageData,
      sections,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function extractEventData(page: Page, url: string): Promise<SymplaEvent> {
  return await page.evaluate((eventUrl: string) => {
    const getText = (selector: string): string => {
      const el = document.querySelector(selector);
      return el?.textContent?.trim() || "";
    };

    const getTextAll = (selectors: string[]): string => {
      for (const sel of selectors) {
        const text = getText(sel);
        if (text) return text;
      }
      return "";
    };

    // Title
    const title = getTextAll([
      "h1",
      "[class*='event-title']",
      "[class*='event-name']",
      "[class*='title'] h1",
    ]) || document.title;

    // Description
    let description = "";
    const descEls = document.querySelectorAll(
      "[class*='description'], [class*='about'], [class*='info'] p"
    );
    for (const el of descEls) {
      if (el.textContent && el.textContent.length > 50) {
        description = el.textContent.trim();
        break;
      }
    }

    // Image
    let imageUrl: string | null = null;
    const imgs = document.querySelectorAll("img");
    for (const img of imgs) {
      const src = img.src || img.getAttribute("data-src") || "";
      if (src && !src.includes("icon") && !src.includes("logo") && img.width > 100) {
        imageUrl = src;
        break;
      }
    }

    // Date range
    const dateRange = getTextAll([
      "[class*='date']",
      "[class*='period']",
      "[class*='when']",
    ]);

    // Schedule
    let schedule = "";
    const timeEls = document.querySelectorAll(
      "[class*='schedule'], [class*='time'], [class*='horario']"
    );
    for (const el of timeEls) {
      if (el.textContent && el.textContent.length > 10) {
        schedule = el.textContent.trim();
        break;
      }
    }

    // Venue
    let venue: { name: string; address: string; city: string; state: string } | null = null;
    const venueText = getTextAll([
      "[class*='venue']",
      "[class*='location']",
      "[class*='address']",
      "[class*='local']",
    ]);
    if (venueText) {
      const parts = venueText.split(" - ");
      venue = {
        name: parts[0] || "",
        address: parts.slice(1, -1).join(" - ") || "",
        city: parts[parts.length - 1]?.split(",")[0]?.trim() || "",
        state: parts[parts.length - 1]?.split(",")[1]?.trim() || "",
      };
    }

    return {
      title,
      description,
      imageUrl,
      venue,
      dateRange,
      schedule,
      dates: [],
      sections: [],
      url: eventUrl,
    };
  }, url);
}

async function extractTicketSections(page: Page): Promise<TicketSection[]> {
  // Click buy button to reveal ticket sections
  const buySelectors = [
    "text=Comprar ingressos",
    "text=Comprar",
    "button:has-text('Comprar')",
    "[class*='buy'] button",
  ];

  for (const sel of buySelectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        await page.waitForTimeout(2000);
        break;
      }
    } catch {
      continue;
    }
  }

  await page.waitForTimeout(1500);

  return await page.evaluate(() => {
    const sections: {
      name: string;
      minPrice: number;
      maxPrice: number;
      currency: string;
      available: boolean;
    }[] = [];

    const containers = document.querySelectorAll(
      "[class*='sector'], [class*='section'], [class*='ticket'], [class*='ingresso']"
    );

    const seen = new Set<string>();

    for (const el of containers) {
      const text = el.textContent || "";

      // Extract section name
      const nameMatch = text.match(/\b([A-Z][A-Z\s]+(?:VIP|IMPAR|PAR)?)\b/);
      const name = nameMatch?.[1]?.trim();

      if (!name || seen.has(name)) continue;

      // Extract prices
      const priceMatches = text.match(/R\$\s*[\d.,]+/g);
      const isSoldOut = /esgotado|sold out/i.test(text);

      let minPrice = 0;
      let maxPrice = 0;

      if (priceMatches) {
        const prices = priceMatches.map((p) =>
          parseFloat(p.replace("R$", "").replace(/\s/g, "").replace(",", "."))
        );
        minPrice = Math.min(...prices);
        maxPrice = Math.max(...prices);
      }

      if (name && (priceMatches || isSoldOut)) {
        seen.add(name);
        sections.push({
          name,
          minPrice,
          maxPrice,
          currency: "BRL",
          available: !isSoldOut,
        });
      }
    }

    return sections;
  });
}
