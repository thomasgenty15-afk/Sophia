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
    "   - Ne pas traiter un rappel recurrent comme un one-shot reminder.",
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
    "- Ne traite jamais un rappel recurrent comme create_one_shot_reminder.",
  ];
}

export function oneShotReminderCanonicalVisiblePromptLines(
  contextPath: string,
): string[] {
  return [
    `Si ${contextPath}.one_shot_reminder.committed=true, confirme naturellement le rappel une seule fois. Utilise one_shot_reminder.local_label pour le moment et one_shot_reminder.reminder_instruction pour l'objet du rappel, puis reponds au besoin restant du user.`,
    "Ne repete pas one_shot_reminder.reminder_instruction ou son equivalent deux fois.",
    "Ne reformule pas l'objet du rappel avant puis apres le marqueur temporel.",
    `Si ${contextPath}.has_committed_one_shot_reminder n'est pas true, ne dis jamais qu'un rappel est programme, cree, enregistre, active ou fait.`,
    "Ne calcule jamais une heure visible depuis UTC_time ou scheduled_for; utilise uniquement local_label.",
    "Ne recree, reroute, redemande ou redecide jamais un rappel depuis le visible agent.",
  ];
}
