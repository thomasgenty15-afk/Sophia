/**
 * LA PRISE DE MAIN — qui mange SON plan, et ne mange donc pas celui du foyer.
 * PUR.
 *
 * Autorité produit: docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md,
 * arbitrages D2 et D7, révisés le 2026-08-12. Lot L3.
 *
 * ── LE MODÈLE, PARCE QUE TOUT CE FICHIER EN DÉCOULE ──────────────────────
 * LE PLAN DU MAÎTRE **EST** LE PLAN DU FOYER: lui, plus toutes les bouches sans
 * compte, plus tout compte secondaire qui n'a pas pris la main.
 *
 * Un compte secondaire a DEUX postures, et la première est la normale:
 *
 *   ① IL NE FAIT RIEN, et il est composé dans le plan du maître comme une
 *     bouche ordinaire. Ce n'est pas un cas dégradé — c'est le cas nominal.
 *     D7, mot pour mot: « la composition n'attend jamais personne ».
 *   ② IL PREND LA MAIN: il génère son propre plan (`generate-meal-v1`), le
 *     valide, et le générateur du foyer doit alors l'EXCLURE de sa composition.
 *     Il mange son plan à lui.
 *
 * ── CE QUE CE MODULE DÉCIDE, ET CE QU'IL NE DÉCIDE PAS ───────────────────
 * Il décide UNE chose: est-ce que ce plan personnel RECOUVRE la fenêtre que le
 * foyer s'apprête à composer. Le reste du prédicat — plan personnel, vivant,
 * validé, rattaché à CE foyer — est appliqué par `keel_household_roster_for`,
 * et n'est écrit nulle part ailleurs.
 *
 * La coupure est la MÊME que celle de D14 (`household_presence.ts`): la base
 * rend le FAIT par bouche, un module pur applique la FENÊTRE. Elle n'est pas
 * esthétique. La base ne connaît pas la fenêtre — elle est résolue côté serveur,
 * dans le fuseau du maître, à partir de ce que le client demande. La lui passer
 * en argument optionnel ferait « un paramètre de garde optionnel est une garde
 * désarmée », cicatrice déjà payée par ce dépôt: le chat lit le même roster
 * sans fenêtre, et l'aurait laissé nul pour toujours.
 *
 * Ce module ne REFUSE rien non plus. Il rend `composed: []` quand plus personne
 * ne reste, et c'est l'appelant qui nomme son refus — lui seul sait ce qu'il
 * compose et ce qu'il doit répondre.
 *
 * ── LE RECOUVREMENT EST **TOTAL**, ET C'EST L'ARBITRAGE DU LOT ───────────
 * Un plan personnel ne retire son porteur de la table que s'il couvre la
 * fenêtre du foyer **en entier**. Un plan mercredi→dimanche face à un foyer
 * lundi→dimanche ne prend PAS la main: son porteur reste composé, et il aura
 * une assiette lundi et mardi.
 *
 *   POURQUOI PAS LE RECOUVREMENT PARTIEL. Parce que l'exclusion partielle
 *   affame. Retirer quelqu'un de la composition du lundi au motif qu'il a un
 *   plan à partir de mercredi, c'est cuisiner sans lui les deux jours où il n'a
 *   rien d'autre. Le coût de l'erreur inverse — il a une assiette dans le plan
 *   du foyer les jours où il mange déjà le sien — est un RESTE. C'est
 *   exactement l'arbitrage que L2 a déjà pris sur `servings`: « une moyenne
 *   fait manquer de quoi manger le jour où tout le monde est là; le maximum
 *   fait au pire un reste ».
 *
 *   POURQUOI ÇA NE PRÉEMPTE PAS L4. D15 dit que la FUSION opère sur
 *   l'INTERSECTION des fenêtres — c'est une règle du moteur de fusion, pas de
 *   la composition. Avec le recouvrement total, un plan partiel reste un
 *   candidat de fusion parfaitement ordinaire: son porteur est déjà une bouche
 *   du plan du foyer, et la fusion re-proportionne ses jours. Avec le
 *   recouvrement partiel, L4 devrait au contraire RAJOUTER une bouche pour les
 *   jours que le plan personnel ne couvre pas — une décision que D15 ne prend
 *   pas, et qu'on n'a pas à prendre à sa place.
 *
 *   LE RETOUR ARRIÈRE COÛTE UNE LIGNE: `planCoversWindow` devient
 *   `plansOverlap`, et son test change de nom. C'est l'option la plus
 *   réversible parce que c'est la plus ÉTROITE: élargir n'enlève que des
 *   assiettes, alors que rétrécir après coup ne rend pas les dîners d'un
 *   secondaire qu'on avait cessé de compter.
 *
 * ── LE MAÎTRE N'EST JAMAIS EXCLU ────────────────────────────────────────
 * D2: « le plan du maître EST le plan du foyer ». S'il porte par ailleurs un
 * plan personnel validé — un reliquat de la lane individuelle, par exemple — ce
 * plan ne le retire pas de sa propre table: il cuisinerait alors un repas qu'il
 * ne mange pas. C'est la seule asymétrie de ce fichier, et elle est le modèle.
 */

import { planEndsOn } from "./meal_plan_window.ts";

/**
 * Un plan personnel candidat, tel que le roster le rend.
 *
 * ⚠️ « CANDIDAT », PAS « PRISE DE MAIN ». `keel_household_roster_for` a déjà
 * filtré ce que la base peut voir seule (personnel · vivant · validé ·
 * rattaché à ce foyer). Ce qui reste à décider est le recouvrement, et il est
 * décidé ici.
 */
export interface MemberOwnPlan {
  id: string;
  /** Le premier jour, `YYYY-MM-DD`. */
  startsOn: string;
  /** 1 à 7, comme la colonne. */
  durationDays: number;
  /**
   * Rendue pour la TRACE, et re-vérifiée ici par ceinture (voir
   * `parseOwnPlans`). D7 en dépend: un plan non validé ne retire personne.
   */
  validatedAt: string | null;
}

/** La fenêtre que le foyer s'apprête à composer. */
export interface PlanWindow {
  startsOn: string;
  durationDays: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * La colonne `own_plans` du roster, lue avec la MÊME tolérance que
 * `parseAwayDays`: une entrée illisible tombe, les autres restent, et rien
 * n'est deviné.
 *
 * ⚠️ `validatedAt` EST EXIGÉE ICI AUSSI, alors que la requête du roster la
 * filtre déjà. C'est une CEINTURE, pas le mécanisme — et elle est gratuite
 * parce que la donnée est dans la charge utile. La règle qu'elle tient est D7:
 * « qui n'a pas de plan VALIDÉ au moment où le maître compose est
 * automatiquement pris dans le plan du foyer ». Le jour où quelqu'un élargit la
 * requête SQL, cette ligne-ci refuse encore d'affamer un secondaire pour un
 * brouillon.
 */
export function parseOwnPlans(raw: unknown): MemberOwnPlan[] {
  if (!Array.isArray(raw)) return [];
  const out: MemberOwnPlan[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const id = String(e.id ?? "").trim();
    const startsOn = String(e.starts_on ?? "").trim();
    const durationDays = Number(e.duration_days);
    const validatedAt = e.validated_at == null
      ? null
      : String(e.validated_at).trim() || null;
    if (!id || !DATE.test(startsOn)) continue;
    if (!Number.isFinite(durationDays) || durationDays < 1) continue;
    if (validatedAt === null) continue;
    out.push({
      id,
      startsOn,
      durationDays: Math.round(durationDays),
      validatedAt,
    });
  }
  return out;
}

/**
 * Ce plan recouvre-t-il la fenêtre du foyer EN ENTIER.
 *
 * LA SEULE LIGNE QUI DÉCIDE, et elle est volontairement seule: c'est celle
 * qu'on inverse si l'arbitrage change. Les bornes sont INCLUSIVES des deux
 * côtés, et `planEndsOn` est la primitive de tout le dépôt — la réécrire ici
 * ferait une seconde arithmétique de fenêtre, qui divergerait un 31 décembre.
 */
export function planCoversWindow(
  plan: { startsOn: string; durationDays: number },
  window: PlanWindow,
): boolean {
  if (plan.startsOn > window.startsOn) return false;
  return planEndsOn(plan.startsOn, plan.durationDays) >=
    planEndsOn(window.startsOn, window.durationDays);
}

/** Les deux fenêtres se touchent-elles, ne serait-ce que d'un jour. */
export function plansOverlap(
  plan: { startsOn: string; durationDays: number },
  window: PlanWindow,
): boolean {
  return plan.startsOn <= planEndsOn(window.startsOn, window.durationDays) &&
    planEndsOn(plan.startsOn, plan.durationDays) >= window.startsOn;
}

/** Ce que l'appelant doit porter pour être jugé. */
export interface HandMember {
  memberId: string;
  /** D2: le maître n'est jamais exclu de son propre plan. */
  isOwner: boolean;
  ownPlans: readonly MemberOwnPlan[];
}

/**
 * LES MOTIFS, NOMMÉS. Une trace qui dit « exclu » sans dire selon quelle règle
 * ne se relit pas: le jour où l'arbitrage de recouvrement change, on doit
 * pouvoir séparer les plans écrits avant de ceux écrits après.
 */
export const HAND_REASON_COVERS = "personal_plan_covers_window";
export const HAND_REASON_PARTIAL = "personal_plan_partial_window";

/** Ce qu'on archive dans `generated_from`, par bouche concernée. */
export interface HandTraceEntry {
  member_id: string;
  plan_id: string;
  starts_on: string;
  duration_days: number;
  validated_at: string | null;
  reason: string;
}

export interface HandOff<T> {
  /**
   * Les bouches que le foyer compose. TOUJOURS dans l'ordre du roster: le
   * prompt nomme les gens dans cet ordre, et un tri qui s'invente ici ferait
   * bouger la consigne sans qu'aucune donnée n'ait changé.
   */
  composed: T[];
  /** Qui a pris la main, avec le plan qui l'a retiré de la table. */
  taken: HandTraceEntry[];
  /**
   * Qui porte un plan qui MORD sur la fenêtre sans la recouvrir — donc qui
   * reste composé.
   *
   * ⚠️ CE N'EST PAS DU DÉCOR. C'est la preuve, relisible sur la ligne du plan,
   * que l'arbitrage « recouvrement TOTAL » a été appliqué et non oublié: sans
   * cette liste, un plan partiel et un plan inexistant produisent exactement la
   * même trace, et personne ne peut dire lequel des deux cas s'est produit.
   * C'est aussi ce que L4 lira pour savoir qu'il y a une intersection à
   * fusionner (D15).
   */
  partial: HandTraceEntry[];
}

function traceOf(
  memberId: string,
  plan: MemberOwnPlan,
  reason: string,
): HandTraceEntry {
  return {
    member_id: memberId,
    plan_id: plan.id,
    starts_on: plan.startsOn,
    duration_days: plan.durationDays,
    validated_at: plan.validatedAt,
    reason,
  };
}

/**
 * Qui le foyer compose, et qui mange son propre plan.
 *
 * ── L'ÉCHEC EST OUVERT, COMME PARTOUT SUR CE CHEMIN ─────────────────────
 * Une fenêtre illisible ne retire PERSONNE. L'autre direction serait
 * catastrophique: une date mal formée ferait sortir tout le monde de la table,
 * et le foyer cesserait de cuisiner sans qu'aucune erreur ne remonte.
 */
export function resolveHandOff<T extends HandMember>(args: {
  members: readonly T[];
  window: PlanWindow;
}): HandOff<T> {
  const composed: T[] = [];
  const taken: HandTraceEntry[] = [];
  const partial: HandTraceEntry[] = [];

  const windowUsable = DATE.test(args.window.startsOn) &&
    Number.isFinite(args.window.durationDays) && args.window.durationDays >= 1;

  for (const member of args.members) {
    // D2 — LE MAÎTRE, JAMAIS. Avant toute lecture de plan: son plan personnel
    // ne le concerne pas ici, et le juger ferait apparaître son id dans une
    // trace d'exclusion qui n'aura jamais lieu.
    if (member.isOwner || !windowUsable) {
      composed.push(member);
      continue;
    }

    const covering = member.ownPlans.find((p) => planCoversWindow(p, args.window));
    if (covering) {
      taken.push(traceOf(member.memberId, covering, HAND_REASON_COVERS));
      continue;
    }

    for (const plan of member.ownPlans) {
      if (plansOverlap(plan, args.window)) {
        partial.push(traceOf(member.memberId, plan, HAND_REASON_PARTIAL));
      }
    }
    composed.push(member);
  }

  return { composed, taken, partial };
}
