import type { Metadata } from "next";
import { LocalGame } from "../_components/LocalGame";

export const metadata: Metadata = {
  title: "Dillow — Local mode",
  description: "Guess the prices of real homes near you.",
};

export default function Local() {
  return <LocalGame />;
}
