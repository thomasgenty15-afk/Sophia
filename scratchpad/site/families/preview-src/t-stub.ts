import { familiesFr } from "/Users/ahmedamara/Dev/Sophia 2/scratchpad/site/families/keys.fr";
const fr = familiesFr as Record<string, string>;
export function t(k: string): string { return fr[k] ?? `⟪${k}⟫`; }
