/**
 * LE PALIER D'UNITÉ, REJOUÉ SUR LES DEUX CASSEROLES REFUSÉES DES 30.
 *
 * Tir 6 (`prep_cod`, 1041 g prêts pour 1066 g prélevés) et tir 13
 * (`prep_egg_batch`, 352 g pour 363 g): la recette est relue dans le PREMIER
 * JET archivé (texte brut du modèle), mesurée par `measurePreparation` avec
 * le référentiel, puis passée dans `growIngredientsToReadyMass` — la fonction
 * de production, avec le palier d'unité — pour le prélèvement du journal.
 *
 * ⚠️ LIMITE: la recette du premier jet est celle d'AVANT le dimensionnement
 * du handler; si la masse mesurée ici diffère de `ready_before_g` du journal,
 * ce n'est pas la même casserole et la conclusion ne vaut pas.
 *
 *   deno run --allow-read scratchpad/2026-09-15-BETA-PREUVES/rejouer-palier.ts
 */
import { indexDuReferentiel } from "../2026-09-13-CIBLES-PAR-PERSONNE/composer-reference.ts";
import { measurePreparation } from "../../supabase/functions/_shared/keel/preparation_mass.ts";
import { growIngredientsToReadyMass } from "../../supabase/functions/_shared/keel/portion_scaling.ts";

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);
const SORTIES = `${ROOT}scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F`;
const index = await indexDuReferentiel();

const CAS = [
  { tir: "06", profil: "6", prep: "prep_cod", drawn: 1066, readyJournal: 1041 },
  { tir: "13", profil: "1", prep: "prep_egg_batch", drawn: 363, readyJournal: 352 },
];

function archive(profil: string, tir: string): Record<string, unknown> {
  const prefix = `campagne-tir${profil}-c30${tir}-`;
  for (const e of Deno.readDirSync(SORTIES)) {
    if (e.name.startsWith(prefix)) return JSON.parse(Deno.readTextFileSync(`${SORTIES}/${e.name}`));
  }
  throw new Error(`archive ${prefix} introuvable`);
}

function planDuTexte(brut: string): Record<string, unknown> {
  const a = brut.indexOf("{"), b = brut.lastIndexOf("}");
  return JSON.parse(brut.slice(a, b + 1));
}

for (const c of CAS) {
  const art = archive(c.profil, c.tir);
  const brut = String((art.etapes as Record<string, unknown>).premier_jet ?? art.reponse_brute ?? "");
  const plan = planDuTexte(brut);
  const preps = (plan.preparations as Record<string, unknown>[]) ?? [];
  const prep = preps.find((p) => String(p.id) === c.prep);
  if (!prep) {
    console.log(`tir ${c.tir}: ${c.prep} introuvable dans le premier jet (${preps.map((p) => p.id).join(", ")})`);
    continue;
  }
  const ING = (prep.ingredients as Record<string, unknown>[]) ?? [];
  const mesure = (items: readonly Record<string, unknown>[]) =>
    measurePreparation(index, {
      id: c.prep,
      method: (prep.method as string | null) ?? null,
      ingredients: [...items] as never,
      waterTreatment: null,
    }).readyG;
  const base = mesure(ING);
  console.log(`\n══ tir ${c.tir} · ${c.prep} · méthode ${prep.method ?? "aucune"} · prêt au facteur 1 : ${base} g (journal ${c.readyJournal} g) · prélevé ${c.drawn} g`);
  for (const i of ING) console.log(`   ${i.term} — ${i.quantity} (${i.amount} ${i.unit})`);
  const fit = growIngredientsToReadyMass(ING as never, c.drawn, mesure as never);
  console.log(
    `   → facteur ${fit.factor.toFixed(3)} · paliers d'unité ${fit.unitBumps} · lignes changées ${fit.changed} · ` +
      `prêt ${fit.readyAfterG} g · manque ${fit.shortfallG} g · pesées ${fit.attempts}`,
  );
  for (const [k, i] of fit.items.entries()) {
    if (i.amount !== ING[k].amount) console.log(`   ✎ ${i.term}: ${ING[k].quantity} → ${i.quantity}`);
  }
}
