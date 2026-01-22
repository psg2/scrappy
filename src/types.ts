export interface TicketSector {
  name: string;
  priceRange: {
    min: number;
    max: number;
  };
  available: boolean;
}

export interface EventDate {
  date: string;
  dayOfWeek: string;
  time: string;
  priceRange?: {
    min: number;
    max: number;
  };
}

export interface EventVenue {
  name: string;
  address: string;
  city: string;
  state: string;
}

export interface SymplaEvent {
  url: string;
  title: string;
  description: string;
  dateRange: {
    start: string;
    end: string;
  };
  schedule: string[];
  venue: EventVenue;
  ticketSectors: TicketSector[];
  availableDates: EventDate[];
  imageUrl?: string;
  organizer?: string;
  scrapedAt: string;
}

export interface ScrapeOptions {
  includeAvailableDates?: boolean;
  includeTicketSectors?: boolean;
  timeout?: number;
}

export interface ScrapeResult {
  success: boolean;
  event?: SymplaEvent;
  error?: string;
  sessionId?: string;
  sessionUrl?: string;
}
