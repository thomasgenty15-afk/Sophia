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
 * `memberVisibility` filtre AU CHARGEMENT, pas à la rédaction. Un prompt qui
 * porte la donnée et une consigne de ne pas la dire est un prompt qui la dira.
 * Ce que la visibilité refuse n'entre jamais dans le contexte — il n'y a donc
 * rien à ne pas dire.
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
  type HouseholdKind,
  HOUSEHOLD_KINDS,
  type HouseholdMemberSnapshot,
  type HouseholdRole,
  memberVisibility,
} from "./household.ts";
import type { BirthDateVerdict } from "./student_age.ts";

/** Structural type: les tests injectent un faux, la prod un SupabaseClient. */
// deno-lint-ignore no-explicit-any
type Db = any;

// ---------------------------------------------------------------------------
// CE QUE LE TOUR PORTE
// ---------------------------------------------------------------------------

export interface HouseholdRosterEntry {
  userId: string;
  firstName: string;
  isMinor: boolean;
  role: HouseholdRole;
  /** `full` ⇒ on peut dire ce qui le concerne. `presence_only` ⇒ il est là. */
  visibility: "full" | "presence_only";
}

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
  kind: HouseholdKind;
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

// ---------------------------------------------------------------------------
// LE CHARGEUR
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> =>
      Boolean(v) && typeof v === "object" && !Array.isArray(v)
    )
    : [];
}

/**
 * Un membre du roster, dans la forme que `memberVisibility` attend.
 *
 * ⚠️ `is_minor` VIENT DE LA RPC, DÉRIVÉ CÔTÉ BASE, et on ne recalcule rien:
 * ce dépôt a UNE définition du mineur (`keel_household_is_minor`, jumelle de
 * `student_age.ts`), et une seconde divergerait au premier ajustement. Le
 * `BirthDateVerdict` est reconstruit à MINIMA — statut seulement — parce que la
 * RPC ne rend délibérément PAS la date de naissance: ouvrir `profiles` aux
 * co-membres livrerait téléphone, e-mail et identifiant Stripe pour afficher un
 * prénom.
 */
function snapshotOf(row: Record<string, unknown>): HouseholdMemberSnapshot {
  const verdict: BirthDateVerdict = row.is_minor === true
    ? { status: "minor", isoDate: "", age: 0 }
    : { status: "adult", isoDate: "", age: 0 };
  return {
    userId: str(row.user_id),
    role: str(row.role) === "owner" ? "owner" : "member",
    birthDateVerdict: verdict,
    restrictionConsentAt: row.restriction_consent_at == null
      ? null
      : str(row.restriction_consent_at),
  };
}

/**
 * Le foyer de cet élève, tel que le tour a le droit de le voir.
 *
 * Rend `null` — et le bloc n'est alors PAS injecté — dans quatre cas qui se
 * comportent pareil et se journalisent différemment: pas de foyer, plan
 * périmé, lecture en panne, roster illisible. Aucun d'eux ne produit « ton
 * foyer n'a rien prévu » à quelqu'un qui vit seul (R8).
 *
 * @param localDate la date LOCALE de l'élève. C'est elle qui décide si une
 *   fenêtre de plan couvre « aujourd'hui »: un plat d'hier servi ce soir est
 *   une erreur silencieuse.
 */
export async function loadHouseholdTurnContext(
  db: Db,
  args: { userId: string; localDate: string },
): Promise<HouseholdTurnContext | null> {
  const userId = str(args.userId);
  const localDate = str(args.localDate);
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return null;

  try {
    // 1. LE FOYER. `keel_household_of` est la résolution unique: la contrainte
    // `household_members_one_household_per_user` la garantit, et ce chargeur
    // est le premier à casser le jour où elle tombe (V1, assumé).
    const membership = await db
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (membership.error) throw membership.error;
    const householdId = str(
      (membership.data as Record<string, unknown> | null)?.household_id,
    );
    if (!householdId) return null;

    const householdRes = await db
      .from("households")
      .select("id, kind")
      .eq("id", householdId)
      .maybeSingle();
    if (householdRes.error) throw householdRes.error;
    const rawKind = str((householdRes.data as Record<string, unknown> | null)?.kind);
    if (!(HOUSEHOLD_KINDS as readonly string[]).includes(rawKind)) return null;
    const kind = rawKind as HouseholdKind;

    // 2. LE ROSTER, par la RPC — jamais par `profiles`. Le fait que la RPC
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
    // Les deux fonctions partagent UN corps (20260808060000): le navigateur
    // garde sa garde `auth.uid()`, le serveur passe l'élève explicitement.
    const rosterRes = await db.rpc("keel_household_roster_for", { p_user: userId });
    if (rosterRes.error) throw rosterRes.error;
    const rosterRows = asArray(rosterRes.data);
    const me = rosterRows.map(snapshotOf).find((m) => m.userId === userId);
    if (!me) return null;

    const roster: HouseholdRosterEntry[] = rosterRows.map((row) => {
      const snapshot = snapshotOf(row);
      return {
        userId: snapshot.userId,
        firstName: str(row.first_name),
        isMinor: row.is_minor === true,
        role: snapshot.role,
        // LE FILTRE, ET IL EST ICI. Pas dans le prompt, pas dans la réponse.
        visibility: memberVisibility(kind, me, snapshot),
      };
    });

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
        title: str(d.title),
        slot: str(d.slot) || null,
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
          title: str(p.title),
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

    // 4. LES PORTIONS. En `shared`, UNIQUEMENT la mienne — filtrée ici, à la
    // lecture, et pas par une consigne de discrétion dans le prompt.
    const visibleById = new Map(roster.map((r) => [r.userId, r]));
    const portions: HouseholdPortionLine[] = (plan ? asArray(plan.member_portions) : [])
      .map((p) => {
        const memberId = str(p.userId ?? p.user_id);
        const entry = visibleById.get(memberId);
        return {
          memberId,
          visible: memberId === userId || entry?.visibility === "full",
          line: {
            firstName: entry?.firstName || str(p.displayName ?? p.display_name),
            note: str(p.portionNote ?? p.portion_note) || null,
            isMe: memberId === userId,
          },
        };
      })
      .filter((p) => p.visible && p.line.firstName !== "")
      .slice(0, HOUSEHOLD_MAX_PORTIONS)
      .map((p) => p.line);

    // 4-bis. LA LISTE DE COURSES DE LA FENÊTRE. Elle n'a pas de jour: une
    // vague de courses couvre la semaine, et la découper par date inventerait
    // une information que la ligne ne porte pas. Bornée, et le bloc DIT qu'elle
    // l'est — une liste tronquée présentée comme complète est un panier faux.
    const shoppingAll = (plan ? asArray(plan.shopping_list) : [])
      .map((s) => ({
        term: str(s.term),
        quantity: str(s.quantity) || null,
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
      .eq("member_user_id", userId)
      .limit(HOUSEHOLD_MAX_RESTRICTIONS);
    if (restrictionsRes.error) throw restrictionsRes.error;
    const myRestrictions: HouseholdRestrictionLine[] = asArray(restrictionsRes.data)
      .map((r) => ({
        label: str(r.label),
        chosenBy: visibleById.get(str(r.created_by))?.firstName || null,
      }))
      .filter((r) => r.label !== "");

    return {
      householdId,
      kind,
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
  const lines: string[] = [];
  lines.push("== WHAT THIS HOUSEHOLD IS EATING (read-only) ==");
  lines.push("");
  lines.push(
    "This is NOT the coach's plan. It is what this household composed for " +
      "itself. Never merge the two, and never present one as the other.",
  );
  lines.push("");

  const others = ctx.roster.filter((m) => m.visibility !== "full");
  lines.push(
    `Household of ${ctx.roster.length} (${ctx.kind}): ${
      ctx.roster.map((m) =>
        // ⚠️ « (child) » EST UNE DONNÉE SUR QUELQU'UN, pas une présence. En
        // colocation, `presence_only` veut dire « il est là, et c'est tout ce
        // qu'on en dit »: l'âge d'un colocataire est dérivé de sa date de
        // naissance, et l'annoncer serait exactement la fuite que R3 ferme
        // pour les portions. La CEINTURE mineur, elle, reste armée plus bas —
        // elle lit le roster, pas cette étiquette.
        m.firstName + (m.isMinor && m.visibility === "full" ? " (child)" : "")
      ).join(", ")
    }.`,
  );

  if (ctx.hasPlanToday) {
    lines.push("");
    lines.push("TODAY'S DISHES, exactly as composed:");
    for (const dish of ctx.todayDishes) {
      lines.push(`- ${dish.title}${dish.slot ? ` (${dish.slot})` : ""}`);
    }
    if (ctx.preparations.length > 0) {
      lines.push("");
      // ⚠️ CHAQUE LIGNE PORTE SON JOUR, ET C'EST STRUCTUREL. Sans le jour, une
      // préparation de jeudi lue un samedi devient « à cuisiner maintenant » —
      // mesuré 3 fois sur 3 avant ce libellé, sur « What do I need to cook
      // today? ». Une cuisson faite au mauvais jour est le plat d'hier servi ce
      // soir, avec les courses en plus.
      lines.push("PREPARATIONS AHEAD (today's first; a line dated another day is NOT for today):");
      for (const prep of ctx.preparations) {
        const when = prep.isToday
          ? " — TODAY"
          : prep.cookDate
          ? ` — cook on ${prep.cookDate} (${prep.cookOn}), NOT today`
          : " — no cooking day recorded; do not claim it is today";
        lines.push(`- ${prep.title}${when}`);
      }
    }
    if (ctx.portions.length > 0) {
      lines.push("");
      lines.push("SERVING NOTES:");
      for (const portion of ctx.portions) {
        lines.push(
          `- ${portion.firstName}${portion.isMe ? " (this student)" : ""}: ${
            portion.note ?? "standard share"
          }`,
        );
      }
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
  lines.push("");
  if (ctx.shopping.length > 0) {
    lines.push(
      ctx.shoppingTruncated
        ? `SHOPPING LIST for this window (first ${ctx.shopping.length}; there are more — say the list is longer and send them to the meals screen for the rest):`
        : "SHOPPING LIST for this window:",
    );
    for (const item of ctx.shopping) {
      lines.push(`- ${item.term}${item.quantity ? ` — ${item.quantity}` : ""}`);
    }
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
  // ⚠️ LA CONDITION EST LE VERDICT, PAS LE MODE. `others` vient déjà de
  // `memberVisibility`; y ajouter `kind === "shared"` remettait le mode du
  // foyer dans une décision de visibilité — le `if (kind === 'shared')` local
  // que §9 nomme comme la seconde vérité à ne pas écrire. Les deux formes sont
  // équivalentes aujourd'hui (en `family` tout le monde est `full`, donc
  // `others` est vide), et une seule le restera si la règle bouge.
  if (others.length > 0) {
    lines.push(
      "- Shared household: you do not know the other members' goals, " +
        "measurements or serving notes, and you are not withholding them — " +
        "they are not in your context at all. Say you do not know.",
    );
    // ⚠️ LA FUITE PAR COMPARAISON, ET ELLE N'A PAS BESOIN DE LA DONNÉE.
    // MESURÉ 3 passes sur 3: « Is my portion bigger than Sam's tonight? » →
    // « Yes — Rob's serving note is a larger protein and starch share. I don't
    // have Sam's portion note here. » La consigne de l'autre n'était nulle part
    // dans le contexte, et pourtant la comparaison est ASSERTÉE: le « yes »
    // porte la moitié manquante. Un démenti qui suit ne la reprend pas.
    lines.push(
      "- And never answer a COMPARISON with them: 'is my share bigger than " +
        "theirs?' needs the other half, and you do not have it. Do not say yes " +
        "or no and then add a caveat — the yes is the leak. Answer only that " +
        "you do not have their note, and give them theirs.",
    );
  }
  if (ctx.roster.some((m) => m.isMinor)) {
    lines.push(
      "- A child in this household is an EATER, never a target: allergies, " +
        "tastes, portion size. No nutritional goal, no weight, and no figures " +
        "of any kind — not calories, not grams of sugar or fat, not a serving " +
        "size in numbers. A child asking 'how much sugar is in that?' gets a " +
        "plain answer about the plate, never a count.",
    );
  }

  return lines.join("\n");
}
