import type { Property } from "../types";
import { fetchProperties as simplyrets } from "./simplyrets";
import { fetchProperties as realtor16, enrichPool as realtor16Enrich } from "./realtor16";

function activeProvider(): string {
  return process.env.PROPERTY_PROVIDER ?? "simplyrets";
}

// Switch providers with the PROPERTY_PROVIDER env var. To add RentCast or a real
// RESO/MLS feed: write a module that returns Property[] and wire it in below.
export async function fetchPool(): Promise<Property[]> {
  switch (activeProvider()) {
    case "realtor16":
      return realtor16();
    case "simplyrets":
      return simplyrets(50);
    // case "rentcast":   return rentcast();
    default:
      return simplyrets(50);
  }
}

// Fill out each listing's photo gallery so the baked snapshot meets the
// minimum-photo guarantee. No-op for providers that already return full
// galleries from their search endpoint (e.g. simplyrets).
export async function enrichPool(props: Property[]): Promise<Property[]> {
  return activeProvider() === "realtor16" ? realtor16Enrich(props) : props;
}
