/**
 * QUI EST LÀ, ET QUAND — la présence d'un foyer sur une fenêtre. PUR.
 *
 * Autorité produit: docs/fonctionnalites/composition-des-repas/
 * FF-002-dire-son-absence.md (§5 la forme, §7 la tolérance, §9 le foyer).
 * Arbitrage D14, 2026-08-12.
 *
 * ── LA RÈGLE QUI GOUVERNE TOUT LE FICHIER (FF-002 §9) ────────────────────
 * Une absence est INDIVIDUELLE, une cuisson est COLLECTIVE. « Si le père n'est
 * pas là samedi, la session de cuisson du foyer ne disparaît pas — seules ses
 * portions changent. »
 *
 * D'où la seule chose que ce module calcule vraiment: la différence entre
 *
 *   QUELQU'UN MANQUE   → on cuisine quand même, pour moins de monde;
 *   PERSONNE N'EST LÀ  → ce moment-là sort de la composition.
 *
 * Le second cas seulement remonte au moteur comme une absence (`householdAway`,
 * qui part dans la consigne ET au parseur, exactement comme sur la lane
 * individuelle). Le premier ne change QUE le nombre de parts.
 *
 * ── AUCUN PARSEUR MAISON, ET C'EST LE POINT ─────────────────────────────
 * L'union des deux sources (ce que la personne a déclaré, ce que le maître a
 * marqué) est faite EN BASE par concaténation des deux tableaux, et résolue par
 * `parseAwayDays` — qui fusionne par jour, fait gagner la journée entière sur
 * les créneaux, déduplique, et écarte un jeton inconnu sans jamais le deviner.
 * Réécrire cette fusion ici en ferait une seconde implémentation, qui
 * divergerait au premier ajustement — et c'est la lecture qu'on regarde le
 * moins qui garderait l'ancien état.
 *
 * ── CE QUE CE MODULE NE DÉCIDE PAS ──────────────────────────────────────
 * Il ne refuse rien. `fullyAway` est un CONSTAT; c'est l'appelant qui rend
 * `window_fully_away` (FF-002 §7), parce que lui seul sait ce qu'il compose et
 * ce qu'il doit répondre.
 *
 * ── DEUX ÉTATS: À TABLE OU ABSENT ────────────────────────────────────────
 * ⟳ 2026-09-24 — le troisième état « dehors » (`away_days[].kind =
 * 'eating_out'`, 2026-08-18) est retiré: plus aucun écran ne l'écrivait, et
 * ses cases ont été converties en absences
 * (`20260925003000_dehors_devient_absent.sql`). Il ne changeait rien à ce que
 * le moteur compte — un « dehors » était déjà une absence de la table — il
 * portait seulement le conseil chiffré du midi, parti avec lui.
 */

import {
  type AwayDay,
  dayProse,
  type EatingOccasion,
  type EatingOccasionSlot,
  isAway,
  OCCASION_PROSE,
  parseAwayDays,
} from "./meal_generation.ts";

/**
 * D'où vient une absence. Liste FERMÉE, miroir de `keel_away_tagged` en base.
 *
 *   `self`      — la personne l'a déclarée dans son « about you »
 *                 (`student_goals.practical_constraints.away_days`).
 *   `household` — le maître l'a marquée sur la ligne de foyer
 *                 (`household_members.away_days`).
 *
 * Une bouche SANS COMPTE n'a que la seconde, et c'est le cas nominal d'un
 * enfant. Une bouche avec compte peut avoir les deux: elles ne se hiérarchisent
 * PAS, elles s'unissent (arbitrage B — une absence est un fait, pas une
 * opinion).
 */
export const PRESENCE_SOURCES = ["self", "household"] as const;
export type PresenceSource = (typeof PRESENCE_SOURCES)[number];

/**
 * CE QU'UNE BOUCHE FAIT D'UN CRÉNEAU. Liste FERMÉE, et l'ordre est celui du
 * tableau de la spec (§2.2 bis, 2026-08-18):
 *
 *   `at_table`   — le plan compose une part. C'est le défaut, et il n'a AUCUNE
 *                  écriture: une case à table est l'ABSENCE d'entrée dans
 *                  `away_days`. Lui donner un jeton en base ferait deux façons
 *                  de dire « il mange ici », et c'est celle qu'on regarde le
 *                  moins qui garderait l'ancien état.
 *   `away`       — le plan ne compose pas: la personne n'est pas à table.
 */
export const PRESENCE_STATES = ["at_table", "away"] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

/**
 * L'absence d'une bouche, résolue et RELISIBLE.
 *
 * `effective` est ce que le moteur compte. `self` et `household` ne servent
 * QU'À la trace — mais elles n'y sont pas décoratives: sans elles, « pourquoi
 * n'y a-t-il pas d'assiette pour Léa samedi ? » n'a pas de réponse, et une
 * absence marquée par erreur est indétectable.
 */
export interface MemberAway {
  effective: AwayDay[];
  self: AwayDay[];
  household: AwayDay[];
}

function sourceOf(entry: unknown): string {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "";
  const e = entry as Record<string, unknown>;
  return String(e.source ?? "").trim().toLowerCase();
}

/**
 * La colonne `away_days` du roster, lue en trois vues.
 *
 * ── L'UNION EST LA CONCATÉNATION, ET ELLE EST DÉJÀ FAITE ────────────────
 * `keel_household_roster_for` rend UN tableau qui porte les entrées des deux
 * sources, chacune étiquetée. `parseAwayDays` sur le tout EST donc l'union — il
 * n'y a rien à fusionner ici. Les deux vues par source se calculent avec le
 * MÊME parseur sur le sous-tableau filtré: un filtre par clé, jamais une
 * seconde lecture de la forme.
 *
 * ⚠️ `source` EST IGNORÉ PAR `parseAwayDays`, qui ne lit que `day` et `slots`.
 * C'est ce qui permet à la trace de voyager dans la même colonne que la donnée
 * sans qu'aucun lecteur du moteur n'ait à la connaître.
 */
export function parseMemberAway(raw: unknown): MemberAway {
  if (!Array.isArray(raw)) {
    return { effective: [], self: [], household: [] };
  }
  return {
    effective: parseAwayDays(raw),
    self: parseAwayDays(raw.filter((e) => sourceOf(e) === "self")),
    household: parseAwayDays(raw.filter((e) => sourceOf(e) === "household")),
  };
}

/**
 * L'ÉTAT D'UNE BOUCHE SUR UN CRÉNEAU. La table est le défaut, et elle ne
 * s'écrit nulle part: une case absente de `effective` est `at_table`.
 */
export function presenceStateFor(
  away: MemberAway,
  day: string,
  slot: EatingOccasion,
): PresenceState {
  return isAway(away.effective, day, slot) ? "away" : "at_table";
}

export interface PresenceMember {
  memberId: string;
  /** Le prénom, tel qu'il part dans le prompt. Jamais un identifiant. */
  displayName: string;
  away: MemberAway;
}

/** Ce qu'on archive dans `generated_from`, par bouche qui manque. */
export interface PresenceTraceEntry {
  member_id: string;
  away: Array<{ day: string; slots: string[] }>;
  self: Array<{ day: string; slots: string[] }>;
  household: Array<{ day: string; slots: string[] }>;
}

export interface WindowPresence {
  /**
   * Les moments où PERSONNE n'est là. C'est la SEULE absence qui remonte au
   * moteur — la seule qui supprime un repas.
   */
  householdAway: AwayDay[];
  /**
   * Le nombre de bouches à table sur le moment le plus PEUPLÉ de la fenêtre.
   *
   * ── POURQUOI LE MAXIMUM ET PAS LA MOYENNE ─────────────────────────────
   * `servings` est un scalaire dans la consigne (« people at the table: N »),
   * et il dimensionne les COURSES. Une moyenne ferait manquer de quoi manger le
   * jour où tout le monde est là; le maximum fait au pire un reste, et le
   * détail par jour est écrit juste en dessous, dans le bloc de présence.
   */
  servings: number;
  /** Vrai quand AUCUN moment de la fenêtre n'a personne à table. */
  fullyAway: boolean;
  /** Le bloc à greffer sur le prompt. `""` quand tout le monde est là. */
  block: string;
  /** Par bouche qui manque au moins une fois. Vide = personne ne manque. */
  trace: PresenceTraceEntry[];
  /**
   * LES BOUCHES ABSENTES À CHAQUE MOMENT DE LA FENÊTRE — celles qui ne mangent
   * ici pas une seule fois.
   *
   * ⚠️ MESURÉ EN RUN RÉEL LE 2026-08-12, et c'est la seconde moitié de
   * FF-002 §9. `servings` descendait bien — la casserole était juste — mais
   * `member_portions` continuait de porter TOUT LE MONDE: un plan cuisiné pour
   * une personne promettait « une portion adulte pleine » à trois absents, et
   * l'écran du foyer la leur affichait. « Seules ses portions changent » était
   * vrai pour la casserole et faux pour l'assiette.
   *
   * Ne contient QUE l'absence totale. Qui manque un seul dîner garde sa
   * portion: il mange les autres jours, et une assiette retirée pour un repas
   * manqué serait plus fausse encore.
   */
  absentAllWindow: readonly string[];
}

/** Une case de la grille: un jour de la fenêtre, un moment du rythme. */
export interface MealCell {
  day: string;
  slot: EatingOccasion;
}

/**
 * LES REPAS QU'UNE BOUCHE PREND ICI SUR CETTE FENÊTRE — la primitive.
 *
 * ⚠️ EXTRAITE DE `resolveWindowPresence`, PAS ÉCRITE À CÔTÉ. C'est la même
 * boucle, le même `isAway`, le même `rhythm`: `absentAllWindow` la lit
 * (« aucune case ⇒ absent partout »), le LECTEUR de propositions la lit pour
 * ne pas offrir une fusion que le geste refuse (C3 ④), et le CONSTAT de forme
 * la lit pour savoir de combien de repas on parle (C3 ⑥). Trois lecteurs, une
 * seule définition — la ré-écrire chez l'un d'eux ferait deux idées de « qui
 * mange quand », et c'est la dette que ce chantier a payée quatre fois.
 *
 * ── L'ÉCHEC RESTE OUVERT, MAIS PAS ICI ──────────────────────────────────
 * Sans rythme ni fenêtre, cette fonction rend `[]` — ce qui veut dire « aucun
 * repas », donc « absent ». C'est le sens LITTÉRAL, et il est juste: il n'y a
 * pas de repas dans une fenêtre vide. La posture d'échec ouvert appartient aux
 * APPELANTS, qui savent ce qu'ils refusent; `resolveWindowPresence` sort avant
 * d'arriver ici, et le lecteur de propositions fait de même.
 */
export function memberMealCells(args: {
  away: readonly AwayDay[];
  /** Les moments d'une journée — RÉSOLUS, jamais le brut de la colonne. */
  rhythm: readonly EatingOccasionSlot[];
  /** Les jours de la fenêtre, en jetons (`mon`…`sun`), dans l'ordre. */
  windowDays: readonly string[];
}): MealCell[] {
  const slots = args.rhythm.map((r) => r.slot);
  const out: MealCell[] = [];
  for (const day of args.windowDays) {
    for (const slot of slots) {
      if (isAway(args.away, day, slot)) continue;
      out.push({ day, slot });
    }
  }
  return out;
}

function awayPayload(days: readonly AwayDay[]): Array<{ day: string; slots: string[] }> {
  return days.map((d) => ({ day: d.day, slots: [...d.slots] }));
}

function nameList(names: readonly string[]): string {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * L'EN-TÊTE DU BLOC. Trois phrases, et chacune ferme une porte:
 *
 *   « still ONE cooking session »  → le modèle ne propose pas de sauter le
 *                                    repas ni d'en faire deux.
 *   « cook for the number given »  → il descend les quantités, ce qui est tout
 *                                    l'intérêt (moins acheté, moins jeté).
 *   « never comment on why »       → il n'écrit pas « comme Marc n'est pas là »
 *                                    dans une consigne lue à table. Où quelqu'un
 *                                    est passé ce soir-là ne regarde pas le
 *                                    plan de repas, exactement comme une raison
 *                                    de portion (`household_portions.ts`).
 */
const PRESENCE_HEADER = [
  "WHO IS NOT AT THE TABLE — some people are away on some days.",
  "This is still ONE cooking session for the household: never drop a meal and",
  "never propose a separate dish for the people who are there. Cook for the",
  "number given on each line, and buy for that number.",
  "Never mention, explain or comment on anyone's absence in what you write.",
] as const;

/**
 * La présence du foyer sur la fenêtre demandée.
 *
 * ── L'ÉCHEC EST OUVERT, ET C'EST DÉLIBÉRÉ ───────────────────────────────
 * Sans rythme ou sans fenêtre, ce module ne dit RIEN: aucune absence, tout le
 * monde à table. L'autre direction serait catastrophique — un rythme vide
 * ferait de chaque jour un jour « où personne n'est là », donc un refus
 * `window_fully_away` sur un foyer qui n'a rien déclaré du tout.
 *
 * ⚠️ LE RYTHME PASSÉ DOIT ÊTRE LE RYTHME RÉSOLU. `buildMealPrompt` retombe sur
 * `DEFAULT_EATING_RHYTHM` quand la liste est vide; lui passer le brut ici
 * ferait compter la présence sur des moments que la consigne ne nomme pas.
 */
export function resolveWindowPresence(args: {
  members: readonly PresenceMember[];
  /** Les moments d'une journée — RÉSOLUS, jamais le brut de la colonne. */
  rhythm: readonly EatingOccasionSlot[];
  /** Les jours de la fenêtre, en jetons (`mon`…`sun`), dans l'ordre. */
  windowDays: readonly string[];
}): WindowPresence {
  const total = args.members.length;
  const slots = args.rhythm.map((r) => r.slot);
  if (total === 0 || slots.length === 0 || args.windowDays.length === 0) {
    return {
      householdAway: [],
      servings: Math.max(1, total),
      fullyAway: false,
      block: "",
      trace: [],
      // ÉCHEC OUVERT, ici aussi: sans rythme ni fenêtre lisibles, personne
      // n'est déclaré absent — donc personne ne perd son assiette.
      absentAllWindow: [],
    };
  }

  const householdAway: AwayDay[] = [];
  const lines: string[] = [];
  let peak = 0;

  for (const day of args.windowDays) {
    /** Les créneaux du jour où personne n'est là. */
    const deserted: EatingOccasion[] = [];
    /** Qui manque, par créneau — pour la prose. */
    const absentBySlot = new Map<EatingOccasion, string[]>();

    for (const slot of slots) {
      const absent = args.members.filter((m) => isAway(m.away.effective, day, slot));
      const present = total - absent.length;
      if (present === 0) {
        deserted.push(slot);
        continue;
      }
      if (present > peak) peak = present;
      if (absent.length > 0) {
        absentBySlot.set(slot, absent.map((m) => m.displayName));
      }
    }

    if (deserted.length === slots.length) {
      // TOUS les moments du jour désertés: la forme COURTE, celle que FF-002 §5
      // définit. Elle survit à un changement de rythme, ce qu'une liste de
      // créneaux ne ferait pas.
      householdAway.push({ day, slots: [] });
    } else if (deserted.length > 0) {
      householdAway.push({ day, slots: deserted });
    }

    if (absentBySlot.size === 0) continue;

    // ── UNE LIGNE POUR LA JOURNÉE QUAND C'EST LA MÊME TABLÉE PARTOUT ──────
    // Sinon une personne absente toute la semaine produirait vingt et une
    // lignes de consigne pour dire une seule chose. On ne regroupe QUE si tous
    // les créneaux servis ont exactement le même jeu d'absents: un regroupement
    // approximatif ferait cuisiner pour le mauvais nombre.
    const served = slots.filter((s) => !deserted.includes(s));
    const prints = served.map((s) => (absentBySlot.get(s) ?? []).join("|"));
    const uniform = prints.every((p) => p === prints[0]) && prints[0] !== "";
    if (uniform) {
      const names = absentBySlot.get(served[0]) ?? [];
      lines.push(
        `- ${dayProse(day)}, every meal: ${nameList(names)} not eating here ` +
          `-- cook for ${total - names.length} instead of ${total}.`,
      );
      continue;
    }
    for (const slot of served) {
      const names = absentBySlot.get(slot);
      if (!names || names.length === 0) continue;
      lines.push(
        `- ${dayProse(day)}, ${OCCASION_PROSE[slot]}: ${nameList(names)} not ` +
          `eating here -- cook for ${total - names.length} instead of ${total}.`,
      );
    }
  }

  const trace: PresenceTraceEntry[] = args.members
    .filter((m) => m.away.effective.length > 0)
    .map((m) => ({
      member_id: m.memberId,
      away: awayPayload(m.away.effective),
      self: awayPayload(m.away.self),
      household: awayPayload(m.away.household),
    }));

  // CALCULÉ SUR LES MÊMES `slots` ET `windowDays` que la boucle ci-dessus, et
  // par le MÊME `isAway`. Un second parcours avec sa propre idée de « la
  // fenêtre » finirait par diverger de celui qui dimensionne la casserole, et
  // on servirait une assiette à quelqu'un que le prompt ne compte pas.
  //
  // ⚠️ PASSÉ PAR `memberMealCells` DEPUIS C3, et c'est le sujet: le LECTEUR de
  // propositions doit prédire ce refus-ci (« il n'est là aucun repas de cette
  // fenêtre »), et il ne peut le faire sans mentir que par la fonction qui le
  // décide. « Aucune case » EST la définition de l'absence totale.
  const absentAllWindow = args.members
    .filter((m) =>
      memberMealCells({
        away: m.away.effective,
        rhythm: args.rhythm,
        windowDays: args.windowDays,
      }).length === 0
    )
    .map((m) => m.memberId);

  return {
    householdAway,
    // `peak` vaut 0 quand la fenêtre entière est désertée; l'appelant refuse
    // alors, et ce chiffre ne sert plus. On rend quand même un nombre légal
    // plutôt qu'un 0 qui traînerait dans une consigne.
    servings: peak > 0 ? peak : Math.max(1, total),
    fullyAway: peak === 0,
    block: lines.length > 0 ? [...PRESENCE_HEADER, "", ...lines].join("\n") : "",
    trace,
    absentAllWindow,
  };
}

// ===========================================================================
// LA QUESTION HEBDOMADAIRE — « la semaine, est-ce qu'il/elle mange au bureau ? »
//
// Spec: scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md §2.2 et
// §2.2 bis. Décisions produit de l'utilisateur du 2026-08-18.
//
// ⟳ 2026-09-24 — l'écran qui posait la question est parti (11cd1862), et la
// porte SQL qui écrivait la réponse avec lui
// (`20260925003000_dehors_devient_absent.sql`). La colonne
// `household_members.work_lunch` reste lue: une gamelle déjà déclarée continue
// de rendre le déjeuner transportable (`workLunchBlock`). La réponse `outside`
// pré-remplissait des midis « dehors »; elle n'a plus aucun effet.
// ===========================================================================

/**
 * CE QUE LA PERSONNE FAIT DE SON MIDI DE SEMAINE. Liste FERMÉE.
 *
 *   `lunchbox` — elle emporte une gamelle. LE PLAN COMPOSE CE REPAS: il n'y a
 *                donc AUCUNE absence à écrire. Ce que ça change est ailleurs —
 *                le repas doit être transportable, et bon froid s'il n'y a pas
 *                de micro-ondes — et c'est une contrainte de COMPOSITION, pas
 *                de présence.
 *   `outside`   — elle mange dehors. Gardé à la lecture parce que des lignes
 *                le portent encore; plus aucun effet depuis le 2026-09-24.
 */
export const WORK_LUNCH_MODES = ["lunchbox", "outside"] as const;
export type WorkLunchMode = (typeof WORK_LUNCH_MODES)[number];

/**
 * LA RÉPONSE HEBDOMADAIRE D'UNE BOUCHE — le dépliage de §2.2, résolu.
 *
 * ⚠️ TROIS CHAMPS, ET CHACUN PEUT ÊTRE « PAS RÉPONDU ». Le formulaire se
 * déplie: on peut avoir dit « oui, au bureau » sans avoir encore dit gamelle ou
 * dehors. Écrire un repli à la place ferait décider le produit pour la
 * personne, et le repli le plus tentant (`outside`) est précisément celui qui
 * fait taire un repas.
 */
export interface WorkLunch {
  /** « La semaine, est-ce qu'il/elle mange au bureau ? » */
  atWork: boolean;
  /** Gamelle ou dehors. `null` tant que la question n'est pas descendue. */
  mode: WorkLunchMode | null;
  /**
   * « Y a-t-il un micro-ondes au bureau ? » — n'a de sens que pour la gamelle.
   * `null` = pas demandé ou pas répondu, et ce n'est PAS « non »: sans
   * micro-ondes le repas doit être BON FROID, ce qui est une contrainte réelle
   * qu'on n'invente pas sur un silence.
   */
  microwave: boolean | null;
}

/**
 * LA COLONNE `household_members.work_lunch`, relue.
 *
 * `null` = LA QUESTION N'A JAMAIS ÉTÉ POSÉE, et c'est différent de « non »:
 * l'écran doit pouvoir la poser, et le moteur ne doit rien en conclure.
 *
 * ── MÊME POSTURE QUE `parseAwayDays`: ON ÉCARTE, ON NE DEVINE PAS ────────
 * Un `at_work` qui n'est pas un booléen rend `null` — pas `false`. « Elle ne
 * mange pas au bureau » est une réponse, et la fabriquer à partir d'une donnée
 * illisible ferait composer cinq déjeuners à quelqu'un qui n'en mange aucun
 * ici. Un `mode` hors vocabulaire tombe à `null` sans emporter le `at_work`
 * qui, lui, était lisible.
 */
export function parseWorkLunch(raw: unknown): WorkLunch | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.at_work !== "boolean") return null;
  if (!o.at_work) return { atWork: false, mode: null, microwave: null };
  const rawMode = String(o.mode ?? "").trim().toLowerCase();
  const mode = (WORK_LUNCH_MODES as readonly string[]).includes(rawMode)
    ? rawMode as WorkLunchMode
    : null;
  return {
    atWork: true,
    mode,
    // LE MICRO-ONDES N'EXISTE QUE POUR LA GAMELLE. Le garder sur `outside`
    // laisserait traîner une contrainte de réchauffage sur un repas que le plan
    // ne compose pas — et un lecteur finirait par la lire.
    microwave: mode === "lunchbox" && typeof o.microwave === "boolean"
      ? o.microwave
      : null,
  };
}
