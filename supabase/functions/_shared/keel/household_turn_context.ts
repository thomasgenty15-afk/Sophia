/**
 * FF-010 — CE QUE LE CHAT SAIT DU FOYER, ET RIEN DE PLUS.
 *
 * ── LE DÉFAUT, ET IL EST VÉRIFIABLE ────────────────────────────────────────
 * « On mange quoi ce soir ? » est la question la plus évidente qu'on puisse
 * poser à cette app, et le chat ne pouvait pas y répondre. Ce n'est pas une
 * lacune du modèle: `sophia-brain` ne contenait AUCUNE requête sur
 * `student_generated_meals` ni sur les tables du foyer. Le seul contexte de
 * plan chargé était `keel_plan_context.ts`, qui lit les ENGAGEMENTS DU COACH —
 * pas les plats composés.
 *
 * Conséquence: soit l'agent bottait en touche, soit il INVENTAIT un plat. Le
 * second est bien pire qu'une confabulation ordinaire, parce que la personne va
 * cuisiner ce qu'on lui a dit.
 *
 * C'est aussi le mode d'échec le plus cher de ce dépôt: un morceau construit,
 * testé, déployé — `generate-household-meal-v1`, `member_portions`, les vagues
 * de courses — dont personne n'avait rebranché le fil.
 *
 * ── LE POINT QUI GOUVERNE TOUT LE MODULE ───────────────────────────────────
 * `memberVisibility` filtre AU CHARGEMENT, pas à la rédaction. Un prompt qui
 * porte la donnée et une consigne de ne pas la dire est un prompt qui la dira.
 * Ce que la visibilité refuse n'entre jamais dans le contexte — il n'y a donc
 * rien à ne pas dire.
 *
 * ── LECTURE SEULE, SANS EXCEPTION ──────────────────────────────────────────
 * Aucune écriture. Chaque écriture du foyer a une RPC gatée et un écran
 * propriétaire; un second chemin d'écriture, c'est deux vérités.
 *
 * ── UNE PANNE NE FABRIQUE PAS UNE ABSENCE ──────────────────────────────────
 * Un chargeur qui avale son erreur ferait dire « rien de prévu » à quelqu'un
 * dont le plan existe. L'échec est journalisé, le contexte rend `null`, et
 * l'agent reste MUET sur le plan plutôt que faux.
 */

import {
  type HouseholdKind,
  HOUSEHOLD_KINDS,
  type HouseholdMemberSnapshot,
  type HouseholdRole,
  memberVisibility,
} from "./household.ts";
import type { BirthDateVerdict } from "./student_age.ts";

/** Structural type: les tests injectent un faux, la prod un SupabaseClient. */
// deno-lint-ignore no-explicit-any
type Db = any;

// ---------------------------------------------------------------------------
// CE QUE LE TOUR PORTE
// ---------------------------------------------------------------------------

export interface HouseholdRosterEntry {
  userId: string;
  firstName: string;
  isMinor: boolean;
  role: HouseholdRole;
  /** `full` ⇒ on peut dire ce qui le concerne. `presence_only` ⇒ il est là. */
  visibility: "full" | "presence_only";
}

export interface HouseholdDish {
  title: string;
  slot: string | null;
  /** Le jour nommé du plat (`mon`..`sun`), ou `null` sur un plan d'un jour. */
  day: string | null;
}

export interface HouseholdPreparation {
  title: string;
  /** Le jour de cuisson, quand une session le fixe. */
  cookOn: string | null;
}

export interface HouseholdPortionLine {
  firstName: string;
  /** `null` = part standard. On ne fabrique pas de phrase par défaut. */
  note: string | null;
  /** `true` quand c'est la part de l'élève qui parle. */
  isMe: boolean;
}

export interface HouseholdRestrictionLine {
  label: string;
  /** Le prénom de l'auteur, ou `null` s'il n'est pas dans le roster lisible. */
  chosenBy: string | null;
}

export interface HouseholdTurnContext {
  householdId: string;
  kind: HouseholdKind;
  /** Le foyer, filtré. Toujours au moins l'élève lui-même. */
  roster: HouseholdRosterEntry[];
  /** `true` quand une fenêtre de plan COUVRE la date locale du tour. */
  hasPlanToday: boolean;
  /** Les plats du jour, bornés. Vide quand aucun plan ne couvre aujourd'hui. */
  todayDishes: HouseholdDish[];
  /** Les préparations à faire, bornées. */
  preparations: HouseholdPreparation[];
  /** Les portions VISIBLES. En `shared`, uniquement la mienne. */
  portions: HouseholdPortionLine[];
  /** Les restrictions qui visent l'élève qui parle, avec leur auteur. */
  myRestrictions: HouseholdRestrictionLine[];
}

/**
 * BORNES DU BLOC. Le budget de prompt tronque PAR LA QUEUE, et un foyer de six
 * avec sept jours de préparations dépasse largement ce qu'il tolère. Le dépôt a
 * déjà payé un bloc mémoire tué par la troncature.
 *
 * Le JOUR COURANT D'ABORD, et rien du reste de la semaine: c'est ce que la
 * question pose (« ce soir »), et le reste se regarde à l'écran.
 */
export const HOUSEHOLD_MAX_DISHES = 4;
export const HOUSEHOLD_MAX_PREPARATIONS = 3;
export const HOUSEHOLD_MAX_PORTIONS = 6;
export const HOUSEHOLD_MAX_RESTRICTIONS = 6;

// ---------------------------------------------------------------------------
// LE CHARGEUR
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> =>
      Boolean(v) && typeof v === "object" && !Array.isArray(v)
    )
    : [];
}

/**
 * Un membre du roster, dans la forme que `memberVisibility` attend.
 *
 * ⚠️ `is_minor` VIENT DE LA RPC, DÉRIVÉ CÔTÉ BASE, et on ne recalcule rien:
 * ce dépôt a UNE définition du mineur (`keel_household_is_minor`, jumelle de
 * `student_age.ts`), et une seconde divergerait au premier ajustement. Le
 * `BirthDateVerdict` est reconstruit à MINIMA — statut seulement — parce que la
 * RPC ne rend délibérément PAS la date de naissance: ouvrir `profiles` aux
 * co-membres livrerait téléphone, e-mail et identifiant Stripe pour afficher un
 * prénom.
 */
function snapshotOf(row: Record<string, unknown>): HouseholdMemberSnapshot {
  const verdict: BirthDateVerdict = row.is_minor === true
    ? { status: "minor", isoDate: "", age: 0 }
    : { status: "adult", isoDate: "", age: 0 };
  return {
    userId: str(row.user_id),
    role: str(row.role) === "owner" ? "owner" : "member",
    birthDateVerdict: verdict,
    restrictionConsentAt: row.restriction_consent_at == null
      ? null
      : str(row.restriction_consent_at),
  };
}

/**
 * Le foyer de cet élève, tel que le tour a le droit de le voir.
 *
 * Rend `null` — et le bloc n'est alors PAS injecté — dans quatre cas qui se
 * comportent pareil et se journalisent différemment: pas de foyer, plan
 * périmé, lecture en panne, roster illisible. Aucun d'eux ne produit « ton
 * foyer n'a rien prévu » à quelqu'un qui vit seul (R8).
 *
 * @param localDate la date LOCALE de l'élève. C'est elle qui décide si une
 *   fenêtre de plan couvre « aujourd'hui »: un plat d'hier servi ce soir est
 *   une erreur silencieuse.
 */
export async function loadHouseholdTurnContext(
  db: Db,
  args: { userId: string; localDate: string },
): Promise<HouseholdTurnContext | null> {
  const userId = str(args.userId);
  const localDate = str(args.localDate);
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return null;

  try {
    // 1. LE FOYER. `keel_household_of` est la résolution unique: la contrainte
    // `household_members_one_household_per_user` la garantit, et ce chargeur
    // est le premier à casser le jour où elle tombe (V1, assumé).
    const membership = await db
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (membership.error) throw membership.error;
    const householdId = str(
      (membership.data as Record<string, unknown> | null)?.household_id,
    );
    if (!householdId) return null;

    const householdRes = await db
      .from("households")
      .select("id, kind")
      .eq("id", householdId)
      .maybeSingle();
    if (householdRes.error) throw householdRes.error;
    const rawKind = str((householdRes.data as Record<string, unknown> | null)?.kind);
    if (!(HOUSEHOLD_KINDS as readonly string[]).includes(rawKind)) return null;
    const kind = rawKind as HouseholdKind;

    // 2. LE ROSTER, par la RPC — jamais par `profiles`. Le fait que la RPC
    // existe EST la garde: une policy RLS ne restreint pas les COLONNES.
    const rosterRes = await db.rpc("keel_household_roster", { p_user: userId });
    if (rosterRes.error) throw rosterRes.error;
    const rosterRows = asArray(rosterRes.data);
    const me = rosterRows.map(snapshotOf).find((m) => m.userId === userId);
    if (!me) return null;

    const roster: HouseholdRosterEntry[] = rosterRows.map((row) => {
      const snapshot = snapshotOf(row);
      return {
        userId: snapshot.userId,
        firstName: str(row.first_name),
        isMinor: row.is_minor === true,
        role: snapshot.role,
        // LE FILTRE, ET IL EST ICI. Pas dans le prompt, pas dans la réponse.
        visibility: memberVisibility(kind, me, snapshot),
      };
    });

    // 3. LE PLAN DU FOYER qui COUVRE aujourd'hui. Une fenêtre finie hier est
    // traitée comme absente: un plat d'hier servi ce soir est une erreur
    // silencieuse, et `retired_at` exclut les plans remplacés.
    const planRes = await db
      .from("student_generated_meals")
      .select("id, dishes, preparations, member_portions, starts_on, ends_on")
      .eq("household_id", householdId)
      .is("retired_at", null)
      .lte("starts_on", localDate)
      .gte("ends_on", localDate)
      .order("starts_on", { ascending: false })
      .limit(1);
    if (planRes.error) throw planRes.error;
    const plan = asArray(planRes.data)[0] ?? null;

    const dayToken = dayTokenFor(localDate);
    const allDishes = plan ? asArray(plan.dishes) : [];
    const todayDishes: HouseholdDish[] = allDishes
      // JOUR COURANT D'ABORD, et SEULEMENT lui: c'est ce que la question pose.
      // Un plat sans jour appartient à un plan d'un seul jour, donc à
      // aujourd'hui par construction.
      .filter((d) => {
        const day = str(d.day);
        return day === "" || day === dayToken;
      })
      .slice(0, HOUSEHOLD_MAX_DISHES)
      .map((d) => ({
        title: str(d.title),
        slot: str(d.slot) || null,
        day: str(d.day) || null,
      }))
      .filter((d) => d.title !== "");

    const preparations: HouseholdPreparation[] = (plan ? asArray(plan.preparations) : [])
      .slice(0, HOUSEHOLD_MAX_PREPARATIONS)
      .map((p) => ({ title: str(p.title), cookOn: str(p.cookOn) || null }))
      .filter((p) => p.title !== "");

    // 4. LES PORTIONS. En `shared`, UNIQUEMENT la mienne — filtrée ici, à la
    // lecture, et pas par une consigne de discrétion dans le prompt.
    const visibleById = new Map(roster.map((r) => [r.userId, r]));
    const portions: HouseholdPortionLine[] = (plan ? asArray(plan.member_portions) : [])
      .map((p) => {
        const memberId = str(p.userId ?? p.user_id);
        const entry = visibleById.get(memberId);
        return {
          memberId,
          visible: memberId === userId || entry?.visibility === "full",
          line: {
            firstName: entry?.firstName || str(p.displayName ?? p.display_name),
            note: str(p.portionNote ?? p.portion_note) || null,
            isMe: memberId === userId,
          },
        };
      })
      .filter((p) => p.visible && p.line.firstName !== "")
      .slice(0, HOUSEHOLD_MAX_PORTIONS)
      .map((p) => p.line);

    // 5. LES RESTRICTIONS QUI ME VISENT, avec leur auteur. Celles qui visent
    // quelqu'un d'autre ne sont pas chargées: en `family` elles ne concernent
    // pas ce tour, en `shared` elles n'ont rien à y faire.
    const restrictionsRes = await db
      .from("household_food_restrictions")
      .select("label, created_by")
      .eq("household_id", householdId)
      .eq("member_user_id", userId)
      .limit(HOUSEHOLD_MAX_RESTRICTIONS);
    if (restrictionsRes.error) throw restrictionsRes.error;
    const myRestrictions: HouseholdRestrictionLine[] = asArray(restrictionsRes.data)
      .map((r) => ({
        label: str(r.label),
        chosenBy: visibleById.get(str(r.created_by))?.firstName || null,
      }))
      .filter((r) => r.label !== "");

    return {
      householdId,
      kind,
      roster,
      hasPlanToday: todayDishes.length > 0,
      todayDishes,
      preparations,
      portions,
      myRestrictions,
    };
  } catch (error) {
    // Le tour continue SANS bloc foyer, et l'agent ne prétend pas connaître le
    // plan. Un chargeur qui avale son erreur ferait dire « rien de prévu » à
    // quelqu'un dont le plan existe.
    console.warn("[keel/household] turn context unreadable", error);
    return null;
  }
}

/** `mon`..`sun` depuis une date locale. Aucune horloge lue. */
function dayTokenFor(localDate: string): string {
  const tokens = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const d = new Date(`${localDate}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : tokens[d.getUTCDay()];
}

// ---------------------------------------------------------------------------
// LE BLOC
// ---------------------------------------------------------------------------

/**
 * Le bloc de contexte du foyer.
 *
 * ── IL SE NOMME DISTINCTEMENT DU PLAN DU COACH ─────────────────────────────
 * `keel_plan_context.ts` dit pourquoi c'est interdit de les fusionner: « two
 * plan blocks in one prompt is how a model gets to pick the more flattering
 * one ». Les ENGAGEMENTS du coach et les PLATS du foyer sont deux couches
 * différentes; elles se nomment, elles ne se mélangent pas. Le titre de ce
 * bloc dit « what this household is eating », jamais « the plan ».
 *
 * ── SANS PLAT COMPOSÉ, ON LE DIT, ET ON PORTE VERS LA COMPOSITION ─────────
 * ⚠️ JAMAIS « ton coach prépare ton plan ». C'est FAUX: le coach écrit une
 * doctrine et un programme pour toute sa cohorte, et il n'existe AUCUN canal
 * 1:1 coach → élève (MODEL.md). Un écran élève vide porte la sortie vers la
 * composition, que l'élève fait lui-même.
 */
export function householdContextBlock(ctx: HouseholdTurnContext): string {
  const lines: string[] = [];
  lines.push("== WHAT THIS HOUSEHOLD IS EATING (read-only) ==");
  lines.push("");
  lines.push(
    "This is NOT the coach's plan. It is what this household composed for " +
      "itself. Never merge the two, and never present one as the other.",
  );
  lines.push("");

  const others = ctx.roster.filter((m) => m.visibility !== "full");
  lines.push(
    `Household of ${ctx.roster.length} (${ctx.kind}): ${
      ctx.roster.map((m) => m.firstName + (m.isMinor ? " (child)" : "")).join(", ")
    }.`,
  );

  if (ctx.hasPlanToday) {
    lines.push("");
    lines.push("TODAY'S DISHES, exactly as composed:");
    for (const dish of ctx.todayDishes) {
      lines.push(`- ${dish.title}${dish.slot ? ` (${dish.slot})` : ""}`);
    }
    if (ctx.preparations.length > 0) {
      lines.push("");
      lines.push("PREPARATIONS TO COOK:");
      for (const prep of ctx.preparations) {
        lines.push(`- ${prep.title}${prep.cookOn ? ` (cook on ${prep.cookOn})` : ""}`);
      }
    }
    if (ctx.portions.length > 0) {
      lines.push("");
      lines.push("SERVING NOTES:");
      for (const portion of ctx.portions) {
        lines.push(
          `- ${portion.firstName}${portion.isMe ? " (this student)" : ""}: ${
            portion.note ?? "standard share"
          }`,
        );
      }
    }
  } else {
    lines.push("");
    lines.push(
      "NOTHING IS COMPOSED FOR TODAY. Say so plainly and point them at the " +
        "meals screen, where they compose it themselves. NEVER say their coach " +
        "is preparing anything for them — no such channel exists, and telling " +
        "them to wait is a lie that costs them a day.",
    );
  }

  if (ctx.myRestrictions.length > 0) {
    lines.push("");
    lines.push("NOT AVAILABLE IN THIS HOUSEHOLD, for this student:");
    for (const r of ctx.myRestrictions) {
      lines.push(`- ${r.label}${r.chosenBy ? ` — chosen by ${r.chosenBy}` : ""}`);
    }
    lines.push(
      "State it as a household choice, ATTRIBUTED and UNJUSTIFIED. Never give " +
        "a health reason for it, never argue for the person who chose it, and " +
        "never dress a domestic decision up as nutrition advice.",
    );
  }

  lines.push("");
  lines.push("HARD RULES:");
  lines.push(
    "- Everything you say about what they are eating comes from the lines " +
      "above. Never invent a dish: they will cook what you tell them.",
  );
  lines.push(
    "- READ-ONLY. You cannot compose, change, add or remove anything here. " +
      "Every one of those has its own screen.",
  );
  lines.push(
    "- A dish being planned is NOT a dish being eaten. Never tick anything, " +
      "and never assume it was.",
  );
  if (ctx.kind === "shared" && others.length > 0) {
    lines.push(
      "- Shared household: you do not know the other members' goals, " +
        "measurements or serving notes, and you are not withholding them — " +
        "they are not in your context at all. Say you do not know.",
    );
  }
  if (ctx.roster.some((m) => m.isMinor)) {
    lines.push(
      "- A child in this household is an EATER, never a target: allergies, " +
        "tastes, portion size. No nutritional goal, no weight, no numbers.",
    );
  }

  return lines.join("\n");
}
