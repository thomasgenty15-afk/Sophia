/**
 * FF-062 C1 — LE REPAS D'UN CRÉNEAU DÉCLARÉ QUE LE PLAN NE COMPOSE PAS. PUR.
 *
 * Autorité: docs/fonctionnalites/conversation/FF-062-quand-sophia-parle-la-premiere.md
 * (canal C1, règles R3 à R6 et R10-R11).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LE TROU, ET IL EST LARGE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Quelqu'un qui déjeune au travail cinq midis par semaine a cinq repas qui
 * n'existent NULLE PART. Le plan ne les compose pas, et rien ne les demande. Un
 * objectif de poids piloté sur les deux tiers de la journée est un objectif
 * piloté sur du bruit.
 *
 * ── LE DÉCLENCHEUR: UN MOMENT DU RYTHME QUE LE PLAN NE COMPOSE PAS ───────
 * ⟳ 2026-09-24 — le troisième état de présence (« dehors », `eating_out`) n'a
 * plus d'écran qui l'écrive: la grille (`MealPickerGrid`) ne propose plus que
 * « à table » / « absent ». Sa branche est retirée d'ici. `slot_meal_io.ts` ne
 * garde que les moments que le journal rend (`promptEligibleJournalSlots`), et
 * le journal (`tracking_v2_io.ts`) ne rend une ligne que pour un moment DÉCLARÉ,
 * non composé, non absent, sur un jour COUVERT PAR UN PLAN: pas de question
 * pendant des vacances, ni sur une semaine sans plan.
 *
 * ── R3, ET C'EST UNE DÉCISION CONTRE L'AVIS RÉDIGÉ ───────────────────────
 * C1 part à CHAQUE occurrence, sans plafond quotidien ni hebdomadaire. Cinq
 * déjeuners dehors font cinq questions. L'argument retenu par l'utilisateur:
 * un objectif de poids sans le déjeuner est un objectif piloté sur les deux
 * tiers de la journée. L'argument écarté: c'est la forme du formulaire
 * quotidien que ce produit a retiré. La contre-mesure vit dans §10 de la fiche
 * — le taux de `skip` tranchera ce désaccord par la donnée, pas par l'opinion.
 *
 * ⚠️ « SANS PLAFOND » N'EST PAS « SANS IDEMPOTENCE ». Un créneau déjà demandé
 * aujourd'hui ne se redemande pas: ce n'est pas une cadence, c'est le fait que
 * la question a déjà été posée. Le balayage est horaire, donc sans cette garde
 * un déjeuner produirait deux bulles dans la fenêtre de rattrapage.
 *
 * PURE MODULE: ni base, ni horloge, ni aléatoire.
 */

import { type LocalePackKey, localePackKey } from "./locale.ts";
import { type EatingOccasion, EATING_OCCASIONS } from "./meal_generation.ts";
import { rhythmClockFrom, SLOT_PASSED_HOUR } from "./plan_hours.ts";
import type { GoalToken } from "./tokens.ts";

/**
 * LES OBJECTIFS QUI OUVRENT CE CANAL (R4).
 *
 * ⛔ `maintenance` EN EST EXCLU, ET CE N'EST PAS UN OUBLI. Sur un maintien, le
 * trou du midi ne change AUCUN chiffre qui pilote quoi que ce soit: la bande de
 * maintien se juge sur le poids, pas sur l'apport. T1 du domaine conversation:
 * on ne collecte que ce qu'un aval consomme.
 *
 * C'est la seule différence de portée avec C2, qui lui accepte les trois — une
 * pesée sert le maintien autant que la perte.
 */
export const SLOT_MEAL_GOALS: ReadonlySet<GoalToken> = new Set([
  "fat_loss",
  "muscle_gain",
]);

/**
 * COMBIEN D'HEURES APRÈS LE CRÉNEAU LA QUESTION PEUT ENCORE PARTIR.
 *
 * Deux. Le balayage est horaire: sans fenêtre de rattrapage, un tick raté — un
 * déploiement, un 502 de Kong — perdrait le repas définitivement. Avec quatre
 * heures, un déjeuner serait demandé à 18h, c'est-à-dire assez tard pour que la
 * réponse soit une reconstitution plutôt qu'un souvenir.
 *
 * ⚠️ DEUX HEURES NE PEUVENT PAS FAIRE SE CHEVAUCHER DEUX CRÉNEAUX aux heures de
 * repli (10h, 14h, 21h — quatre heures d'écart au minimum). Elles le peuvent
 * avec des heures DÉCLARÉES serrées, et c'est pour ça que la décision choisit le
 * créneau le plus RÉCENT parmi les éligibles.
 */
export const SLOT_MEAL_GRACE_HOURS = 2;

/** Le préfixe du jeton. Huitième vocabulaire, disjoint des sept autres. */
export const SLOT_MEAL_BUTTON_PREFIX = "KEEL_SLOTMEAL_";

/**
 * Les issues offertes. Vocabulaire FERMÉ.
 *
 * ⟳ `mute` A REJOINT LES TROIS LE 2026-09-08, sous chaque bulle. ⟳ 2026-09-24 —
 * IL N'EST PLUS OFFERT (décision du propriétaire): son libellé promettait
 * « à chaque repas » alors que la question ne part que sur un moment non
 * prévu, il éteignait AUSSI la question du soir (même colonne), et rallumer
 * demande d'aller dans « Notifications ». Il reste LU, pour les bulles déjà
 * envoyées qui le portent.
 *
 * ⛔ PAS UN VOCABULAIRE DE PLUS. Un neuvième préfixe pour un seul bouton
 * ajouterait une famille à `DETERMINISTIC_BUTTON_PREFIXES`, un lecteur, et une
 * ligne à la matrice de disjonction — pour une action qui appartient
 * exactement à cette question-ci.
 */
export const SLOT_MEAL_ACTIONS = [
  "photo",
  "describe",
  "skip",
  "mute",
  /**
   * ⟳ 2026-09-08 — LES DEUX RÉPONSES D'UN CRÉNEAU QUE LE PLAN COMPOSE.
   *
   * « Tu as mangé le plat prévu ? » a une réponse oui/non; « qu'est-ce que tu
   * as mangé ? » n'en a pas. Ce sont deux questions différentes, donc deux
   * jeux de boutons — et ces deux-ci portent en plus DE QUOI on parle.
   */
  "ate",
  "notplanned",
] as const;
export type SlotMealAction = (typeof SLOT_MEAL_ACTIONS)[number];

/**
 * `KEEL_SLOTMEAL_<action>|<date>|<slot>` — et, pour `ate`/`notplanned`, un
 * QUATRIÈME segment `|<mealId>@<i,j,…>`.
 *
 * ⚠️ OPTIONNEL DANS LA REGEX, OBLIGATOIRE PAR ACTION. `parseSlotMealButton`
 * rend `null` si `ate`/`notplanned` arrive SANS le segment de plan, et `null`
 * si les quatre autres arrivent AVEC. On ne devine pas: une charge qui ne dit
 * pas de quels plats elle parle ne peut rien cocher, et une charge qui le dit
 * là où ça n'a pas de sens est une charge forgée.
 *
 * ⛔ LES INDEX VIENNENT DE LA CHARGE, JAMAIS D'UNE RELECTURE. C'est la règle
 * écrite de `stripAllId`: « le tap ne peut écrire que ce que la bande a
 * nommé ». Relire le plan au moment du tap cocherait des plats que la personne
 * n'a jamais vus nommés — et c'est pour ça que la question NOMME le plat: un
 * « Oui » qui coche trois lignes anonymes est une signature en blanc.
 */
const SLOT_MEAL_PAYLOAD =
  /^KEEL_SLOTMEAL_(photo|describe|skip|mute|ate|notplanned)\|(\d{4}-\d{2}-\d{2})\|([a-z_]+)(?:\|([0-9a-f-]{36})@(\d+(?:,\d+)*))?$/;

/** Les deux actions qui EXIGENT un segment de plan. */
const PLAN_BOUND_ACTIONS: ReadonlySet<string> = new Set(["ate", "notplanned"]);

/**
 * `KEEL_SLOTMEAL_<action>|<date>|<slot>`.
 *
 * ⚠️ LE CRÉNEAU EST DANS LE JETON, ET C'EST R6 EN UNE LIGNE. L'inférence de
 * FF-018 §11 range une déclaration au DERNIER CRÉNEAU ÉCOULÉ; sur une question
 * qui NOMME le midi, elle tomberait juste par accident — c'est-à-dire faux le
 * jour où la personne répond à 21h, ou le jour où elle déclare déjeuner à 15h.
 * Le créneau voyage donc avec la question, et l'écrivain n'a rien à deviner.
 *
 * La DATE y est aussi, pour la même raison: une réponse tapée après minuit ne
 * doit pas dater le déjeuner d'hier d'aujourd'hui.
 */
export function slotMealButtonId(args: {
  action: SlotMealAction;
  /** REQUIS pour `ate`/`notplanned`, INTERDIT pour les quatre autres. */
  plan?: { mealId: string; dishIndexes: readonly number[] } | null;
  localDate: string;
  slot: EatingOccasion;
}): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(args.localDate ?? ""))) {
    throw new Error(
      `[keel/slot_meal_ask] localDate invalide: ${JSON.stringify(args.localDate)}`,
    );
  }
  if (!(EATING_OCCASIONS as readonly string[]).includes(args.slot)) {
    throw new Error(`[keel/slot_meal_ask] slot inconnu: ${JSON.stringify(args.slot)}`);
  }
  // ⛔ LE CONTRAT EST VÉRIFIÉ À L'ÉCRITURE AUSSI, ET IL JETTE. Un jeton
  // fabriqué sans son segment de plan serait refusé par le lecteur — donc le
  // bouton partirait, la personne taperait, et la charge tomberait dans la
  // garde des charges inutilisables. Un tap perdu qu'on aurait pu ne jamais
  // offrir. Le compilateur ne peut pas tenir cette règle (le champ est
  // optionnel par nécessité), donc c'est ici.
  const needsPlan = PLAN_BOUND_ACTIONS.has(args.action);
  const plan = args.plan ?? null;
  if (needsPlan && !plan) {
    throw new Error(
      `[keel/slot_meal_ask] \`${args.action}\` exige un segment de plan`,
    );
  }
  if (!needsPlan && plan) {
    throw new Error(
      `[keel/slot_meal_ask] \`${args.action}\` n'accepte pas de segment de plan`,
    );
  }
  const tail = plan
    ? `|${plan.mealId}@${[...plan.dishIndexes].join(",")}`
    : "";
  return `${SLOT_MEAL_BUTTON_PREFIX}${args.action}|${args.localDate}|${args.slot}${tail}`;
}

export interface SlotMealTap {
  action: SlotMealAction;
  localDate: string;
  slot: EatingOccasion;
  /** Présent SI ET SEULEMENT SI l'action est `ate` ou `notplanned`. */
  plan: { mealId: string; dishIndexes: readonly number[] } | null;
}

/** Lit un tap de C1, ou rend `null` — c'est le contrat de tous les lecteurs. */
export function parseSlotMealButton(raw: unknown): SlotMealTap | null {
  const m = SLOT_MEAL_PAYLOAD.exec(String(raw ?? "").trim());
  if (!m) return null;
  const slot = m[3];
  if (!(EATING_OCCASIONS as readonly string[]).includes(slot)) return null;
  const action = m[1] as SlotMealAction;
  const mealId = m[4] ?? null;
  const rawIndexes = m[5] ?? null;

  // ⛔ LES DEUX SENS DU CONTRAT, ET AUCUN N'EST TOLÉRANT.
  const needsPlan = PLAN_BOUND_ACTIONS.has(action);
  if (needsPlan !== Boolean(mealId)) return null;

  let plan: SlotMealTap["plan"] = null;
  if (mealId && rawIndexes) {
    const indexes = rawIndexes.split(",").map((n) => Number(n));
    if (indexes.some((n) => !Number.isInteger(n) || n < 0)) return null;
    // Un doublon d'index cocherait deux fois la même ligne; un tableau vide ne
    // désignerait rien. Ni l'un ni l'autre n'est une charge que la question a
    // pu produire.
    const unique = [...new Set(indexes)];
    if (unique.length === 0 || unique.length !== indexes.length) return null;
    plan = { mealId, dishIndexes: unique };
  }
  return { action, localDate: m[2], slot: slot as EatingOccasion, plan };
}

/** Pourquoi la question ne part pas. Vocabulaire FERMÉ. */
export const SLOT_MEAL_SKIPS = [
  "no_goal",
  /** R4 — `maintenance`: le trou ne change aucun chiffre qui pilote. */
  "goal_not_covered",
  "muted",
  /**
   * ⟳ RENOMMÉ LE 2026-09-08 (`no_eating_out_today`). Le motif ne parle plus
   * du « dehors »: un créneau s'interroge maintenant dès qu'il est DÉCLARÉ
   * dans le rythme ou COMPOSÉ par le plan. « Aucun créneau à interroger »
   * couvre les trois origines; l'ancien nom aurait menti sur deux d'entre
   * elles. Un seul consommateur, vérifié avant de renommer.
   */
  "nothing_to_ask",
  /** Un créneau est marqué, mais son heure n'est pas encore écoulée. */
  "not_elapsed",
  /** L'heure est passée depuis trop longtemps pour une question honnête. */
  "too_late",
  /** La question de ce créneau a déjà été posée aujourd'hui. */
  "already_asked",
  /**
   * ⟳ 2026-09-08 — LA PERSONNE A ÉTEINT LA QUESTION PAR REPAS.
   *
   * ⚠️ DISTINCT DE `muted`, ET C'EST TOUT L'INTÉRÊT. `muted` dit « il a coupé
   * TOUT le proactif »; celui-ci dit « il n'a coupé QUE la question du repas ».
   * Les fondre rendrait invisible, dans le compte-rendu du cron, la seule
   * mesure qui dira si cette boucle coûte plus qu'elle ne rapporte.
   */
  "ask_muted",
  /**
   * ⟳ 2026-09-23 — LE SEUL CRÉNEAU À DEMANDER EST UN CRÉNEAU QUE LE PLAN
   * COMPOSE, et il ne se demande plus ici: le repas prévu est présumé mangé,
   * et la question du soir (`day_meals_ask.ts`) couvre toute la journée.
   */
  "planned_in_evening",
] as const;
export type SlotMealSkip = (typeof SLOT_MEAL_SKIPS)[number];

/**
 * D'OÙ VIENT LA QUESTION — ET IL N'Y A QU'UN SEUL AXE: LE PLAN COUVRE-T-IL CE
 * CRÉNEAU ?
 */
export const SLOT_MEAL_ORIGINS = ["planned", "uncovered"] as const;
export type SlotMealOrigin = (typeof SLOT_MEAL_ORIGINS)[number];

/** Un créneau que le plan COMPOSE aujourd'hui, et ce qu'il y met. */
export interface PlannedSlot {
  readonly slot: EatingOccasion;
  readonly mealId: string;
  /** Les plats de ce créneau qui n'ont PAS encore de coche. */
  readonly dishIndexes: readonly number[];
  /** Le titre à NOMMER dans la question. Jamais vide. */
  readonly title: string;
}

export type SlotMealVerdict =
  | {
    ask: true;
    slot: EatingOccasion;
    elapsedAtHour: number;
    origin: "uncovered";
  }
  | {
    ask: true;
    slot: EatingOccasion;
    elapsedAtHour: number;
    origin: "planned";
    planned: PlannedSlot;
  }
  | { ask: false; reason: SlotMealSkip };

/**
 * La question du créneau part-elle maintenant ?
 *
 * ── L'ORDRE DES PORTES EST LA RÈGLE ─────────────────────────────────────
 * Le mute et l'objectif d'abord: ce sont les deux seules qui se lisent sans
 * toucher au rythme ni au calendrier, et elles retirent l'écrasante majorité
 * des élèves avant tout calcul.
 *
 * ⚠️ PLUSIEURS CRÉNEAUX ÉLIGIBLES ⇒ LE PLUS RÉCENT GAGNE. Une question sur le
 * petit-déjeuner posée à 14h arrive après celle du déjeuner et parle d'un repas
 * dont le souvenir est déjà reconstruit. On ne pose donc jamais deux questions
 * dans le même tick, et l'ancienne est PERDUE plutôt que retardée — c'est
 * l'arbitrage de R2 appliqué à l'intérieur d'un canal.
 */
/**
 * L'INTERRUPTEUR DE LA QUESTION PAR REPAS, RÉDUIT UNE SEULE FOIS.
 *
 * ⛔ C'EST LE SEUL ENDROIT OÙ `profiles.slot_meal_ask_enabled` SE LIT. La
 * colonne est un TRI-ÉTAT et `null` n'est PAS une extinction: un appelant qui
 * écrirait `col === true` refermerait la question à tous ceux que leur objectif
 * devait ouvrir, en silence et sans qu'aucun type ne bronche. C'est mot pour
 * mot l'avertissement de `energy_gate.ts::energySwitchFrom`, et il vaut ici
 * pour la même raison.
 *
 * ⚠️ `false` GAGNE POUR TOUJOURS. Quelqu'un qui éteint puis change d'objectif
 * ne se fait pas rallumer: une extinction est un choix, un objectif est une
 * circonstance, et une circonstance ne révoque pas un choix.
 *
 * ⚠️ ELLE PREND UN OBJECTIF, PAS UNE DIRECTION — contrairement à
 * `energySwitchFrom`. `SLOT_MEAL_GOALS` est la table ÉCRITE de ce canal, et
 * c'est elle qui exclut `maintenance` avec son motif (R4: le trou du midi ne
 * change aucun chiffre qui pilote). Passer par `scaleDirectionOf` ferait une
 * TROISIÈME écriture de « qui compte ».
 *
 * ⚠️ LES DEUX CLÉS SONT REQUISES. `undefined` n'est pas `null`: un paramètre de
 * garde optionnel est une garde désarmée.
 */
export type SlotMealAskSwitchSource =
  | "explicit_on"
  | "explicit_off"
  | "goal"
  | "no_goal";

export function slotMealAskSwitchFrom(args: {
  stored: boolean | null;
  goal: GoalToken | null;
}): { on: boolean; source: SlotMealAskSwitchSource } {
  if (!("stored" in args) || !("goal" in args)) {
    throw new Error(
      "[keel/slot_meal_ask] slotMealAskSwitchFrom: `stored` et `goal` sont " +
        "REQUIS. Un champ omis se lirait comme `undefined`, donc comme " +
        "« personne n'a choisi » — c'est-à-dire comme une garde désarmée.",
    );
  }
  if (args.stored === true) return { on: true, source: "explicit_on" };
  if (args.stored === false) return { on: false, source: "explicit_off" };
  if (!args.goal) return { on: false, source: "no_goal" };
  return { on: SLOT_MEAL_GOALS.has(args.goal), source: "goal" };
}

export function decideSlotMealAsk(args: {
  goal: GoalToken | null;
  muted: boolean;
  /**
   * ⟳ `profiles.slot_meal_ask_enabled`, BRUT. On passe la colonne, pas un
   * booléen déjà réduit: la réduction est au-dessus, et la faire chez
   * l'appelant serait la deuxième écriture de la règle.
   */
  askEnabled: boolean | null;
  localHour: number;
  /**
   * Les créneaux que le PLAN compose aujourd'hui, avec leurs plats non cochés.
   *
   * ⛔ REQUIS, MÊME VIDE. Un champ optionnel se lirait `undefined` chez tout
   * appelant qui l'oublie — c'est-à-dire « le plan ne compose rien », pour
   * toute une flotte, en silence. Un tableau vide est une DÉCLARATION.
   */
  plannedToday: readonly PlannedSlot[];
  /** `eating_rhythm` brut — c'est lui qui porte les heures DÉCLARÉES. */
  rhythmRaw: unknown;
  /** Les créneaux dont la question est DÉJÀ partie aujourd'hui. */
  askedSlotsToday: readonly string[];
}): SlotMealVerdict {
  if (args.muted) return { ask: false, reason: "muted" };
  if (!args.goal) return { ask: false, reason: "no_goal" };
  if (!SLOT_MEAL_GOALS.has(args.goal)) {
    return { ask: false, reason: "goal_not_covered" };
  }
  // ⚠️ APRÈS LES DEUX GARDES D'OBJECTIF, ET PAS AVANT. Un motif `ask_muted`
  // rendu à quelqu'un en `maintenance` dirait « il a éteint » d'une personne
  // qui n'a jamais rien reçu — et le compte-rendu du cron s'en servirait pour
  // conclure que la boucle est refusée alors qu'elle n'a jamais été offerte.
  if (
    !slotMealAskSwitchFrom({ stored: args.askEnabled, goal: args.goal }).on
  ) {
    return { ask: false, reason: "ask_muted" };
  }

  const declaredSlots = new Set<EatingOccasion>();
  for (const r of rhythmClockFrom(args.rhythmRaw)) declaredSlots.add(r.slot);

  // ── LES DEUX SOURCES, DANS CET ORDRE, ET L'ORDRE EST LE CONTRAT ─────────
  type Mark =
    | { origin: "planned"; planned: PlannedSlot }
    | { origin: "uncovered" };
  const marked = new Map<EatingOccasion, Mark>();

  // ① CE QUE LE PLAN COMPOSE. « Tu as mangé le plat prévu ? »
  for (const p of args.plannedToday) {
    if (!(EATING_OCCASIONS as readonly string[]).includes(p.slot)) continue;
    if (p.dishIndexes.length === 0) continue;
    if (String(p.title ?? "").trim() === "") continue;
    marked.set(p.slot, { origin: "planned", planned: p });
  }

  // ② CE QUE LE RYTHME DÉCLARE ET QUE LE PLAN NE COUVRE PAS.
  //
  // ⟳ AJOUTÉ LE 2026-09-08, ET C'EST LE TROU PAR LEQUEL PASSAIENT LES REPAS
  // QU'ON NE COMPTE JAMAIS. Avant, un créneau ne s'interrogeait QUE s'il était
  // explicitement marqué « je mange dehors ». Quelqu'un qui a déclaré déjeuner
  // tous les jours et dont le plan ne compose rien à midi n'était jamais
  // interrogé: ni le plan, ni la question, ni le bilan ne savaient ce qu'il
  // avait mangé.
  for (const slot of declaredSlots) {
    if (marked.has(slot)) continue;
    marked.set(slot, { origin: "uncovered" });
  }

  if (marked.size === 0) return { ask: false, reason: "nothing_to_ask" };

  // ── L'HEURE DÉCLARÉE L'EMPORTE SUR LE REPLI ───────────────────────────
  // Quelqu'un qui a dit déjeuner à 15h n'a pas « raté » son déjeuner à 14h.
  // C'est l'arbitrage déjà écrit dans `plan_hours.ts` et réutilisé par
  // l'inférence de créneau; on ne le rejoue pas, on l'appelle.
  const declared = new Map<EatingOccasion, number | null>();
  for (const r of rhythmClockFrom(args.rhythmRaw)) declared.set(r.slot, r.hour);

  const hour = Number(args.localHour);
  if (!Number.isFinite(hour)) return { ask: false, reason: "not_elapsed" };

  const asked = new Set(
    args.askedSlotsToday.map((s) => String(s ?? "").trim().toLowerCase()),
  );

  let best: { slot: EatingOccasion; at: number; mark: Mark } | null = null;
  let sawFuture = false;
  let sawStale = false;
  let sawAsked = false;
  let sawPlanned = false;
  for (const [slot, mark] of marked) {
    // ⟳ 2026-09-23 — « TU AS MANGÉ LE PLAT PRÉVU ? » NE PART PLUS. Décision du
    // propriétaire: le repas prévu est présumé mangé, et une seule question du
    // soir (`day_meals_ask.ts`) remplace les questions par repas. Le créneau
    // reste MARQUÉ en ① — sans ça, ② le reprendrait comme « non couvert » et
    // demanderait « Rien n'était prévu » sur un repas que le plan compose.
    if (mark.origin === "planned") {
      sawPlanned = true;
      continue;
    }
    // L'heure déclarée si elle existe ET est lisible, sinon le repli. Un
    // `null` déclaré (« je prends un goûter », sans heure) retombe donc sur le
    // repli — et les trois moments sans repli (`snack_am`, `snack_pm`,
    // `before_bed`) ne sont jamais demandés: ce dépôt n'a pas d'heure de
    // référence pour eux, et en inventer une ferait tomber une question sur un
    // moment que rien ne date.
    const at = declared.get(slot) ?? SLOT_PASSED_HOUR[slot];
    if (at === null || at === undefined) continue;
    if (hour < at) {
      sawFuture = true;
      continue;
    }
    if (hour >= at + SLOT_MEAL_GRACE_HOURS) {
      sawStale = true;
      continue;
    }
    if (asked.has(slot)) {
      sawAsked = true;
      continue;
    }
    if (!best || at > best.at) best = { slot, at, mark };
  }

  if (best) {
    return best.mark.origin === "planned"
      ? {
        ask: true,
        slot: best.slot,
        elapsedAtHour: best.at,
        origin: "planned",
        planned: best.mark.planned,
      }
      : {
        ask: true,
        slot: best.slot,
        elapsedAtHour: best.at,
        origin: "uncovered",
      };
  }
  // L'ordre des motifs de refus dit ce qui s'est passé de plus proche d'un
  // envoi: « déjà demandé » est un succès d'hier, « trop tard » un tick perdu,
  // « pas encore » l'attente normale.
  if (sawAsked) return { ask: false, reason: "already_asked" };
  if (sawStale) return { ask: false, reason: "too_late" };
  if (sawFuture) return { ask: false, reason: "not_elapsed" };
  if (sawPlanned) return { ask: false, reason: "planned_in_evening" };
  return { ask: false, reason: "nothing_to_ask" };
}

// ---------------------------------------------------------------------------
// LA QUESTION, EN MOTS
// ---------------------------------------------------------------------------

/**
 * ⚠️ « QU'EST-CE QUE TU AS MANGÉ ? », ET RIEN D'AUTRE.
 *
 * Pas « as-tu bien mangé », pas « as-tu tenu ». Le plan ne compose rien à ce
 * moment-là: il n'y a donc AUCUNE consigne à laquelle cette assiette pourrait
 * être conforme ou non, et une question qui le sous-entendrait demanderait à la
 * personne de se noter contre une règle qui n'existe pas.
 *
 * Et « Passer » est un vrai bouton, pas une sortie honteuse: sans lui, la
 * seule façon de ne pas répondre est d'ignorer — c'est-à-dire de laisser une
 * question armée que R13 désarmera en silence.
 */
const SLOT_MEAL_COPY: Record<LocalePackKey, {
  /** « Rien n'était prévu ce midi — tu as mangé quoi ? » */
  ask: (slot: string) => string;
  /**
   * « Tu as mangé le « X » prévu à midi ? »
   *
   * ⛔ LE PLAT EST NOMMÉ, ET CE N'EST PAS DU CONFORT. Un « Oui » qui coche
   * trois lignes anonymes est une signature en blanc: la personne doit voir ce
   * qu'elle confirme avant de le confirmer.
   */
  askPlanned: (slot: string, dish: string) => string;
  yes: string;
  no: string;
  /** L'accusé du « Oui »: les plats sont cochés. */
  ticked: string;
  /** Le même quand la coche n'a pas pu s'écrire. */
  tickFailed: string;
  slotName: Record<EatingOccasion, string>;
  photo: string;
  describe: string;
  skip: string;
  /**
   * L'accusé de « Passer ». Il ne reproche rien ET NE PRÉTEND RIEN.
   *
   * ⛔ « Passer » N'ÉCRIT AUCUN FAIT, et cette phrase ne doit donc pas dire
   * « c'est noté ». Le circuit de la fiche est explicite: seule « Décrire »
   * mène à `protocol_events`. Écrire un repas que personne n'a décrit serait
   * un fait fabriqué dans la table que le coach lit — et l'accusé qui
   * l'annoncerait serait pire encore, parce qu'il rendrait le mensonge
   * indémentable.
   */
  skipped: string;
  /**
   * L'accusé de « Décrire » quand le fait EST écrit.
   *
   * ⟳ 2026-09-08 — LA PHRASE NOMME LE CHAMP. Elle disait « vas-y, c'était
   * quoi ? », ce qui invitait à taper DANS LE FIL — où la réponse retombait
   * dans la lane libre du modèle, sans créneau et sans écriture. L'écran ouvre
   * maintenant le champ de description au créneau que le jeton nomme; un accusé
   * qui invite ailleurs contredirait ce qui vient de s'afficher.
   */
  describing: string;
  /** Le même, quand l'écriture a échoué: on invite sans prétendre. */
  describingUnwritten: string;
  /** L'accusé de « Photo »: l'écran prend le relais. */
  photoAsked: string;
  /**
   * ⟳ 2026-09-08 — L'ACCUSÉ DU BOUTON QUI ÉTEINT. ⟳ 2026-09-24 — le bouton
   * n'est plus offert; l'accusé sert encore aux bulles déjà envoyées.
   *
   * ⛔ LE LIBELLÉ NE PROMET QUE CE QU'IL FAIT. Pas « arrêter le suivi », pas
   * « ne plus me suivre »: il éteint une QUESTION. Les repas restent cochables,
   * et rien de ce qui est déjà enregistré ne bouge. Un libellé qui promettrait
   * l'arrêt du suivi ferait couper la mesure à quelqu'un qui voulait juste le
   * silence — et il ne le saurait pas.
   *
   * ⟳ COMPLÉTÉ AU LOT B.4. L'accusé taisait le « + » du composeur et la case
   * de profil parce qu'ils N'EXISTAIENT PAS ENCORE: les annoncer aurait envoyé
   * quelqu'un chercher un réglage introuvable, ce qui est la même faute qu'un
   * accusé qui prétend. Les deux existent maintenant, et l'accusé les nomme —
   * c'est ce qui distingue « je me tais » de « j'ai coupé ton suivi ».
   */
  muted: string;
  /** L'extinction n'a PAS pu s'écrire: on ne prétend pas, et on le dit. */
  muteFailed: string;
}> = {
  en: {
    ask: (slot) => `Nothing was planned for ${slot} today — what did you have?`,
    askPlanned: (slot, dish) =>
      `Did you have the "${dish}" planned for ${slot}?`,
    yes: "Yes",
    no: "No",
    ticked: "Ticked off. Tell me if that was not it.",
    tickFailed:
      "I could not tick that off just now — try again in a moment, or tick it on your day.",
    slotName: {
      breakfast: "breakfast",
      snack_am: "your morning snack",
      lunch: "lunch",
      snack_pm: "your afternoon snack",
      dinner: "dinner",
      before_bed: "your evening snack",
    },
    photo: "Photo",
    describe: "Tell you",
    skip: "Skip",
    skipped: "No problem — I will not count it as anything.",
    describing: "Noted. Tell me what it was in the field that just opened.",
    describingUnwritten: "Tell me what it was in the field that just opened.",
    photoAsked: "Send it over whenever you are ready.",
    muted:
      "Turned off. I will not ask about your meals any more, including the evening question — your meals stay tickable on your day, and the “+” next to the message box is still there for a photo, a description or your weight. You can turn it back on with “Notifications” above the conversation.",
    muteFailed:
      "I could not turn that off just now, so the question may come back. Try again, and if it keeps coming back tell me.",
  },
  fr: {
    ask: (slot) => `Rien n'était prévu pour ${slot} aujourd'hui — tu as mangé quoi ?`,
    askPlanned: (slot, dish) =>
      `Tu as mangé le « ${dish} » prévu pour ${slot} ?`,
    yes: "Oui",
    no: "Non",
    ticked: "C'est coché. Dis-moi si ce n'était pas ça.",
    tickFailed:
      "Je n'ai pas réussi à le cocher à l'instant — retente dans un moment, ou coche-le sur ta journée.",
    slotName: {
      breakfast: "le petit-déjeuner",
      snack_am: "ta collation du matin",
      lunch: "le déjeuner",
      snack_pm: "ton goûter",
      dinner: "le dîner",
      before_bed: "ta collation du soir",
    },
    photo: "Photo",
    describe: "Te dire",
    skip: "Passer",
    skipped: "Pas de souci — je ne compte rien.",
    describing: "C'est noté. Dis-moi ce que c'était dans le champ qui vient de s'ouvrir.",
    describingUnwritten: "Dis-moi ce que c'était dans le champ qui vient de s'ouvrir.",
    photoAsked: "Envoie-la-moi quand tu veux.",
    muted:
      "C'est éteint. Je ne te poserai plus de questions sur tes repas, y compris celle du soir — tes repas restent cochables sur ta journée, et le « + » à côté du champ de message reste là pour une photo, une description ou ton poids. Tu peux rallumer avec « Notifications », au-dessus de la conversation.",
    muteFailed:
      "Je n'ai pas réussi à l'éteindre à l'instant, donc la question peut revenir. Retente, et si elle revient quand même dis-le-moi.",
  },
};

export interface SlotMealMessage {
  body: string;
  buttons: Array<{ payload: string; label: string }>;
}

export function renderSlotMealAsk(args: {
  locale: string;
  localDate: string;
  slot: EatingOccasion;
  /**
   * ⟳ REQUIS DEPUIS LE 2026-09-08. Un défaut ferait rendre la question du
   * créneau NON COUVERT sur un créneau que le plan compose — c'est-à-dire
   * demander « tu as mangé quoi ? » à quelqu'un dont on connaît le plat, et
   * perdre la coche que le « Oui » aurait posée.
   */
  origin: SlotMealOrigin;
  /** REQUIS si `origin === "planned"`. */
  planned?: PlannedSlot | null;
}): SlotMealMessage {
  const copy = SLOT_MEAL_COPY[localePackKey(String(args.locale ?? ""))];
  const slotName = copy.slotName[args.slot];

  if (args.origin === "planned") {
    const planned = args.planned ?? null;
    if (!planned) {
      throw new Error(
        "[keel/slot_meal_ask] renderSlotMealAsk: `planned` est REQUIS quand " +
          "l'origine est `planned`. Sans lui la question ne peut NOMMER ni le " +
          "plat ni les lignes que le « Oui » cocherait.",
      );
    }
    const plan = { mealId: planned.mealId, dishIndexes: planned.dishIndexes };
    const mkPlan = (action: SlotMealAction) =>
      slotMealButtonId({
        action,
        localDate: args.localDate,
        slot: args.slot,
        plan,
      });
    return {
      body: copy.askPlanned(slotName, planned.title),
      buttons: [
        { payload: mkPlan("ate"), label: copy.yes },
        { payload: mkPlan("notplanned"), label: copy.no },
      ],
    };
  }

  const mk = (action: SlotMealAction) =>
    slotMealButtonId({ action, localDate: args.localDate, slot: args.slot });
  return {
    body: copy.ask(slotName),
    buttons: [
      { payload: mk("photo"), label: copy.photo },
      { payload: mk("describe"), label: copy.describe },
      { payload: mk("skip"), label: copy.skip },
      // ⟳ 2026-09-24 — PAS DE BOUTON D'EXTINCTION: voir `SLOT_MEAL_ACTIONS`.
    ],
  };
}

export function renderSlotMealAck(args: {
  locale: string;
  action: SlotMealAction;
  /** `false` quand rien n'a pu être écrit: l'accusé ne prétend alors pas. */
  written: boolean;
}): string {
  const copy = SLOT_MEAL_COPY[localePackKey(String(args.locale ?? ""))];
  switch (args.action) {
    case "skip":
      // Inconditionnel: rien n'a été écrit, donc `written` n'a rien à dire ici.
      return copy.skipped;
    case "describe":
      // ⚠️ DEUX PHRASES, ET LA DIFFÉRENCE EST UN FAIT. « C'est noté » affirme
      // qu'une ligne existe; quand l'écriture a échoué, l'invitation reste et
      // l'affirmation tombe. Un accusé qui prétend est la faute que ce dépôt
      // nomme `phantom_commit`, et elle est indétectable par la personne.
      return args.written ? copy.describing : copy.describingUnwritten;
    case "photo":
      return copy.photoAsked;
    case "mute":
      // ⚠️ `written` DIT ICI SI L'EXTINCTION EST EN BASE. Un accusé « c'est
      // éteint » sur une écriture ratée est un `phantom_commit`: la personne
      // recevrait la question suivante en croyant l'avoir coupée, ce qui est
      // pire que ne pas offrir le bouton.
      return args.written ? copy.muted : copy.muteFailed;
    case "ate":
      // ⚠️ `written` DIT SI LA COCHE EST EN BASE. « C'est coché » sur une
      // écriture ratée est un `phantom_commit`: la personne croirait son repas
      // compté, et le bilan dirait l'inverse sans que personne fasse le lien.
      return args.written ? copy.ticked : copy.tickFailed;
    case "notplanned":
      // ⛔ CE CAS N'A PAS D'ACCUSÉ, ET IL JETTE PLUTÔT QUE D'EN INVENTER UN.
      //
      // « Non » n'est pas une fin: c'est le début de « alors tu as mangé
      // quoi ? ». Le routeur doit enchaîner un `renderSlotMealAsk` complet, en
      // `origin: "uncovered"` — avec ses trois boutons, et surtout avec SON
      // créneau. Une phrase rendue ici ne pourrait pas nommer le bon moment:
      // cette fonction ne reçoit pas le créneau, et le premier jet de ce lot a
      // effectivement codé « lunch » en dur.
      //
      // Jeter est le bon comportement: un routeur qui oublie l'enchaînement
      // s'en aperçoit au premier tap, pas six semaines plus tard sur une
      // conversation qui s'arrête juste avant ce qu'on cherchait à savoir.
      throw new Error(
        "[keel/slot_meal_ask] `notplanned` n'a pas d'accusé: enchaîne " +
          "`renderSlotMealAsk({ origin: \"uncovered\", slot })`.",
      );
  }
}

export const SLOT_MEAL_COPY_PACKS = Object.freeze(SLOT_MEAL_COPY);
