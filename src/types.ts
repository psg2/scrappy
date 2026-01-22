export interface TicketSection {
  name: string;
  minPrice: number;
  maxPrice: number;
  currency: string;
  available: boolean;
}

export interface EventDate {
  date: string;
  dayOfWeek: string;
  time?: string;
}

export interface Venue {
  name: string;
  address: string;
  city: string;
  state: string;
}

export interface SymplaEvent {
  title: string;
  description: string;
  imageUrl: string | null;
  venue: Venue | null;
  dateRange: string;
  schedule: string;
  dates: EventDate[];
  sections: TicketSection[];
  url: string;
}
