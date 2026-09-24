// Pack français — le namespace `plan`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `plan.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frPlan = {
  // ══ LA PRISE DE MAIN ET LES REFUS NOMMÉS (`plan.*`) ══════════════════════
  //
  // ⚠️ POURQUOI CE NAMESPACE EST DANS LE COULOIR D'ENTRÉE. `/app/setup` finit
  // par une GÉNÉRATION, et quand elle échoue c'est `copy/planRefusals.ts` qui
  // met des mots dessus — donc `plan.refusal.*` en toutes lettres, sur le
  // dernier écran du tunnel. Sans eux, une personne qui vient de tout remplir
  // en français lit un refus en anglais au moment exact où elle attend son plan.
  //
  // Ces phrases ne réécrivent AUCUN calcul du serveur: les fenêtres, les
  // plafonds et les dates sont calculés en amont et rendus tels quels. Ce
  // vocabulaire-ci est fermé, et c'est la seule chose qui ne porte aucune
  // arithmétique.
  "plan.hand.title": "C’est le foyer qui cuisine pour toi",
  "plan.hand.body":
    "Par défaut, le plan du foyer te nourrit, et c’est la façon ordinaire d’être ici. Si tu préfères cuisiner le tien, construis un plan ci-dessous et prends-le en main — c’est alors toi qui le cuisines et qui fais les courses.",
  "plan.hand.take_cta": "Cuisiner celui-ci moi-même",
  "plan.hand.taking": "Prise en main…",
  "plan.hand.taken_title": "C’est toi qui cuisines celui-ci",
  "plan.hand.taken_body":
    "Le plan du foyer ne cuisine pas pour toi sur ces jours-là. La personne qui tient le foyer peut proposer de le replier dedans — tu le gardes dans tous les cas.",
  "plan.hand.taken_on": "Pris en main le {date}.",
  "plan.hand.already": "Ce plan était déjà le tien à cuisiner.",
  // ⚠️ `plan.hand.owner_note` part avec la branche maître de `TakeTheHandCard`:
  // elle envoie composer « depuis la page du foyer », qui ne composera plus rien.
  "plan.hand.owner_note":
    "C’est toi qui tiens ce foyer, donc le plan que tu cuisines est celui du foyer. Compose-le depuis la page du foyer.",
  // ── LA SEULE BORNE DU DÉPART, ET ELLE EST DITE — 2026-09-06 ─────────────
  // Les deux champs de départ (l'entonnoir et `/app/plan`) ont porté de
  // 2026-08-12 à aujourd'hui un `max` au dimanche de la semaine en cours, et
  // aucun des deux ne disait pourquoi. Un dimanche, `min` et `max` tombaient
  // sur le même jour: une seule case cliquable, ce qui se lit comme un
  // composant cassé — rapporté mot pour mot, « je peux pas choisir une autre
  // date que celle d'aujourd'hui je comprends pas ».
  //
  // ⛔ LA RÉPARATION N'EST PAS CETTE PHRASE, C'EST LE RETRAIT DE LA BORNE.
  // Décision produit, mot pour mot: « la date devrait être libre […] n'importe
  // qui peut sélectionner la date de début librement (et si la date n'est pas
  // dépassée bien entendu) ». Le `max` est parti des deux écrans, la garde
  // serveur `window_beyond_this_week` des deux fonctions de génération, et le
  // prompt ancre désormais la liste des jours sur la DATE d'ouverture de la
  // fenêtre au lieu de « aujourd'hui » (`MEAL_PROMPT_VERSION` v28).
  //
  // ⛔ ET LA PHRASE QUI EXPLIQUAIT LA BORNE RESTANTE EST PARTIE AUSSI —
  // 2026-09-08 (`plan.window.start_bound`, avec `setup.request.window_hint`).
  // Elle disait « le départ est libre : n'importe quel jour à partir
  // d'aujourd'hui. Un jour déjà passé, non ». Le champ l'APPLIQUE par son
  // `min`: le calendrier ne propose pas le passé. Décrire un geste impossible
  // au-dessus du seul geste utile est du bruit, pas une aide.
  //
  // ⚠️ CE QUI EST PARTI EST LA PHRASE, JAMAIS LA RÈGLE. `min` côté écran,
  // `resolveRequestedWindow` (400 `bad_window`) côté serveur, et le plafond de
  // sept jours (`duration_days between 1 and 7`) sont tous entiers.
  "plan.refusal.household_frozen":
    "Ce foyer est en pause, donc aucune nouvelle semaine n’est composée. Rien n’a été effacé.",
  "plan.refusal.no_household": "Tu n’es dans aucun foyer.",
  "plan.refusal.not_owner": "Seule la personne qui tient le foyer peut faire ça.",
  "plan.refusal.empty_household": "Il n’y a encore personne à cette table.",
  "plan.refusal.goal_required":
    "Pose d’abord une direction et une situation — c’est là-dessus que tout le plan se construit.",
  "plan.refusal.no_coach": "Il n’y a encore aucune méthode publiée à cuisiner.",
  "plan.refusal.local_day_unresolved":
    "On n’a pas su dire quel jour il est là où tu es, et un plan se compte en jours.",
  "plan.refusal.window_required": "Cette demande ne nommait aucun jour à couvrir.",
  "plan.refusal.bad_window":
    "Ces dates ne peuvent pas faire un plan. Un plan part d’aujourd’hui ou d’un "
    + "jour à venir, et tient en sept jours au plus.",
  // ⛔ `plan.refusal.window_beyond_this_week` RETIRÉE LE 2026-09-06 avec le
  // refus qu'elle nommait. Elle disait « ceux-ci ne vont pas plus loin que
  // dimanche prochain »: plus rien ne l'applique, et une phrase qui décrit une
  // borne retirée se relit comme une règle vivante.
  "plan.refusal.plan_overlaps_existing":
    "Ces jours-là tombent dans un plan que tu as déjà. Couvre-le jusqu’à son dernier jour, ou remplace-le.",
  "plan.refusal.unknown_intent": "Cette demande n’a pas dit ce qu’elle remplace.",
  "plan.refusal.draft_in_flight":
    "Un plan est déjà en train de se composer pour toi. Laisse-lui un instant : il arrivera tout seul.",
  "plan.refusal.replaces_required": "Cette demande n’a pas dit quel plan elle remplace.",
  "plan.refusal.plan_not_replaceable":
    "Ce plan n’est plus celui qu’on peut remplacer. Recharge la page et réessaie.",
  "plan.refusal.mode_required":
    "Dis par où commencer : avec ce que tu as, ou en faisant les courses.",
  "plan.refusal.pantry_required":
    "Ajoute ce que tu as en réserve, ou passe en mode courses.",
  "plan.refusal.unknown_operation": "Ce n’est pas un geste que cette page connaît.",
  "plan.refusal.window_fully_away":
    "Personne ne mange ici sur ces jours-là, il n’y a donc rien à cuisiner.",
  "plan.refusal.all_members_have_own_plan":
    "Tout le monde ici cuisine déjà un plan à soi sur ces jours-là.",
  "plan.refusal.safety_constraints_unreadable":
    "On n’a pas pu lire les allergies de ce foyer, et on ne cuisine jamais sans elles.",
  "plan.refusal.empty_meal":
    "Rien d’exploitable n’est revenu. Ton plan précédent est intact — réessaie.",
  "plan.refusal.meal_unparseable":
    "La réponse est revenue sous une forme illisible. Ton plan précédent est intact — réessaie.",
  "plan.refusal.model_returned_tool_call":
    "La réponse est revenue sous une forme illisible. Ton plan précédent est intact — réessaie.",
  "plan.refusal.plan_not_written":
    "Le plan n’a pas pu être enregistré. Ton plan précédent est intact — réessaie.",
  "plan.refusal.plan_adoption_timed_out":
    "L’enregistrement a pris trop de temps et a été arrêté. Aucun plan incomplet n’a été enregistré — réessaie.",
  "plan.refusal.house_rule_violated":
    "Ce qui est revenu enfreignait une des règles de ce foyer, donc ça n’a pas été gardé.",
  "plan.refusal.mouth_unfed":
    "Dans ce qui est revenu, quelqu’un n’avait rien à manger à un repas, donc ça n’a pas été gardé. Ton plan précédent est intact — relance, ou allège une contrainte.",
  // ⟳ 2026-09-14 · BÊTA 1B — LA DEMANDE NE TIENT PAS DANS L’ASSIETTE.
  // La phrase ne porte AUCUN chiffre : les calories et l’objectif de
  // quelqu’un sont protégés à l’écran, et le moteur dit quoi changer, jamais
  // combien il manque. Elle ne dit pas non plus « relance » : relancer
  // rendrait exactement le même refus.
  // ⟳ 2026-09-14 · BÊTA 2B — une composition est déjà en vol. La phrase ne
  // promet pas de délai : on ne connaît pas celui du modèle.
  // ⟳ 2026-09-14 · BÊTA 2C — le frein. Elle ne promet pas de date : on ne la
  // connaît pas, et une promesse ratée coûte plus que le silence.
  // ⟳ 2026-09-14 · BÊTA 2B — l’appel n’a pas abouti. Elle invite à relancer,
  // parce que c’est vrai ici : rien n’a été écrit, et la panne est passagère
  // dans les quatre cas mesurés (429, erreur serveur, coupure, corps illisible).
  "plan.refusal.composition_unavailable":
    "La composition n’a pas abouti cette fois-ci. Rien n’a été modifié — ton plan actuel est intact. Relance dans un moment.",
  "plan.refusal.generation_paused":
    "La composition de nouveaux plans est momentanément suspendue. Ton plan actuel, tes courses et tes recettes restent accessibles.",
  "plan.refusal.generation_lock_unavailable":
    "Impossible de démarrer une composition pour l’instant. Rien n’a été écrit et ton plan actuel est intact. Réessaie dans une minute.",
  "plan.refusal.draft_store_unavailable":
    "L’aperçu n’a pas pu être rangé, donc rien n’a été écrit. Ton plan actuel est intact. Réessaie dans une minute.",
  "plan.refusal.generation_lease_lost":
    "Cette composition a été reprise par une autre demande, et celle-ci s’est arrêtée sans rien écrire. Ton plan actuel est intact. Recharge la page pour voir où en est l’autre.",
  "plan.refusal.generation_in_flight":
    "Un plan est déjà en train d’être composé pour ce foyer. Attends qu’il finisse — l’écran se met à jour tout seul. Ton plan actuel est intact.",
  "plan.refusal.plan_expired":
    "Cette composition n’est pas allée au bout. Rien n’a été écrit et ton plan actuel n’a pas bougé : elle s’est arrêtée de son côté avant la fin. Relance quand tu veux.",
  "plan.refusal.plan_still_composing":
    "Ça prend plus longtemps que prévu. La composition continue de son côté — ton plan actuel n’a pas bougé. Reviens dans quelques minutes et recharge la page ; ne relance pas, le foyer est encore occupé par cette demande.",
  "plan.refusal.plan_demand_infeasible":
    "Ce que ce plan doit servir ne tient pas dans les repas prévus. Ton plan actuel est intact. Ajoute un moment de repas dans la journée concernée, ou retire le réglage « repas léger », puis relance.",
  "plan.refusal.plan_not_deliverable":
    "Le nouveau plan n’a pas passé ses derniers contrôles, donc il n’a pas été gardé. Ton plan actuel est intact — relance, ou allège une contrainte.",
  "plan.refusal.plan_validation_unavailable":
    "On n’a pas pu vérifier le nouveau plan jusqu’au bout, donc il n’a pas été gardé. Ce n’est pas ta demande qui pose problème — ton plan actuel est intact, relance tel quel.",
  // ══ ⟳ 2026-09-12 · ÉTAPE C5 — LES ÉCARTS D'UN PLAN LIVRÉ ════════════════
  "plan.validation.title": "Ce plan est utilisable, et voici ce qu’il ne tient pas",
  "plan.validation.intact": "Il a été enregistré. Rien d’autre n’a changé.",
  // ⟳ 2026-09-16 — le même bandeau dans l'APERÇU : rien n'est enregistré tant
  // qu'on n'adopte pas. Le pied « il a été enregistré » y faisait croire le
  // contraire.
  "plan.validation.preview_intact":
    "Ce n’est qu’un aperçu : rien n’est enregistré tant que tu ne l’adoptes pas. Ton plan actuel n’a pas bougé.",
  "plan.validation.at": "{day}, {slot}",
  "plan.validation.for": "pour {name}",
  "plan.validation.term": "({term})",
  "plan.validation.incomplete_title": "Ce qui n’a pas pu être vérifié",
  "plan.validation.control_line": "{control} — {count}",
  "plan.validation.cause.missing_meal": "Un repas n’a la portion de personne",
  "plan.validation.cause.double_meal": "Un repas est servi deux fois sur la même case",
  "plan.validation.cause.energy_off": "Un repas est loin de sa cible",
  "plan.validation.cause.protein_short": "Une journée n’atteint pas sa protéine",
  "plan.validation.cause.protein_over": "Une journée dépasse sa protéine",
  "plan.validation.cause.unmeasurable": "Une portion n’a pas pu être mesurée",
  "plan.validation.cause.shopping_missing": "Un ingrédient n’est sur aucune ligne de courses",
  "plan.validation.cause.shopping_short":
    "Une ligne de courses achète moins que ce que la recette demande",
  "plan.validation.cause.shopping_unused":
    "Une ligne de courses achète un aliment qu’aucune recette n’emploie",
  "plan.validation.cause.shopping_undated": "Une ligne de courses n’a pas de jour",
  "plan.validation.cause.shopping_too_early": "Un produit frais est acheté trop tôt",
  "plan.validation.cause.cooking_window": "Un plat se mange hors de sa fenêtre de cuisson",
  "plan.validation.cause.dangling": "Une ligne du plan pointe dans le vide",
  "plan.validation.cause.forbidden": "Un plat sert quelque chose que cette table exclut",
  "plan.validation.control.shopping_quantity":
    "La quantité d’un ingrédient, quand le garde-manger n’en nomme aucune",
  "plan.validation.control.cell_energy": "L’énergie servie à un repas",
  "plan.validation.control.protein_floor": "Le plancher protéique d’une journée",
  "plan.validation.control.mouth_energy": "L’énergie servie à une personne",
  "plan.validation.control.protein_floor_protected":
    "Le plancher protéique, mis de côté exprès pour une journée",
  "plan.validation.control.shopping_not_purchasable":
    "L’eau du robinet, mesurée dans la cuisson et sur aucune liste de courses",
  "plan.refusal.merge_member_required": "Ce geste n’a pas dit quel plan replier.",
  "plan.refusal.merge_member_not_in_household": "Cette personne n’est pas dans ce foyer.",
  "plan.refusal.merge_member_is_owner":
    "Le plan du foyer est déjà le tien : il n’y a rien à ramener.",
  "plan.refusal.merge_member_has_no_plan":
    "Cette personne n’a aucun plan validé à elle à replier.",
  "plan.refusal.merge_no_household_plan":
    "Il n’y a aucun plan de foyer en cours dans lequel replier. Compose-en un d’abord.",
  "plan.refusal.merge_windows_disjoint":
    "Son plan et celui du foyer n’ont aucun jour en commun, il n’y a donc rien à replier.",
  "plan.refusal.merge_window_all_past":
    "Tous les jours que son plan partage avec celui-ci sont déjà derrière nous.",
  "plan.refusal.merge_window_unreadable": "Ces jours n’ont pas pu être lus.",
  "plan.refusal.merge_plan_vanished": "Ce plan n’est plus lisible. Réessaie.",
  "plan.refusal.merge_member_away_all_window":
    "Cette personne est notée absente à tous les repas de ces jours-là.",
  "plan.refusal.merge_quota_exhausted":
    "Ce foyer a utilisé ses fusions de la semaine. Rien n’est perdu, et ça repart la semaine prochaine.",
  "plan.refusal.unmerge_member_required": "Ce geste n’a pas dit qui ressortir.",
  "plan.refusal.unmerge_member_not_in_household": "Cette personne n’est pas dans ce foyer.",
  "plan.refusal.unmerge_member_is_owner":
    "Le plan du foyer est le tien : il n’y a personne à en sortir.",
  "plan.refusal.unmerge_member_not_merged":
    "Aucun plan de foyer en cours ne l’a ramenée à cette table, il n’y a donc rien à défaire.",
  "plan.refusal.unmerge_window_all_past":
    "Ce plan de foyer n’a plus aucun jour devant lui. Il ne reste rien à cuisiner autrement.",
  "plan.refusal.unmerge_window_unreadable": "Ces jours n’ont pas pu être lus.",
  // Les deux refus du brouillon. Ils disent d'abord ce qui n'a PAS bougé.
  "plan.refusal.draft_not_composed":
    "L’aperçu n’a pas abouti. Rien n’a été enregistré, ton plan n’a pas bougé.",
  // ⛔ ELLE DIT LA CAUSE **ET** LA SORTIE. « L'aperçu n'a pas abouti » ne disait
  // ni l'une ni l'autre: la personne réessayait, obtenait la même chose, et
  // concluait que le produit était cassé.
  "plan.refusal.day_already_spent":
    "Ta journée est finie : tous tes repas d’aujourd’hui sont passés. Demande un plan à partir de demain.",
  "plan.refusal.note_unusable":
    "Je ne peux pas repartir de cette phrase-là. Reformule ce que tu veux changer dans le plan.",
  // ⟳ 2026-09-09 — la reprise locale. L'aperçu reste celui d'avant, et c'est dit.
  "plan.refusal.cell_not_rendered":
    "Je n’ai pas réussi à refaire ce repas-là. L’aperçu est inchangé — reformule, ou refais tout le plan.",
  "plan.refusal.cell_unknown":
    "Ce repas-là n’est pas dans cet aperçu. L’aperçu est inchangé.",
  // ⟳ 2026-09-24 — « Remplacer ».
  "plan.refusal.dish_unknown":
    "Ces plats ne sont plus dans cet aperçu. Il n’a pas changé.",
  "plan.refusal.dish_not_rendered":
    "Je n’ai pas réussi à changer ces plats cette fois. L’aperçu n’a pas changé : réessaie avec « Ajuster le plan ».",
  "plan.refusal.edit_nothing_to_change":
    "Aucun plat de cet aperçu ne contient ça : il reste tel quel. C’est retenu pour les prochains plans.",
  "plan.refusal.draft_has_no_source":
    "Cet aperçu est trop ancien pour être repris repas par repas. Refais tout le plan.",
  "plan.refusal.draft_mismatch":
    "Cet aperçu ne correspond plus à la semaine demandée. Refais tout le plan.",
  "plan.validate.error.not_authenticated": "Tu n’es plus connecté.",
  "plan.validate.error.not_your_plan": "Ce plan n’est pas le tien.",
  "plan.validate.error.plan_retired": "Ce plan a été remplacé.",
  "plan.validate.error.not_a_personal_plan":
    "Le plan du foyer n’est pas quelque chose à prendre en main — c’est déjà ce que tout le monde mange.",

  // ══════════════════════════════════════════════════════════════════════════
  // LOT 6 · `/app/plan` — LA CUISINE ET CE QUE L'ÉLÈVE A DIT
  // ══════════════════════════════════════════════════════════════════════════
  "plan.cooking.title": "Comment tu cuisines",
  "plan.cooking.subtitle":
    "Ce que tu peux vraiment faire dans une semaine. Sans ça, le plan est composé pour quelqu’un d’autre.",
  "plan.cooking.summary_open": "Modifier",
  "plan.cooking.summary_edit": "Dis-moi",
  "plan.cooking.summary_close": "Fermer",
  "plan.cooking.time_label": "Temps par session de cuisine",
  "plan.cooking.time_15": "15 minutes — j’entre et je sors",
  "plan.cooking.time_30": "30 minutes",
  "plan.cooking.time_60": "Une heure, ça ne me dérange pas",
  "plan.cooking.difficulty_label": "Recettes",
  "plan.cooking.difficulty_simple": "Simples — peu d’étapes, peu de casseroles",
  "plan.cooking.difficulty_normal": "Normales",
  "plan.cooking.difficulty_keen": "J’aime cuisiner",
  "plan.cooking.variety_label": "Variété",
  "plan.cooking.variety_repeat": "Ça ne me gêne pas de remanger la même chose",
  "plan.cooking.variety_some": "Un peu de répétition, ça va",
  "plan.cooking.variety_varied": "Varie autant que possible",
  // « Budget » et « Normal » s'écrivent à l'identique en français, comme les
  // deux clés jumelles de `setup.plan.*`. Les deux autres paliers, eux,
  // diffèrent bien — c'est la preuve que la table est traduite, pas recopiée.
  "plan.cooking.budget_label": "Budget des courses",
  // ── ⛔ ICI VIVAIENT LES SIX CLÉS DE « COMMENT TU CUISINES CETTE SEMAINE »
  // Retirées le 2026-09-06 avec le champ et son composant
  // (`CookingShapeField.tsx`, supprimé). Elles disaient « Laisse le plan
  // décider » / « Un seul plat pour tout le monde » / « Une cuisson, des plats
  // un peu différents » / « Chacun le sien ».
  //
  // Motif, à l'écran: « il y a déjà "Comment voulez-vous cuisiner ?" donc
  // pourquoi c'est en double ? ». Les deux questions n'étaient pas la même — le
  // STYLE dit l'effort, la FORME disait la séparation des assiettes — mais les
  // deux s'annonçaient « comment on cuisine », et c'est ce qui a tranché.
  //
  // ⚠️ LE JETON, LUI, EXISTE TOUJOURS côté serveur: le style « le moins
  // possible » plafonne encore la forme (`styleCappedShape` →
  // `capCookingShape`). Ce qui est parti est la QUESTION, pas le mécanisme.
  // ── « TOUT DANS UNE SESSION DE CUISINE » (2026-09-01) ─────────────────
  // ⚠️ LE LIBELLÉ DIT LE GESTE, PAS LE RÉGLAGE. « Session unique » est du
  // vocabulaire de moteur; ce qui se passe dans la cuisine, c'est qu'on
  // cuisine une seule fois pour toute la période.
  "plan.cooking.one_session_label":
    "Tout cuisiner en une seule fois",
  // ⚠️ ELLE DIT LES DEUX MOITIÉS DU MARCHÉ. Sans « le surplus part au
  // congélateur », la case ressemble à un raccourci gratuit — et la personne
  // découvre devant son frigo qu'elle a sept jours de plats à congeler.
  "plan.cooking.one_session_hint": "Le surplus part au congélateur et se sort la veille.",
  // ⛔ ELLE DIT CE QUI MANQUE ET OÙ, jamais « indisponible ». Un refus qui ne
  // nomme pas sa condition se lit comme un bouton mort — cicatrice mesurée
  // trois fois sur l'écran de réglages.
  //
  // ⟳ 2026-09-04 — UN FRAGMENT DE PARENTHÈSE, plus une phrase. Il se rend
  // ENTRE PARENTHÈSES à côté du libellé (`CheckboxField#note`), et disparaît
  // dès que le congélateur est déclaré. Ce qu'il perd (« sans lui, un plat ne
  // tient que deux jours de plus ») est le POURQUOI; ce qu'il garde est ce que
  // le refus doit dire pour se lever: quoi cocher, et où.
  //
  // ⛔ PAS DE PARENTHÈSES DANS LA CHAÎNE, ni de majuscule, ni de point final.
  // Elles sont dans la markup: une chaîne qui les porterait se retrouverait un
  // jour au milieu d'une phrase qui n'en veut pas.
  "plan.cooking.one_session_needs_freezer": "nécessite de cocher le congélateur dans « Avec quoi tu cuisines »",
  "plan.cooking.time_minutes": "{n} min",
  "plan.cooking.time_hours": "{n} h",
  "plan.cooking.time_required": "Dis combien de temps peut durer une session.",
  "plan.cooking.budget_required":
    "Dis combien ce plan peut coûter. Sans chiffre, il n’y a rien à arbitrer.",
  // ── LE PLANCHER (2026-09-11) ─────────────────────────────────────────────
  // ⛔ LE REFUS DIT SON CHIFFRE. Sans le montant qui le lève, la personne
  // cherche par essais successifs, et le champ se lit comme un bouton mort.
  //
  // ⚠️ PAS DE SYMBOLE MONÉTAIRE DANS LA CHAÎNE: `{amount}` arrive déjà formaté,
  // et le champ juste au-dessus n'en porte pas non plus.
  "plan.cooking.budget_below_floor":
    "Ce budget ne peut pas acheter ce plan : il faut au moins {amount} pour " +
    "ces repas-là. En dessous, il n’y a pas de panier à composer.",
  // ⛔ CE N'EST PAS UN REFUS. La phrase dit ce qui va CHANGER, à quelqu'un dont
  // le budget est parfaitement recevable — jamais « mets-en plus ».
  "plan.cooking.budget_tight":
    "À ce budget, le plan ira surtout vers les légumes secs, les œufs et les " +
    "féculents, et des plats reviendront plus d’une fois.",
  "plan.cooking.save": "Enregistrer",
  "plan.cooking.saving": "Enregistrement…",
  "plan.cooking.saved": "Enregistré.",
  "plan.cooking.no_goal":
    "Règle d’abord ton objectif au-dessus — ça s’enregistre avec lui.",
  "plan.cooking.none_picked": "Pas encore réglé",

  "plan.told.title": "Ce que tu m’as dit sur ton alimentation et ta semaine",
  "plan.told.subtitle":
    "Repris de tes conversations — ce que tu aimes, et ce que ta semaine permet vraiment. Garde ce qui est juste, corrige-le, ou jette-le : ce que tu gardes sert quand ta semaine est composée.",
  "plan.told.suggested": "À garder ?",
  "plan.told.keep": "Garder",
  "plan.told.keep_like": "Garder : j’aime",
  "plan.told.keep_avoid": "Garder : à éviter",
  "plan.told.update": "Mettre à jour",
  "plan.told.replaces": "remplace",
  "plan.told.recheck_prefix": "Tu y es revenu le",
  "plan.told.recheck_suffix": "— toujours d’actualité ?",
  "plan.told.drop": "Pas juste",
  "plan.told.yours": "Anciennes notes — rangées ici, elles ne servent plus au plan",
  "plan.told.edit": "Corriger",
  "plan.told.remove": "Retirer",
  "plan.told.save": "Enregistrer",
  "plan.told.cancel": "Annuler",
  "plan.told.empty":
    "Rien pour l’instant. Dis-moi dans la conversation ce que tu aimes, ce que tu ne supportes pas, et quand ta semaine ne te laisse pas le temps de cuisiner — ça arrive ici.",
  "plan.told.no_goal":
    "Règle d’abord ton objectif au-dessus — ça s’enregistre avec lui.",
  "plan.told.saving": "Enregistrement…",
  "plan.told.open": "Modifier",
  "plan.told.close": "Fermer",
  "plan.told.summary_one": "1 chose que tu m’as dite",
  "plan.told.summary_many": "{count} choses que tu m’as dites",
  "plan.told.summary_pending": " · {count} en attente de toi",

  // ══════════════════════════════════════════════════════════════════════════
  // LOT 6 · `/app/plan` — L'ÉCRAN LUI-MÊME
  // ══════════════════════════════════════════════════════════════════════════
  "plan.page.title": "Mon plan",

  "plan.save": "Enregistrer",
  "plan.cancel": "Annuler",
  "plan.change": "Modifier",
  "plan.add": "Ajouter",
  "plan.busy": "…",

  "plan.about.title": "À propos de toi",
  "plan.about.setup": "Régler",
  "plan.about.done": "Terminé",
  "plan.about.empty":
    "Quatre questions courtes, une seule fenêtre. Ta semaine se compose à partir de tes réponses — rien ici n’est partagé avec ton coach.",
  "plan.about.numbers": "Chiffres",
  "plan.about.goal": "Objectif",
  "plan.about.day": "Ta journée",
  "plan.about.cooking": "Cuisine",
  "plan.about.last_request": "Dernier plan demandé",
  "plan.about.told": "Tu m’as dit",
  "plan.about.not_set": "Pas encore réglé",

  // ══════════════════════════════════════════════════════════════════════════
  // `/app/plan` ACCUEILLE LA DEMANDE DE PLAN — POUR TOUT LE MONDE
  // ══════════════════════════════════════════════════════════════════════════
  "plan.request.title": "Demander un plan",
  "plan.request.presence_title": "Qui mange à la maison",
  "plan.request.presence_open": "Modifier",
  // ⟳ 2026-09-16 — L'ÉTAT SE LIT SANS OUVRIR LA GRILLE. Le compte est celui
  // des MOMENTS écartés sur la fenêtre demandée, pas des jours.
  "plan.request.presence_all_home": "Là à tous les repas",
  "plan.request.presence_away_one": "{n} repas ailleurs",
  "plan.request.presence_away_other": "{n} repas ailleurs",
  // ⟳ 2026-09-23 — L'ABSENCE SUR TOUT LE PLAN (vacances, séjour ailleurs).
  // ⚠️ « Absence », le NOM, et pas « absent »: le libellé ne s'accorde avec
  // personne. Le geste écrit chaque jour de la fenêtre en « journée entière »
  // dans la colonne que « Modifier » édite déjà (`lib/presenceAbsence.ts`).
  "plan.request.presence_absence": "Absence",
  "plan.request.presence_absence_aria": "{name} : absence sur tout ce plan",
  "plan.request.presence_absence_undo": "Annuler l’absence",
  "plan.request.presence_absent": "Absence — hors de ce plan",
  // ⚠️ DIT PRÈS DU GESTE, pas seulement au retour du serveur
  // (`window_fully_away`, 409): sinon on compose, on attend, et on lit le refus.
  "plan.request.presence_everyone_away":
    "Personne n’est là sur ces dates : il n’y a rien à composer. Annule une absence ou change les dates.",
  // Le nom de la ligne du titulaire quand aucune ligne de foyer n'est lue.
  "plan.request.presence_you": "Toi",

  // ── L'ENVIE DE LA SEMAINE ───────────────────────────────────────────────
  // ⟳ 2026-09-16 — UN MOT, PLUS UNE PHRASE. Le titre reprenait la phrase de
  // l'utilisateur mot pour mot (« C'est la maison a envie de quoi ? »), gardée
  // exprès hors du français canonique. Remplacé sur SA demande, avec le reste
  // des libellés de l'écran: tous nominaux et courts, l'exemple vit dans le
  // placeholder. La décision est humaine, et elle est datée ici.
  "plan.envy.title": "Envies",
  // ⛔ `plan.envy.body` A ÉTÉ SUPPRIMÉE — 2026-09-08. Elle disait « une ligne,
  // pour tout le monde […] la laisser vide ne pose aucun problème »: deux
  // phrases pour dire que le champ est facultatif, au-dessus d'un champ qui
  // pouvait le dire lui-même.
  //
  // ⚠️ LE « FACULTATIF » N'EST PAS PERDU, IL A CHANGÉ DE PLACE: il ouvre le
  // placeholder, donc il se lit DANS le champ vide — là où la question se
  // pose — et il disparaît dès qu'on écrit, ce qu'une aide ne fait pas.
  "plan.envy.placeholder": "Facultatif — Léa veut des pâtes, Marc en a marre du poulet.",

  // ── QUELLE FAÇON DE MANGER LE PLAT COMMUN SUIT ──────────────────────────
  "plan.reference.title": "Quelle façon de manger le plat commun suit",
  // Le titre quand on sait qui s'oppose: il nomme les deux personnes, jamais
  // leur objectif. Voir la note longue côté anglais pour la raison du refus de
  // détailler les deux consignes de service.
  "plan.reference.title_pair":
    "{first} et {second} ne mangent pas de la même façon — le plat commun ne peut suivre qu’une des deux",
  "plan.reference.hint":
    "Quand deux adultes suivent ici des méthodes différentes, le plat commun ne peut en suivre qu’une. Choisis laquelle. Ça change ce qu’on cuisine, jamais la quantité que chacun reçoit — les parts sont calculées personne par personne dans les deux cas.",
  "plan.reference.default": "Celle de la personne qui compose cette semaine-là",
  "plan.reference.saved": "Enregistré.",

  // ── « À TABLE » ─────────────────────────────────────────────────────────
  "plan.table.title": "À table",
  "plan.table.standard": "Une part standard",

  // ── POURQUOI CES JOURS-LÀ ───────────────────────────────────────────────
  "plan.rationale.title": "Pourquoi ces jours-là",
  // ── LES CHOIX DU MODÈLE (2026-09-04) ─────────────────────────────────────
  // ⛔ « Les choix », pas « les explications »: le bloc dit ce qui a été
  // ARBITRÉ, pas ce qui a été fait. Et le titre nomme un auteur — les phrases
  // du bloc voisin sont celles de l'app, celles-ci sont celles du modèle, et un
  // lecteur doit pouvoir savoir qui parle.
  "plan.explanation.title": "Les choix de Sophia",

  // ── LE BROUILLON ────────────────────────────────────────────────────────
  "plan.draft.cta": "Prévisualiser",
  "plan.draft.working": "Composition d’un aperçu…",
  // ── LOT B (2026-09-15) · L'AVANCEMENT RÉEL, LU DANS LA LIGNE ─────────────
  // Une phrase par stade écrit par le worker (`stage`), plus le temps écoulé.
  // Avant : huit phrases sur une minuterie, la dernière figée quatre minutes.
  "plan.progress.composing": "Le modèle compose les repas…",
  "plan.progress.checking": "On vérifie chaque assiette…",
  "plan.progress.repairing": "On corrige ce qui ne tenait pas…",
  "plan.progress.writing": "On range le plan…",
  "plan.progress.relaunched": "Relancée une fois — la première s’est arrêtée en route.",
  "plan.progress.elapsed": "{time} écoulées",
  // ⟳ 2026-09-21 — L'ÉCRAN D'ATTENTE (`PlanComposingCard`): le stade réel, le
  // temps écoulé, l'ordre de grandeur mesuré sur les runs du jour.
  "plan.composing.title": "Ton plan se compose",
  "plan.composing.waiting": "Ça démarre…",
  "plan.composing.steps": "Étapes de la composition",
  "plan.composing.step_composing": "Composer",
  "plan.composing.step_checking": "Vérifier",
  "plan.composing.step_repairing": "Corriger",
  "plan.composing.step_writing": "Ranger",
  "plan.composing.eta": "En moyenne 2 à 3 minutes.",
  "plan.composing.keeps_current": "Ton plan actuel reste en place jusqu’à ce que tu adoptes le nouveau.",
  // ── LOT D · LE RETOUR DE FIN DE PLAN ────────────────────────────────────
  // Les libellés des QUESTIONS ne sont pas ici: ils vivent dans
  // `_shared/keel/plan_feedback.ts`, dans les deux langues, avec leur lecteur
  // nommé à côté. Ce qui est ici est le chrome de l'écran.
  "plan.feedback.title": "Ce plan est fini",
  "plan.feedback.intro":
    "Deux ou trois choses sur le plan lui-même — ce qu’il t’a demandé, pas ce " +
    "que tu en as fait. Rien n’est obligatoire.",
  "plan.feedback.dishes_title": "Les plats qu’il portait",
  "plan.feedback.dishes_hint":
    "Marque ceux qui valent le coup d’être revus, et ceux à laisser de côté.",
  "plan.feedback.again": "Encore",
  "plan.feedback.not_again": "Sans moi",
  "plan.feedback.envy_title": "Une envie pour la suite",
  "plan.feedback.envy_hint":
    "Une ligne, pour toute la table. Elle part dans le plan de la semaine " +
    "prochaine.",
  "plan.feedback.envy_placeholder": "Léa veut des pâtes, Marc en a marre du poulet",
  "plan.feedback.anything_else_placeholder":
    "Léa a danse le mardi, on mange tard le vendredi",
  "plan.feedback.send": "Envoyer",
  "plan.feedback.sending": "Envoi…",
  "plan.feedback.dismiss": "Pas maintenant",
  "plan.draft.title": "Ce que ça donnerait",
  // ⛔ 2026-09-20 — RETIRÉES AVEC LE TITRE DU BLOC, sur demande (aucun lecteur):
  //   · plan.draft.note_label « Ce qui ne va pas »
  //   · plan.draft.note_hint  « Une phrase suffit. Ce qu'elle dit est retenu… »
  // La zone d'écriture ne s'ouvre plus que sur « Ajuster le plan »: ce que ces
  // deux lignes annonçaient est porté par le geste qui les remplace.
  // ⟳ 2026-09-08 — LA PHRASE EST RETENUE, ET ON LE DIT. Depuis que lire c'est
  // appliquer (goût, appétit, réglage, régime), « elle n'est pas enregistrée »
  // était faux. Et l'exemple ne promet que ce que le champ sait faire : « rien
  // le jeudi soir » (une fenêtre) tombait en `skipped`.
  "plan.draft.note_placeholder": "Trop de poisson, et plus de pâtes pour les enfants.",
  // ⟳ 2026-09-21 — UNE SEULE CLÉ POUR LES DEUX TEMPS DU GESTE. Le bouton
  // fermé OUVRE la zone d'écriture; le bouton au bout du champ l'ENVOIE. Ils
  // ne sont jamais à l'écran en même temps, donc le même mot les porte.
  // `note_send` (« Valider ») a été retirée: posée à côté de « Remplacer mon
  // plan par celui-ci », elle faisait deux mots de validation pour deux
  // effets différents.
  "plan.draft.remix": "Ajuster le plan",
  "plan.draft.adopt": "Adopter ce plan",
  // ⟳ 2026-09-21 — quand l'aperçu remplace un plan en cours.
  "plan.draft.adopt_replace": "Remplacer mon plan par celui-ci",
  "plan.draft.adopting": "Enregistrement…",
  "plan.draft.discard": "Laisser tomber",
  // ⟳ 2026-09-20 — RETIRÉES DE L'ÉCRAN, SUR DEMANDE (aucun lecteur):
  //   · plan.draft.not_saved        « Rien n’est encore enregistré. »
  //   · plan.draft.adopt_recomposes « Adopter revalide cet aperçu… »
  // Les deux ouvraient la fenêtre d'aperçu sur du contrat avant le plan. Ce
  // qu'elles disaient reste vrai du code (`intent: "draft"` n'écrit rien, et
  // l'adoption rejoue le payload rangé sans recomposer) — on ne l'écrit plus.
  // ⟳ 2026-09-10 · LOT 7 — voir la note d'`en.ts`: elle dit qui compose, et
  // elle ne fait attendre personne.
  "plan.draft.owner_composes":
    "C’est la personne qui tient le foyer qui compose la semaine. Ta part est juste en dessous, avec ce que tu manges et en quelle quantité.",
  "plan.draft.note_too_long": "Trop long. Dis-le en une phrase.",
  "plan.draft.note_rejected":
    "Je ne peux pas repartir de cette phrase-là. Reformule ce que tu veux changer dans le plan.",
  "plan.draft.turns_left": "Encore {count} reprises possibles",
  "plan.draft.turns_one": "Une seule reprise possible — elle compte.",
  "plan.draft.turns_none": "Plus de reprise. C’est l’aperçu que tu as.",
  "plan.draft.chars_left": "Encore {count} signes",
  "plan.draft.note_partial":
    "Une partie de ce que tu as écrit n’a pas été reprise. Le reste, si.",
  "plan.draft.note_applied": "J’ai noté :",
  "plan.draft.note_nothing":
    "Je n’ai rien trouvé à changer dans ta phrase. Le plan est refait tel quel.",
  "plan.draft.note_who_unknown":
    "Je n’ai pas compris de qui tu parles, donc je n’ai rien changé. Nomme la personne.",
  // ⟳ lot 4 — la question du serveur, SOUS le champ. On cite le morceau sur
  // lequel il a buté, jamais la note entière; l'échappatoire n'écrit rien.
  "plan.draft.question_who": "Tu as écrit « {text} » — c’est pour qui ?",
  "plan.draft.question_none": "Personne de la liste",
  "plan.draft.question_skipped": "D’accord, je n’ai rien changé pour cette phrase-là.",
  // ⟳ 2026-09-24 — LES QUESTIONS EN COUCHE, et « REMPLACER » UN PLAT.
  "plan.draft.questions_title": "Avant de refaire le plan",
  "plan.draft.questions_continue": "Continuer",
  "plan.draft.replace_title": "Pourquoi changer ce plat ?",
  "plan.draft.replace_label": "Ta raison (obligatoire)",
  "plan.draft.replace_placeholder": "Ex. : trop sucré, Paul n’aime pas les champignons, trop long à préparer…",
  "plan.draft.replace_cancel": "Annuler",
  "plan.draft.replace_confirm": "Valider",
  "plan.draft.struck_one": "1 plat à changer",
  "plan.draft.struck_many": "{count} plats à changer",
  "plan.draft.struck_cap": "{max} plats au plus d’un coup : ajuste d’abord ceux-là.",
  "plan.draft.dishes_replaced_one": "J’ai changé 1 plat ; le reste est identique ({kept} plats gardés tels quels).",
  "plan.draft.dishes_replaced_many": "J’ai changé {count} plats ; le reste est identique ({kept} plats gardés tels quels).",
  "plan.draft.dishes_extended_one": "J’ai aussi refait {dishes} : il contenait un aliment que tu viens d’écarter.",
  "plan.draft.dishes_extended_many": "J’ai aussi refait {dishes} : ils contenaient un aliment que tu viens d’écarter.",
  "plan.draft.dishes_not_replaced": "Certains plats n’ont pas pu être changés cette fois ({count}) : ils sont restés tels quels.",
  "plan.draft.rejected_filed_one": "Ce plat est rangé dans tes plats refusés (« Ce que Sophia sait de toi »).",
  "plan.draft.rejected_filed_many": "Ces {count} plats sont rangés dans tes plats refusés (« Ce que Sophia sait de toi »).",
  "plan.draft.safety_not_written":
    "Je n’ai pas pu l’enregistrer dans la fiche : {lines}. Ajoute-le depuis la fiche du foyer.",
  "plan.draft.cells_applied":
    "J’ai refait {cells} ; le reste est identique ({count} plats gardés tels quels).",
  "plan.draft.note_at_edge": "Compris — mais c’est déjà au bout de l’échelle, il n’y a plus de cran à déplacer.",
  "plan.draft.note_skipped": "J’ai lu, mais ça, je ne sais pas encore le régler d’ici. Le plan est refait tel quel.",

  // ── LA PART DU RÉCLAMÉ ──────────────────────────────────────────────────
  "plan.mine.title": "Ta part",
  "plan.mine.standard": "Une part standard",
  "plan.mine.request_change": "Demander une modif",
  "plan.mine.change_label": "Ce que tu voudrais changer",
  "plan.mine.change_sent": "C’est parti au foyer.",
  "plan.mine.household_dishes": "Ce que la maison cuisine",


  "plan.section.basics.title": "Informations de base",
  "plan.section.basics.intro":
    "Qui tu es et où tu en es. Ça sert à dimensionner tes portions.",
  "plan.section.goal.title": "Ton objectif",
  "plan.section.goal.intro":
    "Ce que tu cherches. Ça décide ce que ton plan met en avant pour toi.",
  // ── ⟳ LOT 5 · LES CHIFFRES (voir en.ts pour les deux arbitrages de ton) ──
  "plan.section.numbers.title": "Ce que ton plan affiche",
  "plan.section.numbers.intro":
    "Si ton plan montre ce qu’il totalise — calculé depuis ses quantités, jamais deviné.",
  "plan.section.day.title": "Comment se passe ta journée",
  "plan.section.day.intro":
    "Coche les moments où tu manges vraiment. Rien que tu n’aies nommé, et aucun des tiens écarté.",
  "plan.section.cooking.title": "Comment tu cuisines",
  "plan.section.cooking.intro":
    "Quels jours tu peux cuisiner, et combien de temps. Tes sessions se construisent là-dessus.",
  "plan.section.told.title": "Ce que tu m’as dit",
  "plan.section.told.intro":
    "Repris de tes conversations. Garde ce qui est juste, corrige-le, ou jette-le.",

  // Les jetons restent anglais (R1) ; seuls ces mots-ci se traduisent.
  // « Perdre du poids » et pas « perdre du gras » : le second demande de savoir
  // ce qu’on perd, ce que personne ne sait avant de commencer.
  "plan.goal.fat_loss.label": "Perdre du poids",
  "plan.goal.fat_loss.blurb":
    "Tu veux voir la balance descendre — sans que la semaine devienne invivable.",
  "plan.goal.muscle_gain.label": "Prendre du muscle",
  "plan.goal.muscle_gain.blurb":
    "Tu veux prendre, volontairement, et surtout du muscle.",
  // ── LES TROIS RETIRÉS, ET OÙ EST LEUR RAISON ──────────────────────────
  // `recomposition`, `performance` et `health` avaient leur libellé ici. Le
  // socle les a retirés le 2026-08-18 (`GOAL_TOKENS`, `RETIRED_GOAL_TOKENS`
  // dans `_shared/keel/tokens.ts`, qui porte le pourquoi et le repli sur
  // `maintenance`); leurs clés sont parties le 2026-09-11. Rien ne peut plus
  // les demander: les lecteurs bouclent sur `GOAL_TOKENS`, pas sur une liste
  // écrite à côté.
  "plan.goal.maintenance.label": "Garder ce que j’ai",
  "plan.goal.maintenance.blurb":
    "Tu es là où tu veux être. Reste-y, avec la charge la plus légère possible.",
  "plan.goal.legend": "Ce que tu cherches",

  "plan.goal.target_weight": "Le poids que je vise",
  "plan.goal.target_waist": "Le tour de taille que je vise",
  "plan.goal.target_band": "Le poids autour duquel je veux rester",
  "plan.goal.optional": "facultatif",
  "plan.goal.target_hint": "Il donne la direction sur laquelle tes portions sont calibrées. Ce n’est pas une échéance, et personne n’est noté là-dessus.",
  "plan.goal.axis_label": "La chose que je veux voir s’améliorer",
  "plan.goal.axis_none": "Rien en particulier",
  "plan.goal.axis_hint":
    "L’un des six que tu notes le dimanche — rien de plus à remplir.",
  "plan.goal.axis_unrated": "Rien de noté pour l’instant — tu le règles au point du dimanche.",
  "plan.goal.axis_last_sunday": "Dimanche dernier : {value} sur 5.",
  "plan.goal.axis_rising": "{axis} remonte — et c’est celui que tu as choisi.",
  "plan.goal.axis_falling": "{axis} baisse.",
  "plan.goal.axis_steady": "{axis} se maintient.",
  // L'étiquette d'axe porte déjà son article (« La qualité du sommeil »), donc
  // la phrase se construit avec « sur » et non avec un article de plus.
  "plan.goal.working_on": "tu travailles sur {axis}",
  "plan.goal.own_words": "Avec tes mots",
  "plan.goal.own_words_placeholder": "Jouer au foot avec mes enfants sans être détruit",
  "plan.goal.own_words_hint":
    "Facultatif. Pourquoi ça compte pour toi — ça vaut mieux qu’un chiffre.",

  "plan.measures.height": "Taille",
  "plan.measures.age": "Âge",
  "plan.measures.sex": "Sexe",
  "plan.measures.weight": "Poids",
  "plan.measures.waist": "Tour de taille",
  "plan.measures.target": "Cible",
  "plan.gender.female": "Femme",
  "plan.gender.male": "Homme",
  "plan.gender.other": "Autre",
  "plan.measures.week_of": "semaine du {date}",
  "plan.measures.since_sunday":
    "Tu t’es pesé depuis dimanche ? Ça va au même endroit que ton point du dimanche.",
  "plan.measures.none_yet":
    "Aucun poids enregistré pour l’instant. Ajoutes-en un ci-dessus, ou au point du dimanche.",
  "plan.measures.one_more":
    "Une saisie de plus et ça pourra montrer une direction — une mesure isolée n’est qu’un chiffre.",
  "plan.measures.band_unset":
    "Indique le poids autour duquel tu veux rester, et ça te dira quand tu t’en éloignes.",
  "plan.measures.weeks_in_range_one": "{count} semaine dans ta fourchette.",
  "plan.measures.weeks_in_range_many": "{count} semaines dans ta fourchette.",
  "plan.measures.drifted": "Tu es sorti de ta fourchette.",
  "plan.measures.week_by_week": "Semaine par semaine",
  "plan.measures.col_week": "Semaine",
  "plan.measures.col_change": "Écart",

  // Un couple par mesure ET par tendance : en français le verbe dépend de ce
  // qu'il décrit, et un adjectif interpolé demanderait un accord.
  "plan.trend.weight.rising": "ton poids monte",
  "plan.trend.weight.falling": "ton poids descend",
  "plan.trend.weight.stable": "ton poids se maintient",
  "plan.trend.waist.rising": "ton tour de taille augmente",
  "plan.trend.waist.falling": "ton tour de taille diminue",
  "plan.trend.waist.stable": "ton tour de taille se maintient",
  "plan.trend.and": " et ",
  "plan.trend.asked_for": "{observed} — c’est exactement ce que cet objectif demande.",

  "plan.summary.aiming_weight": "vise {value} kg",
  "plan.summary.aiming_waist": "vise {value} cm",
  "plan.summary.staying_around": "reste autour de {value} kg",
  "plan.summary.quoted": "« {text} »",
  "plan.summary.kept_one": "{count} chose gardée",
  "plan.summary.kept_many": "{count} choses gardées",

  "plan.input.numbers_only": "{field} : des chiffres uniquement.",
  "plan.input.out_of_range": "{field} : attendu entre {min} et {max}.",
  "plan.error.birth_date": "Cette date de naissance n’a pas l’air juste.",
  "plan.error.unknown_value": "Valeur inconnue.",
  "plan.error.no_profile": "Rien n’a été enregistré — ton profil est introuvable.",
  "plan.error.nothing_to_save":
    "Rien à enregistrer — indique un poids ou un tour de taille.",
  "plan.error.could_not_save": "enregistrement impossible",
  "plan.error.load": "Impossible de charger ta semaine.",
  "plan.error.failed": "Ça n’est pas passé.",
  // ⟳ 2026-09-04 — LA JOURNÉE DÉJÀ ENTAMÉE.
  //
  // ⛔ ELLE DIT LES DEUX FAITS, et le second est le plus important: le plan
  // commence demain ET il couvre un jour de moins que demandé. Ne dire que le
  // premier laisserait croire qu'on a décalé les trois jours, alors qu'on en a
  // retiré un.
  //
  // ⛔ ELLE NE DIT JAMAIS « TU N'ÉTAIS PAS LÀ ». Le serveur sépare exprès les
  // moments passés des absences déclarées pour que cette phrase ne puisse pas
  // reprocher une absence à quelqu'un qui n'a rien déclaré.
  //
  // RETIRÉES PAR CE LOT (la case « je cuisine la veille » n'existe plus, et
  // `CookDayBeforeField.tsx` est supprimé — vérifié appelant par appelant):
  //   · plan.cooking.day_before_label
  //   · plan.cooking.day_before_hint
  //   · plan.cooking.day_before_starts_today
  //   · plan.cooking.day_before_no_room
  //
  // ── A2 · LE STYLE DE CUISINE ET LE NOMBRE DE COURSES (P2) ────────────────
  // Les libellés portent la CONSÉQUENCE, pas le jargon. La troisième option
  // reprend MOT POUR MOT `plan.cooking.difficulty_keen`, qui existait déjà et
  // disait la bonne chose — en inventer une variante ferait deux phrases pour
  // une même idée, dans le même écran.
  "plan.cooking.style_label": "Comment tu cuisines",
  "plan.cooking.style_unset": "Pas encore répondu",
  "plan.cooking.style_minimal": "Le moins possible — je réchauffe",
  "plan.cooking.style_balanced": "Un juste milieu",
  "plan.cooking.style_keen": "J'aime cuisiner",
  "plan.cooking.runs_label": "Courses",
  "plan.cooking.runs_unset": "Pas encore répondu",
  // ⚠️ « Peu importe » EST UNE RÉPONSE, et le libellé doit le faire sentir
  // face à « Pas encore répondu » juste au-dessus. Le second membre dit ce
  // que ça DÉCLENCHE, sinon les deux se lisent comme deux façons de ne pas
  // répondre — et c'est très exactement la confusion que le code évite en
  // gardant deux lecteurs séparés.
  "plan.cooking.runs_any": "Peu importe — le plan décide",
  "plan.cooking.runs_one": "Une fois",
  "plan.cooking.runs_two": "Deux fois",
  "plan.cooking.runs_three": "Trois fois",
  // ── L'OFFRE (2026-09-04) — CE QU'ON NE PROPOSE PAS, ET POURQUOI ───────
  // ⛔ CHAQUE PHRASE EST UN MOTIF, JAMAIS « indisponible ». Une option qui
  // disparaît sans raison se lit comme une panne, et la personne cherche le
  // réglage manquant dans le mauvais écran.
  //
  // ⚠️ LES DEUX PREMIÈRES REMPLACENT LE CONTRÔLE, elles ne l'accompagnent pas:
  // quand il n'y a qu'une réponse possible, il n'y a plus de question — on DIT
  // ce qui va se passer. Les deux suivantes s'affichent SOUS la liste courte,
  // à la place de l'aide générale.
  //
  // ⚠️ UN SEUL NOMBRE EST ÉCRIT EN TOUTES LETTRES dans tout ce bloc — le
  // « Deux » de `runs_capped_days` —, et un test tient qu'il ne sort que
  // lorsqu'il reste exactement deux cadences. Tous les autres sont interpolés
  // ou absents: un plafond de moteur recopié dans une phrase est un mensonge
  // qui attend qu'on retouche la constante.
  "plan.cooking.runs_only_one_session":
    "Une seule course : tu cuisines tout en une seule fois.",
  // ⟳ 2026-09-04 (soir) — CES DEUX PHRASES DISAIENT LE MAUVAIS PLAFOND. Elles
  // comptaient les JOURS (« ce plan ne couvre que deux jours »), c'est-à-dire
  // combien de courses TIENNENT dans la fenêtre. La vraie question est combien
  // il en FAUT, et c'est la conservation qui tranche: un lot couvre trois
  // jours. Deux jours ⇒ UNE course, et l'écran en proposait deux.
  "plan.cooking.runs_only_one_batch":
    "Une seule course : ce que tu cuisines au départ tient jusqu'à la fin de " +
    "ce plan.",
  // ⚠️ « DEUX » EST LE SEUL NOMBRE ÉCRIT ICI, et il est tenu par un test: ce
  // motif ne sort QUE lorsqu'il reste exactement deux cadences. Les deux
  // autres nombres sont interpolés — la conservation est un paramètre, pas une
  // constante de ce module.
  "plan.cooking.runs_capped_days":
    "Deux courses suffisent pour {n} jours : un plat cuisiné en tient {d}.",
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-04 (soir) — ELLE COMPTAIT AU LIEU D'EXPLIQUER.
  // ══════════════════════════════════════════════════════════════════════
  //
  // Elle disait « le plan ne cuisine pas trois fois : une troisième course
  // n'aurait rien à acheter ». Le nombre n'intéresse personne — ce qui manque
  // à la personne, c'est de savoir CE QU'EST une session de cuisine, parce que
  // c'est l'unité sur laquelle toute la question repose. Elle ne l'a jamais
  // été dite nulle part dans cet écran.
  //
  // ⛔ ELLE NE CITE PLUS AUCUN NOMBRE, ET C'EST VOULU: le seul qui comptait
  // (« trois ») était le plafond du style, une valeur de moteur. La phrase dit
  // maintenant le MÉCANISME — cuisiner d'avance, une course par session —, et
  // elle reste vraie quel que soit le plafond.
  //
  // ⚠️ ELLE NOMME LA RÉPONSE CHOISIE, mot pour mot le libellé de l'option
  // (`plan.cooking.style_minimal`). Un test tient cette jointure: le jour où
  // l'option est renommée, la phrase qui la cite ne doit pas rester seule avec
  // l'ancien mot.
  "plan.cooking.runs_capped_style":
    "Une session de cuisine, c'est un moment où tu cuisines plusieurs jours " +
    "d'avance — et chacune commence par des courses. Avec « le moins " +
    "possible », le plan en pose moins, donc il y a moins de passages au " +
    "magasin.",
  // ⟳ 2026-09-24 — SANS CONGÉLATEUR, « UNE FOIS » N'EST PLUS PROPOSÉE au-delà
  // de ce qu'un plat cuisiné tient au frigo (décision produit). La phrase
  // remplace le contrôle quand il ne reste qu'une cadence, et s'affiche sous
  // la liste sinon. Elle ne cite aucun nombre de courses: seulement les deux
  // nombres que la personne compare (les jours du plan, la conservation), et
  // où lever le refus — mot pour mot le titre de la carte (`setup.equipment.title`).
  "plan.cooking.runs_needs_freezer":
    "Sans congélateur, il faut repasser au magasin en cours de plan : un plat " +
    "cuisiné se garde {d} jours au frigo, et ce plan en compte {n}. Pour tout " +
    "acheter en une fois, coche le congélateur dans « Avec quoi tu cuisines ».",
  "plan.request.equipment_required":
    "À renseigner avant de lancer le plan : coche au moins ce que tu as.",

  //
  // A8.3 — LE LECTEUR DU RESTE. Voir le bloc jumeau d'`en.ts` pour le motif des
  // deux clés: la personne concernée change la phrase.
  "plan.box.still_fridge": "Ta boîte de {day}, encore au frigo",
  "plan.box.still_fridge_named": "{name} — boîte de {day}, encore au frigo",
} satisfies TranslatedMessagesOf<"plan">;
