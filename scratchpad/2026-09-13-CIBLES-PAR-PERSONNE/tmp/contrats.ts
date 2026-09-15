/**
 * LES CONTRATS DU MOTEUR, CASE PAR CASE ET BOUCHE PAR BOUCHE.
 *
 * ⛔ AUCUNE ÉQUATION RECODÉE : `contratsParCase` / `boucheDuContexte` de
 * `scripts/2026-09-11-mesure-grille.ts`, c'est-à-dire `slot_nutrition_contract.ts`
 * appelé sur la DEMANDE FIGÉE. Sert à COMPOSER une référence, pas à la juger.
 */
import {
  apportsFixesParJour,
  boucheDuContexte,
  chargerFixtures,
  contratsParCase,
  plancherProteine,
  troisIndex,
} from "../../../scripts/2026-09-11-mesure-grille.ts";
import { contexteDeLaDemande } from "../../2026-09-11-FIABILITE-RECETTES/analyse-lot-F.ts";

const gele = JSON.parse(await Deno.readTextFile(Deno.args[0])) as Record<string, unknown>;
const ctx = contexteDeLaDemande(gele) as Record<string, unknown>;
// ⚠️ SANS LIGNE ÉCRITE, `contexteDeLaDemande` ne sait pas dater la grille : son
// `jour_local` vient de `ligne.starts_on`. On lui redonne le `starts_on` de la
// FENÊTRE ATTENDUE, figée avant l'appel — la même date, par la source d'amont.
const fen = ((gele.demande as any).fenetre ?? {}) as any;
if (!(ctx.instant as any).jour_local) {
  (ctx.instant as any).jour_local = String(fen.acceptee?.starts_on ?? fen.attendue?.starts_on ?? "");
}
const ROOT = decodeURIComponent(new URL("../../../", import.meta.url).pathname);
const base = await chargerFixtures(`${ROOT}scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures`);
// ⛔ LES APPORTS FIXES TRAVERSENT, comme dans `mesurerUnPlan`. Sans eux, la
// cible de la case du yaourt est celle d'un tir SANS apport.
const idx = await troisIndex(
  { ...base, plans: [], contextes: [], echanges: [], journaux: [] },
  { content_locale: "fr-FR" },
);
const bouches = (gele.demande as any).bouches as Record<string, unknown>[];
for (let rang = 0; rang < bouches.length; rang++) {
  const b = boucheDuContexte(ctx as never, rang);
  const ap = apportsFixesParJour({ index: idx.relecture.index, bouche: b });
  const fixe = ap.declares === 0 ? null : ap.parJour;
  const cs = contratsParCase(b, fixe);
  if (ap.declares > 0) {
    console.log(`   apports fixes : ${ap.declares} déclaré(s) · ${ap.illisibles} illisible(s) · ` +
      [...ap.parJour.entries()].map(([j, m]) => `${j}=${JSON.stringify(Object.fromEntries(m))}`).join(" "));
  }
  console.log(`\n══ ${b.prenom} (${b.memberId.slice(0,8)}) · ${b.weightKg} kg · ${b.gender} · appétit ${b.appetite} · objectif ${b.goal ?? "AUCUN"}`);
  console.log(`   cible JOUR ${cs[0]?.cibleJourKcal ?? "—"} kcal`);
  console.log(`   date        slot        cible   gMin  gPref  gMax   couloir kcal/100g        ρ admissible (cible/gMax → cible/gMin)`);
  const pl = plancherProteine(b, String((gele.demande as any).fenetre?.attendue?.starts_on ?? ""));
  console.log(`   plancher PROTÉINE : ${JSON.stringify(pl)}`);
  for (const c of cs) {
    const co = c.couloirTransmis;
    const rhoMin = c.cibleCaseKcal !== null && c.gMax ? (c.cibleCaseKcal / c.gMax * 100) : null;
    const rhoMax = c.cibleCaseKcal !== null && c.gMin ? (c.cibleCaseKcal / c.gMin * 100) : null;
    console.log(
      `   ${c.date}  ${c.slot.padEnd(10)} ${String(c.cibleCaseKcal?.toFixed(1) ?? "—").padStart(7)} ` +
      `${String(c.gMin ?? "—").padStart(5)} ${String(c.gPref ?? "—").padStart(6)} ${String(c.gMax ?? "—").padStart(5)}   ` +
      `[${co?.min?.toFixed(0) ?? "—"}–${co?.max?.toFixed(0) ?? "—"}] visée ${co?.pref?.toFixed(0) ?? "—"}${co?.incompatible ? " ⚠️"+co.incompatible : ""}`.padEnd(34) +
      `   [${rhoMin?.toFixed(1) ?? "—"} – ${rhoMax?.toFixed(1) ?? "—"}]`,
    );
  }
}
