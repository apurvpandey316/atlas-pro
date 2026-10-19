import data from "@/data/countries.json";

export interface Country {
  id: string;
  name: string;
  region: string;
  subregion: string;
  lat: number;
  lng: number;
  landlocked: boolean;
  borders: string[];
  area: number;
  independent: boolean;
}

export const COUNTRIES: Country[] = data as Country[];
export const COUNTRY_BY_ID = new Map(COUNTRIES.map((c) => [c.id, c]));

export function getCountry(id: string): Country {
  const c = COUNTRY_BY_ID.get(id);
  if (!c) throw new Error(`Unknown country ${id}`);
  return c;
}

export const centerOf = (c: Country): [number, number] => [c.lng, c.lat];
