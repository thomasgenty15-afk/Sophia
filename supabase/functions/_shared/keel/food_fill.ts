/**
 * « FILL FROM DOCTRINE » — pré-remplir l'écran des aliments à partir de la
 * méthode du coach.
 * ===========================================================================
 *
 * Le problème est celui que `food_packs.ts` nomme déjà: « 127 aliments, aucun
 * coché, et un coach qui n'a pas dix minutes. L'écran est juste, et il est vide
 * — donc il le reste. » Les packs de style y répondent pour un coach qui n'a
 * rien écrit. Ce module répond pour celui qui a DÉJÀ une doctrine: elle dit
 * comment il nourrit ses élèves, il est absurde de le lui redemander en
 * pastilles.
 *
 * ── LA RÈGLE QUI NE SE NÉGOCIE PAS: LE MODÈLE NE RÉDIGE RIEN ────────────
 * Elle vient de `coach-protocol-v1`: « Le modèle n'écrit JAMAIS de nutrition.
 * Il écrit ce que LE COACH pense. »
 *
 * Appliquée ici, elle veut dire que le modèle ne produit PAS d'aliments: il en
 * SÉLECTIONNE dans un catalogue fermé de 127 entrées. Sa sortie est une liste
 * de `{slug, stance}` et rien d'autre. Le libellé vient du catalogue, le
 * « pourquoi » de `food_items.default_why` — déjà écrit, déjà passé au filtre
 * « rôle dans l'assiette, jamais allégation de santé ».
 *
 * Un slug inconnu est REJETÉ, jamais rapproché « au mieux ». Écrire dans la
 * méthode d'un coach un aliment qu'aucun écran ne lui a montré est le défaut que
 * ce dépôt refuse partout (même motif que `applyStarterChoices`, qui jette sur
 * un jeton de position inconnu).
 *
 * ── `excluded` NE SE DEVINE PAS ─────────────────────────────────────────
 * `food_packs.ts` ne sème QUE des `encouraged`, et l'explique: « ce qu'un coach
 * garde HORS de l'assiette est une affirmation bien plus personnelle — c'est
 * souvent le cœur de sa méthode, et c'est ce que le verrou déterministe fera
 * respecter mot pour mot. »
 *
 * Depuis que `doctrine_loader.ts` alimente `foods.discouraged` depuis
 * `coach_food_items` en `stance='excluded'`, poser un `excluded` de trop, c'est
 * ARMER UNE CEINTURE que le coach n'a pas demandée: son agent refusera un
 * aliment en son nom, et il ne saura pas pourquoi.
 *
 * On ne l'interdit pas ici — un coach dont la doctrine dit « je ne mets pas
 * d'huile de graines » a écrit sa ligne rouge, et la reporter est fidèle, pas
 * inventé. On EXIGE la trace: `keepExcludedWithEvidence` ne garde un `excluded`
 * que si le libellé de l'aliment apparaît dans ce que le coach a réellement
 * écrit. Sans trace, la sélection est dégradée en `discouraged` plutôt que
 * jetée — l'intention du modèle était probablement juste, mais elle n'arme rien.
 *
 * PUR: aucune I/O, aucune horloge, aucun hasard.
 */

import { FOOD_PACKS } from "./food_packs.ts";

/** Les postures qu'un remplissage peut poser. Miroir de la CHECK
 *  `coach_food_items.stance` (migration 20260805140000). */
export const FILL_STANCES = ["encouraged", "discouraged", "excluded"] as const;
export type FillStance = (typeof FILL_STANCES)[number];

export interface FillSelection {
  slug: string;
  stance: FillStance;
}

/**
 * LA SÉLECTION DE LA MAISON — pour un coach qui délègue sa doctrine à Sophia.
 *
 * AUCUN APPEL IA sur ce chemin, et ce n'est pas une économie: c'est une
 * question de justesse. La doctrine de la maison est la MÊME pour tout le
 * monde, donc la sélection qui en découle doit l'être aussi. Un modèle
 * produirait de la variance là où le produit en promet zéro, et deux salles de
 * sport identiques repartiraient avec deux listes différentes sans raison.
 *
 * Le contenu ne s'invente pas non plus: c'est l'union des packs de style
 * existants, tous `encouraged`. Ils ont déjà été relus, ils sont couverts par
 * un test contre le catalogue, et ils ne portent aucune allégation de résultat.
 *
 * PAS UN SEUL `excluded`. La maison ne pose pas de ligne rouge alimentaire à la
 * place d'un coach: c'est exactement ce que `food_packs.ts` refuse déjà, et
 * déléguer sa doctrine n'est pas déléguer ses interdits.
 */
export function houseFillSelection(): FillSelection[] {
  const seen = new Set<string>();
  const out: FillSelection[] = [];
  for (const pack of FOOD_PACKS) {
    for (const slug of pack.slugs) {
      if (seen.has(slug)) continue;
      seen.add(slug);
      out.push({ slug, stance: "encouraged" });
    }
  }
  return out;
}

export interface ParsedFill {
  selection: FillSelection[];
  /** Ce qui a été écarté, et pourquoi. Compté, jamais tu. */
  rejected: { slug: string; reason: "unknown_slug" | "bad_stance" | "duplicate" }[];
}

/**
 * Valide ce que le modèle a rendu contre le catalogue.
 *
 * ⚠️ ON NE JETTE PAS TOUT SUR UNE LIGNE FAUTIVE. Un slug halluciné sur
 * vingt-six corrects ne doit pas priver le coach des vingt-cinq autres — mais
 * il doit être COMPTÉ, parce qu'un modèle qui invente régulièrement est un
 * prompt à corriger, et un rejet silencieux ne le dirait jamais.
 */
export function parseFillSelection(
  raw: unknown,
  catalogueSlugs: ReadonlySet<string>,
): ParsedFill {
  const rows = Array.isArray(raw) ? raw : [];
  const selection: FillSelection[] = [];
  const rejected: ParsedFill["rejected"] = [];
  const seen = new Set<string>();

  for (const entry of rows) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const slug = String(row.slug ?? "").trim();
    const stance = String(row.stance ?? "").trim();
    if (!slug) continue;
    if (seen.has(slug)) {
      rejected.push({ slug, reason: "duplicate" });
      continue;
    }
    if (!catalogueSlugs.has(slug)) {
      rejected.push({ slug, reason: "unknown_slug" });
      continue;
    }
    if (!(FILL_STANCES as readonly string[]).includes(stance)) {
      rejected.push({ slug, reason: "bad_stance" });
      continue;
    }
    seen.add(slug);
    selection.push({ slug, stance: stance as FillStance });
  }

  return { selection, rejected };
}

/**
 * Dégrade en `discouraged` tout `excluded` qui ne tient à rien d'écrit.
 *
 * `writtenMaterial` est la prose du coach — ses convictions, ses interdits,
 * leurs formulations. Si le libellé de l'aliment n'y apparaît pas, le modèle a
 * DÉDUIT une ligne rouge au lieu de la reporter. On garde son intention (cet
 * aliment n'est pas au centre de l'assiette) sans armer une ceinture au nom du
 * coach.
 *
 * La comparaison est volontairement simple — repli de casse et d'accents, pas
 * de morphologie. Un matcher malin ici trouverait « riz » dans « riz complet »
 * et armerait sur les deux; c'est `forbidden_matcher.ts` qui fait ce travail,
 * avec ses exceptions, et le dupliquer approximativement serait pire que de ne
 * rien faire.
 */
export function keepExcludedWithEvidence(
  selection: readonly FillSelection[],
  labelBySlug: ReadonlyMap<string, string>,
  writtenMaterial: string,
): { selection: FillSelection[]; downgraded: string[] } {
  const hay = fold(writtenMaterial);
  const out: FillSelection[] = [];
  const downgraded: string[] = [];

  for (const s of selection) {
    if (s.stance !== "excluded") {
      out.push(s);
      continue;
    }
    const label = fold(labelBySlug.get(s.slug) ?? "");
    if (label.length > 0 && hay.includes(label)) {
      out.push(s);
    } else {
      downgraded.push(s.slug);
      out.push({ slug: s.slug, stance: "discouraged" });
    }
  }
  return { selection: out, downgraded };
}

/**
 * Ce que le remplissage AJOUTE réellement, sachant ce que le coach a déjà.
 *
 * Même contrat que `packAdditions`, et pour la même raison: la posture du coach
 * gagne toujours. S'il a marqué le beurre `excluded` et que le remplissage le
 * propose `encouraged`, c'est lui qui gagne — un remplissage n'a pas d'avis
 * contre le coach.
 *
 * Le nombre rendu est ce que l'écran annonce AVANT de cliquer. Un bouton qui
 * dit « ajoute 26 aliments » et qui en ajoute 4 est un bouton qui ment.
 */
export function fillAdditions(
  selection: readonly FillSelection[],
  alreadyPickedSlugs: readonly (string | null | undefined)[],
): FillSelection[] {
  const owned = new Set(
    alreadyPickedSlugs.map((s) => String(s ?? "").trim()).filter(Boolean),
  );
  return selection.filter((s) => !owned.has(s.slug));
}

/** Repli de casse et d'accents. Rien de plus — voir `keepExcludedWithEvidence`. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
