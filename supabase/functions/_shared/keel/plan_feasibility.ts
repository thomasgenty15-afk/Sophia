/**
 * CE QUE LA SEMAINE DEMANDÉE PEUT TENIR. Module PUR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QU'IL FERME, MESURÉ LE 2026-09-01
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Un foyer déclare UNE session de cuisine et sept jours. La fenêtre du cuit
 * (`MAX_FRIDGE_DAYS = 3`) fait qu'un lot du dimanche ne nourrit que dimanche,
 * lundi et mardi. Mercredi à samedi n'ont donc AUCUN lot atteignable — et le
 * modèle leur écrivait quand même des plats qui puisent dans la casserole du
 * dimanche. Le parseur les jetait: huit repas sur vingt-et-un, quatre journées
 * réduites à leur petit-déjeuner.
 *
 * La consigne le disait pourtant déjà, en toutes lettres:
 *
 *     « If the only cooking day you have is Sunday, then Thursday, Friday and
 *       Saturday cannot live off a Sunday batch — those days cook for
 *       themselves, or they eat something that needs no batch at all. »
 *
 * Elle ne mord pas, et le motif est celui que ce dépôt a déjà payé sur les
 * jours de cuisine ajoutés: **une règle générale ne se compare pas, un jour
 * NOMMÉ si**. `addedCookDays` a réglé son cas en nommant le jour; ce module
 * fait la même chose pour les jours qu'aucun lot n'atteint.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CE MODULE N'AJOUTE AUCUN JOUR DE CUISINE, ET C'EST UNE DÉCISION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Il aurait été facile de « réparer » en posant d'autorité les sessions
 * manquantes. On ne le fait pas, pour deux raisons qui tiennent ensemble:
 *
 *   ① Une session de cuisine en plus, c'est une VAGUE DE COURSES en plus
 *     (`grocery_waves.ts` déduit le calendrier d'achat des jours de cuisson).
 *     Imposer un deuxième créneau, c'est imposer un deuxième déplacement à
 *     quelqu'un qui a dit n'en vouloir qu'un.
 *   ② La sortie honnête existe déjà et elle est moins chère: ces jours-là
 *     cuisinent frais, ou mangent quelque chose qui ne demande aucun lot. La
 *     personne a dit ce qu'elle pouvait faire; c'est le CONTENU qui s'adapte,
 *     pas son agenda.
 *
 * Ce module dit donc CE QUI EST HORS DE PORTÉE. Le prompt le nomme, et
 * `plan_rationale` le dit à la personne. Personne n'écrit à sa place.
 *
 * ⚠️ IL N'Y A DONC PAS DE `sessionsFloor` EXPORTÉ ICI. Le nombre
 * `ceil(jours / MAX_FRIDGE_DAYS)` se calcule en une ligne, mais RIEN NE LE
 * LIRAIT: ce qui atteint le modèle et l'écran, ce sont des JOURS nommés, pas un
 * compte. Un export que personne n'appelle est un lot désarmé qui ressemble à
 * un lot qui marche — ce dépôt en a déjà payé plusieurs.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

/**
 * LES JOURS DE LA FENÊTRE QU'AUCUN LOT NE PEUT NOURRIR.
 *
 * Un jour est ATTEIGNABLE s'il existe un jour de cuisine au même rang ou avant,
 * assez proche pour que ce qui y est cuisiné tienne jusqu'à lui.
 *
 * ── LES DEUX FAÇONS D'ÊTRE HORS DE PORTÉE, ET ELLES COMPTENT PAREIL ───────
 *   · rien n'a encore été cuisiné à ce rang-là (aucun jour de cuisine avant);
 *   · le dernier lot est trop vieux (l'écart dépasse la fenêtre).
 * Les deux produisent la même conséquence — ce jour ne peut pas manger de lot —
 * et la consigne servie est la même. Les séparer ferait deux phrases pour un
 * seul fait.
 *
 * ── LE CONGÉLATEUR ────────────────────────────────────────────────────────
 * `hasFreezer` élargit la fenêtre parce que le modèle a le droit de déclarer
 * `kept: "freezer"` (lot du 2026-09-01). Ce n'est pas une promesse qu'il le
 * FERA: c'est la même asymétrie que partout ici — on n'interdit pas d'avance
 * ce que la garde d'aval saura vérifier. Sans congélateur, en revanche, aucune
 * déclaration ne peut ouvrir la fenêtre, et le nommer est donc toujours juste.
 *
 * @param maxFridgeDays `MAX_FRIDGE_DAYS`. PASSÉE, jamais importée — même règle
 *   que `fridge_window.ts`: un test qui passerait la constante qu'il vérifie se
 *   re-paramètre tout seul.
 * @param freezerWindowDays `FREEZER_WINDOW_DAYS`, pour la même raison.
 *
 * Rend `[]` — jamais `null` — quand tout est atteignable, ce qui est le cas
 * nominal d'un plan court ou bien fourni en jours de cuisine.
 */
export function daysOutOfBatchReach(input: {
  /** Les jours de la fenêtre, DANS L'ORDRE DU PLAN. `[]` = fenêtre inconnue. */
  window: readonly string[];
  /**
   * Les jours où la cuisine a lieu — `usableCookDays` PLUS ce que
   * `addedCookDays` a posé. REQUIS, et c'est l'union qui compte: lire les seuls
   * jours déclarés déclarerait hors de portée un jour que le moteur vient
   * justement de rendre atteignable.
   */
  cookDays: readonly string[];
  /** `hasKitchenTool(eq, "freezer") === true`. REQUIS, jamais optionnel. */
  hasFreezer: boolean;
  maxFridgeDays: number;
  freezerWindowDays: number;
}): string[] {
  if (typeof input?.hasFreezer !== "boolean") {
    throw new Error(
      "[keel/plan_feasibility] daysOutOfBatchReach: hasFreezer est REQUIS et " +
        "booléen — un appelant qui n'a pas lu l'inventaire passe `false`",
    );
  }
  const window = input.window ?? [];
  if (window.length === 0) return [];

  // ⚠️ LES RANGS VIENNENT DE LA FENÊTRE, JAMAIS DU CALENDRIER. Un plan qui part
  // un jeudi a `thu` au rang 0; comparer des jetons dans l'ordre lundi→dimanche
  // ferait croire que le dimanche précède le jeudi.
  const cookAt = new Set<number>();
  for (const day of input.cookDays ?? []) {
    const at = window.indexOf(day);
    if (at >= 0) cookAt.add(at);
  }
  if (cookAt.size === 0) {
    // ⛔ AUCUN JOUR CONNU ⇒ ON NE SAIT RIEN, ET ON NE DIT RIEN. La première
    // écriture rendait ici la fenêtre ENTIÈRE (« rien n'est cuisiné, donc rien
    // n'est à portée »), et un test d'un autre lot l'a attrapée le 2026-09-01:
    // `meal_precedence_test.ts :: « le silence de la CAPACITÉ est nommé »`.
    //
    // C'était faux, et pour une raison de PRODUIT. Deux décors mènent ici —
    // aucun jour coché, ou aucun jour coché qui tombe dans la fenêtre — et dans
    // les deux `cookDayLines` laisse le MODÈLE choisir ses jours de cuisson
    // (« put the cooking sessions on the days you do have, as early as
    // possible »). Ce n'est pas une absence de cuisine, c'est une cuisine dont
    // on ignore la date. Nommer toute la semaine hors de portée interdirait
    // alors le moindre lot à quelqu'un qui n'a jamais rien refusé.
    //
    // Le silence est ici la seule affirmation vraie: la garde d'aval, elle,
    // saura toujours compter ce qui n'a pas tenu.
    return [];
  }

  const reach = input.hasFreezer ? input.freezerWindowDays : input.maxFridgeDays;
  const out: string[] = [];
  for (let i = 0; i < window.length; i++) {
    // Le lot le plus RÉCENT au rang `i` ou avant.
    let last = -1;
    for (const at of cookAt) if (at <= i && at > last) last = at;
    // `i - last >= reach` est la MÊME comparaison que `cookedWindowVerdict`,
    // volontairement: la porte d'aval jette exactement ce que celle-ci nomme.
    // Un `>` ici et un `>=` là-bas laisseraient passer une journée que le
    // parseur viderait ensuite — c'est-à-dire le défaut d'origine, déplacé.
    if (last < 0 || i - last >= reach) out.push(window[i]);
  }
  return out;
}

/**
 * LA SESSION VA-T-ELLE DEVOIR DÉBORDER, ET DE COMBIEN ?
 *
 * ── L'INTUITION EST INVERSÉE, ET C'EST LE POINT ───────────────────────────
 * « Un seul jour de cuisine et trente minutes ⇒ la session sera plus longue »
 * semble évident. Le moteur faisait l'inverse: la consigne traite les minutes
 * comme un PLAFOND — « cook LESS in that session and put the rest on another
 * cooking day ». Avec un seul jour, « le rest » n'a nulle part où aller: le
 * modèle cuisine moins, et la semaine sous-nourrit.
 *
 * Décision du 2026-09-01: **le moteur déborde et il le dit.** Pas « raccourcir
 * la fenêtre » (le produit déciderait combien de jours on mange), pas « ajouter
 * un jour » (une sortie courses de plus, non demandée).
 *
 * ⚠️ `SESSION_OVERRUN_FACTOR` EST UN PLAFOND, PAS UNE CIBLE. Sans borne, la
 * permission « tu peux déborder » rend le nombre déclaré décoratif, et on
 * revient à l'état d'avant `cookingTimeMin`: une session de 55 minutes annoncée
 * à 30. Le facteur se change ICI, en une ligne, et son nom dit ce qu'il est.
 */
export const SESSION_OVERRUN_FACTOR = 2;

/**
 * LES MINUTES QU'UNE SESSION A LE DROIT DE PRENDRE, quand elle est seule à
 * porter la semaine. `null` quand rien n'a été déclaré — on ne fabrique pas un
 * plafond que personne n'a demandé.
 *
 * ⚠️ IL NE S'OUVRE QUE SUR LA CONTRAINTE. Une semaine à trois jours de cuisine
 * n'a aucune raison de déborder: le reste va sur un autre jour, comme la
 * consigne l'a toujours dit. La permission ne se donne QUE là où elle est la
 * seule sortie — sinon c'est une invitation générale à dépasser.
 */
export function sessionCeilingMinutes(input: {
  cookingTimeMin: number | null;
  /** Y a-t-il des jours qu'aucun lot n'atteint ? (`daysOutOfBatchReach`) */
  outOfReachDays: number;
  /** Combien de jours de cuisine la fenêtre porte réellement. */
  cookDayCount: number;
  /**
   * LA PERSONNE A-T-ELLE DEMANDÉ UNE SESSION UNIQUE ? — 2026-09-01, lot 3.
   *
   * ⛔ REQUIS, JAMAIS `?`, ET C'EST LA MOITIÉ QUI COMPTE. Sans lui, l'option
   * « tout dans une session » partait dans le mur le plus silencieux du
   * moteur: avec un congélateur, `outOfReachDays` vaut ZÉRO (la fenêtre
   * congelée couvre le plan entier), donc cette fonction rendait `null`, donc
   * les trente minutes déclarées restaient un plafond SEC sur la seule session
   * de la semaine. Le modèle aurait cuisiné moins — c'est la mesure connue des
   * plans qui n'atteignent pas 72 % de leur enveloppe — et l'option aurait
   * livré des journées vides en promettant l'inverse.
   *
   * La tension n'est donc pas seulement « des jours hors de portée »: c'est
   * « une seule session porte toute la semaine », et la demande explicite est
   * l'AUTRE façon d'y arriver.
   */
  singleSessionAsked: boolean;
}): number | null {
  if (typeof input?.singleSessionAsked !== "boolean") {
    throw new Error(
      "[keel/plan_feasibility] sessionCeilingMinutes: singleSessionAsked est " +
        "REQUIS et booléen — un appelant qui ne pose pas la question passe `false`",
    );
  }
  const declared = input?.cookingTimeMin;
  if (declared === null || !Number.isFinite(declared) || declared <= 0) return null;
  // ⚠️ LA DEMANDE EXPLICITE PASSE AVANT LE CONSTAT. Une session unique demandée
  // porte toute la semaine PAR CONSTRUCTION, même quand le congélateur fait que
  // plus aucun jour n'est hors de portée — c'est précisément le décor où le
  // constat se tait et où la tension est maximale.
  if (input.singleSessionAsked) return Math.round(declared * SESSION_OVERRUN_FACTOR);
  // Pas de tension: le plafond déclaré reste le plafond, mot pour mot.
  if (input.outOfReachDays === 0 || input.cookDayCount > 1) return null;
  return Math.round(declared * SESSION_OVERRUN_FACTOR);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LE JOUR DE LA SESSION UNIQUE — 2026-09-01, lot 3.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── CE QUE L'OPTION VEUT DIRE, ET CE QU'ELLE NE PEUT PAS VOULOIR DIRE ─────
 * « Tout mettre dans une session de cuisine » ne CHOISIT pas un jour: elle
 * n'en garde qu'un. Le jour reste celui de la personne — le PREMIER de ceux
 * qu'elle a cochés et que la fenêtre contient. Prendre le dernier laisserait
 * les journées d'avant sans rien (`daysOutOfBatchReach` les nommerait toutes),
 * et prendre un jour non coché serait écrire son agenda à sa place.
 *
 * ⚠️ L'ORDRE EST CELUI DE LA FENÊTRE, JAMAIS CELUI DES JETONS. Un plan qui part
 * un jeudi a `thu` au rang 0; comparer dans l'ordre lundi→dimanche ferait
 * choisir un dimanche qui, dans cette fenêtre-là, arrive en dernier. Même règle,
 * mot pour mot, que `daysOutOfBatchReach`.
 *
 * ⛔ `null` N'EST PAS UN REPLI, C'EST UNE RÉPONSE. Aucun jour connu (rien de
 * coché, ou rien de coché dans la fenêtre) ⇒ on ne NOMME pas de jour, et la
 * consigne laisse le modèle poser sa session « le plus tôt possible » — ce que
 * `cookDayLines` fait déjà dans ce décor. Fabriquer ici « le premier jour de la
 * fenêtre » remettrait la coupure de 18 h en jeu à un endroit qui n'a pas
 * l'horloge, et le moteur a déjà `addedCookDays` pour ça.
 *
 * @param cookDays l'UNION `usableCookDays` ∪ `addedCookDays`, comme partout
 *   ailleurs: ignorer l'ajout ferait tomber sur `null` un plan dont le moteur
 *   vient justement de poser la seule session.
 */
export function singleSessionCookDay(input: {
  /** Les jours de la fenêtre, DANS L'ORDRE DU PLAN. */
  window: readonly string[];
  cookDays: readonly string[];
}): string | null {
  const window = input?.window ?? [];
  const cook = new Set(input?.cookDays ?? []);
  for (const day of window) if (cook.has(day)) return day;
  return null;
}
