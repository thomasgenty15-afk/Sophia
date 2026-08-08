/**
 * PIVOT NUTRITION — N2 : LE TAP DU SOIR.
 *
 * ── CE QUE CE MODULE DÉCIDE DÉSORMAIS: DEUX CHOSES, PAS UNE ──────────────
 * Il décidait « envoie-t-on la question ce soir ? ». Il décide maintenant
 * « envoie-t-on un message ce soir, et la question part-elle avec ? ».
 *
 * La séparation vient d'un constat produit: ce qui était pénible n'était pas la
 * question, c'était la question TOUS LES JOURS, sans rien en échange. Le
 * message du soir s'ouvre donc sur un fait de la journée (`daily_recap.ts`,
 * gratuit à recevoir, aucune réponse attendue) et la question ne l'accompagne
 * que quand elle est due — voir `decideAskCadence`.
 *
 * UN SEUL MESSAGE, dans tous les cas. Deux messages seraient deux
 * notifications, c'est-à-dire le problème qu'on répare, doublé.
 *
 * ── POURQUOI 3 NIVEAUX ET PAS 0-10 ───────────────────────────────────────
 * La première raison a disparu, et il faut le dire: WhatsApp plafonnait les
 * boutons à TROIS, et ce plafond a façonné toute la forme de ce message. Depuis
 * le chantier de-whatsapp la livraison est un `deliverChatMessage` — une ligne
 * dans la bulle — et plus rien ne limite ni le nombre de boutons ni la longueur
 * des libellés.
 *
 * La SECONDE raison, elle, tient toujours, et c'est la vraie: 0-10 rempli tous
 * les jours est une mauvaise échelle — les réponses se massent sur 7-8, la
 * variance s'effondre, et l'échelle transporte presque rien tout en ayant l'air
 * précise. Un état subjectif quotidien a honnêtement trois niveaux utiles. On
 * garde donc trois niveaux PARCE QU'ILS SONT JUSTES, plus parce qu'un
 * fournisseur nous y obligeait.
 *
 * La finesse n'est pas perdue, elle change d'étage : 1-5 sur six axes dans le
 * point hebdomadaire, dans l'app, là où l'élève a une minute et un vrai écran.
 * Fréquence et granularité s'échangent ; on met la granularité là où le budget
 * d'effort existe.
 *
 * ── POURQUOI L'AXE N'EST DEMANDÉ QUE SI ÇA VA MAL ────────────────────────
 * Un bon jour n'a pas de coupable. Demander « qu'est-ce qui a coincé ? » à
 * quelqu'un qui va bien, c'est l'interrogatoire que §3.3bis interdit — et ça
 * produit en plus une statistique fausse, puisque l'axe serait renseigné sur
 * des journées où rien ne coinçait. La base le refuse d'ailleurs (CHECK
 * `student_daily_checkins_axis_coherent_check`).
 *
 * Ce qu'on obtient est plus actionnable qu'une moyenne : « quand ça coince
 * chez Julie, c'est la faim 4 fois sur 5 » dit à un coach quoi changer, là où
 * « énergie moyenne 6,4 » ne dit rien.
 *
 * PURE MODULE : no I/O, no clock (le caller passe `now`), no randomness.
 */

// ---------------------------------------------------------------------------
// Le vocabulaire (R1 : tokens ASCII, ils voyagent en payload de bouton)
// ---------------------------------------------------------------------------

export const PULSE_LEVELS = ["good", "mixed", "hard"] as const;
export type PulseLevel = (typeof PULSE_LEVELS)[number];

export const PULSE_AXES = ["energy", "hunger", "sleep"] as const;
export type PulseAxis = (typeof PULSE_AXES)[number];

/**
 * Les identifiants de bouton. Ce sont eux qui reviennent dans
 * `interactive_id` ; c'est donc le SEUL chemin d'interprétation déterministe
 * (§3.1 : les identifiants exacts sont du déterministe, jamais du LLM).
 */
export const PULSE_BUTTON_PREFIX = "KEEL_PULSE_";
export const PULSE_AXIS_PREFIX = "KEEL_PULSE_AXIS_";

export function pulseLevelButtonId(level: PulseLevel): string {
  return `${PULSE_BUTTON_PREFIX}${level.toUpperCase()}`;
}
export function pulseAxisButtonId(axis: PulseAxis): string {
  return `${PULSE_AXIS_PREFIX}${axis.toUpperCase()}`;
}

/**
 * 20 caractères max par titre — limite Meta, tronquée par `whatsapp-send`.
 *
 * R3 : le produit est en anglais. Ces libellés partent tels quels dans le
 * payload du bouton et doivent aussi correspondre EXACTEMENT aux boutons du
 * template Meta approuvé (voir `docs/nutrition-pivot/META-TEMPLATES.md`) : hors
 * fenêtre 24h, c'est le template qui rend le message, et un libellé qui diverge
 * ici produit deux expériences différentes selon l'heure d'envoi.
 */
const LEVEL_LABELS_EN: Record<PulseLevel, string> = {
  good: "All good",
  mixed: "So-so",
  hard: "Rough",
};
const AXIS_LABELS_EN: Record<PulseAxis, string> = {
  energy: "Energy",
  hunger: "Hunger",
  sleep: "Sleep",
};

export interface PulseButton {
  id: string;
  title: string;
}

export function pulseLevelButtons(): PulseButton[] {
  return PULSE_LEVELS.map((level) => ({
    id: pulseLevelButtonId(level),
    title: LEVEL_LABELS_EN[level],
  }));
}

export function pulseAxisButtons(): PulseButton[] {
  return PULSE_AXES.map((axis) => ({
    id: pulseAxisButtonId(axis),
    title: AXIS_LABELS_EN[axis],
  }));
}

export const PULSE_QUESTION_EN = "How was today?";
export const PULSE_AXIS_QUESTION_EN = "What was hard?";

/**
 * Le template approuvé qui porte la MÊME question hors fenêtre 24h.
 *
 * Il existe parce que le pouls vise par construction l'élève qui n'a pas
 * écrit: dans la fenêtre, notre code rend le message nativement; hors fenêtre,
 * `whatsapp-send` refuse un `interactive_buttons` en 409, et sans repli le
 * produit ne mesure que les élèves déjà actifs — ceux dont on n'avait pas
 * besoin de mesurer.
 */
export const PULSE_TEMPLATE_NAME_DEFAULT = "keel_daily_pulse_v1";
export const PULSE_TEMPLATE_LANG_DEFAULT = "en_GB";

/**
 * Les composants `button` du template: le payload de chaque réponse rapide,
 * PAR INDEX.
 *
 * C'est ici que se joue le contrat le plus silencieux du pivot. Meta ne renvoie
 * pas le libellé du bouton tapé, il renvoie le payload que NOUS avons attaché à
 * son index. Si l'ordre des boutons chez Meta ne correspond pas à l'ordre de
 * `pulseLevelButtons()`, un élève qui tape « All good » voit « Rough »
 * enregistré — sans erreur, sans trace, et le bilan du coach est faux.
 *
 * Dériver les composants des mêmes boutons que le rendu natif est ce qui
 * empêche les deux chemins de diverger.
 */
export function pulseTemplateButtonComponents(
  buttons: PulseButton[],
): unknown[] {
  return buttons.map((button, index) => ({
    type: "button",
    sub_type: "quick_reply",
    index: String(index),
    parameters: [{ type: "payload", payload: button.id }],
  }));
}

// ---------------------------------------------------------------------------
// Lire la réponse
// ---------------------------------------------------------------------------

export type PulseReply =
  | { kind: "level"; level: PulseLevel }
  | { kind: "axis"; axis: PulseAxis }
  | { kind: "none" };

/**
 * Interprète un `interactive_id`. DÉTERMINISTE, et volontairement rien
 * d'autre : pas de repli sur le texte libre.
 *
 * Pourquoi pas de repli texte : « moyen » écrit à la main peut vouloir dire la
 * réponse au tap comme n'importe quoi d'autre dans une conversation en cours.
 * Un identifiant de bouton, lui, ne peut venir que du bouton. Un élève qui
 * répond en texte est traité comme un message normal — le dispatcher fait un
 * meilleur travail que nous là-dessus, et c'est exactement la répartition que
 * §3.1 prescrit (déterministe pour les identifiants exacts, LLM pour le sens).
 */
export function readPulseReply(interactiveId: string | null | undefined): PulseReply {
  const id = String(interactiveId ?? "").trim().toUpperCase();
  if (!id.startsWith(PULSE_BUTTON_PREFIX)) return { kind: "none" };

  if (id.startsWith(PULSE_AXIS_PREFIX)) {
    const token = id.slice(PULSE_AXIS_PREFIX.length).toLowerCase();
    return PULSE_AXES.includes(token as PulseAxis)
      ? { kind: "axis", axis: token as PulseAxis }
      : { kind: "none" };
  }
  const token = id.slice(PULSE_BUTTON_PREFIX.length).toLowerCase();
  return PULSE_LEVELS.includes(token as PulseLevel)
    ? { kind: "level", level: token as PulseLevel }
    : { kind: "none" };
}

/** Faut-il enchaîner sur la question d'axe ? */
export function needsAxisFollowUp(level: PulseLevel): boolean {
  return level !== "good";
}

// ---------------------------------------------------------------------------
// Décider l'envoi
// ---------------------------------------------------------------------------

/** La fenêtre du soir, en heure LOCALE de l'élève. */
export const PULSE_HOUR_LOCAL = 20;
export const PULSE_WINDOW_END_LOCAL = 22;

/**
 * En dessous de ce délai depuis le dernier échange, on n'ouvre PAS un message
 * séparé : la question s'attache à la réponse que Sophia est déjà en train
 * d'envoyer. Ça ne change ni la fréquence ni la donnée, seulement le nombre de
 * notifications.
 */
export const PULSE_ATTACH_IF_ACTIVE_WITHIN_MINUTES = 30;

export const PULSE_SKIP_REASONS = [
  "already_answered_today",
  // Renommé depuis `already_asked_today`: le message du soir ne PORTE plus
  // forcément une question. Ce qu'on garde à un par jour, c'est le MESSAGE.
  "already_sent_today",
  "outside_window",
  "safety_active",
  "opted_out",
  "no_active_plan",
  // La réduction de bruit du lot, et elle n'existait pas: rien de groundé à
  // dire ET pas de question due ⇒ on se tait. Un soir sans message est un
  // résultat, pas une panne — d'où un motif qui le NOMME dans le compte-rendu.
  "nothing_to_say",
] as const;
export type PulseSkipReason = (typeof PULSE_SKIP_REASONS)[number];

// ---------------------------------------------------------------------------
// LA CADENCE DE LA QUESTION — le vrai levier
// ---------------------------------------------------------------------------

/**
 * L'intervalle nominal entre deux questions, en jours locaux.
 *
 * Trois et pas sept: en dessous, le tap redevient le formulaire quotidien qu'on
 * démonte; au-dessus, la mesure devient trop grossière pour dire à un coach
 * qu'une semaine s'est dégradée. Le fait du soir, lui, reste quotidien — c'est
 * ce qui permet de baisser la fréquence de l'ASK sans laisser le canal refroidir.
 *
 * ⚠️ CE CHIFFRE EST UNE DÉCISION PRODUIT, ET IL EST VERROUILLÉ (R3).
 * « Le "comment tu te sens ?" quotidien » est hors périmètre —
 * `docs/fonctionnalites/conversation/README.md`, « Hors périmètre — engageant ».
 * Le tap n'est PAS supprimé: il garde des consommateurs (l'axe faim de FF-027,
 * et ce message est le véhicule de FF-029 et FF-028). C'est la CADENCE
 * quotidienne qui est interdite, pas la question.
 *
 * `daily_pulse_test.ts` pinne donc la VALEUR (« R3 — la cadence vaut 3 jours »)
 * et simule sept jours en écrivant ⌈7/3⌉ en dur. Les deux épreuves tombent si on
 * ramène ce chiffre à 1 — écrire la décision dans le README d'abord est le seul
 * chemin, et c'est voulu.
 */
export const PULSE_ASK_INTERVAL_DAYS = 3;

/**
 * L'ESCALADE. Après une journée déclarée `hard`, on redemande le lendemain.
 *
 * C'est le seul cas où la mesure vaut plus que la tranquillité: « le protocole
 * n'est pas vivable » est précisément le signal pour lequel cette boucle
 * existe, et le laisser trois jours sans suite le rend inexploitable — le coach
 * apprend la difficulté quand elle est finie.
 */
export const PULSE_ASK_INTERVAL_WHEN_HARD = 1;

/**
 * LE REPLI. Après ce nombre de questions restées sans réponse, l'intervalle
 * s'allonge.
 *
 * Le silence n'est pas une demande de rappel — c'est déjà écrit plus bas pour la
 * garde `already_sent_today`, et c'est la même règle une échelle au-dessus.
 */
export const PULSE_IGNORED_STREAK = 2;
export const PULSE_ASK_INTERVAL_WHEN_IGNORED = 7;

export interface AskCadenceInput {
  /** Jours écoulés depuis la dernière question POSÉE. `null` = jamais posée. */
  daysSinceLastAsk: number | null;
  /** Le niveau de la DERNIÈRE réponse, `null` si l'élève n'a jamais répondu. */
  lastAnsweredLevel: PulseLevel | null;
  /** Questions posées et restées sans réponse DEPUIS la dernière réponse. */
  unansweredStreak: number;
}

export type AskCadenceReason =
  | "never_asked"
  | "interval_reached"
  | "escalated_after_hard"
  | "too_soon"
  | "backing_off";

export interface AskCadenceDecision {
  ask: boolean;
  reason: AskCadenceReason;
  /** L'intervalle retenu, pour que le compte-rendu du job soit lisible. */
  intervalDays: number;
}

/**
 * La question est-elle due aujourd'hui ?
 *
 * ── L'ORDRE EST LE CONTRAT, ET IL PENCHE VERS LE SILENCE ─────────────────
 *   1. jamais posée      — amorçage: on ne peut pas mesurer sans commencer.
 *   2. repli sur silence — DEUX questions ignorées ⇒ on espace. Cette règle
 *                          passe AVANT l'escalade, et c'est l'arbitrage le
 *                          moins évident du module: un élève qui a répondu
 *                          `hard` puis s'est tu deux fois ne doit PAS être
 *                          questionné tous les jours. C'est exactement le
 *                          profil qu'un harcèlement quotidien fait partir, et
 *                          le fait du soir continue de sortir — le canal ne
 *                          refroidit pas pour autant.
 *   3. escalade `hard`   — la dernière réponse dit que ça coince: on redemande
 *                          le lendemain.
 *   4. intervalle        — trois jours.
 *
 * PURE: aucune horloge. L'appelant a déjà résolu les jours locaux, parce que
 * lui seul connaît le fuseau de l'élève.
 */
export function decideAskCadence(input: AskCadenceInput): AskCadenceDecision {
  const ignored = Math.max(0, Math.floor(input.unansweredStreak ?? 0));

  const intervalDays = ignored >= PULSE_IGNORED_STREAK
    ? PULSE_ASK_INTERVAL_WHEN_IGNORED
    : input.lastAnsweredLevel === "hard"
    ? PULSE_ASK_INTERVAL_WHEN_HARD
    : PULSE_ASK_INTERVAL_DAYS;

  const since = input.daysSinceLastAsk;
  if (since === null || !Number.isFinite(since)) {
    return { ask: true, reason: "never_asked", intervalDays };
  }
  if (since < intervalDays) {
    return {
      ask: false,
      reason: ignored >= PULSE_IGNORED_STREAK ? "backing_off" : "too_soon",
      intervalDays,
    };
  }
  return {
    ask: true,
    reason: intervalDays === PULSE_ASK_INTERVAL_WHEN_HARD
      ? "escalated_after_hard"
      : "interval_reached",
    intervalDays,
  };
}

export interface PulseDecisionInput {
  /** Heure locale de l'élève, 0..23. */
  localHour: number;
  /** A-t-il déjà répondu aujourd'hui ? */
  answeredToday: boolean;
  /**
   * Le message du soir est-il DÉJÀ PARTI aujourd'hui (jour local de l'élève) ?
   *
   * REQUIS, et distinct de `answeredToday` — c'est tout l'objet du correctif.
   * La fenêtre fait deux heures et le cron est horaire : il y a donc DEUX ticks
   * dedans. Tant que la seule garde était « a-t-il répondu ? », l'élève qui ne
   * répondait pas — c'est-à-dire précisément celui qu'on ne veut pas harceler —
   * recevait la même question à 20h10 puis à 21h10. Vérifié en local le
   * 2026-08-03 : deux `whatsapp_outbound_messages` « How was today? » de purpose
   * `keel_daily_pulse` le même jour local, pour un élève sans réponse.
   *
   * La garde se fonde sur ce qui est SORTI, pas sur ce qui est revenu : c'est
   * la seule trace qui existe quand l'élève se tait.
   */
  sentToday: boolean;
  /** Minutes depuis le dernier échange, null si aucun. */
  minutesSinceLastExchange: number | null;
  /**
   * Y a-t-il un FAIT sur quoi ouvrir ? (`hasRecapGround` de `daily_recap.ts`)
   *
   * REQUIS, comme `safetyBand` et pour la même raison: un booléen optionnel qui
   * vaut `false` par défaut aurait transformé « l'appelant n'a pas lu les
   * faits » en « cet élève n'a rien fait aujourd'hui », et les deux se seraient
   * comptés en `nothing_to_say` sans qu'aucun test ne les distingue.
   */
  hasGround: boolean;
  /** La question est-elle due ? (`decideAskCadence`) REQUIS, même raison. */
  askDue: boolean;
  /**
   * REQUIS, pas optionnel — corrigé en C4.
   *
   * Il était optionnel, et VÉRIFICATION FAITE, l'unique appelant de production
   * (`keel-daily-pulse-v1`) ne le renseignait pas. La garde `safety_active`
   * était donc testée, verte, et DÉSARMÉE en vrai: un élève en crise recevait
   * « How was today? » à 20h. C'est la classe de défaut la plus fréquente de ce
   * dépôt — des sondes vertes sur un chemin que la production ne prend pas.
   *
   * Un paramètre requis force chaque appelant à DIRE ce qu'il sait, quitte à
   * dire `null`. Un `null` explicite est une déclaration; une clé absente est
   * un oubli, et rien ne distingue les deux quand le champ est optionnel.
   */
  safetyBand: "none" | "low" | "medium" | "high" | "critical" | null;
  optedOut?: boolean;
  hasActivePlan: boolean;
}

export type PulseDecision =
  | {
    decision: "send";
    mode: "standalone" | "attach";
    /** La question part-elle avec le message ? Faux = le fait, tout seul. */
    ask: boolean;
  }
  | { decision: "skip"; reason: PulseSkipReason };

/**
 * L'ORDRE DES GARDES EST LE CONTRAT.
 *
 *   1. opted_out          — réglementaire, jamais surchargeable.
 *   2. safety_active      — on ne demande pas « ta journée ? » à quelqu'un en
 *                           crise, et on ne lui récite pas non plus son
 *                           décompte de repas. Le dépôt a un incident documenté
 *                           d'effet durable committé pendant un tour de crise.
 *   3. no_active_plan     — rien à suivre, donc rien à dire ni à demander.
 *   4. already_answered   — un tap par jour. Le CHECK d'unicité le tient aussi,
 *                           mais mieux vaut ne pas envoyer que d'envoyer et
 *                           refuser l'écriture.
 *   5. already_sent       — UN message du soir par jour. La fenêtre dure deux
 *                           heures et le cron est horaire: sans cette garde, le
 *                           silence de l'élève vaut relance à 21h10. Le silence
 *                           n'est pas une demande de rappel.
 *   6. outside_window     — hors 20h-22h locales, on ne fait rien: le tick
 *                           suivant retombera dedans. Jamais annulé, juste
 *                           pas maintenant.
 *   7. nothing_to_say     — DERNIÈRE, et c'est délibéré. Elle est la seule qui
 *                           dépende de la journée de l'élève plutôt que de son
 *                           état; la placer plus haut masquerait les six
 *                           autres dans le compte-rendu, et « personne n'avait
 *                           rien fait » couvrirait « tout le monde était hors
 *                           fenêtre ».
 *
 * `already_answered` avant `already_sent` alors que les deux coupent au même
 * endroit: c'est de l'ATTRIBUTION. « Il a répondu » et « on l'a sollicité sans
 * réponse » sont deux journées différentes pour le coach, et le compteur du
 * job est ce qui les distingue.
 *
 * ⚠️ L'ACTIVITÉ NE SUPPRIME JAMAIS LA QUESTION — et la refonte ne l'a pas
 * entamé. Un élève qui a envoyé trois photos aujourd'hui a une bonne couverture
 * et peut être épuisé: les photos disent CE QU'IL A MANGÉ, le tap dit SI LE
 * PROTOCOLE EST VIVABLE. Ce sont deux mesures orthogonales. `hasGround` décide
 * de ce qu'on RACONTE, jamais de ce qu'on demande — un jour où la question est
 * due, elle part, que la journée soit pleine ou vide. Les deux entrées sont
 * séparées exprès pour que ça reste vrai par construction.
 */
export function decideDailyPulse(input: PulseDecisionInput): PulseDecision {
  if (input.optedOut) return { decision: "skip", reason: "opted_out" };

  const band = input.safetyBand ?? "none";
  if (band !== "none") return { decision: "skip", reason: "safety_active" };

  if (!input.hasActivePlan) return { decision: "skip", reason: "no_active_plan" };
  if (input.answeredToday) return { decision: "skip", reason: "already_answered_today" };
  if (input.sentToday) return { decision: "skip", reason: "already_sent_today" };

  const hour = Math.floor(input.localHour);
  if (!Number.isFinite(hour) || hour < PULSE_HOUR_LOCAL || hour >= PULSE_WINDOW_END_LOCAL) {
    return { decision: "skip", reason: "outside_window" };
  }

  // Rien de vrai à dire et rien à demander: on se tait. C'est la moitié du lot.
  if (!input.hasGround && !input.askDue) {
    return { decision: "skip", reason: "nothing_to_say" };
  }

  const since = input.minutesSinceLastExchange;
  const active = since !== null && Number.isFinite(since) &&
    since <= PULSE_ATTACH_IF_ACTIVE_WITHIN_MINUTES;

  return { decision: "send", mode: active ? "attach" : "standalone", ask: input.askDue };
}

// ---------------------------------------------------------------------------
// Le rendu
// ---------------------------------------------------------------------------

export interface PulseMessage {
  body: string;
  buttons: PulseButton[];
}

export function renderPulseQuestion(): PulseMessage {
  return { body: PULSE_QUESTION_EN, buttons: pulseLevelButtons() };
}

/**
 * LE MESSAGE DU SOIR TEL QUEL — le fait, puis la question quand elle est due.
 *
 * Les trois formes que l'élève peut recevoir, et aucune autre:
 *
 *   fait + question   « Ticked off today: … — 2 of the 4 on the plan.
 *                       \n\n How was today? »          [3 boutons]
 *   fait seul         « Ticked off today: … »          [aucun bouton]
 *   question seule    « How was today? »               [3 boutons]
 *
 * ── PAS DE BOUTON SANS QUESTION, PAS DE QUESTION SANS BOUTON ─────────────
 * C'est la seule invariance de rendu qui compte, et elle est tenue ici plutôt
 * que par une convention d'appelant. Des boutons sous un simple constat
 * demanderaient une réponse à un message qui n'en attend pas; une question sans
 * bouton renverrait l'élève au clavier alors que `readPulseReply` ne lit QUE
 * des identifiants de bouton — sa réponse texte partirait au dispatcher et la
 * journée ne serait jamais mesurée.
 *
 * La ligne vide entre les deux n'est pas cosmétique: sans elle, le décompte et
 * la question se lisent comme une seule phrase, et « 2 des 4 du plan, et ta
 * journée ? » transforme le constat en préambule d'interrogatoire — exactement
 * le biais de mesure que `daily_recap.ts` existe pour éviter.
 */
export function renderPulseMessage(
  args: { recapBody: string | null; ask: boolean },
): PulseMessage {
  const recap = String(args.recapBody ?? "").trim();
  if (!args.ask) {
    // Un appel sans fait NI question ne rend rien de sensé: le décideur a déjà
    // écarté ce cas en `nothing_to_say`, et le lever ici empêche qu'un futur
    // appelant contourne la décision et poste une bulle vide (R7).
    if (!recap) {
      throw new Error("[keel/pulse] renderPulseMessage: neither ground nor ask");
    }
    return { body: recap, buttons: [] };
  }
  return {
    body: recap ? `${recap}\n\n${PULSE_QUESTION_EN}` : PULSE_QUESTION_EN,
    buttons: pulseLevelButtons(),
  };
}

export function renderPulseAxisQuestion(): PulseMessage {
  return { body: PULSE_AXIS_QUESTION_EN, buttons: pulseAxisButtons() };
}

/**
 * L'accusé après le tap. Court, sans commentaire sur la réponse.
 *
 * Aucune des trois formulations ne juge, ne console ni ne rebondit : « dur »
 * suivi de « courage, demain ira mieux » est exactement la tendresse non
 * groundée que la doctrine du dépôt proscrit, et sur un tap quotidien ça
 * devient insupportable en une semaine. On accuse réception, on se tait.
 */
export function renderPulseAck(level: PulseLevel, axis: PulseAxis | null): string {
  if (level === "good") return "Got it 👌";
  if (axis === null) return "Got it.";
  return "Got it, thanks.";
}

// ---------------------------------------------------------------------------
// FF-013 — LE BLOC DE CONTEXTE : CE QU'ON SAIT DÉJÀ, ET CE QU'ON NE REDEMANDE PAS
// ---------------------------------------------------------------------------

/** Ce que le bloc a besoin de savoir du dernier tap. Voir `loadLatestPulse`. */
export interface CitablePulse {
  localDate: string;
  level: PulseLevel;
  axis: PulseAxis | null;
  daysAgo: number;
}

/** L'axe, en anglais lisible. Table fermée: pas de `slug.replace('_',' ')`. */
const AXIS_LABEL: Readonly<Record<PulseAxis, string>> = {
  energy: "energy",
  hunger: "hunger",
  sleep: "sleep",
};

/** Le niveau, tel qu'il est écrit sur le bouton que l'élève a touché. */
const LEVEL_LABEL: Readonly<Record<PulseLevel, string>> = {
  good: "Good",
  mixed: "Mixed",
  hard: "Rough",
};

/**
 * LE BLOC DE L'ÉNERGIE, DE LA FAIM ET DU SOMMEIL — dans cet ordre : d'abord ce
 * qu'on SAIT, ensuite l'interdiction de le demander.
 *
 * ── L'ORDRE EST LE SUJET DE LA FICHE ───────────────────────────────────────
 * FF-013 §4 le dit en une phrase: « on ne corrige pas ça par une interdiction
 * dans le prompt. Un agent qui ignore une donnée la redemandera, quelle que
 * soit la consigne. On la lui donne, et ALORS SEULEMENT on lui interdit de
 * demander. » L'interdiction seule est le correctif prompt-only que ce dépôt a
 * déjà mesuré en régression.
 *
 * ── CE QU'IL PORTE, ET CE QU'IL REFUSE DE PORTER ───────────────────────────
 * Un tap, daté. Pas de moyenne, pas de tendance, pas de série: l'en-tête de ce
 * module le dit déjà — « quand ça coince chez Julie, c'est la faim 4 fois sur
 * 5 » est actionnable, « énergie moyenne 6,4 » ne dit rien et se lit comme un
 * score.
 *
 * ── LE SILENCE N'EST PAS UNE BONNE JOURNÉE ─────────────────────────────────
 * Sans tap, le bloc n'énonce PAS « il n'a rien tapé »: il dit à l'agent qu'il
 * ne sait rien, et lui interdit quand même de demander. Écrire l'absence ferait
 * ressortir l'état interne dans la bouche de l'agent — la leçon de
 * `NO_COACH_METHOD_BLOCK`, dont le titre sortait mot pour mot.
 *
 * @param pulse le dernier tap citable, ou `null`.
 * @param hasWeeklyAxes `true` si les six axes du dimanche sont DÉJÀ dans le
 *   prompt (bloc du bilan hebdo). REQUIS, jamais optionnel: c'est ce qui décide
 *   si le bloc dit « tu as ses notes plus haut » ou pas, et un paramètre de
 *   garde optionnel est une garde désarmée.
 */
export function pulseContextBlock(
  pulse: CitablePulse | null,
  hasWeeklyAxes: boolean,
): string {
  const lines: string[] = [];
  lines.push("== HOW THEY HAVE BEEN FEELING — ALREADY COLLECTED, NEVER ASK AGAIN ==");
  lines.push("");

  if (pulse) {
    const when = pulse.daysAgo === 0
      ? `today (${pulse.localDate})`
      : pulse.daysAgo === 1
      ? `yesterday evening (${pulse.localDate})`
      : `${pulse.daysAgo} days ago (${pulse.localDate})`;
    const axis = pulse.axis
      ? `, and the thing that gave way was ${AXIS_LABEL[pulse.axis]}`
      : "";
    lines.push(
      `- Their last evening check-in was ${when}: they tapped ` +
        `"${LEVEL_LABEL[pulse.level]}"${axis}.`,
    );
    lines.push(
      "- You may refer to it, but ALWAYS with its date. A fact from three days " +
        "ago presented as today's is a lie about freshness, and they will know.",
    );
  } else {
    lines.push(
      "- You have no recent evening check-in from them. That is an ABSENCE OF " +
        "DATA, not a calm week: never imply the day went well, and never " +
        "mention that they have not tapped.",
    );
  }

  if (hasWeeklyAxes) {
    lines.push(
      "- Their own 1-to-5 ratings for the reviewed week are in the block above. " +
        "Use those; do not ask them to rate anything again.",
    );
  }

  lines.push("");
  // FF-012 — LA RÈGLE ALIMENTAIRE VIT ICI, ET PAS DANS LE PROMPT DU COMPAGNON.
  //
  // Deux raisons, et la seconde est mesurée. (1) « Ne demande jamais ce qu'il a
  // mangé » n'a aucun sens pour la branche legacy grand public, qui partage le
  // prompt du compagnon et n'a pas de repas. (2) Le corps du prompt FR du
  // compagnon était à 12 987 caractères pour un plafond de 13 000 — TREIZE
  // caractères de marge, et le test de budget est tombé à la première ligne
  // ajoutée. Une règle KEEL vit dans un bloc KEEL.
  //
  // Elle est dans CE bloc plutôt que dans celui du soutien groundé parce que
  // celui-ci passe AVANT dans l'ordre d'injection: le budget tronque par la
  // queue, et l'interdiction de solliciter est la fiche entière de FF-012.
  lines.push("HARD RULE — what this conversation NEVER asks for:");
  lines.push(
    "- NEVER ask what they ate, what they had, what they cooked, how their " +
      "eating went, or any softened version of any of those. Not as a " +
      "greeting, not as small talk, not to fill a turn. You ACCEPT what they " +
      "offer; you never collect. If they give you a meal, that is theirs to " +
      "give.",
  );
  lines.push("");
  lines.push("And the same rule for energy, hunger, sleep and digestion:");
  lines.push(
    "- NEVER ask about them. Not 'how's your energy?', not 'how are you " +
      "sleeping?', not 'how's your appetite been?', not a softened version of " +
      "any of those. They are already collected twice — every evening in one " +
      "tap, every Sunday in six ratings — and a third ask is what kills the " +
      "first two.",
  );
  lines.push(
    "- If they bring it up themselves, take it as context for your reply. It " +
      "records nothing, and you must not treat it as an entry.",
  );
  lines.push(
    "- Never average them, never call out a trend, never turn a run of taps " +
      "into a streak.",
  );
  lines.push(
    "- If they contradict what they tapped, believe what they are telling you " +
      "NOW. Do not correct the record and do not point out the contradiction.",
  );

  return lines.join("\n");
}
