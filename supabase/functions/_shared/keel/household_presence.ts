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
 * ── LE TROISIÈME ÉTAT (2026-08-18) ──────────────────────────────────────
 * Une bouche n'est plus « là » ou « pas là ». Elle est À TABLE, DEHORS ou
 * ABSENTE, et les deux derniers ne se distinguent PAS par ce que le plan
 * compose (rien, dans les deux cas) mais par ce que le produit DIT: « dehors »
 * garde le droit à un conseil chiffré au midi (« vise autour de 700 »), « absent »
 * ne dit rien du tout. Les confondre ferait taire le conseil du midi, ou le
 * ferait apparaître pendant des vacances.
 *
 * ⚠️ CE MODULE COLLECTE ET ARBITRE, IL N'EXPLOITE PAS. Le conseil chiffré
 * appartient au prompt et aux grammages; ici on ne fait que rendre la
 * distinction LISIBLE — et surtout on ne change RIEN à ce que le moteur
 * comptait déjà: `effective`, `householdAway`, `servings` et `block` sont
 * identiques au jeton près, parce qu'un « dehors » EST une absence de la table.
 */

import {
  type AwayDay,
  dayProse,
  EATING_OCCASIONS,
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
 *   `eating_out` — le plan ne compose pas, MAIS il a le droit de dire un
 *                  nombre. C'est le seul état neuf de ce lot.
 *   `away`       — le plan ne compose pas et ne dit rien: la personne n'est pas
 *                  dans sa semaine.
 */
export const PRESENCE_STATES = ["at_table", "eating_out", "away"] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

/**
 * LE JETON `kind` D'UNE ENTRÉE D'ABSENCE — ce qui sépare « dehors » d'« absent ».
 *
 * ── POURQUOI UNE CLÉ DE PLUS ET PAS UNE SECONDE COLONNE ─────────────────
 * Une seconde colonne aurait deux listes de jours à tenir d'accord, et un
 * créneau pourrait figurer dans les deux. Une clé SUR L'ENTRÉE ne peut pas se
 * contredire elle-même, et elle voyage dans la colonne que le roster étiquette
 * déjà — donc l'union des deux sources continue de se faire par concaténation,
 * sans une ligne de plus.
 *
 * ⚠️ `parseAwayDays` NE LIT QUE `day` ET `slots`. Ce jeton lui est donc
 * invisible, exactement comme `source`: c'est ce qui permet d'ajouter le
 * troisième état SANS toucher au moteur, et ce qui rend une ligne `away_days`
 * écrite AVANT ce lot toujours valide.
 *
 * ── L'ABSENCE DE JETON VAUT `away`, ET C'EST LA DIRECTION SÛRE ──────────
 * Les lignes déjà en base ne portent rien. Les lire « dehors » ferait
 * apparaître un conseil chiffré sur des semaines de vacances déclarées il y a
 * des jours — un chiffre que personne n'a demandé, sur un midi que personne ne
 * mangera. Le silence est le repli; c'est aussi ce que le produit faisait hier.
 */
export const AWAY_KINDS = ["away", "eating_out"] as const;
export type AwayKind = (typeof AWAY_KINDS)[number];

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
  /**
   * LES CRÉNEAUX « DEHORS » — sous-ensemble D'`effective`, DÉJÀ ARBITRÉ.
   *
   * ⚠️ FACULTATIF DANS LE TYPE, TOUJOURS RENDU PAR `parseMemberAway`. Il l'est
   * pour une seule raison, et elle est mécanique: des `MemberAway` sont
   * construits à la main ailleurs dans le dépôt (fixtures de tests d'autres
   * modules), et le rendre obligatoire les casserait sans rien prouver. Un
   * `MemberAway` bâti à la main n'a donc aucun « dehors » — c'est-à-dire que
   * tout y est `away`, le silence, qui est très exactement ce que ce dépôt
   * faisait avant ce lot.
   *
   * ⚠️ NE PAS LE LIRE DIRECTEMENT POUR DÉCIDER. `presenceStateFor` est la
   * lecture, parce qu'elle porte l'arbitrage entre les deux sources; lire ce
   * champ seul ferait un second avis sur « qui est dehors ».
   */
  eatingOut?: AwayDay[];
}

function sourceOf(entry: unknown): string {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "";
  const e = entry as Record<string, unknown>;
  return String(e.source ?? "").trim().toLowerCase();
}

/**
 * Le `kind` d'une entrée, ou `away` — jamais deviné, jamais rendu illisible.
 *
 * Un jeton hors de la liste fermée retombe sur `away`: on ne fabrique pas un
 * troisième vocabulaire à partir d'une faute de frappe, et le repli est celui
 * qui ne dit rien.
 */
function kindOf(entry: unknown): AwayKind {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "away";
  const raw = String((entry as Record<string, unknown>).kind ?? "")
    .trim().toLowerCase();
  return (AWAY_KINDS as readonly string[]).includes(raw)
    ? raw as AwayKind
    : "away";
}

/**
 * `out` MOINS `blocked`, case par case — L'ARBITRAGE ENTRE LES DEUX SOURCES.
 *
 * ── LE SILENCE GAGNE, ET C'EST UNE DÉCISION ─────────────────────────────
 * La personne peut dire « je déjeune dehors le mardi » pendant que le maître
 * marque « elle est en vacances toute la semaine ». Les deux disent la même
 * chose au moteur (aucune part), et se contredisent sur un seul point: est-ce
 * qu'on lui dit un nombre ?
 *
 * On choisit de NE PAS le dire. Un conseil chiffré qui apparaît pendant des
 * vacances est un chiffre que personne n'a demandé, sur un midi que personne ne
 * mangera; un conseil qui manque un jour où quelqu'un déjeunait dehors laisse
 * le produit exactement dans l'état d'hier. La première faute s'écrit à
 * l'écran, la seconde ne s'y voit pas — et l'union n'est pas cassée pour
 * autant: les deux déclarations comptent toujours comme une absence de table.
 *
 * ── LA FORME COURTE EST PRÉSERVÉE QUAND RIEN NE MORD ────────────────────
 * `slots: []` (la journée entière, FF-002 §5) ne se déplie en six moments QUE
 * si une absence vient réellement y percer un trou. Sinon elle sort telle
 * quelle — sans quoi ajouter un petit-déjeuner au rythme changerait le sens
 * d'une déclaration écrite avant.
 */
function withoutCells(
  out: readonly AwayDay[],
  blocked: readonly AwayDay[],
): AwayDay[] {
  const kept: AwayDay[] = [];
  for (const row of out) {
    const stop = blocked.find((b) => b.day === row.day);
    if (!stop) {
      kept.push({ day: row.day, slots: [...row.slots] });
      continue;
    }
    // La journée entière côté absence emporte tout, quelle que soit la forme
    // du « dehors »: il ne reste aucune case à annoncer.
    if (stop.slots.length === 0) continue;
    const outSlots: readonly EatingOccasion[] = row.slots.length > 0
      ? row.slots
      : EATING_OCCASIONS;
    const remaining = outSlots.filter((s) => !stop.slots.includes(s));
    if (remaining.length === 0) continue;
    kept.push({ day: row.day, slots: [...remaining] });
  }
  return kept;
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
    return { effective: [], self: [], household: [], eatingOut: [] };
  }
  // ⚠️ LE MÊME PARSEUR SUR DEUX SOUS-TABLEAUX, PAS UNE SECONDE LECTURE DE LA
  // FORME. `kind` se filtre exactement comme `source` — un filtre par clé, puis
  // `parseAwayDays`. C'est ce qui garde une seule idée de « quel jour, quel
  // créneau », y compris pour le troisième état.
  const out = parseAwayDays(raw.filter((e) => kindOf(e) === "eating_out"));
  const shut = parseAwayDays(raw.filter((e) => kindOf(e) !== "eating_out"));
  return {
    effective: parseAwayDays(raw),
    self: parseAwayDays(raw.filter((e) => sourceOf(e) === "self")),
    household: parseAwayDays(raw.filter((e) => sourceOf(e) === "household")),
    eatingOut: withoutCells(out, shut),
  };
}

/**
 * L'ÉTAT D'UNE BOUCHE SUR UN CRÉNEAU — LA SEULE LECTURE À TROIS ÉTATS.
 *
 * L'ordre des trois tests EST la règle du produit:
 *
 *   1. pas dans `effective` → `at_table`. La table est le défaut, et elle ne
 *      s'écrit nulle part.
 *   2. dans `eatingOut`     → `eating_out`. Rien n'est composé, un nombre peut
 *      être dit.
 *   3. sinon                → `away`. Rien n'est composé, rien n'est dit.
 *
 * ⚠️ LE PREMIER TEST PORTE SUR `effective`, PAS SUR `eatingOut`. C'est ce qui
 * fait que le troisième état ne peut pas inventer une absence: une case
 * marquée « dehors » que le moteur ne compte pas absente serait un conseil
 * chiffré sur un repas que le plan compose quand même — deux nourritures pour
 * un seul midi.
 */
export function presenceStateFor(
  away: MemberAway,
  day: string,
  slot: EatingOccasion,
): PresenceState {
  if (!isAway(away.effective, day, slot)) return "at_table";
  if (away.eatingOut && isAway(away.eatingOut, day, slot)) return "eating_out";
  return "away";
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
  /**
   * LA PART « DEHORS » DE CETTE ABSENCE, arbitrée.
   *
   * Elle est dans la trace pour la même raison que `self` et `household` y
   * sont: sans elle, « pourquoi le plan a-t-il dit un nombre à Zoe ce
   * mardi ? » — ou l'inverse, « pourquoi n'a-t-il rien dit ? » — n'a aucune
   * réponse trois jours plus tard. Un conseil chiffré qui n'est pas traçable
   * est un chiffre dont on ne peut pas dire d'où il vient.
   */
  eating_out: Array<{ day: string; slots: string[] }>;
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
  /**
   * OÙ LE PLAN A LE DROIT DE DIRE UN NOMBRE — par bouche, case par case.
   *
   * ── CE QUE CE CHAMP N'EST PAS ─────────────────────────────────────────
   * Ce n'est PAS le conseil. Il ne porte ni kcal, ni phrase, ni cible: il dit
   * seulement « ici, un midi sort du plan et la personne mange quand même ».
   * Le chiffre appartient à ceux qui savent le calculer (l'enveloppe, les
   * grammages) et à la consigne qui l'écrit — les poser ici ferait de ce
   * module un producteur d'énergie, et il n'a rien pour ça.
   *
   * ⚠️ IL NE CHANGE NI `servings`, NI `householdAway`, NI `block`. Un « dehors »
   * EST une absence de la table: la casserole descend comme avant, la consigne
   * est identique au caractère près, et c'est vérifié par un test. Ce lot
   * collecte une distinction; il n'en exploite aucune.
   *
   * Vide quand personne ne mange dehors — le cas nominal.
   */
  eatingOut: ReadonlyArray<{ member_id: string; cells: MealCell[] }>;
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

/**
 * LES CRÉNEAUX OÙ CETTE BOUCHE MANGE DEHORS SUR CETTE FENÊTRE.
 *
 * ⚠️ MÊME BOUCLE, MÊME `presenceStateFor` — c'est la sœur de `memberMealCells`,
 * et elles se lisent ensemble: la première rend les repas que le plan COMPOSE,
 * celle-ci les midis où il ne compose rien mais garde le droit de dire un
 * nombre. Le reste (`away`) est ce qui n'est ni dans l'une ni dans l'autre, et
 * il n'a pas de fonction parce qu'il n'a pas de lecteur: on ne dit rien.
 *
 * C'EST CETTE SORTIE QUE LISENT LE PROMPT ET LES GRAMMAGES (L7/L8). Elle est
 * volontairement en `MealCell[]` et pas en `AwayDay[]`: un consommateur qui
 * doit poser un conseil raisonne case par case, et déplier la forme courte chez
 * lui ferait une seconde idée de « toute la journée ».
 */
export function memberEatingOutCells(args: {
  away: MemberAway;
  /** Les moments d'une journée — RÉSOLUS, jamais le brut de la colonne. */
  rhythm: readonly EatingOccasionSlot[];
  /** Les jours de la fenêtre, en jetons (`mon`…`sun`), dans l'ordre. */
  windowDays: readonly string[];
}): MealCell[] {
  const slots = args.rhythm.map((r) => r.slot);
  const out: MealCell[] = [];
  for (const day of args.windowDays) {
    for (const slot of slots) {
      if (presenceStateFor(args.away, day, slot) !== "eating_out") continue;
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
      // ET PERSONNE NE MANGE DEHORS. Même direction: sans fenêtre, il n'y a
      // aucun midi sur lequel poser un conseil, et en inventer un ferait
      // parler le produit là où il ne sait rien.
      eatingOut: [],
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
      eating_out: awayPayload(m.away.eatingOut ?? []),
    }));

  // PAR LA MÊME PRIMITIVE QUE LE RESTE DU MODULE, et pour la même raison qu'
  // `absentAllWindow` passe par `memberMealCells`: un second parcours avec sa
  // propre idée de la fenêtre finirait par poser un conseil sur un midi que le
  // plan compose. Les bouches sans aucun midi dehors ne sont pas listées —
  // « personne ne mange dehors » se lit alors comme un tableau vide, pas comme
  // une liste de zéros.
  const eatingOut = args.members
    .map((m) => ({
      member_id: m.memberId,
      cells: memberEatingOutCells({
        away: m.away,
        rhythm: args.rhythm,
        windowDays: args.windowDays,
      }),
    }))
    .filter((e) => e.cells.length > 0);

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
    eatingOut,
  };
}

// ===========================================================================
// LA QUESTION HEBDOMADAIRE — « la semaine, est-ce qu'il/elle mange au bureau ? »
//
// Spec: scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md §2.2 et
// §2.2 bis. Décisions produit de l'utilisateur du 2026-08-18.
//
// ── ELLE PRÉ-REMPLIT, ELLE NE DÉCIDE PAS ──────────────────────────────────
// C'est LA règle qui gouverne ce lot, et elle est écrite ici parce que c'est
// ici qu'on serait tenté de l'oublier:
//
//   réponse hebdo ──PRÉ-REMPLIT──► la grille ──DÉCIDE──► la composition
//
// La réponse décrit une semaine ORDINAIRE. Elle ne dit rien de ce mardi-là.
// Une réponse qui ne se laisserait pas contredire ferait disparaître un repas
// que quelqu'un vient de déclarer à la main — le défaut le plus frustrant qui
// soit, parce qu'on a fait le geste et qu'il n'a rien changé.
//
// D'où la forme du pré-remplissage, et elle n'est pas négociable: il est
// APPLIQUÉ UNE FOIS, À L'ÉCRITURE DE LA RÉPONSE, par la porte SQL
// (`keel_household_set_member_work_lunch`, migration 20260818120000). Il n'est
// JAMAIS re-dérivé à la lecture. Un pré-remplissage recalculé à chaque
// affichage de la grille remettrait « dehors » sur le midi qu'on vient de
// décocher, à chaque fois, et personne ne comprendrait pourquoi.
//
// ⚠️ CE MODULE NE FAIT DONC PAS LE PRÉ-REMPLISSAGE. Il en donne la DESCRIPTION
// (quelles cases sont concernées), que la porte SQL applique et que l'écran
// cite. Deux écritures du même geste divergeraient au premier ajustement.
// ===========================================================================

/**
 * CE QUE LA PERSONNE FAIT DE SON MIDI DE SEMAINE. Liste FERMÉE.
 *
 *   `lunchbox` — elle emporte une gamelle. LE PLAN COMPOSE CE REPAS: il n'y a
 *                donc AUCUNE absence à écrire. Ce que ça change est ailleurs —
 *                le repas doit être transportable, et bon froid s'il n'y a pas
 *                de micro-ondes — et c'est une contrainte de COMPOSITION, pas
 *                de présence.
 *   `outside`   — elle mange dehors. Le plan ne compose pas, et c'est le seul
 *                cas qui produit un « dehors » dans la grille.
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

/**
 * « LA SEMAINE » — les cinq jours que la question désigne.
 *
 * ⚠️ CE N'EST PAS UNE QUESTION POSÉE, C'EST LE SENS DES MOTS. §2.2 dit « la
 * semaine, est-ce qu'il/elle mange au bureau ? » et §2.3 le rend en
 * « lundi→vendredi ». Demander en plus QUELS jours ajouterait un écran pour un
 * cas que la grille corrige déjà en un clic — et c'est la grille qui décide.
 */
export const WORK_WEEK_DAYS = ["mon", "tue", "wed", "thu", "fri"] as const;

/** Le créneau concerné. La question porte sur le DÉJEUNER, et sur lui seul. */
export const WORK_LUNCH_SLOT: EatingOccasion = "lunch";

/**
 * LES CASES QUE LE PRÉ-REMPLISSAGE COUVRE — la description, pas le geste.
 *
 * Rendue vide dès que la réponse ne produit aucun « dehors »: pas au bureau,
 * gamelle (le plan compose), ou question non descendue. `lunchbox` en fait
 * partie et c'est le point le plus facile à rater — une gamelle est un repas
 * COMPOSÉ, pas un repas manqué.
 *
 * Sert deux lecteurs et un seul but: la porte SQL applique exactement ces
 * cases, et l'écran peut dire lesquelles il va cocher avant de le faire.
 */
export function workLunchPrefillCells(
  answer: WorkLunch | null,
): readonly MealCell[] {
  if (!answer || !answer.atWork || answer.mode !== "outside") return [];
  return WORK_WEEK_DAYS.map((day) => ({ day, slot: WORK_LUNCH_SLOT }));
}
