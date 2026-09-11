/**
 * UN ALIMENT, UN SLUG, PLUSIEURS NOMS — LES CAS QUI DÉCIDENT.
 *
 * Prompt: `docs/keel/PROMPT-AGENT-SAS-REFERENTIEL.md`
 * Migrations: `20260910180000` · `20260910181000` · `20260910182000`
 *
 * ── LE DÉFAUT QUE CE FICHIER GARDE ────────────────────────────────────────
 * Mesuré le 2026-09-10 sur les 291 lignes du sas: `puree d'amande` (6 vues),
 * `puree d'amandes` (1) et `almond butter` (1) étaient TROIS aliments. On
 * repayait l'appel modèle à chaque forme et à chaque plan, la règle des trois
 * ne se déclenchait jamais, et le même aliment portait deux valeurs selon la
 * langue (54 kcal/100 g en français, 63 en anglais).
 *
 * ── LE STYLE DU DÉPÔT: CHAQUE TEST A UNE MUTATION QUI LE FAIT ROUGIR ──────
 * Elle est écrite au-dessus de chaque cas. Un test qui ne peut pas échouer ne
 * prouve rien — et ce fichier a été relu en mutant chacune d'elles.
 */
import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import {
  buildCompositionIndex,
  type CompositionIndex,
  type CompositionRef,
  resolveIngredient,
} from "./food_composition.ts";
import {
  type FillAnswer,
  type FilledComposition,
  fillCompositions,
  fillRequestsFor,
  type FillRequest,
  groupBandsFrom,
  parseCompositionFillAnswers,
  withFilledRefs,
} from "./composition_fill.ts";
import {
  fillPlanComposition,
  type PendingDbClient,
  repairPlanComposition,
} from "./composition_fill_io.ts";
import type { FoodGroupRef } from "./tokens.ts";

// ---------------------------------------------------------------------------
// LE DÉCOR — un référentiel minuscule, mais avec de VRAIES bandes
// ---------------------------------------------------------------------------

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "non_starchy_veg",
    label: over.slug,
    source: "ciqual",
    energyKcal: 100,
    proteinG: 2,
    carbsG: 10,
    fatG: 1,
    fiberG: 2,
    omega3Marine: false,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: false,
    b12Source: false,
    folateSource: false,
    yieldClass: "neutral",
    yieldFactor: null,
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  };
}

/**
 * `nuts_seeds` porte cinq lignes denses — assez pour une bande (le minimum est
 * trois), et assez large pour que 531 kcal/100 g y tienne. `lait` est là pour
 * le cas `laitue`: c'est un aliment RÉEL, écrit par des humains.
 */
const BASE: CompositionIndex = buildCompositionIndex(
  [
    ref({ slug: "walnuts", foodGroupRef: "nuts_seeds", energyKcal: 654, fatG: 65, proteinG: 15, carbsG: 14 }),
    ref({ slug: "almonds", foodGroupRef: "nuts_seeds", energyKcal: 579, fatG: 50, proteinG: 21, carbsG: 22 }),
    ref({ slug: "cashews", foodGroupRef: "nuts_seeds", energyKcal: 553, fatG: 44, proteinG: 18, carbsG: 30 }),
    ref({ slug: "pumpkin_seeds", foodGroupRef: "nuts_seeds", energyKcal: 446, fatG: 19, proteinG: 30, carbsG: 54 }),
    ref({ slug: "sunflower_seeds", foodGroupRef: "nuts_seeds", energyKcal: 584, fatG: 51, proteinG: 21, carbsG: 20 }),
    ref({ slug: "lait", foodGroupRef: "dairy_yogurt", energyKcal: 46, fatG: 1.5, proteinG: 3.2, carbsG: 4.8 }),
  ],
  [],
);
const BANDS = groupBandsFrom(BASE);

/** La réponse du modèle pour la purée d'amande, telle qu'elle est demandée. */
function almondAnswer(term: string): FillAnswer {
  return {
    term,
    canonicalTerm: "almond butter",
    labelFr: "puree d'amande",
    labelEn: "almond butter",
    foodGroupRef: "nuts_seeds",
    energyKcal: 531.1,
    proteinG: 21,
    carbsG: 19,
    fatG: 50,
    fiberG: 10,
    yieldClass: "neutral",
  };
}

function requestsFor(index: CompositionIndex, terms: readonly string[]) {
  return fillRequestsFor(index, terms.map((t) => ({ term: t, amount: 100, unit: "g" })));
}

// ---------------------------------------------------------------------------
// LE SAS EN MÉMOIRE — il rejoue les règles de la RPC, pas une approximation
// ---------------------------------------------------------------------------
//
// ⚠️ IL REJOUE CE QUE LA BASE FAIT, ET RIEN DE PLUS: la clé est le terme
// CANONIQUE, les formes se rangent à côté, le premier écrivain gagne, et la
// lecture se fait PAR FORME (la vue `food_composition_pending_by_form`). Les
// deux tests SQL du même lot (`composition_surface_forms_test.sql`) éprouvent
// la vraie RPC; celui-ci éprouve le CODE qui l'appelle.

interface SasRow {
  term: string;
  food_group_ref: string | null;
  label: string;
  energy_kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  yield_class: string;
  fill_source: string;
  status: string;
  sightings: number;
}

class FakeSas {
  readonly rows = new Map<string, SasRow>();
  readonly forms = new Map<string, string>();
  reads = 0;

  client(): PendingDbClient {
    // deno-lint-ignore no-this-alias
    const self = this;
    return {
      rpc(fn: string, args: Record<string, unknown>) {
        if (fn !== "record_food_composition_sightings") return Promise.resolve({ error: null });
        for (const raw of (args.p_rows as Record<string, unknown>[]) ?? []) {
          const term = String(raw.term ?? "");
          if (!term) continue;
          // ⛔ UNE FORME DÉJÀ PRISE NE DEVIENT PAS UN ALIMENT DE PLUS.
          if (self.forms.has(term) && self.forms.get(term) !== term) continue;
          const review = (raw.review as string | null) ?? null;
          const existing = self.rows.get(term);
          if (existing) {
            existing.sightings += 1;
            // ⛔ À SENS UNIQUE: une ligne en file peut passer en revue, jamais
            // l'inverse — c'est une lecture humaine qui la remet en file.
            if (existing.status === "pending" && review !== null) {
              existing.status = "needs_review";
            }
          } else {
            self.rows.set(term, {
              term,
              food_group_ref: (raw.food_group_ref as string) ?? null,
              label: String(raw.label ?? term),
              energy_kcal: Number(raw.energy_kcal),
              protein_g: raw.protein_g as number | null,
              carbs_g: raw.carbs_g as number | null,
              fat_g: raw.fat_g as number | null,
              fiber_g: raw.fiber_g as number | null,
              yield_class: String(raw.yield_class),
              fill_source: String(raw.fill_source),
              status: review === null ? "pending" : "needs_review",
              sightings: 1,
            });
          }
          for (const sf of (raw.forms as { form: string }[]) ?? []) {
            const form = String(sf?.form ?? "");
            // ⛔ LE PREMIER ÉCRIVAIN GAGNE — comme `on conflict do nothing`.
            if (!form || form === term || self.forms.has(form) || self.rows.has(form)) continue;
            self.forms.set(form, term);
          }
        }
        return Promise.resolve({ error: null });
      },
      from(table: string) {
        return {
          select(_columns: string) {
            return {
              in(_column: string, values: readonly string[]) {
                self.reads += 1;
                const out: Record<string, unknown>[] = [];
                for (const form of values) {
                  const term = self.forms.get(form) ?? (self.rows.has(form) ? form : null);
                  if (term === null) continue;
                  const row = self.rows.get(term);
                  if (!row) continue;
                  out.push({ ...row, form });
                }
                assert(table === "food_composition_pending_by_form", table);
                return Promise.resolve({ data: out, error: null });
              },
            };
          },
        };
      },
    };
  }
}

/** Un appel de secours de banc: il compte ses invocations. */
function countingAsk(answerFor: (term: string) => FillAnswer | null) {
  const calls: string[][] = [];
  const ask = (requests: readonly FillRequest[]) => {
    calls.push(requests.map((r) => r.term));
    return Promise.resolve(
      requests.map((r) => answerFor(r.term)).filter((a): a is FillAnswer => a !== null),
    );
  };
  return { ask, calls };
}

function repairWith(sas: FakeSas, terms: readonly string[], ask: (r: readonly FillRequest[]) => Promise<FillAnswer[]>) {
  return repairPlanComposition({
    db: sas.client(),
    baseIndex: BASE,
    inputs: terms.map((t) => ({ term: t, amount: 100, unit: "g" })),
    energyInputs: terms.map((t) => ({ term: t, amount: 100, unit: "g" })),
    meta: { source: "test", requestId: "r", userId: "u" },
    ask,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ① DEUX LANGUES, UN ALIMENT
// ═══════════════════════════════════════════════════════════════════════════
//
// MUTATION QUI DOIT ROUGIR: faire le slug sur la forme rencontrée plutôt que
// sur le canonique (`refFor({ canonicalTerm: req.term })`) — `almond butter`
// devient introuvable. Ou ne pas installer les formes de surface dans
// `withFilledRefs` — c'est `purée d'amande` qui devient introuvable.
Deno.test("un aliment atteint par son nom français ET son nom anglais", () => {
  const { requests } = requestsFor(BASE, ["purée d'amande"]);
  const result = fillCompositions({
    index: BASE,
    requests,
    answers: [almondAnswer("puree d'amande")],
    bands: BANDS,
  });
  const { index, kept } = withFilledRefs(BASE, result.filled);

  const fr = resolveIngredient(index, "purée d'amande");
  const en = resolveIngredient(index, "almond butter");
  assert(fr !== null, "le nom français ne résout pas");
  assert(en !== null, "le nom anglais ne résout pas");
  // LE MÊME SLUG, ET LE SLUG EST CELUI DU CANONIQUE.
  assertEquals(fr.slug, "almond_butter");
  assertEquals(en.slug, "almond_butter");
  // ET LA MÊME COMPOSITION — c'est le défaut `yaourt au soja` (54 contre 63).
  assertEquals(fr.energyKcal, en.energyKcal);
  assertEquals(fr.energyKcal, 531.1);
  // La ligne retenue porte son canonique et la forme rencontrée.
  assertEquals(kept.length, 1);
  assertEquals(kept[0].canonicalTerm, "almond butter");
  assertEquals(kept[0].forms.map((f) => f.form), ["puree d'amande"]);
});

// MUTATION QUI DOIT ROUGIR: revenir à un slug par forme.
Deno.test("trois formes du même aliment ne font qu'un slug", () => {
  const forms = ["puree d'amande", "puree d'amandes", "almond butter"];
  const { requests } = requestsFor(BASE, forms);
  const result = fillCompositions({
    index: BASE,
    requests,
    answers: requests.map((r) => almondAnswer(r.term)),
    bands: BANDS,
  });
  const { index, kept } = withFilledRefs(BASE, result.filled);
  const slugs = new Set(forms.map((f) => resolveIngredient(index, f)?.slug ?? "—"));
  assertEquals([...slugs], ["almond_butter"]);
  // Les trois lignes existent (chacune est une forme du plan), et elles
  // partagent UNE seule entrée d'index.
  assertEquals(kept.length, 3);
  assertEquals(new Set(kept.map((k) => k.canonicalTerm)).size, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LES VUES S'ADDITIONNENT — trois plans, une ligne, trois vues
// ═══════════════════════════════════════════════════════════════════════════
//
// MUTATION QUI DOIT ROUGIR: écrire `term: f.term` au lieu de
// `term: f.canonicalTerm` dans `recordPendingSightings` — on retrouve
// 1 + 1 + 1 sur trois lignes, et le seuil de trois n'est jamais atteint.
//
// ⚠️ LES TROIS PLANS ÉCRIVENT TROIS FORMES DIFFÉRENTES, et c'est ce qui fait
// trois AVIS du modèle. Un même plan rejoué deux fois ne compterait qu'une
// vue — c'est le cas ④ plus bas, et les deux règles cohabitent exprès.
//
// ⚠️ LE MODÈLE NE REND ICI QUE LE CANONIQUE, SANS LES LIBELLÉS, et ce n'est pas
// une commodité de banc: c'est le seul cas où les trois formes sont vraiment
// trois AVIS. Dès qu'il rend `label_fr`, la deuxième forme est déjà connue du
// sas et le plan suivant est servi sans appel — c'est le cas juste en dessous,
// et il vaut mieux que celui-ci.
Deno.test("trois plans, trois formes, trois vues sur UNE ligne", async () => {
  const sas = new FakeSas();
  const { ask, calls } = countingAsk((t) => ({
    ...almondAnswer(t),
    labelFr: null,
    labelEn: null,
  }));
  await repairWith(sas, ["almond butter"], ask);
  await repairWith(sas, ["purée d'amande"], ask);
  await repairWith(sas, ["purées d'amandes"], ask);

  // ⛔ UNE SEULE LIGNE. C'est le défaut mesuré: trois lignes de 1 vue, et le
  // seuil de trois jamais atteint.
  assertEquals([...sas.rows.keys()], ["almond butter"]);
  assertEquals(sas.rows.get("almond butter")?.sightings, 3);
  assertEquals(calls.length, 3);
  // Les deux formes françaises pointent vers la ligne anglaise.
  assertEquals(sas.forms.get("puree d'amande"), "almond butter");
  assertEquals(sas.forms.get("purees d'amandes"), "almond butter");
});

// MUTATION QUI DOIT ROUGIR: ne pas envoyer `forms` à la RPC dans
// `recordPendingSightings` — le second plan repaierait l'appel, et le
// français et l'anglais redeviendraient deux aliments.
Deno.test("les deux libellés ferment la porte de l'appel pour l'autre langue", async () => {
  const sas = new FakeSas();
  const { ask, calls } = countingAsk((t) => almondAnswer(t));
  // Un plan ANGLAIS ouvre la ligne. Le modèle nomme aussi le français.
  const first = await repairWith(sas, ["almond butter"], ask);
  assertEquals(calls.length, 1);
  assertEquals(first.counts.sas_value_reused, 0);

  // Un plan FRANÇAIS, sur un terme que personne n'a jamais écrit: aucun appel.
  const second = await repairWith(sas, ["purée d'amande"], ask);
  assertEquals(calls.length, 1);
  assertEquals(second.counts.sas_value_reused, 1);
  assertEquals(resolveIngredient(second.index, "purée d'amande")?.slug, "almond_butter");
  // Et la vue ne bouge pas: le modèle ne s'est pas prononcé sur ce plan-ci.
  assertEquals(sas.rows.get("almond butter")?.sightings, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LE CACHE NE RAPPELLE PAS LE MODÈLE
// ═══════════════════════════════════════════════════════════════════════════
//
// MUTATION QUI DOIT ROUGIR: débrancher la lecture de valeur — remettre
// `toAsk = requests` dans `repairPlanComposition`. On repasse à deux appels.
Deno.test("deux générations sur le même terme: UN seul appel de secours", async () => {
  const sas = new FakeSas();
  const { ask, calls } = countingAsk((t) => almondAnswer(t));

  const first = await repairWith(sas, ["purée d'amande"], ask);
  assertEquals(calls.length, 1);
  assertEquals(first.counts.sas_value_reused, 0);
  assertEquals(first.counts.requested, 1);

  const second = await repairWith(sas, ["purée d'amande"], ask);
  // ⛔ TOUJOURS UN SEUL APPEL. Le second plan a été servi par le sas.
  assertEquals(calls.length, 1);
  assertEquals(second.counts.sas_value_reused, 1);
  // ET `requested` BAISSE — c'est le couple que le journal doit montrer.
  assertEquals(second.counts.requested, 0);
  // Le plan est pesé avec la MÊME valeur qu'à la génération précédente.
  assertEquals(resolveIngredient(second.index, "purée d'amande")?.energyKcal, 531.1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LE CACHE NE COMPTE PAS UNE VUE
// ═══════════════════════════════════════════════════════════════════════════
//
// MUTATION QUI DOIT ROUGIR: retirer `!cachedTerms.has(f.term)` du filtre
// `toRecord` — la seconde lecture ferait monter `sightings` à 2, et trois
// relectures du même plan promouvraient une valeur vue UNE fois.
Deno.test("une lecture de cache n'est pas un avis: sightings ne bouge pas", async () => {
  const sas = new FakeSas();
  const { ask } = countingAsk((t) => almondAnswer(t));

  await repairWith(sas, ["purée d'amande"], ask);
  assertEquals(sas.rows.get("almond butter")?.sightings, 1);

  await repairWith(sas, ["purée d'amande"], ask);
  await repairWith(sas, ["purée d'amande"], ask);
  assertEquals(sas.rows.get("almond butter")?.sightings, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ ⛔ AUCUN ALIAS DEVINÉ — le cas `laitue` / `lait`
// ═══════════════════════════════════════════════════════════════════════════
//
// MUTATION QUI DOIT ROUGIR: retirer la garde `stolen` de `fillCompositions`.
// `laitue` se met alors à porter le slug `lait` — et `withFilledRefs` la
// refuse en `already_resolved`, donc le plan REPERD son ingrédient en plus de
// laisser passer le rapprochement. Les deux assertions l'attrapent.
//
// ⚠️ CE QUI EST REFUSÉ, C'EST LE RAPPROCHEMENT, PAS LA MESURE. La composition
// du modèle sert le plan en cours sous le nom que le plan écrit; ce qui ne
// passe pas, c'est « laitue EST du lait ». La ligne part en `needs_review`,
// donc hors de toute promotion — la boucle ne lit que `pending`.
Deno.test("un canonique qui désigne un aliment curé n'aliase RIEN", async () => {
  const menteur: FillAnswer = {
    term: "laitue",
    // Le modèle affirme que « laitue » est le lait. Il a tort, et surtout: on
    // ne le saurait pas. 12 faux positifs sur 12 mesurés.
    canonicalTerm: "lait",
    labelFr: "lait",
    labelEn: "milk",
    foodGroupRef: "nuts_seeds",
    energyKcal: 500,
    proteinG: 20,
    carbsG: 20,
    fatG: 45,
    fiberG: 5,
    yieldClass: "neutral",
  };
  const { requests } = requestsFor(BASE, ["laitue"]);
  const result = fillCompositions({ index: BASE, requests, answers: [menteur], bands: BANDS });

  assertEquals(result.filled.length, 1);
  // Le canonique est retombé sur le terme du plan: aucun rapprochement.
  assertEquals(result.filled[0].canonicalTerm, "laitue");
  assertEquals(result.filled[0].ref.slug, "laitue");
  assertEquals(result.filled[0].forms, []);
  assertEquals(result.filled[0].reviewReason, "canonical_is_curated_food");
  assertEquals(result.counts.canonical_is_curated_food, 1);

  // ⛔ AUCUNE FORME N'ARRIVE JUSQU'À LA BASE, ET LA LIGNE EST EN REVUE.
  const sas = new FakeSas();
  const { ask } = countingAsk((t) => (t === "laitue" ? menteur : null));
  const out = await repairWith(sas, ["laitue"], ask);
  assertEquals(sas.forms.size, 0, "aucun nom n'a changé d'aliment");
  assertEquals([...sas.rows.keys()], ["laitue"]);
  assertEquals(sas.rows.get("laitue")?.status, "needs_review");
  // ⛔ `laitue` NE REND PAS DU LAIT, et `lait` n'a pas bougé.
  assertNotEquals(resolveIngredient(out.index, "laitue")?.slug, "lait");
  assertEquals(resolveIngredient(out.index, "laitue")?.slug, "laitue");
  assertEquals(resolveIngredient(out.index, "lait")?.energyKcal, 46);
});

// MUTATION QUI DOIT ROUGIR: ne pas filtrer les formes qui résolvent déjà dans
// `surfaceFormsFor` — `lait` deviendrait une clé vers la purée d'amande.
Deno.test("une forme de surface qui désigne déjà un aliment est laissée", () => {
  const answer: FillAnswer = { ...almondAnswer("puree d'amande"), labelFr: "lait" };
  const { requests } = requestsFor(BASE, ["puree d'amande"]);
  const result = fillCompositions({ index: BASE, requests, answers: [answer], bands: BANDS });
  const { index, kept } = withFilledRefs(BASE, result.filled);

  assertEquals(kept[0].forms.map((f) => f.form), ["puree d'amande"]);
  // `lait` n'a pas bougé.
  assertEquals(resolveIngredient(index, "lait")?.energyKcal, 46);
  assertNotEquals(resolveIngredient(index, "lait")?.slug, "almond_butter");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LE CHEMIN CHAUD N'ÉCRIT PAS `food_composition_refs`
// ═══════════════════════════════════════════════════════════════════════════
//
// MUTATION QUI DOIT ROUGIR: ajouter un `.from("food_composition_refs").insert(…)`
// dans l'une des deux lanes.
//
// ⚠️ TEST DE SOURCE, ET C'EST LE SEUL NIVEAU DE GARANTIE QUI TIENNE ICI. La
// règle est « une génération qui écrit le référentiel qu'elle vient de lire
// rend le résultat du plan suivant dépendant du tirage du précédent ». Aucun
// test de comportement ne peut prouver une ABSENCE d'écriture sur tous les
// chemins d'une lane de dix mille lignes; un `grep` sur le fichier, si.
Deno.test("aucune lane de génération n'écrit le référentiel", async () => {
  const lanes = [
    "../../generate-household-meal-v1/index.ts",
    "../../generate-household-meal-v1/index.ts",
  ];
  // Les commentaires sont RETIRÉS avant la recherche: la cicatrice
  // `caller-audit-must-strip-comments` — un grep naïf compte des faux vivants,
  // et ici il ferait l'inverse, un faux ROUGE sur une ligne de doc.
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  for (const lane of lanes) {
    const src = stripComments(
      await Deno.readTextFile(new URL(lane, import.meta.url)),
    );
    assertEquals(
      src.includes("food_composition_refs"),
      false,
      `${lane} nomme food_composition_refs hors commentaire`,
    );
    assertEquals(
      src.includes("food_composition_aliases"),
      false,
      `${lane} nomme food_composition_aliases hors commentaire`,
    );
    assertEquals(
      src.includes("promote_pending_food_compositions"),
      false,
      `${lane} appelle la promotion depuis le chemin chaud`,
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ LE PLAN EN COURS EST PESÉ AVEC LA VALEUR
// ═══════════════════════════════════════════════════════════════════════════
//
// MUTATION QUI DOIT ROUGIR: rendre `args.baseIndex` au lieu de l'index augmenté
// dans `repairPlanComposition` — la part `model` tombe à 0 et la somme des
// trois parts avec elle.
Deno.test("un plan portant un inconnu sort mesuré, et ses parts font 1", async () => {
  const sas = new FakeSas();
  const { ask } = countingAsk((t) => almondAnswer(t));
  const out = await fillPlanComposition({
    baseIndex: BASE,
    attempt: (baseIndex) =>
      repairPlanComposition({
        db: sas.client(),
        baseIndex,
        inputs: [
          { term: "almonds", amount: 50, unit: "g" },
          { term: "purée d'amande", amount: 30, unit: "g" },
        ],
        energyInputs: [
          { term: "almonds", amount: 50, unit: "g" },
          { term: "purée d'amande", amount: 30, unit: "g" },
        ],
        meta: { source: "test", requestId: "r", userId: "u" },
        ask,
      }),
  });
  assert(out.outcome.measured, "le plan doit sortir MESURÉ");
  if (!out.outcome.measured) return;
  assertEquals(out.outcome.unknowns, 1);
  const s = out.outcome.shares as Record<string, number>;
  assertEquals(
    Math.round((s.table + s.model + s.group_bounds + s.promoted) * 1000) / 1000,
    1,
  );
  // La part `model` est celle de la purée: elle n'est pas nulle, donc le plan a
  // bien été pesé sur l'index AUGMENTÉ.
  assert(s.model > 0, `la part model vaut ${s.model}`);
  assertEquals(s.group_bounds, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ LA LECTURE DE LA RÉPONSE — le canonique, s'il manque, ne casse rien
// ═══════════════════════════════════════════════════════════════════════════
//
// MUTATION QUI DOIT ROUGIR: faire de `canonical` un champ obligatoire du
// parseur — une sortie de modèle qui ne l'écrit pas ferait tomber la ligne, et
// le repli par bornes prendrait la main sur une réponse parfaitement lisible.
Deno.test("une réponse sans canonique retombe sur la forme rencontrée", () => {
  const raw = JSON.stringify({
    items: [{
      term: "puree d'amande",
      food_group_ref: "nuts_seeds",
      kcal_100g: 531.1,
      protein_g: 21,
      carbs_g: 19,
      fat_g: 50,
      fiber_g: 10,
      yield_class: "neutral",
    }],
  });
  const { requests } = requestsFor(BASE, ["puree d'amande"]);
  const answers = parseCompositionFillAnswers(raw, requests);
  assertEquals(answers.length, 1);
  assertEquals(answers[0].canonicalTerm, null);
  const result = fillCompositions({ index: BASE, requests, answers, bands: BANDS });
  assertEquals(result.filled.length, 1);
  assertEquals(result.filled[0].canonicalTerm, "puree d'amande");
  assertEquals(result.filled[0].ref.slug, "puree_d'amande");
});

Deno.test("le canonique et les deux libellés sont lus quand ils sont là", () => {
  const raw = JSON.stringify({
    items: [{
      term: "puree d'amandes",
      canonical: "Almond Butter",
      label_fr: "Purée d'amande",
      label_en: "almond butter",
      food_group_ref: "nuts_seeds",
      kcal_100g: 531.1,
      yield_class: "neutral",
    }],
  });
  const { requests } = requestsFor(BASE, ["puree d'amandes"]);
  const [a] = parseCompositionFillAnswers(raw, requests);
  // NORMALISÉS: c'est sous cette forme que le résolveur ira les chercher.
  assertEquals(a.canonicalTerm, "almond butter");
  assertEquals(a.labelFr, "puree d'amande");
  assertEquals(a.labelEn, "almond butter");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ UN MILIEU DE BANDE N'AFFIRME AUCUN NOM
// ═══════════════════════════════════════════════════════════════════════════
//
// MUTATION QUI DOIT ROUGIR: faire porter au repli par bornes le canonique du
// modèle. Une convention voyagerait alors sous le nom d'un aliment, sans le
// `residualKcal` qui dit ce qu'elle coûte.
Deno.test("le repli par bornes ne fabrique ni canonique ni forme", () => {
  const requests: FillRequest[] = [{
    term: "zzz inconnu",
    declaredGroup: "nuts_seeds",
    occurrences: 1,
  }];
  const result = fillCompositions({ index: BASE, requests, answers: [], bands: BANDS });
  assertEquals(result.filled.length, 1);
  const f: FilledComposition = result.filled[0];
  assertEquals(f.source, "group_bounds");
  assertEquals(f.canonicalTerm, "zzz inconnu");
  assertEquals(f.forms, []);
  assert(f.residualKcal > 0, "une convention doit porter son résidu");
});

// MUTATION QUI DOIT ROUGIR: laisser une ligne `group_bounds` armée par le sas
// repartir compter une vue.
Deno.test("une ligne group_bounds armée par le sas ne compte pas de vue", async () => {
  const sas = new FakeSas();
  // Une première ligne `group_bounds` entre dans le sas avec son groupe.
  await sas.client().rpc("record_food_composition_sightings", {
    p_rows: [{
      term: "zzz inconnu",
      food_group_ref: "nuts_seeds",
      label: "zzz inconnu",
      energy_kcal: 500,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      fiber_g: null,
      yield_class: "neutral",
      fill_source: "group_bounds",
      forms: [],
    }],
  });
  assertEquals(sas.rows.get("zzz inconnu")?.sightings, 1);
  // Le modèle se tait. Le sas arme le GROUPE, le repli par bornes remplit — et
  // la ligne ne retourne pas compter un tour, parce que personne ne s'est
  // prononcé sur ce plan-ci.
  const out = await repairWith(sas, ["zzz inconnu"], () => Promise.resolve([]));
  assertEquals(out.counts.sas_group_armed, 1);
  assertEquals(out.counts.sas_write_skipped_reused_group, 1);
  assertEquals(sas.rows.get("zzz inconnu")?.sightings, 1);
});
