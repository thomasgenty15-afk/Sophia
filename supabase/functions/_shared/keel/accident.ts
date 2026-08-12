/**
 * FF-057 — LA PROCÉDURE ACCIDENT. Ce que le plan répond quand la vraie vie
 * le percute. PUR.
 *
 * Autorité produit: docs/fonctionnalites/composition-des-repas/FF-057-la-procedure-accident.md
 *
 * ── LE DÉFAUT PRODUIT QUE CE MODULE CORRIGE ─────────────────────────────────
 * La décoche existe (`meal_tick.ts`), le hors-plan est capté (FF-009), l'état de
 * vague est écrit (FF-058) — et personne ne répond à « et maintenant, qu'est-ce
 * que ça change pour la suite ? ». Pire: une session de cuisine sautée fait
 * disparaître trois ou quatre repas du réel, et le plan continue de les
 * afficher. C'est le mode d'échec structurel de la catégorie: le plan meurt au
 * premier contact avec la vraie vie, et on cesse d'ouvrir l'app.
 *
 * ── R1 GOUVERNE TOUT LE FICHIER: PLAT SAUTÉ ≠ SESSION SAUTÉE ───────────────
 * Un plat sauté DÉCALE (la nourriture existe peut-être encore). Une session
 * sautée SUPPRIME des repas du réel. Les confondre laisse le plan annoncer des
 * plats qui n'ont jamais été cuisinés — et rien ne lève d'erreur.
 *
 * ── OÙ VIT LE MARQUEUR DE SESSION, ET POURQUOI (fiche §11) ─────────────────
 * DANS UNE TABLE À PART (`cooking_session_states`), PAS dans le payload du plan.
 * La fiche laisse le choix « au plus simple »; le plus simple ici n'est pas le
 * plus court à écrire, c'est celui qui ne fabrique pas de course:
 *
 *   · une colonne `jsonb` sur `student_generated_meals` forcerait une
 *     lecture-modification-écriture COMPLÈTE de la ligne du plan pour changer un
 *     booléen — exactement la course que `user_chat_states.temp_memory` fait
 *     déjà payer à ce dépôt (deux écrivains, le dernier gagne, sans qu'on l'ait
 *     voulu). Et la ligne du plan est partagée par le foyer;
 *   · le glissement, lui, DOIT réécrire le payload (il déplace des dates). Deux
 *     écrivains sur la même ligne dont l'un ne touche qu'un drapeau est le pire
 *     agencement possible: le drapeau se perdrait sous le glissement;
 *   · la table donne un point d'accrochage RLS et un `on delete cascade`
 *     gratuits, et elle est le JUMEAU EXACT de `grocery_wave_states` (FF-058) —
 *     même clé (personne, plan, date), même « l'absence de ligne EST inconnu »,
 *     même « dernière réponse gagne ». Un lecteur qui sait lire l'une sait lire
 *     l'autre.
 *
 * ⚠️ LA CLÉ EST UNE DATE CALENDAIRE, PAS UN JETON DE JOUR. Un jeton (`sun`)
 * cesse de désigner la même chose dès que le glissement déplace la session. La
 * date, elle, reste vraie: « la cuisson du 10 août n'a pas eu lieu » est un fait
 * qui survit au glissement — et la NOUVELLE date n'a simplement aucune ligne,
 * c'est-à-dire « on ne sait pas ». Même sémantique que `grocery_wave_states`.
 *
 * ── CE QUE LA CASCADE NE FAIT PAS: ELLE N'ÉCRIT RIEN ───────────────────────
 * Le fait stocké est LE MARQUEUR DE SESSION, un seul. Quels repas en tombent se
 * DÉRIVE à la lecture, ici, par `cascadeSkippedSession`. C'est la doctrine que
 * `grocery_waves.ts` énonce déjà (« les vagues se calculent à la lecture, elles
 * ne se stockent pas »): un second état à invalider est un état dont l'écrivain
 * finit par disparaître, et ce dépôt paie cette faute en boucle.
 *
 * ── V3 EST FERMÉ, ET CE MODULE NE PEUT PAS L'OUVRIR ───────────────────────
 * Aucune fonction d'ici ne choisit un plat, ne retouche une quantité, ni
 * n'appelle un modèle — il n'y a aucun appel réseau dans ce fichier, et c'est
 * vérifiable à la lecture. Un glissement DÉPLACE DES DATES. C'est ce qui le rend
 * sûr, donc c'est ce qui se vérifie (R13), pas ce qui se suppose.
 *
 * PURE MODULE: ni base, ni horloge, ni aléatoire. L'I/O vit dans `accident_io.ts`.
 */

import { findQualifyingVerdict } from "./daily_recap.ts";
import {
  type ForbiddenTerm,
  findForbiddenMatches,
} from "./forbidden_matcher.ts";
import {
  MAX_FRIDGE_DAYS,
  PERISHABLE_AISLES,
  planGroceryWaves,
  type WaveItem,
} from "./grocery_waves.ts";
import { mealTickKey, parseMealTickKey } from "./meal_tick.ts";
import {
  addDays,
  dayTokenOf,
  planEndsOn,
  windowDates,
} from "./meal_plan_window.ts";

// ---------------------------------------------------------------------------
// LE VOCABULAIRE DES IDENTIFIANTS
// ---------------------------------------------------------------------------

/**
 * Le préfixe de tous les identifiants de cette fiche.
 *
 * DISJOINT de `KEEL_PULSE_`, `KEEL_RECO_` et `KEEL_STRIP_`: chaque lecteur rend
 * « rien » sur ce qui ne le concerne pas, donc l'ordre de lecture dans
 * `deterministic_buttons.ts` est sans conséquence. Un test le pinne.
 */
export const ACCIDENT_BUTTON_PREFIX = "KEEL_FIX_";

/**
 * `|` et pas `:`, pour la même raison que `evening_strip.ts`: la charge CONTIENT
 * une clé de coche, qui est elle-même faite de `:`. Un séparateur unique
 * obligerait à compter les segments — c'est-à-dire à deviner.
 */
const SEP = "|";

export const ACCIDENT_KIND = {
  /** « J'ai commandé / mangé dehors » — décoche + fait `off_plan` + photo. */
  ordered: "KEEL_FIX_ORDERED",
  /** « Pas eu le temps » — décoche seule; la nourriture existe peut-être. */
  noTime: "KEEL_FIX_NO_TIME",
  /** « J'ai mangé autre chose » — décoche + `off_plan`, AUCUN aliment inventé. */
  ateOther: "KEEL_FIX_ATE_OTHER",
  /** La session de cuisine a eu lieu. */
  sessionYes: "KEEL_FIX_SESSION_YES",
  /** La session de cuisine n'a pas eu lieu ⇒ cascade. */
  sessionNo: "KEEL_FIX_SESSION_NO",
  /** « Oui » au glissement proposé. */
  shiftYes: "KEEL_FIX_SHIFT_YES",
  /** « Non, je gère ». Rien ne change, et rien ne revient. */
  shiftNo: "KEEL_FIX_SHIFT_NO",
} as const;

export interface AccidentButton {
  id: string;
  title: string;
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ⚠️ LES TROIS BOUTONS DU FORMULAIRE, ET PAS UN QUATRIÈME (fiche §9).
 *
 * « Le formulaire qui devient un questionnaire »: un quatrième cas se traite par
 * « j'ai mangé autre chose », jamais par une branche neuve. Le littéral est gelé
 * ici pour qu'ajouter une branche soit une décision écrite, pas un réglage.
 */
export const ACCIDENT_FORM_KINDS = [
  ACCIDENT_KIND.ordered,
  ACCIDENT_KIND.noTime,
  ACCIDENT_KIND.ateOther,
] as const;

export function accidentFormId(
  kind: (typeof ACCIDENT_FORM_KINDS)[number],
  mealId: string,
  dishIndex: number,
): string {
  return `${kind}${SEP}${mealTickKey(mealId, dishIndex)}`;
}

export function accidentSessionId(
  happened: boolean,
  mealId: string,
  cookOn: string,
): string {
  const id = String(mealId ?? "").trim();
  if (!id) throw new Error("[keel/accident] empty meal id");
  if (!CALENDAR_DATE.test(String(cookOn ?? ""))) {
    throw new Error(`[keel/accident] "${cookOn}" is not a calendar date`);
  }
  return [
    happened ? ACCIDENT_KIND.sessionYes : ACCIDENT_KIND.sessionNo,
    id,
    cookOn,
  ].join(SEP);
}

/**
 * `Oui` au glissement. La charge porte le DELTA et l'EMPREINTE du plan.
 *
 * ── POURQUOI L'EMPREINTE VOYAGE DANS LA CHARGE (R7, et le double tap) ──────
 * Il n'y a AUCUNE table de proposition pour cette fiche, et c'est délibéré: la
 * proposition est une réponse à un tap, elle vit le temps d'un échange, et une
 * ligne d'état de plus serait un état à expirer — donc un écrivain de plus à
 * perdre. L'empreinte fait à elle seule les deux gardes que la ligne aurait
 * portées:
 *
 *   · R7 — le plan a changé entre la proposition et le tap ⇒ l'empreinte
 *     recalculée ne correspond plus, l'action ne s'applique pas, et la personne
 *     le sait en une phrase;
 *   · LE DOUBLE TAP — le premier glissement CHANGE les dates, donc change
 *     l'empreinte. Le second tap sur la même bulle est périmé par construction.
 *     Aucun verrou applicatif, aucune ligne à réclamer.
 *
 * L'empreinte n'est pas un secret: elle ne protège pas contre la forge, elle
 * détecte le changement. Ce qui protège contre la forge est le `.eq("user_id")`
 * du chargeur, comme partout ailleurs.
 */
export function accidentShiftId(args: {
  mealId: string;
  cookOn: string;
  delta: number;
  fingerprint: string;
}): string {
  const id = String(args.mealId ?? "").trim();
  if (!id) throw new Error("[keel/accident] empty meal id");
  if (!CALENDAR_DATE.test(String(args.cookOn ?? ""))) {
    throw new Error(`[keel/accident] "${args.cookOn}" is not a calendar date`);
  }
  if (!Number.isInteger(args.delta) || args.delta < 1) {
    throw new Error(`[keel/accident] bad shift delta ${args.delta}`);
  }
  const fp = String(args.fingerprint ?? "").trim();
  if (!fp) throw new Error("[keel/accident] empty fingerprint");
  return [ACCIDENT_KIND.shiftYes, id, args.cookOn, String(args.delta), fp].join(
    SEP,
  );
}

export function accidentShiftDeclineId(mealId: string, cookOn: string): string {
  const id = String(mealId ?? "").trim();
  if (!id) throw new Error("[keel/accident] empty meal id");
  if (!CALENDAR_DATE.test(String(cookOn ?? ""))) {
    throw new Error(`[keel/accident] "${cookOn}" is not a calendar date`);
  }
  return [ACCIDENT_KIND.shiftNo, id, cookOn].join(SEP);
}

// ---------------------------------------------------------------------------
// RELIRE UN TAP — déterministe, et il ne devine jamais
// ---------------------------------------------------------------------------

export type AccidentReply =
  | { kind: "ordered"; mealId: string; dishIndex: number }
  | { kind: "no_time"; mealId: string; dishIndex: number }
  | { kind: "ate_other"; mealId: string; dishIndex: number }
  | { kind: "session"; happened: boolean; mealId: string; cookOn: string }
  | {
    kind: "shift_accept";
    mealId: string;
    cookOn: string;
    delta: number;
    fingerprint: string;
  }
  | { kind: "shift_decline"; mealId: string; cookOn: string }
  | { kind: "none" };

const NONE: AccidentReply = { kind: "none" };

/**
 * Interprète un `button_payload`. Rend `{kind:"none"}` sur tout ce qui n'est pas
 * exactement une charge de cette fiche — jamais une supposition.
 *
 * Aucun repli sur le texte libre: « oui » tapé à la main peut vouloir dire la
 * réponse au bouton comme n'importe quoi d'autre, et un glissement de dates
 * n'est pas quelque chose qu'on déclenche sur une ambiguïté.
 */
export function readAccidentReply(
  payload: string | null | undefined,
): AccidentReply {
  const raw = String(payload ?? "").trim();
  if (!raw.startsWith(ACCIDENT_BUTTON_PREFIX)) return NONE;

  const at = raw.indexOf(SEP);
  if (at <= 0) return NONE;
  const kind = raw.slice(0, at);
  const rest = raw.slice(at + 1);

  if (
    kind === ACCIDENT_KIND.ordered ||
    kind === ACCIDENT_KIND.noTime ||
    kind === ACCIDENT_KIND.ateOther
  ) {
    const parsed = parseMealTickKey(rest);
    if (!parsed) return NONE;
    return {
      kind: kind === ACCIDENT_KIND.ordered
        ? "ordered"
        : kind === ACCIDENT_KIND.noTime
        ? "no_time"
        : "ate_other",
      mealId: parsed.mealId,
      dishIndex: parsed.dishIndex,
    };
  }

  if (
    kind === ACCIDENT_KIND.sessionYes ||
    kind === ACCIDENT_KIND.sessionNo ||
    kind === ACCIDENT_KIND.shiftNo
  ) {
    const cut = rest.lastIndexOf(SEP);
    if (cut <= 0) return NONE;
    const mealId = rest.slice(0, cut);
    const cookOn = rest.slice(cut + 1);
    if (!mealId || !CALENDAR_DATE.test(cookOn)) return NONE;
    if (kind === ACCIDENT_KIND.shiftNo) {
      return { kind: "shift_decline", mealId, cookOn };
    }
    return {
      kind: "session",
      happened: kind === ACCIDENT_KIND.sessionYes,
      mealId,
      cookOn,
    };
  }

  if (kind === ACCIDENT_KIND.shiftYes) {
    // `<mealId>|<cookOn>|<delta>|<fingerprint>` — l'empreinte est en QUEUE et
    // ne contient pas de `|` (voir `planShiftFingerprint`), le `mealId` est un
    // uuid. On découpe donc par la fin, sur trois séparateurs exactement.
    const parts = rest.split(SEP);
    if (parts.length !== 4) return NONE;
    const [mealId, cookOn, deltaRaw, fingerprint] = parts;
    if (!mealId || !CALENDAR_DATE.test(cookOn)) return NONE;
    // ⚠️ `Number("")` vaut 0 et `Number.isInteger(0)` vaut `true`. Sans ce refus
    // explicite une charge tronquée se relirait comme « décale de 0 jour »,
    // c'est-à-dire comme une réécriture du plan sans effet mais bien réelle.
    if (!/^\d+$/.test(deltaRaw)) return NONE;
    const delta = Number(deltaRaw);
    if (!Number.isInteger(delta) || delta < 1) return NONE;
    if (!fingerprint) return NONE;
    return { kind: "shift_accept", mealId, cookOn, delta, fingerprint };
  }

  return NONE;
}

// ---------------------------------------------------------------------------
// LE PLAN, RÉDUIT À CE DONT CETTE FICHE A BESOIN
// ---------------------------------------------------------------------------

export interface AccidentDish {
  /** L'INDEX D'ORIGINE. C'est lui qui identifie la coche — positionnel. */
  dishIndex: number;
  /** Jeton `mon`..`sun`, ou `null`. */
  day: string | null;
  slot: string | null;
  title: string;
  /** Les préparations que ce plat CONSOMME (`uses[].preparation_id`). */
  preparationIds: string[];
}

export interface AccidentPreparation {
  id: string;
  title: string;
  /** Jeton `mon`..`sun`, ou `null` quand aucune session ne l'a fixée. */
  cookOn: string | null;
  ingredientTerms: string[];
}

export interface AccidentSession {
  /** Jeton `mon`..`sun`. */
  day: string;
  preparationIds: string[];
}

export interface AccidentPlan {
  mealId: string;
  startsOn: string;
  durationDays: number;
  dishes: AccidentDish[];
  preparations: AccidentPreparation[];
  sessions: AccidentSession[];
  shoppingList: WaveItem[];
}

/** La ligne `student_generated_meals`, réduite. Aucune règle ici, une forme. */
export function parseAccidentPlan(
  mealId: string,
  row: Record<string, unknown>,
): AccidentPlan | null {
  const startsOn = String(row.starts_on ?? "");
  if (!CALENDAR_DATE.test(startsOn)) return null;
  const durationDays = Number(row.duration_days) || 7;

  const rawDishes = Array.isArray(row.dishes)
    ? (row.dishes as Array<Record<string, unknown>>)
    : [];
  const dishes: AccidentDish[] = rawDishes.map((d, dishIndex) => ({
    dishIndex,
    day: String(d?.day ?? "").trim() || null,
    slot: String(d?.slot ?? "").trim() || null,
    title: String(d?.title ?? "").trim(),
    preparationIds: (Array.isArray(d?.uses) ? d.uses : [])
      .map((u: unknown) =>
        String((u as Record<string, unknown>)?.preparation_id ?? "").trim()
      )
      .filter((id: string) => id.length > 0),
  }));

  const rawPreps = Array.isArray(row.preparations)
    ? (row.preparations as Array<Record<string, unknown>>)
    : [];
  const preparations: AccidentPreparation[] = rawPreps.map((p) => ({
    id: String(p?.id ?? "").trim(),
    title: String(p?.title ?? "").trim(),
    cookOn: String(p?.cook_on ?? "").trim() || null,
    ingredientTerms: (Array.isArray(p?.ingredients) ? p.ingredients : [])
      .map((i: unknown) =>
        String((i as Record<string, unknown>)?.term ?? "").trim()
      )
      .filter((t: string) => t.length > 0),
  })).filter((p) => p.id.length > 0);

  const rawSessions = Array.isArray(row.cooking_sessions)
    ? (row.cooking_sessions as Array<Record<string, unknown>>)
    : [];
  const sessions: AccidentSession[] = rawSessions.map((s) => ({
    day: String(s?.day ?? "").trim(),
    preparationIds: (Array.isArray(s?.preparation_ids) ? s.preparation_ids : [])
      .map((v: unknown) => String(v ?? "").trim())
      .filter((v: string) => v.length > 0),
  })).filter((s) => s.day.length > 0);

  const shoppingList: WaveItem[] = (Array.isArray(row.shopping_list)
    ? (row.shopping_list as Array<Record<string, unknown>>)
    : []).map((i) => ({
      term: String(i?.term ?? ""),
      aisle: String(i?.aisle ?? ""),
    }));

  return {
    mealId,
    startsOn,
    durationDays,
    dishes,
    preparations,
    sessions,
    shoppingList,
  };
}

/** La date de chaque jeton de la fenêtre. Une seule définition, celle du dépôt. */
export function planDates(plan: AccidentPlan): Record<string, string> {
  return windowDates(plan.startsOn, plan.durationDays);
}

/** La date d'un plat, ou `null` s'il ne nomme aucun jour de la fenêtre. */
export function dishDate(
  plan: AccidentPlan,
  dish: AccidentDish,
  dates?: Record<string, string>,
): string | null {
  if (!dish.day) return null;
  return (dates ?? planDates(plan))[dish.day] ?? null;
}

/** La date d'une session, ou `null` si son jeton sort de la fenêtre. */
export function sessionDate(
  plan: AccidentPlan,
  session: AccidentSession,
  dates?: Record<string, string>,
): string | null {
  return (dates ?? planDates(plan))[session.day] ?? null;
}

/** La session dont la date est celle-ci, ou `null`. */
export function sessionOnDate(
  plan: AccidentPlan,
  cookOn: string,
): AccidentSession | null {
  const dates = planDates(plan);
  return plan.sessions.find((s) => dates[s.day] === cookOn) ?? null;
}

// ---------------------------------------------------------------------------
// L'EMPREINTE — ce qui rend une proposition périssable (R7)
// ---------------------------------------------------------------------------

/**
 * L'EMPREINTE DU PLAN, sur ce dont le GLISSEMENT dépend et rien d'autre.
 *
 * ── CE QUI Y ENTRE, ET POURQUOI CE N'EST PAS LE MÊME CHOIX QUE FF-028 ──────
 * `planFingerprint` (FF-028) exclut délibérément le CONTENU du plan: son action
 * ne dépend que du rythme, et y mettre les plats ferait de « la proposition a
 * expiré » le cas nominal. Ici c'est l'inverse exact: un glissement DÉPLACE des
 * dates, donc il dépend de toutes les dates, et de rien d'autre. Une proposition
 * calculée sur des dates qui ont bougé est un bug, pas une commodité.
 *
 * On y met donc: la fenêtre, le jour de chaque plat (dans l'ordre des INDEX, qui
 * sont les clés de coche), le jour de cuisson de chaque préparation, et le jour
 * de chaque session. On n'y met PAS les titres ni les ingrédients: un plat
 * renommé ne change rien à un déplacement de dates, et le faire périmer une
 * proposition serait une garde qui mord toujours.
 *
 * Lisible en clair, comme celle de FF-058/FF-028: un hash serait plus court et
 * illisible en incident. Aucun `|` n'y apparaît — c'est ce qui autorise
 * `readAccidentReply` à découper la charge sans compter.
 */
export function planShiftFingerprint(plan: AccidentPlan): string {
  const days = plan.dishes
    .map((d) => `${d.dishIndex}:${d.day ?? "-"}`)
    .join(",");
  const cooks = [...plan.preparations]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => `${p.id}:${p.cookOn ?? "-"}`)
    .join(",");
  const sessions = [...plan.sessions]
    .map((s) => s.day)
    .sort()
    .join(",");
  return `w=${plan.startsOn}+${plan.durationDays};d=${days};p=${cooks};s=${sessions}`;
}

// ---------------------------------------------------------------------------
// LA CASCADE — R2: EXACTEMENT les repas de la session, et pas un de plus
// ---------------------------------------------------------------------------

export interface SessionCascade {
  /** Le jeton de la session trouvée, ou `null` si cette date n'en porte pas. */
  sessionDay: string | null;
  /** Les préparations de cette session, résolues contre le plan. */
  preparationIds: string[];
  /**
   * Les plats qui ne sont PLUS disponibles. Index d'origine, triés.
   * Vides quand la session n'existe pas — on n'invalide jamais par défaut.
   */
  invalidatedDishIndexes: number[];
  /**
   * Les plats qui dépendaient de la session mais qui ont une COCHE VIVANTE.
   * ⚠️ ILS SURVIVENT (§7): on croit le fait, pas la déclaration de session.
   */
  survivingTickedIndexes: number[];
  /** Les plats écartés parce qu'ils se mangeaient AVANT la cuisson. */
  beforeCookIndexes: number[];
}

/**
 * QUELS REPAS TOMBENT QUAND UNE SESSION N'A PAS EU LIEU.
 *
 * ── LA RÈGLE, EN QUATRE CONDITIONS QUI DOIVENT TOUTES TENIR ────────────────
 * Un plat est invalidé si, et seulement si:
 *   1. il CONSOMME une préparation de cette session (`uses[].preparation_id`) —
 *      pas « il est le même jour », pas « il est après ». Le lien est celui que
 *      le générateur a écrit, et c'est le seul qui dise la dépendance;
 *   2. il a une date dans la fenêtre (un plat sans jour ne se rattache à aucune
 *      journée, donc à aucune conséquence datée);
 *   3. sa date est >= la date de la session. Un plat mangé AVANT la cuisson ne
 *      pouvait pas en dépendre — le générateur signale d'ailleurs ce cas comme
 *      une anomalie (`eats from … -- after the meal`). L'invalider serait
 *      réécrire un repas déjà passé;
 *   4. il n'a AUCUNE coche vivante. §7: « on croit la coche (un fait) plutôt que
 *      la déclaration de session ». Quelqu'un a mangé ce plat ⇒ la préparation
 *      existait ⇒ la déclaration est partiellement fausse, et c'est le FAIT qui
 *      gagne.
 *
 * ── TROP LARGE ET TROP ÉTROIT COÛTENT DES CHOSES DIFFÉRENTES ──────────────
 * Trop large: on efface une semaine correcte, et la personne perd confiance dans
 * un plan qui se vide tout seul. Trop étroit: le plan continue de mentir, ce qui
 * est le défaut d'origine de la fiche. La condition n°1 (le lien écrit) est ce
 * qui borne les deux — on ne devine JAMAIS une dépendance par la proximité des
 * dates.
 *
 * @param tickedDishIndexes les index dont une coche est VIVANTE
 *   (`disqualified_reason is null`). REQUIS: l'omettre invaliderait un repas
 *   déjà mangé, ce qui est le défaut nommé au §9 de la fiche.
 */
export function cascadeSkippedSession(args: {
  plan: AccidentPlan;
  cookOn: string;
  tickedDishIndexes: readonly number[];
}): SessionCascade {
  const { plan, cookOn } = args;
  const dates = planDates(plan);
  const session = plan.sessions.find((s) => dates[s.day] === cookOn) ?? null;
  if (!session) {
    return {
      sessionDay: null,
      preparationIds: [],
      invalidatedDishIndexes: [],
      survivingTickedIndexes: [],
      beforeCookIndexes: [],
    };
  }

  const known = new Set(plan.preparations.map((p) => p.id));
  const prepIds = session.preparationIds.filter((id) => known.has(id));
  const inSession = new Set(prepIds);
  const ticked = new Set(args.tickedDishIndexes);

  const invalidated: number[] = [];
  const surviving: number[] = [];
  const beforeCook: number[] = [];

  for (const dish of plan.dishes) {
    if (!dish.preparationIds.some((id) => inSession.has(id))) continue;
    const date = dishDate(plan, dish, dates);
    if (!date) continue;
    if (date < cookOn) {
      beforeCook.push(dish.dishIndex);
      continue;
    }
    if (ticked.has(dish.dishIndex)) {
      surviving.push(dish.dishIndex);
      continue;
    }
    invalidated.push(dish.dishIndex);
  }

  return {
    sessionDay: session.day,
    preparationIds: prepIds,
    invalidatedDishIndexes: invalidated.sort((a, b) => a - b),
    survivingTickedIndexes: surviving.sort((a, b) => a - b),
    beforeCookIndexes: beforeCook.sort((a, b) => a - b),
  };
}

// ---------------------------------------------------------------------------
// LE GLISSEMENT — R13/R14: on déplace des dates, et on refuse avec un motif
// ---------------------------------------------------------------------------

/** Les trois motifs de refus. LISTE FERMÉE — la fiche en donne trois (R14). */
export const SHIFT_REFUSALS = [
  /** Un périssable déjà acheté ne tiendrait pas jusqu'à la nouvelle cuisson. */
  "perishables_at_risk",
  /** Le décalage pousserait un repas au-delà d'`ends_on`. */
  "outside_plan_window",
  /** Une préparation de cette session existe déjà. On ne décale pas ce qui est. */
  "already_cooked",
  /** Cette date ne porte aucune session — il n'y a rien à décaler. */
  "no_session",
] as const;
export type ShiftRefusal = (typeof SHIFT_REFUSALS)[number];

/** Une vague de courses DÉJÀ FAITE, avec sa date d'achat RÉELLE. */
export interface DoneWave {
  /** Le `buyOn` théorique — celui qui identifie la vague. */
  buyOn: string;
  /**
   * ⚠️ LA DATE D'ACHAT RÉELLE, jamais le `buyOn` théorique.
   *
   * C'est le piège le plus coûteux de la fiche (§9): quelqu'un qui a fait la
   * vague de lundi le SAMEDI d'avant a du poulet au frigo depuis samedi. Compter
   * depuis lundi donnerait deux jours de marge qui n'existent pas — rien
   * n'échoue, rien ne lève, et on trouve du poulet gâté trois jours plus tard.
   * `grocery_wave_states.answered_local_date` porte cette date.
   */
  purchasedOn: string;
  /**
   * LES TERMES PÉRISSABLES que cette vague a rapportés (`PERISHABLE_AISLES`).
   *
   * ⚠️ LES TERMES, PAS UN BOOLÉEN — ET C'EST UN DÉFAUT CORRIGÉ APRÈS MESURE.
   * La première version portait `carriesPerishable: boolean`, et la règle
   * refusait le glissement dès qu'une vague faite portait du frais et que la
   * NOUVELLE date de cuisson tombait après son achat. C'est trop large: le frais
   * acheté pour la cuisson de MARDI, qui ne bouge pas, n'a rien à voir avec le
   * glissement de la cuisson de VENDREDI. Le produit aurait refusé des
   * glissements parfaitement sûrs, avec un motif faux, et une garde qui mord à
   * tort est une garde qu'on débranche dans la semaine.
   *
   * Avec les termes, on sait QUELLE cuisson chaque aliment attend, et donc
   * lesquelles bougent. Voir `planSessionShift`.
   */
  perishableTerms: string[];
}

export interface ShiftPlan {
  ok: true;
  /** De combien de jours. Le plus petit VIABLE. */
  delta: number;
  /** La nouvelle date de cuisson. */
  newCookOn: string;
  /** Le jeton correspondant. */
  newCookDay: string;
  /** Les plats qui glissent avec elle, index d'origine. */
  movedDishIndexes: number[];
  /** La nouvelle date d'achat de la vague qui sert cette cuisson, ou `null`. */
  newBuyOn: string | null;
  /**
   * Deux plats atterriraient le même jour, dans le même créneau. Le glissement
   * reste VIABLE — c'est une préférence de choix du delta, jamais un refus.
   */
  collides: boolean;
}

export interface ShiftRefused {
  ok: false;
  reason: ShiftRefusal;
  detail: string;
}

export type ShiftOutcome = ShiftPlan | ShiftRefused;

/**
 * LE PLUS PETIT DÉCALAGE VIABLE, CALCULÉ — jamais demandé (R11).
 *
 * ── LA RÈGLE DU « PLUS PETIT VIABLE » QUE CE MODULE APPLIQUE ───────────────
 * On essaie +1, +2, … jusqu'au bout de la fenêtre, et on prend le PREMIER delta
 * qui passe les trois motifs. À viabilité égale, un delta sans collision
 * (deux plats du même créneau le même jour) est préféré à un delta qui en
 * produit une — mais une collision ne REFUSE jamais: le plan affiché doit dire
 * la vérité, et « deux dîners mercredi » reste vrai quand c'est ce qui se passe.
 * La fiche §11 laisse « +1 quand c'est possible » comme pari de départ; c'est
 * exactement ce que fait la boucle, la préférence anti-collision n'agissant que
 * lorsque deux deltas sont tous deux viables.
 *
 * ── CE QUI GLISSE, ET AVEC QUEL DELTA ─────────────────────────────────────
 * La session, les préparations qu'elle cuit, ET les plats qui les consomment —
 * TOUS du MÊME delta. Conserver l'écart cuisson→repas est ce qui garantit que la
 * fenêtre frigo reste satisfaite après le glissement, par construction et pas
 * par une seconde vérification. Un delta différent par plat rouvrirait la porte
 * à un lot gardé un jour de trop.
 *
 * @param maxFridgeDays REQUIS, et passé plutôt que lu. C'est ce qui rend
 *   `perishables_at_risk` éprouvable: un test paramétré par sa propre constante
 *   reste vert quand la constante change.
 */
export function planSessionShift(args: {
  plan: AccidentPlan;
  cookOn: string;
  doneWaves: readonly DoneWave[];
  /** Les préparations dont on a la PREUVE qu'elles ont été cuisinées. */
  cookedPreparationIds: readonly string[];
  maxFridgeDays: number;
}): ShiftOutcome {
  const { plan, cookOn } = args;
  const dates = planDates(plan);
  const session = plan.sessions.find((s) => dates[s.day] === cookOn) ?? null;
  if (!session) {
    return {
      ok: false,
      reason: "no_session",
      detail: `no cooking session on ${cookOn}`,
    };
  }

  const known = new Set(plan.preparations.map((p) => p.id));
  const prepIds = session.preparationIds.filter((id) => known.has(id));
  const inSession = new Set(prepIds);

  // ── `already_cooked` — ON NE DÉCALE PAS CE QUI EXISTE (R14) ──────────────
  // Vérifié AVANT toute recherche de delta: si la casserole a déjà tourné, la
  // question du « de combien » n'a pas de sens, et un refus tardif ferait
  // calculer trois fois pour rien.
  const cooked = args.cookedPreparationIds.filter((id) => inSession.has(id));
  if (cooked.length > 0) {
    return {
      ok: false,
      reason: "already_cooked",
      detail: cooked.join(","),
    };
  }

  const movable = plan.dishes.filter((d) =>
    d.preparationIds.some((id) => inSession.has(id)) &&
    dishDate(plan, d, dates) !== null
  );
  const endsOn = planEndsOn(plan.startsOn, plan.durationDays);
  const maxDelta = Math.max(1, plan.durationDays - 1);

  // La position de chaque plat qui NE bouge pas, pour la détection de collision.
  const movingIndexes = new Set(movable.map((d) => d.dishIndex));
  const fixedSlots = new Set(
    plan.dishes
      .filter((d) => !movingIndexes.has(d.dishIndex) && d.day)
      .map((d) => `${d.day}#${d.slot ?? "-"}`),
  );

  let firstRefusal: ShiftRefused | null = null;
  let viableWithCollision: ShiftPlan | null = null;

  for (let delta = 1; delta <= maxDelta; delta++) {
    const newCookOn = addDays(cookOn, delta);

    // ── `outside_plan_window` — ON NE PLANIFIE PAS HORS DE LA FENÊTRE ──────
    if (newCookOn > endsOn) {
      const refusal: ShiftRefused = {
        ok: false,
        reason: "outside_plan_window",
        detail: `cook ${newCookOn} > ends_on ${endsOn}`,
      };
      if (!firstRefusal) firstRefusal = refusal;
      // Tous les deltas suivants sont pires. Inutile de continuer.
      break;
    }
    const pushedOut = movable.find((d) => {
      const date = dishDate(plan, d, dates)!;
      return addDays(date, delta) > endsOn;
    });
    if (pushedOut) {
      const refusal: ShiftRefused = {
        ok: false,
        reason: "outside_plan_window",
        detail: `"${pushedOut.title}" would land after ${endsOn}`,
      };
      if (!firstRefusal) firstRefusal = refusal;
      break;
    }

    // ── `perishables_at_risk` — DEPUIS LA DATE D'ACHAT RÉELLE ──────────────
    //
    // Le piège le plus coûteux de la fiche (§9): rien n'échoue, rien ne lève, et
    // la personne trouve du poulet gâté trois jours plus tard.
    //
    // ⚠️ ON MESURE L'ATTENTE DE CHAQUE ALIMENT DÉJÀ ACHETÉ CONTRE LA CUISSON
    // QU'IL ATTEND **DANS LE PLAN DÉCALÉ**. C'est ce qui rend la garde JUSTE
    // dans les deux sens: elle mord quand un aliment du frigo devrait attendre
    // plus longtemps, et elle NE MORD PAS quand l'aliment attend une cuisson qui
    // ne bouge pas. La version « n'importe quel frais acheté avant la nouvelle
    // date » refusait des glissements sûrs, avec un motif faux — mesuré en run.
    const shiftedForCheck = shiftPlanDates(plan, cookOn, delta);
    const rotting = shiftedForCheck
      ? findRottingWave(shiftedForCheck, args.doneWaves, args.maxFridgeDays)
      : null;
    if (rotting) {
      const refusal: ShiftRefused = {
        ok: false,
        reason: "perishables_at_risk",
        detail:
          `"${rotting.term}" bought ${rotting.purchasedOn}, cooked ${rotting.cookOn} (${
            daysBetween(rotting.purchasedOn, rotting.cookOn)
          } d > ${args.maxFridgeDays})`,
      };
      if (!firstRefusal) firstRefusal = refusal;
      // Un delta PLUS GRAND ne réparerait rien: le périssable vieillit encore.
      break;
    }

    const collides = movable.some((d) => {
      const date = addDays(dishDate(plan, d, dates)!, delta);
      return fixedSlots.has(`${dayTokenOf(date)}#${d.slot ?? "-"}`);
    });

    const outcome: ShiftPlan = {
      ok: true,
      delta,
      newCookOn,
      newCookDay: dayTokenOf(newCookOn),
      movedDishIndexes: movable.map((d) => d.dishIndex).sort((a, b) => a - b),
      newBuyOn: shiftedBuyOn(plan, cookOn, delta),
      collides,
    };
    if (!collides) return outcome;
    if (!viableWithCollision) viableWithCollision = outcome;
  }

  if (viableWithCollision) return viableWithCollision;
  return firstRefusal ?? {
    ok: false,
    reason: "outside_plan_window",
    detail: `no viable delta within ${plan.durationDays} days`,
  };
}

/**
 * Un aliment DÉJÀ ACHETÉ qui attendrait trop longtemps dans le plan décalé.
 *
 * ── LA MESURE EST « DE L'ACHAT À LA CUISSON », dans le plan APRÈS décalage ──
 * Pour chaque terme périssable d'une vague faite, on cherche la cuisson la plus
 * PRÉCOCE qui le consomme — c'est elle qui décide, parce que c'est le premier
 * moment où l'aliment sert. Si même cette cuisson-là tombe au-delà de la fenêtre
 * frigo depuis l'achat RÉEL, l'aliment aura tourné avant d'être utilisé.
 *
 * Un aliment dont la cuisson NE BOUGE PAS garde exactement l'attente qu'il
 * avait: le calcul rend alors le même verdict qu'avant le glissement, donc il ne
 * peut pas refuser à cause de lui. La garde est ainsi juste dans les deux sens,
 * et c'est la moitié qui manquait à la première version.
 */
function findRottingWave(
  shifted: AccidentPlan,
  doneWaves: readonly DoneWave[],
  maxFridgeDays: number,
): { term: string; purchasedOn: string; cookOn: string } | null {
  if (doneWaves.length === 0) return null;
  const dates = planDates(shifted);

  // Terme normalisé → date de cuisson la PLUS PRÉCOCE qui le consomme, dans le
  // plan DÉCALÉ. Même normalisation que `planGroceryWaves`, par le même chemin.
  const earliestCook = new Map<string, string>();
  for (const prep of shifted.preparations) {
    const date = prep.cookOn ? dates[prep.cookOn] : undefined;
    if (!date) continue;
    for (const raw of prep.ingredientTerms) {
      const term = normalizeTerm(raw);
      if (!term) continue;
      const known = earliestCook.get(term);
      if (!known || date < known) earliestCook.set(term, date);
    }
  }

  for (const wave of doneWaves) {
    for (const raw of wave.perishableTerms) {
      const cookOn = earliestCook.get(normalizeTerm(raw));
      if (!cookOn) continue;
      if (daysBetween(wave.purchasedOn, cookOn) > maxFridgeDays) {
        return { term: raw, purchasedOn: wave.purchasedOn, cookOn };
      }
    }
  }
  return null;
}

/**
 * La normalisation de `grocery_waves.ts`, à l'identique.
 *
 * Recopiée plutôt qu'importée parce qu'elle n'y est pas exportée; le test
 * `« la normalisation suit celle des vagues »` la pinne contre le comportement
 * réel de `planGroceryWaves`, pour que les deux ne puissent pas diverger en
 * silence.
 */
function normalizeTerm(term: unknown): string {
  return String(term ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `b - a` en jours pleins. Les deux dates sont `YYYY-MM-DD`. */
export function daysBetween(a: string, b: string): number {
  const from = new Date(`${a}T12:00:00Z`).getTime();
  const to = new Date(`${b}T12:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

/**
 * La date d'achat de la vague qui servira la NOUVELLE cuisson.
 *
 * ⚠️ ELLE SE RECALCULE, elle ne se décale pas de `delta`. `planGroceryWaves`
 * borne déjà `buyOn` au début du plan (« on n'envoie personne faire des courses
 * la semaine d'avant »), et une vague qui était collée à cette borne ne bouge
 * donc pas de la même quantité que sa cuisson. Rejouer le calcul sur le plan
 * DÉJÀ décalé est la seule façon d'obtenir la vraie réponse — et c'est la même
 * fonction que l'écran, donc les deux ne peuvent pas diverger.
 */
function shiftedBuyOn(
  plan: AccidentPlan,
  cookOn: string,
  delta: number,
): string | null {
  const shifted = shiftPlanDates(plan, cookOn, delta);
  if (!shifted) return null;
  const waves = planGroceryWaves({
    startsOn: shifted.startsOn,
    durationDays: shifted.durationDays,
    shoppingList: shifted.shoppingList,
    preparations: shifted.preparations.map((p) => ({
      id: p.id,
      cookOn: p.cookOn,
      ingredientTerms: p.ingredientTerms,
    })),
  });
  const newCookOn = addDays(cookOn, delta);
  const serving = waves.find((w) => w.servesCookOn === newCookOn);
  return serving?.buyOn ?? null;
}

/**
 * LE GLISSEMENT LUI-MÊME — un plan avec d'autres DATES, et rien d'autre.
 *
 * ⚠️ C'EST ICI QUE « CE N'EST PAS V3 » SE VÉRIFIE (R13). Cette fonction ne
 * touche que trois champs: `dish.day`, `preparation.cook_on`, `session.day`. Les
 * titres, les ingrédients, les quantités, les `uses`, les portions et l'ORDRE
 * des plats sont rendus tels quels — et l'ordre est ce qui garde les clés de
 * coche valides, puisqu'elles sont positionnelles.
 *
 * Rend `null` quand la date ne porte aucune session: on ne déplace jamais « à
 * peu près ».
 */
export function shiftPlanDates(
  plan: AccidentPlan,
  cookOn: string,
  delta: number,
): AccidentPlan | null {
  if (!Number.isInteger(delta) || delta < 1) return null;
  const dates = planDates(plan);
  const session = plan.sessions.find((s) => dates[s.day] === cookOn) ?? null;
  if (!session) return null;

  const known = new Set(plan.preparations.map((p) => p.id));
  const inSession = new Set(session.preparationIds.filter((id) => known.has(id)));
  const newCookDay = dayTokenOf(addDays(cookOn, delta));

  const dishes = plan.dishes.map((dish) => {
    if (!dish.preparationIds.some((id) => inSession.has(id))) return dish;
    const date = dishDate(plan, dish, dates);
    if (!date) return dish;
    return { ...dish, day: dayTokenOf(addDays(date, delta)) };
  });

  const preparations = plan.preparations.map((prep) =>
    inSession.has(prep.id) ? { ...prep, cookOn: newCookDay } : prep
  );

  const sessions = plan.sessions.map((s) =>
    s.day === session.day ? { ...s, day: newCookDay } : s
  );

  return { ...plan, dishes, preparations, sessions };
}

// ---------------------------------------------------------------------------
// L'ESPACE D'ACTION — R3: pré-calculé, fermé, dérivé de l'état RÉEL
// ---------------------------------------------------------------------------

/**
 * LES ACTIONS DE V2. LISTE FERMÉE.
 *
 * ⚠️ `leftover` (« signaler un reste disponible pour demain ») N'EST PAS ICI,
 * et c'est une décision documentée au rapport, pas un oubli: elle n'a AUCUN
 * consommateur en aval — aucune table ne porte un reste, aucun générateur ne le
 * lit, aucun écran ne l'affiche. L'écrire violerait la règle mère T1 (« on ne
 * collecte une donnée que si quelque chose en aval la consomme ») dans la fiche
 * qui la cite. Le jour où un lecteur existe, l'action rentre ici en trois
 * lignes.
 */
export const REALIGNMENT_ACTIONS = [
  /** Décaler UN plat non cuisiné, si la fenêtre frigo le permet. */
  "shift_dish",
  /** Proposer du sans-cuisson quand la session est tombée. */
  "no_cook",
  /** Décaler la session ET ce qui en dépend (le glissement de §C). */
  "shift_session",
  /** ⚠️ NE RIEN FAIRE, ET LE DIRE. R4: c'est une BONNE FIN, pas un échec. */
  "nothing_to_change",
] as const;
export type RealignmentActionId = (typeof REALIGNMENT_ACTIONS)[number];

export interface RealignmentAction {
  id: RealignmentActionId;
  /** Ce que l'action déplacerait, quand elle en déplace. */
  detail?: string;
}

/**
 * L'ESPACE D'ACTION DISPONIBLE, calculé depuis le plan RÉEL.
 *
 * ── R4 EST DANS LA STRUCTURE, PAS DANS UNE CONSIGNE ───────────────────────
 * `nothing_to_change` est TOUJOURS le dernier élément, et il est SEUL quand
 * aucune autre action ne s'applique. Un flow qui trouve toujours quelque chose à
 * réparer transforme chaque écart en incident; ici « rien à changer » est une
 * sortie de l'espace, donc une fin normale que le code peut atteindre.
 *
 * Aucun modèle n'entre dans cette fonction, et aucun choix n'est tiré au sort:
 * l'espace EST la décision. R3 devient vérifiable au lieu d'être promise.
 */
export function buildRealignmentSpace(args: {
  plan: AccidentPlan;
  /** Le jour local de la personne. Ce qui est passé ne se décale pas. */
  today: string;
  /** L'index du plat concerné, quand l'accident porte sur un plat. */
  dishIndex: number | null;
  /** La date de la session tombée, quand l'accident porte sur une session. */
  skippedSessionOn: string | null;
  /** Le glissement calculé pour cette session, quand il y en a un. */
  shift: ShiftOutcome | null;
  maxFridgeDays: number;
}): RealignmentAction[] {
  const out: RealignmentAction[] = [];
  const { plan } = args;
  const dates = planDates(plan);

  // ── DÉCALER UN PLAT NON CUISINÉ, si la fenêtre frigo le permet ───────────
  if (args.dishIndex !== null) {
    const dish = plan.dishes.find((d) => d.dishIndex === args.dishIndex) ?? null;
    const date = dish ? dishDate(plan, dish, dates) : null;
    if (dish && date) {
      const target = nextFreeDayFor(plan, dish, date, dates, args.maxFridgeDays);
      if (target) out.push({ id: "shift_dish", detail: target });
    }
  }

  // ── DU SANS-CUISSON, quand la session est tombée ─────────────────────────
  if (args.skippedSessionOn) out.push({ id: "no_cook" });

  // ── DÉCALER LA SESSION — seulement si le glissement est VIABLE ───────────
  // Un refus ne rentre PAS dans l'espace: proposer une action qui va échouer est
  // exactement ce que « l'espace pré-calculé » existe pour empêcher.
  if (args.shift?.ok) {
    out.push({ id: "shift_session", detail: args.shift.newCookOn });
  }

  out.push({ id: "nothing_to_change" });
  return out;
}

/**
 * Le prochain jour où ce plat pourrait être mangé sans sortir de la fenêtre
 * frigo de la préparation qui le nourrit — ou `null`.
 *
 * ⚠️ C'EST LA GARDE DU CRITÈRE §8 « il ne l'est PAS si la fenêtre frigo est
 * dépassée ». Un plat qui puise dans un lot cuisiné il y a trois jours ne peut
 * pas être repoussé à demain: le lot sera à J+4. Un plat qui ne puise dans
 * aucune préparation (cuisiné le jour même) n'a pas cette contrainte.
 */
function nextFreeDayFor(
  plan: AccidentPlan,
  dish: AccidentDish,
  date: string,
  dates: Record<string, string>,
  maxFridgeDays: number,
): string | null {
  const endsOn = planEndsOn(plan.startsOn, plan.durationDays);
  const target = addDays(date, 1);
  if (target > endsOn) return null;

  // La cuisson la plus ANCIENNE dont ce plat dépend borne son report.
  let earliestCook: string | null = null;
  for (const id of dish.preparationIds) {
    const prep = plan.preparations.find((p) => p.id === id);
    if (!prep?.cookOn) continue;
    const cookDate = dates[prep.cookOn];
    if (!cookDate) continue;
    if (!earliestCook || cookDate < earliestCook) earliestCook = cookDate;
  }
  if (earliestCook && daysBetween(earliestCook, target) > maxFridgeDays) {
    return null;
  }
  return target;
}

// ---------------------------------------------------------------------------
// LES CEINTURES — « on propose un décalage, on ne demande jamais quand »
// ---------------------------------------------------------------------------

/**
 * LES FORMULATIONS QUI FONT REDEVENIR LA PROPOSITION UNE QUESTION OUVERTE (R11).
 *
 * ── POURQUOI PAS UN MATCHER MAISON ────────────────────────────────────────
 * Cicatrice `never-hand-roll-a-matcher-here`: « laitue » matchait « lait », 12
 * faux positifs sur 12 mesurés. On réutilise `findForbiddenMatches`, qui porte
 * déjà les frontières de mot correctes (des lookarounds sur lettres/chiffres,
 * pas `\b` — qui ne mord pas après « é »).
 *
 * ── EN ET FR, PARCE QUE T9 ────────────────────────────────────────────────
 * Chaque famille est écrite dans les deux langues, et chacune a un test qui la
 * fait MORDRE et un test où elle NE MORD PAS sur le texte réel de la
 * proposition. Une garde qui n'a pas de cas qui passe bloque tout et ressemble à
 * une garde qui marche.
 *
 * ── LECTURE ABSOLUE ───────────────────────────────────────────────────────
 * `allowNegatedMentions: false`. « Je ne te demande pas quand tu y vas » reste
 * une phrase qui parle de demander quand, et elle n'a rien à faire ici.
 */
const PROSPECTIVE_TERMS: readonly ForbiddenTerm[] = [
  {
    ruleId: "when_can_you",
    token: "when_can_you",
    surfaceForms: [
      "when can you",
      "when will you",
      "when do you",
      "when are you",
      "when could you",
    ],
  },
  {
    ruleId: "what_time",
    token: "what_time",
    surfaceForms: ["what time", "what day", "which day", "how soon"],
  },
  {
    ruleId: "are_you_going_to",
    token: "are_you_going_to",
    surfaceForms: [
      "are you going to",
      "will you be able",
      "do you think you",
      "let me know when",
      "tell me when",
    ],
  },
  {
    ruleId: "quand",
    token: "quand",
    surfaceForms: [
      "quand est-ce",
      "quand pourras-tu",
      "quand peux-tu",
      "quand vas-tu",
      "quand comptes-tu",
      "y aller quand",
      "prevu pour quand",
      "pour quand",
    ],
  },
  {
    ruleId: "dis_moi_quand",
    token: "dis_moi_quand",
    surfaceForms: [
      "dis-moi quand",
      "previens-moi quand",
      "tu comptes",
      "tu penses y aller",
      "quel jour",
    ],
  },
];

/**
 * LE JUGEMENT QUI FUIT — le verrou de vocabulaire, sur CE chemin aussi.
 *
 * Le verrou de doctrine (`off_plan_meals`) juge ce que le MODÈLE compose. Les
 * textes d'ici sont des littéraux déterministes: ils ne passent JAMAIS par lui.
 * Sans cette ceinture, « ton écart de mardi » sortirait par un chemin que le
 * verrou ne regarde pas — c'est-à-dire un verrou vert et désarmé. Même
 * raisonnement que `acceptStripText` avec `findQualifyingVerdict`.
 */
const JUDGEMENT_TERMS: readonly ForbiddenTerm[] = [
  {
    ruleId: "cheat",
    token: "cheat",
    surfaceForms: ["cheat meal", "cheat day", "cheating", "slip up", "slipped up"],
  },
  {
    ruleId: "make_up_for",
    token: "make_up_for",
    surfaceForms: ["make up for", "makes up for", "get back on track", "off track"],
  },
  {
    ruleId: "ecart",
    token: "ecart",
    surfaceForms: ["ecart", "ecarts", "craquage", "craque", "craquer"],
  },
  {
    ruleId: "rattrapage",
    token: "rattrapage",
    surfaceForms: ["rattrapage", "rattraper", "se rattraper", "compenser"],
  },
];

export type AccidentTextRefusal =
  /** Une question ouverte sur le futur (R11). */
  | "asks_about_the_future"
  /** Un point d'interrogation là où seule une proposition doit vivre. */
  | "asks_a_question"
  /** Un jugement de vocabulaire — le verrou de doctrine, ici aussi. */
  | "judges_the_person"
  /** Un verdict sur la journée, même positif. Ceinture partagée du soir. */
  | "qualifies_the_day";

export type AccidentTextVerdict =
  | { ok: true }
  | { ok: false; reason: AccidentTextRefusal; detail: string };

/**
 * Ce texte est-il une PROPOSITION, et pas une question sur une intention ?
 *
 * @param allowQuestionMark REQUIS. `false` pour tout ce qui accompagne un
 *   espace d'action (une proposition se tape, elle ne se répond pas); `true`
 *   pour l'unique question fermée que la fiche autorise — « la session a-t-elle
 *   eu lieu ? », qui porte sur le PASSÉ et rend deux boutons.
 *
 *   Requis et non optionnel: la cicatrice
 *   `optional-gate-params-are-disarmed-gates` a été payée sur exactement cette
 *   forme, et l'oubli aurait laissé passer « on décale à mardi ? » — une
 *   proposition transformée en question ouverte par une ponctuation.
 */
export function acceptAccidentText(
  text: string,
  allowQuestionMark: boolean,
): AccidentTextVerdict {
  const raw = String(text ?? "");

  const prospective = findForbiddenMatches(raw, PROSPECTIVE_TERMS, {
    allowNegatedMentions: false,
  });
  if (prospective.length > 0) {
    return {
      ok: false,
      reason: "asks_about_the_future",
      detail: prospective.map((f) => f.matchedText).join(" | "),
    };
  }

  const judged = findForbiddenMatches(raw, JUDGEMENT_TERMS, {
    allowNegatedMentions: false,
  });
  if (judged.length > 0) {
    return {
      ok: false,
      reason: "judges_the_person",
      detail: judged.map((f) => f.matchedText).join(" | "),
    };
  }

  const verdict = findQualifyingVerdict(raw);
  if (verdict) {
    return { ok: false, reason: "qualifies_the_day", detail: verdict };
  }

  if (!allowQuestionMark) {
    const mark = raw.match(/[?？]/);
    if (mark) return { ok: false, reason: "asks_a_question", detail: mark[0] };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// LE TEXTE — deux langues, tables fermées
// ---------------------------------------------------------------------------

export type AccidentLanguage = "fr" | "en";

interface AccidentCopy {
  /**
   * L'entête du formulaire. ⚠️ AUCUNE OBLIGATION N'Y EST DITE (§10,
   * contre-mesure): « maintenant il faut choisir » apprendrait que signaler
   * déclenche une procédure, et les gens cesseraient de signaler. La phrase
   * CONSTATE et ouvre; l'ignorer reste gratuit et sans trace.
   */
  formLead: (title: string) => string;
  ordered: string;
  noTime: string;
  ateOther: string;
  sessionLead: (day: string) => string;
  sessionYes: string;
  sessionNo: string;
  shiftLead: (day: string) => string;
  shiftYes: string;
  shiftNo: string;
  /** Les refus, un par motif nommé (R14/R15). Jamais un silence. */
  refusePerishables: string;
  refuseWindow: string;
  refuseCooked: string;
  refuseNoShift: string;
  /** Le repli quand un refus est prononcé: du sans-cuisson. */
  fallbackNoCook: string;
  /** R4 — la bonne fin. */
  nothingToChange: string;
  /** Les repas qui n'existent pas, après une cascade. */
  cascadeLead: (n: number) => string;
  cascadeNone: string;
  ack: string;
  ackDeclined: string;
  ackStale: string;
  ackShifted: (day: string) => string;
  /** Les jours, pour les phrases. */
  days: Readonly<Record<string, string>>;
}

const COPY: Readonly<Record<AccidentLanguage, AccidentCopy>> = {
  en: {
    formLead: (t) => t ? `${t} did not happen as planned.` : "That one did not happen as planned.",
    ordered: "I ordered or ate out",
    noTime: "No time to cook",
    ateOther: "I ate something else",
    sessionLead: (d) => `The cooking session was set for ${d}.`,
    sessionYes: "✓ It happened",
    sessionNo: "It did not happen",
    shiftLead: (d) => `The shopping is not done. Moving the cooking to ${d}.`,
    shiftYes: "Yes",
    shiftNo: "No, I'll handle it",
    refusePerishables:
      "Moving the cooking would leave fresh food you already bought too long in the fridge, so the plan stays as it is.",
    refuseWindow:
      "Moving the cooking would push a meal past the end of this plan, so the plan stays as it is.",
    refuseCooked:
      "Part of that session is already cooked, so the plan stays as it is.",
    refuseNoShift: "There is no room to move the cooking, so the plan stays as it is.",
    fallbackNoCook: "For tonight, something with no cooking works.",
    nothingToChange: "Nothing to change for the rest of the plan.",
    cascadeLead: (n) =>
      n === 1
        ? "One meal was drawing on that session — it is no longer in the plan."
        : `${n} meals were drawing on that session — they are no longer in the plan.`,
    cascadeNone: "Nothing else in the plan was drawing on that session.",
    ack: "Noted.",
    ackDeclined: "Noted, the plan stays as it is.",
    ackStale: "That one is out of date now — nothing was saved.",
    ackShifted: (d) => `Moved to ${d}.`,
    days: {
      mon: "Monday",
      tue: "Tuesday",
      wed: "Wednesday",
      thu: "Thursday",
      fri: "Friday",
      sat: "Saturday",
      sun: "Sunday",
    },
  },
  fr: {
    formLead: (t) => t ? `${t} n'a pas eu lieu comme prévu.` : "Ça n'a pas eu lieu comme prévu.",
    ordered: "J'ai commandé ou mangé dehors",
    noTime: "Pas eu le temps",
    ateOther: "J'ai mangé autre chose",
    sessionLead: (d) => `La session de cuisine était prévue ${d}.`,
    sessionYes: "✓ Elle a eu lieu",
    sessionNo: "Elle n'a pas eu lieu",
    shiftLead: (d) => `Les courses ne sont pas faites. On décale la cuisson à ${d}.`,
    shiftYes: "Oui",
    shiftNo: "Non, je gère",
    refusePerishables:
      "Décaler la cuisson laisserait trop longtemps au frigo du frais déjà acheté, donc le plan reste tel quel.",
    refuseWindow:
      "Décaler la cuisson pousserait un repas au-delà de la fin de ce plan, donc le plan reste tel quel.",
    refuseCooked:
      "Une partie de cette session est déjà cuisinée, donc le plan reste tel quel.",
    refuseNoShift: "Il n'y a pas de place pour décaler la cuisson, donc le plan reste tel quel.",
    fallbackNoCook: "Pour ce soir, quelque chose sans cuisson fait l'affaire.",
    nothingToChange: "Rien à changer pour la suite du plan.",
    cascadeLead: (n) =>
      n === 1
        ? "Un repas puisait dans cette session — il n'est plus au plan."
        : `${n} repas puisaient dans cette session — ils ne sont plus au plan.`,
    cascadeNone: "Rien d'autre au plan ne puisait dans cette session.",
    ack: "C'est noté.",
    ackDeclined: "C'est noté, le plan reste tel quel.",
    ackStale: "Celui-là n'est plus d'actualité — rien n'a été enregistré.",
    ackShifted: (d) => `Décalé à ${d}.`,
    days: {
      mon: "lundi",
      tue: "mardi",
      wed: "mercredi",
      thu: "jeudi",
      fri: "vendredi",
      sat: "samedi",
      sun: "dimanche",
    },
  },
};

function dayName(language: AccidentLanguage, date: string): string {
  return COPY[language].days[dayTokenOf(date)] ?? date;
}

/** Un titre de plat, ramené à ce qui se lit dans une bulle. Même règle que la bande. */
function cleanTitle(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[?？]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// ① LE FORMULAIRE ACCIDENT
// ---------------------------------------------------------------------------

export interface AccidentForm {
  body: string;
  buttons: AccidentButton[];
}

/**
 * TROIS BOUTONS FERMÉS, JAMAIS UN CHAMP LIBRE OBLIGATOIRE.
 *
 * ── CE QUE LE FORMULAIRE N'EST PAS ────────────────────────────────────────
 * Il ne demande rien. Il OFFRE trois sorties à un fait que la personne vient de
 * signaler, et l'ignorer ne coûte rien: la décoche est déjà écrite, elle
 * PRÉCÈDE le formulaire (§7), et aucun état ne reste ouvert derrière. C'est ce
 * qui protège la contre-mesure de §10 — si signaler déclenchait une procédure
 * obligatoire, les gens cesseraient de signaler, et c'est le pire résultat
 * possible.
 *
 * Le texte est possible, jamais requis: il n'y a pas de quatrième bouton, pas de
 * champ, et rien à fermer.
 *
 * @param restrictionFlag REQUIS (R9). Sous plancher de restriction alimentaire,
 *   AUCUN formulaire: on vient de décider qu'on ne parle pas de nourriture à
 *   cette personne. Requis parce que le défaut inverse aurait ouvert la
 *   procédure sans qu'un seul test ne tombe.
 * @param hasPlan REQUIS (§7). « Le formulaire s'ouvre sans plan courant ⇒ il se
 *   referme sans rien écrire »: il n'y a rien à réaligner.
 */
export function buildAccidentForm(args: {
  mealId: string;
  dishIndex: number;
  dishTitle: string;
  language: AccidentLanguage;
  restrictionFlag: boolean;
  hasPlan: boolean;
}): AccidentForm | null {
  // R9 — LE PLANCHER PRIME SUR TOUT, ET IL PASSE EN PREMIER (T7).
  if (args.restrictionFlag) return null;
  if (!args.hasPlan) return null;

  const copy = COPY[args.language];
  const body = copy.formLead(cleanTitle(args.dishTitle));

  const buttons: AccidentButton[] = [
    {
      id: accidentFormId(ACCIDENT_KIND.ordered, args.mealId, args.dishIndex),
      title: copy.ordered,
    },
    {
      id: accidentFormId(ACCIDENT_KIND.noTime, args.mealId, args.dishIndex),
      title: copy.noTime,
    },
    {
      id: accidentFormId(ACCIDENT_KIND.ateOther, args.mealId, args.dishIndex),
      title: copy.ateOther,
    },
  ];

  // La ceinture juge tout ce que NOUS écrivons — l'entête ET les libellés. Un
  // libellé interrogatif sous une entête irréprochable resterait une question.
  const verdict = acceptAccidentText(
    [body, ...buttons.map((b) => b.title)].join("\n"),
    false,
  );
  if (!verdict.ok) {
    console.warn(JSON.stringify({
      tag: "keel.accident.form_refused",
      reason: verdict.reason,
      detail: verdict.detail,
    }));
    return null;
  }
  return { body, buttons };
}

// ---------------------------------------------------------------------------
// ② LA QUESTION DE SESSION — UNE fois par session, jamais par plat
// ---------------------------------------------------------------------------

/**
 * « La session de cuisine de dimanche a eu lieu ? »
 *
 * ── C'EST LA SEULE QUESTION DE LA FICHE, ET ELLE PORTE SUR LE PASSÉ ───────
 * R11 interdit les questions ouvertes SUR LE FUTUR. Celle-ci constate un fait
 * déjà arrivé et rend DEUX boutons: elle ne demande aucune intention, elle ne
 * rend aucun texte libre à classer. C'est pourquoi `acceptAccidentText` reçoit
 * `allowQuestionMark: true` ici, et `false` partout ailleurs.
 *
 * ── UNE FOIS PAR SESSION (fiche §3) ───────────────────────────────────────
 * L'appelant ne la pose que lorsque `cooking_session_states` n'a AUCUNE ligne
 * pour cette date — l'absence de ligne EST « on ne sait pas ». Trois plats
 * décochés le même soir posent donc UNE question, pas trois.
 */
export function buildSessionQuestion(args: {
  mealId: string;
  cookOn: string;
  language: AccidentLanguage;
  restrictionFlag: boolean;
}): AccidentForm | null {
  if (args.restrictionFlag) return null;
  const copy = COPY[args.language];
  const body = `${copy.sessionLead(dayName(args.language, args.cookOn))}`;
  const buttons: AccidentButton[] = [
    {
      id: accidentSessionId(true, args.mealId, args.cookOn),
      title: copy.sessionYes,
    },
    {
      id: accidentSessionId(false, args.mealId, args.cookOn),
      title: copy.sessionNo,
    },
  ];
  const verdict = acceptAccidentText(
    [body, ...buttons.map((b) => b.title)].join("\n"),
    true,
  );
  if (!verdict.ok) return null;
  return { body, buttons };
}

// ---------------------------------------------------------------------------
// ③ LA PROPOSITION DE DÉCALAGE — deux boutons, jamais une question ouverte
// ---------------------------------------------------------------------------

/**
 * « Les courses ne sont pas faites. On décale la cuisson à mardi ? »
 *
 * ⚠️ CE N'EST PAS UNE QUESTION, C'EST UNE PROPOSITION (R11). La date est
 * CALCULÉE par `planSessionShift` et affichée; la personne accepte d'un tap. On
 * ne demande JAMAIS « tu peux y aller quand ? »: ce serait une question ouverte
 * sur une intention, elle rendrait du texte libre à classer, elle demanderait
 * une information que le produit ne sait pas vérifier, et elle remplacerait un
 * tap par une phrase. La ceinture `acceptAccidentText` le vérifie sur le texte
 * exact, dans les deux langues, plutôt que de le promettre.
 *
 * ⚠️ ELLE NE CONSOMME PAS LE BUDGET T4 (R12): c'est la réponse à un geste que la
 * personne vient de faire, pas une demande non sollicitée. Le corollaire est
 * tenu par l'appelant: jamais cette proposition ET l'invitation photo dans le
 * même échange.
 */
export function buildShiftProposal(args: {
  plan: AccidentPlan;
  shift: ShiftPlan;
  language: AccidentLanguage;
  restrictionFlag: boolean;
}): AccidentForm | null {
  if (args.restrictionFlag) return null;
  const copy = COPY[args.language];
  const cookOn = shiftSourceDate(args.plan, args.shift);
  if (!cookOn) return null;
  const body = copy.shiftLead(dayName(args.language, args.shift.newCookOn));
  const buttons: AccidentButton[] = [
    {
      id: accidentShiftId({
        mealId: args.plan.mealId,
        cookOn,
        delta: args.shift.delta,
        fingerprint: planShiftFingerprint(args.plan),
      }),
      title: copy.shiftYes,
    },
    {
      id: accidentShiftDeclineId(args.plan.mealId, cookOn),
      title: copy.shiftNo,
    },
  ];
  const verdict = acceptAccidentText(
    [body, ...buttons.map((b) => b.title)].join("\n"),
    false,
  );
  if (!verdict.ok) {
    console.warn(JSON.stringify({
      tag: "keel.accident.shift_proposal_refused",
      reason: verdict.reason,
      detail: verdict.detail,
    }));
    return null;
  }
  return { body, buttons };
}

/** La date d'origine de la session que ce glissement déplace. */
function shiftSourceDate(plan: AccidentPlan, shift: ShiftPlan): string | null {
  const from = addDays(shift.newCookOn, -shift.delta);
  return sessionOnDate(plan, from) ? from : null;
}

/**
 * LE REFUS, DIT AVEC SON MOTIF — R15: un refus n'est jamais un silence.
 *
 * Un refus muet donne l'impression que le produit n'a pas compris; un refus
 * nommé montre qu'il a regardé. Et on propose ce qui reste: du sans-cuisson pour
 * tenir, ou « rien à changer » quand il n'y a rien.
 */
export function renderShiftRefusal(args: {
  reason: ShiftRefusal;
  language: AccidentLanguage;
  /** Y a-t-il un repas de ce soir à couvrir ? Sinon: « rien à changer ». */
  offerNoCook: boolean;
}): string {
  const copy = COPY[args.language];
  const head = args.reason === "perishables_at_risk"
    ? copy.refusePerishables
    : args.reason === "outside_plan_window"
    ? copy.refuseWindow
    : args.reason === "already_cooked"
    ? copy.refuseCooked
    : copy.refuseNoShift;
  const tail = args.offerNoCook ? copy.fallbackNoCook : copy.nothingToChange;
  const text = `${head}\n${tail}`;
  const verdict = acceptAccidentText(text, false);
  if (verdict.ok) return text;
  console.warn(JSON.stringify({
    tag: "keel.accident.refusal_refused",
    reason: verdict.reason,
    detail: verdict.detail,
  }));
  return copy.nothingToChange;
}

/**
 * CE QUE LA CASCADE A CHANGÉ, DIT EN UNE PHRASE — puis ce qui reste.
 *
 * R4 en toutes lettres: quand rien ne tombe, on le DIT (« rien d'autre au plan
 * ne puisait dans cette session ») au lieu de chercher quelque chose à réparer.
 */
export function renderCascadeOutcome(args: {
  cascade: SessionCascade;
  language: AccidentLanguage;
  space: readonly RealignmentAction[];
}): string {
  const copy = COPY[args.language];
  const n = args.cascade.invalidatedDishIndexes.length;
  const lines: string[] = [n > 0 ? copy.cascadeLead(n) : copy.cascadeNone];
  if (args.space.some((a) => a.id === "no_cook")) {
    lines.push(copy.fallbackNoCook);
  } else if (n === 0) {
    lines.push(copy.nothingToChange);
  }
  const text = lines.join("\n");
  const verdict = acceptAccidentText(text, false);
  if (verdict.ok) return text;
  return copy.nothingToChange;
}

// ---------------------------------------------------------------------------
// LES ACCUSÉS — sans verdict, sans jugement (R8)
// ---------------------------------------------------------------------------

export type AccidentAck =
  | "noted"
  | "declined"
  | "stale";

/**
 * L'accusé d'un tap. Court, plat, et VÉRIFIÉ à chaque rendu.
 *
 * Même raison que `renderStripAck`: une constante qu'on change un mardi soir
 * n'est relue par personne; un vérificateur qui tourne à chaque rendu, si.
 */
export function renderAccidentAck(
  kind: AccidentAck,
  language: AccidentLanguage,
): string {
  const copy = COPY[language];
  const text = kind === "declined"
    ? copy.ackDeclined
    : kind === "stale"
    ? copy.ackStale
    : copy.ack;
  const verdict = acceptAccidentText(text, false);
  if (verdict.ok) return text;
  console.warn(JSON.stringify({
    tag: "keel.accident.ack_refused",
    kind,
    language,
    reason: verdict.reason,
    detail: verdict.detail,
  }));
  return language === "fr" ? "C'est noté." : "Noted.";
}

/** L'accusé d'un glissement APPLIQUÉ — et il n'est dit qu'après relecture. */
export function renderShiftApplied(
  newCookOn: string,
  language: AccidentLanguage,
): string {
  const copy = COPY[language];
  const text = copy.ackShifted(dayName(language, newCookOn));
  const verdict = acceptAccidentText(text, false);
  return verdict.ok ? text : copy.ack;
}

/** R4, dit tout seul. Exporté parce que « rien à changer » est une SORTIE. */
export function renderNothingToChange(language: AccidentLanguage): string {
  return COPY[language].nothingToChange;
}

/** Les rayons périssables d'une liste — pour `DoneWave.carriesPerishable`. */
export function waveCarriesPerishable(items: readonly WaveItem[]): boolean {
  return items.some((i) => PERISHABLE_AISLES.has(String(i.aisle)));
}

/**
 * Les vagues de courses de ce plan, par LA fonction du dépôt.
 *
 * Un adaptateur, pas une règle: `planGroceryWaves` reste la seule définition du
 * calcul (son en-tête le dit en toutes lettres — le jumeau côté écran est mort
 * pour cette raison). On lui donne simplement la forme réduite de cette fiche.
 */
export function planGroceryWavesForPlan(plan: AccidentPlan) {
  return planGroceryWaves({
    startsOn: plan.startsOn,
    durationDays: plan.durationDays,
    shoppingList: plan.shoppingList,
    preparations: plan.preparations.map((p) => ({
      id: p.id,
      cookOn: p.cookOn,
      ingredientTerms: p.ingredientTerms,
    })),
  });
}

export { MAX_FRIDGE_DAYS };
