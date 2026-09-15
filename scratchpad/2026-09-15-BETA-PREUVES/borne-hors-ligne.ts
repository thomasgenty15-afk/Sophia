/**
 * LA BORNE D'ARRONDI, REJOUÉE HORS LIGNE SUR LES 13 PLANS À ÉCARTS DES 30.
 *
 * Aucun appel modèle. Pour chaque écart `protein_floor_short` / `cell_bounds_off`
 * enregistré (mesures-campagne-30.json), on relit le plan ARCHIVÉ (ligne_ecrite),
 * on le passe dans `boxNutrition` — le même lecteur que l'audit du produit,
 * qui rend désormais `proteinRoundingG` et `densityRoundingPer100G` — et on
 * compare la borne à l'écart mesuré par l'instrument (`mesure-30/*.txt`).
 *
 * ⚠️ CE QUE CE REJEU NE SAIT PAS: le plancher couvert et le couloir exacts du
 * PRODUIT ne sont pas archivés (l'instrument les affiche à l'entier). On rend
 * donc trois verdicts: FERMÉ À COUP SÛR (l'écart tient même si le nombre
 * affiché est arrondi contre nous), IMPOSSIBLE (l'écart dépasse la borne même
 * si l'arrondi joue pour nous), INDÉCIDABLE HORS LIGNE (entre les deux).
 *
 *   deno run --allow-read scratchpad/2026-09-15-BETA-PREUVES/borne-hors-ligne.ts
 */
import { indexDuReferentiel } from "../2026-09-13-CIBLES-PAR-PERSONNE/composer-reference.ts";
import { boxNutrition } from "../../supabase/functions/_shared/keel/mouth_energy.ts";
import {
  readEnergyBoxDishes,
  readPreparations,
} from "../../supabase/functions/_shared/keel/plan_energy_read.ts";

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);
const SORTIES = `${ROOT}scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F`;
const MESURE = `${ROOT}scratchpad/2026-09-15-BETA-PREUVES/mesure-30`;
const index = await indexDuReferentiel();

type Mesure = {
  tir: string;
  request_id: string;
  defauts_detail: { cause: string; day: string | null; slot: string | null; member_id: string | null }[];
};
const mesures = JSON.parse(
  Deno.readTextFileSync(`${ROOT}scratchpad/2026-09-15-BETA-PREUVES/mesures-campagne-30.json`),
) as Mesure[];

function archiveDe(tir: string): Record<string, unknown> | null {
  const m = /^c30-(\d\d)-p(\d+)$/.exec(tir);
  if (!m) return null;
  const prefix = `campagne-tir${m[2]}-c30${m[1]}-`;
  for (const e of Deno.readDirSync(SORTIES)) {
    if (e.name.startsWith(prefix) && e.name.endsWith(".json")) {
      return JSON.parse(Deno.readTextFileSync(`${SORTIES}/${e.name}`));
    }
  }
  return null;
}

function texteDe(tir: string): string {
  try {
    // ⚠️ l'instrument écrit des espaces insécables (« 35 % », « 59,6 g »):
    // on les ramène à l'espace simple avant toute lecture.
    return Deno.readTextFileSync(`${MESURE}/${tir}.txt`).replace(/[\u00a0\u202f]/g, " ");
  } catch {
    return "";
  }
}

/** Le bloc de l'instrument pour UNE bouche (par son identifiant). */
function blocDe(txt: string, memberId: string): string {
  // ⚠️ l'identifiant apparaît d'abord dans le préambule (la grille): on part de
  // la LIGNE D'EN-TÊTE « bouche  Nom · id », pas de la première occurrence.
  const tete = new RegExp(`^bouche\\s+.*· ${memberId}\\s*$`, "m").exec(txt);
  if (!tete) return "";
  const debut = tete.index;
  const suivant = /^bouche\s+/m.exec(txt.slice(debut + 1));
  return txt.slice(debut, suivant ? debut + 1 + suivant.index : undefined);
}

const PROT = /^(\d{4}-\d{2}-\d{2})\s+(\d+) ?%\s+(\d+)\s+([\d.,]+) ?g\s+(✅|❌)/gm;
const DENS = /^(\d{4}-\d{2}-\d{2})\s+(\w+)\s+\[(\d+)–(\d+)\] aim \d+\s+\[(\d+)–(\d+)\] aim \d+\s+\[[^\]]*\] aim \d+ ?⛔?\s+(\d+)\s+(✅|❌)/gm;

let fermeProt = 0, impossibleProt = 0, indecisProt = 0;
let fermeDens = 0, impossibleDens = 0, indecisDens = 0;
const plansAvecEcart = new Set<string>();
const plansFermes = new Map<string, boolean>();

for (const m of mesures) {
  const ecarts = m.defauts_detail.filter((d) =>
    d.cause === "protein_floor_short" || d.cause === "cell_bounds_off"
  );
  if (ecarts.length === 0) continue;
  plansAvecEcart.add(m.tir);
  const art = archiveDe(m.tir);
  const ligne = art?.ligne_ecrite as Record<string, unknown> | undefined;
  if (!art || !ligne) {
    console.log(`${m.tir}: archive introuvable`);
    continue;
  }
  const txt = texteDe(m.tir);
  const datesLine = /^dates\s+(\{.*\})$/m.exec(txt);
  const dates = datesLine ? JSON.parse(datesLine[1]) as Record<string, string> : {};
  const dishes = readEnergyBoxDishes(ligne.dishes);
  const preparations = readPreparations(ligne.preparations);
  const boxes = boxNutrition({ index, dishes, preparations });
  let toutFerme = true;
  console.log(`\n══ ${m.tir} · ${ecarts.length} écart(s)`);
  for (const e of ecarts) {
    if (e.cause === "protein_floor_short" && e.member_id && e.day) {
      // La journée: toutes les boîtes de cette bouche dont la date est `day`.
      let prot = 0, borne = 0, illisible = false, boites = 0;
      for (const b of boxes) {
        if (!b.memberIds.includes(e.member_id)) continue;
        if ((dates[b.day ?? ""] ?? null) !== e.day) continue;
        boites++;
        const n = b.memberIds.length;
        if (b.proteinG === null || b.proteinRoundingG === null) { illisible = true; continue; }
        prot += b.proteinG / n;
        borne += b.proteinRoundingG / n;
      }
      const bloc = blocDe(txt, e.member_id);
      let plancher: number | null = null, mesure: number | null = null;
      for (const r of bloc.matchAll(PROT)) {
        if (r[1] === e.day) { plancher = Number(r[3]); mesure = Number(r[4].replace(",", ".")); }
      }
      const manque = plancher === null || mesure === null ? null : plancher - mesure;
      // plancher affiché à l'entier: l'exact est dans [plancher−0,5 ; plancher+0,5[
      let verdict = "INDÉCIDABLE hors ligne";
      if (manque !== null) {
        if (mesure! + borne >= plancher! + 0.5) { verdict = "FERMÉ à coup sûr"; fermeProt++; }
        else if (mesure! + borne < plancher! - 0.5) { verdict = "IMPOSSIBLE (l'écart dépasse la borne)"; impossibleProt++; toutFerme = false; }
        else { indecisProt++; toutFerme = false; }
      } else { indecisProt++; toutFerme = false; }
      console.log(
        `  protéine ${e.day} · ${boites} boîte(s)${illisible ? " (une illisible)" : ""} · ` +
          `rejoué ${prot.toFixed(1)} g (instrument ${mesure ?? "?"} g) · plancher affiché ${plancher ?? "?"} g · ` +
          `manque ${manque === null ? "?" : manque.toFixed(1)} g · BORNE ${borne.toFixed(2)} g → ${verdict}`,
      );
    } else if (e.cause === "cell_bounds_off" && e.member_id && e.day && e.slot) {
      let kcal = 0, grams = 0, borne = 0, boites = 0;
      for (const b of boxes) {
        if (!b.memberIds.includes(e.member_id) || b.day !== e.day || b.slot !== e.slot) continue;
        boites++;
        if (b.kcal === null) continue;
        const n = b.memberIds.length;
        kcal += b.kcal / n;
        grams += b.grams / n;
        borne = Math.max(borne, b.densityRoundingPer100G ?? 0);
      }
      const densite = grams > 0 ? (kcal / grams) * 100 : null;
      const bloc = blocDe(txt, e.member_id);
      const date = dates[e.day] ?? "?";
      let min: number | null = null, max: number | null = null, affiche: number | null = null;
      for (const r of bloc.matchAll(DENS)) {
        if (r[1] === date && r[2] === e.slot) { min = Number(r[3]); max = Number(r[4]); affiche = Number(r[7]); }
      }
      let verdict = "INDÉCIDABLE hors ligne";
      if (densite !== null && min !== null && max !== null) {
        // couloir affiché à l'entier: l'exact est à ±0,5 du nombre affiché
        const sousMin = densite < min, surMax = densite > max;
        if (sousMin) {
          if (densite + borne >= min + 0.5) { verdict = "FERMÉ à coup sûr"; fermeDens++; }
          else if (densite + borne < min - 0.5) { verdict = "IMPOSSIBLE"; impossibleDens++; toutFerme = false; }
          else { indecisDens++; toutFerme = false; }
        } else if (surMax) {
          if (densite - borne <= max - 0.5) { verdict = "FERMÉ à coup sûr"; fermeDens++; }
          else if (densite - borne > max + 0.5) { verdict = "IMPOSSIBLE"; impossibleDens++; toutFerme = false; }
          else { indecisDens++; toutFerme = false; }
        } else { verdict = "dans le couloir AFFICHÉ (refusé sur l'exact) → indécidable"; indecisDens++; toutFerme = false; }
      } else { indecisDens++; toutFerme = false; }
      console.log(
        `  densité ${date} ${e.slot} · ${boites} boîte(s) · rejouée ${densite === null ? "?" : densite.toFixed(2)} ` +
          `(instrument ${affiche ?? "?"}) · couloir affiché [${min ?? "?"}–${max ?? "?"}] · BORNE ${borne.toFixed(3)} kcal/100 g → ${verdict}`,
      );
    }
  }
  plansFermes.set(m.tir, toutFerme);
}

console.log(`\n══ BILAN HORS LIGNE`);
console.log(`plans à écarts protéine/densité : ${plansAvecEcart.size}`);
console.log(`journées protéine : fermées à coup sûr ${fermeProt} · impossibles ${impossibleProt} · indécidables ${indecisProt}`);
console.log(`cases densité     : fermées à coup sûr ${fermeDens} · impossibles ${impossibleDens} · indécidables ${indecisDens}`);
const fermes = [...plansFermes.entries()].filter(([, v]) => v).map(([k]) => k);
console.log(`plans dont TOUS les écarts sont fermés à coup sûr : ${fermes.length} ${fermes.length ? `(${fermes.join(", ")})` : ""}`);
