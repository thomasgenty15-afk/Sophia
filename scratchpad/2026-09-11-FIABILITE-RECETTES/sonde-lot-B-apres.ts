/**
 * ══════════════════════════════════════════════════════════════════════════
 * SONDE DU LOT B — L'ÉTAT APRÈS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Les mêmes deux questions que `sonde-lot-B-avant.ts`, posées au CONTRAT.
 * Comparer les deux sorties figées : `sonde-lot-B-avant-2026-09-11.txt` et
 * `sonde-lot-B-apres-2026-09-11.txt`.
 *
 *     deno run --allow-read scratchpad/2026-09-11-FIABILITE-RECETTES/sonde-lot-B-apres.ts
 */
import { dayTargetFor } from "../../supabase/functions/_shared/keel/portion_sizing.ts";
import {
  requiredDensityFromContracts,
  slotContractsFor,
} from "../../supabase/functions/_shared/keel/slot_nutrition_contract.ts";
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

function jeu(b: BoucheFigee, grille: Record<string, string[]>) {
  return slotContractsFor({
    mouth: mouth(b) as never,
    coachCounting: b.coachCounting,
    rhythmSlots: b.declaredSlots,
    days: Object.entries(grille).map(([jourToken, slots]) => ({
      dayToken: jourToken,
      date: b.jourVersDate[jourToken] ?? jourToken,
      coveredSlots: slots,
      lockedSlots: [],
      fixedKcalBySlot: null,
    })),
    lightSlots: b.lightSlots,
    ageYears: b.ageYears,
  });
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

  const set = jeu(b, b.grille);
  console.log(`    ── le contrat, case par case ──`);
  for (const c of set.contracts) {
    console.log(
      `    ${c.date} ${c.slot.padEnd(9)} rythme ${
        JSON.stringify(c.rhythmSlots).padEnd(40)
      } à composer ${(c.composeKcal ?? 0).toFixed(2).padStart(8)}  budget couvert ${
        (c.coveredBudgetKcal ?? 0).toFixed(2).padStart(8)
      }  couloir [${c.corridor?.minPer100G}–${c.corridor?.maxPer100G}] visée ${c.corridor?.preferredPer100G} ${
        c.corridor?.incompatible ?? ""
      }`,
    );
  }

  const avec = requiredDensityFromContracts(set, FLOORS);
  const sans = requiredDensityFromContracts(
    jeu(
      b,
      Object.fromEntries(Object.entries(b.grille).filter(([j]) => j !== "fri")),
    ),
    FLOORS,
  );
  const bouge: string[] = [];
  for (const d of sans.named) {
    const a = avec.named.find((x) =>
      x.slot === d.slot && d.days.some((j) => x.days.includes(j))
    );
    if (a === undefined) continue;
    if (
      a.minPer100G !== d.minPer100G || a.maxPer100G !== d.maxPer100G ||
      a.preferredPer100G !== d.preferredPer100G ||
      a.incompatible !== d.incompatible
    ) bouge.push(`${d.slot} (${d.days.join("/")})`);
  }
  console.log(
    bouge.length === 0
      ? `    ✅ retirer le vendredi ne déplace AUCUN couloir de samedi/dimanche`
      : `    ⛔ ${bouge.length} couloir(s) déplacé(s) : ${bouge.join(", ")}`,
  );

  console.log(`    ── A15 : visée du couloir contre 100 × E / Gpréf ──`);
  for (const c of set.contracts) {
    if (c.corridor === null || c.bounds === null) continue;
    if (c.dayToken !== "sat") continue;
    console.log(
      `       ${c.slot.padEnd(9)} E=${(c.composeKcal ?? 0).toFixed(2).padStart(8)}  Gpréf=${
        String(c.bounds.preferred).padStart(4)
      }  visée=${String(c.corridor.preferredPer100G).padStart(4)}  ancrée=${
        String(c.corridor.targetAnchoredPer100G).padStart(4)
      }  écart=${
        (c.corridor.targetAnchoredPer100G / c.corridor.preferredPer100G).toFixed(2)
      }×`,
    );
  }
}
