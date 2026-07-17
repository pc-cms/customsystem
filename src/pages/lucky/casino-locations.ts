export type LuckyLocation = {
  city: string;
  venue: string;
  address: string;
  mapsQuery: string;
  mapsDirectUrl?: string;
  websiteUrl?: string;
};

// Google Maps universal deep link: opens native Maps app on iOS/Android,
// web on desktop. Using text query keeps it resilient without a Places API key.
export const LUCKY_LOCATIONS: LuckyLocation[] = [
  {
    city: "Arusha",
    venue: "Ngorongoro Tourism Centre",
    address: "Ngorongoro Tourism Centre, Arusha, Tanzania",
    mapsQuery: "Premier Casino Arusha, Ngorongoro Tourism Centre",
    websiteUrl: "https://www.premiercasino.tz/arusha",
  },
  {
    city: "Mwanza",
    venue: "Rock City Mall",
    address: "Rock City Mall, Mwanza, Tanzania",
    mapsQuery: "Premier Casino Mwanza, Rock City Mall",
    websiteUrl: "https://www.premiercasino.tz/mwanza",
  },
  {
    city: "Dodoma",
    venue: "New Dodoma Hotel",
    address: "New Dodoma Hotel, Dodoma, Tanzania",
    mapsQuery: "Premier Casino Dodoma, New Dodoma Hotel",
    websiteUrl: "https://www.premiercasino.tz/dodoma",
  },
  {
    city: "Mbeya",
    venue: "City Park Garden",
    address: "City Park Garden, Mbeya, Tanzania",
    mapsQuery: "Premier Casino Mbeya, City Park Garden",
    mapsDirectUrl: "https://maps.app.goo.gl/djNSxDCA8pHjWSFE8",
    websiteUrl: "https://www.premiercasino.tz/mbeya",
  },
];

export const mapsUrl = (query: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
