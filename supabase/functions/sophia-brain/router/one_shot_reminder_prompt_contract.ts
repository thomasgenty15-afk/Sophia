export type OneShotReminderPayloadHint = {
  raw_text: string | null;
  when_hint: string | null;
  UTC_time: string | null;
  local_label: string | null;
  instruction_hint: string | null;
};

export function emptyOneShotReminderPayloadHint(): OneShotReminderPayloadHint {
  return {
    raw_text: null,
    when_hint: null,
    UTC_time: null,
    local_label: null,
    instruction_hint: null,
  };
}

export function oneShotReminderCanonicalDispatcherPromptLines(): string[] {
  return [
    "2. direct_effects.create_one_shot_reminder:",
    "   - Emettre uniquement si l'utilisateur demande explicitement un rappel ponctuel, une notification ou une programmation, avec un moment ou delai exploitable.",
    '   - Ne pas emettre pour une duree conversationnelle ou un rythme d\'echange, par exemple "reste deux minutes".',
    "   - Utilise direct_effect_time_context comme seule source temporelle: now_utc, user_timezone, user_locale, user_local_datetime et user_local_human.",
    "   - Ne demande pas le fuseau horaire si direct_effect_time_context.user_timezone est present; calcule UTC_time avec ce fuseau.",
    "   - payload_hint.raw_text doit contenir la clause exacte du rappel, pas tout le message multi-intent.",
    "   - payload_hint.when_hint doit contenir le moment ou delai exploitable.",
    "   - payload_hint.UTC_time doit contenir l'instant ISO UTC calcule depuis le moment/delai, now et la timezone utilisateur. Timezone par defaut: Europe/Paris.",
    "   - Pour une formulation relative comme 'dans 30 minutes', 'dans 2 heures' ou 'dans 2 jours et demi', UTC_time doit etre strictement futur par rapport a direct_effect_time_context.now_utc et coherent avec le delai.",
    "   - payload_hint.local_label doit contenir le libelle temporel user-facing a afficher, par exemple demain a 09:00 ou dans 2 jours et demi.",
    "   - payload_hint.instruction_hint doit contenir uniquement ce qu'il faut rappeler, sans absorber les autres demandes du message.",
    "   - Ces champs sont atomiques: si raw_text, when_hint, UTC_time, local_label ou instruction_hint manque, ne pas emettre create_one_shot_reminder.",
    "   - Si le meme message contient une question produit et une demande explicite de rappel ponctuel, garder les deux: skill_signals.product_help pour la question produit et direct_effects.create_one_shot_reminder pour le rappel.",
    "   - Si le meme message contient un besoin coaching, feature_opportunity, weekly ou safety et une demande explicite de rappel ponctuel, garder les deux: le skill_signal ou flow local pour le besoin restant et direct_effects.create_one_shot_reminder pour le rappel.",
    "   - Si create_one_shot_reminder est emis avec un skill_signal conversationnel, la lane globale gere le direct effect; le skill local traite seulement le besoin utilisateur restant.",
    "   - Ne jamais laisser le rappel absorber l'intention restante du tour.",
    "   - Ne pas traiter un rappel recurrent comme un one-shot reminder. Toute demande de relance recurrente, sous quelque forme (tous les soirs, chaque matin, a chaque fois, regulierement, tous les jours), n'emet JAMAIS create_one_shot_reminder: c'est un signal skill_signals.feature_opportunity (initiatives), le soutien recurrent se pose dans les initiatives. Exemple INVALIDE observe: 'mets-moi un rappel chaque soir a 22h30' → direct_effects=[] + feature_opportunity, jamais un create_one_shot_reminder meme avec une heure precise: une heure fixe repetee reste une recurrence. Autre exemple INVALIDE observe: 'j'aimerais un rappel tous les matins a 7h' → direct_effects=[], meme regle.",
    "   - Une question de verification, de statut ou de RECAP sur les rappels ('tu me relances bien a quelle heure ?', 'c'est bien prevu ?', 'j'ai bien un rappel demain ?', 'qu'est-ce que tu as programme ?', 'recapitule mes rappels', 'c'est quoi mon rappel deja ?') n'est jamais une demande de creation: n'emets pas create_one_shot_reminder, meme si le message re-mentionne l'heure ou l'objet d'un rappel existant. Un rappel se lit dans le contexte, il ne se re-cree pas.",
    "   - L'effet se rapporte au MESSAGE COURANT uniquement: n'emets JAMAIS un create_one_shot_reminder dont la demande (raw_text, moment) provient d'un message PRECEDENT de recent_messages — cette demande a deja ete traitee a son propre tour (committee ou bloquee), la re-emettre fabrique un doublon. Si le message courant ne formule pas lui-meme une nouvelle demande de rappel, direct_effects ne contient aucun create, quel que soit l'historique.",
    "   - DECALAGE/MODIFICATION d'un rappel deja cree ('mets-le a 21h30 au lieu de 22h', 'decale mon rappel', 'plutot 21h30' en reference a un rappel deja confirme): emets create_one_shot_reminder avec payload_hint.intent='reschedule' (explicit/identified/high, when_hint = la nouvelle heure demandee) — le runtime BLOQUERA honnetement (aucune modification en chat) et le tour portera un outcome; n'emets jamais un create reel ni un cancel sur un decalage. Anti-faux-positif: si la creation est encore en cours de clarification (aucun rappel committe ce fil), une nouvelle heure est une mise a jour de la demande en cours → create normal avec la nouvelle heure.",
    "   - Regle nocturne (user_local_datetime entre 00:00 et 06:00): 'ce soir' designe le soir du jour civil COURANT, jamais la veille; 'demain' designe strictement le jour civil suivant (J+1), jamais la date du jour. Si le jour vise reste ambigu (ex: 'demain a 21h' dit a 2h du matin), n'emets pas l'effet: la clarification prime.",
    "   - payload_hint.cardinality est obligatoire et vaut 'once' pour un rappel ponctuel. Une demande recurrente n'emet jamais cet effet (cf. regle initiatives); si tu l'emets malgre tout, mets cardinality='recurring' — le runtime le bloquera au lieu de creer un faux ponctuel.",
    "   - ANNULATION: si le user demande d'annuler, supprimer, retirer ou laisser tomber un rappel ponctuel existant ('annule-le', 'supprime le rappel de 19h', 'finalement pas de rappel'), emets create_one_shot_reminder avec payload_hint.intent='cancel' et, si le user precise le rappel vise, payload_hint.when_hint avec son heure. N'emets JAMAIS une creation (intent absent ou 'create') sur une demande d'annulation: le runtime execute l'annulation du pending vise, ou clarifie si plusieurs rappels sont en attente. Une annulation n'exige ni UTC_time ni instruction_hint. Exemple INVALIDE observe: 'annule-le' emis comme create sans intent — la polarite du message est l'ANNULATION, l'effet DOIT porter intent='cancel'.",
  ];
}

export function oneShotReminderCanonicalLocalDispatcherPromptLines(): string[] {
  return [
    "Bloc canonique create_one_shot_reminder:",
    "- Si le user demande explicitement un rappel ponctuel, une notification ou une programmation avec un moment ou delai exploitable, le dispatcher local doit pouvoir exposer create_one_shot_reminder pendant le flow local.",
    "- Une duree/heure seule ne suffit pas: elle doit concerner un rappel voulu, pas le rythme de la conversation.",
    "- Utilise platform_context.direct_effect_time_context comme seule source temporelle si present: now_utc, user_timezone, user_locale, user_local_datetime et user_local_human.",
    "- Ne demande pas le fuseau horaire si platform_context.direct_effect_time_context.user_timezone est present; calcule UTC_time avec ce fuseau.",
    "- Payload canonique obligatoire pour toute emission locale: payload_hint.raw_text = clause exacte du rappel, payload_hint.when_hint = moment/delai exploitable, payload_hint.UTC_time = instant ISO UTC calcule depuis now_utc et user_timezone, payload_hint.local_label = libelle temporel user-facing, payload_hint.instruction_hint = uniquement ce qu'il faut rappeler.",
    "- Si le meme message contient a la fois une reponse/besoin du flow local actif et une demande explicite de rappel ponctuel, garde les deux: continue le flow local sur le besoin restant et expose create_one_shot_reminder via le champ direct_effect_request. Ne laisse jamais la reponse locale faire disparaitre le rappel.",
    "- Pour une formulation relative comme 'dans 30 minutes', 'dans 2 heures' ou 'dans 2 jours et demi', UTC_time doit etre strictement futur par rapport a now_utc et coherent avec le delai.",
    "- Le runtime direct-effect valide UTC_time et l'ecrit en DB comme scheduled_for; il ne parse pas when_hint pour calculer l'heure.",
    "- Ces champs sont atomiques: si create_one_shot_reminder est emis, raw_text, when_hint, UTC_time, local_label et instruction_hint doivent tous etre remplis.",
    "- Ne jamais emettre create_one_shot_reminder avec raw_text seul, meme si la demande de rappel semble claire.",
    "- Si when_hint, UTC_time, local_label ou instruction_hint manque, ne pas emettre create_one_shot_reminder; continue seulement le flow local sur le besoin restant.",
    "- instruction_hint ne doit jamais absorber le besoin local restant du message.",
    "- Si turn_frame.direct_effects contient create_one_shot_reminder, considere que le dispatcher global a deja flagge l'intention pour la lane directe.",
    "- Dans ce cas, le dispatcher local doit retourner direct_effect_request.requested=false s'il expose ce champ.",
    "- Le dispatcher local ne doit pas recreer, rerouter, redemander ou confirmer ce rappel.",
    "- Le dispatcher local doit continuer son domaine local actif sur le besoin restant du message.",
    "- Si direct_effect_lane.committed_effects contient create_one_shot_reminder, le rappel est deja commite: transmets le contexte de confirmation au visible agent et continue le besoin restant.",
    "- Si turn_frame.direct_effects contient create_one_shot_reminder mais direct_effect_lane n'a pas de commit, ne dis jamais que le rappel est programme; laisse le runtime global gerer l'effet et continue le besoin restant.",
    "- Le direct effect ne doit jamais absorber tout le tour.",
    "- Ne traite jamais un rappel recurrent comme create_one_shot_reminder: une demande de relance recurrente (tous les soirs, chaque matin, a chaque fois) releve des initiatives (feature_opportunity cote global); n'emets aucun direct_effect_request pour ca.",
  ];
}

/**
 * Presence gate for the visible one-shot-reminder guidance block.
 *
 * The block is only meaningful when a one-shot reminder actually sits in the
 * turn's direct-effect confirmation context (a reminder committed this turn or
 * still committed+pending inside the 5-turn EffectLedger window). Outside of
 * that window, the generic non-mutation rules each visible agent already owns
 * cover "chat can't cancel/modify a reminder" and "never claim an effect
 * without proof", so injecting the detailed reminder block would only be noise.
 *
 * Detection is purely structural (presence of a `one_shot_reminder` object),
 * never a semantic/regex read of the user message.
 */
export function oneShotReminderVisibleContextPresent(
  directEffectConfirmationContext: unknown,
): boolean {
  if (
    !directEffectConfirmationContext ||
    typeof directEffectConfirmationContext !== "object"
  ) {
    return false;
  }
  const ctx = directEffectConfirmationContext as Record<string, unknown>;
  const reminder = ctx.one_shot_reminder;
  const blocked = ctx.blocked_one_shot_reminder;
  const track = ctx.track_progress;
  return Boolean(reminder && typeof reminder === "object") ||
    Boolean(blocked && typeof blocked === "object") ||
    Boolean(track && typeof track === "object");
}

function normalizeForReminderMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR");
}

/**
 * Deterministic proof that a one-shot reminder is committed and still live in
 * the direct confirmation context (either committed this turn or projected from
 * the recent EffectLedger window, which the loader already gates on a pending DB
 * row). Purely structural, never a semantic read of the user message.
 */
export function directEffectContextHasCommittedOneShotReminder(
  directEffectConfirmationContext: unknown,
): boolean {
  if (
    !directEffectConfirmationContext ||
    typeof directEffectConfirmationContext !== "object"
  ) {
    return false;
  }
  const ctx = directEffectConfirmationContext as Record<string, unknown>;
  if (ctx.has_committed_one_shot_reminder === true) return true;
  const reminder = ctx.one_shot_reminder;
  return Boolean(
    reminder &&
      typeof reminder === "object" &&
      (reminder as Record<string, unknown>).committed === true,
  );
}

/**
 * Deterministic proof that the recent-effects ledger summary carries a committed
 * one-shot reminder whose current DB state is still pending. We require the
 * canonical proof line ("Rappel ponctuel créé: exécuté et persisté") AND an
 * "état DB actuel: pending" marker so we never suppress the denial for a reminder
 * that already fired or was cancelled. Matching is accent-insensitive but only
 * reads the ledger summary string, never the user message.
 */
export function recentEffectsSummaryHasCommittedOneShotReminder(
  recentEffectsSummary: unknown,
): boolean {
  if (
    typeof recentEffectsSummary !== "string" || !recentEffectsSummary.trim()
  ) {
    return false;
  }
  return recentEffectsSummary.split("\n").some((line) => {
    const normalized = normalizeForReminderMatch(line);
    if (!normalized.includes("rappel ponctuel cree")) return false;
    if (!normalized.includes("execute et persiste")) return false;
    return normalized.includes("etat db actuel: pending");
  });
}

/**
 * True when a committed one-shot reminder was created *this turn* by the
 * one-shot reminder pipeline (i.e. the direct confirmation context is the
 * current-turn build, not the recent-ledger projection). The recent-ledger
 * projection tags itself with `source: "recent_effect_ledger"`; the current-turn
 * pipeline build never sets `source`. This is the discriminator that keeps the
 * active "confirm once" instruction on the creation turn only, so it does not
 * leak onto later turns where the reminder is merely available from the ledger
 * window. Purely structural, never a semantic read of the user message.
 */
export function directEffectContextCommittedThisTurn(
  directEffectConfirmationContext: unknown,
): boolean {
  if (
    !directEffectConfirmationContext ||
    typeof directEffectConfirmationContext !== "object"
  ) {
    return false;
  }
  const ctx = directEffectConfirmationContext as Record<string, unknown>;
  if (String(ctx.source ?? "") === "recent_effect_ledger") return false;
  return directEffectContextHasCommittedOneShotReminder(ctx);
}

/**
 * True when a committed, still-pending one-shot reminder is provable to the
 * visible agent from either the direct confirmation context or the recent
 * ledger summary. Used to suppress the "you cannot confirm a reminder" denial so
 * a genuinely committed reminder is never denied on recap.
 */
export function committedOneShotReminderKnown(args: {
  directEffectConfirmationContext?: unknown;
  recentEffectsSummary?: unknown;
}): boolean {
  return (
    directEffectContextHasCommittedOneShotReminder(
      args.directEffectConfirmationContext,
    ) ||
    recentEffectsSummaryHasCommittedOneShotReminder(args.recentEffectsSummary)
  );
}

export function oneShotReminderCanonicalVisiblePromptLines(
  contextPath: string,
  opts?: { present?: boolean; committedThisTurn?: boolean; committedKnown?: boolean },
): string[] {
  const committedThisTurn = opts?.committedThisTurn === true;
  // `committedKnown` is the union: proof exists either this turn (pipeline) or in
  // the recent-ledger window. It gates block presence and denial suppression.
  const committedKnown = opts?.committedKnown === true || committedThisTurn;
  // The block stays injected whenever a reminder sits in the direct context
  // (present) OR whenever a committed reminder is provable (committedKnown), so
  // the guidance reaches the agent even when only the recent summary carries the
  // proof.
  if (opts && opts.present === false && !committedKnown) return [];

  // Active confirmation belongs to the *creation turn* only (the one-shot
  // reminder pipeline confirms once, right after committing). On later turns the
  // reminder is only available from the ledger window: it must NOT be
  // re-confirmed spontaneously, only recalled if the user asks (recap line
  // below). So we emit the "confirm once" directive on the this-turn branch only.
  const activeConfirmationLine = committedThisTurn
    ? `Si ${contextPath}.one_shot_reminder.committed=true, confirme naturellement le rappel une seule fois, en le presentant comme venant d'etre cree — jamais comme 'deja en attente' ou preexistant. Utilise one_shot_reminder.local_label pour le moment et one_shot_reminder.reminder_instruction pour l'objet du rappel, puis reponds au besoin restant du user.`
    : null;

  const committedProofLine = committedThisTurn
    ? `Un rappel ponctuel committe ce tour est prouve dans le contexte (${contextPath}.has_committed_one_shot_reminder=true): confirme-le sobrement une seule fois avec local_label. Ne dis jamais que tu ne peux pas confirmer ce rappel et ne nie jamais son existence.`
    : committedKnown
    ? `Un rappel ponctuel committe est prouve et disponible dans le contexte (${contextPath}.has_committed_one_shot_reminder=true ou visible_runtime_context.recent_effects_summary avec une ligne 'Rappel ponctuel cree: execute et persiste' et etat DB actuel pending). Ne le confirme pas de toi-meme si le user n'en parle pas; rappelle-le seulement s'il le demande ou si c'est utile pour ne pas le contredire. N'ouvre jamais ta reponse par ce rappel et ne le mentionne pas en preambule d'un tour qui porte sur autre chose (emotion, coaching, question). Ne nie jamais son existence.`
    : `Si ${contextPath}.has_committed_one_shot_reminder n'est pas true, ne dis jamais qu'un rappel est programme, cree, enregistre, active ou fait.`;
  const unprovenReminderLine = committedKnown
    ? "N'affirme aucun autre rappel non prouve; ne parle que du rappel committe prouve ci-dessus, en respectant son etat DB actuel (par exemple ne le presente pas comme actif s'il est annule ou deja passe)."
    : "Si aucune de ces sources ne prouve le rappel, dis sobrement que tu ne peux pas confirmer qu'un rappel a ete programme. Ne le deduis jamais du dernier message user, d'une intention, d'une recommandation, ni d'une reponse precedente.";
  return [
    // Politique universelle default-deny (chantier O5): effects_outcome est
    // le contrat total — chaque garde future est honnete par construction.
    `${contextPath}.effects_outcome est la verite complete des ecritures demandees ce tour. Politique: status=committed → confirme une fois; status=blocked/failed/not_attempted → suis guidance de cet outcome, ne presente jamais l'ecriture comme faite; status=needs_clarify → pose clarify_question sans accuser aucune ecriture. Aucun claim d'ecriture NI de correction ("c'est fait/note/enregistre/programme/corrige") hors committed.`,
    ...(activeConfirmationLine ? [activeConfirmationLine] : []),
    "Ne repete pas one_shot_reminder.reminder_instruction ou son equivalent deux fois.",
    "Ne reformule pas l'objet du rappel avant puis apres le marqueur temporel.",
    committedProofLine,
    `Si ${contextPath}.blocked_one_shot_reminder.reason_code=past_time: la creation a ete refusee parce que l'heure demandee est deja passee aujourd'hui. Dis clairement que rien n'a ete cree, propose un autre horaire ou demain, et ne reformule jamais la demande bloquee comme si elle restait valide. Reponds ensuite normalement au reste du message.`,
    `Si ${contextPath}.blocked_one_shot_reminder.reason_code=duplicate_pending: un rappel identique existe deja pour ce moment; rappelle sobrement le rappel existant, ne confirme pas une nouvelle creation.`,
    `Si ${contextPath}.track_progress.committed=true: la progression sur track_progress.target_title est REELLEMENT enregistree (statut track_progress.progress_status). Confirme-la sobrement; ne dis jamais que tu ne peux pas cocher, marquer ou tracker depuis le chat.`,
    "Si le user demande si un rappel recent a ete programme ou ce qui vient d'etre programme, tu peux confirmer seulement depuis deux sources: le contexte direct ci-dessus avec has_committed_one_shot_reminder=true, ou visible_runtime_context.recent_effects_summary si ce champ est fourni et contient une ligne 'Rappel ponctuel cree: execute et persiste' avec etat DB actuel.",
    unprovenReminderLine,
    "Ne calcule jamais une heure visible depuis UTC_time ou scheduled_for; utilise uniquement local_label.",
    "Ne recree, reroute, redemande ou redecide jamais un rappel depuis le visible agent.",
    "ANNULATION d'un rappel ponctuel: possible depuis le chat UNIQUEMENT quand effects_outcome contient un outcome committed de type cancel_one_shot_reminder — dans ce cas confirme l'annulation une fois (avec local_label si connu). Sans ce commit prouve, ne dis JAMAIS qu'un rappel est annule; si l'outcome est needs_clarify (plusieurs rappels en attente), demande lequel annuler; si l'outcome est blocked (aucun pending correspondant), dis qu'il n'y a rien a annuler. Une modification/decalage/reprogrammation reste hors chat: gestion dans la plateforme.",
    "Meme si le message contient d'autres demandes, accuse d'abord la demande d'annulation en une phrase (selon son outcome reel) avant de repondre au reste: ne l'ignore jamais en silence.",
    "Ne nie jamais l'existence d'un rappel deja confirme ou deja prouve par les sources ci-dessus: si le rappel est connu, rappelle-le sobrement avec local_label.",
  ];
}
