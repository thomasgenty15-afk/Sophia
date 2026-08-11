/**
 * FF-010 — CE QUE LE CHAT SAIT DU FOYER, ET RIEN DE PLUS.
 *
 * ── LE DÉFAUT, ET IL EST VÉRIFIABLE ────────────────────────────────────────
 * « On mange quoi ce soir ? » est la question la plus évidente qu'on puisse
 * poser à cette app, et le chat ne pouvait pas y répondre. Ce n'est pas une
 * lacune du modèle: `sophia-brain` ne contenait AUCUNE requête sur
 * `student_generated_meals` ni sur les tables du foyer. Le seul contexte de
 * plan chargé était `keel_plan_context.ts`, qui lit les ENGAGEMENTS DU COACH —
 * pas les plats composés.
 *
 * Conséquence: soit l'agent bottait en touche, soit il INVENTAIT un plat. Le
 * second est bien pire qu'une confabulation ordinaire, parce que la personne va
 * cuisiner ce qu'on lui a dit.
 *
 * C'est aussi le mode d'échec le plus cher de ce dépôt: un morceau construit,
 * testé, déployé — `generate-household-meal-v1`, `member_portions`, les vagues
 * de courses — dont personne n'avait rebranché le fil.
 *
 * ── LE POINT QUI GOUVERNE TOUT LE MODULE ───────────────────────────────────
 * CE QUI NE DOIT PAS ÊTRE DIT N'ENTRE PAS. Un prompt qui porte la donnée et une
 * consigne de ne pas la dire est un prompt qui la dira; tout filtrage se fait
 * donc AU CHARGEMENT. La règle survit au retrait de `memberVisibility` (lot 2):
 * ce qui a disparu, c'est la colocation qui rendait ce filtre non trivial — pas
 * le principe, qui gouverne encore le corps, les mesures et l'objectif.
 *
 * ── LECTURE SEULE, SANS EXCEPTION ──────────────────────────────────────────
 * Aucune écriture. Chaque écriture du foyer a une RPC gatée et un écran
 * propriétaire; un second chemin d'écriture, c'est deux vérités.
 *
 * ── UNE PANNE NE FABRIQUE PAS UNE ABSENCE ──────────────────────────────────
 * Un chargeur qui avale son erreur ferait dire « rien de prévu » à quelqu'un
 * dont le plan existe. L'échec est journalisé, le contexte rend `null`, et
 * l'agent reste MUET sur le plan plutôt que faux.
 */

import {
  type HouseholdRole,
  MEMBER_AGE_STATES,
  type MemberAgeState,
} from "./household.ts";

/** Structural type: les tests injectent un faux, la prod un SupabaseClient. */
// deno-lint-ignore no-explicit-any
type Db = any;

// ---------------------------------------------------------------------------
// CE QUE LE TOUR PORTE
// ---------------------------------------------------------------------------

export interface HouseholdRosterEntry {
  /** L'identité d'une bouche. Ne change jamais, compte ou pas. */
  memberId: string;
  /** `null` tant que la personne n'a pas réclamé son profil. */
  userId: string | null;
  firstName: string;
  ageState: MemberAgeState;
  role: HouseholdRole;
}

/**
 * ── CE QUI A DISPARU ICI, ET POURQUOI (lot 2, 2026-08-10) ──────────────────
 *
 * `visibility` portait la distinction `full` / `presence_only`, qui n'existait
 * que pour la colocation. Le modèle arrêté le 2026-08-08 la sort du produit: un
 * compte, un foyer, une personne qui gouverne le menu. En mode `family` —
 * c'est-à-dire dans tous les foyers réels — `memberVisibility` rendait DÉJÀ
 * `full` pour tout le monde: le champ était constant, et un champ constant qui
 * a l'air d'être une décision est un piège pour le prochain lecteur.
 *
 * CE QUE ÇA CHANGE POUR DE VRAI, et il faut le dire: FF-010 R3 refusait la part
 * d'autrui DANS LA CONVERSATION en colocation. Un profil réclamé qui demande
 * « c'est quoi la part de Marc ? » l'obtient désormais. C'est cohérent avec la
 * règle du chantier — ce qui touche le repas est partagé, ce qui touche le
 * corps est à soi — mais c'est un changement de comportement, pas un nettoyage.
 */

export interface HouseholdDish {
  title: string;
  slot: string | null;
  /** Le jour nommé du plat (`mon`..`sun`), ou `null` sur un plan d'un jour. */
  day: string | null;
}

export interface HouseholdPreparation {
  title: string;
  /** Le jour de cuisson (`mon`..`sun`), quand une session le fixe. */
  cookOn: string | null;
  /**
   * La DATE de cuisson résolue dans la fenêtre du plan, ou `null` quand le jour
   * est absent ou illisible. C'est elle qui décide de « aujourd'hui »: un jeton
   * `wed` ne dit pas QUEL mercredi, et une fenêtre de sept jours n'en contient
   * qu'un seul — donc il se résout, et il DOIT se résoudre ici plutôt que dans
   * la tête du modèle.
   */
  cookDate: string | null;
  /** `true` quand la cuisson tombe la date locale du tour. */
  isToday: boolean;
}

/** Une ligne de la liste de courses du plan du foyer. */
export interface HouseholdShoppingLine {
  term: string;
  quantity: string | null;
}

export interface HouseholdPortionLine {
  firstName: string;
  /** `null` = part standard. On ne fabrique pas de phrase par défaut. */
  note: string | null;
  /** `true` quand c'est la part de l'élève qui parle. */
  isMe: boolean;
}

export interface HouseholdRestrictionLine {
  label: string;
  /** Le prénom de l'auteur, ou `null` s'il n'est pas dans le roster lisible. */
  chosenBy: string | null;
}

export interface HouseholdTurnContext {
  householdId: string;
  /**
   * LA LIGNE MEMBRE de celui qui parle — un `member_id`, pas un `user_id`,
   * parce que c'est la clé de `member_portions`. Le bloc en a besoin pour que
   * le plafond ne puisse jamais couper SA part: sans lui, « garde ma part » se
   * réduit à « garde la première », ce qui est faux dès qu'on n'est pas premier
   * dans le tableau.
   */
  viewerId: string;
  /** Le foyer, filtré. Toujours au moins l'élève lui-même. */
  roster: HouseholdRosterEntry[];
  /** `true` quand une fenêtre de plan COUVRE la date locale du tour. */
  hasPlanToday: boolean;
  /** Les plats du jour, bornés. Vide quand aucun plan ne couvre aujourd'hui. */
  todayDishes: HouseholdDish[];
  /** Les préparations à faire, bornées, JOUR COURANT D'ABORD. */
  preparations: HouseholdPreparation[];
  /** Les portions VISIBLES. En `shared`, uniquement la mienne. */
  portions: HouseholdPortionLine[];
  /** Les restrictions qui visent l'élève qui parle, avec leur auteur. */
  myRestrictions: HouseholdRestrictionLine[];
  /** La liste de courses de la fenêtre courante, bornée. */
  shopping: HouseholdShoppingLine[];
  /** `true` quand la liste a été coupée par la borne. */
  shoppingTruncated: boolean;
}

/**
 * BORNES DU BLOC. Le budget de prompt tronque PAR LA QUEUE, et un foyer de six
 * avec sept jours de préparations dépasse largement ce qu'il tolère. Le dépôt a
 * déjà payé un bloc mémoire tué par la troncature.
 *
 * Le JOUR COURANT D'ABORD, et rien du reste de la semaine: c'est ce que la
 * question pose (« ce soir »), et le reste se regarde à l'écran.
 */
export const HOUSEHOLD_MAX_DISHES = 4;
export const HOUSEHOLD_MAX_PREPARATIONS = 3;
export const HOUSEHOLD_MAX_PORTIONS = 6;
export const HOUSEHOLD_MAX_RESTRICTIONS = 6;
/**
 * La liste de courses est la SEULE des cinq sources dont §11 discute encore
 * l'entrée dans le prompt (« le pousser coûte du budget pour une question
 * rare »). Elle entre parce que §3 range « il faut acheter quoi ? » DANS le
 * périmètre et que §5 la nomme, et elle entre BORNÉE — mesuré: sans elle, sur
 * « What do I need to buy? », le modèle FABRIQUE une liste à partir des titres
 * de plats, en y mêlant ceux des autres jours. Une liste de courses inventée
 * est du même bois qu'un plat inventé: on va l'acheter.
 */
export const HOUSEHOLD_MAX_SHOPPING = 12;

/**
 * ── L4 · LE PLAFOND DU BLOC, ET POURQUOI LES BORNES CI-DESSUS NE SUFFISAIENT
 *    PAS ─────────────────────────────────────────────────────────────────────
 *
 * Les cinq `HOUSEHOLD_MAX_*` bornent des CARDINALITÉS. Aucune ne borne des
 * CARACTÈRES, et tout le texte de ce bloc — titres de plats, titres de
 * préparations, consignes de service, termes de courses — est écrit par un
 * modèle (`generate-household-meal-v1`) que rien ne contraint en longueur:
 * `sanitizePortionNote` filtre le VOCABULAIRE d'une consigne, jamais sa taille.
 *
 * MESURÉ sur le pire cas de la fiche (6 membres × 7 jours), à cardinalité
 * IDENTIQUE, en ne faisant varier que la verbosité du générateur:
 *
 *     titres courts   2 217 car.  ← le « 2 632 » de la passe transverse
 *     titres réels    4 125 car.
 *     titres bavards  9 223 car.
 *
 * Et la taille du foyer n'y est presque pour rien: 12 membres pèsent 5 501 et
 * 20 membres 5 562, parce que les portions sont déjà bornées à six. La loi de
 * croissance n'est pas le NOMBRE de convives, c'est la LONGUEUR de ce que le
 * générateur a écrit — et c'est elle qui n'a aucun plafond.
 *
 * D'où deux mécanismes, et ils ne font pas le même travail:
 *
 *   1. `HOUSEHOLD_MAX_*_CHARS` borne CHAQUE LIGNE, au chargement. Il garantit
 *      qu'aucune ligne seule ne peut emporter le budget. Une ligne coupée porte
 *      son « … »: le modèle doit voir qu'elle est coupée, sinon il la complète.
 *   2. `HOUSEHOLD_BLOCK_MAX_CHARS` borne LE BLOC, à la composition, en jetant
 *      la matière optionnelle dans un ordre déclaré — et EN LE DISANT. C'est le
 *      patron que la liste de courses porte déjà: « une liste tronquée
 *      présentée comme complète est un panier faux ».
 *
 * ⚠️ CE PLAFOND N'EST PAS UN SECOND ENDROIT OÙ LA VISIBILITÉ SE DÉCIDE. Il
 * n'opère que sur de la matière DÉJÀ filtrée par `memberVisibility`, il ne lit
 * jamais `kind`, et il ne peut donc rien faire entrer que la visibilité aurait
 * refusé — ni prétendre protéger quoi que ce soit. §9 de la fiche nomme le
 * `if (kind === 'shared')` local comme la seconde vérité à ne pas écrire.
 */
export const HOUSEHOLD_BLOCK_MAX_CHARS = 3000;
/**
 * LES BORNES DE LIGNE, ET POURQUOI CES VALEURS-LÀ.
 *
 * Relevé en base locale sur toutes les lignes écrites par le générateur:
 * titre de plat max 50 / moyenne 29, titre de préparation max 50 / moyenne 25,
 * terme de courses max 32 / moyenne 10. Les bornes ci-dessous laissent donc
 * une marge large sur ce que la production écrit VRAIMENT, et ne mordent que
 * sur la queue — celle qu'aucune contrainte n'empêche d'arriver.
 *
 * ⚠️ 120 est le CHECK de la base pour un libellé de restriction; 80 est la
 * borne de ce bloc. Un libellé de restriction est un ALIMENT, pas une phrase
 * (« pâte à tartiner », « céréales sucrées du petit-déjeuner »): la marge est
 * confortable, et R4 est portée par les deux paragraphes qui suivent la liste,
 * pas par la longueur des libellés.
 */
export const HOUSEHOLD_MAX_TITLE_CHARS = 80;
export const HOUSEHOLD_MAX_NOTE_CHARS = 120;
export const HOUSEHOLD_MAX_TERM_CHARS = 48;
export const HOUSEHOLD_MAX_NAME_CHARS = 20;
export const HOUSEHOLD_MAX_LABEL_CHARS = 80;

// ---------------------------------------------------------------------------
// LE CHARGEUR
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Une ligne de texte de modèle, ramenée à sa borne.
 *
 * Le « … » n'est pas de la typographie: sans lui, le modèle lit une phrase
 * grammaticalement finie et la tient pour complète. Avec lui, il voit qu'elle
 * est coupée — et la règle du bloc lui dit quoi en faire.
 *
 * La coupe cherche une frontière de mot dans le dernier quart, parce qu'un
 * titre coupé au milieu d'un mot (« sauce béar ») se relit comme un aliment qui
 * n'existe pas.
 */
function clampLine(value: unknown, max: number): string {
  const text = str(value);
  if (text.length <= max) return text;
  const hard = text.slice(0, max);
  const space = hard.lastIndexOf(" ");
  const cut = space > max * 0.75 ? hard.slice(0, space) : hard;
  return `${cut.trimEnd()}…`;
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> =>
      Boolean(v) && typeof v === "object" && !Array.isArray(v)
    )
    : [];
}

/**
 * Une ligne de roster, telle que la RPC la rend.
 *
 * ⚠️ `age_state` VIENT DE LA BASE, DÉRIVÉ À CHAQUE APPEL, et on ne recalcule
 * rien: ce dépôt a UNE définition de l'âge d'une bouche
 * (`keel_household_member_age`, jumelle de `household.ts`), et une seconde
 * divergerait au premier ajustement. La RPC ne rend délibérément PAS la date de
 * naissance — le foyer a besoin de savoir qu'il y a un enfant à table, pas de
 * connaître sa date.
 *
 * Une valeur hors vocabulaire vaut `unknown`, JAMAIS `adult`: c'est la même
 * direction sûre que la fonction SQL, et elle doit survivre à un désalignement
 * entre les deux.
 */
function rosterEntryOf(row: Record<string, unknown>): HouseholdRosterEntry {
  const rawAge = str(row.age_state);
  return {
    memberId: str(row.member_id),
    userId: row.user_id == null ? null : str(row.user_id),
    firstName: clampLine(row.first_name, HOUSEHOLD_MAX_NAME_CHARS),
    ageState: (MEMBER_AGE_STATES as readonly string[]).includes(rawAge)
      ? (rawAge as MemberAgeState)
      : "unknown",
    role: str(row.role) === "owner" ? "owner" : "member",
  };
}

/**
 * LE FOYER DE CE COMPTE, RÉSOLU UNE FOIS PAR TOUR — et c'est le point d'entrée
 * des DEUX lanes du foyer: ce contexte-ci, et l'union de sécurité
 * (`household_safety.ts :: loadHouseholdTurnSafety`).
 *
 * ── POURQUOI IL EST SORTI DU CHARGEUR CI-DESSOUS ───────────────────────────
 * La résolution vivait DANS `loadHouseholdTurnContext`. Le jour où les
 * allergies du foyer sont entrées dans la conversation, la garder là aurait
 * imposé un choix entre deux fautes: soit une SECONDE requête d'appartenance
 * par tour — payée par tout le monde, y compris par ceux qui vivent seuls et
 * n'ont pas de foyer du tout — soit brancher la lecture des allergies sur un
 * chargeur qui rend `null` sur SEPT causes différentes et gate sur une date
 * locale. Une allergie ne se lit pas derrière une garde de calendrier.
 *
 * ⚠️ IL LÈVE, et c'est la différence qui compte. `loadHouseholdTurnContext`
 * avale ses pannes exprès (un bloc de plan absent vaut mieux qu'un tour perdu);
 * ici l'appelant DOIT pouvoir distinguer « cette personne n'a pas de foyer » de
 * « je n'ai pas pu savoir ». La première réponse est `null`, la seconde est une
 * exception — et le fail-open silencieux de l'ancienne version cachait la
 * seconde derrière la première.
 *
 * `keel_household_of` est la résolution unique: la contrainte
 * `household_members_one_household_per_user` la garantit, et ce lecteur est le
 * premier à casser le jour où elle tombe (V1, assumé).
 */
export async function resolveHouseholdIdFor(
  db: Db,
  userId: string,
): Promise<string | null> {
  const id = str(userId);
  if (!id) return null;
  const membership = await db
    .from("household_members")
    .select("household_id")
    .eq("user_id", id)
    .maybeSingle();
  if (membership.error) throw membership.error;
  return str(
    (membership.data as Record<string, unknown> | null)?.household_id,
  ) || null;
}

/**
 * Le foyer de cet élève, tel que le tour a le droit de le voir.
 *
 * Rend `null` — et le bloc n'est alors PAS injecté — dans les cas qui se
 * comportent pareil et se journalisent différemment: plan périmé, lecture en
 * panne, roster illisible. Aucun d'eux ne produit « ton foyer n'a rien prévu »
 * à quelqu'un qui vit seul (R8) — et « pas de foyer » ne passe même plus par
 * ici, puisque l'appelant l'a déjà tranché avec `resolveHouseholdIdFor`.
 *
 * @param householdId le foyer DÉJÀ RÉSOLU. Obligatoire, jamais optionnel: ce
 *   dépôt a mesuré qu'« un paramètre de garde optionnel est une garde
 *   désarmée », et un repli « résous-le toi-même si on ne te le donne pas »
 *   rendrait la seconde requête invisible au relecteur.
 * @param localDate la date LOCALE de l'élève. C'est elle qui décide si une
 *   fenêtre de plan couvre « aujourd'hui »: un plat d'hier servi ce soir est
 *   une erreur silencieuse.
 */
export async function loadHouseholdTurnContext(
  db: Db,
  args: { householdId: string; userId: string; localDate: string },
): Promise<HouseholdTurnContext | null> {
  const householdId = str(args.householdId);
  const userId = str(args.userId);
  const localDate = str(args.localDate);
  if (!householdId || !userId || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    return null;
  }

  try {
    // 2. LE ROSTER, par la RPC — jamais par `profiles`. (L'étape 1, la
    // résolution du foyer, est passée chez l'appelant: `resolveHouseholdIdFor`.
    // La numérotation est gardée pour que les renvois d'ailleurs — §7, §9 —
    // continuent de désigner les mêmes étapes.) Le fait que la RPC
    // existe EST la garde: une policy RLS ne restreint pas les COLONNES, et
    // ouvrir `profiles` aux co-membres livrerait téléphone, e-mail et
    // identifiant Stripe pour afficher un prénom.
    //
    // ⚠️ `_for(p_user)`, ET PAS LA VERSION SANS ARGUMENT. Mesuré en run réel:
    // `keel_household_roster()` filtre sur `auth.uid()`, qui est NULL sous
    // `service_role` — et son GRANT ne couvrait même pas ce rôle. L'appel ne
    // pouvait donc pas aboutir, le chargeur avalait l'échec (par conception),
    // et l'agent répondait avec les lignes du COACH à quelqu'un qui demandait
    // ce qu'on mange ce soir. Aucune erreur nulle part.
    // Les deux fonctions partagent UN corps (20260808061000): le navigateur
    // garde sa garde `auth.uid()`, le serveur passe l'élève explicitement.
    const rosterRes = await db.rpc("keel_household_roster_for", { p_user: userId });
    if (rosterRes.error) throw rosterRes.error;
    const rosterRows = asArray(rosterRes.data);
    const roster: HouseholdRosterEntry[] = rosterRows.map(rosterEntryOf);
    // MA LIGNE, retrouvée par le compte. C'est le SEUL endroit où `user_id`
    // sert à identifier: partout ailleurs c'est `member_id`. Une personne qui
    // parle a forcément un compte — les bouches sans compte ne parlent pas.
    const me = roster.find((m) => m.userId === userId);
    if (!me) return null;

    // 3. LE PLAN DU FOYER qui COUVRE aujourd'hui. Une fenêtre finie hier est
    // traitée comme absente: un plat d'hier servi ce soir est une erreur
    // silencieuse, et `retired_at` exclut les plans remplacés.
    const planRes = await db
      .from("student_generated_meals")
      .select(
        "id, dishes, preparations, member_portions, shopping_list, starts_on, ends_on",
      )
      .eq("household_id", householdId)
      .is("retired_at", null)
      .lte("starts_on", localDate)
      .gte("ends_on", localDate)
      .order("starts_on", { ascending: false })
      .limit(1);
    if (planRes.error) throw planRes.error;
    const plan = asArray(planRes.data)[0] ?? null;

    const dayToken = dayTokenFor(localDate);
    const startsOn = str(plan?.starts_on);
    const endsOn = str(plan?.ends_on);
    const allDishes = plan ? asArray(plan.dishes) : [];
    const todayDishes: HouseholdDish[] = allDishes
      // JOUR COURANT D'ABORD, et SEULEMENT lui: c'est ce que la question pose.
      // Un plat sans jour appartient à un plan d'un seul jour, donc à
      // aujourd'hui par construction.
      .filter((d) => {
        const day = str(d.day);
        return day === "" || day === dayToken;
      })
      .map((d) => ({
        title: clampLine(d.title, HOUSEHOLD_MAX_TITLE_CHARS),
        slot: clampLine(d.slot, 24) || null,
        day: str(d.day) || null,
      }))
      // Le filtre AVANT la borne: un titre vide consommait une des quatre
      // places et faisait disparaître un vrai plat du bloc.
      .filter((d) => d.title !== "")
      .slice(0, HOUSEHOLD_MAX_DISHES);

    // ── LES PRÉPARATIONS, ET LE DÉFAUT QUE CE BLOC A COÛTÉ ─────────────────
    //
    // ⚠️ `cook_on`, PAS `cookOn`. La production écrit `cook_on`
    // (`mealPreparationsPayload`, `_shared/keel/meal_generation.ts`); ce
    // chargeur ne lisait que le camelCase, donc le jour était `null` sur CHAQUE
    // ligne réelle. La fixture de QA du premier run écrivait `cookOn` — un
    // décor qui ment sur la forme de la donnée cache exactement le défaut qu'il
    // devrait montrer.
    //
    // ⚠️ ET LE JOUR COURANT D'ABORD (§9). Sans ordre, la borne de trois prenait
    // les trois PREMIÈRES du tableau — c'est-à-dire l'ordre de composition, pas
    // le calendrier. MESURÉ en run réel, foyer Ferrand, 3 passes sur 3 sur
    // « What do I need to cook today? »: l'agent répondait « cook lentils,
    // marinate the cod, roast the chicken thighs », dont DEUX appartiennent à
    // demain et après-demain. C'est le mode de défaillance « plan périmé » de
    // §7 transposé aux préparations, et il est pire: la personne cuisine.
    //
    // Les préparations PASSÉES sortent. Dans une fenêtre vivante, une cuisson
    // dont le jour est derrière est faite ou caduque; la citer, c'est le plat
    // d'hier servi ce soir.
    const preparations: HouseholdPreparation[] = (plan ? asArray(plan.preparations) : [])
      .map((p) => {
        const cookOn = str(p.cook_on ?? p.cookOn) || null;
        const cookDate = cookOn
          ? dateForDayToken(cookOn, startsOn, endsOn)
          : null;
        return {
          title: clampLine(p.title, HOUSEHOLD_MAX_TITLE_CHARS),
          cookOn,
          cookDate,
          // Sans jour de cuisson, la préparation appartient à « aujourd'hui »
          // seulement quand la fenêtre elle-même ne dure qu'un jour: sur une
          // semaine, « on ne sait pas quand » n'est pas « maintenant ».
          isToday: cookDate !== null
            ? cookDate === localDate
            : startsOn !== "" && startsOn === endsOn,
        };
      })
      .filter((p) => p.title !== "")
      // Une date résolue ANTÉRIEURE à aujourd'hui s'en va. Une date non
      // résolue reste: « on ne sait pas quand » n'est pas « c'était hier ».
      .filter((p) => p.cookDate === null || p.cookDate >= localDate)
      .sort((a, b) => {
        const key = (p: HouseholdPreparation) =>
          p.cookDate === localDate ? "" : (p.cookDate ?? "￿");
        return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
      })
      .slice(0, HOUSEHOLD_MAX_PREPARATIONS);

    // 4. LES PORTIONS. Toutes celles du foyer: le repas est partagé. Ce qui
    // reste filtré, c'est le CORPS — il n'entre pas dans ce bloc, ni pour moi
    // ni pour les autres.
    //
    // ⚠️ AUCUN REPLI SUR `user_id` DANS LE PAYLOAD. Le générateur écrit
    // `member_id` depuis le 2026-08-10; accepter les deux clés ferait du repli
    // le chemin nominal le jour où l'un des deux cesse d'émettre la bonne.
    const byMemberId = new Map(roster.map((r) => [r.memberId, r]));
    const portions: HouseholdPortionLine[] = (plan ? asArray(plan.member_portions) : [])
      .map((p) => {
        const memberId = str(p.memberId ?? p.member_id);
        const entry = byMemberId.get(memberId);
        return {
          memberId,
          visible: true,
          line: {
            firstName: entry?.firstName ||
              clampLine(p.displayName ?? p.display_name, HOUSEHOLD_MAX_NAME_CHARS),
            note: clampLine(p.portionNote ?? p.portion_note, HOUSEHOLD_MAX_NOTE_CHARS) ||
              null,
            isMe: memberId === me.memberId,
          },
        };
      })
      .filter((p) => p.visible && p.line.firstName !== "")
      // ⚠️ MA PART D'ABORD, ET C'EST UN DÉFAUT RÉPARÉ, PAS UN CONFORT.
      // `slice(0, 6)` prenait les six PREMIÈRES du tableau, sans priorité.
      // MESURÉ: dans un foyer de douze où je suis douzième dans
      // `member_portions`, ma propre consigne de service — « c'est quoi ma
      // part ? », le cœur de la fiche — tombait, pendant que celle de cinq
      // personnes que je ne suis pas restait. L'ordre du tableau vient de
      // l'ordre des MEMBRES chez le générateur; rien ne garantit que j'y sois
      // tôt. Ma part n'est candidate à aucune coupe, ici ni plus bas.
      .sort((a, b) => (a.line.isMe ? 0 : 1) - (b.line.isMe ? 0 : 1))
      .slice(0, HOUSEHOLD_MAX_PORTIONS)
      .map((p) => p.line);

    // 4-bis. LA LISTE DE COURSES DE LA FENÊTRE. Elle n'a pas de jour: une
    // vague de courses couvre la semaine, et la découper par date inventerait
    // une information que la ligne ne porte pas. Bornée, et le bloc DIT qu'elle
    // l'est — une liste tronquée présentée comme complète est un panier faux.
    const shoppingAll = (plan ? asArray(plan.shopping_list) : [])
      .map((s) => ({
        term: clampLine(s.term, HOUSEHOLD_MAX_TERM_CHARS),
        quantity: clampLine(s.quantity, 24) || null,
      }))
      .filter((s) => s.term !== "");
    const shopping: HouseholdShoppingLine[] = shoppingAll.slice(
      0,
      HOUSEHOLD_MAX_SHOPPING,
    );
    const shoppingTruncated = shoppingAll.length > shopping.length;

    // 5. LES RESTRICTIONS QUI ME VISENT, avec leur auteur. Celles qui visent
    // quelqu'un d'autre ne sont pas chargées: en `family` elles ne concernent
    // pas ce tour, en `shared` elles n'ont rien à y faire.
    const restrictionsRes = await db
      .from("household_food_restrictions")
      .select("label, created_by")
      .eq("household_id", householdId)
      // MA LIGNE MEMBRE, pas mon compte. Une bouche sans compte porte des
      // contraintes depuis le lot 1 — c'était même le cas nominal impossible
      // avant lui — et `member_user_id` n'existe plus.
      .eq("member_id", me.memberId)
      .limit(HOUSEHOLD_MAX_RESTRICTIONS);
    if (restrictionsRes.error) throw restrictionsRes.error;
    const myRestrictions: HouseholdRestrictionLine[] = asArray(restrictionsRes.data)
      .map((r) => ({
        // Le CHECK de la base plafonne déjà à 120; on le REFLÈTE plutôt que de
        // faire confiance, parce que ce chargeur lit aussi des bases de test.
        label: clampLine(r.label, HOUSEHOLD_MAX_LABEL_CHARS),
        // ⚠️ `created_by` EST UN `user_id`, PAS UN `member_id`: c'est le compte
        // qui a posé la règle, et seul quelqu'un qui a un compte peut en poser.
        // Le chercher dans une table clée `member_id` rendrait `null` à tous les
        // coups — et l'écran retomberait sur une phrase impersonnelle, c'est-à-
        // dire ferait passer une décision parentale pour un avis du produit.
        chosenBy: roster.find((m) => m.userId && m.userId === str(r.created_by))
          ?.firstName || null,
      }))
      .filter((r) => r.label !== "");

    return {
      householdId,
      viewerId: me.memberId,
      roster,
      hasPlanToday: todayDishes.length > 0,
      todayDishes,
      preparations,
      portions,
      myRestrictions,
      shopping,
      shoppingTruncated,
    };
  } catch (error) {
    // Le tour continue SANS bloc foyer, et l'agent ne prétend pas connaître le
    // plan. Un chargeur qui avale son erreur ferait dire « rien de prévu » à
    // quelqu'un dont le plan existe.
    console.warn("[keel/household] turn context unreadable", error);
    return null;
  }
}

/** `mon`..`sun` depuis une date locale. Aucune horloge lue. */
function dayTokenFor(localDate: string): string {
  const tokens = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const d = new Date(`${localDate}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : tokens[d.getUTCDay()];
}

/**
 * LA DATE QUE DÉSIGNE UN JETON DE JOUR, DANS CETTE FENÊTRE-LÀ.
 *
 * `cook_on: "wed"` ne dit pas QUEL mercredi. Une fenêtre de plan dure au plus
 * sept jours (`student_generated_meals_duration_days_check`), donc elle
 * contient au plus UN mercredi et le jeton se résout sans ambiguïté — mais il
 * faut le résoudre ICI. Le laisser au modèle, c'est lui demander de faire du
 * calendrier, et ce dépôt a déjà payé « le jour nommé » deux fois.
 *
 * Rend `null` sur une fenêtre illisible ou un jeton absent de la fenêtre: une
 * date qu'on ne sait pas ne s'invente pas.
 */
function dateForDayToken(
  token: string,
  startsOn: string,
  endsOn: string,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) return null;
  const start = new Date(`${startsOn}T00:00:00Z`);
  const end = new Date(`${endsOn}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    if (d.getTime() > end.getTime()) return null;
    const iso = d.toISOString().slice(0, 10);
    if (dayTokenFor(iso) === token) return iso;
  }
  return null;
}

// ---------------------------------------------------------------------------
// LE BLOC
// ---------------------------------------------------------------------------

/**
 * Le bloc de contexte du foyer.
 *
 * ── IL SE NOMME DISTINCTEMENT DU PLAN DU COACH ─────────────────────────────
 * `keel_plan_context.ts` dit pourquoi c'est interdit de les fusionner: « two
 * plan blocks in one prompt is how a model gets to pick the more flattering
 * one ». Les ENGAGEMENTS du coach et les PLATS du foyer sont deux couches
 * différentes; elles se nomment, elles ne se mélangent pas. Le titre de ce
 * bloc dit « what this household is eating », jamais « the plan ».
 *
 * ── SANS PLAT COMPOSÉ, ON LE DIT, ET ON PORTE VERS LA COMPOSITION ─────────
 * ⚠️ JAMAIS « ton coach prépare ton plan ». C'est FAUX: le coach écrit une
 * doctrine et un programme pour toute sa cohorte, et il n'existe AUCUN canal
 * 1:1 coach → élève (MODEL.md). Un écran élève vide porte la sortie vers la
 * composition, que l'élève fait lui-même.
 */
export function householdContextBlock(ctx: HouseholdTurnContext): string {
  // ── LE PLAFOND, ET L'ORDRE DE COUPE ARGUMENTÉ ─────────────────────────────
  //
  // On rend le bloc, on le MESURE, et tant qu'il dépasse on retire UNE unité de
  // matière optionnelle — puis on re-rend. Le texte émis est donc toujours
  // exactement celui qu'on a mesuré: pas de longueur estimée, pas d'écart
  // possible entre le calcul et la sortie.
  //
  // L'ORDRE, du premier jeté au dernier, et pourquoi:
  //
  //   1. LA LISTE DE COURSES. C'est la seule des cinq sources dont §11 de la
  //      fiche discute encore l'entrée dans le prompt (« le pousser coûte du
  //      budget pour une question rare »), elle porte DÉJÀ une phrase de
  //      troncature, et l'écran des repas tient la liste entière. Sa perte
  //      coûte un aller à l'écran.
  //   2. LES PRÉPARATIONS D'UN AUTRE JOUR. Le bloc les étiquette lui-même
  //      « NOT today ». Leur perte ne coûte rien ce soir — et surtout, elle ne
  //      touche PAS la cuisson du jour, qui est la seule que la personne va
  //      vraiment faire. « Un plafond qui coupe le jour courant serait pire que
  //      pas de plafond. »
  //   3. LES CONSIGNES DE SERVICE DES AUTRES. Une instruction pour l'assiette
  //      de quelqu'un d'autre. R3 démontre déjà que le produit tient sans
  //      elles: c'est exactement le mode `shared`. MA part, elle, n'est jamais
  //      candidate — c'est le cœur de la fiche.
  //   4. LES PRÉNOMS DU FOYER, réduits à un compte. En DERNIER, parce que la
  //      présence est précisément ce que `presence_only` autorise: « qui
  //      cuisine ce soir ? » est une question légitime en colocation. MON
  //      prénom reste, quoi qu'il arrive.
  //
  // JAMAIS COUPÉ: les plats du jour, les préparations DU JOUR, ma part, les
  // restrictions qui me visent, les règles dures, la ceinture mineur et la
  // ceinture colocation. Ce sont les seules choses dont la perte se paie dans
  // une casserole ou dans une fuite.
  //
  // ⚠️ LES ALLERGIES DU FOYER NE SONT PAS DANS CE BLOC, ET C'EST LEUR GARDE.
  // Elles ne sont pas « en haut de l'ordre de coupe »: elles sont HORS de
  // l'ordre de coupe, dans leur propre bloc, poussé par le composeur juste
  // après les contraintes dures de l'élève et bien avant celui-ci
  // (`household_safety.ts :: householdAllergyPromptBlock`). Un plafond qui
  // compte des caractères ne peut donc pas les atteindre, quelle que soit la
  // taille du foyer et le nombre de préparations — ce n'est pas une place
  // privilégiée dans une file, c'est l'absence de file. La même raison range
  // déjà les contraintes de l'ÉLÈVE ailleurs: le budget du prompt tronque par
  // la queue, et une allergie n'a pas de rang acceptable dans une queue.
  const laterPreps = ctx.preparations.filter((p) => !p.isToday).length;
  const otherPortions = ctx.portions.filter((p) => !p.isMe).length;
  const state: BlockBudgetState = {
    shopping: ctx.shopping.length,
    laterPreps,
    otherPortions,
    rosterNames: ctx.roster.length,
  };
  // L'ordre de réduction, en une liste — et c'est la liste qu'on lit pour
  // savoir ce que le budget sacrifie.
  const reducers: Array<() => boolean> = [
    () => state.shopping > 0 && (state.shopping--, true),
    () => state.laterPreps > 0 && (state.laterPreps--, true),
    () => state.otherPortions > 0 && (state.otherPortions--, true),
  ];

  let block = renderHouseholdBlock(ctx, state);
  for (const reduce of reducers) {
    while (block.length > HOUSEHOLD_BLOCK_MAX_CHARS && reduce()) {
      block = renderHouseholdBlock(ctx, state);
    }
    if (block.length <= HOUSEHOLD_BLOCK_MAX_CHARS) return block;
  }

  // ── LE DERNIER RECOURS NE SE DÉPENSE QUE S'IL ACHÈTE LE BUT ───────────────
  //
  // Réduire les prénoms du foyer à un compte rapporte peu (quelques dizaines de
  // caractères) et coûte la PRÉSENCE — la seule chose que `presence_only`
  // autorise, et la réponse à « qui cuisine ce soir ? ». Le dépenser alors
  // qu'on restera de toute façon au-dessus du plafond, c'est perdre la présence
  // pour rien.
  //
  // Donc: on l'essaie EN ENTIER, et on ne garde le résultat que s'il passe.
  // Sinon on rend le bloc avec ses prénoms — au-dessus du plafond, ce qui est
  // le cas où le bloc n'est plus fait que de matière que la fiche INTERDIT de
  // couper (plats du jour, cuissons du jour, ma part, mes restrictions, les
  // ceintures). Ce plancher-là est nommé et testé; il n'est pas une fuite du
  // plafond, c'est sa condition de désarmement.
  const withNames = block;
  const collapsed: BlockBudgetState = { ...state, rosterNames: 1 };
  const collapsedBlock = renderHouseholdBlock(ctx, collapsed);
  return collapsedBlock.length <= HOUSEHOLD_BLOCK_MAX_CHARS
    ? collapsedBlock
    : withNames;
}

/** Ce que le budget a laissé entrer, section par section. */
interface BlockBudgetState {
  shopping: number;
  laterPreps: number;
  otherPortions: number;
  rosterNames: number;
}

function renderHouseholdBlock(
  ctx: HouseholdTurnContext,
  state: BlockBudgetState,
): string {
  const lines: string[] = [];
  /** Ce qui a été retiré, dit à la fin — jamais amputé en silence. */
  const dropped: string[] = [];
  lines.push("== WHAT THIS HOUSEHOLD IS EATING (read-only) ==");
  lines.push("");
  lines.push(
    "This is NOT the coach's plan. It is what this household composed for " +
      "itself. Never merge the two, and never present one as the other.",
  );
  lines.push("");

  // MON PRÉNOM D'ABORD quand la liste est réduite. Le reste garde son ordre
  // (la RPC rend le compte maître en tête, puis l'ordre d'arrivée).
  const rosterOrdered = [
    ...ctx.roster.filter((m) => m.memberId === ctx.viewerId),
    ...ctx.roster.filter((m) => m.memberId !== ctx.viewerId),
  ];
  const rosterShown = rosterOrdered.slice(0, Math.max(1, state.rosterNames));
  const rosterHidden = rosterOrdered.length - rosterShown.length;
  lines.push(
    `Household of ${ctx.roster.length}: ${
      rosterShown.map((m) =>
        // ⚠️ « (child) » EST UNE DONNÉE SUR QUELQU'UN, et elle a sa place ici:
        // qui est à table gouverne ce qu'on cuisine, et la ceinture mineur plus
        // bas s'arme sur le roster. Ce qui n'y a PAS sa place, c'est la DATE
        // qui l'a produite — la RPC ne la rend délibérément pas.
        //
        // `unknown` ne porte AUCUNE étiquette, et c'est le point neuf: écrire
        // « (adult) » par défaut affirmerait un fait qu'on n'a pas, et le modèle
        // s'en servirait pour dimensionner. Une bouche sans âge est un prénom.
        m.firstName + (m.ageState === "minor" ? " (child)" : "")
      ).join(", ")
    }${rosterHidden > 0 ? `, and ${rosterHidden} more` : ""}.`,
  );
  if (rosterHidden > 0) {
    dropped.push(
      `${rosterHidden} household member name(s) — you do not have them here`,
    );
  }

  if (ctx.hasPlanToday) {
    lines.push("");
    lines.push("TODAY'S DISHES, exactly as composed:");
    for (const dish of ctx.todayDishes) {
      lines.push(`- ${dish.title}${dish.slot ? ` (${dish.slot})` : ""}`);
    }
    // LE JOUR COURANT NE SE COUPE PAS. Les préparations d'aujourd'hui passent
    // en entier; seules celles d'un autre jour sont soumises au budget.
    const todayPreps = ctx.preparations.filter((p) => p.isToday);
    const laterAll = ctx.preparations.filter((p) => !p.isToday);
    const laterShown = laterAll.slice(0, state.laterPreps);
    const shownPreps = [...todayPreps, ...laterShown];
    if (shownPreps.length > 0) {
      lines.push("");
      // ⚠️ CHAQUE LIGNE PORTE SON JOUR, ET C'EST STRUCTUREL. Sans le jour, une
      // préparation de jeudi lue un samedi devient « à cuisiner maintenant » —
      // mesuré 3 fois sur 3 avant ce libellé, sur « What do I need to cook
      // today? ». Une cuisson faite au mauvais jour est le plat d'hier servi ce
      // soir, avec les courses en plus.
      lines.push("PREPARATIONS AHEAD (today's first; a line dated another day is NOT for today):");
      for (const prep of shownPreps) {
        const when = prep.isToday
          ? " — TODAY"
          : prep.cookDate
          ? ` — cook on ${prep.cookDate} (${prep.cookOn}), NOT today`
          : " — no cooking day recorded; do not claim it is today";
        lines.push(`- ${prep.title}${when}`);
      }
    }
    if (laterAll.length > laterShown.length) {
      dropped.push(
        `${laterAll.length - laterShown.length} later-day preparation(s) — ` +
          `today's are all above`,
      );
    }
    // MA PART EN TÊTE, ET HORS BUDGET.
    const minePortions = ctx.portions.filter((p) => p.isMe);
    const otherAll = ctx.portions.filter((p) => !p.isMe);
    const otherShown = otherAll.slice(0, state.otherPortions);
    const shownPortions = [...minePortions, ...otherShown];
    if (shownPortions.length > 0) {
      lines.push("");
      lines.push("SERVING NOTES:");
      for (const portion of shownPortions) {
        lines.push(
          `- ${portion.firstName}${portion.isMe ? " (this student)" : ""}: ${
            portion.note ?? "standard share"
          }`,
        );
      }
    }
    if (otherAll.length > otherShown.length) {
      dropped.push(
        `${otherAll.length - otherShown.length} other member(s)' serving ` +
          `note(s) — you do not have them`,
      );
    }
  } else {
    lines.push("");
    lines.push(
      "NOTHING IS COMPOSED FOR TODAY. Say so plainly and point them at the " +
        "meals screen, where they compose it themselves. NEVER say their coach " +
        "is preparing anything for them — no such channel exists, and telling " +
        "them to wait is a lie that costs them a day.",
    );
  }

  // ── LES COURSES ────────────────────────────────────────────────────────────
  //
  // HORS de la branche « aujourd'hui »: une vague de courses couvre la FENÊTRE,
  // pas la journée. Un foyer dont aucun plat n'est composé ce soir peut avoir
  // ses courses à faire, et l'inverse serait un silence faux.
  //
  // MESURÉ avant ce bloc, sur « What do I need to buy? »: l'agent fabriquait la
  // liste depuis les TITRES DES PLATS — « roast chicken, brown rice, green
  // beans, tomato, white beans, lentils, cod, chicken thighs » — en y mêlant
  // les plats des autres jours. Une liste de courses inventée est du même bois
  // qu'un plat inventé: on va l'acheter.
  const shoppingShown = ctx.shopping.slice(0, state.shopping);
  const shoppingCut = ctx.shoppingTruncated ||
    shoppingShown.length < ctx.shopping.length;
  lines.push("");
  if (shoppingShown.length > 0) {
    lines.push(
      shoppingCut
        ? `SHOPPING LIST for this window (first ${shoppingShown.length}; there are more — say the list is longer and send them to the meals screen for the rest):`
        : "SHOPPING LIST for this window:",
    );
    for (const item of shoppingShown) {
      lines.push(`- ${item.term}${item.quantity ? ` — ${item.quantity}` : ""}`);
    }
  } else if (ctx.shopping.length > 0) {
    // La liste EXISTE, elle n'a simplement pas tenu dans le budget. Dire
    // « aucune liste » ici serait un silence FAUX — le mode de défaillance que
    // §7 nomme pour le chargeur, transposé au plafond.
    lines.push(
      "A SHOPPING LIST exists for this window but it is not in this block. " +
        "Say it exists and send them to the meals screen for it. NEVER build " +
        "one out of the dish names above: an invented basket gets bought.",
    );
  } else {
    lines.push(
      "NO SHOPPING LIST is recorded for this window. Say you do not have one " +
        "and send them to the meals screen. NEVER build a shopping list out of " +
        "the dish names above: an invented basket gets bought.",
    );
  }

  if (ctx.myRestrictions.length > 0) {
    lines.push("");
    lines.push("NOT AVAILABLE IN THIS HOUSEHOLD, for this student:");
    for (const r of ctx.myRestrictions) {
      lines.push(`- ${r.label}${r.chosenBy ? ` — chosen by ${r.chosenBy}` : ""}`);
    }
    lines.push(
      "State it as a household choice, ATTRIBUTED and UNJUSTIFIED. Never give " +
        "a health reason for it, never argue for the person who chose it, and " +
        "never dress a domestic decision up as nutrition advice.",
    );
    // ⚠️ « C'EST PAS SI MAUVAIS POUR MOI, SI ? » EST LA MÊME QUESTION RETOURNÉE,
    // et sans cette ligne elle passait. MESURÉ, 1 passe sur 3, posée par un
    // ENFANT de onze ans: « It's not poison, no. But a typical 2-tablespoon
    // serving is about 200 calories, 21 g of sugar, and 4 g of saturated fat…»
    // — une justification nutritionnelle (R4), des chiffres à un mineur (R5),
    // et un compte de calories que le verrou de doctrine ne voit pas passer
    // parce qu'il cherche « calorie counting », pas « 200 calories ».
    lines.push(
      "If they ask whether the food is bad for them, or good, or how much " +
        "sugar or fat or calories it has: you do not answer that. It is not a " +
        "health call, it is a household choice, and quoting a figure turns a " +
        "domestic decision into a verdict on their body.",
    );
  }

  lines.push("");
  lines.push("HARD RULES:");
  lines.push(
    "- Everything you say about what they are eating comes from the lines " +
      "above. Never invent a dish: they will cook what you tell them.",
  );
  lines.push(
    "- READ-ONLY. You cannot compose, change, add or remove anything here. " +
      "Every one of those has its own screen.",
  );
  // ⚠️ LA RÈGLE EST ÉCRITE EN FORME DE RÉPONSE, et pas en forme de principe.
  // MESURÉ 3 passes sur 3 avec la seule phrase « A dish being planned is NOT a
  // dish being eaten »: sur « Did we eat the chicken today? » l'agent répondait
  // « Yes — chicken thighs are listed for today's dinner ». Il n'avait pas
  // coché en base — aucun `protocol_events`, relu — mais il AFFIRMAIT le fait,
  // ce qui est l'inférence que le domaine interdit globalement.
  lines.push(
    "- A dish being planned is NOT a dish being eaten. Never tick anything, " +
      "and never assume it was. If they ask whether something WAS eaten, you " +
      "do not know: this list says what is PLANNED, never what happened. " +
      "Never answer 'yes' to 'did we eat X'.",
  );
  lines.push(
    "- Only what is dated TODAY above is for today. A dish or a preparation " +
      "dated another day is not tonight's, and saying it is sends them to cook " +
      "the wrong thing.",
  );
  // ⚠️ UNE PRÉPARATION N'EST PAS UN PLAT. Le bloc ne porte QUE les plats du
  // jour, mais les préparations portent leurs dates — et le modèle s'en sert
  // pour annoncer le repas d'un autre jour: « Tomorrow is lentils », mesuré
  // 1 passe sur 3 sur « And what are we eating tomorrow? ». C'est une
  // confabulation de plat par déduction, et elle se cuisine comme les autres.
  lines.push(
    "- You have TODAY'S dishes and nothing else. A preparation dated a later " +
      "day is a cooking task, not that day's meal: never turn one into a dish, " +
      "and never state what a later day's meal is. Say you only have today's " +
      "and send them to the meals screen.",
  );
  // ⚠️ LA CEINTURE COLOCATION EST PARTIE AVEC SON SUJET (lot 2, 2026-08-10).
  //
  // Elle interdisait de rendre la consigne de service d'un autre, et surtout d'y
  // répondre PAR COMPARAISON — mesuré 3 passes sur 3: « ma part est-elle plus
  // grosse que celle de Sam ? » recevait un « oui » qui portait la moitié
  // manquante, alors que la consigne de Sam n'était nulle part dans le contexte.
  //
  // Elle n'avait de sujet qu'en colocation. Dans un foyer, `member_portions` EST
  // ce qu'on lit à table, et toutes les portions entrent désormais dans le bloc:
  // la comparaison redevient une question à laquelle on répond avec les deux
  // moitiés. CE QUI RESTE INTERDIT est ailleurs et n'a pas bougé — la RAISON
  // d'une portion, que `household_portions.ts` refuse déjà de façon
  // déterministe et bilingue. C'est cette ceinture-là qui tient la promesse.
  if (ctx.roster.some((m) => m.ageState === "minor")) {
    lines.push(
      "- A child in this household is an EATER, never a target: allergies, " +
        "tastes, portion size. No nutritional goal, no weight, and no figures " +
        "of any kind — not calories, not grams of sugar or fat, not a serving " +
        "size in numbers. A child asking 'how much sugar is in that?' gets a " +
        "plain answer about the plate, never a count.",
    );
  }

  // ── QUAND ON TRONQUE, ON LE DIT ────────────────────────────────────────────
  //
  // C'est le patron que la liste de courses portait déjà, généralisé: « une
  // liste tronquée présentée comme complète est un panier faux ». Un bloc
  // silencieusement amputé fait confabuler — le modèle ne peut pas distinguer
  // « ce foyer n'a que ça » de « on ne t'a donné que ça », et il comble.
  //
  // La phrase est en ANGLAIS, comme tout ce bloc et comme la doctrine, le
  // protocole, le bilan et le pouls: aucun bloc KEEL n'est localisé, la langue
  // de la RÉPONSE est portée par `RESPONSE_LANGUAGE`, en dernière instruction.
  // C'est donc au niveau de la réponse que le bilinguisme se vérifie, et c'est
  // la surface que la personne lit.
  if (dropped.length > 0) {
    lines.push("");
    lines.push("NOT IN THIS BLOCK (the record holds more than fits here):");
    for (const d of dropped) lines.push(`- ${d}`);
    lines.push(
      "Say plainly you do not have these here and send them to the meals " +
        "screen. Never guess them, never rebuild them from the lines above, " +
        "and never present what is above as the whole picture.",
    );
  }

  return lines.join("\n");
}
