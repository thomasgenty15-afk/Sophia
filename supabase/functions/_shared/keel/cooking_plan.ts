import { DAY_TOKENS, type DayToken } from "./tokens.ts";

// ===========================================================================
// P2 · « COMMENT VOULEZ-VOUS CUISINER ? » ET « COMBIEN DE COURSES ? »
// (chantier-0903/CUISINE, A2, 2026-09-03)
// ===========================================================================
//
// ── CE QUE CE MODULE REMPLACE ─────────────────────────────────────────────
// Une seule question chiffrée existait: « combien de temps dure une session de
// cuisine » (`practical_constraints.cooking_time_min`), bloquante dans
// l'entonnoir. C'est une question d'ingénieur: personne ne sait répondre « 45 »
// avant d'avoir vu le plan, et la réponse ne dit rien de ce qu'on veut vraiment
// savoir — est-ce que cette personne AIME cuisiner, et combien de fois par
// semaine elle accepte de passer au magasin.
//
// Deux réponses les remplacent, toutes deux DURABLES (décision D2.1: c'est une
// propriété de sa vie, pas de sa semaine — « cette semaine je reçois » se règle
// par `one_cooking_session`, qui reste):
//
//   `cooking_style ∈ {minimal, balanced, keen}`   `grocery_runs ∈ {1, 2, 3}`
//
// `cooking_time_min` cesse d'être DEMANDÉ et devient DÉRIVÉ du style. La clé
// reste en base: cinq lecteurs la lisent, elle est dans `WRITABLE_FIELDS`, et
// les comptes existants la portent déjà.
//
// ── UNE SEULE DÉFINITION, ET LE FRONT LA RÉEXPORTE ────────────────────────
// `frontend/src/keel/api/cookingPlan.ts` importe ce fichier et ne fait que
// réexporter — même discipline que `groceryWaves.ts` depuis le lot 8 du
// chantier foyer. Si tu ajoutes une règle là-bas, tu as recréé le jumeau que ce
// dépôt a déjà supprimé une fois.
//
// ── CE QUE CE MODULE NE FAIT PAS ──────────────────────────────────────────
// Il n'AJOUTE jamais une session que la personne n'a pas demandée
// (`plan_feasibility.ts:27-40`: une session de plus est une vague de courses de
// plus, donc un déplacement de plus). Il PLAFONNE, il ne pousse pas.
//
// PURE: no I/O, no clock, no randomness.

/**
 * LES TROIS STYLES, DANS L'ORDRE CROISSANT D'ENVIE DE CUISINER.
 *
 * ⚠️ L'ORDRE EST LA DONNÉE, pas seulement une liste: `cookingStyleRank` en
 * dépend, et c'est lui qui fait descendre un cran quand le retour de fin de
 * plan dit « je n'ai pas eu le temps » (D2.5).
 */
export const COOKING_STYLES = ["minimal", "balanced", "keen"] as const;
export type CookingStyle = typeof COOKING_STYLES[number];

/**
 * COMBIEN DE FOIS ON ACCEPTE D'ALLER AU MAGASIN. Une, deux ou trois.
 *
 * ⛔ PAS DE ZÉRO, ET PAS DE QUATRE. Zéro course est un plan qu'on ne peut pas
 * faire; au-delà de trois, ce n'est plus une cadence, c'est du quotidien — et
 * le module des vagues ne sait de toute façon pas produire plus d'une vague par
 * session.
 */
export const GROCERY_RUNS = [1, 2, 3] as const;
export type GroceryRuns = typeof GROCERY_RUNS[number];

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * « PEU IMPORTE » — une RÉPONSE, et surtout pas une absence de réponse.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI CE N'EST PAS `null`, ET LA RAISON EST DANS LE CODE JUSTE EN BAS.
 * `resolveCookingCapacity` rend `plan: null` quand `runs === null` — « une
 * cadence sans style ne dit pas combien de temps », donc AUCUN plan de cuisine
 * n'est dérivé. Mapper « peu importe » sur `null` ne ferait donc pas « le
 * moteur choisit »: ça éteindrait la dérivation entière, et le prompt partirait
 * muet sur les sessions. C'est le piège exact de la cicatrice
 * `jsonb default '[]' cache « répondu » vs « pas demandé »`, pris par le
 * nombre plutôt que par le tableau.
 *
 * ⚠️ ET CE N'EST PAS NON PLUS UN QUATRIÈME NOMBRE. « Peu importe » ne dit pas
 * « trois »: il dit « je n'impose rien ». La différence se voit le jour où le
 * plafond du style bouge — un `3` figé garderait l'ancien monde, `"any"` suit.
 */
export const GROCERY_RUNS_ANY = "any" as const;
export type GroceryRunsAnswer = GroceryRuns | typeof GROCERY_RUNS_ANY;

/** Le plafond dur du nombre de sessions, quel que soit ce qu'on demande. */
export const MAX_COOKING_SESSIONS = 3;

/**
 * CE QUE CHAQUE STYLE VEUT DIRE, EN VALEURS QUE LE MOTEUR LIT DÉJÀ.
 *
 * ⛔ AUCUNE DE CES QUATRE VALEURS N'EST NEUVE. `minutes` alimente
 * `cooking_time_min` (cinq lecteurs), `difficulty` et `variety` sont les
 * vocabulaires fermés de `recipe_difficulty` / `variety` — le lot ne fabrique
 * pas un cinquième réglage, il DÉRIVE ceux qui existent d'une question à
 * laquelle on sait répondre.
 *
 * ⚠️ `sessionCap` N'EST PAS UN NOMBRE DE COURSES. « Le moins possible » accepte
 * deux passages au magasin (on ne vit pas sans lait), mais pas trois séances de
 * cuisine: le plafond porte sur la CUISINE, et la rationale dit que deux
 * courses suffisent (décision D2.3).
 *
 * Épinglé par `constant_pins_test.ts` — la table entière, pas une case.
 */
export const COOKING_STYLE_PROFILE: Readonly<
  Record<CookingStyle, {
    readonly minutes: number;
    readonly difficulty: "simple" | "normal" | "keen";
    readonly variety: "repeat" | "some" | "varied";
    readonly sessionCap: number;
  }>
> = Object.freeze({
  minimal: { minutes: 30, difficulty: "simple", variety: "repeat", sessionCap: 2 },
  balanced: { minutes: 60, difficulty: "normal", variety: "some", sessionCap: 3 },
  keen: { minutes: 120, difficulty: "keen", variety: "varied", sessionCap: 3 },
});

/**
 * LE RANG D'UN STYLE — 0 pour « le moins possible », 2 pour « j'aime cuisiner ».
 *
 * Il existe pour UNE chose: descendre d'un cran (D2.5). Le retour de fin de
 * plan disait « pas eu le temps » et retirait des MINUTES à un champ que plus
 * personne ne voit; il descend maintenant le style, qui est la question posée.
 */
export function cookingStyleRank(style: CookingStyle): number {
  return COOKING_STYLES.indexOf(style);
}

/**
 * UN CRAN PLUS BAS, ou le même quand on est déjà au plancher.
 *
 * ⚠️ `minimal` NE DESCEND PAS PLUS BAS, et ne devient pas « pas de cuisine ».
 * Un plan sans cuisine n'est pas un plan; le plancher est un plancher.
 */
export function oneStyleLower(style: CookingStyle): CookingStyle {
  const rank = cookingStyleRank(style);
  return COOKING_STYLES[Math.max(0, rank - 1)];
}

// ---------------------------------------------------------------------------
// LA LECTURE DE `practical_constraints` — et le troisième état
// ---------------------------------------------------------------------------

/**
 * LE STYLE DÉCLARÉ, ou `null` = **JAMAIS DEMANDÉ**.
 *
 * ⛔ `null` NE DEVIENT PAS `minimal`. C'est la cicatrice de
 * `20260818110000:48-51`, payée sur `kitchen_equipment`: une clé absente et une
 * réponse « rien » se ressemblent en JSON et ne veulent pas dire la même chose.
 * Un compte qui n'a jamais vu la question ne doit pas se voir composer des
 * plans « je réchauffe » au nom d'un choix qu'il n'a pas fait — les lecteurs
 * retombent alors sur `cooking_time_min` tel quel, ce qu'ils faisaient hier.
 */
export function readCookingStyle(
  pc: Record<string, unknown> | null | undefined,
): CookingStyle | null {
  const raw = String(pc?.cooking_style ?? "").trim();
  return (COOKING_STYLES as readonly string[]).includes(raw)
    ? raw as CookingStyle
    : null;
}

/**
 * LE NOMBRE DE COURSES DÉCLARÉ, ou `null` = jamais demandé.
 *
 * ⚠️ MÊME TROISIÈME ÉTAT QUE LE STYLE, et il compte plus encore ici: `0` est
 * une valeur JSON parfaitement écrivable, et `Number(null)` vaut `0`. Un
 * `!= null` laisserait passer « zéro course », c'est-à-dire un plan qu'on ne
 * peut pas faire.
 */
export function readGroceryRuns(
  pc: Record<string, unknown> | null | undefined,
): GroceryRuns | null {
  const raw = Number(pc?.grocery_runs);
  return (GROCERY_RUNS as readonly number[]).includes(raw)
    ? raw as GroceryRuns
    : null;
}

/**
 * LA RÉPONSE TELLE QU'ELLE A ÉTÉ DONNÉE — nombre, « peu importe », ou `null`.
 *
 * ⛔ CE LECTEUR-CI DISTINGUE TROIS ÉTATS; `readGroceryRuns` n'en distingue que
 * deux, ET C'EST VOULU. Les deux existent côte à côte parce qu'ils répondent à
 * deux questions différentes:
 *
 *   · `readGroceryRuns`       → « quel NOMBRE a été demandé ? » — `null` pour
 *                               « peu importe », qui n'en demande aucun.
 *   · `readGroceryRunsAnswer` → « la question a-t-elle une RÉPONSE ? » — c'est
 *                               celui que l'écran et la garde de l'entonnoir
 *                               lisent, sinon « peu importe » bloquerait le
 *                               parcours comme un champ vide.
 *
 * ⚠️ UN APPELANT QUI SE TROMPE DE LECTEUR NE PLANTE PAS, il se trompe en
 * silence — d'où les deux noms explicites plutôt qu'un drapeau.
 */
export function readGroceryRunsAnswer(
  pc: Record<string, unknown> | null | undefined,
): GroceryRunsAnswer | null {
  if (pc?.grocery_runs === GROCERY_RUNS_ANY) return GROCERY_RUNS_ANY;
  return readGroceryRuns(pc);
}

/**
 * CE QUE « PEU IMPORTE » VAUT POUR LE MOTEUR — LE HAUT DE L'OFFRE.
 *
 * ⛔ CONTRE L'OFFRE, ET PAS CONTRE LE PLAFOND DU STYLE — DÉFAUT MESURÉ LE
 * 2026-09-09, SIGNALÉ AVANT D'AVOIR MORDU EN RÉEL.
 *
 * Première version: « peu importe » valait `COOKING_STYLE_PROFILE[style]
 * .sessionCap`. Le style, tout seul, ne sait rien de la FENÊTRE. Mesuré, en
 * `balanced`:
 *
 *     plan     l'écran offre    résolvait à    le plan sortait
 *     2 jours  [1]              3              runs=2 + note « raboté »
 *     3 jours  [1]              3              runs=3, AUCUNE note
 *     5 jours  [1, 2]           3              runs=3, AUCUNE note
 *
 * Deux défauts, et le second est le pire. À 2 jours, la note
 * `runs_capped_by_sessions` dit « tu en as demandé plus, j'ai raboté » à
 * quelqu'un qui n'a RIEN demandé — c'est le sens même de « peu importe ». À 3
 * et 5 jours, rien ne rabote: trois passages au magasin pour un plan que
 * l'écran annonce couvrable en une seule course, et pas une phrase pour
 * l'expliquer.
 *
 * ⚠️ LA CORRECTION N'EST PAS UNE SECONDE RÈGLE. On lit `offerableGroceryRuns`
 * — LA MÊME fonction que le champ à l'écran — et on prend le haut de sa liste.
 * L'écran et le moteur ne peuvent donc plus diverger par construction: « peu
 * importe » vaut exactement « le maximum de ce qu'on m'aurait proposé ».
 * Recopier ici `min(styleCap, ceil(jours / conservation))` aurait refait le
 * jumeau que ce dépôt a déjà supprimé une fois.
 *
 * ⛔ ET LES RABOTS FINS RESTENT EN AVAL. `deriveCookingPlan` borne encore
 * (`runs <= sessions`, congélateur) et NOMME chaque coup. Résoudre au haut de
 * l'offre ne saute aucune garde: ça donne au moteur la marge que la personne
 * lui laisse, sans lui faire dire qu'elle a réclamé quoi que ce soit.
 */
export function resolveGroceryRunsAnswer(
  answer: GroceryRunsAnswer | null,
  offer: GroceryRunsOffer,
): GroceryRuns | null {
  if (answer === null) return null;
  if (answer !== GROCERY_RUNS_ANY) return answer;
  // ⚠️ UNE OFFRE VIDE N'EXISTE PAS (le module en rend toujours au moins une),
  // mais s'y fier sans le dire ferait un `undefined` silencieux dans un champ
  // qui décide du nombre de courses.
  const top = offer.values[offer.values.length - 1];
  return top ?? null;
}

// ---------------------------------------------------------------------------
// LA DÉRIVATION
// ---------------------------------------------------------------------------

/**
 * CE QUE LA DÉRIVATION A DÛ CORRIGER, EN VOCABULAIRE FERMÉ.
 *
 * ⛔ CHAQUE NOTE EST UNE PHRASE DE `plan_rationale` (rang 2 de
 * `SYNTHESE-GENERATION-PLAN.md §6`: rien de dérivé ne part sans une ligne). Une
 * note sans phrase se lit comme un bug; une phrase sans note serait une
 * affirmation que rien ne produit.
 */
export type CookingPlanNote =
  /** « 1 course » demandait le congélateur, il n'est pas déclaré ⇒ 2 sessions. */
  | "runs_1_needs_freezer"
  /** Le style plafonne les sessions sous le nombre de courses demandé. */
  | "style_caps_sessions"
  /** La fenêtre est trop courte pour autant de sessions que de courses. */
  | "days_cap_sessions"
  /**
   * ⟳ LOT C (2026-09-04) — les courses demandées dépassaient les sessions, et
   * le plan les a ramenées. On ne va pas au magasin plus souvent qu'on ne
   * cuisine: c'est l'invariant `runs <= sessions`, tranché par l'utilisateur.
   */
  | "runs_capped_by_sessions"
  /**
   * ⟳ LOT 3 (2026-09-06) — des jours de cuisine DÉCLARÉS tombent dans la fenêtre :
   * ils placent les sessions et en fixent le nombre ; le style ne les déplace pas.
   */
  | "cook_days_declared"
  /** ⟳ LOT 3 — des jours déclarés, mais aucun dans la fenêtre : la dérivation s'applique, et c'est dit. */
  | "cook_days_out_of_window";

export interface CookingPlan {
  /** Combien de fois on cuisine. `1..MAX_COOKING_SESSIONS`. */
  sessions: number;
  /** Les jours de cuisine, en jetons, dans l'ordre du plan. */
  cookDays: DayToken[];
  /**
   * ⟳ LOT C (2026-09-04) — COMBIEN DE FOIS LE PLAN VA AU MAGASIN.
   *
   * ⛔ CE N'EST PLUS L'ENTRÉE, ET C'EST TOUT LE LOT. Avant, `runs` SEMAIT les
   * sessions (`sessions = min(runs, ...)`), si bien qu'une réponse de logistique
   * décidait combien de fois on cuisine. Désormais le style décide des sessions,
   * et les courses sont bornées par elles: `runs <= sessions`, toujours.
   *
   * ⚠️ CE N'EST PAS « la personne n'ira pas plus souvent ». Elle en a le droit,
   * et `unusedGroceryRuns` compte exactement cet écart pour que la rationale le
   * DISE. Ce nombre est ce que le PLAN organise — les vagues de la liste de
   * courses — pas ce que quelqu'un a le droit de faire de sa semaine.
   */
  runs: GroceryRuns;
  /** Ce qui part dans `cooking_time_min`. */
  sessionMinutes: number;
  difficulty: "simple" | "normal" | "keen";
  variety: "repeat" | "some" | "varied";
  /**
   * ⚠️ « CE PLAN S'APPUIE SUR LE CONGÉLATEUR », pas « il y en a un ». Vrai
   * quand une seule session doit tenir toute la fenêtre — c'est ce que la porte
   * `one_cooking_session` exige déjà, et on ne crée pas ici une QUATRIÈME
   * définition de la même règle.
   */
  usesFreezer: boolean;
  notes: CookingPlanNote[];
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LE PLAN DE CUISINE D'UNE FENÊTRE — sessions, jours, minutes, difficulté.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── LA RÈGLE, EN DEUX LIGNES ⟳ LOT C (2026-09-04) ─────────────────────────
 *   `sessions = min(cap(style), MAX_COOKING_SESSIONS, joursMangés)`
 *   `runs     = min(coursesDemandées, sessions)`
 *
 * et « 1 course » exige le congélateur — sinon deux COURSES, et on le DIT.
 *
 * ── CE QUI A ÉTÉ RENVERSÉ, ET SUR QUELLE AUTORITÉ ─────────────────────────
 * Jusqu'au 2026-09-04, `runs` SEMAIT les sessions: `sessions = min(runs, …)`.
 * Une réponse de logistique décidait donc combien de fois on cuisine, et « une
 * seule course » forçait « une seule session » (le commentaire A2 du
 * 2026-09-03, dans `generate-household-meal-v1/index.ts`, l'énonçait comme une
 * règle: acheter une fois, c'est tout cuire d'un coup).
 *
 * ⛔ CETTE RÈGLE INTERDISAIT LA CONFIGURATION QUE LE PRODUIT DOIT SERVIR.
 * « Une course, deux sessions » est précisément le cas où le congélateur sert:
 * on achète tout le dimanche, on CONGÈLE ce dont mercredi aura besoin, et la
 * liste de courses doit le marquer. Tant que `runs = 1` forçait `sessions = 1`,
 * ce cas ne pouvait pas exister, donc la marque « à congeler à l'achat » n'avait
 * aucun plan où se poser.
 *
 * L'invariant tranché est **`runs <= sessions`**: on ne va pas au magasin plus
 * souvent qu'on ne cuisine. Le sens de la contrainte est inversé — les courses
 * sont bornées PAR les sessions, elles ne les décident plus.
 *
 * ⚠️ ET ON NE FORCE TOUJOURS PAS UNE SESSION DE PLUS (voir le ⛔ plus bas): quand
 * quelqu'un demande trois courses et que son style n'en porte que deux, le PLAN
 * organise deux vagues et la rationale dit que deux suffisent. Il reste libre
 * d'aller au magasin une troisième fois; `unusedGroceryRuns` compte cet écart
 * pour qu'il soit DIT, jamais pour l'interdire.
 *
 * ── OÙ TOMBENT LES JOURS DE CUISINE ───────────────────────────────────────
 * La première session est au **rang 0** de la fenêtre. Depuis A1 (2026-09-03)
 * ce rang 0 est **la veille** quand il y en a une: on cuisine avant de manger,
 * ce qui est le geste que P1 a rendu automatique. Les suivantes découpent les
 * jours MANGÉS en tranches aussi égales que possible, et cuisinent le premier
 * jour de chacune.
 *
 * ⚠️ SUR LES JOURS MANGÉS, PAS SUR LE CALENDRIER NU. `daysToEat` est ce que
 * l'appelant a réellement à couvrir — les absences l'ont déjà réduit
 * (`resolveWindowPresence`). Espacer sur sept jours quand la personne n'en
 * mange que trois poserait une session sur un jour où il n'y a rien à cuisiner.
 *
 * ⛔ ON NE FORCE JAMAIS UNE SESSION DE PLUS. Le style PLAFONNE. Quelqu'un qui
 * dit « le moins possible » et « trois courses » obtient DEUX sessions et trois
 * courses possibles: la troisième est du frais du jour, et la rationale dit que
 * deux courses suffisent. L'inverse — lui imposer une troisième séance de
 * cuisine — serait décider à sa place (`plan_feasibility.ts:27-40`).
 *
 * @param windowDays la fenêtre ENTIÈRE en jetons, rang 0 en tête (la veille
 *   quand il y en a une). REQUIS: ce module ne sait pas dater, et recalculer
 *   les jetons ici ferait un second `windowDayOrder`.
 * @param leadDay `true` quand le rang 0 est un jour de CUISINE SANS REPAS
 *   (P1). Il change le découpage: les tranches portent sur les jours mangés,
 *   qui commencent au rang 1.
 * @param freezer `true`/`false` déclaré, `null` = jamais demandé. `null` et
 *   `false` refusent tous deux « une seule session »: on ne promet pas une
 *   semaine au congélateur à quelqu'un dont on ignore s'il en a un.
 */
export function deriveCookingPlan(input: {
  style: CookingStyle;
  runs: GroceryRuns;
  freezer: boolean | null;
  windowDays: readonly DayToken[];
  leadDay: boolean;
  daysToEat: number;
  /**
   * ⟳ LOT 3 (2026-09-06) — LES JOURS QUE LA PERSONNE A DONNÉS (« les jours où vous
   * cuisinez », `practical_constraints.cook_days`). Optionnel : un appelant qui
   * ne les porte pas obtient la dérivation d'hier, octet pour octet.
   *
   * ⛔ D2.4 EST RENVERSÉ ICI, ET LA RAISON EST MESURÉE. La dérivation avait
   * remplacé les jours déclarés parce que « l'écran écrit `[]` » ; M13 (duo,
   * 05/09) déclarait le dimanche et recevait trois sessions dim/mar/jeu sans
   * qu'une phrase le dise. Un jour déclaré est un fait de la maison, pas une
   * suggestion : il place la session, et tout écart est nommé.
   */
  declaredCookDays?: readonly string[];
}): CookingPlan {
  const profile = COOKING_STYLE_PROFILE[input.style];
  if (!profile) {
    throw new Error(`[keel/cooking_plan] style inconnu: ${JSON.stringify(input.style)}`);
  }
  if (!(GROCERY_RUNS as readonly number[]).includes(input.runs)) {
    throw new Error(`[keel/cooking_plan] runs hors 1..3: ${JSON.stringify(input.runs)}`);
  }
  if (typeof input.leadDay !== "boolean") {
    throw new Error("[keel/cooking_plan] `leadDay` est REQUIS et booléen");
  }
  if (input.freezer !== true && input.freezer !== false && input.freezer !== null) {
    throw new Error(
      "[keel/cooking_plan] `freezer` est REQUIS: true, false, ou null (jamais demandé) — " +
        "un `?` en ferait une garde désarmée",
    );
  }

  const notes: CookingPlanNote[] = [];
  const eaten = Math.max(1, Math.round(input.daysToEat));

  // ── ① LES SESSIONS, SEMÉES PAR LE STYLE ⟳ LOT C ────────────────────────
  // ⛔ ET PLUS PAR LES COURSES. C'est le renversement du lot, expliqué en tête.
  // `sessionCap` est la cadence que le style porte; c'est la seule réponse de
  // la personne qui parle de CUISINE, donc la seule qui a le droit de dire
  // combien de fois on cuisine.
  let wanted: number = profile.sessionCap;
  if (wanted > MAX_COOKING_SESSIONS) wanted = MAX_COOKING_SESSIONS;

  // ── ② LA FENÊTRE PLAFONNE ───────────────────────────────────────────────
  // Deux sessions sur deux jours mangés est déjà limite; trois est impossible.
  // Le refus est nommé plutôt que silencieux: sinon deux jours de cuisine
  // tomberaient sur la même date et `planGroceryWaves` rendrait une vague de
  // moins que ce que la rationale annonce.
  if (wanted > eaten) {
    wanted = eaten;
    notes.push("days_cap_sessions");
  }
  // ⟳ LOT 3 — les jours déclarés, dans l'ordre de la fenêtre, dédoublonnés.
  const declared = [
    ...new Set(
      (input.declaredCookDays ?? []).filter((d) => (DAY_TOKENS as readonly string[]).includes(d)),
    ),
  ] as DayToken[];
  const declaredInWindow = input.windowDays.filter((d, i, all) =>
    declared.includes(d) && all.indexOf(d) === i
  );
  let useDeclared = false;
  if (declared.length > 0) {
    if (declaredInWindow.length > 0) {
      useDeclared = true;
      notes.push("cook_days_declared");
      wanted = Math.min(declaredInWindow.length, MAX_COOKING_SESSIONS);
      if (wanted > eaten) {
        wanted = eaten;
        if (!notes.includes("days_cap_sessions")) notes.push("days_cap_sessions");
      }
    } else {
      notes.push("cook_days_out_of_window");
    }
  }
  const sessions = Math.max(1, wanted);

  // ── ③ LES COURSES, BORNÉES PAR LES SESSIONS ⟳ LOT C ────────────────────
  // ⛔ LA PORTE DU CONGÉLATEUR EST CELLE QUI EXISTE, pas une quatrième.
  // `hasFreezerDeclared` vit dans `kitchen_equipment.ts` et l'appelant la lit;
  // ici on ne fait que constater son verdict. Trois implémentations de cette
  // règle sont déjà alignées (`freezerMirror.int.test.ts`).
  //
  // ⚠️ ELLE POUSSE MAINTENANT LES COURSES, PLUS LES SESSIONS. « Une seule
  // course » sans congélateur reste impossible — rien ne tiendrait sept jours
  // au frais — mais le remède est d'aller au magasin une seconde fois, pas de
  // cuisiner une fois de moins.
  let runs: number = input.runs;
  if (runs === 1 && input.freezer !== true) {
    runs = 2;
    notes.push("runs_1_needs_freezer");
  }
  // Le style est la CAUSE quand c'est lui qui borne, et la rationale a déjà sa
  // phrase pour ça — on la garde armée sur le fait qui la justifie.
  if (input.runs > profile.sessionCap) notes.push("style_caps_sessions");
  if (runs > sessions) {
    runs = sessions;
    notes.push("runs_capped_by_sessions");
  }

  // ── ④ LES JOURS ─────────────────────────────────────────────────────────
  const days = [...input.windowDays];
  const lead = input.leadDay && days.length > 0 ? 1 : 0;
  const derivedCookDays: DayToken[] = [];
  for (let i = 0; i < sessions; i++) {
    // La PREMIÈRE session est au rang 0 — la veille quand il y en a une.
    const index = i === 0 ? 0 : lead + Math.floor((i * eaten) / sessions);
    const token = days[Math.min(index, days.length - 1)];
    if (token !== undefined && !derivedCookDays.includes(token)) derivedCookDays.push(token);
  }

  // ── ⑤ LES MINUTES ───────────────────────────────────────────────────────
  // ⚠️ LE ×2 N'EST PAS UNE CIBLE, C'EST UN PLAFOND, et c'est le même que celui
  // de `plan_feasibility.ts` (`SESSION_OVERRUN_FACTOR`). Il n'est PAS importé:
  // ce module ne borne pas la même chose — là-bas on tolère un dépassement
  // MESURÉ sur ce que le modèle a écrit, ici on ANNONCE un budget. Les deux
  // valent 2 aujourd'hui et n'ont aucune raison de bouger ensemble.
  //
  // Une seule session doit tenir toute la fenêtre: elle a le droit d'être
  // longue, et le dire évite que le modèle rende trois plats en 30 minutes.
  // ⟳ LOT 3 — déclarés dans la fenêtre : ce sont eux, bornés au nombre de sessions.
  const cookDays: DayToken[] = useDeclared ? declaredInWindow.slice(0, sessions) : derivedCookDays;
  const sessionMinutes = sessions === 1
    ? Math.min(240, profile.minutes * 2)
    : profile.minutes;

  return {
    sessions,
    runs: runs as GroceryRuns,
    cookDays,
    sessionMinutes,
    difficulty: profile.difficulty,
    variety: profile.variety,
    // ⚠️ « CE PLAN S'APPUIE SUR LE CONGÉLATEUR », pas « il y en a un ».
    //
    // ⛔ LE `input.freezer === true` EST NEUF, ET IL RÉPARE UN DÉFAUT LATENT.
    // Avant ce lot, `sessions === 1` suffisait, parce que ① garantissait qu'une
    // session unique impliquait un congélateur déclaré. Ce n'était vrai que par
    // ce chemin: une fenêtre d'UN SEUL jour mangé donne déjà `sessions === 1`
    // par le plafond de la fenêtre, sans congélateur nulle part — et le plan
    // annonçait alors qu'il s'appuie sur un appareil que personne n'a.
    //
    // ⟳ LOT C · LA SECONDE MOITIÉ: on s'appuie AUSSI sur le congélateur quand on
    // fait les courses moins souvent qu'on ne cuisine. C'est exactement le cas
    // « une course, deux sessions »: le cru de la session suivante est acheté
    // d'avance, donc congelé à l'achat.
    usesFreezer: input.freezer === true && (sessions === 1 || runs < sessions),
    notes,
  };
}

/**
 * L'ÉCART DE COURSES QUE LE PLAFOND LAISSE — ou `0`.
 *
 * « Trois courses, deux sessions » n'est PAS une erreur: la troisième course
 * est du frais du jour, et la personne a le droit d'y aller. Ce que la
 * rationale doit dire, c'est que le plan n'en a **pas besoin** — sinon deux
 * vagues de courses sous une réponse « trois » se lisent comme une option
 * ignorée.
 *
 * ⚠️ IL SE COMPTE SUR `runs`, PAS SUR `wanted`: le congélateur manquant a déjà
 * poussé « 1 » vers « 2 », et cet écart-là porte son propre nom
 * (`runs_1_needs_freezer`). Les confondre ferait dire « une course de trop »
 * à quelqu'un qui en avait demandé une seule.
 */
export function unusedGroceryRuns(runs: GroceryRuns, plan: CookingPlan): number {
  // ⟳ LOT C — CONTRE `plan.runs`, PLUS CONTRE `plan.sessions`. Les deux étaient
  // le même nombre tant que les courses semaient les sessions; ils ont divergé
  // avec le renversement, et c'est bien l'écart entre CE QUI A ÉTÉ DEMANDÉ et
  // CE QUE LE PLAN ORGANISE que la rationale doit dire.
  return Math.max(0, runs - plan.runs);
}

// ---------------------------------------------------------------------------
// CE QU'ON A LE DROIT DE PROPOSER — l'offre, 2026-09-04
// ---------------------------------------------------------------------------

/**
 * CE QUI A RESSERRÉ LA LISTE. Il existe pour être DIT, jamais pour être deviné
 * à l'écran: une option qui disparaît sans motif se lit comme une panne.
 */
export type GroceryRunsLimit =
  /** La case « tout cuisiner en une seule fois » est cochée. */
  | "one_session"
  /** La fenêtre est plus courte que trois jours. */
  | "days"
  /** Le style plafonne les sessions sous trois. */
  | "style";

export interface GroceryRunsOffer {
  /** Les cadences proposables, croissantes. JAMAIS vide: `1` reste toujours. */
  values: GroceryRuns[];
  /** La seule réponse possible, ou `null` tant qu'il reste un choix. */
  forced: GroceryRuns | null;
  /** Ce qui a resserré, ou `null` quand les trois tiennent. */
  limit: GroceryRunsLimit | null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COMBIEN DE COURSES ON A LE DROIT DE PROPOSER — et quand il n'y a plus rien
 * à demander.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT QU'ELLE FERME ───────────────────────────────────────────────
 * L'écran proposait les TROIS cadences à tout le monde. On demandait donc
 * « trois courses ? » pour un plan de deux jours, et « trois courses ? » à
 * quelqu'un qui venait de cocher « je cuisine tout en une seule fois ». Le
 * moteur rabotait ensuite en silence (`deriveCookingPlan` plafonne), et la
 * personne lisait dans l'explication du plan le refus d'une option qu'on lui
 * avait proposée deux écrans plus tôt.
 *
 * ── LA RÈGLE, EN UNE LIGNE ────────────────────────────────────────────────
 *   `max = min(3, plafond(style), ⌈jours ÷ conservation⌉)`, puis `1` si la
 *   case est cochée.
 *
 * ── ⚠️ LE PLAFOND DE FENÊTRE N'EST PAS « LE NOMBRE DE JOURS » ─────────────
 * Il l'a été une demi-journée, le 2026-09-04, et c'était faux — mesuré à
 * l'écran sur un plan du 4 au 5 septembre: DEUX courses proposées pour DEUX
 * jours, alors qu'un seul lot les couvre tous les deux. Compter les jours
 * répond à « combien de courses tiennent dans la fenêtre » ; la vraie question
 * est « combien il en FAUT », et c'est la CONSERVATION qui la tranche: un plat
 * cuisiné tient `maxFridgeDays` jours (jour de cuisson compris, décision
 * produit n° 14). Une session couvre donc trois jours, et sept jours en
 * demandent trois — pas sept.
 *
 * ⛔ ELLE EST LE MIROIR DE `deriveCookingPlan`, PAS UNE SECONDE RÈGLE, et
 * c'est pour ça qu'elle vit dans CE fichier. Les deux lisent les mêmes
 * constantes (`MAX_COOKING_SESSIONS`, `COOKING_STYLE_PROFILE[].sessionCap`):
 * un plafond retouché là-haut change l'offre ici sans que personne y pense.
 * Écrite dans le composant, elle aurait recopié `2` et `3` en dur — le jumeau
 * que ce dépôt a déjà supprimé une fois (`groceryWaves.ts`, 2026-08-10).
 *
 * ── ⚠️ CE QU'ELLE COÛTE, ÉCRIT ICI PARCE QUE C'EST UN RENVERSEMENT ────────
 * `unusedGroceryRuns` existe (dix lignes au-dessus) pour dire « trois courses,
 * deux sessions n'est PAS une erreur: la troisième est du frais du jour ».
 * Cette offre-ci REND CE CAS INATTEIGNABLE depuis l'écran: on ne propose plus
 * une cadence que le plan ne suivra pas. Décision produit du 2026-09-04, prise
 * en connaissance de cause. `unusedGroceryRuns` reste appelée — les comptes
 * qui portent déjà « 3 » avec un style `minimal` gardent leur phrase, et rien
 * n'efface leur réponse.
 *
 * ⛔ LE CONGÉLATEUR N'ENTRE PAS ICI. « Une seule course » sans congélateur est
 * une demande LÉGITIME: le moteur sert alors deux sessions et le DIT
 * (`runs_1_needs_freezer`). Le retirer de l'offre en ferait une quatrième
 * implémentation de la porte du congélateur — trois sont déjà alignées par
 * `freezerMirror.int.test.ts` —, et surtout un refus muet là où il existe une
 * phrase.
 *
 * @param style le style DÉCLARÉ, `null` = jamais demandé ⇒ aucun plafond de
 *   style. Une clé absente n'est pas « le moins possible » (cicatrice
 *   `20260818110000:48-51`), et la traiter comme telle retirerait la troisième
 *   cadence à tout compte qui n'a pas encore répondu.
 * @param oneCookingSession la case telle qu'elle est COCHÉE à l'écran — pas le
 *   verdict du serveur. C'est une intention de semaine, et l'offre suit ce que
 *   la personne vient de dire, pas ce que le moteur en fera.
 * @param daysToEat combien de jours la fenêtre demande.
 * @param maxFridgeDays `MAX_FRIDGE_DAYS` — combien de jours un plat cuisiné
 *   tient, jour de cuisson compris.
 *
 *   ⛔ PASSÉE, JAMAIS IMPORTÉE, et c'est la posture EXPLICITE de ce dépôt
 *   (`fridge_window.ts`, en-tête): la constante vit dans `meal_generation.ts`
 *   depuis l'origine et cinq fichiers la ré-exportent. En importer une ici
 *   ferait entrer tout le moteur dans le paquet du navigateur — ce module est
 *   monté par deux composants React —, et la redéclarer en ferait une SECONDE
 *   définition, « celle qu'on regarde le moins qui garde l'ancienne ».
 *   Côté test, elle est épinglée par un LITTÉRAL: paramétrer le test par sa
 *   propre constante le laisserait vert le jour où elle change.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function offerableGroceryRuns(input: {
  style: CookingStyle | null;
  oneCookingSession: boolean;
  daysToEat: number;
  maxFridgeDays: number;
}): GroceryRunsOffer {
  if (!Number.isFinite(input.daysToEat)) {
    throw new Error(
      `[keel/cooking_plan] daysToEat non fini: ${JSON.stringify(input.daysToEat)}`,
    );
  }
  if (!Number.isFinite(input.maxFridgeDays) || input.maxFridgeDays < 1) {
    throw new Error(
      "[keel/cooking_plan] `maxFridgeDays` est REQUIS et >= 1: " +
        JSON.stringify(input.maxFridgeDays),
    );
  }
  if (typeof input.oneCookingSession !== "boolean") {
    throw new Error(
      "[keel/cooking_plan] `oneCookingSession` est REQUIS et booléen — " +
        "un `?` en ferait une garde désarmée",
    );
  }

  let max: number = MAX_COOKING_SESSIONS;
  let limit: GroceryRunsLimit | null = null;

  // ── ① LE STYLE PLAFONNE, quand il a été déclaré ─────────────────────────
  if (input.style !== null) {
    const profile = COOKING_STYLE_PROFILE[input.style];
    if (!profile) {
      throw new Error(
        `[keel/cooking_plan] style inconnu: ${JSON.stringify(input.style)}`,
      );
    }
    if (profile.sessionCap < max) {
      max = profile.sessionCap;
      limit = "style";
    }
  }

  // ── ② LA CONSERVATION PLAFONNE AUSSI ────────────────────────────────────
  // ⛔ COMBIEN DE SESSIONS IL EN FAUT, pas combien il en tiendrait. Un lot
  // couvre `maxFridgeDays` jours: deux jours n'en demandent qu'UNE, et sept
  // en demandent trois. Compter les jours proposait deux courses pour deux
  // jours — le défaut mesuré à l'écran le 2026-09-04.
  //
  // ⚠️ `<=` ET PAS `<`, ET C'EST LE MOTIF QUI EST LU À L'ÉCRAN. Quand les deux
  // plafonds tombent sur le même nombre, c'est la FENÊTRE qu'on nomme: elle
  // est concrète, datée, et la personne vient de la régler trois champs plus
  // haut. « Ton style ne permet pas trois courses » devant un plan trop court
  // envoie corriger la mauvaise réponse.
  const days = Math.max(1, Math.floor(input.daysToEat));
  const needed = Math.ceil(days / input.maxFridgeDays);
  if (needed < MAX_COOKING_SESSIONS && needed <= max) {
    max = needed;
    limit = "days";
  }

  // ── ③ « TOUT EN UNE SEULE FOIS » TRANCHE, ET IL PASSE DERNIER ───────────
  // Une seule cuisson veut dire une seule vague de courses: le module des
  // vagues ne sait pas en produire plus d'une par session. Il gagne sur les
  // deux autres motifs parce que c'est le seul que la personne vient de
  // COCHER — nommer la fenêtre devant une case qu'on active à l'instant ferait
  // chercher la cause au mauvais endroit.
  if (input.oneCookingSession) {
    max = 1;
    limit = "one_session";
  }

  const values = GROCERY_RUNS.filter((runs) => runs <= max);
  return {
    values,
    forced: values.length === 1 ? values[0] : null,
    limit,
  };
}

/**
 * LES JOURS DE FRIGO QUE LE DÉCOUPAGE DEMANDE À TENIR — le plus long écart
 * entre deux sessions, en jours.
 *
 * Il n'est PAS une garde: `grocery_waves.ts` décide déjà quand acheter quoi, et
 * un écart long veut simplement dire que la vague suivante portera le frais.
 * Il existe pour la rationale et pour les tests, qui doivent pouvoir dire
 * « cette découpe demande cinq jours de conservation » sans recalculer les
 * rangs.
 */
export function longestFridgeStretch(
  plan: CookingPlan,
  windowDays: readonly DayToken[],
): number {
  const ranks = plan.cookDays
    .map((d) => windowDays.indexOf(d))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  if (ranks.length === 0) return 0;
  let longest = windowDays.length - ranks[ranks.length - 1];
  for (let i = 1; i < ranks.length; i++) {
    longest = Math.max(longest, ranks[i] - ranks[i - 1]);
  }
  return longest;
}

// ---------------------------------------------------------------------------
// CE QUE LES DEUX LANES LISENT — une seule résolution, appelée deux fois
// ---------------------------------------------------------------------------

/** Ce que `readCookingCapacity` rend aujourd'hui, dans les deux lanes. */
export interface DeclaredCookingCapacity {
  cookDays: string[];
  cookingTimeMin: number | null;
  recipeDifficulty: string | null;
  variety: string | null;
  /**
   * ⚠️ IL TRAVERSE SANS ÊTRE TOUCHÉ, et il est dans le type EXPRÈS. Le budget
   * n'a rien à voir avec le style de cuisine, mais il vit dans le même objet
   * chez les deux appelants: l'omettre du type obligerait chacun à recomposer
   * `{...capacity, ...resolved}` à la main, et c'est très exactement le genre
   * de recopie où un champ se perd en silence.
   */
  budgetAmount: number | null;
}

export interface ResolvedCookingCapacity extends DeclaredCookingCapacity {
  /**
   * LE PLAN DÉRIVÉ, ou `null` = **les deux questions n'ont pas été posées**.
   *
   * `null` est le chemin de tout compte antérieur à P2, et il rend la sortie
   * BYTE-IDENTIQUE à celle d'avant ce lot: les quatre champs déclarés
   * ressortent tels quels, et aucune phrase de rationale ne s'ajoute.
   */
  plan: CookingPlan | null;
  /**
   * ⟳ LOT C (2026-09-04) — `impliesOneSession` A ÉTÉ RETIRÉ, PAS OUBLIÉ.
   *
   * Il portait « une seule course vaut tout dans une session ». C'est
   * exactement la règle que ce lot renverse: acheter une fois n'oblige plus à
   * cuisiner une fois, parce qu'un congélateur déclaré permet d'acheter le
   * dimanche et de cuisiner aussi le mercredi. La demande explicite
   * (`body.one_cooking_session`) reste, et elle est la SEULE porte.
   *
   * ⛔ On ne le garde pas à `false`: un champ toujours faux est une garde
   * désarmée qui ressemble à une garde. Cette fonction ne reçoit pas la case
   * explicite, donc elle ne peut plus répondre à cette question — elle se tait.
   */
}

/**
 * LES DEUX RÉPONSES DE P2, APPLIQUÉES À CE QUI EST DÉCLARÉ.
 *
 * ⛔ APPELÉE PAR LES DEUX LANES, ET C'EST LA RAISON D'ÊTRE DE CETTE FONCTION.
 * `readCookingCapacity` est **dupliquée** dans `generate-meal-v1` et
 * `generate-household-meal-v1` — sans un seul test qui compare les deux, état
 * constaté le 2026-09-03. La dérivation, elle, ne sera pas dupliquée: elle vit
 * ici, et un test lit LES DEUX SOURCES pour vérifier qu'elles l'appellent.
 *
 * ── CE QUI CHANGE, ET CE QUI NE CHANGE PAS ────────────────────────────────
 *   · `cookDays` devient la DÉRIVATION (rang 0 = la veille, puis les tranches);
 *     c'est ce qui réveille `cookDayLines`, `daysOutOfBatchReach` et
 *     `weeklyCookingMinutes`, endormis depuis que l'écran écrit `[]` (D2.4 —
 *     réveil ASSUMÉ et DIT, pas un nettoyage);
 *   · `cookingTimeMin` devient le budget du style;
 *   · `recipeDifficulty` et `variety` deviennent CELLES DU STYLE.
 *
 * ⛔ CES DEUX-LÀ ONT FAILLI NE PAS ÊTRE DÉRIVÉES, SUR UNE AFFIRMATION
 * D'ABSENCE FAUSSE — et le motif de l'erreur mérite d'être écrit ici, parce
 * qu'il se reproduira. J'avais écrit « aucune des deux n'a de lecteur dans les
 * deux générateurs », après avoir cherché `recipeDifficulty` dans les deux
 * `index.ts`. Zéro occurrence, donc zéro lecteur — sauf que **les deux lanes
 * nourrissent `buildMealPrompt` par `...capacity`** (`generate-meal-v1:2241`,
 * `generate-household-meal-v1:4410`), et que le prompt les émet
 * (`meal_generation.ts:4073-4076`: « recipe level they want: … »,
 * « repetition they accept: … »).
 *
 * ⚠️ **UN `...spread` REND UN CHAMP INVISIBLE À `grep`.** Chercher le NOM d'un
 * champ ne prouve rien quand il voyage dans un objet: il faut suivre l'OBJET.
 * Mesuré par sonde sur l'appel réel: +60 octets de consigne. Le coût produit de
 * l'erreur: qui répond « j'aime cuisiner » obtenait ses 120 minutes et un
 * prompt MUET sur le niveau de recette et la répétition.
 *
 * @param freezer déjà réduit à un booléen par `hasFreezerDeclared` chez
 *   l'appelant — « pas de congélateur » et « jamais demandé » y rendent le
 *   même `false`, et c'est la direction fail-closed voulue.
 */
export function resolveCookingCapacity(input: {
  declared: DeclaredCookingCapacity;
  style: CookingStyle | null;
  /**
   * ⟳ 2026-09-09 — ACCEPTE « peu importe » EN PLUS D'UN NOMBRE. La résolution
   * se fait ICI et nulle part ailleurs: c'est le seul endroit où la cadence
   * entre dans la dérivation, donc le seul où l'écran et le moteur ne peuvent
   * pas diverger.
   */
  runs: GroceryRunsAnswer | null;
  freezer: boolean;
  windowDays: readonly DayToken[];
  leadDay: boolean;
  daysToEat: number;
  /**
   * ⟳ 2026-09-09 — LES DEUX ENTRÉES DE L'OFFRE, REQUISES ET JAMAIS `?`.
   *
   * Elles ne servent QU'À résoudre « peu importe », et c'est précisément
   * pourquoi elles ne peuvent pas être optionnelles: un appelant qui les
   * oublierait résoudrait sur une offre fausse — donc trois courses pour un
   * plan de trois jours — sans qu'une ligne de type ne bronche. « Un paramètre
   * de garde optionnel est une garde désarmée », sept fois dans ce dépôt.
   */
  oneCookingSession: boolean;
  /** La conservation, REÇUE — ce module ne l'importe pas (voir son en-tête). */
  maxFridgeDays: number;
}): ResolvedCookingCapacity {
  const runs = resolveGroceryRunsAnswer(
    input.runs,
    offerableGroceryRuns({
      style: input.style,
      oneCookingSession: input.oneCookingSession,
      daysToEat: input.daysToEat,
      maxFridgeDays: input.maxFridgeDays,
    }),
  );
  // ⛔ LES DEUX RÉPONSES, OU AUCUNE. Un style sans cadence de courses ne dit
  // pas combien de fois on cuisine, et une cadence sans style ne dit pas
  // combien de temps. Deviner la manquante servirait un plan sur une moitié de
  // réponse — et c'est très exactement ce que « clé absente ≠ minimal » refuse.
  if (input.style === null || runs === null) {
    return { ...input.declared, plan: null };
  }
  const plan = deriveCookingPlan({
    style: input.style,
    // ⟳ LOT 3 — les jours déclarés ENTRENT dans la dérivation au lieu d'être
    // remplacés par elle (voir `deriveCookingPlan`, et D2.4 renversé).
    declaredCookDays: input.declared.cookDays,
    runs,
    freezer: input.freezer,
    windowDays: input.windowDays,
    leadDay: input.leadDay,
    daysToEat: input.daysToEat,
  });
  return {
    ...input.declared,
    cookDays: [...plan.cookDays],
    cookingTimeMin: plan.sessionMinutes,
    // ⛔ LES DEUX AUTRES LEVIERS DU STYLE, ET ILS ATTEIGNENT LE MODÈLE. Voir
    // l'en-tête: ils voyagent par `...capacity` jusqu'à `buildMealPrompt`, qui
    // les émet en toutes lettres. Les laisser déclarés ferait dire au prompt
    // « recettes simples » à quelqu'un qui vient de répondre « j'aime
    // cuisiner » — le style et la consigne se contrediraient dans le même
    // message.
    recipeDifficulty: COOKING_STYLE_PROFILE[input.style].difficulty,
    variety: COOKING_STYLE_PROFILE[input.style].variety,
    plan,
  };
}
