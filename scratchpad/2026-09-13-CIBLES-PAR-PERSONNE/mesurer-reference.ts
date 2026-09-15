/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 2 §2 — JUGER UNE RÉFÉRENCE **AVANT** DE LA FAIRE PASSER AU MOTEUR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Une recette partagée entre N bouches de cibles différentes doit satisfaire
 * TOUT LE MONDE À LA FOIS. La règle, écrite une fois :
 *
 *     kcal_i / Gmax_i  ≤  ρ  ≤  kcal_i / Gmin_i        pour CHAQUE i
 *     et ρ dans le couloir de densité de chaque i
 *
 * Si l'intersection est vide, aucune recette ne peut passer et il faut un
 * PLAT DÉDIÉ. ⛔ On ne déplace alors ni les profils ni les seuils : c'est le
 * plan qui le prévoit, et c'est la seule sortie autorisée.
 *
 * ⛔ AUCUNE ÉQUATION RECODÉE : les contrats viennent de `contratsParCase`
 * (donc de `slot_nutrition_contract.ts`), la densité de `dishEnergy` +
 * `weighedReadyGrams`.
 */
import {
  apportsFixesParJour,
  boucheDuContexte,
  chargerFixtures,
  contratsParCase,
  plancherProteine,
  troisIndex,
} from "../../scripts/2026-09-11-mesure-grille.ts";
import { contexteDeLaDemande } from "../2026-09-11-FIABILITE-RECETTES/analyse-lot-F.ts";

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);

export interface ContratLu {
  prenom: string;
  memberId: string;
  cibleJour: number | null;
  plancherProteineG: number | null;
  plancherParRepasG: number | null;
  cases: {
    date: string;
    jour: string;
    slot: string;
    cible: number | null;
    gMin: number | null;
    gMax: number | null;
    rMin: number | null;
    rMax: number | null;
  }[];
}

/** Les contrats de CHAQUE bouche d'une demande figée, apports fixes compris. */
export async function contratsDeLaDemande(chemin: string): Promise<ContratLu[]> {
  const gele = JSON.parse(await Deno.readTextFile(chemin)) as Record<string, unknown>;
  const ctx = contexteDeLaDemande(gele) as Record<string, unknown>;
  const fen = ((gele.demande as Record<string, unknown>).fenetre ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  // ⚠️ SANS LIGNE ÉCRITE, `contexteDeLaDemande` ne sait pas dater la grille : son
  // `jour_local` vient de `ligne.starts_on`. On lui redonne le `starts_on` de la
  // FENÊTRE ATTENDUE, figée AVANT l'appel — la même date, par la source d'amont.
  if (!(ctx.instant as Record<string, unknown>).jour_local) {
    (ctx.instant as Record<string, unknown>).jour_local = String(
      (fen.acceptee?.starts_on ?? fen.attendue?.starts_on) ?? "",
    );
  }
  const base = await chargerFixtures(`${ROOT}scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures`);
  const idx = await troisIndex(
    { ...base, plans: [], contextes: [], echanges: [], journaux: [] },
    { content_locale: "fr-FR" },
  );
  const bouches = ((gele.demande as Record<string, unknown>).bouches ?? []) as Record<
    string,
    unknown
  >[];
  const out: ContratLu[] = [];
  for (let rang = 0; rang < bouches.length; rang++) {
    const b = boucheDuContexte(ctx as never, rang);
    const ap = apportsFixesParJour({ index: idx.relecture.index, bouche: b });
    const cs = contratsParCase(b, ap.declares === 0 ? null : ap.parJour);
    const pl = plancherProteine(b, String(fen.attendue?.starts_on ?? ""));
    out.push({
      prenom: b.prenom,
      memberId: b.memberId,
      cibleJour: cs[0]?.cibleJourKcal ?? null,
      plancherProteineG: pl?.proteinFloorG ?? null,
      plancherParRepasG: pl?.proteinPerMealG ?? null,
      cases: cs.map((c) => ({
        date: c.date,
        jour: c.jour,
        slot: c.slot,
        cible: c.cibleCaseKcal,
        gMin: c.gMin,
        gMax: c.gMax,
        rMin: c.couloirTransmis?.min ?? null,
        rMax: c.couloirTransmis?.max ?? null,
      })),
    });
  }
  return out;
}

/**
 * L'INTERVALLE DE DENSITÉ QU'UNE CASE PARTAGÉE LAISSE OUVERT.
 *
 * `null` = l'intersection est VIDE : aucune recette commune ne peut servir ces
 * bouches à ce moment, et c'est un plat dédié qu'il faut — pas une tolérance
 * élargie.
 */
export function couloirCommun(
  contrats: readonly ContratLu[],
  jour: string,
  slot: string,
  mangeurs: readonly string[],
): { min: number; max: number; parBouche: Record<string, string> } | null {
  let min = -Infinity, max = Infinity;
  const parBouche: Record<string, string> = {};
  for (const c of contrats) {
    if (!mangeurs.includes(c.memberId)) continue;
    const k = c.cases.find((x) => x.jour === jour && x.slot === slot);
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-13 · LOT 2 §3 — UNE BOUCHE SANS CIBLE NE CONTRAINT RIEN
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ « SANS OBJET » N'EST PAS « INTERSECTION VIDE », et les confondre
    // rendait toute variante à bouche protégée impossible à composer. Une
    // bouche d'âge inconnu, ou en maintien, n'a AUCUNE cible de case
    // (`dayTargetFor` s'abstient) : elle mange au bac commun et aucun gramme ne
    // la vise. Elle ne peut donc ni rétrécir ni vider le couloir des autres.
    //
    // ⚠️ CE N'EST PAS UNE TOLÉRANCE ÉLARGIE. Le couloir des bouches QUI ONT une
    // cible n'est pas touché d'un point ; on retire seulement une contrainte
    // qui n'a jamais existé.
    if (!k) continue;
    if (k.cible === null) {
      parBouche[c.prenom] = "sans objet (aucune cible)";
      continue;
    }
    if (k.gMin === null || k.gMax === null) return null;
    const a = Math.max(k.rMin ?? 0, (k.cible / k.gMax) * 100);
    const b = Math.min(k.rMax ?? Infinity, (k.cible / k.gMin) * 100);
    parBouche[c.prenom] = `${a.toFixed(1)}–${b.toFixed(1)}`;
    min = Math.max(min, a);
    max = Math.min(max, b);
  }
  if (!(min <= max) || !Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max, parBouche };
}

if (import.meta.main) {
  const chemin = Deno.args.find((a) => !a.startsWith("--"));
  if (!chemin) {
    console.error("usage : mesurer-reference.ts <…-contrats.json>");
    Deno.exit(2);
  }
  const contrats = await contratsDeLaDemande(chemin);
  for (const c of contrats) {
    console.log(
      `\n══ ${c.prenom} · cible jour ${c.cibleJour} kcal · plancher protéine ` +
        `${c.plancherProteineG} g/j${c.plancherParRepasG ? ` · ${c.plancherParRepasG} g/repas` : ""}`,
    );
    for (const k of c.cases) {
      console.log(
        `   ${k.date} ${k.slot.padEnd(10)} cible ${String(k.cible?.toFixed(1)).padStart(7)} · ` +
          `masse [${k.gMin}–${k.gMax}] · couloir [${k.rMin}–${k.rMax}] · ` +
          `ρ admissible [${((k.cible! / k.gMax!) * 100).toFixed(1)}–${((k.cible! / k.gMin!) * 100).toFixed(1)}]`,
      );
    }
  }
  const jours = [...new Set(contrats[0].cases.map((c) => c.jour))];
  const slots = [...new Set(contrats[0].cases.map((c) => c.slot))];
  const tous = contrats.map((c) => c.memberId);
  console.log(`\n══ LE COULOIR COMMUN — ce qu'UNE recette partagée peut faire ══`);
  for (const j of jours) {
    for (const s of slots) {
      const k = couloirCommun(contrats, j, s, tous);
      console.log(
        `   ${j}/${s.padEnd(10)} ${
          k === null
            ? "⛔ INTERSECTION VIDE — il faut un PLAT DÉDIÉ, pas une tolérance élargie"
            : `[${k.min.toFixed(1)} – ${k.max.toFixed(1)}]   (${
              Object.entries(k.parBouche).map(([n, v]) => `${n} ${v}`).join(" · ")
            })`
        }`,
      );
    }
  }
}
