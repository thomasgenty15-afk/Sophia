/**
 * LE DOCUMENT DU COACH — son ebook, son manuel, sa FAQ, lus une fois.
 * ===========================================================================
 *
 * Autorité: docs/keel/MODEL.md, docs/keel/CONTRACT.md, et l'en-tête de
 * `coach-protocol-v1/index.ts` (« le modèle n'écrit jamais de nutrition »).
 *
 * ── LE PROBLÈME QUE ÇA RÉSOUT ───────────────────────────────────────────
 * L'interview (`doctrine_versions.ts`) demande au coach onze réponses écrites
 * à la main. C'est le bon chemin quand il n'a rien; c'est un mur quand il a
 * déjà deux cents pages qui disent tout ça. Un coach avec un ebook ne veut pas
 * re-rédiger son ebook dans onze textareas — et s'il doit le faire, il ne le
 * fait pas, et son agent reste muet.
 *
 * ── CE QUI CHANGE PAR RAPPORT À L'INTERVIEW, ET CE QUI NE CHANGE PAS ────
 * NE CHANGE PAS: la règle de transcription. `DOCTRINE_COMPILE_SYSTEM_PROMPT`
 * est réutilisé mot pour mot — pas recopié, IMPORTÉ. Deux prompts qui disent
 * « n'invente rien » avec deux formulations divergent au premier ajout, et la
 * divergence est invisible: les deux chemins produisent du JSON valide.
 *
 * CHANGE: la nature de la matière. Une réponse d'interview est ENTIÈREMENT du
 * coach — il vient de l'écrire, pour nous. Un document ne l'est pas:
 *
 *   · il contient des recettes, des tableaux, des listes de courses, des
 *     citations d'autres auteurs, des rappels de nutrition générale;
 *   · il MENTIONNE des dizaines d'aliments sans prendre position dessus.
 *
 * D'où la garde centrale de ce fichier: **toute proposition d'aliment porte
 * une CITATION du document**, et une proposition sans citation est jetée ici,
 * avant la base (qui la refuserait aussi — `quote text not null`). Ce n'est
 * pas de la ceinture-bretelle décorative: la citation est ce qui permet au
 * coach de trancher en une seconde, et c'est le seul signal qui distingue
 * « le document le dit » de « le modèle l'a déduit ».
 *
 * ── POURQUOI LA FUSION, ET PAS LE REMPLACEMENT ──────────────────────────
 * L'interview REMPLACE (elle est destructrice, et l'écran le dit). Un document
 * ne peut pas se permettre ça: un coach a un ebook ET une FAQ ET la
 * transcription d'une conférence, et `assertValidVisionMedia` n'accepte qu'un
 * PDF à la fois. Sans fusion, déposer le deuxième document effacerait le
 * premier — en silence, puisque l'écran afficherait bien quelque chose.
 *
 * RÈGLE DE FUSION, une seule et elle tient en une phrase: **ce qui est déjà à
 * l'écran gagne, et le nouveau ne remplit que les trous.** Le coach a REGARDÉ
 * ce qui est là; l'arrivant, non. Le corollaire compte autant: un `instead`
 * absent qui se remplit est un interdit qui passe d'un refus sec à une vraie
 * réponse, donc les trous se remplissent vraiment, ils ne sont pas ignorés
 * par prudence.
 *
 * PUR: aucune I/O, aucune horloge, aucun hasard. Tout ce qui est décidable
 * l'est ici, dans `doctrine_document_test.ts`.
 */

import { deriveBeliefKey } from "./doctrine.ts";
import { DOCTRINE_COMPILE_SYSTEM_PROMPT } from "./doctrine_versions.ts";
import {
  boundQuote,
  type CitationKind,
  citationEntryKey,
  dedupeCitations,
  type ExtractedCitation,
} from "./document_corpus.ts";

// ---------------------------------------------------------------------------
// LES PLAFONDS — et pourquoi ils sont ici et pas dans l'edge function
// ---------------------------------------------------------------------------
//
// L'écran doit refuser un fichier trop lourd AVANT de l'encoder en base64 et de
// le pousser sur le réseau; le serveur doit le refuser aussi, parce qu'un
// client n'est pas une garde. Deux nombres écrits à deux endroits finissent par
// différer, et la différence se manifeste comme « le bouton accepte, le serveur
// rejette » — le pire des deux mondes. Le front importe ces constantes.

/**
 * Le poids du PDF, en octets.
 *
 * Contrainte réelle: les octets voyagent en base64 DANS le corps JSON de la
 * requête (comme `plan-import-v1`, qui plafonne à 8 000 000 caractères base64).
 * base64 gonfle de 4/3, donc 6 Mo d'octets ≈ 8 Mo de chaîne. On garde la même
 * borne que le précédent plutôt que d'en inventer une seconde.
 *
 * En pratique un ebook de méthode, qui est du texte, pèse 1 à 5 Mo. Ce qui
 * dépasse est un PDF de pages SCANNÉES — que la vision lit très bien, mais
 * dont le coach doit savoir qu'il faut le découper.
 */
export const MAX_DOCUMENT_BYTES = 6_000_000;

/** La borne côté chaîne, celle que le serveur peut tester sans décoder. */
export const MAX_DOCUMENT_BASE64_CHARS = 8_000_000;

/**
 * Le nombre de pages.
 *
 * ⚠️ CE NOMBRE EST UN PLAFOND DE PRUDENCE, PAS UNE MESURE. La contrainte qui
 * mord n'est pas le modèle (Gemini lit un PDF de mille pages) mais l'horloge de
 * la fonction edge: `plan-import-v1` a été MESURÉ à 61 s sur un PDF de plan
 * (docs/keel/BUILD_PLAN.md), et un document de méthode est bien plus long.
 * 120 pages tient dans le `timeoutMs` de 120 s avec de la marge.
 *
 * À REMESURER au premier document réel: si un ebook de 200 pages passe en 70 s,
 * ce plafond doit monter, et le message d'erreur qui dit « découpe ton
 * document » n'aura plus de raison d'être.
 */
export const MAX_DOCUMENT_PAGES = 120;

// ---------------------------------------------------------------------------
// LE PROMPT
// ---------------------------------------------------------------------------

/**
 * Le prompt d'interview, PLUS ce qu'un document change.
 *
 * L'ordre compte: les règles de transcription arrivent en premier et gouvernent
 * tout; ce qui suit ne les assouplit jamais, il ne fait que les resserrer.
 */
export const DOCUMENT_COMPILE_SYSTEM_PROMPT = `${DOCTRINE_COMPILE_SYSTEM_PROMPT}

════════════════════════════════════════════════════════════════════════
YOU ARE READING A DOCUMENT THE COACH WROTE, NOT AN INTERVIEW HE JUST GAVE.
════════════════════════════════════════════════════════════════════════

Everything above still holds, and one thing gets harder. An interview answer is entirely the coach speaking to us. A document is not: it also contains recipes, shopping lists, meal tables, other people's studies, general nutrition background, disclaimers, and hundreds of foods that are merely NAMED in passing. None of that is doctrine.

Only what the document ASSERTS AS THE COACH'S OWN POSITION becomes an entry. A sentence he quotes from a study is not his belief. A food that appears in a recipe is not a food he recommends. A caution copied from a health authority is not one of his interdictions. When you cannot tell whether he is stating his position or reporting someone else's, leave it out — the coach will add it in two clicks, and he can never remove what he does not know is there.

Prefer FEW strong entries over many weak ones. A doctrine of eight convictions he recognises is worth more than thirty he has to audit.

TWO CHANGES TO THE SHAPE, and no others.

CHANGE 1 — every entry you produce may carry an extra "quote" field: the passage of the document that entry comes from, COPIED VERBATIM, in the document's own language, under 400 characters. It applies to entries in beliefs, forbidden, vocabulary, arbitrations, foods.discouraged and qa.

  "beliefs": [{ "claim": "...", "rationale": "..."|null, "goal_scope": [], "quote": "..." }]

WHAT THE QUOTE IS FOR. The coach reads his draft next to his own sentences and decides in seconds instead of auditing. It is also kept so that his document can be re-read later without asking him for the file again.

  - COPY it, never paraphrase, never translate, never assemble it from two places. A quote that does not actually say what the entry claims is worse than no quote: he reads it, sees it does not match, and stops trusting every other line.
  - This field is OPTIONAL and it never removes an entry. If a conviction is spread over three pages and no single passage states it, produce the entry with NO quote rather than stitching one together. This is the opposite of the food_proposals rule below, and deliberately so: he reads a belief and judges it directly, where a food rule he accepts blind needs its evidence attached.
  - The quote is not part of the doctrine and is never shown to a student. Do not put it in "rationale", "reason" or "instead" to make it visible.

CHANGE 2 — one extra top-level key:

  "food_proposals": [{ "term": "...", "stance": "encouraged"|"discouraged"|"excluded", "food_group_ref": "<one of the allowed slugs>", "quote": "..." }]

WHAT food_proposals IS FOR. The coach has a separate screen listing the foods he builds plates with. This key pre-fills it from his own document, and every entry is shown to him next to its quote before anything is written.

RULES, and the first one is absolute:

- "quote": a passage COPIED VERBATIM from the document, in the document's own language, that states this position about this food. Never paraphrase it, never translate it, never assemble it from two places. If you cannot point at a sentence, THERE IS NO ENTRY — drop it. An entry whose quote does not actually say what you claim is worse than a missing entry: the coach reads the quote, sees it does not match, and stops trusting every other line on the screen. Keep it under 400 characters; if the passage is longer, quote the sentence that carries the position, not the paragraph around it.
- A food that is merely mentioned produces NOTHING. Appearing in a recipe, in a meal plan, in a shopping list or in a table is not a position. The document must say something ABOUT it.
- "stance": "encouraged" = he builds with it. "discouraged" = he'd rather his students didn't, but it is not a red line. "excluded" = he keeps it off the plate. Do not upgrade a preference into an exclusion: "I'm not a fan of x" is discouraged, "x never goes on the plate" is excluded.
- "food_group_ref": one slug, from the allowed list given in the user message, and nothing else. This vocabulary is closed — it is what a photo of a plate gets compared against. If no slug fits the food, drop the entry rather than inventing a slug or forcing a wrong one.
- "term": the food as HE names it, kept short (under 80 characters). His words, not the catalogue's.
- One entry per food. If the document takes the same position twice, that is still one entry, with the clearest of the two quotes.
- foods.discouraged (the doctrine key, further up) and food_proposals are NOT duplicates of each other and you fill both when both apply: the doctrine list carries SURFACE FORMS for a text filter that scans what the agent writes; food_proposals carries a GROUP for the coach's plate-building screen. They answer two different questions about the same food.

If the document takes no position on any food, return "food_proposals": [] and say nothing about it.`;

/** Le message utilisateur: le vocabulaire fermé, et rien d'autre. */
export function buildDocumentUserMessage(
  allowedGroupSlugs: readonly string[],
  fileName?: string | null,
): string {
  const name = String(fileName ?? "").trim();
  return [
    "THE COACH'S DOCUMENT is attached as media.",
    name ? `Its file name is ${JSON.stringify(name)}, which may or may not mean anything.` : "",
    "",
    "Allowed food_group_ref slugs, and no others:",
    allowedGroupSlugs.join("\n"),
  ].filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// LA SORTIE
// ---------------------------------------------------------------------------

export type ProposalStance = "encouraged" | "discouraged" | "excluded";

export interface FoodProposal {
  term: string;
  stance: ProposalStance;
  foodGroupRef: string;
  quote: string;
}

/**
 * La doctrine dans la forme que l'ÉDITEUR lit et que `save` écrit: snake_case,
 * telle que `toEditorShape` la rend. Volontairement lâche — ce module fusionne
 * et déduplique, il ne valide pas: `parseCoachDoctrine` le fait déjà, mieux, et
 * en rendant des `issues` que le coach lit.
 */
export type DoctrineDraft = Record<string, unknown>;

const STANCES: readonly string[] = ["encouraged", "discouraged", "excluded"];

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map((x) => (x ?? {}) as Record<string, unknown>)
    : [];
}

/**
 * La clé de dédup d'un texte libre: replié, sans ponctuation, sans accents.
 *
 * « Huile de tournesol » et « huile de tournesol. » sont le même aliment, et
 * les laisser cohabiter ferait apparaître deux lignes identiques à l'écran —
 * ce qui donne au coach l'impression que le second document n'a rien apporté
 * tout en lui donnant deux fois plus à trier.
 */
export function foldTerm(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface DocumentExtraction {
  /** Le brouillon de doctrine, forme éditeur. */
  draft: DoctrineDraft;
  proposals: FoodProposal[];
  /**
   * LES CITATIONS, retirées du brouillon et rendues à part.
   *
   * ── POURQUOI ELLES NE RESTENT PAS DANS LE BROUILLON ────────────────────
   * Le brouillon part à l'écran, revient par `save`, et atterrit dans
   * `coach_doctrines`. Une citation qui voyagerait dedans se ferait jeter
   * silencieusement par `parseCoachDoctrine` (qui ignore les champs qu'il ne
   * connaît pas) — on aurait payé la citation sans jamais la garder. Pire, si
   * un jour le parseur la gardait, elle finirait recopiée dans le bloc
   * compilé, c'est-à-dire des pages d'ebook injectées à chaque tour.
   *
   * Elles vivent donc dans `coach_document_citations`, à côté du corpus, et le
   * brouillon rendu ici est EXACTEMENT celui d'avant ce lot.
   */
  citations: ExtractedCitation[];
  /** Ce qui a été jeté, et pourquoi. Le coach les lit. */
  issues: string[];
}

/**
 * Lit la sortie du modèle.
 *
 * `allowedGroupSlugs` est le vocabulaire fermé. Une proposition qui le rate est
 * JETÉE et comptée, jamais rabattue sur un groupe voisin: un slug faux ferait
 * comparer une photo à une méthode que le coach n'a pas écrite, et le coach ne
 * pourrait pas le voir — la ligne s'afficherait normalement.
 */
export function parseDocumentExtraction(
  raw: unknown,
  allowedGroupSlugs: readonly string[],
): DocumentExtraction {
  const issues: string[] = [];
  const payload = (raw ?? {}) as Record<string, unknown>;
  const allowed = new Set(allowedGroupSlugs.map((s) => str(s)));

  const proposals: FoodProposal[] = [];
  const seen = new Set<string>();
  for (const [i, entry] of list(payload.food_proposals).entries()) {
    const where = `food_proposals[${i}]`;
    const term = str(entry.term);
    if (!term) {
      issues.push(`${where}: no food named, dropped`);
      continue;
    }
    // LA GARDE. Voir l'en-tête: sans citation, ce n'est pas une lecture.
    const quote = str(entry.quote);
    if (!quote) {
      issues.push(`${where}: ${JSON.stringify(term)} came with no quote from your document, dropped`);
      continue;
    }
    const stance = str(entry.stance);
    if (!STANCES.includes(stance)) {
      issues.push(`${where}: ${JSON.stringify(term)} has an unreadable stance, dropped`);
      continue;
    }
    const groupRef = str(entry.food_group_ref);
    if (!allowed.has(groupRef)) {
      issues.push(
        `${where}: ${JSON.stringify(term)} was filed under an unknown food group ` +
          `${JSON.stringify(groupRef)}, dropped`,
      );
      continue;
    }
    const key = foldTerm(term);
    if (!key || seen.has(key)) {
      if (seen.has(key)) issues.push(`${where}: ${JSON.stringify(term)} named twice, kept once`);
      continue;
    }
    seen.add(key);
    proposals.push({
      term: term.slice(0, 80),
      stance: stance as ProposalStance,
      foodGroupRef: groupRef,
      // Tronqué plutôt que jeté: une citation trop longue reste utilisable
      // pour décider, et la base la refuserait au-delà de 400.
      quote: quote.length > 400 ? `${quote.slice(0, 397)}...` : quote,
    });
  }

  // `food_proposals` ne fait PAS partie de la doctrine et ne doit pas atterrir
  // dans `coach_doctrines`: ce serait une seconde liste d'aliments à côté du
  // mapping, exactement la divergence que `foods.recommended` a coûté
  // (voir l'en-tête de `DoctrineFoods` dans doctrine.ts).
  const { food_proposals: _dropped, ...doctrinePayload } = payload;

  // LES CITATIONS SORTENT DU BROUILLON. Voir `DocumentExtraction.citations`:
  // le brouillon rendu est exactement celui d'avant ce lot, `quote` compris —
  // c'est-à-dire sans.
  const citations: ExtractedCitation[] = [];
  const draft = stripQuotes(doctrinePayload as DoctrineDraft, citations);

  // Les propositions d'aliments portent DÉJÀ leur citation (elle est
  // obligatoire chez elles). On les range au même endroit que les autres pour
  // que « d'où vient cette ligne » ait une seule réponse et une seule table.
  for (const p of proposals) {
    citations.push({ kind: "food", entryKey: citationEntryKey(p.term), quote: boundQuote(p.quote) });
  }

  return { draft, proposals, citations: dedupeCitations(citations), issues };
}

/** Où se trouve la clé naturelle d'une entrée, par section. */
const CITED_SECTIONS: readonly { path: readonly string[]; kind: CitationKind; keyField: string }[] =
  [
    { path: ["beliefs"], kind: "belief", keyField: "claim" },
    { path: ["forbidden"], kind: "forbidden", keyField: "token" },
    { path: ["vocabulary"], kind: "vocabulary", keyField: "term" },
    { path: ["arbitrations"], kind: "arbitration", keyField: "situation" },
    { path: ["qa"], kind: "qa", keyField: "question" },
    { path: ["foods", "discouraged"], kind: "food", keyField: "term" },
  ];

/**
 * Retire `quote` de chaque entrée du brouillon et le range en citation.
 *
 * Rend une COPIE: muter le payload rendu par le modèle marcherait aussi, et
 * rendrait ce module dépendant du fait que personne d'autre ne le lit — un
 * pari qui se perd au premier appelant ajouté.
 *
 * Une entrée sans clé naturelle (un `claim` vide) ne produit pas de citation:
 * `parseCoachDoctrine` va la jeter de toute façon, et une citation orpheline
 * s'afficherait en face de rien.
 */
function stripQuotes(draft: DoctrineDraft, into: ExtractedCitation[]): DoctrineDraft {
  const out: DoctrineDraft = { ...draft };

  for (const section of CITED_SECTIONS) {
    const [head, nested] = section.path;
    const container = nested
      ? (out[head] ?? null) as Record<string, unknown> | null
      : null;
    const rawList = nested ? container?.[nested] : out[head];
    if (!Array.isArray(rawList)) continue;

    const cleaned = rawList.map((raw) => {
      const entry = { ...((raw ?? {}) as Record<string, unknown>) };
      const quote = boundQuote(entry.quote);
      delete entry.quote;
      const key = citationEntryKey(entry[section.keyField]);
      if (quote && key) into.push({ kind: section.kind, entryKey: key, quote });
      return entry;
    });

    if (nested) out[head] = { ...(container ?? {}), [nested]: cleaned };
    else out[head] = cleaned;
  }
  return out;
}

// ---------------------------------------------------------------------------
// LA FUSION
// ---------------------------------------------------------------------------

/**
 * `base` gagne, `incoming` remplit les trous.
 *
 * Deux comportements à ne pas confondre, et le test les pique tous les deux:
 *
 *   ENTRÉE CONNUE  → l'entrée de `base` est gardée, et ses champs VIDES sont
 *                    remplis depuis l'arrivante. Les `surface_forms` sont
 *                    UNIES: plus de formulations = un verrou déterministe qui
 *                    attrape plus, et il n'y a aucun coût à en avoir une de
 *                    trop (`forbidden_matcher` matche, il ne juge pas).
 *   ENTRÉE INCONNUE→ ajoutée à la fin, dans l'ordre du document.
 *
 * `voice` suit la même règle champ par champ: un choix déjà pris ne bouge pas.
 * Écraser la voix serait le pire cas — c'est le réglage le plus visible dans
 * les réponses, et le coach l'attribuerait à une régression de l'agent.
 */
export function mergeDoctrineDrafts(
  base: DoctrineDraft | null,
  incoming: DoctrineDraft,
): DoctrineDraft {
  if (!base) return { ...incoming };

  const pickString = (a: unknown, b: unknown): string | null => {
    const kept = str(a);
    if (kept) return kept;
    const filled = str(b);
    return filled || null;
  };

  const unionForms = (a: unknown, b: unknown): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const source of [a, b]) {
      if (!Array.isArray(source)) continue;
      for (const value of source) {
        const form = str(value);
        const key = foldTerm(form);
        if (!form || !key || seen.has(key)) continue;
        seen.add(key);
        out.push(form);
      }
    }
    return out;
  };

  /**
   * Le moteur commun. `keyOf` décide de ce qu'« être la même entrée » veut
   * dire, `fill` décide de ce qu'on récupère de l'arrivante.
   */
  const mergeList = (
    field: string,
    keyOf: (entry: Record<string, unknown>) => string,
    fill: (
      kept: Record<string, unknown>,
      arriving: Record<string, unknown>,
    ) => Record<string, unknown>,
  ): Record<string, unknown>[] => {
    const out: Record<string, unknown>[] = [];
    const index = new Map<string, number>();
    for (const entry of list(base[field])) {
      const key = keyOf(entry);
      if (!key) {
        out.push(entry);
        continue;
      }
      if (index.has(key)) continue;
      index.set(key, out.length);
      out.push(entry);
    }
    for (const entry of list(incoming[field])) {
      const key = keyOf(entry);
      if (!key) continue;
      const at = index.get(key);
      if (at === undefined) {
        index.set(key, out.length);
        out.push(entry);
        continue;
      }
      out[at] = fill(out[at], entry);
    }
    return out;
  };

  const beliefs = mergeList(
    "beliefs",
    // La clé du plan de semaine, pas le texte: le document reformule la même
    // conviction avec une virgule ailleurs, et deux entrées naîtraient là où le
    // coach n'en reconnaît qu'une.
    (e) => str(e.key) || deriveBeliefKey(str(e.claim)),
    (kept, arriving) => ({
      ...kept,
      rationale: pickString(kept.rationale, arriving.rationale),
    }),
  );

  const forbidden = mergeList(
    "forbidden",
    (e) => str(e.token),
    (kept, arriving) => ({
      ...kept,
      surface_forms: unionForms(kept.surface_forms, arriving.surface_forms),
      reason: pickString(kept.reason, arriving.reason),
      // LE TROU QUI COMPTE LE PLUS. Sans `instead`, le verrou dégrade en refus
      // sec, et l'élève de masterclasse n'a aucun canal pour demander mieux.
      instead: pickString(kept.instead, arriving.instead),
    }),
  );

  const vocabulary = mergeList(
    "vocabulary",
    (e) => foldTerm(str(e.term)),
    (kept, arriving) => ({ ...kept, meaning: pickString(kept.meaning, arriving.meaning) }),
  );

  const arbitrations = mergeList(
    "arbitrations",
    (e) => foldTerm(str(e.situation)),
    (kept) => kept,
  );

  const qa = mergeList("qa", (e) => foldTerm(str(e.question)), (kept) => kept);

  const baseFoods = (base.foods ?? {}) as Record<string, unknown>;
  const incomingFoods = (incoming.foods ?? {}) as Record<string, unknown>;
  // `foods` est imbriqué, donc hors de portée de `mergeList` qui indexe à la
  // racine. Même règle, écrite une fois de plus plutôt qu'un `mergeList`
  // généralisé aux chemins — un sélecteur de chemin pour UN seul cas coûte
  // plus à lire qu'il ne fait gagner.
  const discouraged = mergeDiscouraged(
    baseFoods.discouraged,
    incomingFoods.discouraged,
    unionForms,
    pickString,
  );

  const baseVoice = (base.voice ?? {}) as Record<string, unknown>;
  const incomingVoice = (incoming.voice ?? {}) as Record<string, unknown>;
  const voice: Record<string, unknown> = { ...incomingVoice, ...stripEmpty(baseVoice) };

  return {
    ...base,
    beliefs,
    forbidden,
    vocabulary,
    arbitrations,
    foods: { ...baseFoods, discouraged },
    qa,
    voice,
  };
}

/** Les champs renseignés seulement: un `null` de `base` ne doit pas masquer une valeur. */
function stripEmpty(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === null || v === undefined || String(v).trim() === "") continue;
    out[k] = v;
  }
  return out;
}

function mergeDiscouraged(
  baseList: unknown,
  incomingList: unknown,
  unionForms: (a: unknown, b: unknown) => string[],
  pickString: (a: unknown, b: unknown) => string | null,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const index = new Map<string, number>();
  for (const entry of list(baseList)) {
    const key = foldTerm(str(entry.term));
    if (!key || index.has(key)) continue;
    index.set(key, out.length);
    out.push(entry);
  }
  for (const entry of list(incomingList)) {
    const key = foldTerm(str(entry.term));
    if (!key) continue;
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, out.length);
      out.push(entry);
      continue;
    }
    out[at] = {
      ...out[at],
      surface_forms: unionForms(out[at].surface_forms, entry.surface_forms),
      reason: pickString(out[at].reason, entry.reason),
    };
  }
  return out;
}
