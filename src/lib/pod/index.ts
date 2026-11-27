import type { Env } from "../../types";
import { GelatoProvider } from "./_legacy/gelato";
import { MontinkProvider } from "./_legacy/montink";
import { PrintfulProvider } from "./printful";
import type { PodProvider } from "./types";

export type { PodProvider } from "./types";

/**
 * Reads Env.POD_PROVIDER and returns the matching adapter, already
 * configured with its API key. This is the only place that needs to know
 * every provider exists. Printful is the active provider. Gelato and
 * Montink live in ./_legacy/ and stay wired up here only as historical
 * reference adapters, not because either is expected to run.
 */
export function getPodProvider(env: Env): PodProvider {
  switch (env.POD_PROVIDER) {
    case "printful":
      return new PrintfulProvider(env.PRINTFUL_API_KEY);
    case "gelato":
      return new GelatoProvider(env.GELATO_API_KEY);
    case "montink":
      return new MontinkProvider(env.MONTINK_API_KEY);
    default:
      throw new Error(
        `Unknown POD_PROVIDER "${env.POD_PROVIDER}" — set it to "printful", "gelato" or "montink" in wrangler.toml [vars].`
      );
  }
}
