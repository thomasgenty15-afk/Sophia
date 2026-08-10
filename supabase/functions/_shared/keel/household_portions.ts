/**
 * LA BIFURCATION — une cuisson, des portions qui divergent. PUR.
 *
 * Autorité produit: docs/keel/PIVOT-FOYER.md §3 et §7.1.
 *
 * C'est l'intersection vide du marché: les apps de batch cooking optimisent la
 * session mais n'ont AUCUN modèle nutritionnel par personne; les apps
 * nutritionnelles ont le modèle par personne mais aucun modèle de cuisson. Le
 * père en sèche et le fils en prise de masse dans la même casserole n'existe
 * nulle part. Ce module est la moitié qui manque aux deux.
 *
 * ── LA RÈGLE QUI GOUVERNE TOUT LE FICHIER ────────────────────────────────
 * Une consigne de portion est une INSTRUCTION DE SERVICE, jamais un
 * diagnostic. « Marc : 1,5 part, féculent en plus » — pas « parce que tu es en
 * prise de masse », pas « 2 400 kcal ».
 *
 * Deux raisons distinctes, et il faut les deux:
 *
 *   1. CONFIDENTIALITÉ. `member_portions` est lisible par TOUT le foyer (c'est
 *      le but: on sert à table). Faire figurer la raison y divulguerait
 *      l'objectif d'un membre à ses colocataires. `household.ts` autorise
 *      l'instruction en public précisément parce que le pourquoi n'y est pas —
 *      les deux modules tiennent la même promesse par les deux bouts.
 *
 *   2. LES MINEURS. Expliquer à un enfant que sa part est plus petite « pour
 *      son poids » est à une phrase d'un dégât réel (§8.4). Le registre est
 *      éducatif, jamais correctif sur le corps.
 *
 * D'où `sanitizePortionNote`, qui n'est pas une politesse: c'est une ceinture
 * déterministe sur du texte de modèle, du même genre que le verrou de
 * doctrine, et elle utilise LE MÊME moteur (`forbidden_matcher.ts`) plutôt
 * qu'une seconde implémentation qui divergerait.
 *
 * ── UN MINEUR N'A PAS D'OBJECTIF ─────────────────────────────────────────
 * `PortionMember.goal` est `null` pour un mineur, et ce n'est pas une
 * convention: l'appelant ne LIT PAS `student_goals` pour un mineur. La
 * ceinture est en amont (`student_age.ts`, `weekPlanAgeGate`), ici on ne fait
 * que ne pas pouvoir la contourner — il n'existe aucune direction de service
 * dérivée d'un objectif pour un mineur, parce qu'il n'y a pas d'objectif.
 */

import { findForbiddenMatches, type ForbiddenTerm } from "./forbidden_matcher.ts";

/** Reflet du CHECK `student_goals_goal_check`. */
export const MEMBER_GOALS = [
  "fat_loss",
  "muscle_gain",
  "recomposition",
  "performance",
  "health",
  "maintenance",
] as const;
export type MemberGoal = (typeof MEMBER_GOALS)[number];

export interface PortionMember {
  userId: string;
  displayName: string;
  /**
   * `null` = aucune direction dérivée d'un objectif. Vrai pour tout mineur, et
   * pour tout majeur qui n'a pas déclaré d'objectif.
   */
  goal: MemberGoal | null;
  /** Sert le libellé d'âge, jamais un calcul. */
  isMinor: boolean;
}

export interface PreparationShare {
  preparationId: string;
  note: string;
}

export interface MemberPortion {
  userId: string;
  displayName: string;
  /**
   * `null` = part standard. DÉLIBÉRÉMENT PAS une phrase par défaut: une phrase
   * écrite ici serait dans UNE langue, et ce dépôt a déjà payé « confirmation
   * STOP codée en dur en français ». L'écran rend son propre libellé.
   */
  portionNote: string | null;
  preparationShares: PreparationShare[];
}

/**
 * LA DIRECTION DE SERVICE, par objectif. En anglais parce que c'est la langue
 * du prompt (`MEAL_PROMPT_VERSION`, dont le préfixe est `meal.en.`), et ces
 * phrases ne sont JAMAIS montrées à l'utilisateur — elles instruisent le
 * modèle, qui rend ensuite la consigne dans la langue de l'élève.
 *
 * La version EXACTE n'est plus recopiée ici: elle a bougé au premier chantier
 * qui a touché la consigne (FF-030), et une valeur figée dans un commentaire
 * survit toujours à sa cause. Ce qui compte est le `en`, et il est dans le
 * préfixe.
 *
 * Aucune ne nomme une raison. « bigger share of the protein » se lit à table;
 * « because you are cutting » se lirait aussi, et par tout le monde.
 */
const SERVING_DIRECTION: Record<MemberGoal, string> = {
  fat_loss:
    "generous vegetables, full protein share, smaller starch share",
  muscle_gain:
    "larger protein and starch share, same vegetables",
  recomposition:
    "full protein share, moderate starch, generous vegetables",
  performance:
    "larger starch share around training, full protein share",
  health:
    "balanced share of every component",
  maintenance:
    "balanced share of every component",
};

/** Ce qu'on dit d'un mineur au modèle. Une taille, jamais une direction. */
const CHILD_DIRECTION = "child-size share of the same dish";

/**
 * LE BLOC QUI PART DANS LE PROMPT.
 *
 * Une ligne par membre, ordre stable (celui reçu), et une consigne finale qui
 * n'est pas décorative: sans elle, un modèle confronté à quatre directions
 * contradictoires propose parfois deux plats. Or le produit vend UNE cuisson.
 */
export function buildPortionBrief(members: readonly PortionMember[]): string {
  if (members.length === 0) return "";
  const lines = members.map((m) => {
    const direction = m.isMinor || !m.goal
      ? (m.isMinor ? CHILD_DIRECTION : SERVING_DIRECTION.maintenance)
      : SERVING_DIRECTION[m.goal];
    return `- ${m.displayName}: ${direction}`;
  });
  return [
    "HOUSEHOLD SERVING PLAN — one cooking session, portions that differ.",
    "Cook ONE set of preparations for everyone. Do NOT propose separate dishes.",
    "For each person below, give a short serving instruction: how much of which",
    "component goes on their plate, and which side is added or dropped.",
    "",
    ...lines,
    "",
    "NEVER state a reason, a goal, a calorie count or anything about a person's",
    "body in these instructions. They are read aloud at the table by the whole",
    "household. Write what to serve, never why.",
  ].join("\n");
}

/**
 * LA LISTE FERMÉE — ce qu'une consigne de service ne peut pas contenir.
 *
 * Les deux langues, parce que ce dépôt a déjà payé « garde testée dans une
 * seule langue »: une ceinture qui ne connaît que `weight` laisse passer
 * `poids`, et le produit sort en français par défaut (`profiles.locale`).
 */
export const FORBIDDEN_PORTION_TERMS: readonly ForbiddenTerm[] = [
  {
    ruleId: "portion.body",
    token: "weight",
    surfaceForms: ["poids", "weight loss", "weight gain", "perte de poids", "prise de poids"],
  },
  {
    ruleId: "portion.body",
    token: "maigrir",
    surfaceForms: ["mincir", "grossir", "slim down", "lose weight", "gain weight"],
  },
  {
    ruleId: "portion.body",
    token: "silhouette",
    surfaceForms: ["body fat", "belly", "ventre", "masse grasse"],
  },
  {
    ruleId: "portion.goal",
    token: "calories",
    surfaceForms: ["calorie", "kcal", "calorie deficit", "deficit calorique"],
  },
  {
    ruleId: "portion.goal",
    token: "cutting",
    surfaceForms: ["bulking", "seche", "prise de masse", "surplus"],
  },
  {
    ruleId: "portion.goal",
    token: "diet",
    surfaceForms: ["regime", "objectif", "goal"],
  },
];

export interface SanitizedNote {
  note: string | null;
  /** Les motifs qui ont mordu. Vide = la consigne est passée telle quelle. */
  violations: string[];
}

/**
 * LA CEINTURE, sur le texte rendu par le modèle.
 *
 * ── POURQUOI `allowNegatedMentions: false` ───────────────────────────────
 * Le moteur blanchit par défaut les mentions niées, et c'est le bon réglage
 * pour le verrou de doctrine: « pain sans gluten » ne contredit pas un interdit
 * sur le gluten.
 *
 * Ici c'est l'inverse. « une part sans perte de poids » reste une consigne qui
 * parle de perte de poids devant toute la table — la négation ne rachète rien,
 * parce que ce qu'on interdit n'est pas d'ENCOURAGER le sujet, c'est de
 * l'ÉVOQUER. C'est la lecture absolue, celle que le moteur appelle « audit
 * mode », et elle est le bon choix pour ce cas-ci seulement.
 *
 * ── PAS DE RÉÉCRITURE, UNE MISE À NULL ───────────────────────────────────
 * On ne tente pas de retirer le mot fautif pour sauver la phrase. Une consigne
 * amputée est illisible, et bricoler du texte de modèle produit des phrases
 * dont personne ne répond. `null` = part standard, ce qui est vrai, lisible,
 * et rendu par l'écran dans sa langue.
 */
export function sanitizePortionNote(raw: unknown): SanitizedNote {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { note: null, violations: [] };

  const matches = findForbiddenMatches(text, FORBIDDEN_PORTION_TERMS, {
    allowNegatedMentions: false,
  });
  if (matches.length === 0) return { note: text, violations: [] };

  const violations = [...new Set(matches.map((m) => m.token))].sort();
  return { note: null, violations };
}

export interface ReconciledPortions {
  portions: MemberPortion[];
  /** Ce qui a été corrigé. Tracé, jamais silencieux. */
  issues: string[];
}

/**
 * CE QUE LE MODÈLE A RENDU, RÉCONCILIÉ AVEC LE FOYER RÉEL.
 *
 * Trois écarts possibles, trois traitements différents — et c'est le partage
 * qui compte:
 *
 *   MEMBRE MANQUANT   → complété d'une part standard, tracé. On ne jette PAS
 *                       le repas: une consigne absente pour une personne sur
 *                       quatre est un défaut mineur, et perdre la cuisson du
 *                       samedi soir pour ça serait la vraie perte.
 *   MEMBRE FANTÔME    → jeté. Une consigne pour quelqu'un qui n'habite pas là
 *                       est du texte inventé, et le rendre à l'écran ferait
 *                       apparaître un inconnu à table.
 *   CONSIGNE FAUTIVE  → mise à null, tracée. Voir `sanitizePortionNote`.
 *
 * L'ordre de sortie suit celui des MEMBRES, pas celui du modèle: l'écran doit
 * lister le foyer dans un ordre stable d'un repas à l'autre.
 */
export function reconcilePortions(
  members: readonly PortionMember[],
  raw: unknown,
): ReconciledPortions {
  const issues: string[] = [];
  const byUser = new Map<string, Record<string, unknown>>();

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      const userId = String(row.user_id ?? row.userId ?? "").trim();
      if (!userId) continue;
      if (!members.some((m) => m.userId === userId)) {
        issues.push(`portion_for_unknown_member:${userId}`);
        continue;
      }
      byUser.set(userId, row);
    }
  }

  const portions = members.map((member) => {
    const row = byUser.get(member.userId);
    if (!row) {
      issues.push(`portion_missing:${member.userId}`);
      return {
        userId: member.userId,
        displayName: member.displayName,
        portionNote: null,
        preparationShares: [],
      };
    }

    const { note, violations } = sanitizePortionNote(
      row.portion_note ?? row.portionNote,
    );
    for (const v of violations) {
      issues.push(`portion_note_rejected:${member.userId}:${v}`);
    }

    return {
      userId: member.userId,
      displayName: member.displayName,
      portionNote: note,
      preparationShares: parseShares(row, member, issues),
    };
  });

  return { portions, issues };
}

function parseShares(
  row: Record<string, unknown>,
  member: PortionMember,
  issues: string[],
): PreparationShare[] {
  const raw = row.preparation_shares ?? row.preparationShares;
  if (!Array.isArray(raw)) return [];
  const out: PreparationShare[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const preparationId = String(e.preparation_id ?? e.preparationId ?? "").trim();
    if (!preparationId) continue;
    const { note, violations } = sanitizePortionNote(e.note);
    for (const v of violations) {
      issues.push(`share_note_rejected:${member.userId}:${preparationId}:${v}`);
    }
    // Une part sans consigne lisible n'apporte rien à l'écran: on la laisse
    // tomber plutôt que d'afficher une ligne vide sous un plat.
    if (note) out.push({ preparationId, note });
  }
  return out;
}

/** Le format stocké dans `student_generated_meals.member_portions`. */
export function memberPortionsPayload(
  portions: readonly MemberPortion[],
): Array<Record<string, unknown>> {
  return portions.map((p) => ({
    user_id: p.userId,
    display_name: p.displayName,
    portion_note: p.portionNote,
    preparation_shares: p.preparationShares.map((s) => ({
      preparation_id: s.preparationId,
      note: s.note,
    })),
  }));
}
