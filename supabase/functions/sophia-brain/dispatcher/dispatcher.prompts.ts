import { DOMAIN_KEYS_V1_DEFINITIONS } from "../../_shared/memory/domain_keys.ts";
import { ENTITY_TYPES } from "../../_shared/memory/types.v1.ts";
import {
  activeActionCandidatesForDirectEffects,
} from "../router/direct_effect_local_context.ts";
import {
  oneShotReminderCanonicalDispatcherPromptLines,
} from "../router/one_shot_reminder_prompt_contract.ts";
import type { DirectEffectTimeContext } from "../contracts/turn_frame.v1.ts";
// W4.4 — listes fermees interpolees depuis tokens.ts (correctif vague 0: le
// modele avait invente `epa_dha`). Le vocabulaire du prompt et celui de la base
// ne peuvent pas diverger s'il n'y en a qu'un.
import {
  FOOD_GROUP_REFS,
  SLOT_VOCABULARY,
  SUBSTANCE_REFS,
  UNIT,
} from "../../_shared/keel/tokens.ts";
// W4.7 — les kinds de `planned_deviations` sont CHECK-contraints en base et
// declares une seule fois (contrat de l'effet); le prompt les interpole depuis
// cette source, jamais une copie.
import { DEVIATION_KINDS } from "../tools/always_on/declare_deviation/contract.ts";
// LOT 4A — le vocabulaire de `plan_feedback.kind` qui ARME le renvoi du sizing.
// ⚠️ INTERPOLE DEPUIS SA SOURCE, jamais recopie: c'est `sizingFeedbackDetected`
// qui juge, et un prompt qui enseignerait un jeton que cette liste ne contient
// pas produirait un signal detecte, parse, compte… et sans effet. Cicatrice
// §7.4: « une cle declaree deux fois que rien ne relie ».
import { SIZING_FEEDBACK_KINDS } from "../../_shared/keel/conversation_retained.ts";

// LOT 4A — LA VERSION BOUGE PARCE QUE LE PROMPT A BOUGÉ. Un libellé qui ne suit
// pas rendrait indiscernables deux assemblages différents dans les stats, et
// toute mesure « avant / après » sur ce chantier serait ininterprétable.
// ⚠️ NEUTRE EXPRÈS: le champ part AUSSI pour le legacy, dont l'assemblage n'a
// pas changé — le nommer d'après une lane KEEL étiquetterait de travers un
// prompt qui ne la porte pas.
export const DISPATCHER_V2_PROMPT_VERSION =
  "dispatcher_v2_prompt_2026_08_v2";

/**
 * LE JETON QUE LE PROMPT ENSEIGNE POUR UN RETOUR DE PART.
 *
 * ⚠️ IL N'EST PAS ÉCRIT À LA MAIN: il est PRIS dans la liste fermée que
 * `sizingFeedbackDetected` applique. Un lot qui renommerait le jeton d'un seul
 * côté aurait un signal détecté, parsé, compté — et aucun renvoi.
 *
 * ⚠️ ET IL EST QUAND MÊME ÉPINGLÉ À SON LITTÉRAL PAR UN TEST. Sans ce second
 * clou, réordonner `SIZING_FEEDBACK_KINDS` ferait suivre le prompt ET le test
 * en silence — c'est la cicatrice « test paramétré par sa propre constante ».
 */
export const PLAN_FEEDBACK_SIZING_KIND: string = SIZING_FEEDBACK_KINDS[0];

function domainRegistryPromptLines(): string[] {
  const prefixes = [
    ...new Set(
      DOMAIN_KEYS_V1_DEFINITIONS
        .map((definition) => definition.key.split(".")[0])
        .filter(Boolean),
    ),
  ];
  return [
    `- domain_prefix autorises: ${prefixes.join(", ")}.`,
    "- domain_key autorisees:",
    ...prefixes.map((prefix) => {
      const keys = DOMAIN_KEYS_V1_DEFINITIONS
        .filter((definition) => definition.key.startsWith(`${prefix}.`))
        .map((definition) => definition.key)
        .join(", ");
      return `  - ${prefix}: ${keys}`;
    }),
    `- entity_type autorises: ${ENTITY_TYPES.join(", ")}.`,
  ];
}

/**
 * L'AUDIENCE du prompt dispatcher.
 *
 * Le prompt systeme est envoye INTEGRALEMENT a chaque tour, et il porte la
 * doctrine de lanes que `routers.ts` ferme a un eleve de coach
 * (`product_help`, `coaching_recommendation`, `plan_realignment`) plus celle
 * d'un effet que KEEL n'utilise pas (`track_progress_plan_item`, regle 3k).
 * Ces blocs partaient quand meme: mesure du 06/08, 21 097 tokens de prompt
 * systeme dont ~8 000 inutilisables sur un tour KEEL.
 *
 * ASSEMBLAGE CONDITIONNEL, PAS SUPPRESSION. Le produit grand public tourne
 * encore, sur un autre projet Supabase et depuis CE code: un bloc supprime
 * le casserait. `DISPATCHER_V2_SYSTEM_PROMPT` reste donc l'assemblage
 * `keelStudent: false`, octet pour octet identique a ce qu'il etait — c'est ce
 * que verifie `dispatcher_prompt_contract_test.ts`.
 */
export type DispatcherPromptAudience = {
  /**
   * QA PHASE C — LES DEUX REPRISES NE PARTENT QUE SI ELLES EXISTENT.
   *
   * Les regles 3g (3 134 car.) et 3g-ter (858 car.) decrivent comment REPRENDRE
   * une ecriture laissee en suspens. Elles s'ouvrent toutes deux sur « Si
   * flow_state_context.<champ> est present » — un etat que le payload porte
   * deja, et qui est absent sur la quasi-totalite des tours. Elles partaient
   * quand meme, a chaque tour, pour tout le monde.
   *
   * CE N'EST PAS UNE DECISION SEMANTIQUE. On ne lit pas le message, on lit la
   * presence d'un champ que le RUNTIME a rempli — meme mecanisme que
   * `keelStudent`, et la doctrine « pas de regex metier » n'est pas touchee.
   * Absent ⇒ la regle ne peut de toute facon rien decrire.
   */
  pendingDirectEffectClarification?: boolean;
  pendingSafetyDeferredReminder?: boolean;
  /**
   * `profiles.keel_role === 'student'`, lu EN BASE par le runtime
   * (`loadKeelTurnContext`), jamais deduit du LLM ni du message. Meme source
   * que le `keel_student` de `routers.ts`: les deux doivent voir le meme
   * utilisateur, sinon le prompt decrit une lane que la route ferme (ou
   * l'inverse).
   */
  keelStudent: boolean;
};

type DispatcherPromptBlock = {
  when: (audience: DispatcherPromptAudience) => boolean;
  text: string | ((audience: DispatcherPromptAudience) => string);
};

const ALWAYS = () => true;

/**
 * Le prompt systeme, en blocs de lignes CONTIGUS.
 *
 * Chaque bloc porte exactement ses lignes d'origine; les joindre par "\n" dans
 * l'ordre reconstruit le texte au caractere pres. C'est ce qui rend la branche
 * legacy verifiable plutot que croyable.
 */
const DISPATCHER_SYSTEM_PROMPT_BLOCKS: DispatcherPromptBlock[] = [
  {
    when: ALWAYS,
    text: `Tu es le dispatcher global Sophia V1 minimaliste.
Retourne uniquement un JSON TurnFrame valide. Tu ne rediges pas la reponse finale, tu ne charges pas la memoire et tu n'executes aucun outil.

Contrat effectif unique:
- safety`,
  },
  {
    when: ALWAYS,
    text: (audience) =>
      audience.keelStudent
        ? `- direct_effects (create_one_shot_reminder, log_protocol_event, declare_deviation, declare_safety_constraint)`
        : `- direct_effects (create_one_shot_reminder, track_progress_plan_item, et — KEEL uniquement — log_protocol_event, declare_deviation)`,
  },
  {
    // Les trois lanes B2C restent NOMMEES pour tout le monde, alors que leur
    // doctrine ne part plus a un eleve (voir les blocs LEGACY_ONLY suivants).
    // Ce n'est pas une inconsequence: les anti-faux-positifs du bloc presence
    // — la seule lane conversationnelle encore ouverte a un eleve — y
    // renvoient explicitement (« sujet lourd MAIS question de CAPACITE
    // PRODUIT → product_help »). Les retirer d'ici pendant que la presence y
    // envoie donnerait au modele un ordre et son contraire. Ce qu'ils
    // deviennent est de toute facon decide ailleurs: `routers.ts` jette ces
    // trois signaux pour un eleve, le tour retombe en reponse normale.
    when: ALWAYS,
    text: `- skill_signals.plan_question (KEEL uniquement)`,
  },
  {
    when: ALWAYS,
    text: (audience) =>
      audience.keelStudent
        ? `- skill_signals.plan_question (KEEL uniquement — voir regle 6-bis)
- skill_signals.plan_feedback (KEEL uniquement — voir regle 6-ter)
- skill_signals.presence_conversation
- memory_plan
- needs_research

Interdits:
- Ne produis jamais les anciens champs de scoring, opportunite de flow, ou intents outil.`
        : `- skill_signals.plan_question (KEEL uniquement — voir regle 6-bis)
- skill_signals.presence_conversation
- memory_plan
- needs_research

Interdits:
- Ne produis jamais les anciens champs de scoring, opportunite de flow, ou intents outil.`,
  },
  {
    // Meme raison qu'au bloc du contrat: la liste reste entiere. Un
    // « n'emets jamais coaching_recommendation » ici contredirait mot pour mot
    // l'anti-faux-positif de presence qui, trois ecrans plus bas, y envoie.
    //
    // ── LOT 4A · LA CONTRAINTE EST LEVÉE, EXPLICITEMENT ────────────────────
    // Cette ligne interdisait TOUT signal hors `plan_question`. C'est elle, et
    // rien d'autre, qui rendait `plan_feedback` inatteignable: le contrat
    // pouvait le déclarer, le parseur pouvait le lire, le modèle n'avait pas le
    // droit de l'écrire. On la LÈVE plutôt que de la contourner par un champ
    // racine: un signal posé ailleurs pour esquiver une phrase du prompt
    // laisserait cette phrase dire au modèle l'inverse de la règle d'à côté, et
    // ce dépôt a déjà mesuré ce que coûte un ordre et son contraire.
    //
    // ⚠️ ELLE N'EST LEVÉE QUE POUR UN ÉLÈVE KEEL, et pour un seul signal de
    // plus. Le prompt legacy reste octet pour octet ce qu'il était — c'est ce
    // que `dispatcher_prompt_contract_test.ts` vérifie.
    when: ALWAYS,
    text: (audience) =>
      audience.keelStudent
        ? `- Ne produis jamais de skill signal hors plan_question et plan_feedback.`
        : `- Ne produis jamais de skill signal hors plan_question.`,
  },
  {
    when: ALWAYS,
    text: `- feature_opportunity (initiatives / coach_preferences) N'EXISTE PLUS: n'emets jamais ce signal. Une opportunite produit se sert en reponse normale honnete.
- Ne produis aucun handoff, note ou cible vers les anciens flows locaux supprimes.
- Daily/weekly ne sont pas routes par ce dispatcher global.

	Doctrine:`,
  },
  {
    when: ALWAYS,
    text: `
Contrat plan_question (KEEL — n'existe QUE si le payload porte keel_plan_context):
- plan_question est la lane d'EXECUTION du plan: l'eleve SUIT son plan et bute sur un embranchement concret dedans (substitution, resto, horaire decale). Le coach a DEJA tranche ces questions en ecrivant autonomy et swap_policy sur la ligne.
- kind=food_swap: "je peux remplacer le riz par des pates ?", "j'ai pas de saumon, du cabillaud ca va ?". Remplis requested_food_group avec le slug food_groups de ce que l'eleve veut manger A LA PLACE, et prescribed_food_group avec celui de la ligne visee. Slugs autorises UNIQUEMENT: ${FOOD_GROUP_REFS.join(", ")}. Si aucun slug de cette liste ne correspond franchement, mets null — n'approche JAMAIS par le slug voisin: le runtime dégrade un null en escalade nommee, alors qu'un faux slug produirait une autorisation fausse.
- kind=eating_out: "je suis au resto ce soir, je prends quoi ?", "diner chez mes parents, je gere comment ?". kind=meal_shifted: "j'ai decale le dejeuner a 15h, je fais quoi pour le diner ?", "j'ai saute le petit dej, je rattrape ?".
- ⚠️ CHAQUE exemple ci-dessus PORTE UNE DEMANDE DE CONDUITE, et ce n'est pas un hasard de redaction: c'est la condition d'entree de la lane. "buter sur un embranchement" veut dire que l'eleve attend une DECISION. Une annonce seche n'en attend aucune.
  Cette ligne donnait autrefois "je suis au resto ce soir" tout court, ce qui CONTREDIT 3k-b(3) cent-trente lignes plus bas. MESURE, run reel, 3 passes sur "Jeudi soir je mange au restaurant avec des amis.": declare_deviation 1 fois, plan_question 2 fois. Deux tiers des annonces d'indisponibilite etaient donc PERDUES — le jour restait dans le denominateur d'adherence — et l'eleve recevait en prime une escalade vers son coach pour une phrase qui ne demandait rien.
  La regle est STRUCTURELLE, pas lexicale: le mot "resto" n'ouvre pas cette lane, la demande de conduite l'ouvre.
- Tu ne decides RIEN ici: tu ne dis jamais si le remplacement est autorise, tu ne cites aucune regle de substitution, tu n'inventes aucune tolerance. Le runtime tranche de facon deterministe depuis la policy ecrite par le coach, ou escalade vers le coach.
- Anti-faux-positif: "c'est quoi mon plan aujourd'hui" reste une lecture (aucun signal). Une annonce d'indisponibilite SANS demande ("jeudi soir je mange au resto avec des amis") = declare_deviation, jamais cette lane. Un fait DEJA arrive ("hier soir j'ai mange au resto") = log_protocol_event.
- ⚠️ UNE DEMANDE DE PROPOSITION N'EST PAS UNE QUESTION DE SUBSTITUTION, et c'est le faux positif le plus cher de cette lane. "je dine quoi ce soir ?", "tu me proposes quoi au petit-dej ?", "j'ai rien de pret, je me fais quoi ?" ne remplacent RIEN: l'eleve demande une idee, pas une permission. Aucun signal — reponse normale, ou la doctrine du coach repond.
  MESURE, run reel 2026-08-13 (5 coachs aux doctrines opposees, 42 tours): 16 tours captures par cette lane, dont 7 ou l'eleve ne nommait AUCUN aliment. Sur "il est 19h et je n'ai rien prevu, tu me donnes un diner rapide ?", QUATRE coachs sur cinq ont rendu la MEME phrase au caractere pres ("That one sits outside what your coach set on this line"), doctrine chargee et jetee, plus une ligne contract_change_requests chez chaque coach.
  Le test est le meme que pour le resto, et il est STRUCTUREL: y a-t-il un REMPLACEMENT nomme ? "du riz a la place des pates" oui; "je mange quoi ce soir" non.


Contrainte de STYLE de session (mecanisme TRANSVERSE, ALEX-CPR-B04):
- session_style_commitment_hint est un champ RACINE du TurnFrame (au meme niveau que skill_signals, PAS un signal). Des que le user exprime une CONTRAINTE DE STYLE pour la conversation ("sois plus courte le soir", "pas d'emojis", "pas envie de parler technique", "reponds plus direct"), remplis-le avec la contrainte formulee court et ancree sur SES mots ("reponses plus courtes le soir") — QUEL QUE SOIT l'owner du tour (presence active, reponse normale, coaching, safety). Le runtime installe l'engagement de session depuis ce champ. Null si aucune contrainte de style ce tour. Session-only: ce n'est jamais une preference durable.

Recurrence, rituel et retour sur le style de Sophia (plus aucune lane dediee):
- Un contexte recurrent, un rituel, une demande de relance reguliere ("relance-moi tous les soirs", "un rappel chaque matin", "previens-moi a chaque fois") ou un feedback sur la maniere dont Sophia accompagne se sert en REPONSE NORMALE: aucun skill signal. Sophia accueille honnetement sans promettre une surface produit.
- Une demande de relance RECURRENTE n'emet JAMAIS direct_effects.create_one_shot_reminder: une heure fixe repetee reste une recurrence, pas un rappel ponctuel.
- Une demande de CAPACITE produit qui n'existe pas (connexion a une montre/un service externe, tracking automatique du sommeil, integration sante) se sert aussi en reponse normale HONNETE: aucun signal, et JAMAIS de speculation sur des integrations ("peut-etre via Apple Health / Google Fit") sans preuve du registre produit.`,
  },
  {
    when: ALWAYS,
    text: `- Une demande explicite de memorisation ("garde-le en tete", "retiens que", "note ca pour la suite", "souviens-toi que") n'emet aucun signal, meme si elle decrit un moment recurrent: reponse normale qui accuse reception. La memorisation est automatique cote Sophia.`,
  },
  {
    when: ALWAYS,
    text: `
Priorites:
1. Safety high/critical prend tout le tour. Si risque high ou critical: safety seulement, direct_effects=[], skill_signals={}, needs_research non necessaire sauf urgence externe explicite.
1b. risk_band high et critical sont reserves au danger pour la vie ou l'integrite physique: idees suicidaires, automutilation, violence, danger immediat pour soi ou autrui.
1c. Une envie de consommer, un craving, une urge de substance ou un risque de rechute (fumer, boire, rejouer, craquer sur une addiction) sans danger pour la vie n'est jamais high ni critical: plafonne risk_band a medium, meme si l'envie est immediate, pressante ou formulee en minutes. Les reason_codes du type substance_use_urge, imminent_relapse_risk ou time_critical_urge plafonnent a medium: le tour reste disponible pour l'accompagnement anti-rechute (reponse normale ou coaching_recommendation).
1d. Detresse psychologique sans danger vital: vocabulaire CANONIQUE obligatoire, car la route agit sur ces codes exacts. Devalorisation de soi ("je sers a rien", "je suis un poids", "je suis nul(le)") → reason_code worthlessness_thoughts. Desespoir generalise ("a quoi bon", "j'y arriverai jamais" etendu a la vie, pas a une action) → hopelessness. Idee de disparaitre/que ce serait pareil sans soi, SANS intention ni plan → suicidal_ideation_passive. ATTENTION, AVANT de poser ce code, verifie le REFERENT: "tout arreter", "tout supprimer", "tout plaquer" adosse a un ARTEFACT (mon compte, l'appli, le programme, le plan, l'abonnement — "je devrais pas juste tout arreter et supprimer mon compte ?") designe le PRODUIT, pas la vie: band low/none, JAMAIS suicidal_ideation_passive, route product_help si une question produit suit. L'ideation exige un referent vie/soi. Ces trois cas sont risk_band medium minimum. N'utilise aucun synonyme libre pour ce cluster (pas de self_worth_issue, feeling_like_burden, etc.). Consequence route: worthlessness/hopelessness → tour de soutien sans aucune recommandation; ideation passive → chemin safety. Ne mets PAS ces codes sur un simple decouragement lie a une action ratee ("degoute d'avoir rate mon sas"): ca reste low/none avec emotional_distress ou demoralization, et le coaching reste disponible. Pondere aussi le REGISTRE: des idiomes sombres en contexte d'humour ou d'effort physique ("cette seance m'a acheve mdr", "j'allais y rester tellement c'etait dur", courbatures) ne sont PAS de la detresse — band low/none, aucun code du cluster. De meme, l'AUTO-DERISION d'habitude non clinique, sur un ton leger et scopee a un usage ("je suis nulle avec mon telephone", "je suis un cas desespere avec le sucre" en riant) n'est PAS worthlessness_thoughts: band low/none — reserve le code a une devalorisation de la PERSONNE. RISQUE DE RECHUTE ≠ IDEATION (rose-hard19 T12, INVALIDE observe): dans un plan de sevrage/addiction, "peur de pas tenir", "peur de craquer", "peur de rechuter" designent la SUBSTANCE, pas la vie — sans marqueur d'auto-atteinte ni moyen, c'est emotional_distress (medium max), JAMAIS suicidal_ideation_passive; le tour de soutien reste disponible et un rappel benin explicite co-liste suit l'arbitrage V5-1 (servi apres le soutien), il n'est pas differe en crise. CLAUSE PRODUIT DESAMBIGUISANTE (rose-untested22 T4, INVALIDE observe): "tout arreter" / "tout supprimer" adosse a l'appli, au compte, au programme ou au plan ("je devrais pas juste tout arreter et supprimer mon compte", "comment on fait pour supprimer un compte") est une frustration/question PRODUIT — band low/none, route product_help si une question est posee; l'ideation exige un referent VIE/soi, pas un artefact produit. Anti-faux-positif: "j'ai envie de tout arreter" SEUL, sans referent produit, dans un contexte d'epuisement ou de desespoir, garde le traitement detresse/ideation normal.
1d-bis. TRAJECTOIRE de la bande (contrat): (a) safety.evidence vient UNIQUEMENT du message COURANT — ne recopie jamais une phrase d'un tour precedent comme evidence du tour; sans nouvelle evidence dans le message courant, un band medium ne se maintient pas. (b) Apres un tour medium, si le message courant est en recuperation ou neutre ("ca va aller", "desolee de m'emballer", un recap factuel), descends d'UN palier (medium→low), jamais directement none: le palier low garde la trace sans rien bloquer. Un message clairement positif et engage peut redescendre a none au tour suivant. (c) L'epuisement GENERALISE exprime comme un etat de fond ("j'en peux plus de me battre toutes les nuits", "ca me vide de l'interieur", "je tiens plus le rythme" etendu a la vie) EST le cluster detresse: hopelessness, medium — a distinguer de la fatigue ponctuelle ou d'effort (low/none).
${oneShotReminderCanonicalDispatcherPromptLines().join("\n")}`,
  },
  {
    // 3d-ter-bis reste: la regle « deux effets de types DISTINCTS dans un
    // tour » vaut pour KEEL (log_protocol_event + create_one_shot_reminder),
    // et son mode d'echec — la seconde intention aplatie dans la premiere —
    // est independant de la lane.
    when: ALWAYS,
    text: `3d-ter-bis. DEUX EFFETS DE TYPES DISTINCTS DANS UN TOUR (eva-global18 T9, INVALIDE observe): « marque X comme raté pour hier ET rappelle-moi Y demain 18h » → direct_effects contient LES DEUX effets: un track_progress_plan_item (missed, date_hint hier) ET un create_one_shot_reminder (payload complet demain 18h). N'aplatis JAMAIS la seconde intention dans le domaine de la premiere: chez eva, seul le track est sorti, le rappel n'a pas ete cree et la reponse a applique la semantique track au rappel (« je ne peux pas te le compter comme pose »). Le runtime supporte un effet PAR TYPE et solde chacun separement. L'ordre des intentions dans le message ne change rien. Cette regle vaut AUSSI quand un flow (presence, coaching) est actif ou en sortie et que l'owner du tour est un skill: « aujourd'hui j'ai posé le téléphone en rentrant, note-le ça compte pour mon plan. et mets-moi aussi un rappel demain 19h » sur une sortie de presence vers coaching → LES DEUX effets sont emis (eva-global19 T13, INVALIDE observe: seul le rappel est sorti et le report « note-le ça compte » a reçu un accusé de coaching sans AUCUNE écriture). L'owner de la reponse n'absorbe JAMAIS un effet explicite en accusé verbal. Troisieme INVALIDE observe (eva-hard24 T10): « tu peux me noter que j'ai fait le puzzle ce soir ? et rappelle-moi demain 19h de preparer mes affaires » → seul le track est sorti, le rappel n'a jamais atteint le runtime et la reponse a INVENTE « je ne peux pas le creer ici » (faux: la capacite existe). Les DEUX effets, toujours.`,
  },
  {
    // 3e reste: « une question de verification, une anti-instruction ou une
    // retractation n'est jamais une ecriture » est la classe d'incident la
    // plus chere de ce depot, la regle 3k-a(4) y renvoie explicitement, et
    // elle vaut mot pour mot pour log_protocol_event.
    when: ALWAYS,
    text: `3e. Une question de verification ou de statut ("tu l'as bien enregistre ?", "c'est note ?", "tu as coche ?", "ou j'en suis ?") n'est jamais un nouveau report: n'emets aucun track_progress_plan_item. Un statut se lit dans le contexte, il ne se re-ecrit pas. Une ANTI-INSTRUCTION explicite ("ne les re-coche pas", "sans rien modifier", "juste pour verifier") est absolue: zero track_progress_plan_item sur ce tour, meme si le message re-mentionne des actions faites, et meme si aucune entry n'existe encore aujourd'hui pour ces actions. Exemple: "la marche et les 10 min sont bien cochees ? les re-coche pas hein" → aucun direct effect. Exemple INVALIDE observe (alex-untested T14): "verifie juste que c'est coche, re-coche rien hein" → un track completed a ETE emis quand meme (rattrape par le dedup du jour, filet incident qui ne couvre pas le cas 'action pas encore trackee') — l'anti-instruction s'applique a l'EMISSION: direct_effects=[] pour la lane track, quoi qu'il arrive. Autre INVALIDE observe (P8-D, nina-hard23 T15): "j'ai bien coche l'eau aujourd'hui ?" (question interrogative de verif) → une requete track a ete emise quand meme; une QUESTION n'est jamais une assertion de completion. Et une RETRACTATION MEMOIRE n'est pas un report (P8-D, eva-hard23 T11 INVALIDE observe): "oublie ce que je t'ai dit sur le carnet, j'ai arrete au bout de deux jours, le retiens pas" = demande d'oubli d'un fait PERSONNEL (hors plan) → AUCUN track_progress_plan_item ("j'ai arrete" n'y est pas un report sur un item du plan) et JAMAIS une question parasite "quelle action veux-tu noter ?" en queue — l'accuse de retractation suffit. Anti-faux-positif: un vrai report negatif sur un item DU PLAN ("j'ai rate ma marche hier") reste un missed normal.`,
  },
  {
    // 3g et 3g-ter restent: les deux portent la reprise d'un
    // create_one_shot_reminder (clarification en attente, rappel differe par
    // une crise safety), lane bien ouverte a un eleve KEEL.
    when: (a: DispatcherPromptAudience) =>
      a.pendingDirectEffectClarification === true ||
      a.pendingSafetyDeferredReminder === true,
    text: `3g. Si flow_state_context.pending_direct_effect_clarification est present: le tour precedent a pose une question pour finaliser une ecriture (effect_type, clarify_question, known_slots, reason_code). Si le message courant repond a cette question, re-emets l'effet direct COMPLET correspondant avec le payload canonique — c'est la suite de la meme demande, pas une nouvelle intention, donc explicitness=explicit et target_status=identified. Regle de fusion des slots: la reponse du user PRIME sur known_slots pour le slot clarifie, known_slots fournit le reste. En particulier, si reason_code est target_not_evidenced ou target_ambiguous, la question portait sur LA CIBLE: known_slots.target_item_id est la cible DEVINEE a remplacer — prends target_item_id depuis l'action que le user nomme maintenant (active_action_candidates) avec target_evidence citant ses mots, et reprends status/date de known_slots. Exemple: known_slots={target 'Planifier mes soirees' devine, completed} + user 'je parle de la cartographie de mes ruminations' → emets track_progress avec target_item_id de 'Cartographier mes ruminations du soir', status_hint=completed, target_evidence='la cartographie de mes ruminations'. CONFIRMATION PURE (nina-untested T3, INVALIDE observe: AUCUN effet re-emis): quand la reponse CONFIRME la cible que la question proposait ('bah si je te confirme que c'est ca, a 100%, note-la', 'oui c'est ca', 'exactement') SANS nommer une autre action, re-emets l'effet direct COMPLET avec les known_slots TELS QUELS (target_item_id/status/date de known_slots, target_evidence = le titre tel que la question l'a nomme au tour precedent) — une confirmation a 100% qui ne re-emet rien laisse le user bloque une 3e fois sur un report legitime. Cas BASCULE DE CIBLE TRACK (reason_code=target_switch_ambiguous): la question etait « en plus, ou a la place ? » entre known_slots.retarget_from_title (deja committe) et la nouvelle cible. Reponse « en plus / aussi / les deux » → re-emets le track NORMAL de la nouvelle cible (known_slots fournit target_item_id/status). Reponse « a la place / c'etait pas ca / remplace » → re-emets le track avec correction=true ET retarget_from=known_slots.retarget_from_candidate: le runtime invalide l'ecriture erronee puis enregistre la bonne. Cas RAPPEL REPLACE (rose-lifecycle R1-B03): si pending_direct_effect_clarification porte effect_type=create_one_shot_reminder avec intent=replace, la reponse du user complete CE remplacement — re-emets create_one_shot_reminder avec payload_hint.intent='replace', les known_slots (UTC_time/local_label/instruction_hint du NOUVEAU rappel) et payload_hint.replace_target_label = ce que le user designe maintenant (son heure actuelle ou ses mots: 'celui de la carto demain matin'). Ne reclasse JAMAIS cette reponse en reschedule ni en enonce neuf: c'est la suite du replace deja engage (l'erreur observee: clarify → reponse → reclassee reschedule → re-blocage circulaire, l'utilisatrice a suivi la consigne et s'est fait re-bloquer). Si le message courant passe a autre chose, ignore ce contexte et traite le message normalement.
3g-ter. Si flow_state_context.pending_safety_deferred_reminder est present: un rappel demande PENDANT une crise safety a ete differe (« je le garde pour apres ») et la crise est passee. Si le message courant redemande ce rappel (« remets-moi le rappel de X », « et mon rappel ? », « oui vas-y pose-le ») ou CONFIRME l'offre de le poser, emets direct_effects.create_one_shot_reminder COMPLET (intent='create', jamais 'reschedule': ce rappel n'a JAMAIS ete cree) en fusionnant known_slots (raw_text/when_hint d'origine) avec ce que le message precise maintenant. paul-p3verify T15, INVALIDE observe: « remets-moi le rappel des pates pour demain » post-crise classe reschedule d'un rappel INEXISTANT → blocage + renvoi vers l'app, un create benin explicite refuse. Si le user passe a autre chose, ignore ce contexte (l'offre viendra du composeur).`,
  },
  {
    when: ALWAYS,
    text: `3k. EFFETS DURABLES KEEL (log_protocol_event, declare_deviation — PAS declare_safety_constraint, voir 3k-c: une allergie s'enregistre meme sans plan) — ILS N'EXISTENT QUE si le payload porte keel_plan_context. Sans ce bloc l'utilisateur n'a ni plan_commitments ni plan_version publiee: n'emets JAMAIS ces deux effets (il n'y aurait aucune ligne a rattacher, l'ecriture serait refusee a l'intake). Et quand keel_plan_context EST present, c'est l'inverse: track_progress_plan_item n'existe plus (active_action_candidates_for_direct_effects est vide, aucun id a copier) — ne l'emets jamais pour un eleve KEEL.
3k-a. log_protocol_event = l'eleve RAPPORTE UN FAIT deja arrive ou en cours: il a pris une preparation, mange quelque chose, OU FAIT UNE ACTION NON-INGEREE du protocole (mouvement, marche, seance, lumiere, sieste, sommeil, respiration, meditation, ecrans, mesure). Exemples INGERES: "j'ai pris mon magnesium", "petit dej pris, des oeufs et des myrtilles", "j'ai avale mes 2 g d'omega 3 ce matin". Exemples NON-INGERES, qui declenchent CET EFFET EXACTEMENT AU MEME TITRE: "j'ai fait ma marche de 30 minutes", "seance de muscu faite", "j'ai pris ma lumiere du matin", "sieste de 20 min ok", "10 minutes de respiration ce soir". C'est un FAIT, pas une note et pas une evaluation: le runtime ecrit une ligne dans protocol_events et la RELIT; l'evaluateur seul decidera ensuite si la ligne du plan est met/partial/missed — tu ne juges rien, tu n'annonces rien.
   ATTENTION, MODE D'ECHEC MESURE EN RUN REEL: une action non-ingeree ("j'ai fait ma marche de 30 minutes") etait systematiquement NON logue — 4 tours sur 4 — parce que les exemples ci-dessus ne parlaient que d'ingestion. La ligne mouvement du plan tombait alors en 'missed' le soir meme, pour un eleve qui l'avait FAITE et DITE, pendant que la reponse lui affirmait "c'est pris en compte". Une action du protocole qui ne s'avale pas est un fait aussi ordinaire qu'une gelule: le declencheur est "l'eleve dit qu'il a FAIT quelque chose que son plan demande", jamais "l'eleve dit qu'il a INGERE quelque chose".
   payload_hint (tous facultatifs, mais AU MOINS UN doit dire QUOI s'est passe):
   - slot_key: le creneau que l'eleve nomme, parmi ${SLOT_VOCABULARY.join(", ")}. Absent s'il ne le dit pas — ne le deduis pas de l'heure qu'il est.
   - substance_ref: la preparation nommee, parmi ${SUBSTANCE_REFS.join(", ")}.
   - food_group_ref: le groupe alimentaire nomme, parmi ${FOOD_GROUP_REFS.join(", ")}. C'est l'unite d'observation de la nutrition: le GROUPE, jamais un gramme et jamais une calorie. "j'ai mange du poulet" => poultry. Un SEUL aliment ici; des qu'il y en a plusieurs, voir components.
   - components: la liste des AUTRES aliments nommes dans le meme message, un objet par aliment: [{food_group_ref}, {substance_ref}, {quantity, unit}...]. "j'ai mange du poulet et des brocolis" => food_group_ref=poultry + components=[{food_group_ref:"cruciferous_veg"}]. "des oeufs et des myrtilles" => eggs + [{food_group_ref:"berries"}]. Le runtime ecrit UNE LIGNE PAR ITEM et n'accuse reception que des lignes relues. Tu n'y mets QUE ce qui est explicitement dit: jamais un aliment deduit d'un nom de plat, jamais un aliment tire de student_note, jamais un aliment "probable" du repas. Plafond 6 items; au-dela le tour entier est refuse.
   - commitment_id: l'id EXACT d'UNE ligne de keel_plan_context, quand l'eleve designe cette ligne sans ambiguite ("j'ai fait ma marche de 30 minutes", "sieste faite", "lumiere du matin ok"). C'est le SEUL moyen de creer un fait pour une ligne qui ne porte ni substance ni groupe alimentaire (mouvement, lumiere, sommeil, respiration, ecrans): aucun slug ne peut les porter, sans cet id le fait n'est rattache a rien.
   - quantity + unit: UNIQUEMENT si l'eleve donne le chiffre lui-meme. unit parmi ${UNIT.join(", ")}.
   - student_note: ses mots, courts, quand rien de structure ne les porte.
   REGLES DURES:`,
  },
  {
    when: ALWAYS,
    text: (audience) =>
      audience.keelStudent
        ? `   (1) JAMAIS SUR UNE INTENTION FUTURE. "je vais prendre mon magnesium", "je le prends ce soir", "je compte manger du saumon demain" => AUCUN effet pour cette lane (direct_effects=[] la concernant). Seul un fait PASSE ou EN COURS s'ecrit. Le mode d'echec est mesure (rose-hard25: une intention future committee en silence), et il est ici plus grave: protocol_events est APPEND-ONLY, une ligne fausse ne se retire pas depuis le chat.`
        : `   (1) JAMAIS SUR UNE INTENTION FUTURE. "je vais prendre mon magnesium", "je le prends ce soir", "je compte manger du saumon demain" => AUCUN effet pour cette lane (direct_effects=[] la concernant). Seul un fait PASSE ou EN COURS s'ecrit. Meme regle qu'en 3d (rose-hard25: une intention future committee en silence), et elle est ici plus grave: protocol_events est APPEND-ONLY, une ligne fausse ne se retire pas depuis le chat.`,
  },
  {
    when: ALWAYS,
    text: `   (2) JAMAIS DE QUANTITE NON DITE. Si l'eleve ne donne aucun chiffre, quantity=null et unit=null. N'inscris pas la dose ecrite sur sa ligne de plan ("il prend 5000 UI d'habitude" n'est PAS un fait rapporte): un chiffre invente devient une adherence fausse le soir meme.
   (3) JAMAIS DE SLUG APPROXIME. Si aucun slug des listes ci-dessus ne correspond franchement, mets null et laisse student_note porter ses mots. Le runtime echoue BRUYAMMENT sur un slug inconnu (R7) au lieu d'ecrire un fait a cote — c'est le correctif 'epa_dha' de l'import de plan. Un slug GENERIQUE n'existe pas: "du poisson" ne devient ni fatty_fish ni white_fish, "des legumes" ne devient ni leafy_greens ni non_starchy_veg — null + student_note. Un unknown vaut toujours mieux qu'un faux met.
   (3-bis) UN commitment_id NE SE DEVINE JAMAIS. Trois conditions CUMULATIVES, sinon omets le champ: (a) l'id apparait LITTERALEMENT dans keel_plan_context — tu le recopies caractere par caractere, tu n'en fabriques jamais un, tu ne reutilises jamais un id vu ailleurs dans la conversation ni un plan_item_id legacy; (b) l'eleve designe UNE ligne et une seule — si deux lignes du bloc pourraient convenir, ou si le bloc n'affiche aucun id, mets null; (c) c'est bien CETTE ligne qu'il dit avoir faite, pas une ligne voisine du meme creneau. Le runtime verifie l'id contre le plan publie du jour et REFUSE le tour si l'id n'y est pas (unknown_commitment): un id invente ne produit pas une erreur discrete, il fait echouer l'ecriture. Et ne mets JAMAIS commitment_id sur une ligne polarity='avoid' que l'eleve dit avoir RESPECTEE ("j'ai pas bu ce soir"): un fait rattache a une ligne d'evitement est lu comme une transgression — c'est l'inversion de note deja constatee sur le tap (G1). Une abstinence n'est pas un fait, c'est une absence de fait: aucun effet.
   (4) UNE QUESTION N'EST PAS UN FAIT: "j'ai bien pris mon magnesium ce matin ?", "c'est note ?" => aucun effet (meme regle que 3e).
   (5) UN SEUL EFFET log_protocol_event par tour, mais il porte AUTANT D'ITEMS que le message en nomme (payload components). Ne duplique jamais l'effet lui-meme: c'est le champ components qui porte la cardinalite, et le runtime ecrit une ligne par item. MODE D'ECHEC MESURE EN RUN REEL, et c'est pour lui que le champ existe: "j'ai mange du poulet et des brocolis" n'ecrivait qu'une ligne (ancienne regle "l'entree la plus porteuse"), le modele choisissait poultry - le groupe qui ne comptait pas - et la reponse affirmait que les legumes comptaient. Un fait ampute plus un accuse sans ligne. Si un aliment n'a pas de slug franc, il ne devient PAS un item: null + student_note (regle 3), et la reponse n'affirmera que ce que le runtime aura relu.`,
  },
  {
    when: ALWAYS,
    text: (audience) =>
      audience.keelStudent
        ? `   (6) Effet TRANSVERSE: il s'emet EN PLUS de l'owner du tour et n'absorbe jamais le tour.`
        : `   (6) Effet TRANSVERSE comme en 3c: il s'emet EN PLUS de l'owner du tour et n'absorbe jamais le tour.`,
  },
  {
    when: ALWAYS,
    text: `3k-c. declare_safety_constraint = l'eleve declare (ou RETIRE) une CONTRAINTE DURE sur ce qu'il peut manger ou prendre: allergie, intolerance, contre-indication medicale, eviction religieuse stricte. C'est le SEUL effet KEEL qui ne depend PAS de keel_plan_context: une allergie doit s'enregistrer meme sans plan publie, et meme pendant une crise safety.
   Exemples qui declenchent CET effet: "I'm allergic to peanuts", "je suis intolerante au lactose", "je ne mange pas de porc", "mon medecin m'a interdit le pamplemousse avec mon traitement", "je suis coeliaque".
   payload_hint:
   - intent: 'declare' (defaut) ou 'retract'. 'retract' UNIQUEMENT quand l'eleve annule une contrainte: "en fait je ne suis PAS allergique aux arachides, c'etait ma soeur", "retire cette allergie", "je me suis trompe". Une correction de CIBLE ("ce n'est pas l'arachide, c'est la noix de cajou") = deux tours de dispatcher n'y suffisent pas: emets le retract sur l'ancien identifiant, le runtime posera la question pour le nouveau.
   - allergen_ref / substance_ref / medication_class: l'identifiant en snake_case ASCII. AU MOINS UN est obligatoire. Utilise le mot que l'eleve emploie, reduit a un slug: "peanuts" => peanut, "lactose" => lactose, "gluten" => gluten, "shellfish" => shellfish, "pamplemousse" => grapefruit. Prefere le terme GENERIQUE et SINGULIER.
   - kind parmi allergy, intolerance, medical, religious, dislike. Defaut allergy quand l'eleve dit "allergique"/"allergic".
   - severity parmi medical, strict, preference. NE LE METS PAS sauf si l'eleve qualifie lui-meme: le runtime choisit le defaut le plus protecteur par kind. Ne descends JAMAIS a 'preference' une allergie ou une intolerance.
   - notes: ses mots, courts ("anaphylactic, carries an EpiPen").
   REGLES DURES:
   (1) NE CONFONDS PAS AVEC UN GOUT. "je deteste le brocoli", "j'aime pas le poisson" = AUCUN effet: c'est une preference, elle est captee par la memoire ordinaire. Cet effet est reserve a ce qui peut BLESSER ou a une eviction que l'eleve tient pour non negociable. Un "je ne mange pas de viande" ordinaire (choix alimentaire) n'est PAS une contrainte dure sauf si l'eleve la presente comme telle (religieuse, medicale).
   (2) JAMAIS SUR LA CONTRAINTE DE QUELQU'UN D'AUTRE. "ma soeur est allergique aux arachides", "mon collegue est coeliaque" => AUCUN effet. Le magasin porte les contraintes DE CET ELEVE.
   (3) UNE QUESTION N'EST PAS UNE DECLARATION: "est-ce que ce plat contient des arachides ?" => aucun effet, c'est une question a laquelle la reponse normale repond.
   (4) UN SEUL effet par tour. Si l'eleve nomme deux contraintes, prends la plus grave et laisse la reponse normale demander l'autre: mieux vaut une ligne juste et une question qu'une annonce de deux lignes dont une seule existe.
   (5) Effet TRANSVERSE: il s'emet EN PLUS de l'owner du tour et n'absorbe jamais le tour.
3k-b. declare_deviation = l'eleve annonce A L'AVANCE une indisponibilite: "jeudi je suis en deplacement", "ce soir j'ai un anniversaire", "vendredi midi je mange au resto". Le runtime ecrit une ligne planned_deviations qui sort ce jour (ou ce creneau) du denominateur d'adherence.
   ⚠️ local_date SE LIT DANS named_day_calendar, il ne se calcule pas. Cette table (direct_effect_time_context) donne les 8 prochains jours civils de l'eleve avec leur ISO et leur nom dans les deux langues. Pour "jeudi"/"thursday", copie l'ISO de la PREMIERE ligne dont les noms contiennent ce jour.
   ⚠️⚠️ UN JOUR NOMME QUI EST AUJOURD'HUI VEUT DIRE AUJOURD'HUI. C'est le seul cas ou tu te trompes, et tu t'y trompes systematiquement. MESURE (run reel du 2026-08-06, un JEUDI): "Jeudi soir je mange au restaurant" ecrit sur 2026-08-07 (vendredi) 3 fois sur 3, alors que la meme phrase avec "Samedi soir" ressortait juste. Le nom du jour courant N'EST PAS une facon de dire "la semaine prochaine" ni "demain": un eleve qui dit "jeudi soir" un jeudi parle de CE SOIR. Si l'entree offset 0 porte le jour nomme, prends son ISO — pas offset 1, pas offset 7. Il faut le mot "prochain"/"next" pour viser une autre semaine.
   Une deviation sur le mauvais jour sort le mauvais jour du denominateur ET y laisse le vrai — deux erreurs pour une, et aucune n'est visible.
   payload_hint:`,
  },
  {
    when: ALWAYS,
    text: (audience) =>
      audience.keelStudent
        ? `   - local_date: date ISO locale YYYY-MM-DD du jour vise, COPIEE depuis direct_effect_time_context.named_day_calendar (jamais recalculee). JAMAIS un mot relatif ("jeudi", "ce soir"): le runtime REFUSE une valeur non-ISO au lieu de deviner. Jour vise = aujourd'hui: omets le champ.`
        : `   - local_date: date ISO locale YYYY-MM-DD du jour vise, COPIEE depuis direct_effect_time_context.named_day_calendar (jamais recalculee). JAMAIS un mot relatif ("jeudi", "ce soir"): le runtime REFUSE une valeur non-ISO au lieu de deviner (meme discipline que date_hint en 3d-bis). Jour vise = aujourd'hui: omets le champ.`,
  },
  {
    when: ALWAYS,
    text: `   - slot_key parmi ${SLOT_VOCABULARY.join(", ")} quand un seul repas est concerne; absent = la journee entiere.
   - kind parmi ${DEVIATION_KINDS.join(", ")}. Si le contexte ne se classe pas franchement, mets other: la deviation est vraie meme quand son etiquette ne l'est pas.
   - note: ses mots, court.
   REGLES DURES:
   (1) LE FLEX SE DECLARE A L'AVANCE. Une deviation posee apres coup sur un jour DEJA evalue est refusee par le runtime (retroactive_on_resolved_day) — n'affirme jamais qu'elle est prise, ne promets rien, ne cherche pas de justification. "hier j'etais au resto, ca compte pas" n'est pas une declaration mais une demande de correction: emets quand meme l'effet avec la date ISO d'hier et laisse le runtime trancher.
   (2) NE CONFONDS PAS avec log_protocol_event: "ce soir j'ai un anniversaire" (a venir) = declare_deviation; "hier soir j'etais a un anniversaire, j'ai mange du gateau" (fait rapporte) = log_protocol_event. Un futur ne s'ecrit jamais comme un fait, un passe ne s'ecrit jamais comme un flex.
   (3) NE CONFONDS PAS avec plan_question: "je suis au resto ce soir, je fais quoi ?" demande une CONDUITE => skill_signals.plan_question (kind=eating_out). Une simple annonce d'indisponibilite, ou "note-le", => declare_deviation. Les deux peuvent coexister sur le meme tour (le signal ET l'effet).
   (4) UNE RECURRENCE NE SE DECLARE PAS ICI ("tous les jeudis je suis en deplacement"): reponse normale honnete, aucun effet — une ligne planned_deviations est ponctuelle, exactement comme un rappel one-shot (regle 'Recurrence' plus haut).`,
  },
  {
    when: ALWAYS,
    text: `6-bis. skill_signals.plan_question UNIQUEMENT si le payload porte keel_plan_context (sinon la lane n'existe pas: aucun commitment, aucune swap_policy, rien a resoudre — n'emets alors jamais ce signal). Le message porte une question d'EXECUTION a l'interieur du plan publie: substitution d'un aliment, contexte de repas exterieur, repas decale. Priorite sur plan_realignment quand les deux semblent possibles: une question concrete sur UNE ligne du plan n'est pas un decrochage. Reste sous product_help et coaching_recommendation: ces deux-la sont des pulls explicites (comprendre le produit, demander un levier).`,
  },
  {
    // ══════════════════════════════════════════════════════════════════════
    // LOT 4A · L'ÉCRIVAIN DE `plan_feedback`
    //
    // ⚠️ PLACÉ ICI, COLLÉ À 6-bis, ET C'EST DÉLIBÉRÉ. La panne à éviter est la
    // CAPTURE: `plan_question` prend une part importante des tours (38 %
    // mesurés), et un retour de sizing ressemble de loin à une question de
    // plan. La frontière ne se tient que si elle est LUE au même endroit que
    // la lane voisine — la règle 3k-b(3) fait déjà exactement ça pour
    // declare_deviation.
    //
    // ⚠️ ET LES DEUX PEUVENT COEXISTER. Ce signal ne ROUTE rien: le renvoi est
    // ajouté par le runtime dans `finalVisibleText`, par-dessus la réponse de
    // la lane qui a parlé. Interdire la coexistence ferait perdre le retour
    // chaque fois que le modèle penche pour plan_question.
    //
    // ⚠️ BILINGUE. Les exemples sont donnés dans les DEUX langues, et
    // l'anti-faux-positif aussi: une garde testée dans une seule langue ne mord
    // pas dans l'autre (« not » ne couvre pas « doesn't »).
    // ══════════════════════════════════════════════════════════════════════
    when: (a: DispatcherPromptAudience) => a.keelStudent === true,
    text: `6-ter. skill_signals.plan_feedback = l'eleve DONNE UN RETOUR sur ce que son plan lui a servi. C'est un CONSTAT sur du deja-vecu, pas une question: il ne demande aucune conduite, il dit comment c'etait. Ce signal ne remplace jamais l'owner du tour et ne le prend jamais: il s'emet EN PLUS, exactement comme un effet transverse.
   Exemples FR: "les portions etaient beaucoup trop grosses cette semaine", "j'ai eu faim tout l'apres-midi, les parts du midi sont trop petites", "on a jete la moitie du plat hier soir, c'est trop pour nous".
   Exemples EN: "the portions were way too big this week", "I was starving all afternoon, lunch servings are too small", "we threw half of it out last night, it's too much food".
   payload:
   - detected: true.
   - kind: OBLIGATOIRE, et c'est LUI qui decide de la suite. Le runtime ne reconnait qu'une liste FERMEE de jetons pour un retour de PART/QUANTITE SERVIE: ${SIZING_FEEDBACK_KINDS.join(", ")}. Emets "${PLAN_FEEDBACK_SIZING_KIND}" des que le retour porte sur la TAILLE de ce qui a ete servi (trop, pas assez, reste jete, faim juste apres). Tout AUTRE retour de plan porte un autre jeton, court et libre: taste (gout, texture), difficulty (trop long, trop complique a preparer), other. Un jeton hors de la liste fermee ne declenche RIEN, et c'est voulu: le silence est la bonne reponse quand on ne sait pas de quoi le tour parlait.
   - sentiment: positive, negative ou neutral, tel que l'eleve le formule.
   - detail: SES mots, courts (160 caracteres max). N'invente ni chiffre ni prenom.
   - target_item_id / target_title: la ligne visee quand il la nomme sans ambiguite; null sinon. Un id se RECOPIE depuis keel_plan_context, il ne se devine jamais (meme regle qu'en 3k-a(3-bis)).
   REGLES DURES:
   (1) UN RETOUR N'EST PAS UNE QUESTION, ET C'EST LA FRONTIERE AVEC plan_question. "les parts etaient trop grosses" = un constat => plan_feedback. "je peux prendre une plus petite part ce soir ?" demande une CONDUITE => plan_question. Si le message fait LES DEUX ("c'etait trop copieux hier, je fais quoi ce soir ?"), emets LES DEUX signaux: le retour ne se perd pas parce que la question l'accompagne.
   (2) NE CONFONDS PAS AVEC UN FAIT RAPPORTE. "j'ai mange du poulet ce midi" est un fait => log_protocol_event, aucun plan_feedback. Un plan_feedback JUGE ce qui a ete servi; un fait dit seulement que ca a eu lieu. Les deux peuvent coexister quand l'eleve rapporte ET juge ("j'ai mange le poulet du midi, la part etait enorme").
   (3) NE CONFONDS PAS AVEC UNE ENVIE NI UNE PREFERENCE. "j'aimerais plus de poisson la semaine prochaine", "je deteste le brocoli" ne jugent pas une part: aucun plan_feedback (la memoire ordinaire les capte).
   (4) ANTI-FAUX-POSITIF DE LA FAIM. Une faim qui ne designe PAS ce que le plan a servi ("j'ai une faim de loup ce matin", "I'm hungry, what should I eat ?") n'est pas un retour: c'est une demande de proposition, aucun signal. Il faut que l'eleve parle de CE QU'IL A EU.
   (5) TU N'ANNONCES RIEN ET TU NE RANGES RIEN. Le runtime seul decide quoi en faire; ne promets a l'eleve aucun enregistrement.`,
  },
  {
    when: ALWAYS,
    text: `8. needs_research.value=true si la reponse finale exige des infos fraiches/exterieures/verifiables ou si le user demande de chercher/verifier sur internet. Remplis query avec une requete de recherche autonome et precise (le runtime EXECUTE cette recherche et injecte le resultat au composeur). Une MISE EN DOUTE explicite d'une affirmation factuelle en domaine sante/nutrition/science ("est-ce que c'est vrai que... ?", "t'as une source ?", "je veux du concret, pas des generalites") = value=true (nina-global20 T2): la reponse doit etre groundee, pas parametrique. Une question personnelle ("verifie ou j'en suis") ou de coaching sans besoin d'infos externes → value=false.
9. memory_plan est toujours present. Il sert a charger le contexte pour repondre maintenant; il ne sert jamais a ecrire en memoire.

Fallback:
- En cas de doute, ne produis aucun signal. Le runtime fera une reponse normale.`,
  },
  {
    when: ALWAYS,
    text: `- Une demande explicite de memorisation va en reponse normale avec un accuse de reception simple; ne produis aucun signal pour ca.
- Une RETRACTATION d'un fait confie ("oublie ce truc que je t'ai dit sur la poterie, c'est mort", "laisse tomber ce que j'avais dit sur X, c'est plus d'actualite") va en reponse normale avec un accuse d'oubli, memory_plan charge pour retrouver le fait — JAMAIS plan_realignment quand le fait retire n'est pas un item du plan actif (eva-hard21 T8, INVALIDE observe: "oublie la poterie du jeudi" route vers Ajuster mon plan alors que la poterie n'est pas un item). Le memorizer nocturne consomme la retractation; la reponse du tour accuse simplement.`,
  },
  {
    when: ALWAYS,
    text: `
memory_plan:
- Toujours present.
- Defaut: memory_mode=none, context_need=minimal, context_budget_tier=tiny, targets=[].
- Si le user demande un point, un etat, une synthese personnelle, ou parle d'une action du plan: choisis un memory_plan utile pour repondre maintenant.
- RESTITUTION DE FAIT CONFIE: si le user demande de restituer quelque chose qu'il a confie ou qui a ete note sur lui (se rappeler, redire, verifier un fait, une date, un nom, un objectif, "c'etait quoi deja"), memory_mode=none est INTERDIT: mets au minimum memory_mode=broad avec context_need=broad, pour que la memoire durable soit chargee. Cette regle ne s'applique pas aux questions sur le produit ou le fonctionnement de Sophia (aucun fait personnel a restituer).
- targets autorises: topic, event, action, level, entity, domain_key, domain_prefix, runtime_snapshot. retrieval_policy: force_taxonomy, taxonomy_first, semantic_first, semantic_only.
${domainRegistryPromptLines().join("\n")}`,
  },
];

export function buildDispatcherSystemPrompt(
  audience: DispatcherPromptAudience,
): string {
  return DISPATCHER_SYSTEM_PROMPT_BLOCKS
    .filter((block) => block.when(audience))
    .map((block) =>
      typeof block.text === "function" ? block.text(audience) : block.text
    )
    .join("\n")
    .trim();
}

/**
 * L'assemblage legacy. Identique octet pour octet a l'ancienne constante:
 * c'est le prompt que recoit tout utilisateur qui n'est pas un eleve KEEL,
 * sur ce projet comme sur celui du produit grand public.
 */
export const DISPATCHER_V2_SYSTEM_PROMPT = buildDispatcherSystemPrompt({
  keelStudent: false,
});


export function buildDispatcherPrompt(input: {
  user_message: string;
  recent_messages: Array<{ role: string; content: string }>;
  active_topic_state?: unknown;
  flow_state_context?: unknown;
  direct_effect_time_context?: DirectEffectTimeContext | null;
  plan_snapshot?: unknown;
  /**
   * W4.4 — bloc KEEL (`context/keel_plan_context.ts`), non null uniquement pour
   * un `keel_role='student'`. Sa presence est la BRANCHE: le payload porte
   * alors le plan KEEL et RIEN du legacy. Envoyer les deux projections
   * laisserait le modele choisir la plus arrangeante, et `user_plan_items`
   * porte le compteur `current_reps` que KEEL a supprime.
   */
  keel_plan_context?: string | null;
  /**
   * `profiles.keel_role === 'student'`. Meme drapeau que le `keel_student` de
   * `routers.ts`, et meme source: le RUNTIME, jamais le LLM.
   *
   * Distinct de `keel_plan_context`, qui peut etre null pour un eleve dont le
   * plan n'a pas pu etre lu. La projection du plan suit `keel_plan_context`
   * (inchange); ce qui suit ce drapeau-ci, c'est la LANE: un eleve sans plan
   * n'a pas davantage acces a `product_help`, `coaching_recommendation`,
   * `plan_realignment` ou `track_progress_plan_item` qu'un eleve avec plan.
   */
  keel_student?: boolean;
}): string {
  const keelPlanContext = input.keel_plan_context ?? null;
  const keelStudent = input.keel_student === true;
  return JSON.stringify({
    prompt_version: DISPATCHER_V2_PROMPT_VERSION,
    user_message: input.user_message,
    recent_messages: input.recent_messages.slice(-8),
    active_topic_state: input.active_topic_state ?? null,
    flow_state_context: input.flow_state_context ?? null,
    direct_effect_time_context: input.direct_effect_time_context ?? null,
    keel_plan_context: keelPlanContext,
    plan_snapshot: keelPlanContext ? null : input.plan_snapshot ?? null,
    active_action_candidates_for_direct_effects: keelPlanContext
      ? []
      : activeActionCandidatesForDirectEffects(input.plan_snapshot ?? null),
    expected_shape: {
      safety: {
        risk_band: "none|low|medium|high|critical",
        reason_codes: [],
        evidence: [],
      },
      direct_effects: [],
      skill_signals: {
        // Meme raison que pour leur doctrine (voir
        // `DISPATCHER_SYSTEM_PROMPT_BLOCKS`): `routers.ts` ferme ces trois
        // lanes a un eleve de coach. Les laisser dans la forme attendue
        // revient a montrer au modele trois cases qu'il ne pourra jamais
        // servir — exactement ce que le commentaire W4.4 ci-dessous refusait
        // deja pour `plan_question` dans l'autre sens.
        // W4.4 — present dans la forme attendue seulement quand la lane existe
        // (keel_plan_context non null). Sinon le modele voit un signal qu'il
        // ne pourra jamais servir.
        ...(input.keel_plan_context
          ? {
            plan_question: {
              detected: false,
              confidence_band: "low|medium|high|critical",
              reason: null,
              context: {
                kind: "food_swap|eating_out|meal_shifted|other",
                requested_food_group: "food_groups slug|null",
                prescribed_food_group: "food_groups slug|null",
                slot_hint: "slot_vocabulary key|null",
                reason: "string",
              },
            },
          }
          : {}),
        // LOT 4A — LA CASE DU SIGNAL, ET ELLE SUIT `keel_student`, PAS
        // `keel_plan_context`.
        //
        // ⚠️ CE N'EST PAS UNE INCOHÉRENCE AVEC LA LIGNE DU DESSUS. La lane
        // `plan_question` n'a rien à résoudre sans plan publié; le renvoi du
        // sizing, lui, est gaté au runtime sur `isKeelStudent` seul
        // (`sizingRedirectFor`). Faire suivre la case à `keel_plan_context`
        // fermerait le signal aux élèves dont le plan n'a PAS pu être lu ce
        // tour — c'est-à-dire précisément aux tours où on ne le saurait pas.
        //
        // ⚠️ ET ELLE EST ICI, DANS LA FORME ATTENDUE, PAS SEULEMENT DANS LA
        // RÈGLE. « Promesse et clé de schéma doivent se toucher »: une règle
        // qui nomme un champ absent de `expected_shape` a été mesurée à 0 %
        // dans ce dépôt.
        ...(keelStudent
          ? {
            plan_feedback: {
              detected: false,
              kind: `${SIZING_FEEDBACK_KINDS.join("|")}|taste|difficulty|other`,
              confidence: 0,
              sentiment: "positive|negative|neutral",
              detail: "string|null",
              target_item_id: "keel_plan_context id|null",
              target_title: "string|null",
            },
          }
          : {}),
      },
      memory_plan: {
        response_intent: "string",
        reasoning_complexity: "low|medium|high",
        context_need: "minimal|targeted|broad|dossier",
        memory_mode: "none|light|broad|dossier",
        model_tier_hint: "lite|standard|deep",
        context_budget_tier: "tiny|small|medium|large",
        targets: [],
        retrieval_policy:
          "force_taxonomy|taxonomy_first|semantic_first|semantic_only",
        plan_confidence: 0.7,
      },
      needs_research: {
        detected: false,
        value: false,
        query: null,
        domain_hint: null,
        confidence: 0,
        reason: null,
      },
    },
    doctrine_examples: [
      {
        user_message:
          "Ca fait des mois que je me bats contre moi-meme et la je crois que je vois enfin les choses autrement. Avant j'etais convaincu d'etre juste casse, et je commence a me dire que non, que mon corps sait faire, qu'il faut juste lui laisser le temps. Je sais pas trop quoi en faire de ce sentiment.",
        expected: {
          direct_effects: [],
          skill_signals: {
            presence_conversation: {
              detected: true,
              confidence_band: "high",
              reason: "deep_vulnerable_personal_reflection_no_tool_request",
              context: {
                kind: "maintain",
                topic_hint: "rapport a soi, reconstruction de confiance",
                reason:
                  "Reflexion personnelle vulnerable et engagee, le user veut deposer/explorer sans demander de levier ni d'outil.",
              },
            },
          },
          memory_plan: {
            response_intent: "supportive_presence",
            context_need: "broad",
            memory_mode: "broad",
            model_tier_hint: "deep",
            context_budget_tier: "large",
          },
        },
      },
      // Exemples des lanes que `routers.ts` ferme a un eleve de coach:
      // coaching_recommendation (8) puis plan_realignment (4). Un exemple
      // enseigne un signal aussi surement qu'une regle — les garder ici
      // reviendrait a payer 1 800 tokens par tour pour apprendre au modele a
      // remplir des cases que la route jette.
      ...(keelStudent ? [] : [
        {
          user_message: "Je n'y arrive pas sur cette action, je fais quoi ?",
          expected: {
            direct_effects: [],
            skill_signals: {
              coaching_recommendation: {
                detected: true,
                confidence_band: "high",
                reason: "stuck_action_coaching_need",
                context: {
                  coaching_type: "plan_action",
                  confidence: 0.82,
                  action_context: { source: "ambiguous" },
                  reason:
                    "User asks for coaching help on a blocked action; plan relation is ambiguous.",
                },
              },
            },
          },
        },
        {
          user_message:
            "Je ne sais pas si je dois changer l'action ou mettre un rappel",
          expected: {
            direct_effects: [],
            skill_signals: {
              coaching_recommendation: {
                detected: true,
                confidence_band: "high",
                reason: "coaching_choice_for_blocker",
                context: {
                  coaching_type: "ambiguous",
                  confidence: 0.78,
                  action_context: { source: "ambiguous" },
                  reason:
                    "User asks which coaching lever to use, but the action relation to the plan is not clear.",
                },
              },
            },
          },
        },
        {
          user_message:
            "Je risque de craquer ce soir, je devrais utiliser quoi ?",
          expected: {
            direct_effects: [],
            skill_signals: {
              coaching_recommendation: {
                detected: true,
                confidence_band: "high",
                reason: "risk_moment_coaching_need",
                context: {
                  coaching_type: "no_plan_action",
                  confidence: 0.86,
                  action_context: {
                    source: "free",
                    action_title: "risque de craquer ce soir",
                  },
                  reason:
                    "User asks for help around a concrete non-plan risk moment.",
                },
              },
            },
          },
        },
        {
          user_message: "Je dois me lancer mais je bloque",
          expected: {
            direct_effects: [],
            skill_signals: {
              coaching_recommendation: {
                detected: true,
                confidence_band: "high",
                reason: "free_action_coaching_need",
                context: {
                  coaching_type: "no_plan_action",
                  confidence: 0.8,
                  action_context: {
                    source: "free",
                    action_title: "me lancer",
                  },
                  reason: "User asks for help starting a non-plan action.",
                },
              },
            },
          },
        },
        {
          user_message: "J'oublie tout le temps mes actions",
          expected: {
            direct_effects: [],
            skill_signals: {
              coaching_recommendation: {
                detected: true,
                confidence_band: "high",
                reason: "ambiguous_coaching_need",
                context: {
                  coaching_type: "ambiguous",
                  confidence: 0.74,
                  action_context: { source: "ambiguous" },
                  reason: "User asks for help choosing a coaching lever.",
                },
              },
            },
          },
        },
        {
          user_message: "Cette action est trop lourde, je n'y arrive jamais",
          expected: {
            direct_effects: [],
            skill_signals: {
              coaching_recommendation: {
                detected: true,
                confidence_band: "high",
                reason: "plan_action_coaching_need",
                context: {
                  coaching_type: "plan_action",
                  confidence: 0.82,
                  action_context: { source: "plan" },
                  reason:
                    "User asks for coaching on a plan action that feels too heavy.",
                },
              },
            },
          },
        },
        {
          user_message:
            "Le plus dur c'est le mail: je suis tendu et j'ai la boule au ventre avant de m'y mettre.",
          expected: {
            direct_effects: [],
            skill_signals: {
              coaching_recommendation: {
                detected: true,
                confidence_band: "high",
                reason: "action_linked_emotional_friction",
                context: {
                  coaching_type: "no_plan_action",
                  confidence: 0.84,
                  action_context: {
                    source: "free",
                    action_title: "mail",
                  },
                  reason:
                    "The emotional friction is anchored to starting a concrete action, so it remains action coaching, not global emotional coaching.",
                },
              },
            },
          },
        },
        {
          user_message: "Je suis trop anxieux pour reflechir",
          expected: {
            direct_effects: [],
            skill_signals: {
              coaching_recommendation: {
                detected: true,
                confidence_band: "high",
                reason: "emotional_state_coaching_need",
                context: {
                  coaching_type: "emotional",
                  confidence: 0.9,
                  action_context: null,
                  reason: "Internal state is the primary blocker.",
                },
              },
            },
          },
        },
        {
          user_message:
            "J'ai pas du tout suivi mon plan cette semaine, je suis completement sorti du rythme.",
          expected: {
            direct_effects: [],
            skill_signals: {
              plan_realignment: {
                detected: true,
                confidence_band: "high",
                reason: "plan_drift_repair_need",
                context: {
                  drift_type: "lost_rhythm",
                  scope: "week",
                  explicit_adjust_request: false,
                  product_execution_allowed: false,
                  reason:
                    "User reports being disconnected from the weekly plan and rhythm; this needs reassurance and redirection to plan adjustment, not a specific action coaching lever.",
                },
              },
            },
          },
        },
        {
          user_message:
            "J'ai pris trop de retard sur mon plan, je crois qu'il faut le revoir.",
          expected: {
            direct_effects: [],
            skill_signals: {
              plan_realignment: {
                detected: true,
                confidence_band: "high",
                reason: "plan_realignment_explicit_adjust",
                context: {
                  drift_type: "late_on_plan",
                  scope: "whole_plan",
                  explicit_adjust_request: true,
                  product_execution_allowed: false,
                  reason:
                    "User reports plan-level delay and explicitly says the plan should be reviewed; chat execution is not allowed.",
                },
              },
            },
          },
        },
        {
          user_message:
            "Le plan est trop lourd cette semaine, je n'arrive pas a le tenir.",
          expected: {
            direct_effects: [],
            skill_signals: {
              plan_realignment: {
                detected: true,
                confidence_band: "high",
                reason: "plan_too_heavy_realignment",
                context: {
                  drift_type: "plan_too_heavy",
                  scope: "week",
                  explicit_adjust_request: false,
                  product_execution_allowed: false,
                  reason:
                    "User describes the plan/week as too heavy, not one specific blocked action.",
                },
              },
            },
          },
        },
        {
          user_message: "Mon plan est trop mou, corse-le, je veux plus d'ambition.",
          expected: {
            direct_effects: [],
            skill_signals: {
              plan_realignment: {
                detected: true,
                confidence_band: "high",
                reason: "plan_too_light_realignment",
                context: {
                  drift_type: "plan_too_light",
                  scope: "whole_plan",
                  explicit_adjust_request: true,
                  product_execution_allowed: false,
                  reason:
                    "User says the plan is too easy and explicitly asks to raise the level; direction is UP (plan_too_light), never plan_too_heavy.",
                },
              },
            },
          },
        },
      ]),
      {
        user_message:
          "Tu pourrais pas me relancer tous les soirs vers 21h30 pour le carnet, plutot qu'a chaque fois je te le demande ?",
        expected: {
          direct_effects: [],
          skill_signals: {},
          note:
            "Marqueur de recurrence explicite: aucun create_one_shot_reminder, meme si l'heure est exploitable. Plus aucune lane initiatives: reponse normale honnete.",
        },
      },
      {
        user_message: "Tu poses trop de questions",
        expected: {
          direct_effects: [],
          skill_signals: {},
          note:
            "Feedback de STYLE: aucun signal. Si la formulation porte une contrainte de conversation, remplis session_style_commitment_hint (champ racine).",
        },
      },
      {
        user_message: "Rappelle-moi demain a 9h d'appeler Paul",
        expected: {
          direct_effects: [{
            effect_type: "create_one_shot_reminder",
            explicitness: "explicit",
            target_status: "identified",
            confidence_band: "high",
            payload_hint: {
              raw_text: "Rappelle-moi demain a 9h d'appeler Paul",
              when_hint: "demain a 9h",
              instruction_hint: "appeler Paul",
            },
          }],
          skill_signals: {},
        },
      },
      // Meme raison. track_progress_plan_item (3), product_help (4), et
      // « J'ai quelles cartes de defense actives ? ». Les trois exemples
      // track sont en plus des CONCURRENTS directs de la regle 3k-a: « J'ai
      // fait ma marche » y est classe track_progress_plan_item, alors que
      // c'est le cas exact que 3k-a documente comme non logue 4 fois sur 4 en
      // run reel cote KEEL.
      ...(keelStudent ? [] : [
        {
          user_message: "J'ai fait ma marche",
          expected: {
            direct_effects: [{
              effect_type: "track_progress_plan_item",
              explicitness: "explicit",
              target_status: "identified",
              confidence_band: "high",
              payload_hint: {
                target_item_id: "id_copie_depuis_active_action_candidates",
                status_hint: "completed",
              },
            }],
            skill_signals: {},
            note:
              "target_item_id = copie exacte de active_action_candidates_for_direct_effects[].plan_item_id. status_hint uniquement completed|partial|missed.",
          },
        },
        {
          user_message:
            "Note-le direct : sas de decompression sans fumer, fait hier soir",
          expected: {
            direct_effects: [{
              effect_type: "track_progress_plan_item",
              explicitness: "explicit",
              target_status: "identified",
              confidence_band: "high",
              payload_hint: {
                target_item_id: "id_copie_depuis_active_action_candidates",
                status_hint: "completed",
                date_hint:
                  "date ISO locale YYYY-MM-DD de la veille, calculee depuis direct_effect_time_context (jamais le mot 'hier')",
                target_evidence: "sas de decompression sans fumer",
              },
            }],
            skill_signals: {},
            note:
              "Imperatif de log sur une action du plan = track_progress, pas une memorisation. Report retro-date ('hier soir') = date_hint en date ISO resolue (regle 3d-bis). target_evidence = citation exacte des mots du user qui nomment l'action (regle 3d-ter).",
          },
        },
        {
          user_message: "C'est quoi une carte d'attaque ?",
          expected: {
            direct_effects: [],
            skill_signals: {
              product_help: {
                detected: true,
                confidence_band: "high",
                reason: "product_help_question",
              },
            },
          },
        },
        {
          user_message:
            "Question produit: est-ce qu'une carte d'attaque peut etre modifiee apres coup ? Et rappelle-moi demain a 9h de verifier ca.",
          expected: {
            direct_effects: [{
              effect_type: "create_one_shot_reminder",
              explicitness: "explicit",
              target_status: "identified",
              confidence_band: "high",
              payload_hint: {
                raw_text: "rappelle-moi demain a 9h de verifier ca",
                when_hint: "demain a 9h",
                instruction_hint: "verifier ca",
              },
            }],
            skill_signals: {
              product_help: {
                detected: true,
                confidence_band: "high",
                reason: "product_help_question_with_one_shot_reminder",
              },
            },
          },
        },
        {
          user_message: "C'est quoi une initiative ?",
          expected: {
            direct_effects: [],
            skill_signals: {
              product_help: {
                detected: true,
                confidence_band: "high",
                reason: "product_help_question",
              },
            },
          },
        },
        {
          user_message: "Ou je trouve les rappels recurrents ?",
          expected: {
            direct_effects: [],
            skill_signals: {
              product_help: {
                detected: true,
                confidence_band: "high",
                reason: "product_help_destination",
              },
            },
          },
        },
        {
          user_message: "J'ai rate ma marche aujourd'hui",
          expected: {
            direct_effects: [{
              effect_type: "track_progress_plan_item",
              explicitness: "explicit",
              target_status: "identified",
              confidence_band: "high",
              payload_hint: {
                target_item_id: "id_copie_depuis_active_action_candidates",
                status_hint: "missed",
              },
            }],
            skill_signals: {},
          },
        },
        {
          user_message: "J'ai quelles cartes d'attaque actives ?",
          expected: {
            direct_effects: [],
            skill_signals: {},
            note: "Etat personnel actif: reponse normale, pas product_help.",
          },
        },
      ]),
      {
        user_message: "Je suis degoute, je n'ai rien fait",
        expected: {
          direct_effects: [],
          skill_signals: {},
          note: "Emotion ou decouragement: reponse normale.",
        },
      },
      // ── W4.7 — KEEL. Ces trois exemples ne valent QUE quand le payload
      // porte keel_plan_context; sans lui la lane n'existe pas (regle 3k).
      {
        user_message: "j'ai pris mon magnesium",
        expected: {
          direct_effects: [{
            effect_type: "log_protocol_event",
            explicitness: "explicit",
            target_status: "identified",
            confidence_band: "high",
            payload_hint: {
              substance_ref: "magnesium_glycinate",
              student_note: "j'ai pris mon magnesium",
            },
          }],
          skill_signals: {},
          note:
            "Fait PASSE rapporte: une ligne protocol_events. Aucune quantite (l'eleve n'en donne pas), aucun slot (il ne le nomme pas). KEEL uniquement.",
        },
      },
      {
        user_message: "je vais prendre mon magnesium ce soir",
        expected: {
          direct_effects: [],
          skill_signals: {},
          note:
            "INTENTION FUTURE: zero effet (regle 3k-a(1)). protocol_events est append-only — une intention ecrite comme un fait ne se retire pas depuis le chat.",
        },
      },
      {
        user_message: "jeudi je suis en deplacement",
        expected: {
          direct_effects: [{
            effect_type: "declare_deviation",
            explicitness: "explicit",
            target_status: "identified",
            confidence_band: "high",
            payload_hint: {
              local_date:
                "date ISO locale YYYY-MM-DD du jeudi vise, calculee depuis direct_effect_time_context (jamais le mot 'jeudi')",
              kind: "travel",
              note: "en deplacement",
            },
          }],
          skill_signals: {},
          note:
            "Indisponibilite annoncee A L'AVANCE: une ligne planned_deviations, ce jour sort du denominateur. KEEL uniquement.",
        },
      },
      // ── LOT 4A — plan_feedback. QUATRE exemples, et pas trois:
      //    (1) FR positif, (2) EN positif, (3) le NON-sizing qui est quand
      //    même un retour, (4) le NÉGATIF qui n'est pas un retour du tout.
      //
      // ⚠️ LES DEUX LANGUES, PARCE QU'UN EXEMPLE ENSEIGNE AUTANT QU'UNE RÈGLE
      // et qu'une garde apprise dans une seule langue ne mord pas dans
      // l'autre. Le gabarit de renvoi est bilingue; la détection doit l'être.
      //
      // ⚠️ (4) EST LA CONTRE-ÉPREUVE, ET ELLE VIT DANS LE PROMPT. Une garde
      // sans cas qui échoue ne prouve rien — et ici le cas qui échoue est
      // aussi le faux positif le plus vraisemblable (la faim).
      ...(keelStudent
        ? [
          {
            user_message:
              "les portions du midi etaient beaucoup trop grosses cette semaine, j'ai jete la moitie",
            expected: {
              direct_effects: [],
              skill_signals: {
                plan_feedback: {
                  detected: true,
                  kind: PLAN_FEEDBACK_SIZING_KIND,
                  confidence: 0.9,
                  sentiment: "negative",
                  detail: "portions du midi trop grosses, moitie jetee",
                  target_item_id: null,
                  target_title: null,
                },
              },
              note:
                "CONSTAT sur une PART deja servie: plan_feedback, kind de sizing. Aucune conduite demandee => surtout PAS plan_question.",
            },
          },
          {
            user_message:
              "honestly the dinner servings are way too small, I'm starving an hour later",
            expected: {
              direct_effects: [],
              skill_signals: {
                plan_feedback: {
                  detected: true,
                  kind: PLAN_FEEDBACK_SIZING_KIND,
                  confidence: 0.88,
                  sentiment: "negative",
                  detail: "dinner servings too small, hungry an hour later",
                  target_item_id: null,
                  target_title: null,
                },
              },
              note:
                "MEME REGLE EN ANGLAIS. La faim est ici rattachee a CE QUI A ETE SERVI, ce qui en fait un retour de part et pas une demande.",
            },
          },
          {
            user_message: "le plat d'hier soir etait vraiment bon",
            expected: {
              direct_effects: [],
              skill_signals: {
                plan_feedback: {
                  detected: true,
                  kind: "taste",
                  confidence: 0.8,
                  sentiment: "positive",
                  detail: "plat d'hier soir tres bon",
                  target_item_id: null,
                  target_title: null,
                },
              },
              note:
                "RETOUR DE PLAN, mais PAS de part: kind hors liste de sizing. Le signal existe, le renvoi ne part pas — c'est exactement la frontiere.",
            },
          },
          {
            user_message: "j'ai une faim de loup, je me fais quoi ce soir ?",
            expected: {
              direct_effects: [],
              skill_signals: {},
              note:
                "AUCUN SIGNAL. L'eleve ne juge rien de ce qui lui a ete servi: il demande une proposition. C'est le faux positif le plus cher des deux lanes (voir aussi plan_question).",
            },
          },
          // ⚠️ LE CAS MESURE INSTABLE, ET C'EST POUR LUI QUE CET EXEMPLE EXISTE.
          // Sonde du 2026-08-19, modele reel, 4 passes sur la phrase mixte:
          // 1 passe a rendu LES DEUX signaux, 1 seulement plan_question,
          // 1 seulement plan_feedback, 1 aucun des deux. La regle 6-ter(1) le
          // dit deja en toutes lettres — un exemple enseigne ce qu'une regle
          // seule n'obtient pas, et c'est le prompt lui-meme qui le constate
          // ailleurs (« un exemple enseigne un signal aussi surement qu'une
          // regle »). Le retour de part est la moitie qui se perd, et elle se
          // perd EN SILENCE: la question, elle, recoit toujours une reponse.
          {
            user_message:
              "la part de riz d'hier midi etait vraiment trop copieuse, du coup ce soir je peux remplacer le riz par des pates ?",
            expected: {
              direct_effects: [],
              skill_signals: {
                plan_feedback: {
                  detected: true,
                  kind: PLAN_FEEDBACK_SIZING_KIND,
                  confidence: 0.85,
                  sentiment: "negative",
                  detail: "part de riz d'hier midi trop copieuse",
                  target_item_id: null,
                  target_title: null,
                },
                plan_question: {
                  detected: true,
                  confidence_band: "high",
                  reason: "named_swap_request",
                  context: {
                    kind: "food_swap",
                    requested_food_group: "refined_grains",
                    prescribed_food_group: "whole_grains",
                    slot_hint: "dinner",
                    reason: "L'eleve nomme un remplacement precis.",
                  },
                },
              },
              note:
                "LES DEUX, TOUJOURS. Un constat sur une part passee ET une question de conduite pour ce soir sont deux intentions distinctes dans un seul message. N'en aplatis aucune dans l'autre: le runtime sert la question ET renvoie le retour vers le bilan.",
            },
          },
          // ⚠️ LE MEME EXEMPLE EN ANGLAIS, ET IL N'EST PAS REDONDANT — c'est
          // la cicatrice « une garde testee dans une seule langue ne mord pas
          // dans l'autre », mesuree ICI, sur CE cas. Apres l'ajout du seul
          // exemple francais: FR 3/3 rendaient LES DEUX signaux, EN 1/3
          // seulement — les 2 autres passes anglaises ne gardaient que la
          // question et perdaient le retour de part. Le modele apprend la
          // co-emission par la LANGUE de l'exemple, pas seulement par sa forme.
          {
            user_message:
              "yesterday's rice portion was way too big. So tonight can I swap the rice for pasta?",
            expected: {
              direct_effects: [],
              skill_signals: {
                plan_feedback: {
                  detected: true,
                  kind: PLAN_FEEDBACK_SIZING_KIND,
                  confidence: 0.85,
                  sentiment: "negative",
                  detail: "yesterday's rice portion too big",
                  target_item_id: null,
                  target_title: null,
                },
                plan_question: {
                  detected: true,
                  confidence_band: "high",
                  reason: "named_swap_request",
                  context: {
                    kind: "food_swap",
                    requested_food_group: "refined_grains",
                    prescribed_food_group: "whole_grains",
                    slot_hint: "dinner",
                    reason: "The student names a precise replacement.",
                  },
                },
              },
              note:
                "SAME RULE IN ENGLISH. Deux intentions, deux signaux — la langue du message ne change rien.",
            },
          },
        ]
        : []),
    ],
  });
}
