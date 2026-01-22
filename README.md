# Scrappy - Sympla Event Scraper

A minimal web scraper for Sympla event pages built with TypeScript and Bun.

## Features

- Scrapes event details from Sympla/Bileto pages
- Extracts: title, description, image, venue, dates, schedule, ticket sections & prices
- Intercepts API responses for more accurate data
- Mobile viewport for consistent scraping

## Installation

```bash
# Install dependencies
bun install

# Install Playwright browsers
bunx playwright install chromium
```

## Usage

### Scrape an event

```bash
bun run scrape <url>

# Example
bun run scrape https://bileto.sympla.com.br/event/114143
```

### Discover API endpoints

Run this to see what API calls Sympla makes (useful for understanding their backend):

```bash
bun run discover <url>
```

This will capture all JSON API responses and save them to `discovered-apis.json`.

## Output Format

```json
{
  "title": "Event Name",
  "description": "Event description...",
  "imageUrl": "https://...",
  "venue": {
    "name": "Venue Name",
    "address": "Street Address",
    "city": "City",
    "state": "State"
  },
  "dateRange": "20 de Março a 12 de Abril",
  "schedule": "Sexta e Sábado às 20h00...",
  "dates": [],
  "sections": [
    {
      "name": "PLATEIA VIP",
      "minPrice": 175,
      "maxPrice": 350,
      "currency": "BRL",
      "available": true
    }
  ],
  "url": "https://bileto.sympla.com.br/event/114143"
}
```

## Development

```bash
# Run scraper
bun run index.ts <url>

# Run API discovery
bun run src/discover-api.ts <url>
```

## Requirements

- Bun runtime
- Playwright with Chromium
