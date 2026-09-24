// ═══════════════════════════════════════════════════════════════════════════
// GENERATE-HOUSEHOLD-MEAL-V1 — QUATRE TRACES DU PLAN (RABOTAGE, KCAL DU JOUR,
//                                BORNES D'ASSIETTE, PLAFOND PROTÉIQUE)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti de `handle` (`index.ts`, découpage des gros fichiers,
// lot 3b). Chaque fonction était une IIFE `const x = (() => { … })();` de
// `handle` qui ne lisait que deux à cinq variables. Le CORPS est le texte
// d'origine, octet pour octet, indentation comprise (six espaces). Seules la
// signature et l'interface de ses entrées sont neuves ; les entrées gardent le
// nom qu'elles avaient dans `handle`. Aucune ne mute rien : elles lisent et
// rendent un objet de trace.
//
// Le commentaire qui dit ce que la trace protège (seau + rang, jamais un
// `member_id` à côté d'un kcal) est resté au-dessus de l'appel, dans `handle`.
// Ce module n'importe jamais `index.ts` et n'a aucun effet au chargement.

import type { PortionBoundaryResult } from "../_shared/keel/portion_boundary.ts";
import type { FinalServed } from "../_shared/keel/served_final.ts";
import {
  type PersonalPlateBounds,
  PLATE_MASS_BOUNDS_G,
  plateBandOf,
} from "../_shared/keel/portion_sizing.ts";
import { type MouthBody, PROTEIN_CEILING_G_PER_KG } from "../_shared/keel/meal_envelope.ts";
import type { DayNutritionRow } from "../_shared/keel/final_plan_audit.ts";

/** Le seau d'une bouche (`mouthBucketOf` de `handle`). */
type MouthBucketOf = (memberId: string) => string;

/** Les entrées de `portionBoundaryTraceOf`, sous leur nom de `handle`. */
interface PortionBoundaryTraceInput {
  portionBoundary: PortionBoundaryResult;
  withheldMemberIds: ReadonlySet<string>;
  mouthBucketOf: MouthBucketOf;
}

/** Le rabotage des bornes, rangé par seau (`const portionBoundaryTrace` de `handle`). */
export function portionBoundaryTraceOf({ portionBoundary, withheldMemberIds, mouthBucketOf }: PortionBoundaryTraceInput) {
      // ⟳ 2026-09-24 — `shavedByMeal` non plus: un `member_id` à côté de kcal,
      // lu par le registre juste en dessous, jamais par un journal.
      const {
        by_member: byMember,
        kcal_shaved: _kcalShavedAll,
        shavedByMeal: _shavedByMeal,
        ...counts
      } = portionBoundary;
      const byBucket: Record<string, { mouths: number; meals: number; grams: number; kcal: number }> =
        {};
      let kcalShaved = 0;
      let kcalWithheldMouths = 0;
      for (const [memberId, row] of Object.entries(byMember).sort(([a], [b]) => a < b ? -1 : 1)) {
        if (withheldMemberIds.has(memberId)) {
          kcalWithheldMouths++;
          continue;
        }
        const bucket = mouthBucketOf(memberId);
        const acc = byBucket[bucket] ?? { mouths: 0, meals: 0, grams: 0, kcal: 0 };
        acc.mouths++;
        acc.meals += row.meals;
        acc.grams += Math.round(row.grams);
        acc.kcal += Math.round(row.kcal);
        byBucket[bucket] = acc;
        kcalShaved += row.kcal;
      }
      return {
        ...counts,
        kcal_shaved: Math.round(kcalShaved),
        kcal_withheld_mouths: kcalWithheldMouths,
        by_bucket: byBucket,
      };
}

/** Les entrées de `finalDayKcalOf`, sous leur nom de `handle`. */
interface FinalDayKcalInput {
  finalServed: FinalServed;
  mouthBucketOf: MouthBucketOf;
}

/** `day_kcal` réécrit depuis l'énergie servie (`const finalDayKcal` de `handle`). */
export function finalDayKcalOf({ finalServed, mouthBucketOf }: FinalDayKcalInput) {
      const out = {
        rows: 0,
        within_5pct: 0,
        over_5pct: 0,
        unreadable: 0,
        per_mouth: [] as {
          day: string;
          eater_bucket: string;
          n: number;
          served: number | null;
          served_before_bounds: number | null;
          shaved_kcal: number | null;
          sides_kcal: number | null;
          target: number;
          pct: number | null;
        }[],
      };
      const rank = new Map<string, number>();
      const keyOf = (r: { memberId: string; day: string }) => `${r.memberId} ${r.day}`;
      const sorted = [...finalServed.rows].sort((a, b) =>
        keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0
      );
      for (const r of sorted) {
        if (r.targetKcal === null || !(r.targetKcal > 0)) continue;
        out.rows++;
        if (r.servedKcal === null) out.unreadable++;
        else if (Math.abs(r.servedKcal - r.targetKcal) / r.targetKcal <= 0.05) out.within_5pct++;
        else out.over_5pct++;
        const bucket = mouthBucketOf(r.memberId);
        const n = (rank.get(bucket) ?? 0) + 1;
        rank.set(bucket, n);
        out.per_mouth.push({
          day: r.day,
          eater_bucket: bucket,
          n,
          served: r.servedKcal,
          served_before_bounds: r.servedBeforeBoundsKcal,
          shaved_kcal: r.shavedKcal,
          sides_kcal: r.sidesKcal,
          target: Math.round(r.targetKcal),
          pct: r.pct,
        });
      }
      return out;
}

/** Les entrées de `plateBoundsTraceOf`, sous leur nom de `handle`. */
interface PlateBoundsTraceInput {
  platedMembers: readonly { memberId: string }[];
  withheldMemberIds: ReadonlySet<string>;
  bodyOfMouth: (memberId: string) => MouthBody | null;
  personalPlateBoundsByMember: ReadonlyMap<string, PersonalPlateBounds | null>;
  mouthBucketOf: MouthBucketOf;
}

/** Les bornes d'assiette de chaque bouche, seau + rang (`const plateBoundsTrace` de `handle`). */
export function plateBoundsTraceOf({ platedMembers, withheldMemberIds, bodyOfMouth, personalPlateBoundsByMember, mouthBucketOf }: PlateBoundsTraceInput) {
      const out = {
        withheld_mouths: 0,
        per_mouth: [] as {
          eater_bucket: string;
          n: number;
          max_g: number;
          min_g: number;
          source: "personal" | "table";
        }[],
      };
      const rank = new Map<string, number>();
      const ids = platedMembers.map((x) => x.memberId).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      for (const memberId of ids) {
        if (withheldMemberIds.has(memberId)) {
          out.withheld_mouths++;
          continue;
        }
        const table =
          PLATE_MASS_BOUNDS_G[plateBandOf(bodyOfMouth(memberId)?.ageYears ?? null).band].meal;
        const personal = personalPlateBoundsByMember.get(memberId) ?? null;
        const bucket = mouthBucketOf(memberId);
        const n = (rank.get(bucket) ?? 0) + 1;
        rank.set(bucket, n);
        out.per_mouth.push({
          eater_bucket: bucket,
          n,
          max_g: personal === null ? table.max : Math.min(table.max, personal.maxG),
          min_g: personal === null ? table.min : Math.min(table.min, personal.minG),
          source: personal === null ? "table" : "personal",
        });
      }
      return out;
}

/** Les entrées de `proteinCeilingTraceOf`, sous leur nom de `handle`. */
interface ProteinCeilingTraceInput {
  auditDayRows: readonly DayNutritionRow[];
  proteinCeilingByMouth: ReadonlyMap<string, number | null>;
  proteinCeilingPass: Record<string, unknown> | null;
}

/** Le plafond protéique mesuré sur la table du plancher (`const proteinCeilingTrace` de `handle`). */
export function proteinCeilingTraceOf({ auditDayRows, proteinCeilingByMouth, proteinCeilingPass }: ProteinCeilingTraceInput) {
      let mouthDays = 0;
      let measured = 0;
      let over = 0;
      let worstOverPct = 0;
      for (const d of auditDayRows) {
        mouthDays += 1;
        const ceiling = proteinCeilingByMouth.get(d.memberId) ?? null;
        if (ceiling === null || d.proteinG === null) continue;
        measured += 1;
        if (d.proteinG > ceiling) {
          over += 1;
          worstOverPct = Math.max(
            worstOverPct,
            Math.round(((d.proteinG - ceiling) / ceiling) * 100),
          );
        }
      }
      return {
        per_kg: PROTEIN_CEILING_G_PER_KG,
        mouth_days: mouthDays,
        measured,
        over,
        worst_over_pct: worstOverPct,
        // ══════════════════════════════════════════════════════════════════
        // ⟳ 2026-09-22 · LOT B — CE QUE LA PASSE ARITHMÉTIQUE A FAIT
        // ══════════════════════════════════════════════════════════════════
        //
        // ⛔ `null` = LA PASSE N'A PAS TOURNÉ (référentiel absent, chemin sans
        // dimensionnement). Un objet à zéros dirait « elle a tourné et n'a rien
        // trouvé », ce qui est une affirmation; `null` dit « elle n'a pas
        // tourné », ce qui est la vérité. Un champ sans compteur est un lot
        // désarmé qui ressemble à un lot qui marche.
        //
        // ⚠️ `adjust.residual_over` ET `over` NE COMPTENT PAS LA MÊME CHOSE, et
        // c'est écrit ici pour que personne ne les additionne: `over` pèse les
        // BOÎTES écrites (`auditDayRows` → `boxNutrition`), `residual_over` pèse
        // la part standard × le facteur, au moment du dimensionnement. Deux
        // bases, deux nombres, tous les deux vrais.
        adjust: proteinCeilingPass,
      };
}
