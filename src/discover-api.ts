/**
 * API Discovery Script
 * Run this locally to discover the API endpoints Sympla uses
 * Usage: bun run src/discover-api.ts <url>
 */

import { chromium } from "playwright";

interface ApiCall {
  url: string;
  method: string;
  status?: number;
  contentType?: string;
  responseBody?: any;
}

async function discoverApi(eventUrl: string) {
  console.log(`\nDiscovering APIs for: ${eventUrl}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15",
    viewport: { width: 390, height: 844 },
  });

  const page = await context.newPage();
  const apiCalls: ApiCall[] = [];

  // Capture all network requests
  page.on("response", async (response) => {
    const url = response.url();
    const contentType = response.headers()["content-type"] || "";

    // Filter for API-like responses
    if (
      contentType.includes("json") ||
      url.includes("/api/") ||
      url.includes("/v1/") ||
      url.includes("/v2/") ||
      url.includes("/v3/") ||
      url.includes("event") ||
      url.includes("ticket")
    ) {
      const call: ApiCall = {
        url,
        method: response.request().method(),
        status: response.status(),
        contentType,
      };

      try {
        if (contentType.includes("json")) {
          call.responseBody = await response.json();
        }
      } catch {
        // Ignore
      }

      apiCalls.push(call);
    }
  });

  try {
    await page.goto(eventUrl, { waitUntil: "networkidle", timeout: 60000 });
    console.log("Page loaded, waiting for dynamic content...\n");
    await page.waitForTimeout(3000);

    // Click buy button to trigger more API calls
    const buyBtn = await page.$("text=Comprar ingressos");
    if (buyBtn) {
      console.log("Clicking buy button to discover ticket APIs...\n");
      await buyBtn.click();
      await page.waitForTimeout(3000);
    }

    // Print discovered APIs
    console.log("=" .repeat(60));
    console.log("DISCOVERED API ENDPOINTS");
    console.log("=".repeat(60));

    for (const call of apiCalls) {
      console.log(`\n${call.method} ${call.url}`);
      console.log(`  Status: ${call.status}`);
      console.log(`  Content-Type: ${call.contentType}`);

      if (call.responseBody) {
        const preview = JSON.stringify(call.responseBody, null, 2);
        console.log(`  Response:\n${preview.substring(0, 1000)}`);
        if (preview.length > 1000) console.log("  ... (truncated)");
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log(`Total API calls captured: ${apiCalls.length}`);
    console.log("=".repeat(60));

    // Export to JSON file
    const outputFile = "discovered-apis.json";
    await Bun.write(outputFile, JSON.stringify(apiCalls, null, 2));
    console.log(`\nFull data saved to: ${outputFile}`);

  } finally {
    await browser.close();
  }
}

// Run
const url = process.argv[2] || "https://bileto.sympla.com.br/event/114143";
discoverApi(url).catch(console.error);
