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
 * ── NI UN MINEUR, NI UNE BOUCHE SANS ÂGE N'ONT D'OBJECTIF ────────────────
 * Deux cas, une seule conséquence: aucune direction dérivée d'un objectif.
 *
 *   MINEUR    — la ceinture est en amont (`student_age.ts`, `weekPlanAgeGate`);
 *               ici on ne fait que ne pas pouvoir la contourner.
 *   ÂGE INCONNU — le cas NEUF, et celui qui compte. Depuis que le compte maître
 *               saisit des bouches à la main, une ligne peut n'avoir aucune
 *               date. L'ancienne garde traitait « pas de date » comme
 *               « majeur » et aurait servi une direction d'adulte à un enfant
 *               dont personne n'avait renseigné l'âge. `goalApplies` refuse les
 *               deux, et c'est `household.ts` qui porte la règle — un seul
 *               endroit, parce que l'écran la lit aussi.
 */

import { goalApplies, type MemberAgeState } from "./household.ts";
import { findForbiddenMatches, type ForbiddenTerm } from "./forbidden_matcher.ts";
import { householdBodyFacts, type MealBodyContext } from "./meal_body.ts";

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
  /**
   * L'identité de la bouche, PAS son compte. Une bouche sans compte en a un;
   * c'est tout l'objet du re-clavetage du 2026-08-10.
   */
  memberId: string;
  displayName: string;
  /**
   * `null` = aucune direction dérivée d'un objectif. Vrai pour tout mineur,
   * pour toute bouche dont l'âge est inconnu, et pour tout majeur qui n'a rien
   * déclaré.
   */
  goal: MemberGoal | null;
  /** Trois états. Sert le libellé d'âge et la garde, jamais un calcul. */
  ageState: MemberAgeState;
  /**
   * CE QU'ON SAIT DE SON CORPS — lot 3B.
   *
   * `null` pour une bouche sans compte (les mesures et le profil restent clés
   * sur `auth.users`), pour un compte dont la lecture a échoué, et pour un
   * compte qui n'a rien saisi. Les trois se ressemblent volontairement: voir
   * `buildPortionBrief`.
   *
   * ⚠️ REQUIS, jamais optionnel. « Paramètre de garde optionnel = garde
   * désarmée » est une leçon déjà payée par ce dépôt: un champ facultatif
   * n'aurait fait remonter aucun appelant au compilateur, et le lot serait
   * construit sans être branché — le mode d'échec n°1 d'ici.
   */
  body: MealBodyContext | null;
}

export interface PreparationShare {
  preparationId: string;
  note: string;
}

export interface MemberPortion {
  memberId: string;
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
 * LE GARDE-FOU QUI VOYAGE AVEC LES FAITS CORPORELS — lot 3B.
 *
 * Il n'est ajouté au brief QUE si au moins une bouche porte des faits. Sans
 * cette condition, un foyer où personne n'a rempli quoi que ce soit lirait une
 * mise en garde sur des chiffres absents — et une consigne qui parle du corps
 * dans un prompt où il n'y en a pas est exactement l'invitation qu'on veut
 * éviter.
 *
 * DEUX PHRASES, DEUX PORTES DIFFÉRENTES:
 *
 *   1. « for ONE thing: the SIZE » — reprise de `mealBodyBlocks`, et pour la
 *      même raison qu'elle y existe: taille + poids + âge + sexe est la
 *      signature d'entrée d'une formule de métabolisme de base, et un modèle
 *      sait la calculer sans qu'on le lui demande. `CONTRACT.md` refuse les
 *      calories; livrer un compteur par la porte de derrière serait la même
 *      chose en pire, puisque personne ne l'aurait décidé.
 *
 *   2. L'HOMOGÉNÉITÉ À TABLE — celle-ci est PROPRE au foyer et n'a aucun
 *      équivalent sur le chemin individuel. Le foyer mixte est le cas nominal
 *      (deux membres avec corps, trois sans), et un modèle à qui on donne plus
 *      de matière sur une personne écrit spontanément une consigne plus longue
 *      et plus personnelle pour elle. Cette asymétrie se lit à table: elle
 *      annonce à tout le monde qui a rempli son profil, et laisse entendre que
 *      la précision est une faveur. Personne ne l'a demandée.
 */
const BODY_FACTS_CAVEAT = [
  "The bracketed facts are there for ONE thing: the SIZE of a portion. A palm",
  "of protein is not the same palm on a small person and a tall one. Never",
  "derive anything else from them: no daily energy need, no calorie figure,",
  "no BMI, no category, no target.",
  "We know more about some people than others, and that is only an accident of",
  "who filled in what. It is NEVER a reason to write a longer, more precise or",
  "more personal instruction for them: every line must read the same way when",
  "it is said out loud at the table.",
] as const;

/**
 * LE BLOC QUI PART DANS LE PROMPT.
 *
 * Une ligne par membre, ordre stable (celui reçu), et une consigne finale qui
 * n'est pas décorative: sans elle, un modèle confronté à quatre directions
 * contradictoires propose parfois deux plats. Or le produit vend UNE cuisson.
 *
 * ── LOT 3B: L'ENTRÉE GAGNE DES FAITS, LA SORTIE N'EN GAGNE AUCUN ──────────
 * La ligne d'un membre porte désormais ce qu'on sait de son corps, entre
 * crochets. C'est la moitié ENTRÉE de la règle du lot; la moitié SORTIE ne
 * bouge pas d'un pouce — `FORBIDDEN_PORTION_TERMS` et `sanitizePortionNote`
 * sont exactement ce qui empêche « pour ton poids » de ressortir, et brancher
 * le corps augmente mécaniquement la pression sur eux.
 *
 * ── TROIS ABSENCES QUI SE RESSEMBLENT, ET C'EST VOULU ─────────────────────
 * Une bouche sans compte, un compte dont la lecture a échoué, un compte sous
 * plancher TCA et un compte qui n'a rien saisi produisent TOUS la même ligne:
 * celle d'avant ce lot. Aucun « height: not stated », aucune mention d'absence.
 * Deux raisons: une ligne qui annonce un manque invite le modèle à le commenter
 * (même posture que `mealBodyBlocks`), et surtout le plancher TCA deviendrait
 * OBSERVABLE dans le brief — un membre marqué « on ne vous dira rien de lui »
 * est un membre désigné.
 */
export function buildPortionBrief(members: readonly PortionMember[]): string {
  if (members.length === 0) return "";
  let anyBodyFacts = false;
  const lines = members.map((m) => {
    // L'ORDRE DES TROIS CAS EST LA RÈGLE, pas un style. Le mineur d'abord: il a
    // sa propre direction, qui est une TAILLE et jamais une orientation.
    // Ensuite `goalApplies`, qui refuse aussi l'âge inconnu — sans lui, une
    // bouche saisie sans date recevrait la direction de son objectif comme si
    // on savait qu'elle est adulte.
    const direction = m.ageState === "minor"
      ? CHILD_DIRECTION
      : goalApplies(m) && m.goal
      ? SERVING_DIRECTION[m.goal]
      : SERVING_DIRECTION.maintenance;
    // AUCUNE DES DEUX GARDES N'EST APPLIQUÉE ICI — ni le plancher TCA, ni la
    // règle du mineur. `householdBodyFacts` les porte toutes les deux, dans le
    // même fichier que `mealBodyBlocks`: une garde qu'un appelant applique est
    // une garde que le prochain appelant oublie (FF-030 R5). Les deux
    // paramètres sont requis, donc il n'y a pas d'appel « partiel » possible.
    const facts = householdBodyFacts(m.body, m.ageState);
    if (facts.length === 0) return `- ${m.displayName}: ${direction}`;
    anyBodyFacts = true;
    return `- ${m.displayName}: ${direction} [${facts.join("; ")}]`;
  });
  return [
    "HOUSEHOLD SERVING PLAN — one cooking session, portions that differ.",
    "Cook ONE set of preparations for everyone. Do NOT propose separate dishes.",
    "For each person below, give a short serving instruction: how much of which",
    "component goes on their plate, and which side is added or dropped.",
    "",
    ...lines,
    "",
    ...(anyBodyFacts ? [...BODY_FACTS_CAVEAT, ""] : []),
    // EN DERNIER, ET ÇA RESTE LE CAS APRÈS LE LOT 3B. Un modèle lit la
    // contrainte la plus proche de la fin comme la plus contraignante, et c'est
    // celle-ci qui doit survivre aux faits corporels qu'on vient d'ajouter.
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
 *
 * ── CE QUE LE LOT 3B Y A AJOUTÉ, ET POURQUOI ──────────────────────────────
 * La liste couvrait le POIDS et l'OBJECTIF, parce que c'était tout ce que le
 * modèle avait de quoi dire. Depuis que le brief porte la TAILLE, la BANDE
 * D'ÂGE et le TOUR DE TAILLE de chaque bouche, il a de quoi en dire davantage —
 * et une ceinture armée sur ce qu'on lui donnait HIER est une ceinture désarmée.
 *
 * Vérifié plutôt que supposé: avant ce lot, « 1,5 part vu ta taille », « a
 * bigger share for your height » et « selon tes mesures » PASSAIENT tous les
 * trois, dans les deux langues.
 *
 * ── LA FRONTIÈRE, ET CE QUI RESTE DEHORS ──────────────────────────────────
 * On n'ajoute que du vocabulaire qui DÉSIGNE LE CORPS D'UNE PERSONNE. Les
 * unités nues (`kg`, `cm`) restent HORS liste, et c'est un arbitrage, pas un
 * oubli: « coupe les carottes en morceaux de 3 cm » est une consigne de service
 * parfaitement légitime, et une ceinture qui mord dessus met la personne en
 * part standard sans que personne comprenne pourquoi. « Une ceinture qui mord
 * sur tout se fait désarmer dans la semaine. »
 *
 * ⚠️ CONSÉQUENCE CONNUE ET NON REFERMÉE: un ÉCHO NUMÉRIQUE NU — « pour tes
 * 84 kg », « tu mesures 186 cm » — n'est mordu par personne. Le moteur apparie
 * des séquences de MOTS; il n'a aucun moyen d'exprimer « un nombre suivi d'une
 * unité, rattaché à une personne ». Le refermer demande soit une seconde
 * ceinture d'un autre genre (une expression régulière sur nombre+unité), soit
 * d'accepter les faux positifs des unités nues. C'est une décision de produit,
 * elle n'est pas prise ici.
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
    // `bmi` / `imc`: le brief dit maintenant en toutes lettres « no BMI », et
    // ce qui entre dans un prompt finit par en sortir. Un verdict sur un corps
    // n'a rien à faire dans une phrase lue à table.
    surfaceForms: [
      "calorie",
      "kcal",
      "calorie deficit",
      "deficit calorique",
      "bmi",
      "imc",
    ],
  },
  // ── LOT 3B — LA TAILLE ET LE TOUR DE TAILLE ─────────────────────────────
  // `taille` NUE reste hors liste: « une part de la taille d'une paume » est la
  // bonne façon d'écrire une portion, et c'est même celle que le brief
  // encourage. Ce sont les formes POSSESSIVES qui désignent le corps de
  // quelqu'un, et elles seules.
  {
    ruleId: "portion.body",
    token: "height",
    surfaceForms: [
      "ta taille",
      "ta hauteur",
      "votre taille",
      "sa taille",
      "your height",
      "his height",
      "her height",
      "how tall",
      "tour de taille",
      "waist",
    ],
  },
  // ── LOT 3B — LES MESURES, DÉSIGNÉES COMME TELLES ────────────────────────
  // Encore les formes possessives seulement: « prends deux mesures de riz » est
  // une consigne de cuisine, pas une fuite.
  {
    ruleId: "portion.body",
    token: "measurements",
    surfaceForms: [
      "tes mesures",
      "vos mesures",
      "ses mesures",
      "your measurements",
      "body measurements",
    ],
  },
  // ── LOT 3B — L'ÂGE ──────────────────────────────────────────────────────
  // La bande d'âge entre désormais dans le brief. Le jeton nu suffit et couvre
  // les deux langues d'un coup (`âge` se normalise en `age`); aucune consigne
  // de service n'a de raison légitime de nommer l'âge de quelqu'un.
  {
    ruleId: "portion.body",
    token: "age",
    surfaceForms: ["years old", "year old", "ans"],
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
  const byMember = new Map<string, Record<string, unknown>>();

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      // AUCUN REPLI SUR `user_id`, et c'est délibéré. Un lecteur qui accepte
      // les deux clés accepte aussi un générateur qui a cessé d'émettre la
      // bonne — après quoi le repli DEVIENT le chemin nominal sans que rien ne
      // le dise. Il n'y a pas d'utilisateur réel: la bascule est sèche.
      const memberId = String(row.member_id ?? row.memberId ?? "").trim();
      if (!memberId) continue;
      if (!members.some((m) => m.memberId === memberId)) {
        issues.push(`portion_for_unknown_member:${memberId}`);
        continue;
      }
      byMember.set(memberId, row);
    }
  }

  const portions = members.map((member) => {
    const row = byMember.get(member.memberId);
    if (!row) {
      issues.push(`portion_missing:${member.memberId}`);
      return {
        memberId: member.memberId,
        displayName: member.displayName,
        portionNote: null,
        preparationShares: [],
      };
    }

    const { note, violations } = sanitizePortionNote(
      row.portion_note ?? row.portionNote,
    );
    for (const v of violations) {
      issues.push(`portion_note_rejected:${member.memberId}:${v}`);
    }

    return {
      memberId: member.memberId,
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
      issues.push(`share_note_rejected:${member.memberId}:${preparationId}:${v}`);
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
    member_id: p.memberId,
    display_name: p.displayName,
    portion_note: p.portionNote,
    preparation_shares: p.preparationShares.map((s) => ({
      preparation_id: s.preparationId,
      note: s.note,
    })),
  }));
}
