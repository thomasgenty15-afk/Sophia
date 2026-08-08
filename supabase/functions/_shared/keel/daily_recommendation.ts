/**
 * FF-028 — LA RECOMMANDATION QUOTIDIENNE (V1).
 *
 * ── LE PROBLÈME, EN UNE LIGNE ───────────────────────────────────────────────
 * FF-027 branche la faim au plan: quand l'élève a faim de façon récurrente, la
 * semaine suivante est composée « plus rassasiante ». Ce bloc PLAFONNE
 * volontairement — deux soirs et sept soirs produisent le même texte. Ce qu'il
 * ne fait pas, et ne doit pas faire, c'est répondre à la faim qui persiste
 * MALGRÉ les adaptations: à ce moment-là, agrandir une troisième fois n'est pas
 * la réponse. La réponse est un changement de STRUCTURE — un vrai
 * petit-déjeuner, une collation — et c'est ce module.
 *
 * ── LES DEUX POINTS QUI GOUVERNENT TOUT LE FICHIER ──────────────────────────
 *
 * 1. L'ESPACE D'ACTION EST PRÉ-CALCULÉ, FERMÉ, ET DÉRIVÉ DE L'ÉTAT RÉEL.
 *    `RECOMMENDATION_ACTIONS` est un littéral gelé de DEUX entrées, et
 *    `buildActionSpace` n'en rend que celles qui changent réellement quelque
 *    chose pour CET élève (le moment n'est pas déjà dans son rythme). Un
 *    sélecteur — modèle ou code — ne peut rendre qu'une action de cet ensemble:
 *    `selectRecommendation` valide le choix CONTRE l'espace et rend `null` hors
 *    de lui. C'est R3 rendue vérifiable au lieu d'être promise.
 *
 *    ⚠️ V1 SÉLECTIONNE DÉTERMINISTEMENT, et c'est plus fort que la fiche.
 *    §4 décrit « le modèle choisit dedans ». Deux actions et un déclencheur
 *    déterministe ne laissent rien à arbitrer: y mettre un tirage ajouterait la
 *    stochastique mesurée ailleurs dans ce dépôt (`[0,3,3,0]` sur une phrase
 *    identique) sur le chemin qui OUVRE un effet durable — ce que la règle
 *    transverse du dépôt interdit. La porte du modèle reste ouverte:
 *    `selectRecommendation(space, choiceId)` est le point d'entrée, et il
 *    refuse déjà tout choix hors espace. Voir le rapport, §écarts.
 *
 * 2. LES TEXTES SONT DES LITTÉRAUX GELÉS, PAS DES GABARITS.
 *    Même raison que le bloc satiété de FF-027: il n'y a aucun trou où un
 *    nombre pourrait entrer. R6 (« jamais un chiffre, jamais moins ») n'est pas
 *    une consigne de prompt — une consigne se contourne au premier tirage —
 *    c'est une propriété de la surface exportée, et le test l'éprouve en
 *    énumérant TOUTES les sorties possibles.
 *
 *    ⚠️ AUCUN DÉCOMPTE NON PLUS, et c'est un écart ASSUMÉ avec l'exemple de
 *    §4 (« Tu as eu faim 4 soirs cette semaine »). Trois raisons, les mêmes que
 *    celles qui ont retiré le décompte du bloc satiété: le nombre ESCALADE (une
 *    proposition qui dit « 6 soirs » se lit comme plus urgente que « 2 »), il
 *    FUIT (ce qui entre dans un texte finit par ressortir ailleurs), et il
 *    transforme une proposition en constat de surveillance. La proposition dit
 *    la RÉCURRENCE et l'INEFFICACITÉ des adaptations — ce qui est exactement ce
 *    qui la justifie — sans jamais dire combien.
 *
 * PURE MODULE: pas d'I/O, pas d'horloge (l'appelant passe les dates), pas
 * d'aléa. Les lectures et les écritures vivent dans `daily_recommendation_io.ts`.
 */

import type { CoachDoctrine } from "./doctrine.ts";
import { findDoctrineViolations } from "./doctrine.ts";
import type { EatingOccasion, EatingOccasionSlot } from "./meal_generation.ts";
import { DEFAULT_EATING_RHYTHM } from "./meal_generation.ts";
import type { HungerWindowSignal } from "./hunger_signal.ts";
import type { SafetyBand } from "./safety_band_io.ts";

// ---------------------------------------------------------------------------
// LES CONSTANTES DE CALIBRAGE — exportées et testées (fiche §11)
// ---------------------------------------------------------------------------

/**
 * COMBIEN DE COMPOSITIONS « PLUS RASSASIANTES » DOIVENT AVOIR ÉCHOUÉ.
 *
 * 2, et c'est le chiffre que la fiche donne en toutes lettres (§10,
 * contre-mesure): « une faim qui persiste MALGRÉ deux adaptations n'appelle pas
 * un troisième agrandissement mais un changement de structure ».
 *
 * C'est aussi le seul endroit où le seuil de « significatif » se règle. Le
 * baisser à 1 — ou à 0 — est la tentation nommée §9 (« le moteur bavard »): en
 * une semaine c'est du bruit, en deux c'est ignoré, en trois c'est coupé. Le
 * test pinne la valeur pour que la baisser soit une décision écrite, pas un
 * réglage.
 */
export const SATIETY_ADAPTATIONS_BEFORE_STRUCTURE = 2;

/**
 * SUR COMBIEN DE SEMAINES ON REGARDE LES ADAPTATIONS.
 *
 * Six semaines: assez pour que deux compositions rassasiantes aient eu le temps
 * d'être vécues, pas assez pour qu'une adaptation d'il y a un trimestre — sur
 * un plan qu'on a déjà changé trois fois — compte encore.
 */
export const SATIETY_ADAPTATION_LOOKBACK_DAYS = 42;

/**
 * LE COOLDOWN DE REFUS, PAR ACTION, EN JOURS.
 *
 * La fiche laisse le choix ouvert (§11: « 14 jours ? 30 ? Par recommandation ou
 * global ? »). 30 et PAR ACTION, et les deux moitiés se lisent ensemble:
 *
 *   — 30 plutôt que 14, parce que le déclencheur lui-même est lent (il faut
 *     DEUX compositions rassasiantes pour l'armer). Un cooldown de 14 jours
 *     rouvrirait la porte avant que quoi que ce soit ait pu changer dans les
 *     données, donc reposerait la MÊME question sur les MÊMES faits — ce qui
 *     est la définition de solliciter;
 *   — par action plutôt que global, parce que « non au petit-déjeuner » et
 *     « non à la collation » ne sont pas le même refus. Un cooldown global
 *     ferait payer à la seconde famille le refus de la première, et la
 *     contre-mesure globale existe déjà: trois refus consécutifs éteignent le
 *     moteur pour de bon.
 *
 * ⚠️ IL COURT AUSSI APRÈS UNE ACCEPTATION. Une action acceptée puis retirée à
 * la main par l'élève sur `/app/plan` redeviendrait proposable dès le
 * lendemain: re-proposer ce que quelqu'un vient de défaire est pire que de
 * l'avoir proposé.
 */
export const RECOMMENDATION_COOLDOWN_DAYS = 30;

/**
 * COMBIEN DE REFUS CONSÉCUTIFS ÉTEIGNENT LE MOTEUR — durablement.
 *
 * La contre-mesure de §10, mot pour mot: « un moteur refusé trois fois de suite
 * par la même personne doit se taire durablement de lui-même — sinon c'est de
 * la sollicitation avec des boutons, et elle détruit aussi la confiance dans le
 * reste du fil ».
 *
 * « Durablement » = sans expiration. La série ne se remet à zéro que sur une
 * ACCEPTATION, c'est-à-dire sur une preuve que le moteur a fini par proposer
 * juste. Un compte à rebours l'aurait rouverte toute seule, ce qui est
 * exactement ce que la contre-mesure interdit.
 */
export const RECOMMENDATION_DECLINE_STREAK_MUTE = 3;

/**
 * COMBIEN DE TEMPS UNE PROPOSITION RESTE OUVERTE, EN JOURS.
 *
 * ── 🔴 LA MESURE QUI A CRÉÉ CETTE CONSTANTE (revue adversariale, run réel) ──
 * Sans elle, une proposition restée SANS RÉPONSE ne bloquait rien: le cooldown
 * ne courait qu'après un refus ou une acceptation. Mesuré sur trois soirs
 * consécutifs, données inchangées: 3 propositions, 3 bulles, 3 lignes, la même
 * question reposée chaque soir à quelqu'un qui n'avait pas répondu.
 *
 * C'est exactement le « moteur bavard » de §9, et c'est aussi une règle que ce
 * dépôt porte déjà ailleurs, écrite mot pour mot dans `daily_pulse.ts`:
 * « le silence de l'élève n'est pas une demande de rappel ».
 *
 * 14 jours: assez pour que quelqu'un qui ouvre l'app une fois par semaine
 * retrouve ses boutons vivants, pas assez pour qu'une question posée il y a un
 * mois traîne dans le fil. Au-delà, la proposition expire en `unanswered` et son
 * action entre en cooldown comme un refus — parce qu'ignorer n'est pas inviter
 * à redemander.
 */
export const RECOMMENDATION_OPEN_FOR_DAYS = 14;

// ---------------------------------------------------------------------------
// L'ESPACE D'ACTION — DEUX FAMILLES, FERMÉES (fiche §9, « l'espace qui grossit »)
// ---------------------------------------------------------------------------

/** Les deux familles de la V1. Fermée. */
export const RECOMMENDATION_FAMILIES = [
  /** Le rythme des repas: un moment structurant qui manque à la journée. */
  "meal_rhythm",
  /** La collation de structure: un moment qui comble un creux. */
  "snack_structure",
] as const;
export type RecommendationFamily = (typeof RECOMMENDATION_FAMILIES)[number];

export const RECOMMENDATION_ACTION_IDS = [
  "add_breakfast",
  "add_afternoon_snack",
] as const;
export type RecommendationActionId = (typeof RECOMMENDATION_ACTION_IDS)[number];

/**
 * UNE ACTION, ET TOUT CE QU'ELLE EMPORTE AVEC ELLE.
 *
 * Le texte proposé, les libellés des deux boutons, les accusés, ET les marqueurs
 * de doctrine qui la contredisent vivent sur LA MÊME structure. Deux listes
 * séparées — les actions ici, leurs contre-indications ailleurs — auraient
 * divergé au premier ajout, et la divergence se serait payée du seul côté qui
 * compte: une proposition de petit-déjeuner chez un coach qui prescrit le jeûne.
 */
export interface RecommendationAction {
  id: RecommendationActionId;
  family: RecommendationFamily;
  /** Le moment ajouté au rythme. C'est LA directive durable. */
  slot: EatingOccasion;
  /** Le texte EXACT de la proposition. Littéral gelé. */
  proposal: string;
  acceptLabel: string;
  declineLabel: string;
  /** L'accusé APRÈS relecture de la ligne. Jamais avant. */
  appliedAck: string;
  declinedAck: string;
  /**
   * LES FORMULATIONS DE DOCTRINE QUI CONTREDISENT CETTE ACTION.
   *
   * ⚠️ CE SONT DES CONTRE-INDICATIONS, PAS DES MOTS-CLÉS DU SUJET. « petit
   * déjeuner » n'est PAS dans la liste: un coach qui écrit « le petit-déjeuner
   * doit tenir jusqu'au déjeuner » serait taillé par sa propre conviction. Seule
   * une formulation qui EXCLUT le moment y entre.
   *
   * Écrites en formes NORMALISÉES (minuscules, diacritiques jetés, apostrophes
   * devenues des espaces) et BILINGUES d'entrée — T9 du domaine: une garde qui
   * ne mord que dans une langue est une garde qui n'existe pas pour la moitié
   * des gens, et `\b` ne mord pas après « é ».
   */
  doctrineContraMarkers: readonly string[];
}

/**
 * LES DEUX ACTIONS. Littéral gelé — l'énumération des sorties est donc
 * exhaustive par construction, comme le bloc satiété de FF-027.
 *
 * ── CE QUE LES DEUX TEXTES ONT EN COMMUN, ET POURQUOI ───────────────────────
 *   * ils NOMMENT le fait qui les justifie (la faim revenue, les adaptations
 *     qui n'ont pas suffi) — T5: toute demande est adossée à un fait;
 *   * ils ne portent AUCUN nombre, aucune unité, aucun décompte;
 *   * ils ne proposent que d'AJOUTER. Il n'existe dans ce module aucune action,
 *     aucun paramètre et aucune branche capable de retirer un moment ou de
 *     réduire quoi que ce soit — R6, tenue par la surface exportée et pas par
 *     une consigne;
 *   * ils parlent du PLAN, jamais de l'humeur, du stress ou du sommeil. Le
 *     coaching de vie est hors périmètre absolu (§9), et la seule façon de
 *     l'empêcher est qu'il n'y ait rien à dire d'autre dans la liste.
 */
export const RECOMMENDATION_ACTIONS: readonly RecommendationAction[] = Object
  .freeze([
    Object.freeze({
      id: "add_breakfast",
      family: "meal_rhythm",
      slot: "breakfast",
      proposal:
        "You've told me more than once that you were still hungry, and I've " +
        "already built your weeks to be more filling. That hasn't settled it, " +
        "which usually means the shape of the day is the thing to change — not " +
        "the plates. Want me to build a proper breakfast into your plan from " +
        "here on?",
      acceptLabel: "Yes, add it",
      declineLabel: "No thanks",
      appliedAck:
        "Done — breakfast is part of your rhythm now, and the next week you " +
        "put together will have one.",
      declinedAck: "Understood — I'll leave your rhythm as it is.",
      doctrineContraMarkers: Object.freeze([
        // --- français ---
        "jeune intermittent",
        "jeune du matin",
        "a jeun le matin",
        "sauter le petit dejeuner",
        "sans petit dejeuner",
        "pas de petit dejeuner",
        "fenetre alimentaire",
        "premier repas a midi",
        // --- anglais ---
        "intermittent fasting",
        "fasting window",
        "fasted morning",
        "fasted training",
        "fast until",
        "skip breakfast",
        "skipping breakfast",
        "no breakfast",
        "without breakfast",
        "eating window",
        "first meal of the day is lunch",
      ]),
    }),
    Object.freeze({
      id: "add_afternoon_snack",
      family: "snack_structure",
      slot: "snack_pm",
      proposal:
        "You've told me more than once that you were still hungry, and I've " +
        "already built your weeks to be more filling. That hasn't settled it. " +
        "The stretch between lunch and dinner is usually where it bites. Want " +
        "me to add an afternoon snack to your plan from here on?",
      acceptLabel: "Yes, add it",
      declineLabel: "No thanks",
      appliedAck:
        "Done — an afternoon snack is part of your rhythm now, and the next " +
        "week you put together will have one.",
      declinedAck: "Understood — I'll leave your rhythm as it is.",
      doctrineContraMarkers: Object.freeze([
        // --- français ---
        "pas de grignotage",
        "zero grignotage",
        "sans grignotage",
        "sans grignoter",
        "pas de collation",
        "aucune collation",
        "pas d en cas",
        "sans en cas",
        "trois repas par jour",
        "trois repas et rien",
        "trois repas seulement",
        // --- anglais ---
        "no snacking",
        "never snack",
        "no snacks",
        "without snacking",
        "stop snacking",
        "cut out snacks",
        "cut the snacks",
        "three meals a day",
        "three meals only",
        "three square meals",
        "nothing between meals",
      ]),
    }),
  ]) as readonly RecommendationAction[];

export function recommendationAction(
  id: RecommendationActionId,
): RecommendationAction {
  const found = RECOMMENDATION_ACTIONS.find((a) => a.id === id);
  if (!found) {
    // Impossible par le typage; levé quand même, parce qu'une valeur venue de
    // la base (`action_id`) traverse ce chemin sans passer par le compilateur.
    throw new Error(`[keel/daily_recommendation] unknown action ${id}`);
  }
  return found;
}

// ---------------------------------------------------------------------------
// LE RYTHME EFFECTIF — celui que le générateur appliquera VRAIMENT
// ---------------------------------------------------------------------------

/**
 * LE RYTHME QUI COMPTE, ET IL N'EST PAS CELUI DE LA COLONNE.
 *
 * `parseEatingRhythm` rend `[]` quand rien n'est déclaré, et TOUS les
 * générateurs retombent alors sur `DEFAULT_EATING_RHYTHM`
 * (petit-déjeuner / déjeuner / dîner). Lire la colonne au pied de la lettre
 * ferait donc proposer un petit-déjeuner à quelqu'un qui en reçoit déjà un —
 * la plus visible des incohérences, et sur la première proposition qu'il aurait
 * jamais reçue.
 *
 * L'espace d'action se calcule donc sur ce que le PRODUIT fait, pas sur ce que
 * la colonne dit.
 */
export function effectiveRhythm(
  parsed: readonly EatingOccasionSlot[],
): readonly EatingOccasionSlot[] {
  return parsed.length > 0 ? parsed : DEFAULT_EATING_RHYTHM;
}

/**
 * L'ESPACE D'ACTION POUR CET ÉLÈVE — pré-calculé, déterministe (R3).
 *
 * Une action n'y entre que si elle CHANGE quelque chose: le moment n'est pas
 * déjà dans le rythme effectif. Proposer d'ajouter ce qui existe déjà est la
 * définition du bruit, et c'est aussi une proposition qu'on ne pourrait pas
 * tenir — l'application serait un no-op accusé comme un succès.
 */
export function buildActionSpace(
  rhythm: readonly EatingOccasionSlot[],
): RecommendationAction[] {
  const taken = new Set<string>(rhythm.map((r) => r.slot));
  return RECOMMENDATION_ACTIONS.filter((a) => !taken.has(a.slot));
}

// ---------------------------------------------------------------------------
// R5 — LA DOCTRINE FILTRE L'ESPACE **AVANT** LE CHOIX
// ---------------------------------------------------------------------------

/**
 * La normalisation du dépôt: minuscules, diacritiques jetés, apostrophes
 * transformées en espace, le reste en espaces.
 *
 * ⚠️ L'APOSTROPHE DEVIENT UN ESPACE, et c'est la moitié de la garde bilingue —
 * « pas d'en-cas » devient « pas d en cas », et c'est sous cette forme que les
 * marqueurs sont écrits. Copiée de `hunger_signal.ts` plutôt qu'importée: les
 * deux modules doivent pouvoir diverger si l'un a besoin d'une normalisation
 * plus fine, et une normalisation partagée qu'on modifie pour l'un change
 * silencieusement la garde de l'autre.
 */
function normalize(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * TOUT CE QUE LE COACH A ÉCRIT, mis à plat et normalisé.
 *
 * Les convictions, leurs justifications, les interdits (jeton, formulations de
 * surface, raison, et le « à la place » que l'élève lit mot pour mot), les
 * arbitrages et les Q/R. Une contre-indication peut vivre dans n'importe
 * laquelle de ces sections — un coach qui prescrit le jeûne du matin l'écrit
 * aussi souvent dans une conviction que dans un interdit.
 */
export function doctrineSurfaceText(doctrine: CoachDoctrine | null): string {
  if (!doctrine) return "";
  const parts: string[] = [];
  for (const b of doctrine.beliefs ?? []) {
    parts.push(String(b.claim ?? ""), String(b.rationale ?? ""));
  }
  for (const f of doctrine.forbidden ?? []) {
    parts.push(String(f.token ?? "").replace(/_/g, " "));
    for (const s of f.surfaceForms ?? []) parts.push(String(s ?? ""));
    parts.push(String(f.reason ?? ""), String(f.instead ?? ""));
  }
  for (const a of doctrine.arbitrations ?? []) {
    parts.push(String(a.situation ?? ""), String(a.coachAnswer ?? ""));
  }
  for (const q of doctrine.qa ?? []) {
    parts.push(String(q.question ?? ""), String(q.answer ?? ""));
  }
  for (const v of doctrine.vocabulary ?? []) {
    parts.push(String(v.term ?? ""), String(v.meaning ?? ""));
  }
  return normalize(parts.join(" \n "));
}

export interface DoctrineFilterResult {
  kept: RecommendationAction[];
  /** Pourquoi chaque action est tombée. Nommé, jamais avalé (R7). */
  removed: Array<{ id: RecommendationActionId; reason: string }>;
}

/**
 * R5 — L'ESPACE FILTRÉ PAR LA MÉTHODE DU COACH, avant tout choix.
 *
 * DEUX filtres, et il en faut deux:
 *
 *   1. LE VERROU DÉJÀ TESTÉ. `findDoctrineViolations` passe le texte de la
 *      proposition dans le même moteur que n'importe quelle sortie générée —
 *      interdits du coach et aliments déconseillés, avec leurs formulations de
 *      surface et l'exception de négation. Un coach dont l'interdit porte
 *      `surfaceForms: ["breakfast"]` taille la proposition sans qu'on ait rien
 *      écrit de spécifique.
 *
 *   2. LES CONTRE-INDICATIONS DE L'ACTION. Le verrou ci-dessus ne regarde que
 *      les listes d'INTERDITS. Un coach de masterclass n'écrit pas « interdit:
 *      petit-déjeuner » — il écrit une CONVICTION: « on rompt le jeûne à midi,
 *      c'est là que le travail se fait ». Aucune liste d'interdits ne porte
 *      cette phrase, et sans ce second filtre ses élèves recevraient « on
 *      ajoute un petit-déjeuner ? » — le produit contredisant le coach chez ses
 *      propres élèves, qui est le scénario nommé par R5.
 *
 * ⚠️ FAIL-CLOSED, ET LE PARAMÈTRE EST REQUIS. `doctrine: CoachDoctrine | null`
 * n'est pas optionnel: un paramètre de garde optionnel est une garde désarmée,
 * et ce dépôt l'a payé au moins deux fois (`safetyBand`, `safetyConstraints`).
 * `null` est une DÉCLARATION — « cet élève n'a pas de méthode publiée » — et
 * elle ne filtre rien, parce qu'il n'y a alors aucune méthode à contredire.
 * L'appelant qui n'a PAS PU lire la doctrine ne passe pas `null`: il le dit au
 * décideur (`doctrineReadable: false`), qui se tait.
 */
export function filterActionsByDoctrine(
  actions: readonly RecommendationAction[],
  doctrine: CoachDoctrine | null,
): DoctrineFilterResult {
  const kept: RecommendationAction[] = [];
  const removed: Array<{ id: RecommendationActionId; reason: string }> = [];
  const surface = doctrineSurfaceText(doctrine);

  for (const action of actions) {
    if (doctrine) {
      const violations = findDoctrineViolations(action.proposal, doctrine);
      if (violations.length > 0) {
        removed.push({
          id: action.id,
          reason: `forbidden:${violations.map((v) => v.token).join(",")}`,
        });
        continue;
      }
    }
    const hit = action.doctrineContraMarkers.find((m) => surface.includes(m));
    if (hit) {
      removed.push({ id: action.id, reason: `contra:${hit}` });
      continue;
    }
    kept.push(action);
  }
  return { kept, removed };
}

/**
 * LA VALIDATION D'UN CHOIX CONTRE L'ESPACE — le point où R3 se tient.
 *
 * Rend l'action, ou `null`. Un choix hors espace n'est pas corrigé, pas
 * rapproché du plus proche voisin, pas remplacé par un défaut: il ne produit
 * PAS de proposition (§7, « le modèle propose hors espace d'action »).
 *
 * V1 n'a pas de modèle sélecteur — voir l'en-tête. Cette fonction existe quand
 * même, exportée et testée, parce que c'est elle qui rend l'ajout d'un
 * sélecteur sûr le jour où on en voudra un.
 */
export function selectRecommendation(
  space: readonly RecommendationAction[],
  choiceId: string,
): RecommendationAction | null {
  const id = String(choiceId ?? "").trim();
  return space.find((a) => a.id === id) ?? null;
}

/**
 * LE SÉLECTEUR DÉTERMINISTE DE LA V1: l'ordre de `RECOMMENDATION_ACTIONS`.
 *
 * Le petit-déjeuner d'abord, et ce n'est pas arbitraire: c'est le levier
 * structurel le plus grand (il ouvre la journée et déplace tout ce qui suit),
 * là où une collation comble un creux. Quand il est déjà là, le creux de
 * l'après-midi est ce qui reste.
 */
export function pickRecommendation(
  space: readonly RecommendationAction[],
): RecommendationAction | null {
  for (const candidate of RECOMMENDATION_ACTIONS) {
    const found = selectRecommendation(space, candidate.id);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// LES GATES — DANS L'ORDRE DE LA FICHE (§4)
// ---------------------------------------------------------------------------

export const RECOMMENDATION_SILENT_REASONS = [
  /** R4 — plancher de restriction: MUET, sans exception « protectrice ». */
  "restriction_flag",
  /** Le dernier tour portait une bande de sécurité non nulle. */
  "safety_band",
  /** L'élève a coupé ses relances. */
  "opted_out",
  /** Rien à influencer: pas de plan suivi. */
  "no_active_plan",
  /** La méthode du coach n'a pas pu être lue: on ne propose pas à l'aveugle. */
  "doctrine_unreadable",
  /** §10 contre-mesure: trois refus consécutifs, le moteur s'éteint. */
  "decline_streak_muted",
  /** R5 — la doctrine (ou le rythme déjà complet) a vidé l'espace. */
  "no_action_available",
  /** T4 — la demande du jour est déjà partie. La proposition attend demain. */
  "daily_ask_budget",
  /** R8 — refus (ou silence) récent sur toutes les actions restantes. */
  "cooldown",
  /**
   * Une proposition est ENCORE OUVERTE: ses boutons sont vivants dans le fil et
   * personne n'a répondu. En reposer une seconde est de la sollicitation.
   */
  "awaiting_response",
  /** Une proposition est déjà partie aujourd'hui. */
  "already_proposed_today",
  /** LE CAS NOMINAL (R2). Rien de significatif dans les données. */
  "nothing_significant",
] as const;
export type RecommendationSilentReason =
  (typeof RECOMMENDATION_SILENT_REASONS)[number];

export interface RecommendationDecisionInput {
  /**
   * R4. REQUIS, jamais optionnel — c'est la garde la plus chère du fichier et
   * un booléen absent vaudrait `false`, c'est-à-dire « pas de plancher », pour
   * un appelant qui a simplement oublié de lire.
   */
  restrictionFlag: boolean;
  /**
   * La bande du DERNIER tour. REQUIS, `T | null`. `null` est une déclaration
   * (« je ne sais pas »), et elle vaut `none` — même arbitrage que
   * `readLastTurnSafetyBand`, dont le repli est permissif ET tracé.
   */
  safetyBand: SafetyBand | null;
  optedOut: boolean;
  hasActivePlan: boolean;
  /**
   * La méthode du coach a-t-elle pu être LUE ? Distinct de « il n'y en a pas ».
   * Une lecture en panne se tait; une absence de doctrine ne filtre rien.
   */
  doctrineReadable: boolean;
  /** L'espace d'action DÉJÀ filtré par la doctrine (`filterActionsByDoctrine`). */
  actionSpace: readonly RecommendationAction[];
  /** Refus consécutifs depuis la dernière acceptation. */
  declineStreak: number;
  /** Les actions sous cooldown (refus, acceptation, OU silence récent). */
  cooldownBlocked: readonly RecommendationActionId[];
  /**
   * Une proposition est-elle encore ouverte, boutons vivants, sans réponse ?
   *
   * REQUIS, jamais optionnel: un booléen absent vaudrait `false`, c'est-à-dire
   * « personne n'attend », pour un appelant qui a simplement oublié de lire —
   * et le défaut qu'il rouvrirait est celui qui a créé
   * `RECOMMENDATION_OPEN_FOR_DAYS`.
   */
  hasOpenProposal: boolean;
  /** `countDailyAsks(...).count` — le budget PARTAGÉ, tous genres confondus. */
  dailyAskCount: number;
  /** Le plafond, passé pour que le test puisse l'éprouver. */
  dailyAskBudget: number;
  alreadyProposedToday: boolean;
  /** FF-027 — la fenêtre de faim, dérivée à la lecture. */
  hunger: HungerWindowSignal;
  /** Combien de compositions ont déjà porté le bloc satiété. */
  satietyAdaptations: number;
}

export type RecommendationDecision =
  | { decision: "propose"; action: RecommendationAction }
  | { decision: "silent"; reason: RecommendationSilentReason };

/**
 * ENVOIE-T-ON UNE RECOMMANDATION CE SOIR ?
 *
 * ── L'ORDRE DES GATES EST LE CONTRAT, ET IL EST CELUI DE LA FICHE ───────────
 * §4 les donne dans cet ordre: restriction → doctrine → budget → cooldown →
 * rien de significatif. Les quatre préconditions structurelles (bande de
 * sécurité, mute, plan actif, doctrine illisible) s'insèrent en tête parce
 * qu'elles produisent le même silence pour la même raison — on ne parle pas.
 *
 * L'ordre n'est pas cosmétique: il décide du MOTIF journalisé, et le motif est
 * la seule chose qui distingue « ce moteur ne sert jamais » de « ce moteur
 * s'est tu, correctement, tous les soirs ». C'est le défaut que `body_sources`
 * a appris au job du soir à rendre visible.
 *
 * ── « RIEN » EST LE CAS NOMINAL, ET IL EST EN DERNIER (R2) ──────────────────
 * Volontairement: le placer plus haut masquerait les dix autres motifs dans le
 * compte-rendu, et « personne n'avait rien de significatif » couvrirait
 * « personne n'a de doctrine lisible ».
 *
 * PURE: aucune horloge, aucune lecture. L'appelant a déjà résolu les jours
 * locaux, parce que lui seul connaît le fuseau de l'élève.
 */
export function decideDailyRecommendation(
  input: RecommendationDecisionInput,
): RecommendationDecision {
  const silent = (
    reason: RecommendationSilentReason,
  ): RecommendationDecision => ({ decision: "silent", reason });

  // 1. R4 — le plancher de restriction. En premier, et sans exception.
  if (input.restrictionFlag) return silent("restriction_flag");

  // 2. La bande de sécurité du dernier tour. `null` = inconnue = permissive.
  if ((input.safetyBand ?? "none") !== "none") return silent("safety_band");

  // 3-4. Les deux préconditions de canal et de matière.
  if (input.optedOut) return silent("opted_out");
  if (!input.hasActivePlan) return silent("no_active_plan");

  // 5. R5 — la méthode du coach. Illisible ⇒ on ne propose pas à l'aveugle.
  if (!input.doctrineReadable) return silent("doctrine_unreadable");

  // 6. §10 — la contre-mesure. Avant tout le reste de la logique de choix:
  //    un moteur éteint n'a pas d'espace d'action à discuter.
  if (
    Math.max(0, Math.floor(input.declineStreak ?? 0)) >=
      RECOMMENDATION_DECLINE_STREAK_MUTE
  ) {
    return silent("decline_streak_muted");
  }

  // 7. R5, seconde moitié — l'espace filtré est-il vide ?
  const blocked = new Set<string>(input.cooldownBlocked ?? []);
  const space = (input.actionSpace ?? []);
  if (space.length === 0) return silent("no_action_available");

  // 8. T4 — LE BUDGET PARTAGÉ. Avant le cooldown, comme la fiche l'ordonne:
  //    une demande déjà partie aujourd'hui rend la question du cooldown sans
  //    objet, et c'est le motif qu'on veut lire dans le compte-rendu.
  if (input.dailyAskCount >= input.dailyAskBudget) return silent("daily_ask_budget");

  // 9. R8 — le refus est respecté.
  const available = space.filter((a) => !blocked.has(a.id));
  if (available.length === 0) return silent("cooldown");

  // 10. UNE QUESTION EST DÉJÀ DEHORS. Deux formes, deux motifs, et la première
  //     est la plus importante:
  //
  //     — `awaiting_response`: une proposition est ouverte, ses boutons sont
  //       vivants, et personne n'a répondu. En reposer une seconde — la même ou
  //       une autre — c'est demander deux fois. Mesuré sans cette garde: la
  //       MÊME question repartie trois soirs de suite sur des données
  //       inchangées;
  //     — `already_proposed_today`: deux ticks du cron dans la même heure
  //       locale, ou deux instances du job. Distinct, parce qu'une proposition
  //       RÉPONDUE aujourd'hui laisse `hasOpenProposal` à faux et doit quand
  //       même fermer la journée.
  if (input.hasOpenProposal) return silent("awaiting_response");
  if (input.alreadyProposedToday) return silent("already_proposed_today");

  // 11. LE SEUIL DE SIGNIFICATIF — et il est le cas nominal.
  //
  //     Les deux conditions ensemble, jamais l'une sans l'autre:
  //       * la faim est RÉCURRENTE dans la fenêtre (FF-027, jours distincts);
  //       * et DEUX compositions rassasiantes n'ont pas suffi.
  //
  //     La seconde est ce qui empêche le moteur d'être bavard: sans elle, toute
  //     faim récurrente déclencherait une proposition de structure alors que la
  //     réponse de FF-027 — composer plus rassasiant — n'a même pas encore été
  //     essayée. On ne change la forme de la journée de quelqu'un qu'après
  //     avoir constaté que la réponse la moins intrusive a échoué.
  if (!input.hunger?.recurrent) return silent("nothing_significant");
  if (input.satietyAdaptations < SATIETY_ADAPTATIONS_BEFORE_STRUCTURE) {
    return silent("nothing_significant");
  }

  const action = pickRecommendation(available);
  // Défensif et non atteignable: `available` est non vide et ses membres
  // viennent tous de `RECOMMENDATION_ACTIONS`. On se tait plutôt que de lever —
  // un moteur de recommandation qui fait tomber le cron du soir coûte plus cher
  // que la proposition qu'il rate.
  if (!action) return silent("no_action_available");
  return { decision: "propose", action };
}

// ---------------------------------------------------------------------------
// L'EMPREINTE DU PLAN (fiche §5) — ce qui rend la proposition PÉRISSABLE
// ---------------------------------------------------------------------------

/**
 * L'EMPREINTE DE L'ÉTAT SUR LEQUEL L'ACTION A ÉTÉ CALCULÉE.
 *
 * ── CE QU'ELLE COUVRE, ET CE QU'ELLE REFUSE DE COUVRIR ──────────────────────
 * Elle couvre le RYTHME effectif (ce que l'action modifie, et ce qui a décidé
 * de l'espace) et la VERSION DE DOCTRINE (ce qui a filtré l'espace). Elle ne
 * couvre PAS le contenu du plan de la semaine — les plats composés changent
 * plusieurs fois par semaine, et les y mettre ferait de « ta proposition a
 * expiré » le cas nominal. Une garde qui mord toujours est une garde qu'on
 * débranche dans la semaine.
 *
 * Autrement dit: elle expire exactement quand l'action n'est PLUS celle qu'on
 * aurait calculée. Quelqu'un qui ajoute lui-même un petit-déjeuner sur
 * `/app/plan` entre la proposition et le tap voit la proposition expirer; un
 * coach qui republie sa doctrine aussi.
 *
 * ── LISIBLE, PAS HACHÉE ─────────────────────────────────────────────────────
 * « rhythm=lunch,dinner|doctrine=3 » se lit en incident. Un sha256 aurait été
 * plus court et n'aurait rien dit le jour où on cherche pourquoi une
 * proposition a expiré.
 */
export function planFingerprint(args: {
  rhythm: readonly EatingOccasionSlot[];
  doctrineVersion: number | null;
}): string {
  const slots = args.rhythm
    .map((r) => String(r.slot))
    .filter(Boolean)
    .sort()
    .join(",");
  return `rhythm=${slots}|doctrine=${args.doctrineVersion ?? "none"}`;
}

// ---------------------------------------------------------------------------
// LES BOUTONS — DÉTERMINISTES, comme le tap du soir
// ---------------------------------------------------------------------------

/**
 * Le préfixe des identifiants de bouton. Même mécanique que `KEEL_PULSE_`:
 * c'est une valeur que NOUS avons émise, qui n'a qu'un sens possible, et qui
 * revient telle quelle. Elle est résolue AVANT le dispatcher — payer un appel
 * LLM pour interpréter une chaîne exacte, c'est accepter qu'il se trompe sur
 * elle.
 */
export const RECOMMENDATION_BUTTON_PREFIX = "KEEL_RECO_";

export type RecommendationReply =
  | { kind: "accept"; proposalId: string }
  | { kind: "decline"; proposalId: string }
  | { kind: "none" };

/**
 * L'IDENTIFIANT PORTE L'IDENTIFIANT DE LA PROPOSITION, et c'est ce qui rend le
 * rejeu sûr.
 *
 * Sans lui, un « Oui » tapé trois semaines plus tard, sur une bulle remontée
 * dans l'historique, s'appliquerait à la proposition COURANTE — c'est-à-dire à
 * une question que l'élève n'a pas lue. Avec lui, le tap désigne exactement la
 * ligne qu'il a vue, et cette ligne porte son état et son empreinte.
 *
 * Le payload n'est PAS une autorisation: il désigne une ligne, et l'écriture
 * vérifie que cette ligne appartient bien à l'élève porteur du JWT. Un
 * identifiant qui ferait l'aller-retour en désignant la ligne à écrire SANS
 * cette vérification serait un identifiant modifiable — la leçon déjà écrite en
 * tête de `deterministic_buttons.ts` pour le jeton du formulaire hebdo.
 */
export function recommendationButtonId(
  kind: "accept" | "decline",
  proposalId: string,
): string {
  return `${RECOMMENDATION_BUTTON_PREFIX}${kind.toUpperCase()}_${proposalId}`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Interprète un `button_payload`. DÉTERMINISTE, et volontairement rien d'autre:
 * pas de repli sur le texte libre. « oui » écrit à la main dans une
 * conversation en cours peut vouloir dire la réponse à la proposition comme
 * n'importe quoi d'autre; le dispatcher fait un meilleur travail que nous
 * là-dessus.
 *
 * L'identifiant de proposition est validé comme UUID AVANT toute lecture: un
 * payload bricolé ne doit pas atteindre la base pour y être rejeté.
 */
export function readRecommendationReply(
  buttonPayload: string | null | undefined,
): RecommendationReply {
  const raw = String(buttonPayload ?? "").trim();
  if (!raw.toUpperCase().startsWith(RECOMMENDATION_BUTTON_PREFIX)) {
    return { kind: "none" };
  }
  const rest = raw.slice(RECOMMENDATION_BUTTON_PREFIX.length);
  const sep = rest.indexOf("_");
  if (sep <= 0) return { kind: "none" };
  const verb = rest.slice(0, sep).toUpperCase();
  const proposalId = rest.slice(sep + 1).trim().toLowerCase();
  if (!UUID_RE.test(proposalId)) return { kind: "none" };
  if (verb === "ACCEPT") return { kind: "accept", proposalId };
  if (verb === "DECLINE") return { kind: "decline", proposalId };
  return { kind: "none" };
}

export interface RecommendationMessage {
  body: string;
  buttons: Array<{ payload: string; label: string }>;
}

/**
 * LE MESSAGE TEL QUEL — le fait, la proposition, et DEUX boutons.
 *
 * ── PAS DE PROPOSITION SANS BOUTONS ─────────────────────────────────────────
 * L'invariance est tenue ici plutôt que par une convention d'appelant, pour la
 * même raison que `renderPulseMessage`: une question sans bouton renverrait
 * l'élève au clavier alors que `readRecommendationReply` ne lit QUE des
 * identifiants de bouton. Sa réponse texte partirait au dispatcher, et le
 * « oui » de quelqu'un qui accepte de changer sa journée serait perdu.
 */
export function renderRecommendation(
  action: RecommendationAction,
  proposalId: string,
): RecommendationMessage {
  return {
    body: action.proposal,
    buttons: [
      {
        payload: recommendationButtonId("accept", proposalId),
        label: action.acceptLabel,
      },
      {
        payload: recommendationButtonId("decline", proposalId),
        label: action.declineLabel,
      },
    ],
  };
}

/**
 * L'ACCUSÉ QUAND LE PLAN A CHANGÉ (§7, « la personne en est informée d'une
 * phrase »).
 *
 * Une phrase, sans reproche et sans jargon: on ne dit pas « empreinte » ni
 * « expiré », on dit ce qui s'est passé et ce qu'on n'a PAS fait. Ne rien dire
 * du tout serait pire — l'élève a tapé « Oui » et croirait que c'est fait.
 */
export const RECOMMENDATION_STALE_ACK =
  "Your eating rhythm has changed since I asked, so I've left it alone — " +
  "nothing has been added.";

/**
 * L'ACCUSÉ QUAND L'ÉCRITURE N'A PAS PU ÊTRE RELUE.
 *
 * ⚠️ C'EST LA PHRASE QUI EMPÊCHE L'ACCUSÉ FANTÔME. Elle part quand la ligne
 * n'existe pas après l'écriture — et jamais un « c'est fait » optimiste. Le
 * défaut le plus cher du dépôt est exactement celui-là: une réponse « c'est
 * noté » sans ligne relue.
 */
export const RECOMMENDATION_APPLY_FAILED_ACK =
  "Something went wrong on my side and I couldn't save that — your rhythm is " +
  "unchanged. Sorry. Could you try again?";

/**
 * L'ACCUSÉ D'UN BOUTON QUI NE DÉSIGNE PLUS RIEN (proposition effacée, payload
 * d'un autre élève, tap sur une bulle d'un compte supprimé et recréé).
 *
 * Elle ne dit RIEN de l'existence ou non de la ligne visée: un accusé qui
 * distinguerait « cette proposition n'existe pas » de « cette proposition n'est
 * pas à toi » serait un oracle d'énumération sur des identifiants d'autrui.
 */
export const RECOMMENDATION_UNKNOWN_ACK =
  "That one's no longer open — nothing has changed.";
