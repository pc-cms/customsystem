export type LuckyLocation = {
  city: string;
  venue: string;
  address: string;
  mapsQuery: string;
  comingSoon?: boolean;
};

// Google Maps universal deep link: opens native Maps app on iOS/Android,
// web on desktop. Using text query keeps it resilient without a Places API key.
export const LUCKY_LOCATIONS: LuckyLocation[] = [
  {
    city: "Arusha",
    venue: "Ngorongoro Tourism Centre",
    address: "Ngorongoro Tourism Centre, Arusha, Tanzania",
    mapsQuery: "Premier Casino Arusha, Ngorongoro Tourism Centre",
  },
  {
    city: "Mwanza",
    venue: "Rock City Mall",
    address: "Rock City Mall, Mwanza, Tanzania",
    mapsQuery: "Premier Casino Mwanza, Rock City Mall",
  },
  {
    city: "Dodoma",
    venue: "New Dodoma Hotel",
    address: "New Dodoma Hotel, Dodoma, Tanzania",
    mapsQuery: "Premier Casino Dodoma, New Dodoma Hotel",
  },
  {
    city: "Mbeya",
    venue: "City Park Garden",
    address: "City Park Garden, Mbeya, Tanzania",
    mapsQuery: "Premier Casino Mbeya, City Park Garden",
  },
];

export const mapsUrl = (query: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
