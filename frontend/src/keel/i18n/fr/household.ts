// Pack français — le namespace `household`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `household.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frHousehold = {
  // ══ LE FOYER (`household.*`) ═════════════════════════════════════════════
  //
  // ⚠️ CE NAMESPACE ENTRE DANS LE PÉRIMÈTRE PAR UN EMPRUNT DE CINQ CLÉS.
  // `SetupPage.tsx` appelle `household.invite.error.bad_email`,
  // `household.invite.link_ready`, `household.me.unlock`,
  // `household.member.birth_date_kept` et `household.member.save`. La frontière
  // étant à la maille du namespace, l'onboarding tire les 178 clés avec lui.
  //
  // Sa page principale, `/app/household`, reste ANGLAISE malgré ça: elle monte
  // `KeelAppShell`, dont les trois namespaces ne sont pas traduits. Ce n'est pas
  // du travail perdu — c'est la moitié d'un écran, prête pour le lot qui prendra
  // le shell.
  //
  // ── LE VOCABULAIRE, ET LES MOTS QU'ON N'EMPLOIE PAS ──────────────────────
  // « part » et jamais « portion » pour ce que quelqu'un reçoit dans l'assiette:
  // « portion » est le mot de l'unité de mesure (`serving`), et le produit tient
  // les deux séparés. « direction » et jamais « objectif »: un objectif se rate,
  // une direction se suit — c'est tout le propos de « personne ne te note ».
  "household.title": "Ton foyer",
  "household.empty.title": "Cuisiner une fois, pour tout le monde",
  "household.empty.body":
    "Ajoute les personnes pour qui tu cuisines. Une seule session de cuisine, et des parts qui suivent la direction de chacun.",
  "household.create.name": "Tu l’appelles comment ?",
  "household.create.submit": "Créer le foyer",
  // ⟳ 2026-09-09 — UNE SEULE SECTION POUR LES GENS DU FOYER. Ce titre coiffait
  // la liste seule, sous deux autres cartes titrées (« ta fiche », « ajouter
  // quelqu'un »): trois en-têtes pour un seul sujet, dont le premier répétait
  // le troisième. Il les coiffe maintenant tous les trois, et il NOMME ce qu'on
  // regarde — des personnes — au lieu de poser une question.
  "household.members.title": "Les membres du foyer",
  "household.members.owner": "Tient le foyer",
  "household.members.child": "Enfant",
  "household.me.unlock":
    "Ta direction est aussi ce qui nous permet de composer pour le foyer. Une minute maintenant, et le plan est disponible.",
  "household.me.open": "Compléter ma fiche",
  "household.member.first_name": "Prénom",
  "household.member.first_name_hint": "C’est ainsi que le plan nommera sa part.",
  "household.member.birth_date": "Date de naissance",
  "household.member.birth_date_hint":
    "Facultatif. Tant qu’on ne l’a pas, cette personne reçoit une part standard — une direction ne s’applique qu’à un âge connu.",
  "household.member.birth_date_kept":
    "Déjà enregistrée. Laisse ce champ vide pour la garder, ou choisis une nouvelle date pour la remplacer.",
  "household.member.birth_date_mine":
    "La même date que dans ton À propos de toi — la remplir ici la remplit là-bas. Facultatif, et tant qu’on ne l’a pas tu reçois une part standard : une direction ne s’applique qu’à un âge connu.",
  "household.member.goal": "Sa direction",
  "household.member.goal_mine": "Ta direction",
  "household.member.goal_inactive":
    "Enregistrée, et pas encore appliquée : une direction a besoin d’un âge. Ajoute sa date de naissance au-dessus.",
  "household.member.goal_from_profile":
    "Chacun la pose depuis son propre compte — elle le suit partout, pas seulement à cette table.",
  "household.member.save": "Enregistrer",
  "household.member.saved": "Enregistré.",
  "household.member.edit": "Modifier",
  "household.member.remove": "Retirer du foyer",
  "household.member.detach": "Retirer son accès",
  "household.member.detach_hint":
    "Retirer son accès la déconnecte de ce foyer — elle reste à table, avec sa part et ses allergies. La retirer du foyer efface tout.",
  "household.member.remove_hint":
    "Ça efface sa part, ses allergies et ce que cette maison ne lui sert pas.",
  // FF-066 lot 4 (2026-09-23) — la confirmation en deux temps que le code
  // promettait et ne faisait pas: un clic effaçait la ligne.
  "household.member.remove_confirm": "Retirer définitivement ? Il n’y a pas de retour en arrière.",
  "household.member.remove_confirm_yes": "Oui, retirer du foyer",
  "household.member.remove_cancel": "Annuler",
  "household.away.title": "Quand elle mange ailleurs",
  "household.away.hint":
    "Décoche les repas qu’elle ne prendra pas ici. Rien n’est annulé pour les autres — on cuisine simplement pour une personne de moins ce jour-là.",
  "household.away.open": "Indiquer ses absences",
  "household.away.open_count": "Absente sur {n} repas — modifier",
  "household.away.self_declared": "Elle nous l’a déjà signalé elle-même : {days}.",
  // Les trois directions, en libellé. Forme nominale pour toutes: ce sont des
  // étiquettes dans une liste déroulante, pas des phrases.
  "household.goal.fat_loss": "Perte de masse grasse",
  "household.goal.muscle_gain": "Prise de muscle",
  "household.goal.maintenance": "Maintien",
  "household.add.title": "Ajouter quelqu’un qui mange ici",
  "household.add.submit": "L’ajouter",
  "household.add.full":
    "Huit, c’est le maximum d’un foyer. Chaque bouche est une part de plus à composer à chaque génération.",
  "household.habits.title": "Ce qu’elle mange d’habitude",
  "household.habits.hint":
    "Certaines personnes prennent toujours la même chose à un moment donné, quoi que la maison cuisine. Le dire garde ce plat hors de leur assiette — et garde leur habitude sur la liste de courses.",
  "household.habits.open": "Renseigner ses habitudes",
  "household.habits.close": "Fermer",
  "household.habits.loading": "Lecture de ses habitudes…",
  "household.habits.choice_household_dish": "Elle mange ce que la maison cuisine",
  "household.habits.choice_own_usual": "Elle a son habitude à elle",
  "household.habits.usual_label": "Ce qu’elle prend",
  "household.habits.usual_placeholder": "une pomme",
  "household.habits.usual_missing": "Dis en quelques mots ce que c’est.",
  "household.habits.note_label": "Autre chose à savoir",
  "household.habits.note_hint":
    "Une ligne, gardée pour de bon, relue à chaque fois qu’on cuisine. Goûts, textures, ce à quoi elle ne touche jamais.",
  "household.habits.note_placeholder": "Ne mange rien de réchauffé.",
  "household.habits.no_slots": "Aucun moment de repas n’est encore posé pour cette personne.",
  "household.habits.save": "Enregistrer",
  "household.habits.saved": "Enregistré.",
  "household.body.title": "Quelle part lui servir",
  "household.body.hint":
    "Une paume de poulet n’est pas la même paume chez un enfant de six ans et chez un adulte. On s’en sert pour calculer quelle quantité du même plat va dans chaque assiette — rien d’autre. Ce n’est jamais affiché à table, jamais dit à voix haute, et jamais transformé en objectif.",
  "household.body.height": "Taille (cm)",
  "household.body.weight": "Poids (kg)",
  "household.body.gender": "Sexe",
  "household.body.gender_female": "Femme",
  "household.body.gender_male": "Homme",
  "household.body.gender_other": "Autre",
  "household.body.save": "Enregistrer",
  "household.body.saved": "Enregistré.",
  "household.body.missing":
    "On ne l’a pas encore — d’ici là, cette personne reçoit une part standard de ce que la maison cuisine.",
  "household.body.needs_birth_date":
    "Ajoute aussi sa date de naissance au-dessus : ce dont un enfant en croissance a besoin ne se calcule pas comme pour un adulte.",
  "household.error.body_incomplete":
    "Il nous faut les trois — taille, poids et sexe. Deux sur trois ne permettent pas de dimensionner une assiette.",
  "household.error.bad_height": "Cette taille n’est pas exploitable.",
  "household.error.bad_weight": "Ce poids n’est pas exploitable.",
  "household.error.bad_gender": "Ce n’est pas une des options.",
  // L5-B (2026-08-18). Voir la note du pack anglais.
  "household.error.bad_day_activity":
    "Cette réponse sur la journée ne fait pas partie de celles qu'on connaît. Choisis parmi les trois.",
  "household.error.bad_sport_frequency":
    "Cette réponse sur le sport ne fait pas partie de celles qu'on connaît. Choisis parmi les quatre.",
  "household.error.bad_appetite":
    "Cette réponse sur l'appétit ne fait pas partie de celles qu'on connaît. Choisis parmi les trois.",
  "household.error.bad_weekday": "Ce n'est pas un jour de la semaine.",
  "household.error.bad_slot": "Ce n'est pas un repas sur lequel on peut poser une habitude.",
  "household.error.empty_label":
    "Dis-nous ce que c'est, dans tes mots — un libellé vide correspondrait à n'importe quel plat.",
  "household.error.label_too_long": "Soixante caractères au maximum.",
  "household.error.too_many_traditions":
    "Trois jours fixes, c'est le maximum. Retires-en un pour en ajouter un autre.",
  "household.error.bad_activity_level":
    "Ce n’est pas une des quatre réponses proposées.",
  // ⚠️ REMPLACÉES PAR `plan.reference.*`, gardées le temps que leur lecteur
  // bouge — retirer une clé avant son lecteur ne compile pas.
  "household.reference.title": "Quelle façon de manger le plat commun suit",
  "household.reference.hint":
    "Quand deux adultes suivent ici des méthodes différentes, le plat commun ne peut en suivre qu’une. Choisis laquelle. Ça change ce qu’on cuisine, jamais la quantité que chacun reçoit — les parts sont calculées personne par personne dans les deux cas.",
  "household.reference.default": "Celle de la personne qui compose cette semaine-là",
  "household.reference.saved": "Enregistré.",
  "household.error.minor_cannot_be_reference":
    "Le plat commun suit la méthode d’un adulte, pas celle d’un enfant.",
  "household.error.age_unknown_cannot_be_reference":
    "Ajoute d’abord sa date de naissance — sans elle, on ne sait pas s’il s’agit d’un adulte.",
  "household.error.not_your_household": "Ce n’est pas ton foyer.",
  "household.error.bad_first_name": "Un prénom fait entre 1 et 40 caractères.",
  "household.error.bad_birth_date": "Cette date est dans le futur.",
  "household.error.bad_goal": "Cette direction ne fait pas partie de celles qu’on connaît.",
  "household.error.bad_label": "C’est vide, ou trop long (120 caractères).",
  "household.error.bad_away": "On n’a pas su lire ces jours.",
  "household.error.bad_work_lunch": "On n’a pas su lire cette réponse.",
  "household.error.not_adult":
    "Cette question ne se pose qu’aux majeurs, et c’est la date de naissance " +
    "qui le dit. Renseigne-la au-dessus, et elle pourra être répondue.",
  "household.error.too_many_away":
    "Il y a déjà trop de jours marqués pour cette personne. Libères-en " +
    "quelques-uns dans la grille d’abord.",
  "household.error.bad_slots":
    "On n’a pas su lire ces habitudes. Chaque moment marqué « son habitude à elle » demande quelques mots.",
  "household.error.bad_note": "Cette note est vide, ou trop longue (280 caractères).",
  "household.error.household_full":
    "Huit, c’est le maximum d’un foyer. Retire d’abord quelqu’un.",
  "household.error.not_owner": "Seule la personne qui tient le foyer peut faire ça.",
  "household.error.not_a_minor":
    "Une règle de maison ne se pose que pour un enfant. Si c'en est un, renseigne d'abord sa date de naissance sur sa fiche.",
  "household.error.not_a_member": "Cette personne n’est pas dans ton foyer.",
  "household.error.not_your_line": "Tu ne peux modifier que ta propre ligne.",
  "household.error.no_household": "Tu n’es dans aucun foyer.",
  "household.error.cannot_remove_owner":
    "La personne qui tient le foyer ne peut pas en être retirée.",
  "household.error.cannot_detach_owner":
    "La personne qui tient le foyer ne peut pas perdre son accès — plus personne ne pourrait composer un repas.",
  "household.error.not_claimed":
    "Cette personne n’a pas de compte ici, il n’y a donc aucun accès à retirer.",
  "household.error.not_found": "C’est déjà parti.",
  "household.constraint.kind": "C’est quoi ?",
  "household.constraint.kind.allergy": "Une allergie",
  "household.constraint.kind.allergy_hint":
    "Médical. Ça vaut pour toute la casserole, pour tout le monde à table, et rien ne se cuisine sans en tenir compte.",
  "household.constraint.kind.house_rule": "Quelque chose que cette maison ne sert pas",
  "household.constraint.kind.house_rule_hint":
    "C’est ta décision de foyer. On la tient, et on ne la déguise jamais en conseil de santé.",
  "household.constraint.house_rule_minor_only":
    "Les règles de maison ne concernent que les enfants. Un adulte à cette table décide de ce qu'il mange.",
  "household.allergy.placeholder": "Arachides",
  "household.allergy.add": "Ajouter l’allergie",
  "household.allergy.remove": "Retirer",
  // ── FF-064 · L'ACCÈS SUPPLÉMENTAIRE — voir le pavé de `en.ts` ───────────
  "household.extra.title": "Un accès personnel en plus",
  "household.extra.when":
    "Il s’ajoute à ton abonnement le jour où la personne réclame son accès, pas avant.",
  "household.extra.pick": "Choisis quelqu’un",
  "household.invite.title": "Laisser quelqu’un réclamer son profil",
  "household.invite.body":
    "Ses parts, ses allergies et ce que cette maison ne sert pas sont déjà sur sa ligne. La réclamer rattache son compte à cette même ligne — rien n’est créé, rien n’est perdu.",
  "household.invite.grants":
    "Ce que ça lui donne : elle voit le plan du foyer et pose sa propre direction. Pas : composer, ajouter ou retirer quelqu’un, ni décider ce que la maison ne sert pas.",
  "household.invite.who": "C’est pour qui ?",
  "household.invite.who_hint":
    "Seules les personnes qui n’ont pas encore de compte sont listées. Le lien réclame cette ligne-là, exactement.",
  "household.invite.nobody_left":
    "Tout le monde ici a déjà un compte. Ajoute d’abord quelqu’un, puis invite-le.",
  "household.invite.email": "Son e-mail",
  "household.invite.submit": "Créer l’invitation",
  "household.invite.working": "Création…",
  "household.invite.link_ready":
    "Envoie ce lien pour réclamer le profil de {name}. Il sert une fois, pour cette adresse, et expire dans 14 jours.",
  "household.invite.error.rate_limited": "Ça fait assez d’invitations pour aujourd’hui.",
  "household.invite.error.bad_email": "Cette adresse n’a pas l’air utilisable.",
  "household.invite.error.not_owner": "Seule la personne qui tient le foyer peut inviter.",
  "household.invite.error.already_claimed":
    "Cette ligne a déjà un compte dessus. Il n’y a rien à réclamer.",
  "household.restriction.title": "Les aliments que ce foyer ne sert pas",
  "household.restriction.add": "L’ajouter",
  "household.restriction.placeholder": "Nutella",
  "household.restriction.notice_owner": "Pas servi ici — {owner} en a décidé ainsi.",
  "household.restriction.notice_me": "C’est toi qui en as décidé ainsi.",
  "household.restriction.remove": "Retirer",
  // ⚠️ `household.envy.*` part sous `plan.envy.*` (sans `save`: l'envie n'a plus
  // de bouton propre, elle part avec le formulaire de demande).
  // `household.compose.*` est SUPPRIMÉE — la demande complète est sur
  // `/app/plan`. `household.portions.*` part sous `plan.table.*`. Les dix clés
  // sont gardées le temps que leurs lecteurs bougent.
  "household.envy.title": "La maison a envie de quoi cette semaine ?",
  "household.envy.body":
    "Une ligne, pour tout le monde. Écris-la avant que le plan soit fait — personne d’autre n’a rien à remplir, et la laisser vide ne pose aucun problème.",
  "household.envy.placeholder": "Léa veut des pâtes, Marc en a marre du poulet.",
  "household.envy.save": "Enregistrer",
  "household.compose.title": "Faire le plan de la semaine",
  "household.compose.body":
    "Une session de cuisine, des parts qui suivent la direction de chacun, et les courses réparties selon ce qui doit rester frais.",
  "household.compose.submit": "Composer pour le foyer",
  "household.compose.working": "Composition en cours…",
  "household.portions.title": "À table",
  "household.portions.standard": "Une part standard",
  // ⟳ 2026-09-09 — déménagées en `app.paywall.*` (FF-064). Voir `en.ts`.
  // ⚠️ CES QUATRE CLÉS N'ONT AUCUN APPELANT DANS LE DÉPÔT (vérifié par grep sur
  // tout `frontend/src`). Elles sont traduites parce que la parité l'exige — le
  // pack porte EXACTEMENT les clés du périmètre — et signalées ici parce que la
  // bonne suite est de les retirer de `en.ts`, pas de les garder. Le retrait
  // appartient au chantier foyer, qui est ouvert dans une autre session.
  "household.waves.title": "Courses",
  "household.waves.now": "À acheter maintenant",
  "household.waves.on": "À acheter le {date}",
  "household.waves.reason": "pour la cuisine du {day}",
  "household.merge.title": "Quelqu’un cuisine de son côté",
  "household.merge.body":
    "Cette personne s’est construit un plan à elle et l’a validé. Tu peux le replier dans le plan du foyer, ou le laisser — dans tous les cas, elle garde son plan.",
  "household.merge.none":
    "Personne dans le foyer ne cuisine de son côté en ce moment. Tout le monde mange le plan du foyer.",
  "household.merge.merge_cta": "Replier son plan dedans",
  "household.merge.unmerge_cta": "Reconstruire sans elle",
  "household.merge.dismiss_cta": "Laisser comme ça",
  "household.merge.working": "En cours…",
  "household.merge.revalidated_title": "Un plan replié a évolué depuis",
  "household.merge.revalidated_body":
    "Le plan du foyer cuisine toujours ce qui avait été validé au moment où tu l’as replié. Cette personne en a validé un plus récent depuis.",
  "household.merge.window": "Jours qui seraient repris : {days}, à partir du {from}.",
  "household.merge.window_past": "{days} de ses jours sont déjà derrière nous.",
  "household.merge.window_rebuilt":
    "Les {days} jours restants du foyer sont reconstruits, pour que la fin de semaine garde un plan.",
  "household.merge.unmerge_window": "Reconstruire referait {days} jour(s) à partir du {from}.",
  "household.merge.quota_left": "Il reste {remaining} fusions sur {limit} cette semaine.",
  "household.merge.quota_none":
    "Ce foyer a utilisé ses {limit} fusions de la semaine. Rien n’est perdu — ça repart le {date}.",
  "household.merge.mute": "Ne plus me proposer de fusionner son plan",
  "household.merge.mute_hint":
    "Son plan existe toujours et tu peux le replier quand tu veux. C’est seulement la question qu’on arrête de te poser.",
  "household.merge.unmute": "Reproposer son plan",
  "household.merge.muted": "On ne te pose plus la question pour son plan.",
  "household.merge.skipped_title": "Non proposés",
  "household.merge.skip.member_is_owner": "Le plan de ce foyer est déjà le tien.",
  "household.merge.skip.no_validated_plan": "Cette personne n’a validé aucun plan à elle.",
  "household.merge.skip.proposals_muted": "Tu as demandé qu’on ne te la propose plus.",
  "household.merge.skip.dismissed_by_owner":
    "Tu as laissé passer celle-là. Si elle valide un autre plan, la question revient.",
  "household.merge.skip.already_merged": "Son plan est déjà replié dans le plan du foyer.",
  "household.merge.skip.merge_quota_exhausted":
    "Le foyer a utilisé ses fusions de la semaine.",
  "household.merge.held": "Repris jusqu’au {to} : le prochain plan de ces jours-là les garde.",
  "household.merge.frozen":
    "Le foyer est en pause, donc rien de neuf ne peut être composé. Ce qui suit reste vrai.",
  "household.merge.load_failed":
    "Les propositions n’ont pas pu être lues. On n’affiche rien plutôt que quelque chose de faux.",
  "household.merge.open_plan": "Voir ce que son plan cuisine",
  "household.merge.close_plan": "Masquer son plan",
  "household.merge.plan_empty": "Son plan n’a aucun plat qu’on sache lire.",
  "household.merge.plan_unreadable": "Son plan n’a pas pu être lu.",
  "household.plan.title": "Ce que ce plan cuisine, et pour qui",
  "household.plan.divergence":
    "Rien n’a échoué ici. Deux directions ne sortent pas toujours de la même casserole — quand elles ne le peuvent pas, elles sont cuisinées à part.",
  "household.plan.taken":
    "{name} mange un plan à elle sur ces jours-là, donc celui-ci ne cuisine pas pour elle.",
  "household.plan.partial":
    "{name} a un plan à elle qui ne couvre qu’une partie de ces jours, donc celui-ci cuisine encore pour elle.",
  "household.plan.reclaimed": "Le plan de {name} a été replié dans celui-ci.",
  "household.plan.unmerged": "Ce plan a été reconstruit sans {name}.",
  "household.plan.unmerged_uncovered": "Son propre plan ne couvre pas tous ces jours-là.",
  "household.plan.merge_shape_unmet":
    "Cette fusion demandait quelque chose de cuisiné à part, et ce qui revient est une seule casserole pour tout le monde. Vérifie les parts avant de servir.",
  "household.plan.no_dishes":
    "Ce plan n’a aucun plat qu’on sache lire. Recompose-le depuis la page du foyer.",
  "household.plan.member_title": "Ce que le foyer cuisine",
  "household.plan.member_excluded":
    "Ces jours-là, tu manges ton propre plan, donc le plan du foyer ne cuisine pas pour toi.",
  "household.merge.error.muted_required": "Ce réglage n’a envoyé aucune valeur.",
  "household.merge.error.validated_at_required": "Cette proposition ne portait aucune date.",
  "household.merge.error.member_is_owner": "Cette ligne est la tienne.",
  "household.merge.error.no_validated_plan":
    "Cette personne n’a plus de plan validé, il n’y a donc rien à laisser.",
  "household.merge.error.notice_moved_on":
    "Leurs plans ont changé depuis que ceci s’est affiché. Recharge pour voir où on en est.",
  "household.member.diet": "Comment cette personne mange",
  // Les MÊMES mots que `setup.people.diet_*`, dans le namespace de cette
  // page: la liste des jetons est partagée (`DIET_ANSWERS`), les libellés ne
  // traversent pas la couture (`pageSeams.int.test.ts`).
  "household.member.diet_omnivore": "Mange de tout",
  "household.member.diet_vegetarian": "Végétarien",
  "household.member.diet_vegan": "Végane",
  "household.member.diet_pescatarian": "Pescétarien",
  "household.member.diet_gluten_free": "Sans gluten",
  "household.member.diet_hint":
    "Ça gouverne chaque plat qu'on compose pour le foyer. Le plat commun suit la ligne la plus stricte de la table.",
  "household.member.diet_from_profile":
    "Elle a un compte : comment elle mange se règle dans son \u00ab à propos de toi \u00bb.",
  "household.error.bad_diet": "Ce n'est pas une des quatre réponses.",
  "household.error.has_account":
    "Elle a un compte : ça se règle dans son \u00ab à propos de toi \u00bb, pas ici.",
  // L5 · les refus des portes du poids visé et du rythme (20260818190000).
  "household.error.target_incomplete":
    "Un poids visé et un rythme vont ensemble — l'un sans l'autre ne mène nulle part.",
  "household.error.bad_target_weight": "Ce poids visé est hors de 25 à 400 kg.",
  "household.error.bad_pace": "Ce rythme est hors de ce qu'on sait cuisiner.",
  "household.error.target_needs_direction":
    "Un poids visé n'existe que si la balance doit bouger. Choisis d'abord perdre ou prendre.",
  "household.error.no_member_id":
    "Elle a bien été ajoutée, mais sa ligne ne nous est pas revenue — rouvre le foyer et termine sa fiche.",
  // ── L5 · LE POP-UP « UNE BOUCHE » (2026-08-18) ──────────────────────────
  // Six blocs, trois obligatoires. Il s'ouvre à chaque ajout de personne, MAÎTRE
  // COMPRIS. ⛔ Aucune clé ne demande « adulte ou enfant »: la date de naissance
  // le dit.
  "household.mouth.title": "Quelqu'un qui mange ici",
  "household.mouth.later": "Plus tard",
  "household.mouth.block_habits": "ce qu'elle mange déjà",
  "household.mouth.block_allergies": "les allergies",
  "household.mouth.block_tastes": "ses dégoûts et son régime",
  // ── ⟳ 2026-09-20 · « FACULTATIF » EST PASSÉ SUR LE GESTE ────────────────
  //
  // Le libellé disait « Renseigner … », c'est-à-dire un ORDRE, et la seule
  // phrase qui dit que rien n'est obligatoire (`preferences_intro`) vit À
  // L'INTÉRIEUR de la fenêtre: on ne la lisait qu'après avoir payé le clic.
  // Sur une famille, cette porte est rendue UNE FOIS PAR BOUCHE — quatre
  // invitations à remplir avant d'avoir vu le moindre plan.
  //
  // ⚠️ RIEN NE RETIENT DERRIÈRE CETTE PORTE, ET C'EST VÉRIFIABLE:
  // `canGenerateMisses` passe `requireAllergies: false` à ses deux appels de
  // `personMisses`, le régime et le rythme ont quitté les refus le
  // 2026-08-19, et `peopleStepBlockers` ne nomme aucun des quatre blocs. Le
  // mot « facultatif » ne desserre donc aucune garde: il dit à l'écran ce qui
  // est déjà vrai dans `api/onboarding.ts`.
  //
  // ⛔ LE NOM RESTE « préférences alimentaires », ET CE N'EST PAS DU
  // CONSERVATISME. `MouthFormDialog` titre sa fenêtre avec
  // `preferences_title_named` parce que « le titre nomme le bouton qui l'a
  // ouverte »; rebaptiser le geste ici (« Affiner ses goûts ») ferait s'ouvrir
  // une fenêtre qui ne porte plus le nom du bouton. C'est la parenthèse qui
  // change, pas le nom — même idiome que `meals.form.slot_label` et
  // `coach.doctrine.beliefs.rationale_label`.
  "household.mouth.preferences_open":
    "Ses préférences alimentaires (facultatif)",
  "household.mouth.preferences_open_you":
    "Tes préférences alimentaires (facultatif)",
  "household.mouth.preferences_saved": "Les préférences de {name} sont enregistrées.",
  "household.mouth.preferences_title": "Préférences alimentaires",
  // ⟳ 2026-09-25 — LA LIGNE SOUS LE TITRE DE LA SECTION, sur les deux cartes
  // de `/app/setup`. Sans pronom, exprès: la même ligne sert à la carte
  // « Vous » et à celle de chaque personne ajoutée.
  "household.mouth.preferences_section_hint":
    "Allergies, aliments refusés, régime, habitudes de repas.",
  "household.mouth.preferences_title_named": "{name} — préférences alimentaires",
  "household.mouth.preferences_intro":
    "Rien ici n'est obligatoire. Ça affine le plan ; ça n'en décide pas la forme.",
  // ⟳ 2026-09-20 — CE N'EST PLUS UNE LISTE DE TROUS. Elle énumérait les quatre
  // blocs vides (« habitudes, allergies, dégoûts, régime ») dans la même voix
  // que `household.mouth.held` (« Il manque encore : … ») qui, elle, RETIENT
  // vraiment. Deux sens opposés dans une seule voix, et la phrase se répète
  // une fois par bouche. Elle dit maintenant ce que l'absence coûte: rien.
  "household.mouth.preferences_empty":
    "Rien de renseigné — le plan se compose sans. Ça se remplit plus tard.",
  "household.mouth.preferences_filled": "Déjà renseigné : {blocks}.",
  "household.mouth.preferences_done": "Enregistrer",
  "household.mouth.save": "Enregistrer",
  "household.mouth.add": "L'ajouter",
  "household.mouth.fold": "Replier",
  "household.mouth.unfold": "Ouvrir",
  "household.mouth.held": "Il manque encore : {blocks}.",
  "household.mouth.block_identity": "son prénom et sa date de naissance",
  // ⟳ 2026-09-06 — SUIT LE TITRE DU BLOC, qui a cessé de nommer l'effet sur la
  // balance pour nommer l'intention. Cette ligne ENVOIE CHERCHER un cadre à
  // l'écran: nommer le bloc autrement que son titre fait chercher un cadre qui
  // n'existe pas — le même défaut que la phrase du corps réclamant un champ
  // retiré, corrigé le même jour.
  "household.mouth.block_direction": "ce qu'il ou elle vise",
  // ⟳ 2026-09-06 — « et niveau d'activité » RETIRÉ. Cette ligne NOMME ce qui
  // retient le bouton, et le cran d'activité ne le retient plus (il n'est même
  // plus demandé). Une phrase qui réclame un champ absent de l'écran est pire
  // qu'un silence: elle envoie chercher.
  "household.mouth.block_body": "taille, poids et sexe",
  "household.mouth.identity": "Qui c'est",
  "household.mouth.identity_hint":
    "Le prénom est ce qui nomme sa part — une part au prénom vide est écartée en silence.",
  "household.mouth.identity_hint_you":
    "Ton prénom est ce qui nomme ta part — une part au prénom vide est écartée en silence.",
  "household.mouth.age_unknown":
    "On ne sait pas lire cette date, donc aucune direction ne s'appliquera pour l'instant.",
  // ⟳ 2026-09-06 — « Le sens dans lequel la balance va » EST DEVENU « Ce qu'il
  // ou elle vise ». Rapporté à l'écran: « c'est pas exact, c'est ce que vous
  // visez ». La carte du titulaire, à côté dans la même étape, disait déjà
  // `setup.people.goal` = « Ce que vous visez »; ce bloc-ci décrivait le même
  // choix par son EFFET sur la balance, ce qui est vrai du calcul et faux de la
  // question posée — on ne demande pas un sens, on demande une intention.
  // Les mots sont ceux de `setup.mouths.goal`, mot pour mot.
  //
  // ⚠️ LE `_hint` RESTE, ET IL PORTE CE QUE LE TITRE VIENT DE PERDRE: c'est lui
  // qui dit « descendre, monter, ou ne pas bouger », donc que la troisième
  // réponse existe et que les deux premières déplient un poids et un rythme.
  "household.mouth.direction": "Ce qu’il ou elle vise",
  "household.mouth.direction_you": "Ce que tu vises",
  "household.mouth.direction_hint":
    "Descendre, monter, ou ne pas bouger. Descendre ou monter déplie un poids visé et un rythme.",
  "household.mouth.target_weight": "Poids visé (kg)",
  "household.mouth.target_weight_hint":
    "Avec le rythme ci-dessous, il donne une date d'arrivée.",
  "household.mouth.target_refused_implausible":
    "C'est hors de ce qu'on sait traiter (de 25 à 400 kg).",
  "household.mouth.target_refused_wrong_direction":
    "Ça va dans le sens contraire de la direction choisie au-dessus.",
  "household.mouth.target_refused_below_energy_floor":
    "Y arriver ferait passer sa journée sous le plancher d'énergie. Vise un peu plus haut.",
  "household.mouth.pace": "À quelle vitesse",
  // ⛔ `pace_hint` ET `pace_hint_you` RETIRÉES LE 2026-09-01, à la demande.
  // « Le maximum de ce curseur est réglé sur ton corps — c'est le rythme le
  // plus rapide que le plan sait vraiment cuisiner. » Le plafond se VOIT sur
  // le contrôle: il ne monte pas plus haut. Les deux clés sont parties des
  // catalogues ET de `VoicedKey` — voir `MouthFormDialog.tsx`, au `Field`
  // du curseur.
  "household.mouth.pace_value": "{pace} kg par semaine",
  // ⟳ 2026-09-22 — LE CRAN ENREGISTRÉ CONTRE LE CRAN CUISINÉ.
  // ⚠️ ELLE NOMME LES DEUX NOMBRES, et c'est ce qui la rend utile: le curseur
  // au-dessus montre déjà le second, donc une phrase qui dirait seulement
  // « c'est le maximum » n'apprendrait rien. Voir `executedPaceNoticeFor`.
  "household.mouth.pace_executed":
    "Enregistré à {chosen} kg par semaine. Le plan n'en cuisine que {executed} — au-delà, ce corps n'a plus de marge.",
  "household.mouth.pace_needs_body":
    "Renseigne taille, poids et sexe juste au-dessus, et le curseur apparaît ici.",
  "household.mouth.pace_no_margin":
    "Ce corps n'a pas de marge de perte sans passer sous le plancher d'énergie. La direction continue de façonner ses parts.",
  "household.mouth.arrival": "Environ {weeks} semaines à ce rythme.",
  "household.mouth.who_fallback": "cette personne",
  "household.mouth.body":
    "Son corps",
  "household.mouth.body_you":
    "Ton corps",
  "household.mouth.body_hint":
    "Sert à dimensionner les parts. Il n'est jamais énoncé, ni à table ni à côté d'un prénom.",
  // ② Voir la note d'`en.ts`: deux axes, parce qu'une journée n'est pas un
  // sport — et sept clés de crans plus six d'options retirées le 2026-09-06,
  // le catalogue de l'entonnoir (`setup.day_activity.*`, `setup.sport.*`)
  // servant désormais les deux écrans.
  "household.mouth.day_activity": "La journée de {who}",
  "household.mouth.day_activity_you": "Ta journée",
  "household.mouth.day_activity_hint":
    "Le travail et la vie courante, sport mis à part. Le sport, c'est la question juste après.",
  "household.mouth.sport": "Le sport, pour {who}",
  "household.mouth.sport_you": "Le sport, pour toi",
  "household.mouth.sport_hint":
    "Des séances par semaine, journée mise à part. « Pas de sport » est une réponse, et elle compte.",
  // ① Voir la note d'`en.ts`: le plan ne compose que le plat.
  "household.mouth.meal_structure": "Ce qu'il y a d'autre dans l'assiette de {who}",
  "household.mouth.meal_structure_you": "Ce qu'il y a d'autre dans ton assiette",
  "household.mouth.meal_structure_hint":
    "Le plan ne compose que le plat. Dis-lui ce qui l'accompagne.",
  "household.mouth.takes_dessert": "Un dessert, un fruit ou un yaourt ?",
  "household.mouth.takes_cheese": "Du fromage ?",
  "household.mouth.takes_bread": "Du pain ?",
  "household.mouth.answer_yes": "Oui",
  "household.mouth.answer_no": "Non",
  // ⟳ 2026-09-23 — LES À-CÔTÉS, PAR PERSONNE. Voir la note d'`en.ts`: trois
  // états par type, « Selon l'objectif » est la clé absente.
  "household.mouth.side_courses.title": "Est-ce que {who} mange entrée, fromage, dessert, pain ?",
  "household.mouth.side_courses.title_you": "Est-ce que tu manges entrée, fromage, dessert, pain ?",
  "household.mouth.side_courses.hint":
    "En choisissant « Selon l'objectif », tu laisses Sophia décider de leur présence ou non, au déjeuner ou au dîner.",
  "household.mouth.side_courses.starter": "Entrée",
  "household.mouth.side_courses.cheese": "Fromage",
  "household.mouth.side_courses.dessert": "Dessert",
  "household.mouth.side_courses.bread": "Pain",
  "household.mouth.side_courses.auto": "Selon l'objectif",
  "household.mouth.side_courses.yes": "Oui",
  "household.mouth.side_courses.no": "Non",
  // ⑤ Voir la note d'`en.ts`: on ne demande pas l'appétit, on demande de quel
  // côté de l'incertitude de la formule la personne se situe.
  // ⟳ 2026-09-18 — LA QUESTION DIT SON NOM, ET LES TROIS RÉPONSES SONT UN MOT.
  // Elle demandait « comment {who} mange, d'habitude » et faisait choisir entre
  // trois tailles d'assiette: trois lignes à lire pour répondre « moyen ».
  // ⛔ CE QUE ÇA RENVERSE, ET C'EST ASSUMÉ: la note d'`en.ts` disait qu'on ne
  // demande PAS l'appétit mais « de quel côté de l'incertitude de la formule »
  // la personne se situe, et que « à carrure égale » empêchait de lire « as-tu
  // faim ». On demande maintenant l'appétit EN TOUTES LETTRES (demande du
  // propriétaire). Ce qui protège encore la lecture est la légende: elle dit ce
  // que la réponse déplace — le VOLUME de l'assiette — et ce qu'elle ne déplace
  // pas. La retirer laisserait croire qu'on choisit ici ce que la journée vise.
  "household.mouth.appetite": "{who} a quel appétit ?",
  "household.mouth.appetite_you": "Tu as quel appétit ?",
  // ⛔ « Le calcul se trompe d'environ 10 %. » RETIRÉE LE 2026-09-01, demandée
  // à l'écran. Elle expliquait POURQUOI on pose la question (l'incertitude
  // inter-individuelle de Mifflin-St Jeor) à quelqu'un qui n'a qu'à y
  // répondre. Ce que la question doit dire tient dans la comparaison — « à
  // carrure égale » —, et c'est elle qui empêche de lire « as-tu faim ».
  //
  // ⚠️ ET ELLE EST VOISÉE DEPUIS CE LOT. La phrase restante PORTE le pronom;
  // en voix unique elle tutoyait quelqu'un dont ce n'est pas la fiche. Le
  // défaut existait avant, caché derrière la phrase qui vient de partir.
  // ⟳ 2026-09-10 · LOT 7 — voir la note d’`en.ts`: le facteur d’appétit ne
  // touche PLUS l’énergie, il déplace les bornes de MASSE de l’assiette. À
  // calories égales, plus dense d’un côté, plus volumineux de l’autre.
  "household.mouth.appetite_hint":
    "À carrure égale. Ça ne change pas ce que la journée vise — seulement le volume de l’assiette de {who}.",
  "household.mouth.appetite_hint_you":
    "À carrure égale. Ça ne change pas ce que la journée vise — seulement le volume de ton assiette.",
  "household.mouth.appetite_small": "Petit",
  "household.mouth.appetite_average": "Moyen",
  "household.mouth.appetite_large": "Gros",
  // Voir la note d'`en.ts`: la question dimensionne la section du dessous.
  // ══════════════════════════════════════════════════════════════════════
  // LA SECTION FUSIONNÉE — « quand » et « quoi » ne font qu'une question
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ ELLES ÉTAIENT DEUX SECTIONS, ET C'ÉTAIT LA MÊME QUESTION POSÉE EN DEUX
  // FOIS. « Combien de fois tu manges par jour » cochait des moments; « Ce que
  // tu manges déjà » redemandait, plus bas, une ligne par moment coché. Entre
  // les deux, rien ne disait que la seconde DÉPENDAIT de la première — on
  // cochait en haut, et le détail apparaissait ailleurs.
  //
  // Le détail vit désormais DANS la case qu'il concerne: cocher un moment
  // ouvre son champ. Une question, un endroit.
  "household.mouth.eating": "Quand {who} mange, et quoi",
  "household.mouth.eating_you": "Quand tu manges, et quoi",
  "household.mouth.eating_hint":
    "Coche les moments où {who} mange vraiment — chacun ouvre de quoi dire ce qui s’y passe déjà.",
  "household.mouth.eating_hint_you":
    "Coche les moments où tu manges vraiment — chacun ouvre de quoi dire ce que tu y prends déjà.",
  // ⚠️ UNE ÉTIQUETTE VISIBLE, PAS LE PLACEHOLDER. Le placeholder disparaît à la
  // première frappe; le nom du moment, lui, est sur la case au-dessus et ne dit
  // pas CE QU'ON DEMANDE. Même règle que les trois nombres du shaker.
  "household.mouth.habit_field": "Des habitudes ?",
  // ── LES BULLES DE CE QUI EST PRIS À CÔTÉ DU PLAT (2026-09-01) ──────────
  //
  // ⛔ ELLES REMPLACENT « Ce qu'il y a d'autre dans l'assiette » ET SES TROIS
  // OUI/NON. Ces trois-là étaient posés UNE FOIS POUR LA PERSONNE: « je prends
  // du pain » ne disait pas si c'était le midi, le soir, ou les deux, et le
  // même ratio partait sur les six moments — petit-déjeuner compris, que le
  // plan compose pourtant en entier.
  //
  // ⚠️ LE MOT EST NU, LE « + » EST RENDU PAR L'ÉCRAN. Une bulle allumée
  // n'affiche plus de « + »: elle DIT ce qui est réglé, elle ne propose plus de
  // l'ajouter. Mettre le signe dans la traduction ferait un « + repas léger »
  // qui reste affiché une fois coché.
  "household.mouth.light": "repas léger",
  // ⟳ 2026-09-20 — RACCOURCIE SUR DEMANDE: « une description plus simple et
  // moins longue, qui explique que en gros c’est pour alléger un repas par
  // rapport à la moyenne ». Deux phrases sont devenues une.
  //
  // ⚠️ CE QUI A ÉTÉ PERDU, ET C’EST ASSUMÉ: « Ça reste un repas — pour en
  // sauter un, ne coche pas le moment. » La confusion qu’elle fermait est
  // réelle (cocher « léger » pour dire « rien », et recevoir quand même un
  // repas), mais elle est désormais portée par le mot « repas » de la phrase
  // et par la case elle-même, qui ne s’atteint qu’une fois le moment coché.
  //
  // ⚠️ LA LÉGENDE NE DIT TOUJOURS QU’UNE MOITIÉ DE L’EFFET, et c’est voulu:
  // « léger » baisse la part du moment (`LIGHT_SLOT_WEIGHT`) ET son plancher
  // de densité (`plateBoundsFor`, 1,0 → 0,6 kcal/g). Le second est un réglage
  // de moteur; l’écrire ici demanderait un kcal par gramme à quelqu’un qui
  // coche une case.
  "household.mouth.light_hint":
    "Ce repas pèse moins que d’habitude ; les autres reprennent la différence.",
  // ⟳ 2026-09-15 — `portions_plan_only` A ÉTÉ RETIRÉE, sur demande.
  // ⛔ NE LA REPOSE PAS « pour expliquer ». Elle était arrivée le 2026-09-10 à
  // la place des six clés d'extras (`extras_field` et les cinq `extra.*`) pour
  // dire ce que le plan ne réserve pas. Sous la liste des moments, elle faisait
  // un troisième paragraphe de gris et répondait à une question que personne ne
  // pose à cet endroit.
  "household.mouth.habit_shaker_here": "Le shaker de {who} est posé sur ce moment.",
  "household.mouth.habit_shaker_here_you": "Ton shaker est posé sur ce moment.",
  // ── LE MOMENT DU SHAKER ────────────────────────────────────────────────
  // ⚠️ `ShakerDraft.slot` EXISTAIT DEPUIS TOUJOURS ET N'ÉTAIT RENDU NULLE PART:
  // le champ partait donc en base avec sa valeur d'origine, sans que personne
  // ait pu la choisir. Ce n'est pas un déplacement, c'est un manque.
  "household.mouth.shaker_at": "À quel moment {who} le prend",
  "household.mouth.shaker_at_you": "À quel moment tu le prends",
  "household.mouth.shaker_at_loose": "Hors d’un moment nommé",
  // ⛔ ON NE COCHE JAMAIS UN MOMENT SANS LE DIRE. L'ajout automatique est un
  // service, pas une liberté: sans cette phrase, un moment apparaîtrait coché
  // plus haut sans que personne comprenne pourquoi.
  "household.mouth.rhythm":
    "Combien de fois {who} mange par jour",
  "household.mouth.rhythm_you":
    "Combien de fois tu manges par jour",
  "household.mouth.rhythm_hint":
    "Coche les moments où {who} mange vraiment.",
  "household.mouth.rhythm_hint_you":
    "Coche les moments où tu manges vraiment.",
  "household.mouth.rhythm_house":
    "Rien de coché veut dire que {who} mange aux moments de la maison — pas que {who} ne mange jamais.",
  "household.mouth.rhythm_house_you":
    "Rien de coché veut dire que tu manges aux moments de la maison — pas que tu ne manges jamais.",
  "household.mouth.habits":
    "Ce que {who} mange déjà",
  "household.mouth.habits_you":
    "Ce que tu manges déjà",
  "household.mouth.habits_hint":
    "Quelque chose de quotidien qui ne doit pas changer ?",
  "household.mouth.habits_hint_you":
    "Quelque chose de quotidien que tu ne veux pas changer ?",
  "household.mouth.habits_only_declared":
    "Ne montrer que ses moments",
  "household.mouth.habits_only_declared_you":
    "Ne montrer que tes moments",
  // ── ⚠️ UN EXEMPLE PAR MOMENT, ET PAS UN SEUL POUR LES SIX ───────────────
  // Le placeholder était le même partout: « un café et deux tartines » sous
  // DÎNER. Un exemple qui ne va pas avec la question n'aide pas — il apprend au
  // lecteur que l'écran ne le suit pas. Signalé le 2026-08-19.
  //
  // ⛔ CE SONT DES EXEMPLES, PAS DES SUGGESTIONS: rien de ce qui est écrit là
  // ne part en base et rien n'est proposé au plan. Ils disent le NIVEAU DE
  // DÉTAIL attendu — concret, sans quantité —, ce qu'une consigne abstraite ne
  // sait pas faire dire.
  "household.mouth.habit_placeholder_breakfast": "un café et deux tartines, un bol de céréales…",
  "household.mouth.habit_placeholder_snack_am": "un fruit, une poignée d'amandes…",
  "household.mouth.habit_placeholder_lunch": "une salade au bureau, les restes de la veille…",
  "household.mouth.habit_placeholder_snack_pm": "un yaourt, un carré de chocolat…",
  "household.mouth.habit_placeholder_dinner": "une soupe, des pâtes vite faites…",
  "household.mouth.habit_placeholder_before_bed": "une tisane, un fromage blanc…",
  // Voir la note d'`en.ts`: nom, cadre, étiquettes, et où ça part.
  "household.mouth.shaker_title":
    "Son shaker ou sa collation",
  "household.mouth.shaker_title_you":
    "Ton shaker ou ta collation",
  "household.mouth.shaker_summary":
    "Une portion : {grams} g · {protein} g de protéines · {kcal} kcal. Relis-le — une protéine tapée dans la case des calories ressemble exactement à un formulaire bien rempli.",
  "household.mouth.shaker_kept":
    "Il s’enregistre avec le reste de la fiche, par le bouton du bas — il n’y a rien à enregistrer ici.",
  "household.mouth.shaker_foreground":
    "Prendre du poids passe presque toujours par un shaker ou une collation chiffrée. Ajoute-le et il compte DANS la journée au lieu de s'ajouter par-dessus.",
  "household.mouth.shaker_background":
    "Un shaker, une collation chiffrée ? Ajoute-le et il compte dans la journée.",
  "household.mouth.shaker_add": "Ajouter un shaker ou une collation chiffrée",
  "household.mouth.shaker_label":
    "Comment {who} l'appelle",
  "household.mouth.shaker_label_you":
    "Comment tu l'appelles",
  "household.mouth.shaker_label_hint":
    "« mon shaker », « le truc du matin » — ses mots, pas les tiens.",
  "household.mouth.shaker_label_hint_you":
    "« mon shaker », « le truc du matin » — tes mots.",
  "household.mouth.shaker_grams": "grammes par portion",
  "household.mouth.shaker_protein": "protéines (g)",
  "household.mouth.shaker_kcal": "calories (kcal)",
  "household.mouth.shaker_label_source":
    "Les trois se lisent sur l'étiquette du pot. Sans eux, le shaker est contourné au lieu d'être compté.",
  // ── LE BOUTON D'ENREGISTREMENT DU SHAKER, ET LES TROIS ÉTATS ────────────
  // Il s'active dès qu'il y a un nom et UNE des trois mesures — règle demandée.
  // Mais le moteur, lui, est tout-ou-rien: une déclaration incomplète est jetée
  // par `parseFixedIntakes`. On enregistre quand même, et on DIT l'état.
  "household.mouth.shaker_save": "Enregistrer",
  "household.mouth.shaker_counted":
    "Enregistré, et compté dans la journée : les trois nombres y sont.",
  "household.mouth.shaker_kept_not_counted":
    "Enregistrable, mais il ne sera pas encore compté : le plan a besoin des trois nombres pour l’intégrer au lieu de le contourner. Ce que tu as tapé est gardé.",
  "household.mouth.shaker_needs_one":
    "Il faut au moins un nom et une des trois mesures pour l’enregistrer.",
  // ⚠️ ELLE REMPLACE « compté » QUAND IL N'Y A PAS DE BOUTON, et pas
  // seulement pour la forme: « compté » est un fait sur la BASE, et la fiche
  // d'ajout n'a pas encore de ligne où écrire. Dire « enregistré » à ce
  // moment-là serait annoncer une chose en base pendant qu'elle est dans un
  // brouillon. Voir `ShakerPort`.
  "household.mouth.shaker_with_the_card":
    "Il part avec le reste de la fiche, au moment où tu l’enregistres.",
  "household.mouth.shaker_remove": "Le retirer",
  "household.mouth.tastes":
    "Ce que {who} n'aime pas",
  "household.mouth.tastes_you":
    "Ce que tu n'aimes pas",
  // ⛔ 2026-09-20 — LES DEUX NE SONT PLUS RENDUES. Elles nommaient le champ
  // « un mot puis Ajouter » (`DislikeFields`), remplacé par le texte libre
  // (`TermsEntry`, clés `household.mouth.terms_*` plus bas). Gardées: la
  // parité fr/en est tenue par un test, et les effacer oblige à trancher la
  // même question des deux côtés pour un gain nul.
  "household.mouth.dislikes": "Aliments refusés",
  "household.mouth.dislikes_placeholder": "champignons",
  // ── LE TEXTE LIBRE, POUR LES DEUX SECTIONS — 2026-09-20 ──────────────────
  // Une phrase ou des virgules; « Ajouter » s'allume dès qu'il y a du texte,
  // un appel modèle court en sort les aliments, et ils arrivent en bulles déjà
  // cochées. Le placeholder montre les DEUX formes acceptées, parce que c'est
  // la seule aide qu'on donne: la section n'a pas de phrase d'explication.
  "household.mouth.terms_placeholder_allergy":
    "arachides, crustacés — ou une phrase entière",
  "household.mouth.terms_placeholder_dislike":
    "champignons, thon et mangue — ou une phrase entière",
  "household.mouth.terms_label_allergy": "Allergies, en texte libre",
  "household.mouth.terms_label_dislike": "Aliments refusés, en texte libre",
  // Le bouton pendant l'appel. Court: il remplace « Ajouter » sur place.
  "household.mouth.terms_working": "Un instant…",
  // Voir la note d'`en.ts`: le régime passe en tête parce qu'il exclut.
  "household.mouth.diet_hint":
    "Végétarien, vegan, pescétarien, sans gluten, ou rien de tout ça.",
  "household.mouth.diet":
    "Comment {who} mange",
  "household.mouth.diet_you":
    "Comment tu manges",
  "household.mouth.diet_unset": "Choisis une réponse",

  // A3 · P3, la 4e option d'objectif (2026-09-03). RETIRÉES EN PLACE dans ce pack:
  //   "household.member.goal_none"  — l'option vide de `MouthFields` (/app/household)
  //   "setup.mouths.goal_none"      — l'option vide de l'entonnoir (/app/setup)
  // AJOUTÉES — namespace `household`, déclaré sur /app/setup ET /app/household.
  // Registre ÉDUCATIF (PIVOT-FOYER §8.4): « Manger normalement », jamais « maintenir un poids ».
  "household.goal.minor_maintenance": "Manger normalement",
  "household.goal.minor_only": "Avant 18 ans, c’est la seule direction proposée.",
  "household.goal.minor_switched":
    "Avant 18 ans, « {from} » n’est plus proposé : c’est « Manger normalement » qui sera enregistré.",
  // Les deux refus S4 (`20260822041500`), nés le 2026-08-22 et arrivés en jeton brut
  // pendant douze jours. La phrase nomme le remède que la migration désigne.
  "household.error.goal_not_for_minor":
    "Pas de direction de poids pour un enfant : avant 18 ans, seul « Manger normalement » est accepté. Choisis-le, puis pose la date.",
  "household.error.target_not_for_minor":
    "Pas de poids visé pour un enfant : avant 18 ans, on ne vise rien.",
  // A4 · P4, les idées de repas (2026-09-03, décision D4.1). RETIRÉES EN PLACE dans
  // ce pack — SEPT clés de l'écran `/app/meals` (supprimé), et AUCUNE du
  // vocabulaire du moteur (`meals.slot.*`, `meals.aisle.*`, `meals.tick.*`… restent):
  //   "app.nav.meals"        — l'onglet « Idées de repas » de la barre du bas (KeelAppShell)
  //   "app.nav.meals.short"  — sa forme courte « Repas »
  //   "meals.title"          — « Idées de repas », le titre de la page
  //   "meals.subtitle"       — « Les plats que ton coach met à disposition… »
  //   "meals.list.title"     — « De ton coach »
  //   "meals.list.empty"     — « Ton coach n'a encore déposé aucune idée de repas… »
  //   "meals.error"          — « Impossible de les charger pour le moment. »
  // GARDÉE, contre la liste de huit du mandat: "meals.loading" — deux appelants
  // vivants sur `/app/plan` (`MealBuilder.tsx`, `StudentWeekPlanPage.tsx`), vus
  // par `tsc` quand on l'a retirée; redéposée près du moteur, avec sa note.
  // Et dans `catalog.ts`: l'entrée `"/app/meals"` de `PAGE_NAMESPACES`. Aucune clé ajoutée.

  // A6 · P6, le déjeuner en semaine quitte l'étape 3 (2026-09-03, D6.3). AUCUNE
  // clé ajoutée, AUCUNE retirée : le namespace `setup.work_lunch.*` est GARDÉ,
  // déjà déclaré sur /app/household (`catalog.ts`, inchangé). VALEURS CHANGÉES
  // EN PLACE dans ce pack, parce que la carte vit maintenant dans la fiche de
  // chaque bouche, juste au-dessus de sa grille, et que « à l'étape suivante »
  // mentait :
  //   "setup.work_lunch.intro"        — « on le demande maintenant » → « sa
  //                                     semaine, juste en dessous, garde le dernier mot »
  //   "setup.work_lunch.outside_note" — « seront déjà cochés … à l'étape
  //                                     suivante » → « sont cochés … dans sa
  //                                     semaine, juste en dessous »
  //   "setup.work_lunch.grid_wins"    — « la grille … de l'étape suivante » →
  //                                     « la grille … de sa semaine, juste en dessous »
  //   "setup.request.presence_intro"  — « L'étape trois disait l'habitude » →
  //                                     l'habitude se règle sur la page Foyer
  // ⟳ 2026-09-24 — `setup.work_lunch.*` RETIRÉ : plus aucun lecteur (question
  // supprimée le 2026-09-19, état « dehors » le 2026-09-24).

  // ── A5 · la page Foyer (2026-09-03) ──────────────────────────────────────
  // LES DEUX CADRES NOMMÉS d'une fiche de bouche (D5.1, renversement du
  // 2026-08-19 écrit dans `MouthFormDialog.tsx`). Le récapitulatif du cadre
  // replié, lui, REPREND les clés de la fiche d'ajout
  // (`household.mouth.preferences_filled` / `_empty`): le même fait se dit du
  // même mot aux deux endroits.
  "household.member.frame_identity": "Informations personnelles",
  // ⟳ 2026-09-19 — LA FICHE EST DEUX FENÊTRES, DONC DEUX TITRES. Le
  // titre d'un `Modal` est aussi son `aria-label`: le seul prénom ne
  // disait plus laquelle des deux on vient d'ouvrir. Jumelle de
  // `household.mouth.preferences_title_named`, et même gabarit.
  "household.member.identity_title_named": "{name} — informations personnelles",
  "household.member.frame_identity_hint":
    "Ce qui dimensionne son assiette : qui c’est, son corps, et où va sa balance.",
  "household.member.frame_preferences": "Préférences alimentaires",
  "household.member.frame_preferences_hint":
    "Ce qui affine le plan : ce qu’elle mange déjà, ce qu’elle ne mange jamais, et ce que la maison ne sert pas.",
  // ⛔ « LECTURE… », PAS UN CADRE VIDE. Les formulaires de cette page figent
  // leurs champs au montage et REMPLACENT à l'enregistrement: un cadre monté
  // sur une lecture non faite affiche du vide non lu, puis l'écrit.
  "household.mouth.frame_loading": "Lecture de ce qui est déjà renseigné…",
  // ── PARAMÈTRES DU FOYER (A5, mandat point 4) ──────────────────────────────
  // Le titre de la SECTION qui accueille l'équipement de cuisine et les repas
  // traditions, déplacés de l'étape 3 de l'entonnoir — qui ne se rejoue jamais.
  "household.settings.title": "Paramètres du foyer",
  //   "setup.traditions.title"        — « Les jours que vous ne déplacez pas »
  //                                     → « Les repas traditions » (mandat point 4).
  //                                     La CLÉ ne bouge pas: la renommer casserait
  //                                     la parité et `catalog.ts` pour rien.
  // ── L'ACCÈS, DEPUIS LA LIGNE D'UNE BOUCHE (A5, §5.5) ──────────────────────
  // Trois états DÉRIVÉS DES FAITS: `user_id` non nul ⇒ réclamée; une invitation
  // vivante ⇒ invitée; sinon ⇒ libre. Le menu déroulant d'`InviteCard` est parti
  // avec elle. ⛔ Aucun montant recopié: la phrase du prix vient de `offer.extra`
  // + `PRICES.claimedProfile` (D5.8).
  "household.access.claimed": "A son accès",
  "household.access.invite": "Inviter",
  "household.access.resend": "Renvoyer",
  "household.access.invited": "Invitation envoyée le {date} à {email}",
  "household.access.copy": "Copier le lien",
  "household.access.copied": "Lien copié",
  // ⛔ « Écrire », pas « Envoyer »: ce produit n'envoie AUCUN e-mail
  // d'invitation (FF-060 R7). Le lien ouvre un brouillon, et c'est le maître
  // qui appuie sur envoyer, dans son propre logiciel de courrier.
  "household.access.mail": "Écrire le message",
  "household.access.mail_subject": "Ton accès au foyer",
  // ── LA FENÊTRE D'AJOUT (A5, point 3) ─────────────────────────────────────
  // Le bouton qui l'ouvre. La fiche était EN LIGNE sur la page et les goûts
  // derrière un second écran: une seule fenêtre les porte maintenant tous les
  // deux, les préférences en accordéon dedans (⛔ jamais deux `Modal` imbriqués).
  "household.add.open": "Ajouter une personne",

  // ── chantier-0904/FF-060 — les plages suivent le besoin — début ──
  // ⟳ 2026-09-06 — CES DEUX PHRASES DISAIENT « Ceux qui sont cochés ont été
  // ajoutés et ne peuvent pas être retirés ici », et c'était vrai: l'écran
  // cochait quatre moments tout seul sur une fiche neuve. Il ne le fait plus —
  // un plancher dérivé n'est pas une réponse, et l'écrire comme une réponse
  // rendait impossible de dire « je ne goûte pas ». Voir la pierre tombale dans
  // `MouthFormDialog.tsx`.
  //
  // ⚠️ CE QU'ELLES DISENT MAINTENANT EST CE QUI RESTE VRAI: le plan ouvrira
  // lui-même les moments manquants. Sans cette phrase, la personne
  // découvrirait un goûter dans son plan sans rien pour l'expliquer.
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-08 (soir) — TROIS PHRASES SONT DEVENUES UNE, ET L'UNE MENTAIT
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Ce bloc empilait `rhythm_derived` + `rhythm_derived_why` +
  // `rhythm_floor_locked`: 65 mots de gris sous six cases, le chiffre répété
  // TROIS fois, et « cochés » aussi.
  //
  // ⛔ ET SURTOUT, LES DEUX PREMIÈRES CONTREDISAIENT LA TROISIÈME. Signalé mot
  // pour mot: « on peut pas décocher les repas imposés ». C'est exact — quand
  // le plancher mord, les cases cochées sont GRISÉES —, et la phrase disait
  // pourtant « Décoche ceux qui ne sont pas vrais ». Une invitation à un geste
  // que l'écran refuse est la cicatrice du bouton mort, prise par l'autre bout:
  // là on ne cache pas le refus, on promet l'inverse.
  //
  // ⇒ DEUX ÉTATS, UNE PHRASE CHACUN, ET CHACUNE NE NOMME QUE LE GESTE QUI
  // EXISTE. Libre: on peut retirer. Tenu: on ne peut qu'ajouter. Le « pourquoi »
  // (`rhythm_derived_why`, supprimée) est plié dans l'état où il sert — celui
  // qui contraint; ailleurs, « ton corps en demande 4 » se suffit.
  // ⚠️ « IL FAUT {count} MOMENTS PAR JOUR » EST LE TRONC COMMUN DES DEUX ÉTATS,
  // et ce n'est pas une coquetterie: les deux phrases se lisent l'une après
  // l'autre quand on coche une case de plus, et changer de tournure au passage
  // ferait croire qu'on parle d'autre chose.
  "household.mouth.rhythm_derived":
    "Il faut {count} moments par jour à {who}. On les a cochés — décoche ceux que {who} ne prend pas.",
  "household.mouth.rhythm_derived_you":
    "Il te faut {count} moments par jour. On les a cochés — décoche ceux que tu ne prends pas.",
  // ⟳ 2026-09-15 — `rhythm_floor_locked` (+ `_you`) A ÉTÉ SUPPRIMÉE.
  // ⛔ NE LA REPOSE PAS. Elle disait « Ils sont donc tenus — ajoutes-en un pour
  // pouvoir en retirer », et elle n'était juste que tant qu'une case était
  // réellement grisée. Le verrou est parti le 2026-09-15 (voir `floorSpeaks`
  // dans `MouthFormDialog.tsx`): il n'existe plus d'état « tenu », donc plus
  // d'état à nommer. Il ne reste que `rhythm_derived`, servie partout.
  "household.mouth.shake_composed":
    "Le plan composera un shaker à boire l'après-midi pour {who}. Si {who} a déjà le sien, ajoute-le ci-dessous et le plan n'y touchera pas.",
  "household.mouth.shake_composed_you":
    "Le plan te composera un shaker à boire l'après-midi. Si tu as déjà le tien, ajoute-le ci-dessous et le plan n'y touchera pas.",
} satisfies TranslatedMessagesOf<"household">;
