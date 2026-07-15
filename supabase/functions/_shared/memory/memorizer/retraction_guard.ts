// P10-D (rose-p8reval T9, eva-hard24 R1-B02 — 3e observation de la famille):
// VERROU STRUCTUREL de rétractation. La doctrine prompt (v7, P8-C) ne tient
// pas en run réel — l'objectif rétracté persiste en « récit d'abandon »
// (« a voulu arrêter l'idée d'arriver à zéro joint »). Ce module descend
// l'invariant au write-path : un contenu explicitement rétracté dans le lot
// (« oublie ça », « le retiens surtout pas ») ne produit JAMAIS un
// memory_item — ni son contenu, ni sa négation narrative. Déterministe,
// indépendant de la sortie LLM.
//
// Anti-FP encadrés :
// - un échec RACONTÉ sans instruction d'oubli (« j'ai arrêté au bout de deux
//   jours ») ne porte aucun marqueur → rien n'est filtré ;
// - la rétractation ne touche que les items qui RECOUVRENT le segment
//   rétracté (tokens significatifs, tolérance morphologique) — les autres
//   items du lot survivent.
//
// Condition de suppression (registre P6-0) : extraction LLM fiable sur la
// rétractation (0 drop sur 3 vagues consécutives).

import type { MemorizerMessage } from "./types.ts";

const RETRACTION_MARKERS =
  /\b(oublie (ca|ce que je viens de dire|ce que je t ai dit|tout ca|le)|(le|la|les) retiens (surtout |vraiment )?pas|retiens (surtout |vraiment )?pas (ca|ce truc)|(ne )?(le |la |les )?(retiens|garde|note|notes) (surtout )?pas( ca| ce truc)?( comme| pour| en)?|garde (surtout )?pas (ca|ce truc)|efface (ca|ce que j ai dit)|laisse tomber en fait|je prefere (ne )?pas (que tu (le |la )?(retiennes|gardes|notes)|me coller cette pression)|c est pas (a|à) retenir)\b/;

function normalizeRetraction(text: string): string {
  return String(text ?? "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const RETRACTION_STOPWORDS = new Set([
  "pour", "dans", "avec", "mais", "donc", "quoi", "chose", "truc", "vraiment",
  "important", "suite", "veux", "faut", "fait", "faire", "sais", "juste",
  "genre", "comme", "cette", "cela", "elle", "elles", "nous", "vous", "leur",
  "tout", "tous", "toute", "toutes", "bien", "plus", "moins", "alors",
  "aussi", "encore", "jamais", "toujours", "quand", "sinon", "apres", "avant",
]);

function significantTokens(text: string): Set<string> {
  return new Set(
    normalizeRetraction(text)
      .split(/[^a-z0-9]+/)
      .filter((token) =>
        token.length >= 4 && !RETRACTION_STOPWORDS.has(token)
      ),
  );
}

function tokensOverlapCount(a: Set<string>, b: Set<string>): number {
  const morphMatch = (x: string, y: string) => {
    if (x === y) return true;
    const shared = Math.min(x.length, y.length);
    if (shared < 5) return false;
    return x.slice(0, 5) === y.slice(0, 5);
  };
  let hits = 0;
  for (const tokenA of a) {
    for (const tokenB of b) {
      if (morphMatch(tokenA, tokenB)) {
        hits += 1;
        break;
      }
    }
  }
  return hits;
}

/**
 * Segments de contenu RÉTRACTÉ du lot : pour chaque message user portant un
 * marqueur d'oubli, le texte AVANT le marqueur dans le même message ; si le
 * marqueur ouvre le message (< 25 caractères avant lui), la cible est le
 * message user PRÉCÉDENT entier (« oublie ça » seul renvoie au tour d'avant).
 */
export function retractedContentSegments(
  messages: Pick<MemorizerMessage, "role" | "content">[],
): string[] {
  const segments: string[] = [];
  const userMessages = (messages ?? []).filter((message) =>
    String(message?.role ?? "") === "user"
  );
  for (let index = 0; index < userMessages.length; index += 1) {
    const normalized = normalizeRetraction(
      String(userMessages[index]?.content ?? ""),
    );
    const match = RETRACTION_MARKERS.exec(normalized);
    if (!match || typeof match.index !== "number") continue;
    const before = normalized.slice(0, match.index).trim();
    if (before.length >= 25) {
      segments.push(before);
      continue;
    }
    const previous = String(userMessages[index - 1]?.content ?? "").trim();
    if (previous) segments.push(normalizeRetraction(previous));
    if (before) segments.push(before);
  }
  return segments.filter(Boolean);
}

export type RetractionFilterDecision<T> = {
  kept: T[];
  dropped: Array<{ item: T; reason: "retracted_in_batch" }>;
};

/**
 * Filtre les items candidats dont le contenu recouvre un segment rétracté du
 * lot. Le seuil exige au moins 2 tokens significatifs partagés (1 seul si le
 * segment n'en porte pas plus) — le « récit d'abandon » recouvre toujours le
 * contenu qu'il raconte, il tombe avec lui.
 */
export function filterRetractedMemoryItems<
  T extends { content?: unknown },
>(
  items: T[],
  messages: Pick<MemorizerMessage, "role" | "content">[],
): RetractionFilterDecision<T> {
  const segments = retractedContentSegments(messages);
  if (segments.length === 0) return { kept: items, dropped: [] };
  const segmentTokenSets = segments.map(significantTokens)
    .filter((tokens) => tokens.size > 0);
  if (segmentTokenSets.length === 0) return { kept: items, dropped: [] };
  const kept: T[] = [];
  const dropped: Array<{ item: T; reason: "retracted_in_batch" }> = [];
  for (const item of items) {
    const itemTokens = significantTokens(String(item?.content ?? ""));
    const retracted = segmentTokenSets.some((segmentTokens) => {
      const threshold = Math.min(2, segmentTokens.size);
      return tokensOverlapCount(itemTokens, segmentTokens) >= threshold;
    });
    if (retracted) dropped.push({ item, reason: "retracted_in_batch" });
    else kept.push(item);
  }
  return { kept, dropped };
}
