/**
 * UNE COCHE SUR UN PLAT CONSTATE LA SESSION QUI L'A PRODUIT — lot M8.
 *
 * Autorité produit: `scratchpad/2026-08-21-DESIGN-MEMOIRE.md` §3.5 M8.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT MESURÉ — ET CE N'ÉTAIT PAS CELUI QU'ON CROYAIT
 * ═══════════════════════════════════════════════════════════════════════════
 * `cooking_session_states` est à **0**, et le design en concluait que le retour
 * n'avait jamais été répondu. Mesuré le 2026-09-01, en pilotant la chaîne
 * entière sur un plan réel: **elle marche**. Décoche → formulaire → « pas eu le
 * temps » → la question sort → la réponse s'écrit → la cascade retire 8 repas
 * et propose un décalage. Rien n'est cassé.
 *
 * Ce qui manque est ailleurs, et c'est plus simple: **`writeSessionState`
 * n'avait qu'UN SEUL appelant**, le formulaire d'accident. La question n'est
 * donc atteignable qu'à quatre taps de profondeur, et seulement pour quelqu'un
 * qui vient de signaler un accident sur un plat qui puise dans cette session.
 *
 * ⇒ Tout le monde d'autre coche « j'ai mangé le poulet » chaque soir, ce plat
 * puise dans la préparation faite dimanche — **donc la session de dimanche a eu
 * lieu**, et on ne l'écrit nulle part. La table reste vide, la question sera
 * posée plus tard sur une session qu'on savait déjà, et tout lecteur de cette
 * table lit « on n'en sait rien » pour toujours.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ ON N'AJOUTE AUCUNE COLLECTE, ET C'EST LA CONDITION DU LOT
 * ═══════════════════════════════════════════════════════════════════════════
 * La bande du soir est une **AFFORDANCE, PAS UNE QUESTION** — c'est sa règle
 * fondatrice, et ce qui la rend compatible avec T3 (« le chat n'initie jamais
 * une collecte »). Y ajouter « la session de dimanche a-t-elle eu lieu ? »
 * ferait tomber cette frontière, et avec elle toute la fiche FF-058.
 *
 * Ce module ne demande donc RIEN. Il lit le tap que la personne fait déjà.
 * *« On n'ajoute AUCUNE collecte. On réduit le prix d'un geste que la personne
 * voulait déjà faire »* — `evening_strip.ts`, mot pour mot.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ UNE COCHE EST UNE PREUVE POSITIVE. UNE DÉCOCHE N'EST PREUVE DE RIEN.
 * ═══════════════════════════════════════════════════════════════════════════
 * « J'ai mangé le plat » ⇒ la préparation existait ⇒ la session a eu lieu. Le
 * raisonnement tient dans ce sens **et dans ce sens seulement**.
 *
 * « Je n'ai pas mangé le plat » ne dit RIEN de la session: la personne a pu
 * commander, manger autre chose, ou ne pas avoir faim, sur une préparation
 * parfaitement faite. C'est précisément pour ça que le formulaire d'accident
 * POSE la question au lieu de la déduire — et déduire `happened: false` d'une
 * décoche retirerait des repas d'un plan sur une inférence fausse.
 *
 * ⇒ Ce module n'écrit **jamais** `happened: false`. Ce cas garde son seul juge:
 * la personne, à qui on demande.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ TROIS GARDES, ET AUCUNE N'EST DÉCORATIVE
 * ═══════════════════════════════════════════════════════════════════════════
 * ① **JAMAIS UNE SESSION DU FUTUR.** Constater « la cuisson de jeudi a eu
 *    lieu » un mardi serait écrire une preuve fabriquée — la même règle que la
 *    question elle-même (condition 2 de `sessionQuestionFor`).
 * ② **JAMAIS PAR-DESSUS UNE LIGNE EXISTANTE.** Une ligne, quelle que soit sa
 *    valeur, ferme la question POUR DE BON. Écraser un `happened: false` que la
 *    personne a DÉCLARÉ par un `true` déduit d'une coche, c'est remplacer son
 *    témoignage par notre inférence.
 * ③ **LE LIEN ÉCRIT, JAMAIS LA PROXIMITÉ DES DATES.** Un plat n'appartient à
 *    une session que par `preparationIds` — la même règle que la condition 1 de
 *    `sessionQuestionFor`. Rapprocher par la date ferait constater une session
 *    dont le plat coché ne puise rien.
 *
 * PURE MODULE: aucun I/O, aucune horloge, aucun aléatoire. Le jour arrive
 * TOUJOURS en paramètre; l'écriture appartient à l'appelant.
 */

import type { AccidentPlan } from "./accident.ts";

/** Une session à constater: son jour de cuisson, tel que le plan le date. */
export interface SessionToConfirm {
  /** `YYYY-MM-DD`. */
  readonly cookOn: string;
}

export interface SessionsFromTicks {
  /** Les sessions que ces coches CONSTATENT. Jamais du futur, jamais connues. */
  readonly confirm: readonly SessionToConfirm[];
  /**
   * Ce qui n'a pas été retenu, par motif. Jamais un silence.
   *
   * ⚠️ SANS CES NOMBRES, « 0 session constatée » NE SE DISTINGUE PAS DE « 0 SOIR
   * OBSERVÉ ». C'est la forme exacte sous laquelle ce lot est resté invisible:
   * la table à zéro se lisait « le retour n'a jamais été répondu », alors que la
   * chaîne marchait et que personne ne la traversait.
   */
  readonly skipped: {
    /** La session est datée d'APRÈS le jour de la coche. */
    readonly future: number;
    /** Une ligne existe déjà: la question est close, on ne la rouvre pas. */
    readonly known: number;
    /** Aucun plat coché ne puise dans cette session. */
    readonly unlinked: number;
  };
}

const EMPTY: SessionsFromTicks = {
  confirm: [],
  skipped: { future: 0, known: 0, unlinked: 0 },
};

/**
 * QUELLES SESSIONS CES COCHES CONSTATENT.
 *
 * @param dishIndexes les plats que la personne vient de COCHER. ⛔ Les décoches
 *   n'entrent pas ici: l'appelant ne passe que les coches positives, parce
 *   qu'une décoche n'est preuve de rien (voir l'en-tête).
 * @param known les `cook_on` pour lesquels une ligne existe DÉJÀ.
 * @param today le jour local de la personne, `YYYY-MM-DD`.
 */
export function sessionsConfirmedByTicks(args: {
  plan: AccidentPlan;
  dishIndexes: readonly number[];
  dates: Readonly<Record<string, string>>;
  known: ReadonlySet<string>;
  today: string;
}): SessionsFromTicks {
  const ticked = new Set(
    (args.dishIndexes ?? []).filter((i) => Number.isInteger(i) && i >= 0),
  );
  if (ticked.size === 0) return EMPTY;

  // ⛔ LE LIEN ÉCRIT: on part des `preparationIds` des plats COCHÉS, jamais de
  // leur date. Un plat sans préparation ne constate aucune session — il a été
  // fait sur le moment.
  const drawn = new Set<string>();
  for (const dish of args.plan?.dishes ?? []) {
    if (!ticked.has(dish.dishIndex)) continue;
    for (const id of dish.preparationIds ?? []) drawn.add(id);
  }
  if (drawn.size === 0) return EMPTY;

  let future = 0;
  let known = 0;
  let unlinked = 0;
  const confirm: SessionToConfirm[] = [];
  const seen = new Set<string>();

  for (const session of args.plan?.sessions ?? []) {
    const links = (session.preparationIds ?? []).some((id) => drawn.has(id));
    if (!links) {
      unlinked += 1;
      continue;
    }
    const cookOn = args.dates?.[session.day] ?? "";
    // Un jour illisible n'est pas une session à constater: il n'a pas de date à
    // écrire, et en inventer une écrirait un fait sur un jour qui n'existe pas.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cookOn)) {
      unlinked += 1;
      continue;
    }
    // ① JAMAIS DU FUTUR.
    if (cookOn > args.today) {
      future += 1;
      continue;
    }
    // ② JAMAIS PAR-DESSUS UNE LIGNE EXISTANTE.
    if (args.known?.has(cookOn)) {
      known += 1;
      continue;
    }
    // Deux sessions du même jour ne se comptent qu'une fois: la clé de la table
    // est `(user_id, generated_meal_id, cook_on)`.
    if (seen.has(cookOn)) continue;
    seen.add(cookOn);
    confirm.push({ cookOn });
  }

  return { confirm, skipped: { future, known, unlinked } };
}
