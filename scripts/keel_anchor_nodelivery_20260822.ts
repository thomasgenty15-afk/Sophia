/**
 * ══════════════════════════════════════════════════════════════════════════
 * L-anchor-nodelivery — `no_delivery` DÉCOMPOSÉ EN CAUSES, CHACUNE COMPTÉE,
 *                       ⛔ SUR LES **DEUX** DÉNOMINATEURS.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche
 * `L-anchor-nodelivery`.
 *
 *     bash scripts/keel_anchor_nodelivery_20260822.sh
 *
 * ── ⛔ CE SCRIPT N'ÉCRIT RIEN, ET N'APPELLE AUCUN MODÈLE ───────────────────
 *
 * ── LES TROIS CHOSES QU'IL REFUSE DE FAIRE ────────────────────────────────
 *
 * ① **IL NE REND JAMAIS UN SEUL DÉNOMINATEUR** (§⑨ n° 50), et la population
 *    exclue est NOMMÉE ET COMPTÉE.
 *
 * ② **IL NE CONFOND PAS LE GELÉ ET LE RECOMPOSÉ.** Les dix seaux persistés
 *    ont été calculés sur le référentiel de l'instant de la génération; la
 *    recomposition lit celui d'aujourd'hui. Les deux sont imprimés CÔTE À
 *    CÔTE, et l'écart est un fait mesuré, pas un bruit.
 *
 * ③ **IL NE COMPTE PAS SEULEMENT CE QUE LE PRODUIT COMPTE.** `householdAnchors`
 *    itère sur les LIGNES de `mouthDayEnergy`; un couple bouche-jour sans
 *    ligne n'entre dans aucun seau. Ce script rend donc le produit cartésien
 *    bouche × jour, et la population invisible AVEC.
 *
 * ── LA GARDE DE COHÉRENCE, ET POURQUOI ELLE EST LÉGITIME ──────────────────
 * `dishSlices` ne lit pas le référentiel: une ligne existe parce qu'un
 * contenant porte un nom. Le NOMBRE de lignes est donc invariant au
 * référentiel, même quand leur classement ne l'est pas. « somme des dix seaux
 * == lignes recomposées » est donc une égalité EXACTE attendue, et un plan qui
 * la viole rend le script `rc=1`.
 */

import { fileClient } from "./keel_v0e_resolveur_20260821.ts";
import {
  isLivePrompt,
  laneOf,
  LIVE_HOUSEHOLD_PROMPT,
  LIVE_MEAL_PROMPT,
  readIngredientsWithGroup,
} from "./keel_l17_bornes_20260822.ts";
import { loadCompositionIndex } from "../supabase/functions/_shared/keel/food_composition_io.ts";
import {
  type MouthDayEnergy,
  type MouthEnergyDish,
  mouthDayEnergy,
} from "../supabase/functions/_shared/keel/mouth_energy.ts";
import type { EnergyPreparation } from "../supabase/functions/_shared/keel/plan_energy.ts";
import {
  ANCHOR_REASONS,
  type AnchorMouth,
  anchorFactorFor,
} from "../supabase/functions/_shared/keel/mouth_anchor.ts";
import {
  DELIVERY_CAUSE_VERDICT,
  DELIVERY_CAUSES,
  type DeliveryCause,
  deliveryCauseOf,
  gapKeyOf,
} from "../supabase/functions/_shared/keel/mouth_delivery_cause.ts";

/**
 * ⛔ `Lane` EST DÉRIVÉ, JAMAIS RÉÉCRIT. `L17` ne l'exporte pas; recopier
 * `"foyer" | "solo"` ici ferait un second vocabulaire qui divergerait au
 * premier ajout — c'est le défaut n° 1 de ce dépôt, en miniature.
 */
type Lane = ReturnType<typeof laneOf>;

/** Le seuil de la fiche, épinglé — jamais recalculé depuis la sortie. */
const SEUIL_NO_DELIVERY = 0.25;

/**
 * ⛔ LA BOUCHE DE RÉFÉRENCE, ET POURQUOI ELLE EST LÉGITIME ICI.
 *
 * `anchorFactorFor` demande un CORPS, et le plan n'en persiste aucun: on ne
 * peut donc pas rejouer la production bouche par bouche. Mais la question de
 * ce lot ne porte QUE sur la branche `:604`, qui ne lit que `day` — et les
 * seaux GELÉS prouvent qu'on l'atteint toujours: `restriction_floor`,
 * `restriction_unknown`, `no_body`, `age_unknown`, `pregnancy` et
 * `breastfeeding` valent **0 sur les 149 lignes des 12 plans**. Aucune bouche
 * réelle ne s'est arrêtée AVANT cette ligne.
 *
 * ⚠️ CE QUE ÇA NE PERMET PAS DE DIRE: le partage `anchored` / `clamped`
 * dépend du corps, et il n'est donc PAS reproductible ici. Il n'est pas
 * imprimé. Seuls le partage LIVRE/NE LIVRE PAS et le partage
 * `no_delivery` / `common_pot_day` sont lus — les deux ne dépendent que de
 * `day`, et c'est très exactement ce que ce lot mesure.
 *
 * `direction: null` ⇒ la cible EST l'entretien, sans aucun écart à exécuter.
 */
const BOUCHE_DE_REFERENCE: AnchorMouth = {
  memberId: "",
  ageState: "adult",
  restriction: "clear",
  body: {
    appetite: null,
    heightCm: 170,
    weightKg: 68,
    gender: "female",
    ageYears: 40,
    activityLevel: "on_feet",
    activityAxes: { day: null, sport: null, asked: false },
  },
  direction: null,
  paceKgPerWeek: null,
  conditionRefs: [],
  declaredSlots: [],
  structure: null,
};

// ---------------------------------------------------------------------------
// ① LES ADAPTATEURS — `slot` ET `boxes` EN PLUS DE CEUX DE `L17`
// ---------------------------------------------------------------------------

/**
 * ⛔ `slot` ET `boxes` NE SONT PAS DÉCORATIFS ICI. L'adaptateur de `L17` lit
 * l'énergie d'un plan; celui-ci lit ce que CHAQUE BOUCHE en reçoit, et les
 * deux champs sont très exactement ce qui fait la différence.
 */
function readMouthDishes(raw: unknown): MouthEnergyDish[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const d = (entry ?? {}) as Record<string, unknown>;
    return {
      day: d.day === null || d.day === undefined ? null : String(d.day),
      slot: d.slot === null || d.slot === undefined ? null : String(d.slot),
      method: String(d.method ?? ""),
      ingredients: readIngredientsWithGroup(d.ingredients),
      uses: Array.isArray(d.uses)
        ? d.uses.map((rawUse) => {
          const u = (rawUse ?? {}) as Record<string, unknown>;
          return {
            preparationId: String(u.preparation_id ?? ""),
            servings: Number(u.servings) || 1,
          };
        }).filter((u) => u.preparationId !== "")
        : [],
      boxes: Array.isArray(d.boxes)
        ? d.boxes.map((rawBox) => {
          const b = (rawBox ?? {}) as Record<string, unknown>;
          const legacy = Number(b.legacy_total_grams);
          return {
            memberIds: Array.isArray(b.member_ids) ? b.member_ids.map(String) : [],
            items: Array.isArray(b.items)
              ? b.items.map((rawItem) => ({
                grams: Number((rawItem as Record<string, unknown>)?.grams) || 0,
              }))
              : [],
            legacyTotalGrams: Number.isFinite(legacy) ? legacy : null,
          };
        })
        : [],
    };
  });
}

function readPreparations(raw: unknown): EnergyPreparation[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const p = (entry ?? {}) as Record<string, unknown>;
    return {
      id: String(p.id ?? ""),
      servingsMade: Math.max(1, Number(p.servings_made) || 1),
      ingredients: readIngredientsWithGroup(p.ingredients),
    };
  }).filter((p) => p.id !== "");
}

/**
 * LES ABSENCES DÉCLARÉES, par bouche et par jour.
 *
 * ⛔ C'EST LA SEULE PIÈCE QUI PERMET DE DIRE SI UN SILENCE EST JUSTE. Sans
 * elle, « la bouche n'est sur aucun contenant ce jour-là » et « le plan a
 * oublié cette bouche » sont le même octet.
 */
function awayByMouth(presence: unknown): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const p = (presence ?? {}) as Record<string, unknown>;
  const members = Array.isArray(p.members) ? p.members : [];
  for (const rawMember of members) {
    const m = (rawMember ?? {}) as Record<string, unknown>;
    const id = String(m.member_id ?? "");
    if (!id) continue;
    const days = out.get(id) ?? new Set<string>();
    // `away` porte DÉJÀ la fusion de `self`, `household` et `eating_out` dans
    // la lane foyer; on ne la refait pas, on lit le champ qui la porte.
    for (const rawAway of Array.isArray(m.away) ? m.away : []) {
      const a = (rawAway ?? {}) as Record<string, unknown>;
      const day = String(a.day ?? "");
      if (day) days.add(day);
    }
    out.set(id, days);
  }
  return out;
}

// ---------------------------------------------------------------------------
// ② LE COMPTE
// ---------------------------------------------------------------------------

interface PlanRead {
  id: string;
  lane: Lane;
  live: boolean;
  createdAt: string;
  /** Les dix seaux GELÉS à la génération. `null` = le bloc n'existe pas. */
  frozen: Record<string, number> | null;
  frozenApplied: number | null;
  /** Les causes recomposées sur le référentiel D'AUJOURD'HUI. */
  causes: Record<DeliveryCause, number>;
  /** L'histogramme des ensembles de lacunes, sur les lignes qui ne livrent pas. */
  gapKeys: Map<string, number>;
  rows: number;
  mouths: number;
  days: number;
  /** Couples sans ligne dont l'absence EST déclarée ce jour-là. */
  noRowAway: number;
  noRowPresent: number;
  boxesOneName: number;
  boxesCommonPot: number;
  /**
   * ⛔ LES BOUCHES QUE L'ANCRAGE ATTEINT, ET C'EST LA BONNE UNITÉ.
   *
   * `anchor_applied` compte des BOUCHES, pas des journées: le générateur garde
   * pour chaque bouche le facteur de sa journée LA PLUS PROCHE DE 1
   * (`generate-household-meal-v1/index.ts`, `best`) et l'applique à TOUS ses
   * contenants de la semaine. Une seule journée lisible suffit donc à ancrer
   * une bouche pour sept jours — et « 17 journées sur 24 » ne dit rien de
   * combien de personnes le moteur a réellement touchées.
   */
  mouthsReached: number;
  /** Les bouches à qui AUCUNE journée ne rend un chiffre. */
  mouthsSilent: number;
  /**
   * ⛔ LA SORTIE DE LA **VRAIE** `anchorFactorFor`, pas d'une copie. C'est la
   * `mesure APRÈS`: les seaux gelés ne bougeront jamais sans une génération, et
   * le budget modèle de ce lot est nul.
   */
  reasons: Record<string, number>;
}

const emptyCauses = (): Record<DeliveryCause, number> => {
  const out = {} as Record<DeliveryCause, number>;
  for (const c of DELIVERY_CAUSES) out[c] = 0;
  return out;
};

const pct = (n: number, d: number, digits = 1) =>
  d === 0 ? "   n/a" : `${(100 * n / d).toFixed(digits)} %`;

function readNdjson(dir: string, name: string): Record<string, unknown>[] {
  return Deno.readTextFileSync(`${dir}/${name}`)
    .split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
}

async function main() {
  const dir = Deno.args[0];
  if (!dir) {
    console.error("usage: keel_anchor_nodelivery_20260822.ts <dir>");
    Deno.exit(2);
  }
  const plans = readNdjson(dir, "plans.ndjson");
  const refs = readNdjson(dir, "food_composition_refs.ndjson");
  const index = await loadCompositionIndex(fileClient(dir));

  const excluded = new Map<string, number>();
  const reads: PlanRead[] = [];

  for (const row of plans) {
    const lane = laneOf(row.plan_kind);
    const live = isLivePrompt(lane, row.prompt_version);
    if (!live) {
      const key = `${lane} · ${String(row.prompt_version ?? "«aucun prompt_version»")}`;
      excluded.set(key, (excluded.get(key) ?? 0) + 1);
    }
    const frozenRaw = (row.anchor ?? null) as Record<string, unknown> | null;
    const frozen = frozenRaw === null ? null : (() => {
      const out: Record<string, number> = {};
      for (const r of ANCHOR_REASONS) out[r] = Number(frozenRaw[r]) || 0;
      return out;
    })();

    const dishes = readMouthDishes(row.dishes);
    const preparations = readPreparations(row.preparations);
    const energyRows = mouthDayEnergy({ index, dishes, preparations });
    const byKey = new Map<string, MouthDayEnergy>();
    for (const r of energyRows) byKey.set(`${r.memberId} ${r.day ?? ""}`, r);

    // ⛔ LES BOUCHES SONT CELLES QUE LES CONTENANTS NOMMENT, et c'est une
    // approximation ASSUMÉE: la liste `members` du foyer n'est pas persistée
    // dans le plan. Elle ne peut que SOUS-estimer la population invisible —
    // une bouche que le plan n'a nommée nulle part de la semaine n'est pas
    // même comptée ici. La garde de cohérence ci-dessous prouve qu'elle ne la
    // sur-estime jamais.
    const mouths = new Set<string>();
    const days = new Set<string>();
    let boxesOneName = 0;
    let boxesCommonPot = 0;
    for (const d of dishes) {
      days.add(d.day ?? "");
      for (const b of d.boxes) {
        if (b.memberIds.length === 1) boxesOneName++;
        else if (b.memberIds.length > 1) boxesCommonPot++;
        for (const id of b.memberIds) mouths.add(id);
      }
    }

    const away = awayByMouth(row.presence);
    const causes = emptyCauses();
    const gapKeys = new Map<string, number>();
    const reached = new Set<string>();
    const reasons: Record<string, number> = {};
    for (const r of ANCHOR_REASONS) reasons[r] = 0;
    let noRowAway = 0;
    let noRowPresent = 0;
    for (const mouth of mouths) {
      for (const day of days) {
        const hit = byKey.get(`${mouth} ${day}`) ?? null;
        const cause = deliveryCauseOf(hit);
        causes[cause]++;
        if (cause === "delivered") reached.add(mouth);
        if (hit === null) {
          if ((away.get(mouth)?.has(day) ?? false)) noRowAway++;
          else noRowPresent++;
          continue;
        }
        // ⛔ LA PRODUCTION, APPELÉE. Un compteur qui relirait sa propre règle
        // ne pourrait jamais contredire le produit — c'est le mode d'échec que
        // ce chantier a payé neuf fois.
        const real = anchorFactorFor(
          { ...BOUCHE_DE_REFERENCE, memberId: mouth },
          hit,
          "no_position",
        );
        reasons[real.reason] = (reasons[real.reason] ?? 0) + 1;
        if (cause !== "delivered") {
          const k = gapKeyOf(hit);
          gapKeys.set(k, (gapKeys.get(k) ?? 0) + 1);
        }
      }
    }

    reads.push({
      id: String(row.id ?? "").slice(0, 8),
      lane,
      live,
      createdAt: String(row.created_at ?? ""),
      frozen,
      frozenApplied: row.anchor_applied == null ? null : Number(row.anchor_applied),
      causes,
      gapKeys,
      rows: [...byKey.keys()].filter((k) => mouths.has(k.slice(0, k.lastIndexOf(" ")))).length,
      mouths: mouths.size,
      days: days.size,
      noRowAway,
      noRowPresent,
      boxesOneName,
      boxesCommonPot,
      mouthsReached: reached.size,
      mouthsSilent: mouths.size - reached.size,
      reasons,
    });
  }

  // ── LA SORTIE ────────────────────────────────────────────────────────────
  const out: string[] = [];
  const stamp = new Date().toISOString();
  const withAnchor = reads.filter((r) => r.frozen !== null);
  const liveFoyer = reads.filter((r) => r.live && r.lane === "foyer");

  out.push("");
  out.push("═".repeat(75));
  out.push("L-anchor-nodelivery — CE QUE `no_delivery` RECOUVRE");
  out.push(
    `         ${stamp} · ${plans.length} plans · ${refs.length} lignes de référentiel`,
  );
  out.push(
    "         ⛔ GELÉ À LA GÉNÉRATION  vs  RECOMPOSÉ SUR LE RÉFÉRENTIEL D'AUJOURD'HUI",
  );
  out.push("═".repeat(75));

  out.push("");
  out.push("── ① LES DEUX DÉNOMINATEURS — jamais l'un sans l'autre (§⑨ n° 50) ─────────");
  out.push(`     prompt VIVANT · solo  « ${LIVE_MEAL_PROMPT} »`);
  out.push(`     prompt VIVANT · foyer « ${LIVE_MEAL_PROMPT}+${LIVE_HOUSEHOLD_PROMPT} »`);
  out.push("");
  out.push(
    `     CORPUS ENTIER              ${plans.length} plans · foyer ${
      reads.filter((r) => r.lane === "foyer").length
    } · solo ${reads.filter((r) => r.lane === "solo").length}`,
  );
  out.push(
    `     PROMPT VIVANT              ${
      reads.filter((r) => r.live).length
    } plans · foyer ${liveFoyer.length} · solo ${
      reads.filter((r) => r.live && r.lane === "solo").length
    }`,
  );
  out.push(
    `     PORTANT LE BLOC anchor     ${withAnchor.length} plans — ⛔ et ils sont TOUS sous le prompt vivant`,
  );
  out.push(
    `                                (dont hors prompt vivant: ${
      withAnchor.filter((r) => !r.live).length
    })`,
  );
  out.push("");
  out.push("   LA POPULATION EXCLUE, nommée et comptée — millésimes non déployables:");
  const excludedSorted = [...excluded.entries()].sort((a, b) =>
    b[1] - a[1] || a[0].localeCompare(b[0])
  );
  out.push(
    `     ${
      excludedSorted.reduce((s, [, n]) => s + n, 0)
    } plans sur ${plans.length} · ${excludedSorted.length} millésime(s)`,
  );
  for (const [k, n] of excludedSorted) {
    out.push(`        ${String(n).padStart(2)} × ${k}`);
  }

  // ── ② LES DIX SEAUX GELÉS ────────────────────────────────────────────────
  out.push("");
  out.push("── ② LES DIX SEAUX, GELÉS À LA GÉNÉRATION — plan par plan ────────────────");
  out.push("   ⛔ LES DIX, JAMAIS `no_delivery` SEUL. Un seau muet est une information.");
  const head = ANCHOR_REASONS.map((r) => r.slice(0, 6).padStart(7)).join("");
  out.push(`   plan     créé          Σ${head}  appl.`);
  const totals: Record<string, number> = {};
  for (const r of ANCHOR_REASONS) totals[r] = 0;
  let totalRows = 0;
  let totalApplied = 0;
  for (const r of withAnchor) {
    const f = r.frozen!;
    const sum = ANCHOR_REASONS.reduce((s, k) => s + f[k], 0);
    totalRows += sum;
    totalApplied += r.frozenApplied ?? 0;
    for (const k of ANCHOR_REASONS) totals[k] += f[k];
    out.push(
      `   ${r.id} ${r.createdAt.slice(5, 16)} ${String(sum).padStart(3)}` +
        ANCHOR_REASONS.map((k) => String(f[k]).padStart(7)).join("") +
        `  ${String(r.frozenApplied ?? "-").padStart(4)}`,
    );
  }
  out.push(
    `   ── TOTAL             ${String(totalRows).padStart(3)}` +
      ANCHOR_REASONS.map((k) => String(totals[k]).padStart(7)).join("") +
      `  ${String(totalApplied).padStart(4)}`,
  );
  out.push(
    `   ── PART              100%` +
      ANCHOR_REASONS.map((k) => pct(totals[k], totalRows, 0).trim().padStart(7)).join(""),
  );
  const plansZero = withAnchor.filter((r) =>
    ANCHOR_REASONS.reduce((s, k) => s + r.frozen![k], 0) === 0
  );
  out.push("");
  out.push(
    `   ⚠️ PLANS DONT LES DIX SEAUX SONT À ZÉRO: ${plansZero.length} sur ${withAnchor.length} — ${
      plansZero.map((r) => r.id).join(", ")
    }`,
  );
  out.push(
    "      Ce n'est PAS « tout va bien »: c'est l'ancrage qui n'a produit aucune ligne.",
  );

  // ── ③ LA GARDE DE COHÉRENCE ──────────────────────────────────────────────
  out.push("");
  out.push("── ③ LA GARDE DE COHÉRENCE — le NOMBRE de lignes est invariant ───────────");
  out.push("   `dishSlices` ne lit pas le référentiel: une ligne existe parce qu'un");
  out.push("   contenant porte un nom. Le CLASSEMENT bouge, le COMPTE ne doit pas.");
  let mismatches = 0;
  for (const r of withAnchor) {
    const sum = ANCHOR_REASONS.reduce((s, k) => s + r.frozen![k], 0);
    if (sum !== r.rows) {
      mismatches++;
      out.push(`   ⛔ ${r.id} · gelé ${sum} lignes · recomposé ${r.rows} lignes`);
    }
  }
  out.push(
    mismatches === 0
      ? `   ✅ ${withAnchor.length}/${withAnchor.length} plans se recomposent au même compte de lignes.`
      : `   ⛔ ${mismatches} plan(s) NE SE RECOMPOSENT PAS — toute la section ④ est suspecte.`,
  );
  out.push("");
  out.push("   ── L'IDENTITÉ QUI TRANCHE LA QUESTION DE `L17` ────────────────────────");
  out.push("   Le référentiel a bougé entre la génération et maintenant (`L-C`: 114");
  out.push("   lignes cuites réécrites; `L-1-b`: +860 lignes pesées). Si `no_delivery`");
  out.push("   tenait à la PESÉE, le recomposé DEVRAIT être plus bas que le gelé.");
  let identical = 0;
  for (const r of withAnchor) {
    const f = r.frozen!;
    const frozenDelivering = f.anchored + f.clamped + f.day_incomplete;
    const recomposedDelivering = r.causes.delivered;
    const flag = frozenDelivering === recomposedDelivering ? "  " : "⛔";
    if (frozenDelivering === recomposedDelivering) identical++;
    out.push(
      `   ${flag} ${r.id} · livrantes GELÉ ${
        String(frozenDelivering).padStart(3)
      } (anchored+clamped+day_incomplete) · RECOMPOSÉ ${
        String(recomposedDelivering).padStart(3)
      }`,
    );
  }
  out.push(
    `   ⇒ ${identical}/${withAnchor.length} plans rendent le MÊME nombre de journées livrantes` +
      " sur deux référentiels différents.",
  );

  // ── ④ LA DÉCOMPOSITION ───────────────────────────────────────────────────
  out.push("");
  out.push("── ④ `no_delivery` DÉCOMPOSÉ EN CAUSES — et le verdict de chacune ────────");
  out.push("   ⚠️ RECOMPOSÉ SUR LE RÉFÉRENTIEL D'AUJOURD'HUI. Les migrations `L-C` et");
  out.push("      `L-1-b` ont atterri après la plupart de ces plans: l'écart avec ② est");
  out.push("      un FAIT mesuré, pas une dérive de mesure.");
  out.push("");
  const agg = emptyCauses();
  for (const r of liveFoyer) {
    for (const c of DELIVERY_CAUSES) agg[c] += r.causes[c];
  }
  const couples = DELIVERY_CAUSES.reduce((s, c) => s + agg[c], 0);
  const visibles = couples - agg.no_row;
  out.push(`   couples bouche × jour, PROMPT VIVANT · foyer: ${couples}`);
  out.push(
    `   dont VISIBLES du produit (une ligne existe, donc un seau): ${visibles}`,
  );
  out.push(`   dont INVISIBLES (aucune ligne, aucun seau):                ${agg.no_row}`);
  out.push("");
  out.push("   cause                     n   / visibles  / couples   verdict");
  for (const c of DELIVERY_CAUSES) {
    out.push(
      `   ${c.padEnd(23)} ${String(agg[c]).padStart(4)}   ${
        pct(agg[c], visibles).padStart(7)
      }   ${pct(agg[c], couples).padStart(7)}   ${DELIVERY_CAUSE_VERDICT[c]}`,
    );
  }
  const noDelivery = visibles - agg.delivered;
  const justes = agg.common_pot_only;
  const defauts = noDelivery - justes;
  out.push("");
  out.push(
    `   ⇒ no_delivery RECOMPOSÉ = ${noDelivery} / ${visibles} = ${
      pct(noDelivery, visibles)
    } des lignes`,
  );
  out.push(
    `        dont JUSTES (silence voulu par le modèle produit): ${justes} = ${
      pct(justes, noDelivery)
    }`,
  );
  out.push(
    `        dont DÉFAUTS (silence voulu par personne):         ${defauts} = ${
      pct(defauts, noDelivery)
    }`,
  );

  // ── ⑤ LES LACUNES EXACTES ────────────────────────────────────────────────
  out.push("");
  out.push("── ⑤ L'ENSEMBLE EXACT DES LACUNES sur les lignes qui ne livrent pas ──────");
  const gapAgg = new Map<string, number>();
  for (const r of liveFoyer) {
    for (const [k, n] of r.gapKeys) gapAgg.set(k, (gapAgg.get(k) ?? 0) + n);
  }
  for (const [k, n] of [...gapAgg.entries()].sort((a, b) => b[1] - a[1])) {
    out.push(`     ${String(n).padStart(4)} × ${k}`);
  }
  const oneName = liveFoyer.reduce((s, r) => s + r.boxesOneName, 0);
  const commonPot = liveFoyer.reduce((s, r) => s + r.boxesCommonPot, 0);
  out.push("");
  out.push(
    `     contenants: ${oneName + commonPot} · à UN nom ${oneName} (${
      pct(oneName, oneName + commonPot)
    }) · à PLUSIEURS noms ${commonPot} (${pct(commonPot, oneName + commonPot)})`,
  );

  // ── ⑥ LA POPULATION INVISIBLE ────────────────────────────────────────────
  out.push("");
  out.push("── ⑥ LA POPULATION QUE LE PRODUIT NE COMPTE PAS ──────────────────────────");
  out.push("   ⛔ `householdAnchors` itère sur les LIGNES. Un couple sans ligne n'entre");
  out.push("      dans AUCUN seau — la branche `day === null` de `:604` est morte.");
  const away = liveFoyer.reduce((s, r) => s + r.noRowAway, 0);
  const present = liveFoyer.reduce((s, r) => s + r.noRowPresent, 0);
  out.push("");
  out.push(`     couples sans aucune ligne:                        ${agg.no_row}`);
  out.push(
    `        absence DÉCLARÉE ce jour-là (juste — le cas Yanis): ${away} = ${
      pct(away, agg.no_row)
    }`,
  );
  out.push(
    `        aucune absence déclarée (le plan l'a oubliée):      ${present} = ${
      pct(present, agg.no_row)
    }`,
  );

  // ── ⑥bis LES BOUCHES, ET PAS LES JOURNÉES ────────────────────────────────
  out.push("");
  out.push("── ⑥bis LA BONNE UNITÉ: LES BOUCHES ATTEINTES ────────────────────────────");
  out.push("   ⛔ « 17 journées-bouche sur 24 » NE DIT PAS COMBIEN DE PERSONNES sont");
  out.push("      touchées. Le générateur garde, par bouche, le facteur de sa journée");
  out.push("      la plus proche de 1 et l'applique à TOUS ses contenants: UNE journée");
  out.push("      lisible suffit à ancrer une bouche pour la semaine entière.");
  out.push("");
  out.push("   plan     bouches  jours  atteintes  muettes  anchor_applied (gelé)");
  let mouthsTotal = 0;
  let mouthsReached = 0;
  for (const r of liveFoyer) {
    mouthsTotal += r.mouths;
    mouthsReached += r.mouthsReached;
    out.push(
      `   ${r.id} ${String(r.mouths).padStart(7)} ${String(r.days).padStart(6)} ${
        String(r.mouthsReached).padStart(10)
      } ${String(r.mouthsSilent).padStart(8)} ${String(r.frozenApplied ?? "-").padStart(16)}`,
    );
  }
  out.push(
    `   ── TOTAL ${String(mouthsTotal).padStart(7)} ${
      String(liveFoyer.reduce((s2, r) => s2 + r.days, 0)).padStart(6)
    } ${String(mouthsReached).padStart(10)} ${
      String(mouthsTotal - mouthsReached).padStart(8)
    } ${String(totalApplied).padStart(16)}`,
  );
  out.push(
    `   ⇒ l'ancrage atteint ${mouthsReached} bouches sur ${mouthsTotal} = ${
      pct(mouthsReached, mouthsTotal)
    } — et ${mouthsTotal - mouthsReached} restent muettes.`,
  );

  // ── ⑥ter LA MESURE APRÈS — LA VRAIE `anchorFactorFor` ───────────────────
  out.push("");
  out.push("── ⑥ter LA SORTIE DE LA **VRAIE** `anchorFactorFor`, corpus vivant ───────");
  out.push("   ⚠️ Corps de référence unique (voir `BOUCHE_DE_REFERENCE`): le partage");
  out.push("      `anchored`/`clamped` en dépend et n'est donc PAS imprimé. Le partage");
  out.push("      `no_delivery`/`common_pot_day` ne dépend que de `day`, et c'est lui");
  out.push("      que ce lot mesure.");
  const reasonsAgg: Record<string, number> = {};
  for (const r of ANCHOR_REASONS) reasonsAgg[r] = 0;
  for (const r of liveFoyer) {
    for (const k of Object.keys(r.reasons)) {
      reasonsAgg[k] = (reasonsAgg[k] ?? 0) + r.reasons[k];
    }
  }
  const lignes = Object.values(reasonsAgg).reduce((a, b) => a + b, 0);
  out.push("");
  for (const k of ANCHOR_REASONS) {
    const marque = k === "no_delivery" || k === "common_pot_day" ? " ⇐" : "";
    out.push(
      `     ${k.padEnd(22)} ${String(reasonsAgg[k]).padStart(4)}   ${
        pct(reasonsAgg[k], lignes).padStart(7)
      }${marque}`,
    );
  }
  out.push(`     ${"TOTAL".padEnd(22)} ${String(lignes).padStart(4)}`);

  // ── ⑦ LE SEUIL ───────────────────────────────────────────────────────────
  out.push("");
  out.push("── ⑦ LE SEUIL DE LA FICHE ────────────────────────────────────────────────");
  const frozenNoDelivery = totals["no_delivery"];
  out.push(
    `   seuil: no_delivery < ${(100 * SEUIL_NO_DELIVERY).toFixed(0)} % des couples`,
  );
  out.push(
    `   GELÉ      · PROMPT VIVANT · foyer  ${frozenNoDelivery}/${totalRows} = ${
      pct(frozenNoDelivery, totalRows)
    }  ⇒ ${
      frozenNoDelivery / Math.max(1, totalRows) < SEUIL_NO_DELIVERY ? "ATTEINT" : "⛔ MANQUÉ"
    }`,
  );
  out.push(
    `   RECOMPOSÉ · PROMPT VIVANT · foyer  ${noDelivery}/${visibles} = ${
      pct(noDelivery, visibles)
    }  ⇒ ${noDelivery / Math.max(1, visibles) < SEUIL_NO_DELIVERY ? "ATTEINT" : "⛔ MANQUÉ"}`,
  );
  out.push(
    `   RECOMPOSÉ · défauts seuls          ${defauts}/${visibles} = ${
      pct(defauts, visibles)
    }  ⇒ ${defauts / Math.max(1, visibles) < SEUIL_NO_DELIVERY ? "ATTEINT" : "⛔ MANQUÉ"}`,
  );
  const apres = reasonsAgg["no_delivery"];
  out.push(
    `   APRÈS     · anchorFactorFor réel   ${apres}/${lignes} = ${
      pct(apres, lignes)
    }  ⇒ ${apres / Math.max(1, lignes) < SEUIL_NO_DELIVERY ? "ATTEINT" : "⛔ MANQUÉ"}`,
  );
  out.push("");
  out.push("   ⛔ ET IL EST ATTEINT PAR ÉTIQUETAGE, PAS PAR LECTURE. Zéro couple");
  out.push("      bouche-jour de plus n'est devenu lisible. Le chiffre qui compte est");
  out.push(
    `      celui-ci: ${mouthsTotal - mouthsReached} bouches sur ${mouthsTotal} n'ont AUCUN ancrage absolu,`,
  );
  out.push("      et rien dans le modèle produit ne peut le leur donner tant qu'elles");
  out.push("      mangent dans un bac.");
  out.push("");

  console.log(out.join("\n"));
  Deno.exit(mismatches === 0 ? 0 : 1);
}

if (import.meta.main) await main();
