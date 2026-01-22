# Sympla Event Scraper

A web scraper for extracting event details from [Sympla](https://sympla.com.br) using [Browserbase](https://browserbase.com) and [Playwright](https://playwright.dev).

## Features

- Extracts comprehensive event information:
  - Event title and description
  - Date range and schedule
  - Venue details (name, address, city, state)
  - Available dates with pricing
  - Ticket sectors with price ranges and availability
  - Event images and organizer info

- Uses Browserbase for reliable cloud-based browser automation
- Session recording for debugging and inspection
- TypeScript support with full type definitions

## Prerequisites

- Node.js 18+
- A Browserbase account ([sign up here](https://browserbase.com))
- Browserbase API key and Project ID

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd scrappy

# Install dependencies
npm install
```

## Configuration

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Add your Browserbase credentials to `.env`:
   ```
   BROWSERBASE_API_KEY=your-api-key-here
   BROWSERBASE_PROJECT_ID=your-project-id-here
   ```

   You can find these in your [Browserbase Settings](https://browserbase.com/settings).

## Usage

### Basic Usage

```bash
# Scrape the default example event
npm run scrape

# Scrape a specific event
npm run scrape https://bileto.sympla.com.br/event/114143
```

### Programmatic Usage

```typescript
import { SymplaEventScraper } from "./src/sympla-scraper.js";

const scraper = new SymplaEventScraper();

const result = await scraper.scrape("https://bileto.sympla.com.br/event/114143", {
  includeAvailableDates: true,
  includeTicketSectors: true,
  timeout: 60000,
});

if (result.success) {
  console.log(result.event);
  console.log(`Session recording: ${result.sessionUrl}`);
}
```

### Output Example

```json
{
  "url": "https://bileto.sympla.com.br/event/114143",
  "title": "Espelho Mágico - TV Globo 60 Anos - O Musical",
  "description": "Musical inédito celebra os 60 anos da TV Globo...",
  "dateRange": {
    "start": "20 de Março",
    "end": "12 de Abril"
  },
  "schedule": [
    "Sexta e Sábado às 20h00",
    "Sábado às 16h00",
    "Domingo às 15h00",
    "Domingo às 19h00"
  ],
  "venue": {
    "name": "BTG Pactual Hall",
    "address": "R. Bento Branco de Andrade Filho, 722",
    "city": "São Paulo",
    "state": "São Paulo"
  },
  "ticketSectors": [
    {
      "name": "PLATEIA VIP",
      "priceRange": { "min": 175, "max": 350 },
      "available": true
    },
    {
      "name": "PLATEIA",
      "priceRange": { "min": 150, "max": 300 },
      "available": true
    },
    {
      "name": "BALCAO",
      "priceRange": { "min": 25, "max": 50 },
      "available": true
    }
  ],
  "availableDates": [
    {
      "date": "20 de Março",
      "dayOfWeek": "Sexta",
      "time": "20h00",
      "priceRange": { "min": 0, "max": 350 }
    }
  ],
  "scrapedAt": "2026-01-22T12:00:00.000Z"
}
```

## Type Definitions

```typescript
interface SymplaEvent {
  url: string;
  title: string;
  description: string;
  dateRange: { start: string; end: string };
  schedule: string[];
  venue: EventVenue;
  ticketSectors: TicketSector[];
  availableDates: EventDate[];
  imageUrl?: string;
  organizer?: string;
  scrapedAt: string;
}

interface TicketSector {
  name: string;
  priceRange: { min: number; max: number };
  available: boolean;
}

interface EventDate {
  date: string;
  dayOfWeek: string;
  time: string;
  priceRange?: { min: number; max: number };
}

interface EventVenue {
  name: string;
  address: string;
  city: string;
  state: string;
}
```

## Debugging

Every scraping session is recorded by Browserbase. After running the scraper, you'll see a session URL in the output:

```
Session Recording: https://browserbase.com/sessions/<session-id>
```

Visit this URL to:
- Watch a video replay of the scraping session
- Inspect the DOM at any point
- View network requests
- Check console logs

## Development

```bash
# Build TypeScript
npm run build

# Run in development mode
npm run dev

# Run tests (if available)
npm test
```

## License

MIT
