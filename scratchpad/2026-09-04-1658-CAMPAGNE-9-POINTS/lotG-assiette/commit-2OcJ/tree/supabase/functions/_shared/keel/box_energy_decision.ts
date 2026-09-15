/**
 * ⟳ LOT F · RELECTURE (2026-09-05) — LA DÉCISION PAR BOÎTE, PURE.
 *
 * ── POURQUOI CE MODULE EXISTE, ET CE QU'IL A COÛTÉ DE NE PAS L'AVOIR ────────
 * La première version vivait dans `meal-energy-v1/index.ts`, mêlée à ses lectures
 * (planchers, interrupteurs, roster). Rien ne l'exécutait: la relecture croisée a
 * joué quatre mutations qui auraient dû rougir et sont restées vertes —
 * `restrictionFlag: false` en dur (une bouche sous plancher AVEC compte recevait
 * son kcal), `gate.emitted++` supprimé, les motifs à zéro non écrits, et
 * `readerSwitchSource` élargi à `explicit_off`. Un chiffre de calories est la
 * donnée la plus sensible du produit; sa porte ne peut pas être la seule partie
 * du produit qu'aucun test n'exécute.
 *
 * Ce module prend TOUT ce qui a été LU (les boîtes calculées, le roster, les
 * planchers et interrupteurs déjà résolus par compte) et rend ce qui SORT. Zéro
 * IO. La lane ne fait plus que lire, puis appeler ceci, puis sérialiser.
 *
 * ── LA RÈGLE, TELLE QUE LA DÉCISION L'A POSÉE ─────────────────────────────
 * Un kcal sort pour un contenant à UN nom dont la bouche passe SA chaîne de
 * sécurité (`energySafetyGates` sur SON plancher, SON âge, la doctrine du
 * foyer) et dont SON interrupteur est ouvert (`energySwitchFrom` sur SA
 * direction). Jamais pour un bac. Jamais si le lecteur n'est pas membre du
 * foyer de ce plan — c'est le fait de lecture de la relecture: un lecteur sorti
 * du foyer avec une ligne non retirée recevait les kcal de ses anciens
 * co-membres.
 *
 * PURE: no I/O, no clock, no randomness.
 */
import type { BoxEnergy } from "./mouth_energy.ts";
import type { CountingStance, EnergySwitchSource } from "./energy_gate.ts";
import {
  BOX_ENERGY_REASONS,
  canEmitBoxEnergy,
  energySafetyGates,
  energySwitchFrom,
} from "./energy_gate.ts";
import { assessBirthDate } from "./student_age.ts";
import { GOAL_TOKENS } from "./tokens.ts";
import { scaleDirectionOf } from "./weight_pace.ts";
import { PLAN_ENERGY_BASIS } from "./plan_energy.ts";

/** L'appartenance du LECTEUR au foyer de ce plan — vocabulaire FERMÉ. */
export const VIEWER_MEMBERSHIPS = ["member", "not_member", "unattached"] as const;
export type ViewerMembership = (typeof VIEWER_MEMBERSHIPS)[number];

export interface BoxGateMouth {
  memberId: string;
  /** `null` = pas de compte. */
  userId: string | null;
  birthDate: string | null;
  goal: string | null;
}

/**
 * LE COMPTEUR DE LA PORTE — écrit même à zéro, sur chaque plan.
 *
 * ⛔ SANS LUI, UN LOT DÉSARMÉ RESSEMBLE À UN LOT QUI MARCHE: `boxes: []` peut
 * vouloir dire « aucune bouche n'a d'objectif », « toutes mineures », « le
 * lecteur n'est plus du foyer » ou « la porte jette tout ». Quatre états qui ne
 * se réparent pas pareil.
 */
export interface BoxGateCounts {
  /** Les contenants à UN nom — la seule population jugée. */
  single: number;
  /** Le plat ne se calcule pas (`dish_incomplete`, `empty_box`): un manque du plan, pas un refus. */
  unreadable: number;
  /** Le nom du couvercle n'est pas dans le roster du foyer. */
  unknown_mouth: number;
  /**
   * Le lecteur n'est PLUS membre du foyer de ce plan (il en est sorti, sa ligne de
   * plan non retirée porte encore ce `household_id`): RIEN ne sort.
   */
  viewer_not_member: number;
  /**
   * Le lecteur n'a AUCUNE ligne de foyer (jamais rattaché — `viewerMemberId`
   * introuvable): RIEN ne sort non plus, et ce n'est pas le même défaut. Fondre
   * les deux rendrait un compteur qui ressemble à un compteur qui marche
   * (précaution de la relecture croisée).
   */
  viewer_unattached: number;
  emitted: number;
  /** Par motif de `canEmitBoxEnergy`, tous présents même à zéro. */
  refused: Record<string, number>;
}

export function boxGateZero(): BoxGateCounts {
  const refused: Record<string, number> = {};
  for (const r of BOX_ENERGY_REASONS) if (r !== "open") refused[r] = 0;
  return { single: 0, unreadable: 0, unknown_mouth: 0, viewer_not_member: 0, viewer_unattached: 0, emitted: 0, refused };
}

export interface EmittedBox {
  box_id: string;
  member_id: string;
  kcal: number;
  basis: string;
}

/**
 * CE QUI SORT POUR UN PLAN, ET CE QUI A ÉTÉ RETENU, COMPTÉ.
 *
 * @param floors    plancher TCA par `userId`, DÉJÀ LU (fail-closed chez l'appelant:
 *                  une lecture en panne vaut `true`). Une bouche sans compte n'y est
 *                  pas: elle n'a déclaré aucune restriction nulle part ⇒ `false`.
 * @param switches  `energy_display_enabled` par `userId`, DÉJÀ LU (`null` = jamais
 *                  choisi). Une bouche sans compte n'y est pas ⇒ `null`, la direction
 *                  décide.
 * @param viewer    `member` = le lecteur appartient au foyer de CE plan;
 *                  `not_member` = il en est sorti; `unattached` = il n'a aucune
 *                  ligne de foyer. Seul `member` laisse sortir une boîte, et les
 *                  deux autres se comptent SÉPARÉMENT.
 */
export function decideBoxEnergy(args: {
  perBox: readonly BoxEnergy[];
  mouths: readonly BoxGateMouth[];
  floors: ReadonlyMap<string, boolean>;
  switches: ReadonlyMap<string, boolean | null>;
  coachCounting: CountingStance;
  today: string;
  viewer: ViewerMembership;
}): { boxes: EmittedBox[]; gate: BoxGateCounts } {
  for (const key of ["perBox", "mouths", "floors", "switches", "coachCounting", "today", "viewer"]) {
    if ((args as unknown as Record<string, unknown>)[key] === undefined) {
      throw new Error(`[keel/box_energy_decision] ${key} est REQUIS — une entrée absente est une garde désarmée`);
    }
  }
  if (!(VIEWER_MEMBERSHIPS as readonly string[]).includes(args.viewer)) {
    throw new Error(`[keel/box_energy_decision] viewer hors vocabulaire: ${JSON.stringify(args.viewer)}`);
  }
  const gate = boxGateZero();
  const boxes: EmittedBox[] = [];
  const byMember = new Map(args.mouths.map((m) => [m.memberId, m] as const));
  for (const box of args.perBox) {
    // ⛔ UN NOM, ET UN SEUL. Le bac de la table n'a pas de kcal par personne.
    if (box.memberIds.length !== 1) continue;
    gate.single++;
    if (args.viewer !== "member") {
      if (args.viewer === "not_member") gate.viewer_not_member++;
      else gate.viewer_unattached++;
      continue;
    }
    if (box.kcal === null) {
      gate.unreadable++;
      continue;
    }
    const memberId = box.memberIds[0];
    const mouth = byMember.get(memberId);
    if (!mouth) {
      gate.unknown_mouth++;
      continue;
    }
    const goal = String(mouth.goal ?? "").trim();
    const direction = (GOAL_TOKENS as readonly string[]).includes(goal)
      ? scaleDirectionOf(goal as (typeof GOAL_TOKENS)[number])
      : null;
    const userId = mouth.userId;
    // ⚠️ UN COMPTE DONT LE PLANCHER N'A PAS ÉTÉ LU VAUT `true`: l'appelant a
    // promis de remplir la carte; s'il l'a oublié, on se ferme plutôt que de
    // servir un chiffre à quelqu'un qu'on n'a pas su évaluer.
    const restrictionFlag = userId === null ? false : (args.floors.get(userId) ?? true);
    const stored = userId === null ? null : (args.switches.has(userId) ? (args.switches.get(userId) ?? null) : false);
    const verdict = canEmitBoxEnergy({
      safety: energySafetyGates({
        restrictionFlag,
        ageVerdict: assessBirthDate(mouth.birthDate, args.today),
        coachCounting: args.coachCounting,
      }),
      mouthSwitch: energySwitchFrom({ stored, direction }),
    });
    if (!verdict.emit) {
      gate.refused[verdict.reason] = (gate.refused[verdict.reason] ?? 0) + 1;
      continue;
    }
    gate.emitted++;
    boxes.push({
      box_id: box.boxId,
      member_id: memberId,
      kcal: Math.round(box.kcal),
      basis: PLAN_ENERGY_BASIS,
    });
  }
  return { boxes, gate };
}
