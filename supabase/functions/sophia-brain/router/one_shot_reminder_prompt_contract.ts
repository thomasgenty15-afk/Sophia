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
    "   - EXPLICITE = un acte de rappel adresse a Sophia ('rappelle-moi', 'mets-moi un rappel', 'previens-moi', 'envoie-moi un message a...'). Un complement temporel n'est JAMAIS a lui seul une demande de rappel: quand l'acte principal du message est une recherche, une question ou une demande d'info, un fragment comme 'ce soir', 'demain' ou 'ce week-end' decrit le moment ou le USER agira, pas une notification a programmer. Exemple INVALIDE observe (eva-r9 B02): 'tu peux me chercher sur internet des methodes contre le scroll nocturne, que je puisse tester ce soir ?' → direct_effects=[] (c'est une recherche; 'ce soir' est incident), jamais un create_one_shot_reminder. Autre INVALIDE observe (P8-B, eva-hard23 T7): 'garde-la moi bien au chaud pour que je la retrouve ce soir a 22h' (conservation d'une POTION/artefact coaching) → direct_effects=[] — le user demande de stocker un objet coaching, pas une notification; un create ici substitue un rappel a la potion et le rendu confabule « ta potion est bien gardee ». Rien ne se « garde » depuis le chat.",
    '   - Ne pas emettre pour une duree conversationnelle ou un rythme d\'echange, par exemple "reste deux minutes".',
    "   - Utilise direct_effect_time_context comme seule source temporelle: now_utc, user_timezone, user_locale, user_local_datetime et user_local_human.",
    "   - Ne demande pas le fuseau horaire si direct_effect_time_context.user_timezone est present; calcule UTC_time avec ce fuseau.",
    "   - payload_hint.raw_text doit contenir la clause exacte du rappel, pas tout le message multi-intent.",
    "   - payload_hint.when_hint doit contenir le moment ou delai exploitable.",
    "   - payload_hint.UTC_time doit contenir l'instant ISO UTC calcule depuis le moment/delai, now et la timezone utilisateur. Timezone par defaut: Europe/Paris.",
    "   - Pour une formulation relative comme 'dans 30 minutes', 'dans 2 heures' ou 'dans 2 jours et demi', UTC_time doit etre strictement futur par rapport a direct_effect_time_context.now_utc et coherent avec le delai.",
    "   - HEURE NUE AMBIGUE (eva-global19 T3, INVALIDE observe): une heure de 1 a 11 SANS marqueur matin/soir ('a huit heures', 'a 8h', 'vers huit heures') est ambigue entre 08:00 et 20:00 — surtout quand le contenu du rappel pointe le soir ('range le telephone' pour une habitude du soir, resolue a 08:00 puis corrigee par le user). Dans ce cas: emets l'effet avec raw_text/when_hint/instruction_hint mais laisse UTC_time et local_label VIDES — le runtime posera la question du creneau (matin ou soir ?) au lieu de committer la mauvaise branche. Le contexte peut lever l'ambiguite ('a 8h du matin', 'a 8h avant de partir au boulot', 'demain matin a 8h', une heure de 12 a 23, 'a 20h'): la, calcule UTC_time normalement.",
    "   - ANAPHORE DE STYLE ≠ REFERENCE TEMPORELLE (P8-D, nina-hard23 T2 INVALIDE observe): 'pareil qu'avant', 'comme d'hab', 'le meme style', 'comme le precedent' accole a une demande de rappel est un marqueur de FORMAT/TON, jamais une reference a l'heure d'un rappel anterieur. Si le message porte une heure absolue explicite ('mets-moi un rappel a 21h, pareil qu'avant, pour preparer mes diners'), calcule UTC_time normalement depuis CETTE heure — ne laisse JAMAIS UTC_time vide a cause de l'anaphore, et ne demande jamais 'le moment exact du rappel precedent' (l'heure est deja la). Anti-faux-positif: 'rappel comme le precedent' SANS heure explicite → clarify legitime du creneau.",
    "   - payload_hint.local_label doit contenir le libelle temporel user-facing a afficher, par exemple demain a 09:00 ou dans 2 jours et demi.",
    "   - payload_hint.instruction_hint doit contenir uniquement ce qu'il faut rappeler, sans absorber les autres demandes du message.",
    "   - Ces champs sont atomiques: si raw_text, when_hint, UTC_time, local_label ou instruction_hint manque, ne pas emettre create_one_shot_reminder. Seule exception: l'HEURE NUE AMBIGUE ci-dessus (UTC_time/local_label volontairement vides pour que le runtime clarifie le creneau).",
    "   - BROUILLON / VALIDATION PREALABLE (paul-hard21 T3, INVALIDE observe): une demande de preview ('montre-moi d'abord le libelle avant de le creer', 'juste un brouillon', 'je valide avant') EMET QUAND MEME direct_effects.create_one_shot_reminder avec tous les slots connus (instruction_hint en tete, meme si l'heure manque) — le runtime garantit le ZERO-WRITE (brouillon rendu ou clarify du creneau, jamais de ligne creee sans confirmation). Ne retiens JAMAIS l'emission a cause de 'montre-moi d'abord': sans effet emis, la lane ne tourne pas, les slots deja fournis ne sont pas persistes et le user doit re-dicter le libelle au tour suivant.",
    "   - CO-DEMANDE DE N RAPPELS (rose-p7verify T13/T14, INVALIDE observe): quand le message demande PLUSIEURS rappels ponctuels distincts ('pose-moi deux rappels d'un coup: jeudi 18h pour X et samedi 10h pour Y', 'un rappel demain matin et un autre dimanche soir'), emets UNE entree direct_effects.create_one_shot_reminder PAR rappel (borne: 3), chacune avec son payload atomique complet (raw_text = SA clause, when_hint/UTC_time/local_label/instruction_hint = SES valeurs). N'emets JAMAIS un seul effet qui agrege les deux creneaux: le runtime ne poserait que le premier et l'accuse des deux serait un mensonge. Si un des N rappels a une heure ambigue/manquante, emets QUAND MEME son entree (UTC_time vide, regle heure nue) — le runtime committe les complets et clarifie le manquant. La reponse a un clarify qui fournit les creneaux de N rappels ('jeudi 18h et samedi 10h') re-emet les N entrees. Anti-faux-positif: UN rappel dont l'enonce mentionne deux moments pour le MEME objet en alternative ('jeudi ou samedi') reste UNE entree (clarify du choix); une repetition recurrente ('tous les jeudis et samedis') reste zero entree (initiatives).",
    "   - CO-DEMANDE TRACK + RAPPEL (eva-hard24 T10, INVALIDE observe): 'note que j'ai fait le puzzle ET rappelle-moi demain 19h de preparer mes affaires' emet DEUX entrees direct_effects — track_progress_plan_item pour la coche ET create_one_shot_reminder pour le rappel (payload complet). N'emets JAMAIS le track seul: le rappel perdu n'atteint pas le runtime et la reponse invente un refus de capacite ('je ne peux pas le creer ici') alors que la capacite existe. Ordre inverse (rappel puis track) = meme regle.",
    "   - Si le meme message contient un besoin coaching, weekly ou safety et une demande explicite de rappel ponctuel, garder les deux: le skill_signal ou flow local pour le besoin restant et direct_effects.create_one_shot_reminder pour le rappel.",
    "   - Si create_one_shot_reminder est emis avec un skill_signal conversationnel, la lane globale gere le direct effect; le skill local traite seulement le besoin utilisateur restant.",
    "   - Ne jamais laisser le rappel absorber l'intention restante du tour.",
    "   - Ne pas traiter un rappel recurrent comme un one-shot reminder. Toute demande de relance recurrente, sous quelque forme (tous les soirs, chaque matin, a chaque fois, regulierement, tous les jours), n'emet JAMAIS create_one_shot_reminder: le soutien recurrent n'a plus de lane produit, la reponse normale accueille honnetement. Exemple INVALIDE observe: 'mets-moi un rappel chaque soir a 22h30' → direct_effects=[], jamais un create_one_shot_reminder meme avec une heure precise: une heure fixe repetee reste une recurrence. Autre exemple INVALIDE observe: 'j'aimerais un rappel tous les matins a 7h' → direct_effects=[], meme regle. DISTINCTION JOURS NOMMES (nina-p10reval R1-B01, INVALIDE observe): 'rappelle-moi le linge jeudi et vendredi a 18h' n'est PAS une recurrence — des jours calendaires NOMMES et DENOMBRABLES sans marqueur d'habitude ('tous les', 'chaque') = un FAN-OUT de N rappels ponctuels: emets UN create_one_shot_reminder PAR jour nomme (chacun avec SON when_hint — 'jeudi a 18h' / 'vendredi a 18h' —, SON UTC_time resolu sur SON jour, cardinality='once', la meme instruction_hint). La recurrence exige le marqueur d'habitude: 'TOUS les jeudis et vendredis a 18h' reste recurring/initiatives. Classer ces jours bornes en recurring a laisse l'utilisatrice sans AUCUN rappel pour une course d'une semaine.",
    "   - Une question de VERIFICATION, de STATUT ou de RECAP sur les rappels n'est JAMAIS une creation: emets create_one_shot_reminder avec payload_hint.intent='status' (explicitness=explicit, target_status=identified, confidence_band=high — AUCUN champ temporel requis). Le runtime LIT alors les rappels en attente et la reponse confirme depuis la verite DB. Exemples OBLIGATOIREMENT intent='status' (observes emis a tort en create nu): 'mon rappel de demain a 7h30, il est bien enregistre ?' ; 'tu me relances a quelle heure demain deja ?' ; 'j'ai quoi comme rappels poses la ?' ; 'le rappel pour la lessive, c'est bien pour 18h05 ?' ; 'c'est bien prevu ?' ; 'il est encore actif ?' ; 'c'etait cale, non ?'. Une REFERENCE TEMPORELLE a un rappel deja confirme ('quand ton rappel de 19h15 va tomber', 'au moment ou ton rappel arrivera') est AUSSI une lecture (intent='status'), JAMAIS un create: le user parle du rappel existant, il n'en demande pas un nouveau (rose-multiflow T13: create emis a tort avec 'demain 19h15' resolu a la date du jour → bloque past_time + rendu desinformant). JAMAIS un create nu sur ces questions, meme si le message re-mentionne l'heure ou l'objet: un create nu ici FABRIQUE un doublon (rose-harness T4: 'a quelle heure demain deja ?' → create fantome a minuit). Une question de statut se LIT, elle ne se re-cree pas. La regle vaut AUSSI pour les questions d'INVENTAIRE et les follow-ups apres une annulation/creation: 'du coup j'ai quoi comme rappels poses la ?' juste apres un cancel = intent='status' OBLIGATOIRE (exemple INVALIDE observe, harness S3: AUCUN effet emis → le composeur a repondu depuis les seuls recurrents et a nie le rappel ponctuel en attente). Idem pour la verification d'une ANNULATION: 'et le rappel de ce soir 22h, il est bien annule du coup ?' = intent='status' OBLIGATOIRE (exemple INVALIDE observe, harness S3 T5: AUCUN effet emis → le composeur a repondu 'encore actif' sur un rappel ANNULE en le confondant avec un autre rappel pendant a une heure proche). ANAPHORE: quand 'celui de Xh' / 'celui des ecrans' suit des tours qui parlaient de RAPPELS (creation, annulation, liste), le referent est LE RAPPEL — PAS une action ou habitude du plan au nom proche ('Et celui des ecrans de 22h, il est encore actif ?' apres un cancel de rappel 22h = intent='status' sur le rappel; repondre depuis l'habitude 'Couper les ecrans' du plan est l'erreur observee). Sans la lane status, la reponse invente. La regle tient MEME quand la question porte tous les slots d'un create (heure + objet + 'demain'): 'mon rappel de demain matin 8h pour preparer le sac, il est toujours bon hein ?' = intent='status' OBLIGATOIRE (paul-untested T10: create explicit/high emis a tort sur cette question alors que le frame disait lui-meme response_intent=status_check → un rappel ANNULE par le user a ete RECREE en silence et presente comme une continuite; le runtime droppe desormais tout create nu d'un tour status_check, mais l'emission correcte reste intent='status'). Si la projection montre que le rappel reference est ANNULE: la reponse enonce l'etat reel ('tu l'as annule a Xh') et PROPOSE la re-creation — elle ne recree jamais d'office. RECIT D'HISTORIQUE (alex-untested24 R1-B09): quand le user constate un horaire ou un etat inattendu ('pourquoi 10:46 ?'), le recit vient du LEDGER/DB ('il a ete cree a Xh puis deplace/annule') — ne requalifie JAMAIS un commit passe en 'erreur d'affichage' ou 'je me suis trompe en te le montrant': reecrire l'historique d'un effet reellement execute est un mensonge de statut.",
    "   - L'effet se rapporte au MESSAGE COURANT uniquement: n'emets JAMAIS un create_one_shot_reminder dont la demande (raw_text, moment) provient d'un message PRECEDENT de recent_messages — cette demande a deja ete traitee a son propre tour (committee ou bloquee), la re-emettre fabrique un doublon. Si le message courant ne formule pas lui-meme une nouvelle demande de rappel, direct_effects ne contient aucun create, quel que soit l'historique. MENTION INCIDENTE D'UN RAPPEL EXISTANT (eva-hard25 R1-B07, INVALIDE observe): 'on se recroise ce soir quand je sors les poubelles a 21h !' — un au revoir qui MENTIONNE un rappel deja pose n'est PAS une nouvelle demande: direct_effects=[] (sans le filet duplicate_pending, un rappel non demande aurait ete cree). L'acte de rappel doit etre au present du message courant ('rajoute', 'mets-moi'), jamais infere d'une mention.",
    "   - DECALAGE/MODIFICATION d'un rappel deja cree ('mets-le a 21h30 au lieu de 22h', 'decale mon rappel', 'plutot 21h30' en reference a un rappel deja confirme): emets create_one_shot_reminder avec payload_hint.intent='reschedule' (explicit/identified/high, when_hint = la nouvelle heure demandee) — le runtime BLOQUERA honnetement et proposera le chemin 'annule et recree'; n'emets JAMAIS un create nu sur un decalage. REGLE DU PRONOM (eva-g16 B01, observe emis a tort en create nu): 'mets-LE plutot a 23h', 'decale-LE', 'passe-LE a 23h' — le pronom refere au rappel deja confirme dans CE fil → intent='reschedule' OBLIGATOIRE. Un create nu ici cree un DEUXIEME rappel (l'ancien reste en attente) et la confirmation 'c'est decale' devient un mensonge. Anti-faux-positif: si la creation est encore en cours de clarification (aucun rappel committe ce fil), une nouvelle heure est une mise a jour de la demande en cours → create normal avec la nouvelle heure. ZERO-EMISSION INTERDITE (eva-hard25 R1-B03, INVALIDE observe): 'avance le a 20h15' (clitique nu, rappel cree au tour PRECEDENT) → AUCUN effet emis, et le composeur a affirme 'C'est avance a 20h15' sur un ledger vide — attendu intent='reschedule' explicit/high avec when_hint='a 20h15' (la garde de rendu retire desormais le claim, mais l'emission correcte est le contrat: un deplacement demande sans effet emis laisse l'utilisateur avec un rappel au mauvais moment).",
    "   - REMPLACEMENT EXPLICITE ('annule-le et remets-le a 23h', 'annule ce rappel et mets-m'en un nouveau a 23h', 'supprime-le et recree-le a 18h'): emets create_one_shot_reminder avec payload_hint.intent='replace' + le payload COMPLET du NOUVEAU rappel (when_hint/UTC_time/local_label/instruction_hint = les valeurs du nouveau) + payload_hint.replace_target_label = l'heure locale de l'ANCIEN rappel si le user la nomme (ex '22h30'), sinon omets-le. Le runtime annule l'ancien PUIS cree le nouveau, atomiquement — jamais deux pending. Distinction: 'mets-le plutot a X' (implicite) = reschedule (bloque); 'annule et recree a X' (explicite) = replace (execute). MEME TEXTE (nina-global18 T12): quand le user dit 'meme texte', 'le meme', 'garde le texte' dans un replace, laisse instruction_hint VIDE — le runtime herite l'instruction EXACTE du rappel remplace; n'y mets JAMAIS l'expression de reference ('le rappel de l'eau'): elle deviendrait le texte du nouveau rappel (payload durable faux observe). Exemple INVALIDE observe (eva-global17 T13): 'annule le rappel de 18h45 et remets-le a 19h15' → AUCUN effet emis, alors que Sophia venait ELLE-MEME de proposer cette formulation — attendu intent='replace' + replace_target_label='18h45' + payload du nouveau a 19h15. Quand le user suit la consigne donnee au tour precedent, ne rien emettre = le faire tourner en rond.",
    "   - Regle nocturne (user_local_datetime entre 00:00 et 06:00): 'ce soir' designe le soir du jour civil COURANT, jamais la veille; 'demain' designe strictement le jour civil suivant (J+1), jamais la date du jour. Si le jour vise reste ambigu (ex: 'demain a 21h' dit a 2h du matin), n'emets pas l'effet: la clarification prime.",
    "   - payload_hint.cardinality est obligatoire et vaut 'once' pour un rappel ponctuel. Une demande recurrente n'emet jamais cet effet (cf. regle initiatives); si tu l'emets malgre tout, mets cardinality='recurring' — le runtime le bloquera au lieu de creer un faux ponctuel. Exemple INVALIDE observe (paul-r8 B03): 'que toi tu m'envoies un message vers 18h30 tous les jours de semaine' — horaire PRECIS + cadence recurrente = direct_effects=[] et opportunite initiatives, jamais un create_one_shot_reminder.",
    "   - DEMANDE HYBRIDE (eva-r7 B02): quand le message mele une capacite inexistante (ping spontane 'pile au bon moment', detection en temps reel) et un rappel possible a heure fixe, la reponse decline honnetement la premiere ET propose le rappel avec une QUESTION DE CRENEAU ('je peux te poser un rappel a heure fixe — vers quelle heure ?') — jamais une bascule seche vers un autre dispositif sans offrir le rappel. Heure explicite deja fournie → create direct sans re-question.",
    "   - ANNULATION: si le user demande d'annuler, supprimer, retirer ou laisser tomber un rappel ponctuel existant ('annule-le', 'supprime le rappel de 19h', 'finalement pas de rappel'), emets create_one_shot_reminder avec payload_hint.intent='cancel' et, si le user precise le rappel vise, payload_hint.when_hint avec son heure. N'emets JAMAIS une creation (intent absent ou 'create') sur une demande d'annulation: le runtime execute l'annulation du pending vise, ou clarifie si plusieurs rappels sont en attente. Un cancel PUR ne remplit JAMAIS UTC_time, local_label ni instruction_hint (seul when_hint sert au ciblage): si tu remplis ces champs avec les valeurs d'un NOUVEAU rappel, le runtime traite la demande comme un REPLACE (annule puis recree) — reserve donc ces champs aux vrais remplacements. Exemple INVALIDE observe: 'annule-le' emis comme create sans intent — la polarite du message est l'ANNULATION, l'effet DOIT porter intent='cancel'. Autre INVALIDE observe (harness S3): 'Finalement annule celui de ce soir 22h, je gere sans. Garde celui de demain.' → AUCUN effet emis; attendu intent='cancel' avec when_hint='ce soir 22h' — la clause 'garde celui de demain' ne neutralise PAS l'annulation demandee (le ciblage par heure protege l'autre rappel), et une annulation explicite sans effet emis = un rappel indesire qui partira quand meme. MULTI-INTENTION (rose-lifecycle T14, INVALIDE observe): 'annule le rappel de 12h30 pour ma soeur et dis-moi ce qui reste de prevu' → direct_effects=[] emis a tort, puis le composeur a AFFIRME l'annulation jamais executee et le rappel indesire est parti le lendemain. Attendu: la question de statut n'absorbe JAMAIS le cancel — emets intent='cancel' avec when_hint='12h30' (le runtime execute l'annulation puis la reponse liste ce qui reste depuis la DB). Un cancel explicite sans effet emis + une reponse qui dit 'annule' = le pire des mensonges produit.",
  ];
}

export function oneShotReminderCanonicalLocalDispatcherPromptLines(): string[] {
  return [
    "Bloc canonique create_one_shot_reminder:",
    "- Si le user demande explicitement un rappel ponctuel, une notification ou une programmation avec un moment ou delai exploitable, le dispatcher local doit pouvoir exposer create_one_shot_reminder pendant le flow local.",
    "- Une duree/heure seule ne suffit pas: elle doit concerner un rappel voulu, pas le rythme de la conversation. Un fragment temporel incident dans une question/recherche ('que je puisse tester ce soir') n'est pas une demande de rappel.",
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
    "- Ne traite jamais un rappel recurrent comme create_one_shot_reminder: une demande de relance recurrente (tous les soirs, chaque matin, a chaque fois) n'a plus de lane produit; n'emets aucun direct_effect_request pour ca.",
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
  // P8-B (probe P8-3 passe 3): hors-fenêtre, le retour vide laissait le
  // composeur SANS règle — « un rappel a bien été créé et exécuté dans cette
  // session » confabulé avec 0 ligne DB sur un tour de verify. La ligne de
  // default-deny minimale est toujours servie: elle n'ajoute du bruit qu'une
  // phrase et ferme le seul cas non couvert.
  if (opts && opts.present === false && !committedKnown) {
    return [
      "Aucun rappel n'est present dans le contexte de ce tour: ne dis JAMAIS qu'un rappel est programme, cree, enregistre, execute ou actif — ni qu'il l'a ete plus tot dans la session — sans preuve committed ou projection DB fournie; une question de verification sur un rappel se repond depuis la verite DB, jamais depuis la conversation.",
    ];
  }

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
    `Si ${contextPath}.track_progress.committed=true: la progression sur track_progress.target_title est REELLEMENT enregistree (statut track_progress.progress_status) — c'est une preuve de commit au meme titre qu'un rappel. Confirme-la sobrement; ne dis jamais que tu ne peux pas cocher, marquer, tracker ou 'confirmer que c'est coche' depuis le chat, et ne propose jamais de 'le formuler pour le suivi' comme si rien n'etait enregistre.`,
    "Si le user demande si un rappel recent a ete programme ou ce qui vient d'etre programme, tu peux confirmer seulement depuis deux sources: le contexte direct ci-dessus avec has_committed_one_shot_reminder=true, ou visible_runtime_context.recent_effects_summary si ce champ est fourni et contient une ligne 'Rappel ponctuel cree: execute et persiste' avec etat DB actuel.",
    unprovenReminderLine,
    "Un rappel committe se confirme comme un RAPPEL, jamais comme un autre artefact (P8-B, eva-hard23 T7): ne le presente JAMAIS comme une potion/carte « gardee », « sauvegardee » ou « a retrouver » — une potion ne se cree ni ne se garde depuis le chat (activation dans l'app), et re-etiqueter un rappel en potion fabrique un faux objet durable que le user cherchera en vain.",
    "Ne calcule jamais une heure visible depuis UTC_time ou scheduled_for; utilise uniquement local_label.",
    "Ne recree, reroute, redemande ou redecide jamais un rappel depuis le visible agent.",
    "ANNULATION d'un rappel ponctuel: possible depuis le chat UNIQUEMENT quand effects_outcome contient un outcome committed de type cancel_one_shot_reminder — dans ce cas confirme l'annulation une fois (avec local_label si connu). Sans ce commit prouve, ne dis JAMAIS qu'un rappel est annule; si l'outcome est needs_clarify (plusieurs rappels en attente), demande lequel annuler; si l'outcome est blocked (aucun pending correspondant), dis qu'il n'y a rien a annuler. Une modification/decalage/reprogrammation reste hors chat: gestion dans la plateforme.",
    "Meme si le message contient d'autres demandes, accuse d'abord la demande d'annulation en une phrase (selon son outcome reel) avant de repondre au reste: ne l'ignore jamais en silence.",
    "Ne nie jamais l'existence d'un rappel deja confirme ou deja prouve par les sources ci-dessus: si le rappel est connu, rappelle-le sobrement avec local_label.",
  ];
}
