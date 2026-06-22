import type { Property } from "../types";
import { fetchProperties as simplyrets } from "./simplyrets";
import { fetchProperties as realtor16 } from "./realtor16";

// Switch providers with the PROPERTY_PROVIDER env var. To add RentCast or a real
// RESO/MLS feed: write a module that returns Property[] and wire it in below.
export async function fetchPool(): Promise<Property[]> {
  const provider = process.env.PROPERTY_PROVIDER ?? "simplyrets";
  switch (provider) {
    case "realtor16":
      return realtor16();
    case "simplyrets":
      return simplyrets(50);
    // case "rentcast":   return rentcast();
    default:
      return simplyrets(50);
  }
}
