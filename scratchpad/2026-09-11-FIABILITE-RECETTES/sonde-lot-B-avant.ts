/**
 * ══════════════════════════════════════════════════════════════════════════
 * SONDE DU LOT B — L'ÉTAT AVANT, MONTRÉ ROUGE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Deux questions, posées aux FONCTIONS DE PRODUCTION sur les profils figés de
 * la campagne (`fixtures/contextes.json`), sans aucun appel modèle :
 *
 *   ① le vendredi partiel garde-t-il sa part de dîner (≈ 859 PERTE / 1 019 GAIN) ?
 *   ② ajouter ou retirer ce vendredi modifie-t-il les contrats du samedi et du
 *     dimanche, qui n'ont pas bougé ?
 *
 * ⛔ AUCUNE ÉQUATION N'EST RECODÉE ICI. `dayTargetFor`, `slotPlanTargets`,
 * `plateBoundsFor` et `requiredDensityFor` sont appelées entières.
 *
 *     deno run --allow-read scratchpad/2026-09-11-FIABILITE-RECETTES/sonde-lot-B-avant.ts
 */
import {
  dayTargetFor,
  plateBoundsFor,
  requiredDensityFor,
} from "../../supabase/functions/_shared/keel/portion_sizing.ts";
import { slotPlanTargets } from "../../supabase/functions/_shared/keel/mouth_anchor.ts";
import {
  boucheDuContexte,
  type BoucheFigee,
} from "../../scripts/2026-09-11-mesure-grille.ts";

const FIXTURES = new URL("./fixtures/", import.meta.url);
const contextes = JSON.parse(
  await Deno.readTextFile(new URL("contextes.json", FIXTURES)),
).contextes as Record<string, unknown>[];

const FLOORS = { normal: 100, light: 60 };

function mouth(b: BoucheFigee) {
  return {
    memberId: b.memberId,
    ageState: b.ageState,
    restriction: b.restriction,
    body: {
      heightCm: b.heightCm,
      weightKg: b.weightKg,
      gender: b.gender,
      ageYears: b.ageYears,
      activityLevel: b.activityLevel,
      activityAxes: b.activityAxes,
      appetite: b.appetite,
    },
    direction: b.direction,
    paceKgPerWeek: b.paceKgPerWeek,
    declaredSlots: b.declaredSlots,
    conditionRefs: b.conditionRefs,
    portionIndex: null,
  };
}

function couloirs(b: BoucheFigee, grille: Record<string, string[]>) {
  const d = requiredDensityFor({
    mouth: mouth(b) as never,
    coachCounting: b.coachCounting,
    slotsByDay: new Map(Object.entries(grille)),
    lightSlots: b.lightSlots,
    slotFixedKcalByDay: new Map(),
    ageYears: b.ageYears,
    floors: FLOORS,
  });
  return d;
}

for (const ctx of contextes) {
  const b = boucheDuContexte(ctx);
  const jour = dayTargetFor(mouth(b) as never, b.coachCounting);
  const label = String(
    (ctx.goal as Record<string, unknown>)?.goal ?? "?",
  ).toUpperCase();
  console.log(`\n═══ ${label} — ${b.prenom} · cible du jour ${jour.kcal} kcal`);
  console.log(`    grille : ${JSON.stringify(b.grille)}`);
  console.log(`    rythme déclaré : ${JSON.stringify(b.declaredSlots)}`);

  // ── ① LA PART DE DÎNER DU VENDREDI ────────────────────────────────────
  // Ce que le DIMENSIONNEMENT calcule (rythme entier au dénominateur), et ce
  // que le PROMPT reçoit (les moments de ce jour-là au dénominateur).
  const rythmeEntier = b.declaredSlots.length > 0
    ? b.declaredSlots
    : [...new Set(Object.values(b.grille).flat())];
  for (const [jourToken, slots] of Object.entries(b.grille)) {
    for (const slot of slots) {
      const dim = slotPlanTargets({
        targetKcal: jour.kcal!,
        coveredSlots: [slot],
        wholeSlots: rythmeEntier,
        lightSlots: b.lightSlots,
        slotFixedKcal: null,
      }).bySlot.get(slot) ?? null;
      const prompt = slotPlanTargets({
        targetKcal: jour.kcal!,
        coveredSlots: [slot],
        wholeSlots: slots,
        lightSlots: b.lightSlots,
        slotFixedKcal: null,
      }).bySlot.get(slot) ?? null;
      const marque = dim !== null && prompt !== null &&
          Math.abs(dim - prompt) > 0.01
        ? `   ⛔ FACTEUR ${(prompt / dim).toFixed(2)}`
        : "";
      console.log(
        `    ${jourToken} ${slot.padEnd(9)} dimensionnement ${
          dim?.toFixed(2).padStart(8)
        }   prompt ${prompt?.toFixed(2).padStart(8)}${marque}`,
      );
    }
  }

  // ── ② AVEC ET SANS LE VENDREDI ────────────────────────────────────────
  const avec = couloirs(b, b.grille);
  const sansVendredi = Object.fromEntries(
    Object.entries(b.grille).filter(([j]) => j !== "fri"),
  );
  const sans = couloirs(b, sansVendredi);
  console.log(`    ── couloirs transmis, AVEC le vendredi ──`);
  for (const d of avec.named) {
    console.log(
      `       ${d.slot.padEnd(9)} [${d.minPer100G}–${d.maxPer100G}] visée ${d.preferredPer100G} ${
        d.incompatible ?? ""
      }`,
    );
  }
  console.log(`    ── couloirs transmis, SANS le vendredi ──`);
  for (const d of sans.named) {
    console.log(
      `       ${d.slot.padEnd(9)} [${d.minPer100G}–${d.maxPer100G}] visée ${d.preferredPer100G} ${
        d.incompatible ?? ""
      }`,
    );
  }
  const bouge: string[] = [];
  for (const d of sans.named) {
    const a = avec.named.find((x) => x.slot === d.slot);
    if (a === undefined) continue;
    if (
      a.minPer100G !== d.minPer100G || a.maxPer100G !== d.maxPer100G ||
      a.preferredPer100G !== d.preferredPer100G ||
      a.incompatible !== d.incompatible
    ) {
      bouge.push(
        `${d.slot}: [${a.minPer100G}–${a.maxPer100G}] visée ${a.preferredPer100G} ${
          a.incompatible ?? "—"
        }  ≠  [${d.minPer100G}–${d.maxPer100G}] visée ${d.preferredPer100G} ${
          d.incompatible ?? "—"
        }`,
      );
    }
  }
  if (bouge.length === 0) {
    console.log(
      `    ✅ retirer le vendredi ne déplace AUCUN couloir de samedi/dimanche`,
    );
  } else {
    console.log(
      `    ⛔ ${bouge.length} couloir(s) de samedi/dimanche DÉPLACÉ(S) par le vendredi :`,
    );
    for (const l of bouge) console.log(`       ${l}`);
  }

  // ── ③ LA VISÉE ANCRÉE À LA CIBLE, POUR L'ARBITRAGE A15 ────────────────
  console.log(`    ── A15 : visée du couloir contre 100 × E / Gpréf ──`);
  const jours = Object.keys(sansVendredi);
  for (const jourToken of jours.slice(0, 1)) {
    for (const slot of sansVendredi[jourToken]) {
      const e = slotPlanTargets({
        targetKcal: jour.kcal!,
        coveredSlots: [slot],
        wholeSlots: rythmeEntier,
        lightSlots: b.lightSlots,
        slotFixedKcal: null,
      }).bySlot.get(slot)!;
      const bornes = plateBoundsFor({
        ageYears: b.ageYears,
        slot,
        slotTargetKcal: e,
        light: b.lightSlots.includes(slot),
        appetite: b.appetite,
      });
      const dm = sans.named.find((x) => x.slot === slot);
      console.log(
        `       ${slot.padEnd(9)} E=${e.toFixed(2).padStart(8)}  Gpréf=${
          String(bornes.preferred).padStart(4)
        }  visée=${String(dm?.preferredPer100G ?? "—").padStart(4)}  ancrée=${
          String(dm?.targetAnchoredPer100G ?? "—").padStart(4)
        }`,
      );
    }
  }
}
