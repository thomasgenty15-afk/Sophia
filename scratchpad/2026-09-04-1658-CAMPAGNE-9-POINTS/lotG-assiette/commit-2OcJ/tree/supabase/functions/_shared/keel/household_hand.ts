/**
 * LA PRISE DE MAIN — qui mange SON plan, et ne mange donc pas celui du foyer.
 * PUR.
 *
 * Autorité produit: docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md,
 * arbitrages D2 et D7, révisés le 2026-08-12. Lot L3.
 *
 * ── LE MODÈLE, PARCE QUE TOUT CE FICHIER EN DÉCOULE ──────────────────────
 * LE PLAN DU MAÎTRE **EST** LE PLAN DU FOYER: lui, plus toutes les bouches sans
 * compte, plus tout compte secondaire qui n'a pas pris la main.
 *
 * Un compte secondaire a DEUX postures, et la première est la normale:
 *
 *   ① IL NE FAIT RIEN, et il est composé dans le plan du maître comme une
 *     bouche ordinaire. Ce n'est pas un cas dégradé — c'est le cas nominal.
 *     D7, mot pour mot: « la composition n'attend jamais personne ».
 *   ② IL PREND LA MAIN: il génère son propre plan (`generate-meal-v1`), le
 *     valide, et le générateur du foyer doit alors l'EXCLURE de sa composition.
 *     Il mange son plan à lui.
 *
 * ── CE QUE CE MODULE DÉCIDE, ET CE QU'IL NE DÉCIDE PAS ───────────────────
 * Il décide UNE chose: est-ce que ce plan personnel RECOUVRE la fenêtre que le
 * foyer s'apprête à composer. Le reste du prédicat — plan personnel, vivant,
 * validé, rattaché à CE foyer — est appliqué par `keel_household_roster_for`,
 * et n'est écrit nulle part ailleurs.
 *
 * La coupure est la MÊME que celle de D14 (`household_presence.ts`): la base
 * rend le FAIT par bouche, un module pur applique la FENÊTRE. Elle n'est pas
 * esthétique. La base ne connaît pas la fenêtre — elle est résolue côté serveur,
 * dans le fuseau du maître, à partir de ce que le client demande. La lui passer
 * en argument optionnel ferait « un paramètre de garde optionnel est une garde
 * désarmée », cicatrice déjà payée par ce dépôt: le chat lit le même roster
 * sans fenêtre, et l'aurait laissé nul pour toujours.
 *
 * Ce module ne REFUSE rien non plus. Il rend `composed: []` quand plus personne
 * ne reste, et c'est l'appelant qui nomme son refus — lui seul sait ce qu'il
 * compose et ce qu'il doit répondre.
 *
 * ── LE RECOUVREMENT EST **TOTAL**, ET C'EST L'ARBITRAGE DU LOT ───────────
 * Un plan personnel ne retire son porteur de la table que s'il couvre la
 * fenêtre du foyer **en entier**. Un plan mercredi→dimanche face à un foyer
 * lundi→dimanche ne prend PAS la main: son porteur reste composé, et il aura
 * une assiette lundi et mardi.
 *
 *   POURQUOI PAS LE RECOUVREMENT PARTIEL. Parce que l'exclusion partielle
 *   affame. Retirer quelqu'un de la composition du lundi au motif qu'il a un
 *   plan à partir de mercredi, c'est cuisiner sans lui les deux jours où il n'a
 *   rien d'autre. Le coût de l'erreur inverse — il a une assiette dans le plan
 *   du foyer les jours où il mange déjà le sien — est un RESTE. C'est
 *   exactement l'arbitrage que L2 a déjà pris sur `servings`: « une moyenne
 *   fait manquer de quoi manger le jour où tout le monde est là; le maximum
 *   fait au pire un reste ».
 *
 *   POURQUOI ÇA NE PRÉEMPTE PAS L4. D15 dit que la FUSION opère sur
 *   l'INTERSECTION des fenêtres — c'est une règle du moteur de fusion, pas de
 *   la composition. Avec le recouvrement total, un plan partiel reste un
 *   candidat de fusion parfaitement ordinaire: son porteur est déjà une bouche
 *   du plan du foyer, et la fusion re-proportionne ses jours. Avec le
 *   recouvrement partiel, L4 devrait au contraire RAJOUTER une bouche pour les
 *   jours que le plan personnel ne couvre pas — une décision que D15 ne prend
 *   pas, et qu'on n'a pas à prendre à sa place.
 *
 *   LE RETOUR ARRIÈRE COÛTE UNE LIGNE: `planCoversWindow` devient
 *   `plansOverlap`, et son test change de nom. C'est l'option la plus
 *   réversible parce que c'est la plus ÉTROITE: élargir n'enlève que des
 *   assiettes, alors que rétrécir après coup ne rend pas les dîners d'un
 *   secondaire qu'on avait cessé de compter.
 *
 *   ⚠️ C3/O1 — « TOTAL » NE VEUT PLUS DIRE « PAR UN SEUL PLAN ». Depuis le
 *   2026-08-12, PLUSIEURS plans à lui, adjacents, qui couvrent ENSEMBLE chaque
 *   jour de la fenêtre, prennent la main (`plansCoveringWindow`, motif
 *   `personal_plans_cover_window`). La règle n'a pas bougé — on n'exclut que
 *   quelqu'un dont AUCUN jour n'est découvert — et le motif écrit ci-dessus ne
 *   s'applique tout simplement pas à ce cas-là: il n'a pas « deux jours où il
 *   n'a rien », il a son plan tous les jours. Retour arrière: retirer la
 *   branche `coveringTogether`, une condition.
 *
 * ── L4/D6 — LA FUSION REPREND, ELLE NE CONTOURNE PAS ────────────────────
 * Depuis le 2026-08-12, l'appelant peut nommer des bouches RECLAMÉES: le maître
 * a décidé de les reprendre dans la cuisine commune. Elles restent composées, et
 * elles sont tracées dans `reclaimed` avec le plan qui les aurait retirées.
 *
 * ⚠️ ÇA PASSE PAR ICI, ET PAS À CÔTÉ. La tentation était de laisser la fusion
 * ré-ajouter la personne après coup, dans le générateur. Ç'aurait fait DEUX
 * endroits qui décident qui est à table — et ce module existe précisément parce
 * qu'il n'y en a qu'un. Une seconde décision aurait divergé au premier
 * ajustement, en silence, dans le sens qui affame.
 *
 * ── LE MAÎTRE N'EST JAMAIS EXCLU ────────────────────────────────────────
 * D2: « le plan du maître EST le plan du foyer ». S'il porte par ailleurs un
 * plan personnel validé — un reliquat de la lane individuelle, par exemple — ce
 * plan ne le retire pas de sa propre table: il cuisinerait alors un repas qu'il
 * ne mange pas. C'est la seule asymétrie de ce fichier, et elle est le modèle.
 */

import { planEndsOn, windowDates } from "./meal_plan_window.ts";

/**
 * Un plan personnel candidat, tel que le roster le rend.
 *
 * ⚠️ « CANDIDAT », PAS « PRISE DE MAIN ». `keel_household_roster_for` a déjà
 * filtré ce que la base peut voir seule (personnel · vivant · validé ·
 * rattaché à ce foyer). Ce qui reste à décider est le recouvrement, et il est
 * décidé ici.
 */
export interface MemberOwnPlan {
  id: string;
  /** Le premier jour, `YYYY-MM-DD`. */
  startsOn: string;
  /** 1 à 7, comme la colonne. */
  durationDays: number;
  /**
   * Rendue pour la TRACE, et re-vérifiée ici par ceinture (voir
   * `parseOwnPlans`). D7 en dépend: un plan non validé ne retire personne.
   */
  validatedAt: string | null;
}

/** La fenêtre que le foyer s'apprête à composer. */
export interface PlanWindow {
  startsOn: string;
  durationDays: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * La colonne `own_plans` du roster, lue avec la MÊME tolérance que
 * `parseAwayDays`: une entrée illisible tombe, les autres restent, et rien
 * n'est deviné.
 *
 * ⚠️ `validatedAt` EST EXIGÉE ICI AUSSI, alors que la requête du roster la
 * filtre déjà. C'est une CEINTURE, pas le mécanisme — et elle est gratuite
 * parce que la donnée est dans la charge utile. La règle qu'elle tient est D7:
 * « qui n'a pas de plan VALIDÉ au moment où le maître compose est
 * automatiquement pris dans le plan du foyer ». Le jour où quelqu'un élargit la
 * requête SQL, cette ligne-ci refuse encore d'affamer un secondaire pour un
 * brouillon.
 */
export function parseOwnPlans(raw: unknown): MemberOwnPlan[] {
  if (!Array.isArray(raw)) return [];
  const out: MemberOwnPlan[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const id = String(e.id ?? "").trim();
    const startsOn = String(e.starts_on ?? "").trim();
    const durationDays = Number(e.duration_days);
    const validatedAt = e.validated_at == null
      ? null
      : String(e.validated_at).trim() || null;
    if (!id || !DATE.test(startsOn)) continue;
    if (!Number.isFinite(durationDays) || durationDays < 1) continue;
    if (validatedAt === null) continue;
    out.push({
      id,
      startsOn,
      durationDays: Math.round(durationDays),
      validatedAt,
    });
  }
  return out;
}

/**
 * Ce plan recouvre-t-il la fenêtre du foyer EN ENTIER.
 *
 * LA SEULE LIGNE QUI DÉCIDE, et elle est volontairement seule: c'est celle
 * qu'on inverse si l'arbitrage change. Les bornes sont INCLUSIVES des deux
 * côtés, et `planEndsOn` est la primitive de tout le dépôt — la réécrire ici
 * ferait une seconde arithmétique de fenêtre, qui divergerait un 31 décembre.
 */
export function planCoversWindow(
  plan: { startsOn: string; durationDays: number },
  window: PlanWindow,
): boolean {
  if (plan.startsOn > window.startsOn) return false;
  return planEndsOn(plan.startsOn, plan.durationDays) >=
    planEndsOn(window.startsOn, window.durationDays);
}

/** Les deux fenêtres se touchent-elles, ne serait-ce que d'un jour. */
export function plansOverlap(
  plan: { startsOn: string; durationDays: number },
  window: PlanWindow,
): boolean {
  return plan.startsOn <= planEndsOn(window.startsOn, window.durationDays) &&
    planEndsOn(plan.startsOn, plan.durationDays) >= window.startsOn;
}

/**
 * C3/O1 — SES PLANS, PRIS ENSEMBLE, COUVRENT-ILS CHAQUE JOUR DE LA FENÊTRE ?
 *
 * ── CE QUE ÇA RÉPARE, ET POURQUOI CE N'EST PAS UN ASSOUPLISSEMENT ─────────
 * O1 du registre, mesuré sur le module pur: plans `08-17 +2j` et `08-19 +1j`
 * contre une fenêtre `08-17 +3j` ⇒ `taken: 0`, `partial: 2`. La personne avait
 * SON plan pour CHAQUE jour de la fenêtre, et le foyer cuisinait quand même
 * pour elle.
 *
 * Le motif écrit du recouvrement TOTAL est « l'exclusion partielle affame:
 * retirer quelqu'un du lundi parce qu'il a un plan à partir de mercredi, c'est
 * cuisiner sans lui deux jours où il n'a rien ». Ici il **n'a aucun jour sans
 * rien** — donc le motif ne s'applique pas, et l'arbitrage reste intact: on
 * n'exclut QUE quelqu'un dont chaque jour de la fenêtre est couvert par un plan
 * à lui. Ce qui change n'est pas la règle, c'est le nombre de plans qu'on
 * autorise à la satisfaire.
 *
 * ── POURQUOI PAS `planCoversWindow` SUR UNE FENÊTRE FUSIONNÉE ─────────────
 * Parce que la contrainte d'exclusion (`student_generated_meals_live_windows_
 * dont_overlap`, scopée `user_id + plan_kind`) interdit le CHEVAUCHEMENT et pas
 * l'ADJACENCE: deux plans personnels vivants et adjacents sont un état NOMINAL
 * du produit, pas une bizarrerie. « Les recoller » en une fenêtre unique serait
 * une seconde arithmétique de fenêtre; on demande donc, jour par jour, si
 * quelqu'un couvre — c'est la même question, posée là où elle se décide.
 *
 * Rend LES PLANS QUI SERVENT, dans l'ordre des jours qu'ils couvrent, ou `[]`
 * quand un seul jour manque. Un plan qui ne sert aucun jour n'y est pas: la
 * trace nomme ce qui a retiré la personne, jamais ce qui traînait à côté.
 */
export function plansCoveringWindow<
  T extends { startsOn: string; durationDays: number },
>(
  plans: readonly T[],
  window: PlanWindow,
): T[] {
  // `windowDates` est LA primitive de fenêtre du dépôt (jeton → date, bornes
  // et plafond compris). Trié: des dates ISO se trient comme le calendrier, et
  // l'ordre des plans rendus est celui des jours qu'ils couvrent.
  const days = Object.values(windowDates(window.startsOn, window.durationDays))
    .sort();
  if (days.length === 0) return [];
  const used: T[] = [];
  for (const day of days) {
    const hit = plans.find((p) =>
      p.startsOn <= day && planEndsOn(p.startsOn, p.durationDays) >= day
    );
    // UN SEUL JOUR DÉCOUVERT SUFFIT À TOUT RENDRE: c'est le recouvrement total,
    // et c'est ce qui interdit d'affamer quelqu'un un lundi.
    if (!hit) return [];
    if (!used.includes(hit)) used.push(hit);
  }
  return used;
}

/** Ce que l'appelant doit porter pour être jugé. */
export interface HandMember {
  memberId: string;
  /** D2: le maître n'est jamais exclu de son propre plan. */
  isOwner: boolean;
  ownPlans: readonly MemberOwnPlan[];
}

/**
 * LES MOTIFS, NOMMÉS. Une trace qui dit « exclu » sans dire selon quelle règle
 * ne se relit pas: le jour où l'arbitrage de recouvrement change, on doit
 * pouvoir séparer les plans écrits avant de ceux écrits après.
 */
export const HAND_REASON_COVERS = "personal_plan_covers_window";
/**
 * C3/O1 — PLUSIEURS PLANS À LUI, ADJACENTS, QUI COUVRENT ENSEMBLE LA FENÊTRE.
 *
 * MOTIF DISTINCT, et pas par goût du vocabulaire: un `covers` se relit sur UNE
 * ligne de plan, celui-ci se relit sur DEUX (ou plus), et la trace en porte
 * autant d'entrées que de plans qui ont servi. Les confondre rendrait
 * indéchiffrable, trois jours plus tard, la question « quel plan l'a retiré de
 * cette table » — et empêcherait de séparer les plans écrits avant C3 de ceux
 * écrits après, ce qui est la raison d'être de tous les motifs de ce fichier.
 */
export const HAND_REASON_COVERS_TOGETHER = "personal_plans_cover_window";
export const HAND_REASON_PARTIAL = "personal_plan_partial_window";
/**
 * L4/D6 — LE MAÎTRE A REPRIS CETTE PERSONNE À SA TABLE.
 *
 * C'est le seul motif qui RAMÈNE quelqu'un au lieu de le retirer, et c'est
 * pour ça qu'il est nommé plutôt que déduit d'une absence de `taken`: sans lui,
 * « fusionné » et « n'a jamais pris la main » laisseraient exactement la même
 * trace sur la ligne du plan, et personne ne pourrait dire lequel des deux
 * s'est produit trois jours plus tard.
 */
export const HAND_REASON_RECLAIMED = "merge_reclaimed";
/**
 * L5/D8 — LE MAÎTRE A DÉFUSIONNÉ: il refait le plan du foyer SANS cette
 * personne.
 *
 * C'est le seul motif qui retire quelqu'un sur une DÉCISION plutôt que sur la
 * couverture de son plan, et c'est pour ça qu'il ne se confond pas avec
 * `personal_plan_covers_window`. La différence est décisive à la relecture: un
 * `covers` se défait tout seul quand la personne cesse de valider, alors qu'un
 * `unmerged` est un geste, et un geste se relit avec son auteur et sa date.
 */
export const HAND_REASON_UNMERGED = "merge_unmerged";

/** Ce qu'on archive dans `generated_from`, par bouche concernée. */
export interface HandTraceEntry {
  member_id: string;
  plan_id: string;
  starts_on: string;
  duration_days: number;
  validated_at: string | null;
  reason: string;
}

export interface HandOff<T> {
  /**
   * Les bouches que le foyer compose. TOUJOURS dans l'ordre du roster: le
   * prompt nomme les gens dans cet ordre, et un tri qui s'invente ici ferait
   * bouger la consigne sans qu'aucune donnée n'ait changé.
   */
  composed: T[];
  /** Qui a pris la main, avec le plan qui l'a retiré de la table. */
  taken: HandTraceEntry[];
  /**
   * Qui porte un plan qui MORD sur la fenêtre sans la recouvrir — donc qui
   * reste composé.
   *
   * ⚠️ CE N'EST PAS DU DÉCOR. C'est la preuve, relisible sur la ligne du plan,
   * que l'arbitrage « recouvrement TOTAL » a été appliqué et non oublié: sans
   * cette liste, un plan partiel et un plan inexistant produisent exactement la
   * même trace, et personne ne peut dire lequel des deux cas s'est produit.
   * C'est aussi ce que L4 lira pour savoir qu'il y a une intersection à
   * fusionner (D15).
   */
  partial: HandTraceEntry[];
  /**
   * L4/D6 — QUI A ÉTÉ REPRIS À LA TABLE PAR UNE FUSION, avec le plan qui
   * l'aurait retiré. Vide sur toute composition ordinaire.
   *
   * ⚠️ ON NE PEUT PAS LE DÉDUIRE DE `taken`. Une personne fusionnée est ABSENTE
   * de `taken` — exactement comme une personne qui n'a jamais rien validé. La
   * seule différence est ici, et elle est décisive: c'est ce que L5 lira pour
   * savoir de qui la fusion a repris le plan, et à quelle date de validation le
   * comparer (D8).
   */
  reclaimed: HandTraceEntry[];
  /**
   * L5/D8 — QUI LE MAÎTRE A SORTI DE LA TABLE PAR UNE DÉFUSION. Vide sur toute
   * composition ordinaire et sur toute fusion.
   *
   * ⚠️ `covers_window` EST LA MOITIÉ QUI COMPTE. L3 refuse le recouvrement
   * PARTIEL parce que « l'exclusion partielle affame »; une défusion, elle,
   * retire quelqu'un sur ORDRE, et cet ordre peut très bien tomber sur une
   * personne dont le plan ne couvre pas tous les jours. C'est le droit du
   * maître (D8: « refaire le plan du foyer SANS user X »), mais ça ne doit pas
   * être invisible: sans ce booléen, « il n'a rien à manger jeudi » n'a aucune
   * trace, et le plan a l'air normal.
   */
  unmerged: HandExclusionEntry[];
}

/**
 * Ce qu'on archive d'une exclusion DÉCIDÉE. Forme distincte de
 * `HandTraceEntry`, et pas par goût: une défusion peut retirer quelqu'un qui
 * n'a AUCUN plan à lui sur cette fenêtre, et une trace qui exigerait un plan
 * aurait alors le choix entre mentir et se taire.
 */
export interface HandExclusionEntry {
  member_id: string;
  reason: string;
  plan_id: string | null;
  starts_on: string | null;
  duration_days: number | null;
  validated_at: string | null;
  /** Son plan à elle couvre-t-il TOUTE la fenêtre dont on la retire ? */
  covers_window: boolean;
}

function traceOf(
  memberId: string,
  plan: MemberOwnPlan,
  reason: string,
): HandTraceEntry {
  return {
    member_id: memberId,
    plan_id: plan.id,
    starts_on: plan.startsOn,
    duration_days: plan.durationDays,
    validated_at: plan.validatedAt,
    reason,
  };
}

/**
 * Qui le foyer compose, et qui mange son propre plan.
 *
 * ── L'ÉCHEC EST OUVERT, COMME PARTOUT SUR CE CHEMIN ─────────────────────
 * Une fenêtre illisible ne retire PERSONNE. L'autre direction serait
 * catastrophique: une date mal formée ferait sortir tout le monde de la table,
 * et le foyer cesserait de cuisiner sans qu'aucune erreur ne remonte.
 */
export function resolveHandOff<T extends HandMember>(args: {
  members: readonly T[];
  window: PlanWindow;
  /**
   * L4/D6 — LES BOUCHES QUE LE MAÎTRE REPREND À SA TABLE, par `memberId`.
   *
   * ⚠️ REQUIS, jamais optionnel, et jamais défaut-é à `[]`. Un paramètre
   * facultatif n'aurait fait remonter AUCUN appelant au compilateur, et une
   * fusion qui oublie de le passer compose sans la personne qu'elle fusionne —
   * c'est-à-dire écrit un plan « fusionné » où l'intéressé n'a pas d'assiette,
   * sans qu'une seule ligne échoue. « Paramètre de garde optionnel = garde
   * désarmée », et ici la garde marche dans les deux sens.
   *
   * Une composition ordinaire passe `[]`, et le résultat est byte-identique à
   * celui d'avant L4.
   */
  reclaimed: readonly string[];
  /**
   * L5/D8 — LES BOUCHES QUE LE MAÎTRE SORT DE SA TABLE (la défusion).
   *
   * ⚠️ REQUIS, jamais optionnel, exactement comme `reclaimed` — et la garde
   * mord dans l'autre sens. Une défusion qui oublierait de le passer
   * recomposerait le plan AVEC la personne qu'elle prétend retirer, en
   * dépensant un appel modèle pour rendre le plan qu'elle voulait défaire, et
   * sans qu'une seule ligne échoue. Le seul signe visible aurait été une
   * consigne de prompt disant « sans X » sur une tablée qui contient X.
   *
   * IL GAGNE SUR `reclaimed`, et l'ordre est le sujet: une composition
   * ordinaire re-reprend automatiquement qui a déjà été fusionné (la fusion est
   * collante), donc une défusion qui ne l'emporterait pas serait annulée par le
   * mécanisme même qu'elle vient corriger.
   */
  excluded: readonly string[];
}): HandOff<T> {
  const composed: T[] = [];
  const taken: HandTraceEntry[] = [];
  const partial: HandTraceEntry[] = [];
  const reclaimed: HandTraceEntry[] = [];
  const unmerged: HandExclusionEntry[] = [];

  const windowUsable = DATE.test(args.window.startsOn) &&
    Number.isFinite(args.window.durationDays) && args.window.durationDays >= 1;

  for (const member of args.members) {
    // D2 — LE MAÎTRE, JAMAIS. Avant toute lecture de plan: son plan personnel
    // ne le concerne pas ici, et le juger ferait apparaître son id dans une
    // trace d'exclusion qui n'aura jamais lieu.
    //
    // ⚠️ ÇA PASSE AUSSI AVANT `excluded` (L5), ET C'EST VOULU. Une défusion qui
    // viserait le maître viderait le plan du foyer de la personne qui le
    // cuisine — le générateur le refuse déjà (`unmerge_member_is_owner`), et
    // cette ligne-ci le rend impossible même si ce refus disparaissait. Une
    // fenêtre illisible ne retire personne non plus: l'échec reste OUVERT dans
    // les deux directions, y compris pour un geste explicite.
    if (member.isOwner || !windowUsable) {
      composed.push(member);
      continue;
    }

    const covering = member.ownPlans.find((p) => planCoversWindow(p, args.window));
    // C3/O1 — LE RECOUVREMENT PAR PLUSIEURS PLANS ADJACENTS.
    //
    // ⚠️ CALCULÉ SEULEMENT QUAND UN SEUL PLAN NE SUFFIT PAS, et l'ordre est le
    // sujet: sur le chemin nominal (un plan qui couvre), `covering` gagne et la
    // trace reste BYTE-IDENTIQUE à celle d'avant ce lot — même motif, une seule
    // entrée. L'union n'entre en jeu que là où l'ancien code laissait la
    // personne à table avec `partial: 2`.
    const coveringTogether = covering
      ? []
      : plansCoveringWindow(member.ownPlans, args.window);
    const covered = covering !== undefined || coveringTogether.length > 0;
    /** Le plan à citer quand on n'en cite qu'un: le premier qui sert. */
    const firstCovering = covering ?? coveringTogether[0] ?? null;

    // L5/D8 — LA DÉFUSION PASSE AVANT TOUT LE RESTE. Le maître a dit « refais
    // le plan SANS lui »: aucune règle de recouvrement, aucune reprise
    // collante, ne doit pouvoir le ramener à table par la bande.
    if (args.excluded.includes(member.memberId)) {
      const fallback = firstCovering ??
        member.ownPlans.find((p) => plansOverlap(p, args.window)) ?? null;
      unmerged.push({
        member_id: member.memberId,
        reason: HAND_REASON_UNMERGED,
        plan_id: fallback?.id ?? null,
        starts_on: fallback?.startsOn ?? null,
        duration_days: fallback?.durationDays ?? null,
        validated_at: fallback?.validatedAt ?? null,
        // C3/O1 — « il a de quoi manger tous ces jours-là » est la question, et
        // deux plans adjacents y répondent OUI aussi bien qu'un seul. Laisser
        // ce booléen sur `covering` seul aurait fait dire à la trace « il n'a
        // rien ces jours-là » d'une personne qui a son plan chaque jour — la
        // seule phrase que ce champ existe pour porter (L5 §4).
        covers_window: covered,
      });
      continue;
    }

    // L4/D6 — LA FUSION PASSE AVANT L'EXCLUSION, et l'ordre est le sujet.
    // Reprendre quelqu'un, c'est précisément annuler ce que son plan aurait
    // fait: le juger d'abord puis le rattraper ensuite ferait apparaître son id
    // dans `taken` ET à table, deux affirmations contradictoires sur la même
    // ligne de plan.
    if (args.reclaimed.includes(member.memberId)) {
      const source = firstCovering ??
        member.ownPlans.find((p) => plansOverlap(p, args.window)) ?? null;
      if (source) {
        reclaimed.push(traceOf(member.memberId, source, HAND_REASON_RECLAIMED));
      }
      composed.push(member);
      continue;
    }

    if (covering) {
      taken.push(traceOf(member.memberId, covering, HAND_REASON_COVERS));
      continue;
    }

    // C3/O1 — DEUX PLANS ADJACENTS QUI COUVRENT ENSEMBLE. Une entrée PAR PLAN,
    // parce qu'il n'y a pas de « le » plan qui l'a retiré: il y en a deux, et
    // n'en citer qu'un ferait de la trace un demi-mensonge sur la seule ligne
    // qui doit permettre de relire l'exclusion.
    if (coveringTogether.length > 0) {
      for (const plan of coveringTogether) {
        taken.push(traceOf(member.memberId, plan, HAND_REASON_COVERS_TOGETHER));
      }
      continue;
    }

    for (const plan of member.ownPlans) {
      if (plansOverlap(plan, args.window)) {
        partial.push(traceOf(member.memberId, plan, HAND_REASON_PARTIAL));
      }
    }
    composed.push(member);
  }

  return { composed, taken, partial, reclaimed, unmerged };
}
