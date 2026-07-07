import type { Env } from "../../types";
import { GelatoProvider } from "./gelato";
import { MontinkProvider } from "./montink";
import type { PodProvider } from "./types";

export type { PodProvider } from "./types";

/** Reads Env.POD_PROVIDER and returns the matching adapter, already
 *  configured with its API key. This is the only place that needs to
 *  know both providers exist. */
export function getPodProvider(env: Env): PodProvider {
  switch (env.POD_PROVIDER) {
    case "gelato":
      return new GelatoProvider(env.GELATO_API_KEY);
    case "montink":
      return new MontinkProvider(env.MONTINK_API_KEY);
    default:
      throw new Error(
        `Unknown POD_PROVIDER "${env.POD_PROVIDER}" — set it to "gelato" or "montink" in wrangler.toml [vars].`
      );
  }
}
