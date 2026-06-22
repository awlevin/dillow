// The normalized shape every provider maps into. Add a new provider by
// writing a function that returns Property[] — the rest of the app is agnostic.
export type Property = {
  id: string;
  price: number; // the number the player is trying to guess (list or sold price)
  city: string;
  state: string;
  address?: string; // full street address — revealed only AFTER the game ends
  lat: number | null; // coordinates — revealed only AFTER the game ends (map pin)
  lon: number | null;
  beds: number | null;
  baths: number | null; // full + 0.5 * half
  sqft: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
  photos: string[];
};

// What the client may see BEFORE the game ends. Coordinates ARE included so a
// player can optionally peek at the location to inform their guess; the actual
// price and the street address remain hidden until the game ends.
export type PropertyClue = Omit<Property, "price" | "address">;

export function toClue(p: Property): PropertyClue {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { price, address, ...clue } = p;
  return clue;
}
