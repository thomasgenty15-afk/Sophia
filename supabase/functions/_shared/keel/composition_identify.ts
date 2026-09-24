/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-24 — RETROUVER UN ALIMENT QUE LE MODÈLE A MAL NOMMÉ. PUR.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, MESURÉ SUR LE BROUILLON `377e91ad` ─────────────────────────
 * Le catalogue servi au modèle garde huit légumes « non féculents » sur 95,
 * classés par nombre d'alias : la courgette (4 alias) arrive 23e et n'y est
 * pas. Le modèle a écrit « courgette · ref zucchini » ; `zucchini` n'est pas un
 * slug, la ligne a été refusée, la casserole est restée sans énergie, le
 * déjeuner du mardi sans portion — et la réparation a servi un second déjeuner
 * à chacun. Sur les 49 plans des dix jours précédents : la courgette nommée
 * juste 12 fois, inventée 2 fois, pesée comme un poivron 1 fois ; aubergine,
 * concombre et avocat, jamais.
 *
 * ── CE QUE CE MODULE FAIT ─────────────────────────────────────────────────
 * Après la génération, chaque ligne d'ingrédient est rattachée à la base :
 *
 *   1. son identifiant existe → rien à faire ;
 *   2. son NOM est connu MOT POUR MOT (faux ami, alias ou slug exacts, après
 *      `normalizeTerm` — voir `exactNameRef`) → cet aliment devient son
 *      identifiant. ⟳ 2026-09-24 : plus de réduction du nom ;
 *   3. sinon → UN petit appel, pour tout le plan : le modèle reçoit les noms et
 *      les aliments de la base avec leur libellé, et rend le slug du MÊME
 *      aliment, ou `null` quand la base ne l'a pas ;
 *   4. `null` → la ligne reste un nom, et le sas (`composition_fill`) crée
 *      l'aliment comme avant.
 *
 * ── ⛔ CE QUI EMPÊCHE L'ÉTAPE 3 D'ÊTRE UN RAPPROCHEMENT DE CHAÎNES ─────────
 * Aucune distance, aucun préfixe, aucune inclusion (`never-hand-roll-a-matcher-
 * here`, « laitue » ≠ « lait »). Le modèle CHOISIT dans une liste fermée, en
 * lisant le libellé de chaque ligne (« prune | Plum, dried ») ; un slug qu'il
 * invente est jeté et compté ; un slug non composable aussi. `null` est une
 * réponse pleine : une estimation de plus coûte moins qu'un mauvais aliment.
 *
 * ── ⚠️ UNE RÈGLE DU LOT A EST LEVÉE ICI, ET C'EST UNE DÉCISION ────────────
 * « Un identifiant refusé ne retombe jamais sur le terme »
 * (`resolveCompositionLine`). Elle reste vraie pour la LECTURE : ce module ne
 * la contourne pas, il ÉCRIT un identifiant accepté sur la ligne, choisi par
 * un appel dédié qui voit les libellés. Décidé le 2026-09-24 : le catalogue
 * plafonné limitait ce que le modèle cuisinait.
 *
 * PURE: no I/O, no clock, no randomness.
 */

import type { ComposablePredicate } from "./composition_contract.ts";
import {
  type CompositionIndex,
  type CompositionRef,
  normalizeTerm,
  resolveCompositionLine,
} from "./food_composition.ts";
import { reconcileIngredientGroup } from "./food_group_write.ts";
import type { FoodGroupRef } from "./tokens.ts";

/**
 * AU PLUS 24 NOMS PAR APPEL — le plafond du sas (`FILL_REQUEST_CAP`), pour la
 * même raison : un plan qui en porte davantage n'a pas un problème de nommage,
 * il a un référentiel qui n'a pas chargé. Ce qui est coupé est compté.
 */
export const IDENTIFY_REQUEST_CAP = 24;

/** Au-delà, un « nom » est une phrase, pas un aliment. La borne du sas. */
const MAX_TERM_LENGTH = 80;

/**
 * UNE LIGNE D'INGRÉDIENT, RÉDUITE À CE QUE L'IDENTIFICATION LIT ET ÉCRIT.
 *
 * ⚠️ MUTABLE, EXPRÈS : `applyIdentifications` écrit `ref` et `refRefused` EN
 * PLACE, comme `regramMeal` écrit `gramsRaw`. Les lignes du plan sont les
 * objets passés ; les recopier obligerait l'appelant à reconstruire plats et
 * préparations pour deux champs.
 */
export interface IdentifiableLine {
  term: string;
  ref: string | null;
  refRefused: boolean;
  /** `raw`, `cooked`… — un indice pour l'appel, jamais une décision. */
  state?: string | null;
  /**
   * ⟳ LA FAMILLE DE LA LIGNE, RÉCONCILIÉE ICI quand un aliment est retrouvé.
   *
   * ⛔ C'EST UNE GARDE DE SÉCURITÉ, PAS UN DÉTAIL : la ceinture des régimes
   * (`finalPlanGate`, `regime_forbidden_component`) lit ce champ. Le parseur le
   * réconciliait avec le `ref` du modèle ; le modèle n'en écrit plus, donc
   * c'est ici que la famille du référentiel reprend la main.
   */
  group?: FoodGroupRef | null;
}

/**
 * ⟳ LES IDENTIFIANTS ÉCRITS PAR LE MODÈLE SONT OUBLIÉS — ON LIT LE NOM.
 *
 * Décision du 2026-09-24 : « le modèle compose librement, c'est nous qui
 * retrouvons le nom dans la base ». Un identifiant écrit quand même est celui
 * du VOISIN de la liste (« pâtes complètes · ref white_pasta », alors que
 * `wholewheat_pasta` existe hors catalogue) : il est retiré avant
 * l'identification.
 *
 * ⚠️ IL EST GARDÉ DE CÔTÉ, POUR UN SEUL USAGE : la ligne que ni son nom ni
 * l'appel n'ont identifiée (appel en panne, plafond) reprend l'identifiant du
 * modèle plutôt que de partir sans poids — un plat sans portion coûte plus
 * qu'un voisin. Compté (`lines_model_ref_fallback`).
 */
export function forgetModelRefs(
  lines: IdentifiableLine[],
): Map<IdentifiableLine, string> {
  const kept = new Map<IdentifiableLine, string>();
  for (const line of lines) {
    if (typeof line.ref === "string" && line.ref !== "" && !line.refRefused) {
      kept.set(line, line.ref);
    }
    line.ref = null;
    line.refRefused = false;
  }
  return kept;
}

/** Un nom que la base ne sait pas lire, tel qu'il part à l'appel. */
export interface IdentifyRequest {
  /** NORMALISÉ (`normalizeTerm`) — la clé de la table des noms retenus. */
  term: string;
  state: string | null;
  occurrences: number;
}

/**
 * CE QUE L'APPEL (OU LA TABLE DES NOMS RETENUS) A DÉCIDÉ D'UN NOM.
 *
 * `absent` N'EST PAS UNE ABSTENTION : c'est « la base n'a pas cet aliment »,
 * et c'est ce qui envoie la ligne au sas. L'abstention, elle, est l'ABSENCE
 * d'entrée dans la table des décisions.
 */
export type IdentifyVerdict =
  | { kind: "slug"; slug: string }
  | { kind: "absent" };

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-24 — UN NOM EST CONNU S'IL L'EST MOT POUR MOT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT, MESURÉ SUR LE BROUILLON `97567be2`. « steak haché de bœuf
 * cuit » a été rattaché à `beef_steak` (un steak entier) par le résolveur de
 * TERME, qui RÉDUIT le nom (`candidateForms` : il retire des mots jusqu'à
 * trouver un alias — ici « steak de bœuf »). Le nom a donc été cru connu, et
 * l'appel qui l'aurait rattaché au haché n'est jamais parti. Retirer « haché »,
 * « fumé », « sec » ou « complet » change l'aliment.
 *
 * Décision de l'utilisateur : un nom qu'on ne connaît pas MOT POUR MOT part à
 * l'appel, et la réponse est retenue (`food_composition_identified_names`).
 * Seules tolérances : celles de `normalizeTerm` (casse, accents, apostrophes,
 * ponctuation). ⚠️ PAS LE PLURIEL PAR RETRAIT DU « s » : « pâtes » deviendrait
 * « pâte », que le référentiel lit comme du pâté (`complet-and-slug-false-
 * friends-flip-the-food`). Un pluriel inconnu part à l'appel, une fois.
 *
 * L'ordre : un faux ami écrit en table gagne, puis l'alias exact, puis le slug
 * écrit tel quel. Aucune réduction, aucune ressemblance.
 */
export function exactNameRef(
  index: CompositionIndex,
  term: string,
): CompositionRef | null {
  const form = normalizeTerm(String(term ?? ""));
  if (form === "") return null;
  const falseFriend = index.falseFriends?.get(form);
  if (falseFriend !== undefined) return index.bySlug.get(falseFriend) ?? null;
  const viaAlias = index.byAlias.get(form);
  if (viaAlias !== undefined) return index.bySlug.get(viaAlias) ?? null;
  return index.bySlug.get(form.replace(/ /g, "_")) ?? null;
}

/**
 * LES NOMS QUE CE PLAN NE SAIT PAS LIRE, DÉDOUBLONNÉS.
 *
 * ⚠️ DÉDOUBLONNÉS PAR NOM NORMALISÉ, et c'est ce qui rend la table des noms
 * retenus honnête : elle compte des PLANS, pas des lignes.
 */
export function identifyRequestsFor(
  index: CompositionIndex,
  lines: readonly IdentifiableLine[],
): { requests: IdentifyRequest[]; overCap: string[] } {
  const byTerm = new Map<string, IdentifyRequest>();
  for (const line of lines) {
    const raw = String(line?.term ?? "").trim();
    if (raw === "") continue;
    // Un identifiant ACCEPTÉ sur la ligne suffit (les tests, les relectures ;
    // la lane les a oubliés avant d'arriver ici).
    const resolution = resolveCompositionLine(index, line);
    if (resolution.source === "ref" && resolution.ref !== null) continue;
    // ⟳ 2026-09-24 — le nom connu mot pour mot suffit ; RIEN D'AUTRE.
    if (exactNameRef(index, raw) !== null) continue;
    const term = normalizeTerm(raw);
    if (term === "" || term.length > MAX_TERM_LENGTH) continue;
    const state = typeof line.state === "string" && line.state !== "" ? line.state : null;
    const known = byTerm.get(term);
    if (known) {
      known.occurrences += 1;
      if (known.state === null && state !== null) known.state = state;
      continue;
    }
    byTerm.set(term, { term, state, occurrences: 1 });
  }
  // Les plus fréquents d'abord : si le plafond mord, il mord sur la queue.
  const all = [...byTerm.values()].sort((a, b) =>
    b.occurrences - a.occurrences || a.term.localeCompare(b.term)
  );
  return {
    requests: all.slice(0, IDENTIFY_REQUEST_CAP),
    overCap: all.slice(IDENTIFY_REQUEST_CAP).map((r) => r.term),
  };
}

/**
 * LA LISTE FERMÉE QUE L'APPEL LIT : chaque aliment COMPOSABLE de la base, par
 * famille, avec son libellé.
 *
 * ⛔ LE LIBELLÉ EST TOUJOURS ÉCRIT, contrairement au catalogue du prompt de
 * génération. C'est lui qui dit que `prune` est « Plum, dried » : ici il n'y a
 * pas de coût à économiser, il y a un choix à éclairer.
 *
 * ⚠️ SEULEMENT CE QUE `isComposable` ACCEPTE. Proposer une ligne `a_verifier`
 * ferait choisir une valeur qu'aucun humain n'a lue — le parseur la refuserait
 * de toute façon, et le choix serait perdu.
 */
export function identifyCandidateLines(
  index: CompositionIndex,
  isComposable: ComposablePredicate,
): string[] {
  const byGroup = new Map<string, CompositionRef[]>();
  for (const ref of index.bySlug.values()) {
    if (!isComposable(ref)) continue;
    const group = String(ref.foodGroupRef ?? "other");
    const bucket = byGroup.get(group);
    if (bucket) bucket.push(ref);
    else byGroup.set(group, [ref]);
  }
  const out: string[] = [];
  for (const group of [...byGroup.keys()].sort()) {
    out.push(`# ${group}`);
    const refs = byGroup.get(group)!.sort((a, b) => a.slug.localeCompare(b.slug));
    for (const ref of refs) out.push(`${ref.slug} | ${String(ref.label ?? "").trim()}`);
  }
  return out;
}

/**
 * ⚠️ LA PROMESSE ET LA CLÉ DE SCHÉMA SE TOUCHENT (`promise-and-schema-key-must-
 * be-adjacent`) : la forme exacte, la règle du « même aliment » et
 * l'échappatoire `null` sont écrites ensemble, avec le mot « json » pour le
 * mode JSON du fournisseur.
 */
export const COMPOSITION_IDENTIFY_SYSTEM_PROMPT = [
  "You match food names written in recipes to a food reference table.",
  "For each name, return the slug of the table entry that is THE SAME FOOD, or",
  "null when the table has no such food.",
  "",
  "Return valid json, and nothing else, with exactly this shape:",
  '{"items":[{"term":"<the input name, copied verbatim>","slug":"<a slug copied exactly from the table, or null>"}]}',
  "Return one item per input name, in the same order.",
  "",
  "THE SAME FOOD means: a courgette is a courgette, whatever the language",
  '("zucchini", "courgettes") and whatever the cooking ("courgette cuite" is the',
  "courgette entry: the recipe carries the cooking state separately).",
  'Frozen, fresh or thawed is the same food too ("cabillaud surgelé" is the cod',
  'entry, "edamames surgelés" the edamame entry), and so is a plural or a size',
  '("pousses d\'épinards" may be young spinach leaves if the table has them).',
  "It is NOT the same food when the product itself changes: fresh vs dried,",
  "fresh vs tinned, whole vs juice, grain vs flour, plain vs smoked or cured,",
  'wholemeal vs white ("complet", "complète", "intégral" = wholemeal: "pita',
  'complète" is the wholemeal pita, never the white one), skimmed vs whole milk.',
  "When the name says one of these, the entry must say it too.",
  "Read the description after each slug: it says what the entry really is",
  '("prune | Plum, dried" is a DRIED fruit, not a fresh plum).',
  "",
  "A near food is WRONG. If the table has no entry for that same food, return",
  "null: a missing entry costs one estimate, a wrong slug weighs the wrong food",
  "on every plate. Never invent a slug: copy it from the table, character for",
  "character.",
].join("\n");

/**
 * Le message utilisateur : les noms, puis la table entière.
 *
 * ⚠️ LES NOMS PARTENT EN JSON, L'ÉTAT DANS SA PROPRE CLÉ. Mesuré au premier
 * appel réel (2026-09-24) : servis en `- courgette  (raw)`, les six noms sont
 * revenus recopiés AVEC leur parenthèse, et aucun n'a été reconnu.
 */
export function identifyUserMessage(
  requests: readonly IdentifyRequest[],
  candidateLines: readonly string[],
): string {
  return [
    `${requests.length} food names to match, as json. Copy each "term" verbatim;`,
    '"state" is how the recipe uses it, never part of the name.',
    JSON.stringify(requests.map((r) => r.state ? { term: r.term, state: r.state } : { term: r.term })),
    "",
    "The table: one entry per line, `slug | description`, grouped by family.",
    ...candidateLines,
  ].join("\n");
}

/**
 * LA RÉPONSE, LUE. Jamais `throw` : une sortie illisible rend une table vide,
 * et chaque ligne garde l'état d'avant cet appel.
 *
 * ⛔ UN SLUG INVENTÉ N'EST PAS `absent`. Il est jeté et compté (`invented`) :
 * le compter comme « la base n'a pas cet aliment » ferait créer au sas un
 * doublon d'un aliment que le modèle a peut-être simplement mal recopié.
 */
export function parseIdentifyAnswers(
  raw: string | null,
  requests: readonly IdentifyRequest[],
  index: CompositionIndex,
  isComposable: ComposablePredicate,
): { answers: Map<string, IdentifyVerdict>; invented: number; notComposable: number } {
  const answers = new Map<string, IdentifyVerdict>();
  let invented = 0;
  let notComposable = 0;
  if (raw === null) return { answers, invented, notComposable };
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return { answers, invented, notComposable };
  }
  const items = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items)) return { answers, invented, notComposable };
  const asked = new Set(requests.map((r) => r.term));
  for (const item of items) {
    const row = item as Record<string, unknown>;
    // ⚠️ UNE PARENTHÈSE RECOPIÉE EN FIN DE NOM EST RETIRÉE (« courgette (raw) »),
    // et seulement elle : la clé reste une égalité avec un nom demandé.
    const written = String(row?.term ?? "");
    const term = asked.has(normalizeTerm(written))
      ? normalizeTerm(written)
      : normalizeTerm(written.replace(/\s*\([^()]*\)\s*$/, ""));
    // Seuls les noms demandés, une fois chacun.
    if (!asked.has(term) || answers.has(term)) continue;
    const value = row?.slug;
    const slug = typeof value === "string" ? value.trim() : "";
    if (value === null || slug === "" || slug.toLowerCase() === "null") {
      answers.set(term, { kind: "absent" });
      continue;
    }
    const ref = index.bySlug.get(slug);
    if (ref === undefined) {
      invented++;
      continue;
    }
    if (!isComposable(ref)) {
      notComposable++;
      continue;
    }
    answers.set(term, { kind: "slug", slug });
  }
  return { answers, invented, notComposable };
}

/** Ce que l'identification a fait aux lignes du plan. Des LIGNES, pas des noms. */
export interface IdentifyLineCounts {
  /** Étape 2 : le nom menait déjà à un aliment composable, écrit comme identifiant. */
  lines_by_name: number;
  /** Étape 3 : le slug choisi par l'appel (ou relu dans la table des noms retenus). */
  lines_by_model: number;
  /** « La base n'a pas cet aliment » : la ligne part au sas par son nom. */
  lines_absent: number;
  /** Aucune décision pour ce nom : appel en échec, plafond, slug inventé. */
  lines_unanswered: number;
  /** Parmi elles : l'identifiant du modèle repris faute de mieux. */
  lines_model_ref_fallback: number;
  /** Une famille déclarée que le référentiel a corrigée. */
  groups_corrected: number;
  /**
   * ⟳ 2026-09-24 — « absent » selon l'appel, mais le résolveur de TERME (qui
   * réduit le nom) trouve quand même un aliment : la ligne sera pesée comme
   * lui. Compté pour que ce reste de rapprochement se voie.
   */
  absent_but_term_resolves: number;
}

/**
 * LES DÉCISIONS, ÉCRITES SUR LES LIGNES — EN PLACE.
 *
 * ⛔ SEUL UN ALIMENT COMPOSABLE DEVIENT UN IDENTIFIANT. Une fiche remplie par
 * le sas (provenance `model`, `a_verifier`) vit dans l'index du plan en cours,
 * pas dans le référentiel : l'écrire en `ref` rendrait la ligne illisible à
 * toute relecture (`indexForReading` ne recharge que les lignes lues par leur
 * nom). Ces lignes gardent leur nom, comme avant.
 *
 * ⚠️ `absent` SUR UNE LIGNE AU CODE REFUSÉ : l'identifiant est retiré seulement
 * quand le NOM ne mène à rien — la ligne devient alors `term_unknown`, et le
 * sas la remplit. Si le nom mène à un aliment que l'appel a jugé différent, on
 * ne tranche pas entre les deux : la ligne reste refusée.
 */
export function applyIdentifications(args: {
  index: CompositionIndex;
  isComposable: ComposablePredicate;
  lines: IdentifiableLine[];
  decisions: ReadonlyMap<string, IdentifyVerdict>;
  /**
   * Les identifiants du modèle, gardés de côté par `forgetModelRefs`. REQUIS :
   * une `Map` vide dit « aucun repli », une absence ne se relirait pas.
   */
  fallbackRefs: ReadonlyMap<IdentifiableLine, string>;
}): IdentifyLineCounts {
  const counts: IdentifyLineCounts = {
    lines_by_name: 0,
    lines_by_model: 0,
    lines_absent: 0,
    lines_unanswered: 0,
    lines_model_ref_fallback: 0,
    groups_corrected: 0,
    absent_but_term_resolves: 0,
  };
  const write = (line: IdentifiableLine, ref: CompositionRef) => {
    line.ref = ref.slug;
    line.refRefused = false;
    const reconciled = reconcileIngredientGroup(line.group ?? null, ref.foodGroupRef);
    if (reconciled.conflicting) counts.groups_corrected++;
    line.group = reconciled.group;
  };
  for (const line of args.lines) {
    const term = String(line?.term ?? "").trim();
    if (term === "") continue;
    const resolution = resolveCompositionLine(args.index, line);
    if (resolution.source === "ref" && resolution.ref !== null) continue;
    // ⟳ 2026-09-24 — ÉTAPE 2 : LE NOM CONNU MOT POUR MOT, ET LUI SEUL.
    const byName = exactNameRef(args.index, term);
    if (byName !== null) {
      // ⛔ `bySlug.get(slug) === ref` : la ligne du référentiel, pas une fiche
      // du sas homonyme. Un nom exact qui mène à une fiche non composable
      // (promue du sas, `a_verifier`) garde son nom, comme avant.
      if (args.isComposable(byName) && args.index.bySlug.get(byName.slug) === byName) {
        write(line, byName);
        counts.lines_by_name++;
      }
      continue;
    }
    const decision = args.decisions.get(normalizeTerm(term));
    if (decision === undefined) {
      counts.lines_unanswered++;
      const fallback = args.fallbackRefs.get(line);
      const ref = fallback === undefined ? undefined : args.index.bySlug.get(fallback);
      if (ref !== undefined && args.isComposable(ref)) {
        write(line, ref);
        counts.lines_model_ref_fallback++;
      }
      continue;
    }
    if (decision.kind === "slug") {
      const ref = args.index.bySlug.get(decision.slug);
      if (ref === undefined) {
        counts.lines_unanswered++;
        continue;
      }
      write(line, ref);
      counts.lines_by_model++;
      continue;
    }
    counts.lines_absent++;
    if (resolveCompositionLine(args.index, { term, ref: null, refRefused: false }).ref !== null) {
      counts.absent_but_term_resolves++;
    }
    if (line.ref !== null || line.refRefused) {
      const byName = resolveCompositionLine(args.index, { term, ref: null, refRefused: false });
      if (byName.refusal === "term_unknown") {
        line.ref = null;
        line.refRefused = false;
      }
    }
  }
  return counts;
}
