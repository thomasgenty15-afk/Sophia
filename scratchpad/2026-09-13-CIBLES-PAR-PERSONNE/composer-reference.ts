/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 2 §2 — LE COMPOSITEUR DE RÉFÉRENCES DÉTERMINISTES
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
 *     scratchpad/2026-09-13-CIBLES-PAR-PERSONNE/composer-reference.ts \
 *     --contrats=scratchpad/2026-09-11-CLOTURE/fixtures/lot2-ref1-contrats.json \
 *     --sortie=scratchpad/2026-09-13-CIBLES-PAR-PERSONNE/references/ref1.json
 *
 * ── CE QU'IL FAIT, ET CE QU'IL NE PRÉTEND PAS FAIRE ───────────────────────
 *
 * Il fabrique un PLAN NU (le JSON qu'un modèle rendrait), destiné à
 * `banc-lot-F.ts --reponse=`. La revue l'a tranché : « une fixture construite
 * explicitement, validée avec les fonctions de production, est adaptée à un
 * test déterministe » — elle ne mesure simplement PAS la compétence
 * générative du modèle, et le rapport doit le dire.
 *
 * ── ⛔ AUCUNE ÉQUATION RECODÉE ────────────────────────────────────────────
 * La densité servie et l'énergie de chaque plat sont mesurées par
 * `dishEnergy` + `weighedReadyGrams` — les MÊMES fonctions que le moteur et
 * que l'instrument. Le compositeur ne fait qu'AJUSTER une quantité par
 * dichotomie jusqu'à ce que la mesure tombe dans le couloir que
 * `slot_nutrition_contract.ts` a calculé.
 *
 * ⛔ IL NE TOUCHE NI AUX PROFILS NI AUX SEUILS. Si aucune quantité ne fait
 * entrer une recette dans son couloir, il le DIT et sort en erreur. Élargir
 * une tolérance pour faire passer une recette est interdit par le plan.
 */
import { loadCompositionIndex } from "../../supabase/functions/_shared/keel/food_composition_io.ts";
import { indexForReading } from "../../supabase/functions/_shared/keel/composition_fill_io.ts";
import { dishEnergy } from "../../supabase/functions/_shared/keel/plan_energy.ts";
import { weighedReadyGrams } from "../../supabase/functions/_shared/keel/box_densify.ts";
import { proteinOfUnit } from "../../supabase/functions/_shared/keel/preparation_mass.ts";
import type { CompositionIndex } from "../../supabase/functions/_shared/keel/food_composition.ts";
import {
  isComposable,
  validationOf,
} from "../../supabase/functions/_shared/keel/food_reference_manifest.ts";

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);

// ═══════════════════════════════════════════════════════════════════════════
// LE RÉFÉRENTIEL, LU UNE FOIS — le MÊME fichier figé que l'instrument
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ ET CE N'EST PAS CELUI DU MOTEUR. Le moteur lit la base vivante ; ce
// fichier est le gel du 2026-09-11. Les deux portent 943 lignes et le
// compositeur n'emploie que des identifiants présents dans les deux — mais un
// écart entre eux ferait diverger la composition de la mesure, et ça se dit.
const REF_JSON = `${ROOT}scratchpad/2026-09-11-REVUE-CAMPAGNE/referentiel.json`;

function dbDePapier(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from: (table: string) => ({
      select: () => ({
        range: (a: number, b: number) =>
          Promise.resolve({ data: (tables[table] ?? []).slice(a, b + 1), error: null }),
        in: (champ: string, voulus: string[]) =>
          Promise.resolve({
            data: (tables[table] ?? []).filter((r) => voulus.includes(String(r[champ]))),
            error: null,
          }),
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  };
}

export async function indexDuReferentiel(): Promise<CompositionIndex> {
  const tables = JSON.parse(await Deno.readTextFile(REF_JSON)) as Record<
    string,
    Record<string, unknown>[]
  >;
  const db = dbDePapier(tables);
  const historique = await loadCompositionIndex(db as never, { lang: "fr" });
  // ⚠️ PAS DE `lang` ICI : `indexForReading` n'en prend pas. La langue est
  // décidée par `loadCompositionIndex` juste au-dessus, une seule fois.
  const lu = await indexForReading({
    db: db as never,
    baseIndex: historique,
    inputs: [],
  });
  return lu.index;
}

// ═══════════════════════════════════════════════════════════════════════════
// UNE LIGNE D'INGRÉDIENT, ÉCRITE COMME LE MODÈLE L'ÉCRIT
// ═══════════════════════════════════════════════════════════════════════════

export interface Ligne {
  term: string;
  quantity: string;
  amount: number;
  unit: "g";
  state: "raw";
  ref: string;
}

export function ligne(term: string, ref: string, g: number): Ligne {
  const n = Math.round(g);
  return {
    term,
    quantity: `${n} g de ${term}`,
    amount: n,
    unit: "g",
    state: "raw",
    ref,
  };
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ LA PORTE DE COMPOSITION, ÉPROUVÉE AVANT D'ÉCRIRE LA RÉFÉRENCE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Une référence dont le référentiel N'AUTORISE PAS la composition rend
 * `ref_refused` au contrat de sortie, et le plat entier devient NON MESURABLE
 * — donc aucune portion, donc `cell_without_portion`, donc un refus.
 *
 * MESURÉ LE 2026-09-13 sur la première version de la référence N=2 : le
 * `tamari_sans_gluten` de la casserole de tempeh a `source = "sas"`, donc
 * `defaultValidationFor("sas") = "a_verifier"`, donc `isComposable` rend
 * `false`. Les DEUX déjeuners sont sortis « unmeasurable_by: ref_refused: 2 »
 * et le plan a été refusé — sur un ingrédient de 24 g.
 *
 * ⚠️ CE N'EST PAS UN DÉFAUT DU MOTEUR : la porte fait exactement son travail.
 * C'est une contrainte de COMPOSITION, et une référence doit la connaître
 * avant d'exister.
 */
export function refusNonComposables(
  index: CompositionIndex,
  lignes: readonly Ligne[],
): string[] {
  const out = new Set<string>();
  for (const l of lignes) {
    const ref = index.bySlug.get(l.ref);
    if (ref === undefined) {
      out.add(`${l.ref} (absent du référentiel)`);
      continue;
    }
    if (!isComposable(ref)) out.add(`${l.ref} (source ${ref.source} ⇒ ${validationOf(ref)})`);
  }
  return [...out].sort();
}

/** L'énergie, la masse prête, la densité servie et la protéine — PAR LES LECTEURS DE PRODUCTION. */
export function mesurer(
  index: CompositionIndex,
  unite: { method: string; ingredients: readonly Ligne[] },
): { kcal: number | null; readyG: number | null; densite: number | null; proteineG: number | null } {
  const e = dishEnergy(index, unite as never);
  const ready = weighedReadyGrams(unite.ingredients as never, index);
  const prot = proteinOfUnit(index, unite.method, unite.ingredients as never);
  const kcal = e.complete ? e.kcal : null;
  return {
    kcal,
    readyG: ready,
    densite: kcal !== null && ready !== null && ready > 0 ? (kcal / ready) * 100 : null,
    proteineG: prot,
  };
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * L'AJUSTEMENT : UNE SEULE QUANTITÉ BOUGE, PAR DICHOTOMIE, JUSQU'AU COULOIR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE N'EST PAS UNE OPTIMISATION, C'EST UNE MESURE RÉPÉTÉE. On fait varier
 * la masse de l'ingrédient `rang` et on RELIT la densité avec `dishEnergy` :
 * aucune formule de densité n'est écrite ici, donc aucune ne peut diverger de
 * celle du moteur.
 *
 * ⚠️ MONOTONIE SUPPOSÉE ET VÉRIFIÉE : ajouter du volumineux peu dense fait
 * BAISSER la densité. La fonction lit le sens aux deux bornes et refuse si
 * l'intervalle n'encadre pas la cible — elle ne rend jamais « le plus proche ».
 */
export function ajuster(
  index: CompositionIndex,
  unite: { method: string; ingredients: Ligne[] },
  rang: number,
  densiteVoulue: number,
  bornes: { min: number; max: number },
): { ok: true; amount: number; mesure: ReturnType<typeof mesurer> } | { ok: false; raison: string } {
  const essai = (g: number) => {
    const copie = unite.ingredients.map((l, i) =>
      i === rang ? ligne(l.term, l.ref, g) : l
    );
    return mesurer(index, { method: unite.method, ingredients: copie });
  };
  const bas = essai(bornes.min), haut = essai(bornes.max);
  if (bas.densite === null || haut.densite === null) {
    return { ok: false, raison: "densité illisible à une borne (référentiel)" };
  }
  const dedans = (bas.densite - densiteVoulue) * (haut.densite - densiteVoulue) <= 0;
  if (!dedans) {
    return {
      ok: false,
      raison: `la cible ${densiteVoulue.toFixed(1)} n'est pas encadrée : ` +
        `${bornes.min} g → ${bas.densite.toFixed(1)} · ${bornes.max} g → ${haut.densite.toFixed(1)}`,
    };
  }
  let lo = bornes.min, hi = bornes.max;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const m = essai(mid);
    if (m.densite === null) return { ok: false, raison: "densité illisible en cours de recherche" };
    // Le sens : si la densité à `lo` est AU-DESSUS de la cible, monter `g`
    // fait descendre. On garde le côté qui encadre encore.
    const dLo = essai(lo).densite!;
    if ((dLo - densiteVoulue) * (m.densite - densiteVoulue) <= 0) hi = mid;
    else lo = mid;
  }
  const g = Math.round((lo + hi) / 2);
  return { ok: true, amount: g, mesure: essai(g) };
}
