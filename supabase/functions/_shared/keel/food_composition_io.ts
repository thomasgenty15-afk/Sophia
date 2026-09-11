/**
 * FF-038 — LE CHARGEUR DU RÉFÉRENTIEL DE COMPOSITION.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-038-le-referentiel-de-composition.md`
 *
 * ── POURQUOI UN FICHIER À PART ────────────────────────────────────────────
 * `food_composition.ts` est pur: aucune I/O, testable sans base, rejouable
 * hors ligne sur les plans déjà écrits. La lecture vit donc ici, comme
 * `body_measure_io`, `daily_pulse_io` et les autres — le dépôt a déjà cette
 * frontière, on ne s'en invente pas une seconde.
 *
 * ── LES DEUX TABLES SONT SERVICE-ROLE ─────────────────────────────────────
 * `revoke all ... from anon, authenticated` dans la migration, RLS activée
 * sans politique. Ce chargeur est donc appelé avec le client ADMIN, jamais
 * avec le JWT d'un élève — un appel côté élève rendrait zéro ligne, ce qui se
 * lirait comme un référentiel vide plutôt que comme un refus.
 */

import {
  buildCompositionIndex,
  type CompositionIndex,
  type CompositionRef,
  COMPOSITION_SOURCES,
  type CompositionSource,
  YIELD_CLASSES,
  YIELD_FACTORS,
  type YieldClass,
} from "./food_composition.ts";
import {
  defaultValidationFor,
  REF_VALIDATIONS,
  type RefValidation,
} from "./food_reference_manifest.ts";
import type { FoodGroupRef } from "./tokens.ts";

/** Le strict minimum de client dont ce module a besoin. */
export interface CompositionDbClient {
  from(table: string): {
    // deno-lint-ignore no-explicit-any
    select(columns: string): any;
  };
}

function readNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * LE RENDEMENT PAR ALIMENT, RELU — et la garde MIROIR du CHECK SQL.
 *
 * ⛔ POURQUOI RELIRE CE QUE LA BASE VIENT DE GARANTIR. La migration
 * `20260907160000` pose `yield_factor_agrees_with_class`, donc la
 * contradiction est impossible *aujourd'hui*. Elle ne l'est pas pour toujours:
 * **une ligne écrite AVANT un CHECK survit au CHECK** — c'est exactement le
 * raisonnement déjà écrit trois lignes plus bas pour `yield_class`, et il a
 * une cicatrice (`create or replace view` qui perd `security_invoker`). Une
 * base restaurée, une réplique en retard, une contrainte tombée par un
 * `drop constraint` de voisinage: le loader est le dernier endroit où la
 * contradiction peut encore être vue.
 *
 * ⛔ ET LE REPLI EST L'ABSTENTION, PAS LA RÉPARATION. Un facteur 2,6 posé sur
 * une ligne `neutral` n'est pas « presque bon »: appliqué, il ferait passer
 * 100 g d'huile déclarée cuite pour 38 g crus. On le JETTE et on retombe sur
 * la classe, et on le DIT — un défaut silencieux ici ne se retrouve nulle part
 * ailleurs.
 */
function readYieldFactor(
  row: Record<string, unknown>,
  yieldClass: YieldClass,
  slug: string,
): number | null {
  const raw = readNumber(row.yield_factor);
  if (raw === null) return null;
  const bounded = raw > 0 && raw <= 6;
  const agrees = yieldClass === "neutral"
    ? raw === 1.0
    : YIELD_FACTORS[yieldClass] > 1
    ? raw > 1
    : raw < 1;
  if (bounded && agrees) return raw;
  console.warn(
    JSON.stringify({
      tag: "keel.composition.yield_factor_contradicts_class",
      slug,
      yield_class: yieldClass,
      yield_factor: raw,
      // Lequel des deux verdicts a mordu: une valeur hors borne et une valeur
      // qui contredit sa classe ne se réparent pas au même endroit.
      reason: !bounded ? "out_of_bounds" : "contradicts_class",
    }),
  );
  return null;
}

/**
 * Une ligne de base devient une `CompositionRef`, ou rien.
 *
 * ── UNE LIGNE ILLISIBLE EST ÉCARTÉE, PAS RÉPARÉE ──────────────────────────
 * `yield_class` hors liste, énergie absente: la ligne tombe. Le CHECK SQL les
 * rend impossibles aujourd'hui; le lecteur ne s'en remet pas pour autant à la
 * base, parce qu'une ligne écrite AVANT un CHECK survit au CHECK. Ce qu'on
 * refuse ici, c'est de « réparer » — un `yield_class` remplacé par `neutral`
 * ferait passer 100 g de riz cuit pour 100 g de riz cru, en silence.
 */
function toRef(row: Record<string, unknown>): CompositionRef | null {
  const slug = String(row.slug ?? "").trim();
  const yieldClass = String(row.yield_class ?? "").trim();
  const energy = readNumber(row.energy_kcal);
  if (!slug || energy === null) return null;
  if (!(YIELD_CLASSES as readonly string[]).includes(yieldClass)) return null;
  return {
    slug,
    foodGroupRef: String(row.food_group_ref ?? "") as FoodGroupRef,
    label: String(row.label ?? slug),
    // LA PROVENANCE, LUE ET PAS DEVINÉE. Le CHECK SQL n'autorise que trois
    // valeurs; une quatrième (ou un `null` d'une ligne écrite avant le CHECK)
    // retombe sur `manual` — c'est-à-dire « une main humaine », le repli qui
    // ne peut PAS gonfler le compteur du sas ni celui du modèle. Se tromper
    // dans l'autre sens ferait croire que le lot 18 remplit le référentiel
    // alors qu'il ne fait rien.
    source: (COMPOSITION_SOURCES as readonly string[]).includes(
        String(row.source ?? ""),
      )
      ? String(row.source) as CompositionSource
      : "manual",
    energyKcal: energy,
    proteinG: readNumber(row.protein_g),
    carbsG: readNumber(row.carbs_g),
    fatG: readNumber(row.fat_g),
    fiberG: readNumber(row.fiber_g),
    omega3Marine: row.omega3_marine === true,
    ironSource: row.iron_source === true,
    calciumSource: row.calcium_source === true,
    iodineSource: row.iodine_source === true,
    zincSource: row.zinc_source === true,
    b12Source: row.b12_source === true,
    folateSource: row.folate_source === true,
    yieldClass: yieldClass as YieldClass,
    // Le rendement PAR ALIMENT (migration `20260907160000`). Illisible ou en
    // contradiction avec la classe ⇒ `null`, c'est-à-dire « retombe sur la
    // classe » — le repli est l'ABSTENTION, jamais une valeur de secours.
    yieldFactor: readYieldFactor(row, yieldClass as YieldClass, slug),
    // 1,0 en repli: c'est le NEUTRE de la décote, donc l'absence de décote.
    // Une valeur illisible ne doit pas retirer 28 % d'énergie à un aliment.
    atwaterDiscount: readNumber(row.atwater_discount) ?? 1.0,
    energyDense: row.energy_dense === true,
    unitGrams: readNumber(row.unit_grams),
    // La masse conventionnelle du condiment (lot 0-C). Illisible ⇒ `null`,
    // c'est-à-dire « pas un condiment »: le repli est l'ABSTENTION, jamais une
    // masse par défaut. Une colonne mal lue ne doit pas se mettre à peser.
    condimentGrams: readNumber(row.condiment_grams),
    // ⟳ LOT A — LE CODE ET LE NOM ANSES, LUS. Ils ne servent à AUCUN calcul:
    // ils servent à voir qu'une ligne porte le nom d'un autre aliment. `pear`
    // portait « Poireau, cru » et le code 20039 du poireau, et le chargeur ne
    // lisait ni l'un ni l'autre — le défaut était invisible par construction.
    ciqualCode: readText(row.ciqual_code),
    ciqualName: readText(row.ciqual_name),
    // ⟳ LOT A — L'EXCEPTION DE VALIDATION, LUE ET PAS DEVINÉE. Hors vocabulaire
    // (ou absente) ⇒ `undefined`, c'est-à-dire « aucune exception », donc la
    // règle par provenance de `validationOf`. Le repli est la RÈGLE, jamais un
    // `verifie` de complaisance.
    validation: readValidation(row.validation_state),
  };
}

function readText(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s ? s : null;
}

/**
 * L'ÉTAT ÉCRIT EN BASE, s'il appartient au vocabulaire fermé.
 *
 * ⛔ UNE VALEUR HORS LISTE NE DEVIENT PAS `rejete` « par prudence ». Elle
 * devient l'ABSENCE d'exception, donc la règle. Une colonne mal lue qui
 * fermerait la composition ferait passer un défaut de lecture pour une
 * décision produit — et le référentiel entier pourrait disparaître du
 * catalogue sur une faute de frappe.
 */
function readValidation(value: unknown): RefValidation | undefined {
  const s = String(value ?? "").trim();
  return (REF_VALIDATIONS as readonly string[]).includes(s) ? s as RefValidation : undefined;
}

/**
 * Le référentiel entier, en un index.
 *
 * ── CHARGÉ EN ENTIER, ET C'EST TENABLE ────────────────────────────────────
 * ~900 lignes et ~2500 alias. Filtrer par les termes d'un repas demanderait de
 * les normaliser côté SQL — c'est-à-dire une SECONDE normalisation, à côté de
 * `normalizeForMatch`, dans un langage où elle ne peut pas être testée avec
 * l'autre. La cicatrice du dépôt sur les moteurs de matching en double est
 * assez chère pour justifier deux requêtes de quelques kilo-octets.
 *
 * ⚠️ ── « EN ENTIER » DEMANDE DE PAGINER, ET ÇA A COÛTÉ CHER ───────────────
 * PostgREST plafonne une réponse à 1000 lignes PAR DÉFAUT, sans erreur et sans
 * en-tête que ce code lisait. Mesuré le 2026-08-12: 2508 alias en base, **999
 * chargés**. Plus de 60 % du référentiel n'atteignait jamais le résolveur.
 *
 * Le défaut était INVISIBLE et il coûtait tout: la résolution plafonnait entre
 * 62 % et 80 %, donc sous la porte des 80 % du verdict — donc pas de verdict,
 * pas de boucle de correction, pas de mise à l'échelle des portions. On a
 * conclu deux fois que « le référentiel est trop pauvre » et importé 689
 * aliments de plus, pendant que le vrai problème était que la moitié de ce
 * qu'on avait déjà ne se chargeait pas.
 *
 * D'où la pagination explicite ci-dessous ET la garde de complétude: une page
 * pleine signifie « il y en a peut-être d'autres », et on redemande jusqu'à ce
 * qu'une page revienne incomplète. Un plafond dur borne la boucle — mieux vaut
 * lever que tourner sans fin sur une table qui aurait explosé.
 */

/** La taille de page. PostgREST refuse au-delà de son propre maximum. */
const PAGE_SIZE = 1000;

/**
 * Le nombre de pages au-delà duquel on lève.
 *
 * 50 pages = 50 000 lignes, très au-dessus de tout référentiel plausible. Y
 * arriver veut dire que quelque chose est cassé (une table qui a explosé, une
 * pagination qui ne progresse pas), et lever est alors plus honnête que
 * charger indéfiniment.
 */
const MAX_PAGES = 50;

async function fetchAll(
  db: CompositionDbClient,
  table: string,
  columns: string,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const res = await db.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (res.error) {
      throw new Error(`[keel/composition] ${table}: ${res.error.message}`);
    }
    const rows = (res.data ?? []) as Record<string, unknown>[];
    out.push(...rows);
    // Une page INCOMPLÈTE est la seule preuve qu'on a tout lu. S'arrêter sur
    // une page pleine est exactement le défaut qu'on répare ici.
    if (rows.length < PAGE_SIZE) return out;
  }
  throw new Error(
    `[keel/composition] ${table}: plus de ${MAX_PAGES * PAGE_SIZE} lignes — ` +
      `pagination suspecte, on ne charge pas un référentiel qu'on ne comprend plus`,
  );
}

/**
 * ⟳ LOT A — LA LANGUE DU PLAN, CHOISIE AU CHARGEMENT.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POURQUOI LE DÉFAUT EST `fr`, ET CE N'EST PAS UNE PRÉFÉRENCE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Compté le 2026-09-11 sur TOUS les plans de la base locale, terme par terme,
 * par `content_locale`:
 *
 *     fr-FR   prunes 78 · raisin 65 · raisins 40 · prune 12   → 195 occurrences
 *     en-GB   raisins 1                                       →   1 occurrence
 *
 * Un index anglais par défaut laisserait donc les 195 en place — c'est le
 * défaut mesuré du 2026-09-11, celui qui fait tomber un petit-déjeuner de
 * 614 à 388 kcal. Un index français par défaut coûte UNE occurrence dans UN
 * plan anglais. Le repli va du côté où la mesure dit qu'il coûte le moins.
 *
 * ⛔ ET CE DÉFAUT EST UNE ÉTAPE, PAS UNE FIN. Le vrai porteur de la langue est
 * `student_generated_meals.content_locale`, connu de chaque appelant. Tant
 * qu'aucun ne le passe, un plan anglais lit `raisins` comme du raisin frais.
 * C'est écrit ici pour que ça ne se découvre pas ailleurs.
 */
export type CompositionLang = "fr" | "en";

export interface LoadCompositionOptions {
  /** La langue du contenu du plan. Défaut `fr` — voir ci-dessus. */
  lang?: CompositionLang;
}

/**
 * LES LIGNES QUE LE DOUBLON DE CODE REND SUSPECTES — arbitrage ① du socle.
 *
 * ⛔ UN `alim_code` ANSES DÉSIGNE UN ALIMENT. Deux slugs qui le portent disent
 * la même mesure de deux aliments différents: au moins l'un ment, et rien dans
 * le produit ne peut dire lequel. Mesuré le 2026-09-11: **un seul doublon sur
 * les 192 lignes codées**, `20039` porté par `leek` ET `pear` — et `pear`
 * portait bien les cinq macronutriments du poireau.
 *
 * La règle est donc ARMÉE POUR LA FOIS SUIVANTE: le jour où un import repose
 * un code sur deux lignes, les deux tombent en `a_verifier` sans que personne
 * n'ait à le remarquer. Une exception écrite en base gagne sur cette règle —
 * c'est très exactement ce que veut dire « jusqu'à arbitrage nominatif ».
 */
function slugsWithADuplicateCiqualCode(rows: readonly Record<string, unknown>[]): Set<string> {
  const bySlugOfCode = new Map<string, string[]>();
  for (const row of rows) {
    const code = String(row.ciqual_code ?? "").trim();
    const slug = String(row.slug ?? "").trim();
    if (!code || !slug) continue;
    bySlugOfCode.set(code, [...(bySlugOfCode.get(code) ?? []), slug]);
  }
  const out = new Set<string>();
  for (const [code, slugs] of bySlugOfCode) {
    if (slugs.length < 2) continue;
    console.warn(
      JSON.stringify({
        tag: "keel.composition.ciqual_code_shared_by_several_slugs",
        ciqual_code: code,
        slugs,
      }),
    );
    for (const s of slugs) out.add(s);
  }
  return out;
}

export async function loadCompositionIndex(
  db: CompositionDbClient,
  opts: LoadCompositionOptions = {},
): Promise<CompositionIndex> {
  const lang: CompositionLang = opts.lang ?? "fr";
  const [refRows, aliasRows, friendRows] = await Promise.all([
    fetchAll(
      db,
      "food_composition_refs",
      "slug, food_group_ref, label, source, ciqual_code, ciqual_name, energy_kcal, " +
        "protein_g, carbs_g, fat_g, " +
        "fiber_g, omega3_marine, iron_source, calcium_source, iodine_source, " +
        "zinc_source, b12_source, folate_source, yield_class, yield_factor, " +
        "atwater_discount, energy_dense, unit_grams, condiment_grams, " +
        "validation_state, validation_reason, validation_decided_on",
    ),
    fetchAll(db, "food_composition_aliases", "alias, slug"),
    // ⚠️ TROISIÈME TABLE, ET PAS UNE COLONNE DE PLUS SUR LES ALIAS. Un faux ami
    // est une AUTRE affirmation qu'un alias: il dit « cette forme passe DEVANT
    // le slug nu, dans cette langue ». La migration `20260822113000` a retiré
    // 19 alias qui contredisaient leur propre forme, en écrivant que laisser
    // une affirmation contradictoire dans cette table est une bombe à
    // retardement. On ne l'y remet pas: on met la nôtre à côté, avec sa langue.
    fetchAll(db, "food_composition_false_friends", "term, lang, slug"),
  ]);

  const suspect = slugsWithADuplicateCiqualCode(refRows);
  const refs: CompositionRef[] = [];
  for (const row of refRows) {
    const ref = toRef(row);
    if (!ref) continue;
    // L'ORDRE EST LA RÈGLE: l'exception nominative écrite en base gagne, puis
    // le doublon de code, puis la provenance. Une ligne nommée par un humain
    // ne doit pas être re-condamnée par une règle générale — c'est la seule
    // façon de sortir un doublon de la suspicion une fois qu'il est arbitré.
    refs.push(
      ref.validation !== undefined
        ? ref
        : suspect.has(ref.slug)
        ? { ...ref, validation: "a_verifier" }
        : { ...ref, validation: defaultValidationFor(ref.source) },
    );
  }
  const aliases = aliasRows
    .map((r) => ({ alias: String(r.alias ?? ""), slug: String(r.slug ?? "") }))
    .filter((a) => a.alias && a.slug);
  const falseFriends = friendRows
    .filter((r) => String(r.lang ?? "").trim() === lang)
    .map((r) => ({ alias: String(r.term ?? ""), slug: String(r.slug ?? "") }))
    .filter((f) => f.alias && f.slug);
  return buildCompositionIndex(refs, aliases, falseFriends);
}
