#!/usr/bin/env -S deno run --allow-read
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LE CAS LEA, ÉPINGLÉ — instrument CONTRE produit, sur les mêmes entrées
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * § 2.3 du chantier. La question est UNE : le banc et le produit appliquent-ils
 * le même contrat protéique à une bouche SANS compte ?
 *
 * ⛔ AUCUNE ÉQUATION ICI. Cette sonde appelle `envelopeFor` (la branche de
 * compte), `mouthEnvelope` (la porte de production) et `proteinBriefFor` (la
 * répartition du produit). Elle ORDONNE des appels et IMPRIME leurs sorties.
 *
 * ⛔ ET ELLE NE JUGE PAS À PARTIR D'ELLE-MÊME : la colonne « produit » du bas
 * est lue DANS LE PROMPT ARCHIVÉ de la fixture, c'est-à-dire dans ce que le
 * moteur a réellement envoyé ce jour-là.
 *
 *     deno run --allow-read scratchpad/2026-09-13-CONTRAT-PROTEIQUE/sonde-lea.ts \
 *       scratchpad/2026-09-11-CLOTURE/fixtures/lot3b-reference.json 1
 */
import {
  boucheDuContexte,
  contratRepare,
  enveloppeDeLaBouche,
  plancherProteine,
} from "../../scripts/2026-09-11-mesure-grille.ts";
import { contexteDeLaDemande } from "../2026-09-11-FIABILITE-RECETTES/analyse-lot-F.ts";
import { envelopeFor } from "../../supabase/functions/_shared/keel/meal_envelope.ts";
import { envelopeDirectionFor } from "../../supabase/functions/_shared/keel/weight_pace.ts";
import { ageBandOf } from "../../supabase/functions/_shared/keel/student_age.ts";
import {
  proteinBriefFor,
} from "../../supabase/functions/_shared/keel/plan_protein_brief.ts";

const chemin = Deno.args[0];
const rang = Number(Deno.args[1] ?? "1");
if (!chemin) {
  console.error("usage: sonde-lea.ts <fixture.json> <rang>");
  Deno.exit(2);
}
const gele = JSON.parse(await Deno.readTextFile(chemin)) as Record<string, unknown>;
const ctx = contexteDeLaDemande(gele);
const b = boucheDuContexte(ctx, rang);
const ligne = (gele.ligne_ecrite ?? {}) as Record<string, unknown>;
const dateMesure = String(ligne.starts_on ?? "");

const L: string[] = [];
const p = (s: string) => L.push(s);

p("══ ENTRÉES (colonnes nommées, aucune déduite) ═══════════════════════════");
p(`prénom                ${b.prenom}`);
p(`member_id             ${b.memberId}`);
p(`compte                ${b.aUnCompte ? "OUI (user_id posé)" : "NON — fiche seule"}`);
p(`poids                 ${b.weightKg} kg`);
p(
  `  source du poids     ${
    b.aUnCompte
      ? "compte — `latestWeight` (série de pesées) dans `envelopeFor`"
      : "fiche — `household_member_bodies.weight_kg` ⇒ `declaredWeightKg`, " +
        "`latestWeight: null` (household_bodies.ts l. 350)"
  }`,
);
p(`taille                ${b.heightCm} cm · sexe ${b.gender}`);
p(`âge                   ${Number.isFinite(b.ageYears) ? b.ageYears : "inconnu"} ans · bande ${ageBandOf(b.ageYears) ?? "—"}`);
p(`ageState              ${b.ageState}`);
p(`objectif lu           ${b.goal === "" ? "(aucun)" : b.goal}`);
p(
  `  source objectif     ${
    b.aUnCompte ? "student_goals.goal (le compte)" : "household_members.goal (la fiche)"
  }`,
);
p(`cran                  ${b.paceKgPerWeek === null ? "(aucun)" : `${b.paceKgPerWeek} kg/sem`}`);
p(`restriction           ${b.restriction}`);
p(`activité              ${b.activityLevel ?? "—"} · axes ${JSON.stringify(b.activityAxes)}`);
p(`appétit               ${b.appetite ?? "—"}`);

// ── ① LA BRANCHE QUE LE PRODUIT EMPRUNTE ──────────────────────────────────
const prod = enveloppeDeLaBouche(b, dateMesure);
const pl = plancherProteine(b, dateMesure);
p("");
p("══ ① LA CHAÎNE DE PRODUCTION (mouthEnvelope) ════════════════════════════");
p(`branche               ${prod.branche}`);
p(`mode d'enveloppe      ${prod.env === null ? "(aucune enveloppe)" : prod.env.mode}`);
p(
  `cible journalière     ${
    pl === null ? "NON APPLICABLE (ni zéro ni succès)" : `${pl.proteinFloorG} g/jour`
  }${pl?.proteinPerMealG ? ` · ${pl.proteinPerMealG} g/repas` : ""}`,
);

// ── ② LA BRANCHE QUE L'INSTRUMENT EMPRUNTAIT AVANT CE LOT ─────────────────
// ⛔ RECONSTITUÉE ICI POUR ÊTRE MONTRÉE, jamais pour servir de référence:
// c'est `latestWeight` FABRIQUÉ depuis la fiche, ce que la production ne fait
// nulle part pour une bouche sans compte.
let avant: number | null = null;
let avantParRepas: number | null = null;
if (b.goal.trim() !== "") {
  const bande = ageBandOf(b.ageYears);
  const flag = b.restriction === "raised" || b.restriction === "unreadable";
  const corps = {
    heightCm: b.heightCm,
    weightKg: b.weightKg,
    gender: b.gender,
    ageYears: b.ageYears,
    activityLevel: b.activityLevel,
    activityAxes: b.activityAxes,
    appetite: b.appetite,
  };
  const env = envelopeFor(
    b.goal as never,
    {
      heightCm: b.heightCm,
      ageBand: bande,
      gender: b.gender,
      latestWeight: { weekStart: dateMesure, value: b.weightKg },
      declaredWeightKg: b.weightKg,
      latestWaist: null,
      restrictionFlag: flag,
    } as never,
    bande,
    flag,
    null,
    b.activityLevel as never,
    b.activityAxes as never,
    b.appetite,
    null,
    envelopeDirectionFor({
      goal: b.goal as never,
      subject: { body: corps as never, isMinor: b.ageState === "minor" },
      paceKgPerWeek: b.paceKgPerWeek,
      deficitCancelled: false,
    }),
  );
  if (env.mode === "per_kg" && Number.isFinite(env.proteinFloorG)) {
    avant = env.proteinFloorG;
    avantParRepas = env.proteinPerMealG;
  }
}
p("");
p("══ ② CE QUE L'INSTRUMENT DISAIT AVANT (latestWeight FABRIQUÉ) ═══════════");
p(
  `cible journalière     ${avant === null ? "NON APPLICABLE" : `${avant} g/jour`}${
    avantParRepas ? ` · ${avantParRepas} g/repas` : ""
  }`,
);

// ── ③ LA DISTRIBUTION PAR CRÉNEAU, PAR LA FONCTION DU PRODUIT ─────────────
const set = contratRepare(b).set;
type Contrat = (typeof set.contracts)[number];
const parJour = new Map<string, Contrat[]>();
for (const c of set.contracts) {
  const l = parJour.get(c.date) ?? [];
  l.push(c);
  parJour.set(c.date, l);
}
const brief = (jour: number | null, repas: number | null) =>
  proteinBriefFor({
    memberId: b.memberId,
    dayFloorG: jour,
    perMealFloorG: repas,
    abstention: jour === null ? "no_body" : "none",
    days: [...parJour].map(([date, contracts]) => ({
      date,
      dayToken: contracts[0].dayToken,
      dayTargetKcal: contracts[0].dayTargetKcal,
      coveredBudgetGrossKcal: contracts[0].coveredBudgetGrossKcal,
      fixedProteinG: null,
      slots: contracts.map((c) => ({ slot: c.slot, composeKcal: c.composeKcal })),
    })),
  });
const rendu = (nom: string, jour: number | null, repas: number | null) => {
  const br = brief(jour, repas);
  p(
    `${nom.padEnd(22)}${
      br.slots.length === 0
        ? `(aucune ligne — silence « ${br.silence} »)`
        : br.slots
          .map((s) => `${s.slot} ${s.gramsPerServing} g [${s.days.join(",")}]`)
          .join(" · ")
    }${
      br.slots.length === 0 ? "" : ` — somme/jour ${
        br.slots.reduce((n, s) => n + s.gramsPerServing, 0)
      } g`
    }`,
  );
};
p("");
p("══ ③ DISTRIBUTION PAR CRÉNEAU (plan_protein_brief.ts, fonction produit) ══");
rendu("après (production)", pl?.proteinFloorG ?? null, pl?.proteinPerMealG ?? null);
rendu("avant (instrument)", avant, avantParRepas);

// ── ④ CE QUE LE PROMPT ARCHIVÉ PORTE RÉELLEMENT ───────────────────────────
const etapes = JSON.stringify(gele.etapes ?? {});
const carte = etapes.indexOf(`== ${b.prenom} (${b.memberId}) ==`);
const bloc = carte < 0 ? "" : etapes.slice(carte, carte + 900);
const ligneProt = bloc
  .split("\\n")
  .find((x) => x.includes("one serving here carries")) ?? null;
p("");
p("══ ④ LE PROMPT ARCHIVÉ DE CETTE FIXTURE — le produit, pas une opinion ════");
p(
  ligneProt === null
    ? "   (aucune ligne protéique en face de ce nom dans le prompt archivé)"
    : `  ${ligneProt.trim()}`,
);
const chiffres = (ligneProt ?? "").match(/(\d+) g of protein|(\d+) g in the/g) ?? [];
const somme = chiffres
  .map((x) => Number(x.match(/\d+/)![0]))
  .reduce((a, n) => a + n, 0);
p(
  ligneProt === null ? "" : `   somme des trois cases du prompt : ${somme} g/jour`,
);

console.log(L.join("\n"));
