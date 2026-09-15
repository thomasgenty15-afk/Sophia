// P10-D (rose-p8reval T9, eva-hard24 R1-B02 — 3e observation de la famille):
// VERROU STRUCTUREL de rétractation. La doctrine prompt (v7, P8-C) ne tient
// pas en run réel — l'objectif rétracté persiste en « récit d'abandon »
// (« a voulu arrêter l'idée d'arriver à zéro joint »). Ce module descend
// l'invariant au write-path : un contenu explicitement rétracté dans le lot
// (« oublie ça », « le retiens surtout pas ») ne produit JAMAIS un
// memory_item — ni son contenu, ni sa négation narrative. Déterministe,
// indépendant de la sortie LLM.
//
// P12-E (rose-hard25 R1-B02 — 4e observation): le CIBLAGE lit maintenant le
// complément APRÈS le marqueur (« oublie ce que je t'ai dit sur la
// natation ») — l'ancienne heuristique ne considérait que l'avant-marqueur
// et retombait sur le message user précédent entier, c'est-à-dire le MAUVAIS
// contenu (segment interdit faux au loader, item natation non droppé au
// memorizer). Résolution en 3 temps: complément post-marqueur → préfixe
// avant-marqueur → message précédent; le contenu rétracté est de plus
// recherché sur TOUS les messages user antérieurs du lot (il peut être à N
// tours de distance, « tout à l'heure »).
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

// P12-E (rose-hard25 R1-B02): tokens qui n'identifient JAMAIS le contenu
// rétracté dans le complément post-marqueur — méta-langage de la rétractation
// elle-même (« oublie ce que je viens de DIRE ») et anaphores temporelles
// (« tout à l'HEURE », « HIER ») qui datent la confidence sans la nommer.
const RETRACTION_COMPLEMENT_META = new Set([
  "oublie",
  "oublies",
  "oublier",
  "retiens",
  "retienne",
  "retiennes",
  "garde",
  "gardes",
  "gardez",
  "note",
  "notes",
  "noter",
  "efface",
  "effaces",
  "laisse",
  "laisses",
  "tomber",
  "dire",
  "dits",
  "dites",
  "viens",
  "prefere",
  "preferes",
  "retenir",
  "propos",
  "heure",
  "hier",
  "matin",
  "tantot",
  // Politesse — ne nomme jamais le contenu (« s'il te plaît », « merci »).
  "plait",
  "merci",
]);

/** Tokens de CONTENU du complément post-marqueur (ordre conservé) — vide si
 * le complément est purement anaphorique (« oublie ça », « tout ça »). */
function complementContentTokens(text: string): string[] {
  return normalizeRetraction(text)
    .split(/[^a-z0-9]+/)
    .filter((token) =>
      token.length >= 4 && !RETRACTION_STOPWORDS.has(token) &&
      !RETRACTION_COMPLEMENT_META.has(token)
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
 * Segments de contenu RÉTRACTÉ du lot — résolution en 3 temps (P12-E,
 * rose-hard25 R1-B02) :
 * 1. le complément APRÈS le marqueur (« oublie ce que je t'ai dit sur la
 *    natation ») nomme la cible quand il porte des tokens de contenu ; dans
 *    ce cas, tout message user ANTÉRIEUR du lot qui recouvre le complément
 *    est rétracté lui aussi (le contenu peut être à N tours de distance) ;
 * 2. sinon, le texte AVANT le marqueur dans le même message (≥ 25 chars) ;
 * 3. sinon (« oublie ça » seul, complément purement anaphorique), le message
 *    user PRÉCÉDENT entier — comportement d'origine conservé.
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
    // 1) Complément post-marqueur, borné à la même proposition et tronqué
    //    avant un éventuel marqueur SUIVANT (« ..., oublie ce que je viens de
    //    dire, je préfère pas... » est du méta-langage, pas un complément).
    const afterRaw = normalized.slice(match.index + match[0].length);
    let clause = String(afterRaw.split(/[.!?;\n]/)[0] ?? "");
    const nextMarker = RETRACTION_MARKERS.exec(clause);
    if (nextMarker && typeof nextMarker.index === "number") {
      clause = clause.slice(0, nextMarker.index);
    }
    // Le complément est la PREMIÈRE sous-proposition (virgules) portant des
    // tokens de contenu — la traîne de rationale (« sur la natation, c'est
    // mort ce projet ») ne dilue pas la cible et ne relève pas le seuil de
    // matching au point de rater l'item rétracté.
    let complement: string[] = [];
    for (const part of clause.split(",")) {
      const tokens = complementContentTokens(part);
      if (tokens.length > 0) {
        complement = tokens;
        break;
      }
    }
    if (complement.length > 0) {
      segments.push(complement.join(" "));
      // Le contenu rétracté peut être à N tours de distance (« oublie ce que
      // je t'ai dit tout à l'heure sur X ») : chaque message user antérieur
      // du lot qui recouvre le complément est un segment rétracté entier.
      const complementTokens = new Set(complement);
      for (let prior = 0; prior < index; prior += 1) {
        const priorNormalized = normalizeRetraction(
          String(userMessages[prior]?.content ?? ""),
        );
        if (!priorNormalized) continue;
        const overlap = tokensOverlapCount(
          significantTokens(priorNormalized),
          complementTokens,
        );
        if (overlap >= Math.min(2, complementTokens.size)) {
          segments.push(priorNormalized);
        }
      }
      continue;
    }
    // 2) Préfixe avant-marqueur (comportement d'origine).
    const before = normalized.slice(0, match.index).trim();
    if (before.length >= 25) {
      segments.push(before);
      continue;
    }
    // 3) Fallback message précédent — uniquement quand le complément est vide
    //    ou purement anaphorique (« oublie ça », « laisse tomber tout ça »).
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
  T extends { content?: unknown; content_text?: unknown },
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
    // P12-E (rose-hard25 R1-B02): le write-path réel (memorizer_async,
    // dry_run) passe des ValidatedMemoryItem qui portent `content_text`, pas
    // `content` — la lecture de `content` seul rendait le verrou INERTE sur
    // ce chemin (0 ligne guards `retraction_dropped` au run réel, seule la
    // write_policy LLM rattrapait). Les deux formes sont acceptées.
    const itemTokens = significantTokens(
      String(item?.content_text ?? item?.content ?? ""),
    );
    const retracted = segmentTokenSets.some((segmentTokens) => {
      const threshold = Math.min(2, segmentTokens.size);
      return tokensOverlapCount(itemTokens, segmentTokens) >= threshold;
    });
    if (retracted) dropped.push({ item, reason: "retracted_in_batch" });
    else kept.push(item);
  }
  return { kept, dropped };
}
