/**
 * CE QUI NE PEUT PAS ATTENDRE ENTRE LA COURSE ET LA CASSEROLE. Module PUR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QU'IL FERME, RAPPORTÉ SUR UN PLAN RÉEL LE 2026-09-01
 * ══════════════════════════════════════════════════════════════════════════
 *
 *     « Dans le plan, ça me disait de cuisiner le poulet acheté le lundi,
 *       le samedi. »
 *
 * ── CE QUI EXISTAIT DÉJÀ, ET POURQUOI ÇA N'A PAS SUFFI ────────────────────
 * `RAW_WINDOW_DAYS` (`fridge_window.ts`) porte la fenêtre crue PAR GROUPE
 * depuis le 2026-08-22, et `grocery_waves.ts` s'en sert pour DATER l'achat de
 * chaque article. Le calcul est juste, et il n'a jamais menti.
 *
 * Mais il tourne **APRÈS**, à la lecture, et **le modèle ne l'a jamais su**. Il
 * compose ses sessions à l'aveugle: rien dans le prompt ne dit qu'une volaille
 * fraîche ne tient pas six jours. Le moteur en déduit ensuite qu'il faudra une
 * seconde course — ce qui est vrai —, mais la personne, elle, lit une liste
 * sans date et fait UNE course le premier jour.
 *
 * C'est la cicatrice « la promesse et la clé de schéma doivent se toucher »
 * prise par l'autre bout: la règle est appliquée en aval d'une composition qui
 * l'ignore, et personne ne la lui a dite.
 *
 * ── CE QUE CE MODULE AJOUTE, ET CE QU'IL N'AJOUTE PAS ─────────────────────
 * Il ne redéfinit AUCUNE durée: `RAW_WINDOW_DAYS` reste la seule table, et elle
 * est le miroir de `food_groups.raw_window_days`. Il traduit cette table en
 * deux choses que le reste du moteur n'avait pas:
 *
 *   ① `rawReachLines()` — des JOURS NOMMÉS pour la consigne. « Une règle
 *      générale ne se compare pas, un jour NOMMÉ si »: c'est la leçon
 *      d'`addedCookDays`, resservie une quatrième fois. Le modèle ne reçoit pas
 *      « la volaille tient deux jours », il reçoit « après jeudi, une volaille
 *      ne peut plus venir de la première course ».
 *   ② `rawKeepingBreaches()` — le CONSTAT, après coup, préparation par
 *      préparation. Il ne refuse rien (ce n'est pas la fenêtre du cuit, qui
 *      rend malade: ici la sortie honnête est une seconde course, et elle
 *      existe déjà). Il COMPTE, et il donne à `plan_rationale` de quoi le dire.
 *
 * ⛔ IL NE DÉCIDE AUCUNE DATE D'ACHAT. C'est `grocery_waves.ts`, et lui seul.
 * Un second calcul de la date ici serait la divergence que ce dépôt paie en
 * boucle — et celle qu'on regarde le moins garderait l'ancienne.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import { RAW_WINDOW_DAYS, rawWindowDaysFor } from "./fridge_window.ts";

/**
 * LES FAMILLES QUE LA CONSIGNE NOMME, ET RIEN QUE CELLES-LÀ.
 *
 * ⚠️ QUATRE, PAS TRENTE. Le prompt n'a pas à réciter `RAW_WINDOW_DAYS`: la
 * moitié de la table vaut 21 jours (« ça ne contraint rien ») et une liste de
 * trente lignes se lit comme un tableau, c'est-à-dire pas du tout. On nomme les
 * familles qui MORDENT dans une fenêtre de sept jours, groupées par la durée
 * qu'elles partagent — le regroupement est ce qui rend la ligne lisible.
 *
 * ⛔ LES DURÉES NE SONT PAS ÉCRITES ICI, ELLES SONT LUES. Chaque entrée pointe
 * un groupe RÉEL, et sa fenêtre vient de `RAW_WINDOW_DAYS`. Écrire « 2 » à côté
 * de « poultry » créerait une seconde définition du nombre, et c'est exactement
 * ce que l'en-tête interdit. Un test compare les deux.
 */
export const RAW_FAMILIES: readonly {
  /** Le groupe qui porte la durée. Les autres de la ligne la partagent. */
  readonly ref: keyof typeof RAW_WINDOW_DAYS;
  /** Ce que la personne appelle ça. En anglais: c'est la langue du prompt. */
  readonly said: string;
}[] = [
  { ref: "white_fish", said: "fish and shellfish" },
  { ref: "poultry", said: "chicken, turkey, and any minced meat" },
  { ref: "red_meat", said: "beef, pork and lamb in the piece" },
  { ref: "leafy_greens", said: "salad leaves, fresh herbs and berries" },
];

/**
 * LE DERNIER JOUR DE LA FENÊTRE QU'UN ACHAT DU PREMIER JOUR PEUT SERVIR.
 *
 * `null` quand la famille atteint toute la fenêtre — il n'y a alors rien à
 * dire, et le dire quand même apprendrait au modèle une contrainte qui ne mord
 * pas.
 *
 * @param window les jetons de la fenêtre, DANS L'ORDRE DU PLAN. L'ordre est le
 *   sens: un plan qui part un jeudi a `thu` au rang 0.
 * @param days la fenêtre crue de la famille, en jours d'écart maximal. `2` veut
 *   dire « acheté lundi, cuisiné lundi, mardi ou mercredi » — la même lecture
 *   que `RAW_WINDOW_DAYS`, dont l'en-tête l'écrit une fois pour toutes.
 */
export function lastDayReachedFromFirstShop(
  window: readonly string[],
  days: number,
): string | null {
  if (!Array.isArray(window) || window.length === 0) return null;
  if (!Number.isFinite(days) || days < 0) return null;
  // Rang 0 = le jour de la course. `days` est un ÉCART, donc le dernier rang
  // atteint est `days` lui-même.
  if (days >= window.length - 1) return null;
  return window[days];
}

/**
 * CE QUE LE MODÈLE DOIT SAVOIR AVANT DE POSER SES SESSIONS.
 *
 * Rend `[]` quand la fenêtre est trop courte pour qu'une seule famille morde —
 * un plan de deux jours n'a aucune contrainte de fraîcheur à l'achat, et lui
 * servir le bloc serait trois lignes de bruit.
 *
 * ⚠️ LA PHRASE PORTE LA SORTIE, PAS L'INTERDICTION. Cuisiner du poulet le
 * samedi est parfaitement légitime — ça demande une course le jeudi, et le
 * moteur sait déjà la produire (`grocery_waves.ts`). Ce qu'on refuse, c'est le
 * silence: un plan qui fait acheter lundi ce qui se cuisine samedi sans le
 * dire.
 */
export function rawReachLines(window: readonly string[]): string[] {
  const rows: string[] = [];
  for (const family of RAW_FAMILIES) {
    const last = lastDayReachedFromFirstShop(window, RAW_WINDOW_DAYS[family.ref]);
    if (last === null) continue;
    rows.push(`- ${family.said}: fresh until ${last}, no later.`);
  }
  if (rows.length === 0) return [];
  return [
    "what a FIRST-DAY shop can still be cooked from -- fresh food does not " +
    "wait for the session that needs it:",
    ...rows,
    "This does NOT forbid cooking them later. It means the shopping for that " +
    "session happens closer to it: if you put fresh fish or chicken on a day " +
    "past its line above, say in that session's `run_through` that its fresh " +
    "items are bought that day or the day before. Never plan a session that " +
    "quietly assumes week-old fresh meat.",
  ];
}

/**
 * UNE PRÉPARATION QUI NE PEUT PAS VIVRE DE LA PREMIÈRE COURSE.
 *
 * ⚠️ CE N'EST PAS UNE FAUTE. C'est un fait: cette session-là réclame une course
 * plus tardive. Le nom du type le dit — `breach` décrit l'écart avec l'hypothèse
 * « une seule course au départ », pas une infraction du modèle.
 */
export interface RawKeepingBreach {
  /** L'id de la préparation, tel que le plan le porte. */
  readonly preparationId: string;
  /** Le jour où elle est cuisinée. */
  readonly cookOn: string;
  /** Le groupe le plus fragile qu'elle utilise. */
  readonly group: string;
  /** Sa fenêtre crue, en jours d'écart. */
  readonly windowDays: number;
  /** Le rang de la cuisson dans la fenêtre du plan. */
  readonly cookAt: number;
}

/**
 * QUELLES PRÉPARATIONS RÉCLAMENT UNE COURSE APRÈS LE PREMIER JOUR.
 *
 * ⛔ IL LIT LES GROUPES, PAS LES MOTS. Un ingrédient dont le groupe n'a pas été
 * résolu est IGNORÉ — pas rangé du côté sûr, pas du côté fragile. Le compter
 * comme fragile ferait annoncer des courses qu'aucune donnée ne réclame; le
 * compter comme sûr le rendrait invisible. L'appelant reçoit donc, à côté, le
 * nombre d'ingrédients sans groupe, et c'est LUI qui décide quoi en dire —
 * même posture que `rawWindowCounts`.
 *
 * @param window les jetons de la fenêtre, dans l'ordre du plan.
 */
export function rawKeepingBreaches(input: {
  window: readonly string[];
  preparations: readonly {
    readonly id: string;
    readonly cookOn: string | null;
    /** Les groupes d'aliments de ses ingrédients. `null` = non résolu. */
    readonly groups: readonly (string | null)[];
  }[];
}): { breaches: RawKeepingBreach[]; unknownGroups: number; checked: number } {
  const window = input?.window ?? [];
  const breaches: RawKeepingBreach[] = [];
  let unknownGroups = 0;
  let checked = 0;
  for (const prep of input?.preparations ?? []) {
    const cookAt = prep.cookOn ? window.indexOf(prep.cookOn) : -1;
    // Une cuisson qu'on ne sait pas situer ne se compare à rien. Elle n'est
    // NI une infraction NI une conformité: elle sort du compte, comme les
    // occasions qui ne puisent dans aucune casserole sortent de la fenêtre du
    // cuit.
    if (cookAt < 0) continue;
    let worst: { group: string; days: number } | null = null;
    for (const group of prep.groups ?? []) {
      const days = rawWindowDaysFor(group);
      if (days === null) {
        unknownGroups += 1;
        continue;
      }
      if (worst === null || days < worst.days) worst = { group: String(group), days };
    }
    if (worst === null) continue;
    checked += 1;
    if (cookAt > worst.days) {
      breaches.push({
        preparationId: prep.id,
        cookOn: prep.cookOn as string,
        group: worst.group,
        windowDays: worst.days,
        cookAt,
      });
    }
  }
  return { breaches, unknownGroups, checked };
}

/**
 * LES JOURS DE CUISSON QUI RÉCLAMENT LEUR PROPRE COURSE, dédoublonnés et dans
 * l'ordre de la fenêtre. C'est la forme que `plan_rationale` sait dire.
 */
export function daysNeedingTheirOwnShop(
  window: readonly string[],
  breaches: readonly RawKeepingBreach[],
): string[] {
  const days = new Set(breaches.map((b) => b.cookOn));
  return (window ?? []).filter((d) => days.has(d));
}
