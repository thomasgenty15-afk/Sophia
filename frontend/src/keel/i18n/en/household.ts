// Seed anglais — le namespace `household`, et lui seul.
// Assemblé dans `../en.ts`; une clé `household.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enHousehold = {
  "household.title": "Your household",
  "household.empty.title": "Cook once, for everyone",
  "household.empty.body":
    "Add the people you cook for. One cooking session, portions that follow each person's own direction.",
  "household.create.name": "What do you call it?",
  // ── LE CHOIX DU MODE A DISPARU (lot 2, 2026-08-10) ────────────────────────
  // `household.create.kind.*` posait « famille ou colocation ? », et la réponse
  // gouvernait le droit de restreindre et la visibilité des objectifs. La
  // colocation est sortie du produit; les cinq clés sont parties avec elle au
  // lot 4, après vérification qu'aucune n'avait plus d'appelant.
  "household.create.submit": "Create the household",
  "household.members.title": "Household members",
  "household.members.owner": "Runs the household",
  "household.members.child": "Child",
  // ── LE MAÎTRE EST LA PREMIÈRE BOUCHE (lot 4) ─────────────────────────────
  // Il est un convive, pas un administrateur. Et c'est ce qui supprime une
  // falaise réelle: la composition refuse de démarrer tant qu'il n'a pas
  // d'objectif à lui, ce qu'on découvrait jusqu'ici APRÈS avoir saisi trois
  // personnes.
  "household.me.unlock":
    "Your direction is also what lets us compose for the household. One minute now, and the plan is available.",
  // D5 (2026-08-18) — LA FICHE DU MAÎTRE EST UNE FENÊTRE, comme celle de tout
  // le monde: « sans quoi celui qui tient la maison serait le seul dont on ne
  // sait rien » (conception §1). ⟳ 2026-09-09: c'en est une pour de bon — la
  // carte ne porte plus qu'un résumé, et `household.me.sheet` / `.body`, qui
  // décrivaient le formulaire au lieu de dire un fait, sont parties avec.
  "household.me.open": "Fill in my details",
  "household.member.first_name": "First name",
  "household.member.first_name_hint": "How the plan names their portion.",
  "household.member.birth_date": "Date of birth",
  // L'ÂGE EST FACULTATIF ET GOUVERNANT. La phrase dit les deux, parce qu'un
  // champ facultatif dont l'absence change le repas sans le dire est un piège.
  "household.member.birth_date_hint":
    "Optional. Until we have it, they get a standard serving — a direction only applies at a known age.",
  "household.member.birth_date_kept":
    "Already on file. Leave this empty to keep it, or pick a new date to replace it.",
  // D18 (2026-08-12) — SUR SA PROPRE LIGNE, ce champ écrit `profiles.birth_date`,
  // la même colonne que « About you ». Sans cette phrase, on croit qu'il faut la
  // saisir deux fois — et le jour où les deux dates diffèrent, personne ne sait
  // laquelle sert.
  "household.member.birth_date_mine":
    "The same date as in your About you — filling it here fills it there. Optional, and until we have it you get a standard serving: a direction only applies at a known age.",
  "household.member.goal": "Their direction",
  "household.member.goal_mine": "Your direction",
  "household.member.goal_inactive":
    "Saved, and not applied yet: a direction needs an age. Add their date of birth above.",
  // D1 (2026-08-11) — dès qu'une bouche a un compte, son objectif vit dans SON
  // « about you ». Le dire ici évite qu'on cherche un champ qui n'y est plus.
  "household.member.goal_from_profile":
    "Each person sets it from their own account — it follows them everywhere, not just at this table.",
  "household.member.save": "Save",
  "household.member.saved": "Saved.",
  "household.member.edit": "Edit",
  "household.member.remove": "Remove from the household",
  // ── DEUX GESTES, DEUX LIBELLÉS (chantier 2, D2) ──────────────────────────
  // Retirer l'accès et retirer du foyer ne font PAS la même chose, et la
  // différence est invisible si les deux s'appellent « retirer ». Le premier
  // laisse la personne à table; le second efface sa portion, ses allergies et
  // ses contraintes. Les phrases disent ce qui reste, pas ce qui part.
  "household.member.detach": "Remove their access",
  "household.member.detach_hint":
    "Removing their access signs them out of this household — they stay at the table, with their serving and their allergies. Removing them from the household deletes all of it.",
  "household.member.remove_hint":
    "This deletes their serving, their allergies and anything this house does not serve them.",
  // FF-066 lot 4 (2026-09-23) — the two-step confirmation the code promised
  // and did not do: one click deleted the line.
  "household.member.remove_confirm": "Remove for good? There is no undo.",
  "household.member.remove_confirm_yes": "Yes, remove from the household",
  "household.member.remove_cancel": "Cancel",
  // ── D14 (2026-08-12) · QUI EST LÀ, ET QUAND ──────────────────────────────
  // LE TITRE DIT « pas là », JAMAIS « absent ». Un enfant lit cet écran par
  // dessus l'épaule d'un parent, et « absences » est le vocabulaire de l'école
  // — c'est-à-dire d'un manquement. Manger ailleurs n'en est pas un.
  "household.away.title": "When they eat somewhere else",
  // CE QUE ÇA FAIT, ET SURTOUT CE QUE ÇA NE FAIT PAS. Sans la seconde phrase,
  // on croit qu'on annule la cuisson du samedi pour tout le monde.
  "household.away.hint":
    "Untick the meals they will not be eating here. Nothing is cancelled for anyone else — we simply cook for one less that day.",
  "household.away.open": "Mark when they are away",
  "household.away.open_count": "Marked on {n} meals — change",
  // CE QU'ILS ONT DIT EUX-MÊMES. Le maître doit voir le FAIT, pas seulement sa
  // propre marque: sans cette ligne, il re-marquerait par-dessus, ou
  // s'étonnerait d'une assiette manquante qu'il n'a pas demandée.
  "household.away.self_declared": "They already told us themselves: {days}.",
  "household.goal.fat_loss": "Losing fat",
  "household.goal.muscle_gain": "Building muscle",
  "household.goal.maintenance": "Staying where they are",
  "household.add.title": "Add someone who eats here",
  "household.add.submit": "Add them",
  // LE PLAFOND REND SON MOTIF, il ne grise pas un bouton en silence. La limite
  // vit en base (`household_full`), pas ici: cet écran ne fait que la dire.
  "household.add.full":
    "Eight is the most a household can hold. Every mouth is another serving to compose at each generation.",
  // ── LE CORPS DE CHAQUE BOUCHE (2026-08-12) ───────────────────────────────
  //
  // ⚠️ CE QUE CES LIBELLÉS N'ONT PAS LE DROIT DE DIRE. Pas un objectif, pas une
  // catégorie, pas un besoin, pas un chiffre calculé. Le titre parle de ce
  // qu'on SERT, jamais de ce que quelqu'un EST — cet écran est ouvert devant la
  // famille, et un enfant le lit par-dessus l'épaule d'un parent.
  // ── CE QUE CETTE BOUCHE MANGE D'HABITUDE (2026-08-14) ────────────────────
  // Ouvert après un plan réel qui a servi des œufs brouillés sept matins
  // d'affilée à une femme qui mange une pomme. Personne ne le lui avait
  // demandé: il n'existait aucun champ pour le ranger.
  //
  // ⚠️ AUCUNE DE CES PHRASES NE COMPTE, NE RELANCE, NI NE RÉCLAME. « Il en
  // reste 2 à remplir » est la faute qui a fait supprimer le conseil de
  // famille: on recréerait la corvée que le produit promet de supprimer. Il
  // n'y a donc pas de clé « manquant » ici, et il ne doit pas y en avoir.
  "household.habits.title": "What they usually eat",
  "household.habits.hint":
    "Some people always have the same thing at a given moment, whatever the house is cooking. Telling us keeps that dish off their plate — and keeps their thing on the shopping list.",
  "household.habits.open": "Set their habits",
  "household.habits.close": "Close",
  "household.habits.loading": "Reading what they usually eat…",
  "household.habits.choice_household_dish": "They eat what the house cooks",
  "household.habits.choice_own_usual": "They have their own thing",
  "household.habits.usual_label": "What they have",
  "household.habits.usual_placeholder": "an apple",
  "household.habits.usual_missing": "Say what it is, in a few words.",
  "household.habits.note_label": "Anything else worth knowing",
  "household.habits.note_hint":
    "One line, kept for good, read every time we cook. Tastes, textures, what they never touch.",
  "household.habits.note_placeholder": "Does not eat anything reheated.",
  "household.habits.no_slots": "No eating moments are set for this person yet.",
  "household.habits.save": "Save",
  "household.habits.saved": "Saved.",
  "household.body.title": "How much to serve them",
  // LA PHRASE QUI JUSTIFIE LA DEMANDE, ET LA SEULE QUI SOIT VRAIE. Sans elle,
  // on demande le poids d'un enfant sans dire pourquoi — et la seule raison
  // qu'un lecteur imagine alors est la mauvaise.
  "household.body.hint":
    "A palm of chicken is not the same palm on a six-year-old and on a grown-up. We use this to work out how much of the same dish goes on each plate — nothing else. It is never shown at the table, never said out loud, and never turned into a target.",
  "household.body.height": "Height (cm)",
  "household.body.weight": "Weight (kg)",
  "household.body.gender": "Sex",
  "household.body.gender_female": "Female",
  "household.body.gender_male": "Male",
  "household.body.gender_other": "Other",
  "household.body.save": "Save",
  "household.body.saved": "Saved.",
  // TOUT-OU-RIEN, DIT À L'ÉCRAN COMME EN BASE. Un demi-corps n'existe pas.
  "household.body.missing":
    "We do not have this yet — until we do, they get a standard serving of whatever the house cooks.",
  "household.body.needs_birth_date":
    "Add their date of birth above too: how much a growing child needs is not worked out the same way as for a grown-up.",
  "household.error.body_incomplete":
    "We need all three — height, weight and sex. Two out of three cannot size a plate.",
  "household.error.bad_height": "That height is not one we can use.",
  "household.error.bad_weight": "That weight is not one we can use.",
  "household.error.bad_gender": "That is not one of the options.",
  // L5-B (2026-08-18). `keel_household_set_member_body` rend ce jeton depuis le
  // lot L0, et aucune phrase ne l'attendait — le pop-up « une bouche » l'aurait
  // rendu tel quel, en anglais brut, à côté du champ.
  "household.error.bad_day_activity":
    "That day-to-day answer is not one we know. Pick one of the three.",
  "household.error.bad_sport_frequency":
    "That sport answer is not one we know. Pick one of the four.",
  "household.error.bad_appetite":
    "That appetite answer is not one we know. Pick one of the three.",
  "household.error.bad_weekday": "That is not a day of the week.",
  "household.error.bad_slot": "That is not a meal we can hold a habit on.",
  "household.error.empty_label":
    "Tell us what that meal is, in your own words -- a blank would match any dish.",
  "household.error.label_too_long": "Sixty characters at most.",
  "household.error.too_many_traditions":
    "Three standing days is the most we take. Remove one to add another.",
  "household.error.bad_activity_level":
    "That is not one of the four activity answers.",
  // ── LE MEMBRE DE RÉFÉRENCE (FF-043) — EN COURS DE DÉMÉNAGEMENT ──────────
  // ⚠️ CES QUATRE CLÉS SONT REMPLACÉES PAR `plan.reference.*`, ET ELLES SONT
  // ENCORE LÀ EXPRÈS: leur lecteur (`HouseholdPage.tsx`) n'a pas encore bougé,
  // et retirer une clé avant son lecteur ne compile pas. Elles partent dans le
  // commit qui déplace la carte. N'écris aucun lecteur NEUF dessus.
  //
  // ⚠️ LE LIBELLÉ DIT QUI, JAMAIS POURQUOI, et il ne nomme AUCUN objectif.
  // « Whose way of eating the shared dish follows » est une phrase de méthode;
  // « qui est au régime » serait un verdict lu par toute la table.
  //
  // ⚠️ ET IL NE PROMET PAS DE PORTION. Le référent ne change pas la taille de
  // la casserole — elle se dimensionne sur le plus petit besoin de la table.
  "household.reference.title": "Whose way of eating the shared dish follows",
  "household.reference.hint":
    "When two grown-ups here follow different methods, the shared dish can only follow one of them. Pick whose. It changes what we cook, never how much anyone gets — helpings are worked out per person either way.",
  // LE DÉFAUT, NOMMÉ. « Personne » se lirait comme une panne.
  "household.reference.default": "Whoever is composing that week",
  "household.reference.saved": "Saved.",
  // LES DEUX REFUS QUE LA CIBLE PEUT PRODUIRE. Ils sont rares (le sélecteur ne
  // propose que des adultes) et ils arrivent: deux onglets, ou une date saisie
  // entre le chargement et le clic.
  "household.error.minor_cannot_be_reference":
    "The shared dish follows a grown-up's method, not a child's.",
  "household.error.age_unknown_cannot_be_reference":
    "Add their date of birth first — without it we do not know whether they are a grown-up.",
  "household.error.not_your_household": "That is not your household.",
  "household.error.bad_first_name": "A first name is between 1 and 40 characters.",
  "household.error.bad_birth_date": "That date is in the future.",
  "household.error.bad_goal": "That direction is not one we know.",
  "household.error.bad_label": "That is either empty or too long (120 characters).",
  // LA FORME EST REFUSÉE, LE CONTENU NE L'EST PAS: un jour qu'on ne reconnaît
  // pas est écarté à la lecture, sans faire tomber le reste (FF-002 §7). Ce
  // motif-ci ne devrait donc jamais atteindre quelqu'un qui passe par la
  // grille — il dit qu'un client a envoyé autre chose qu'une liste.
  "household.error.bad_away": "We could not read those days.",
  // ── LES TROIS REFUS DE LA RÉPONSE HEBDOMADAIRE (L6, RPC de L3) ───────────
  // `not_adult` COUVRE AUSSI L'ÂGE INCONNU, et la phrase doit le dire: renvoyer
  // « they are not an adult » à propos de quelqu'un dont on ignore la date
  // affirmerait un fait que personne n'a énoncé. Ce refus est atteignable
  // MALGRÉ le filtre de l'écran: une date de naissance peut changer dans un
  // second onglet entre le rendu et le clic.
  "household.error.bad_work_lunch": "We could not read that answer.",
  "household.error.not_adult":
    "This question is only asked about adults, and their date of birth is what " +
    "decides. Add it above, and it can be answered.",
  // Le plafond de 42 entrées d'absence par bouche, en base. Personne ne peut
  // l'atteindre par cet écran; il dit qu'une ligne est déjà pleine.
  "household.error.too_many_away":
    "There are already too many days marked for them. Clear a few in the grid " +
    "first.",
  // LES HABITUDES D'UNE BOUCHE (2026-08-14). `bad_slots` dit que la forme n'est
  // pas lisible OU qu'un « something of their own » est resté sans mots; le
  // formulaire l'empêche déjà, donc ce motif dit surtout qu'un client a envoyé
  // autre chose. `bad_note` porte le plafond partagé de `plan_draft_note.ts`.
  "household.error.bad_slots":
    "We could not read those habits. Every moment marked as their own needs a few words.",
  "household.error.bad_note": "That note is either empty or too long (280 characters).",
  "household.error.household_full":
    "Eight is the most a household can hold. Remove someone first.",
  "household.error.not_owner": "Only the person who runs the household can do this.",
  // ── LOT C · un interdit de maison ne vise qu'un mineur (§8.5 règle 1) ────
  // ⚠️ ELLE DIT QUOI FAIRE, parce que les deux causes sont différentes: un
  // majeur (rien à faire ici, et c'est voulu) ou une bouche sans date de
  // naissance (il suffit de la renseigner). Un refus qui ne distingue pas les
  // deux se lit comme une panne.
  "household.error.not_a_minor":
    "A house rule can only be set for a child. If this is your child, add their date of birth on their card first.",
  "household.error.not_a_member": "That person is not in your household.",
  "household.error.not_your_line": "You can only change your own line.",
  "household.error.no_household": "You are not in a household.",
  "household.error.cannot_remove_owner":
    "The person who runs the household cannot be removed from it.",
  "household.error.cannot_detach_owner":
    "The person who runs the household cannot lose access to it — nobody else could compose a meal.",
  "household.error.not_claimed":
    "They have no account here, so there is no access to remove.",
  "household.error.not_found": "That is already gone.",
  // ── LES DEUX NATURES D'UNE CONTRAINTE, DEMANDÉES À L'ÉCRAN ───────────────
  // La question n'est pas une commodité de rangement: la réponse change ce que
  // le produit fait. Une allergie gouverne toute la casserole et rien ne se
  // compose sans elle; une règle de maison est une décision du foyer, gardée
  // telle quelle, et jamais présentée comme un conseil de santé.
  "household.constraint.kind": "What is it?",
  "household.constraint.kind.allergy": "An allergy",
  "household.constraint.kind.allergy_hint":
    "Medical. It rules the whole pot, for everyone at the table, and nothing gets cooked without it.",
  "household.constraint.kind.house_rule": "Something this house does not serve",
  "household.constraint.kind.house_rule_hint":
    "Your call as the household. We keep it, and we never dress it up as health advice.",
  // ── LOT C · POURQUOI IL N'Y A PAS DE CHOIX ICI (§8.5 règle 1) ────────────
  // ⚠️ ELLE DIT LA RÈGLE, PAS UN ÉTAT DE CHARGEMENT. Un contrôle qui disparaît
  // sans un mot se lit comme une panne; celui-ci disparaît pour une raison qui
  // se défend, et qui protège la personne en face.
  "household.constraint.house_rule_minor_only":
    "House rules are for children only. A grown-up at this table decides what they eat.",
  "household.allergy.placeholder": "Peanuts",
  "household.allergy.add": "Add the allergy",
  "household.allergy.remove": "Remove",
  // ── L'INVITATION EST UNE RÉCLAMATION DE PROFIL (lot 6) ───────────────────
  // Elle n'ajoute personne au foyer: elle donne à quelqu'un le moyen de poser
  // son compte sur une ligne QUI EXISTE DÉJÀ. D'où la question « qui ? » avant
  // « quelle adresse ? », et d'où `household.invite.grants`, qui dit au maître
  // ce qu'il est en train de promettre — c'est lui qui écrit le message
  // d'accompagnement, et une promesse que la base dément est la sienne.
  // ── FF-064 · L'ACCÈS SUPPLÉMENTAIRE, VU DEPUIS LA FACTURE ───────────────
  // ⚠️ `household.extra.when` EST LA PHRASE QUI EMPÊCHE UNE FAUSSE PROMESSE.
  // Choisir quelqu'un ici n'ouvre pas un paiement pour lui: la quantité
  // facturée est DÉRIVÉE des profils RÉCLAMÉS
  // (`keel_household_billable_profiles`), pas des invitations envoyées. Sans
  // cette ligne, l'écran laisse croire qu'on achète une place.
  "household.extra.title": "An extra personal access",
  "household.extra.when":
    "It is added to your subscription the day they claim their access — not before.",
  "household.extra.pick": "Choose someone",
  "household.invite.title": "Let someone claim their profile",
  "household.invite.body":
    "Their portions, their allergies and what this house does not serve are already on their line. Claiming it attaches their account to that same line — nothing is created, nothing is lost.",
  "household.invite.grants":
    "What they get: they read the household plan and set their own direction. Not: composing, adding or removing anyone, or deciding what the house does not serve.",
  "household.invite.who": "Who is this for?",
  "household.invite.who_hint":
    "Only people who have no account yet are listed. The link claims that exact line.",
  "household.invite.nobody_left":
    "Everyone here already has an account. Add someone first, then invite them.",
  "household.invite.email": "Their email",
  "household.invite.submit": "Create the invitation",
  "household.invite.working": "Creating...",
  // ⚠️ `{name}` EST LOAD-BEARING: le maître émet plusieurs liens dans la même
  // minute, et un lien anonyme part à la mauvaise personne.
  "household.invite.link_ready":
    "Send this link to claim {name}'s profile. It works once, for that address, and expires in 14 days.",
  "household.invite.error.rate_limited": "That is enough invitations for today.",
  "household.invite.error.bad_email": "That address does not look usable.",
  "household.invite.error.not_owner": "Only the person who runs the household can invite.",
  "household.invite.error.already_claimed":
    "That line already has an account on it. Nothing to claim.",
  // ── LE CONSENTEMENT A DISPARU (lot 2, 2026-08-10) ────────────────────────
  // `household.consent.*` et `household.join.consent_notice` décrivaient un
  // majeur qui accorde puis révoque le droit d'être restreint. Le modèle arrêté
  // le 2026-08-08 dit qu'une seule personne gouverne le menu; LA CONTREPARTIE
  // est plus bas et elle est toujours là — `notice_owner` nomme qui a décidé.
  // Six clés retirées au lot 4, après vérification qu'aucune n'avait plus
  // d'appelant hors de ce fichier.
  "household.restriction.title": "Foods this household does not serve",
  "household.restriction.add": "Add it",
  // `household.restriction.for_whom` est partie au lot 4: la contrainte se pose
  // sur la ligne de la personne qu'on regarde, il n'y a plus de sélecteur.
  "household.restriction.placeholder": "Nutella",
  "household.restriction.notice_owner": "Not served here — {owner} decided that.",
  "household.restriction.notice_me": "You decided that.",
  "household.restriction.remove": "Remove",
  // `household.restriction.blocked.*` (quatre clés) est parti au lot 4.
  // `restrictionBlock` les rendait: il anticipait le refus de la base pour
  // griser un bouton, sur des règles qui n'existent plus (colocation,
  // consentement du majeur). Les refus que la base rend encore sont
  // structurels, et ils passent par `household.error.*` ci-dessus.
  // ── LES ENVIES ET « À TABLE » — PARTIES SOUS `plan.envy.*` / `plan.table.*` ──
  // CINQ CLÉS ÉTAIENT DÉJÀ PARTIES AVEC LE CONSEIL DE FAMILLE: `envy.saved`
  // (déjà orpheline), `envy.spoken`, `envy.silent` et `compose.silent_note` —
  // les trois dernières rendaient un décompte de silencieux, qui se lit « il en
  // reste 3 à relancer » quoi qu'on écrive à côté.
  //
  // ⚠️ NE PAS LES REMETTRE SOUS UNE AUTRE FORME. « 2/5 ont répondu », une
  // pastille, un bouton « relancer »: tous recréent la charge mentale que le
  // produit promet de supprimer.
  //
  // ── ET MAINTENANT L'ENVIE ELLE-MÊME A CHANGÉ D'ÉCRAN ────────────────────
  // Elle était posée sur la page du foyer, loin du geste qu'elle sert. Elle est
  // désormais UN CHAMP DE LA DEMANDE DE PLAN (`plan.envy.*`), donc elle part
  // avec le formulaire et n'a plus de bouton propre — d'où `envy.save`
  // SUPPRIMÉE, pas déménagée.
  //
  // `household.compose.*` (quatre clés) est SUPPRIMÉE et ne revient pas: la
  // carte qui les rendait demandait le BUDGET SEUL et codait la fenêtre en dur
  // (« d'ici dimanche »). La demande complète est sur `/app/plan`, pour tout le
  // monde, maître compris.
  //
  // `household.portions.*` part sous `plan.table.*`: « À table » dit comment on
  // SERT ce que le plan dit qu'on cuisine, et se lisait sur un écran qui ne
  // montrait pas le plan.
  //
  // ⚠️ LES DIX CLÉS CI-DESSOUS SONT ENCORE LÀ EXPRÈS: leurs lecteurs
  // (`HouseholdPage.tsx`) n'ont pas encore bougé, et retirer une clé avant son
  // lecteur ne compile pas. Elles partent dans le commit qui déplace les
  // cartes. N'écris aucun lecteur NEUF dessus.
  "household.envy.title": "What does the house feel like this week?",
  "household.envy.body":
    "One line, for everyone. Write it before the plan is made — nobody else has to fill anything in, and leaving it empty is fine.",
  "household.envy.placeholder": "Lea wants pasta, Marc is sick of chicken.",
  "household.envy.save": "Save it",
  "household.compose.title": "Make this week's plan",
  "household.compose.body":
    "One cooking session, portions that follow each person's direction, and the shopping split by when it has to be fresh.",
  "household.compose.submit": "Compose for the household",
  "household.compose.working": "Composing...",
  "household.portions.title": "At the table",
  "household.portions.standard": "A standard serving",

  "household.waves.title": "Shopping",
  "household.waves.now": "Buy now",
  "household.waves.on": "Buy on {date}",
  "household.waves.reason": "for the {day} cooking",

  // ══════════════════════════════════════════════════════════════════════════
  // L8 — LES ÉCRANS DE LA FUSION (D9)
  //
  // Autorité produit: docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md.
  //
  // ── LA RÈGLE D'ÉCRITURE DE TOUT CE BLOC ─────────────────────────────────
  // On dit la DIVERGENCE, jamais la personne comme fautive. « Le plan de Zoé
  // n'a pas pu être fusionné » est faux ET blessant: rien n'a échoué, deux
  // directions ne se servent simplement pas de la même casserole. Chaque
  // phrase ci-dessous nomme un FAIT (« son plan couvre les mêmes jours ») et
  // jamais une défaillance.
  //
  // ── CE QU'AUCUNE PHRASE D'ICI N'A LE DROIT DE DIRE ──────────────────────
  // Un objectif, un poids, un nombre de calories, le « pourquoi » d'un plat.
  // Le plan du foyer est lu À VOIX HAUTE PAR TOUT LE FOYER. Les gardes de
  // non-divulgation du serveur (`household_voices.ts`, `household_portions.ts`)
  // portent ces termes; les contredire à l'écran annulerait les deux.
  // ══════════════════════════════════════════════════════════════════════════

  // ── LA PROPOSITION DE FUSION (D8, D10) — compte maître seulement ────────
  "household.merge.title": "Someone is cooking on their own",
  "household.merge.body":
    "They built a plan of their own and validated it. You can fold it into the household plan, or leave it — in every case they keep their plan.",
  // L'ÉTAT « RIEN À MONTRER », RÉDIGÉ. Ce dépôt a mesuré qu'un écran qui se
  // vide est son pire échec: sans cette phrase, « personne n'a pris la main »
  // et « la lecture a échoué » seraient le même blanc.
  "household.merge.none":
    "Nobody in the household is cooking on their own right now. Everyone eats from the household plan.",
  "household.merge.merge_cta": "Fold their plan in",
  "household.merge.unmerge_cta": "Rebuild without them",
  "household.merge.dismiss_cta": "Leave it",
  "household.merge.working": "Working...",
  // D8 — L'AVERTISSEMENT. Il parle du plan DU MAÎTRE, pas de celui d'un autre:
  // sa ligne vivante contient la reprise d'un plan que l'intéressé a remplacé.
  "household.merge.revalidated_title": "A plan you folded in has moved on",
  "household.merge.revalidated_body":
    "The household plan still cooks what they had validated when you folded it in. They have validated a newer one since.",
  // D16 — la fenêtre, en clair. Les nombres viennent du serveur; l'écran les
  // range dans une phrase, il n'en recalcule aucun.
  "household.merge.window": "Days that would be folded in: {days}, from {from}.",
  "household.merge.window_past": "{days} of their days are already behind us.",
  // D1 — LA MOITIÉ DU GESTE QUE « jours repris » NE DIT PAS. Quand leur plan
  // s'arrête avant la fin de la semaine du foyer, la fusion refait la semaine
  // jusqu'au bout: sans ça, la fin de semaine se retrouverait sans aucun plan.
  "household.merge.window_rebuilt":
    "The household's {days} remaining days get rebuilt, so the end of the week keeps a plan.",
  "household.merge.unmerge_window": "Rebuilding would redo {days} day(s) from {from}.",
  // ── L7/D11 — LE PLAFOND, VISIBLE AVANT D'ÊTRE ATTEINT ───────────────────
  // « 2 fusions restantes cette semaine » est une ligne de L8, écrite parce
  // qu'un plafond qui ne se voit qu'au moment du refus se lit comme une panne.
  "household.merge.quota_left": "{remaining} of {limit} merges left this week.",
  "household.merge.quota_none":
    "This household has used all {limit} of its merges for the week. Nothing is lost — it starts again on {date}.",
  // D17 — LE RÉGLAGE DISCRET. Assumé « un peu brutal », donc il ne vit pas sur
  // la carte de proposition: il est rangé dans la fiche de la personne.
  "household.merge.mute": "Stop suggesting I merge their plan",
  "household.merge.mute_hint":
    "Their plan still exists and you can still fold it in whenever you want. You just stop being asked.",
  "household.merge.unmute": "Suggest their plan again",
  "household.merge.muted": "You are not being asked about their plan.",
  // POURQUOI LES AUTRES BOUCHES N'APPARAISSENT PAS. Jamais un silence: le
  // serveur nomme chaque motif, l'écran le rend.
  "household.merge.skipped_title": "Not being suggested",
  "household.merge.skip.member_is_owner": "This household's plan is already yours.",
  "household.merge.skip.no_validated_plan":
    "They have not validated a plan of their own.",
  "household.merge.skip.proposals_muted": "You asked not to be asked about them.",
  "household.merge.skip.dismissed_by_owner":
    "You left this one. If they validate another plan, the question comes back.",
  "household.merge.skip.already_merged":
    "Their plan is already folded into the household plan.",
  "household.merge.skip.merge_quota_exhausted":
    "The household has used its merges for this week.",
  // CE QUE LA PROCHAINE COMPOSITION REPRENDRA D'OFFICE (la fusion est
  // collante, L5). Sa PORTÉE compte: hors de cette fenêtre, elle ne colle pas.
  "household.merge.held": "Folded in until {to}: the next plan for those days keeps them.",
  "household.merge.frozen":
    "The household is paused, so nothing new can be composed. What is below is still true.",
  "household.merge.load_failed":
    "The suggestions could not be read. Nothing is shown rather than something wrong.",
  // LE MAÎTRE ACCÈDE À TOUS LES PLANS — mais sa surface de cuisine n'affiche
  // que celui qu'il cuisine (D9). D'où un dépliant, et jamais une carte.
  "household.merge.open_plan": "See what their plan cooks",
  "household.merge.close_plan": "Hide their plan",
  "household.merge.plan_empty": "Their plan has no dish we can read.",
  "household.merge.plan_unreadable": "Their plan could not be read.",

  // ── CE QUI N'A PAS FUSIONNÉ, ET POURQUOI (D9, seconde moitié) ───────────
  "household.plan.title": "What this plan cooks, and for whom",
  // LA PHRASE PÉDAGOGIQUE DU LOT, mot pour mot l'arbitrage: ce n'est pas le
  // système qui est nul, c'est la recherche d'un compromis qui est difficile.
  "household.plan.divergence":
    "Nothing failed here. Two directions cannot always come out of the same pan — when they cannot, they are cooked apart.",
  "household.plan.taken":
    "{name} is eating from a plan of their own over these days, so this one does not cook for them.",
  "household.plan.partial":
    "{name} has a plan of their own that covers only part of these days, so this one still cooks for them.",
  "household.plan.reclaimed": "{name}'s plan was folded into this one.",
  "household.plan.unmerged": "This plan was rebuilt without {name}.",
  // L5 §4 — `covers_window: false` était tracé et rien n'agissait dessus.
  // C'est le seul endroit du produit où quelqu'un peut apprendre qu'une
  // personne n'a rien à manger certains jours.
  "household.plan.unmerged_uncovered":
    "Their own plan does not cover every one of those days.",
  // O5 — LE BARREAU DEMANDÉ N'A PAS ÉTÉ TENU. Le serveur le CONSTATE et ne
  // corrige pas; le taire ici laisserait un plan qui se contredit lui-même.
  "household.plan.merge_shape_unmet":
    "This merge asked for something cooked apart, and what came back is one pot for everyone. Check the portions before you serve.",
  "household.plan.no_dishes":
    "This plan has no dish we can read. Compose it again from the household page.",

  // ── LE PLAN DU FOYER, VU PAR UN SECONDAIRE ──────────────────────────────
  "household.plan.member_title": "What the household is cooking",
  "household.plan.member_excluded":
    "These days you are eating from your own plan, so the household plan does not cook for you.",
  "household.merge.error.muted_required": "That switch sent no value.",
  "household.merge.error.validated_at_required": "That suggestion carried no date.",
  "household.merge.error.member_is_owner": "That line is yours.",
  "household.merge.error.no_validated_plan":
    "They have no validated plan any more, so there is nothing to leave.",
  // Le piège nommé au registre: la date envoyée doit être celle de la NOTICE
  // (`dismiss_validated_at`), pas celle du plan montré. Quand les plans ont
  // bougé entre l'affichage et le clic, la base refuse — et la bonne réponse
  // est de relire, pas de réessayer avec la même date.
  "household.merge.error.notice_moved_on":
    "Their plans have changed since this was shown. Reload to see where things stand.",
  "household.member.diet": "How they eat",
  // Les MÊMES mots que `setup.people.diet_*`, dans le namespace de cette
  // page: la liste des jetons est partagée (`DIET_ANSWERS`), les libellés ne
  // traversent pas la couture (`pageSeams.int.test.ts`).
  "household.member.diet_omnivore": "Eats everything",
  "household.member.diet_vegetarian": "Vegetarian",
  "household.member.diet_vegan": "Vegan",
  "household.member.diet_pescatarian": "Pescatarian",
  "household.member.diet_gluten_free": "Gluten-free",
  "household.member.diet_hint":
    "It rules every dish we compose for the household. The shared dish follows the strictest line at the table.",
  "household.member.diet_from_profile":
    "They have an account: how they eat is set in their own \u00ab about you \u00bb.",
  "household.error.bad_diet": "That is not one of the four answers.",
  "household.error.has_account":
    "They have an account: this is set in their own \u00ab about you \u00bb, not here.",
  // L5 · les refus des portes du poids visé et du rythme (20260818190000).
  "household.error.target_incomplete":
    "A target weight and a pace go together — one without the other has nowhere to land.",
  "household.error.bad_target_weight": "That target is outside 25 to 400 kg.",
  "household.error.bad_pace": "That pace is outside what we can cook towards.",
  "household.error.target_needs_direction":
    "A target only exists when the scale is meant to move. Pick losing or gaining first.",
  "household.error.no_member_id":
    "They were added, but we did not get their line back — reopen the household and finish their card.",
  // ── L5 · LE POP-UP « UNE BOUCHE » (2026-08-18) ──────────────────────────
  // Six blocs, trois obligatoires. Il s'ouvre à chaque ajout de personne, MAÎTRE
  // COMPRIS — sans quoi celui qui tient la maison serait le seul dont on ne sait
  // rien. ⛔ Aucune clé ne demande « adulte ou enfant »: la date de naissance le
  // dit, et poser la question en plus ouvre deux réponses qui se contredisent.
  "household.mouth.title": "Someone who eats here",
  "household.mouth.later": "Later",
  "household.mouth.block_habits": "what they already eat",
  "household.mouth.block_allergies": "allergies",
  "household.mouth.block_tastes": "dislikes and diet",
  // ⟳ 2026-09-20 — "optional" moved onto the GESTURE. The label used to give
  // an order ("Fill in …") while the one sentence saying nothing is required
  // (`preferences_intro`) lived INSIDE the window — read only after the click
  // was paid for, and this door is rendered once PER MOUTH. Nothing behind it
  // holds the funnel: see the long note on the French side for the three
  // places in `api/onboarding.ts` that prove it. The NOUN is unchanged on
  // purpose — the window titles itself after the button that opened it.
  "household.mouth.preferences_open":
    "Their food preferences (optional)",
  "household.mouth.preferences_open_you":
    "Your food preferences (optional)",
  "household.mouth.preferences_saved": "{name}’s preferences are saved.",
  "household.mouth.preferences_title": "Food preferences",
  // The line under the section title on both `/app/setup` cards. No pronoun
  // on purpose: the same line serves the "You" card and every added person.
  "household.mouth.preferences_section_hint":
    "Allergies, refused foods, diet, meal habits.",
  "household.mouth.preferences_title_named": "{name} — food preferences",
  "household.mouth.preferences_intro":
    "None of this is required. It sharpens the plan; it does not decide its shape.",
  // ⟳ 2026-09-20 — no longer a list of holes. It named the four empty blocks
  // in the same voice as `household.mouth.held` ("Still missing: …"), which
  // does hold. It now says what the absence costs: nothing.
  "household.mouth.preferences_empty":
    "Nothing noted — the plan composes without it. This can be filled in later.",
  "household.mouth.preferences_filled": "Already noted: {blocks}.",
  "household.mouth.preferences_done": "Save",
  "household.mouth.save": "Save",
  "household.mouth.add": "Add them",
  "household.mouth.fold": "Hide",
  "household.mouth.unfold": "Open",
  // CE QUI RETIENT LE BOUTON EST NOMMÉ, et rendu À CÔTÉ du bouton: un bouton
  // grisé sans phrase est le mode d'échec n°1 de ce dépôt.
  "household.mouth.held": "Still needed: {blocks}.",
  "household.mouth.block_identity": "their name and birth date",
  // ⟳ 2026-09-06 — suit le titre du bloc: voir `fr.ts`.
  "household.mouth.block_direction": "what they are after",
  // ⟳ 2026-09-06 — « and how active they are » RETIRÉ: voir `fr.ts`.
  "household.mouth.block_body": "height, weight and sex",
  // ── BLOC 1 ──────────────────────────────────────────────────────────────
  "household.mouth.identity": "Who they are",
  "household.mouth.identity_hint":
    "The name is how the plan labels their serving — a serving with no name is dropped in silence.",
  "household.mouth.identity_hint_you":
    "Your name is how the plan labels your serving — a serving with no name is dropped in silence.",
  "household.mouth.age_unknown":
    "We cannot read that date, so no direction will apply to them yet.",
  // ── BLOC 2 ──────────────────────────────────────────────────────────────
  // ⟳ 2026-09-06 — voir la note de `fr.ts`: le titre nomme l'intention, plus
  // l'effet sur la balance. Mots de `setup.mouths.goal` / `setup.people.goal`.
  "household.mouth.direction": "What they are after",
  "household.mouth.direction_you": "What you are after",
  "household.mouth.direction_hint":
    "Down, up, or nowhere. Picking down or up opens a target and a pace.",
  "household.mouth.target_weight": "Weight they are aiming for (kg)",
  "household.mouth.target_weight_hint":
    "With the pace below, this gives a date to arrive on.",
  "household.mouth.target_refused_implausible":
    "That is outside what we can work with (25 to 400 kg).",
  "household.mouth.target_refused_wrong_direction":
    "That goes the other way from the direction picked above.",
  "household.mouth.target_refused_below_energy_floor":
    "Getting there would put their day below the energy floor. Pick a target a little further up.",
  "household.mouth.pace": "How fast",
  // ⛔ `pace_hint` / `pace_hint_you` retirées le 2026-09-01 — voir le pack FR.
  "household.mouth.pace_value": "{pace} kg a week",
  // ⟳ 2026-09-22 — le cran ENREGISTRÉ contre le cran CUISINÉ. Voir le pack FR.
  "household.mouth.pace_executed":
    "Saved at {chosen} kg a week. The plan only cooks {executed} — past that, this body has no room left.",
  // ⚠️ DEUX ÉCRANS DIFFÉRENTS, ET C'EST LE CONTRAT DU TYPE `PaceCeiling`:
  // `null` = « je ne connais pas ce corps », `0` = « je le connais, et il n'a
  // pas de marge ». Jamais un curseur de 0,05 à 0 — un contrôle mort se lit
  // comme un bouton cassé.
  "household.mouth.pace_needs_body":
    "Fill in height, weight and sex just above, and the pace slider appears here.",
  "household.mouth.pace_no_margin":
    "There is no room to lose weight from this body without going under the energy floor. The direction still shapes their servings.",
  "household.mouth.arrival": "About {weeks} weeks at this pace.",
  // ── BLOC 3 ──────────────────────────────────────────────────────────────
  "household.mouth.who_fallback": "this person",
  "household.mouth.body":
    "Their body",
  "household.mouth.body_you":
    "Your body",
  "household.mouth.body_hint":
    "Used to size servings. It is never said out loud, and never printed next to a name at the table.",
  // ── ② L'ACTIVITÉ EN DEUX AXES (2026-08-20) ────────────────────────────
  // Une JOURNÉE n'est pas un SPORT. Les quatre crans qui les mélangeaient
  // forçaient à n'en dire qu'un: quelqu'un d'assis qui court deux fois par
  // semaine héritait de 1,80 au lieu de ~1,60 — 239 kcal/jour fabriqués par la
  // forme de la question.
  //
  // ⛔ ICI VIVAIENT `household.mouth.activity*` (7 clés), RETIRÉES LE
  // 2026-09-06 avec le champ qu'elles nommaient: la fiche posait les deux
  // formes de la question l'une au-dessus de l'autre depuis que le lot A5 l'a
  // montée dans l'étape 2 de l'entonnoir. Le vocabulaire du cran n'est pas
  // perdu — il reste sous `setup.activity.*`, gardé exprès tant qu'une fiche
  // peut porter un repli `legacy`.
  //
  // ⚠️ ET LES SIX OPTIONS DES DEUX AXES SONT PARTIES AVEC. Elles vivent sous
  // `setup.day_activity.*` / `setup.sport.*`, le seul des deux catalogues à
  // porter une PAIRE par jeton (titre court + explication). Ce qui reste ici
  // est ce que ce catalogue n'a pas: la voix de la fiche, qui NOMME la
  // personne.
  "household.mouth.day_activity": "{who}'s day",
  "household.mouth.day_activity_you": "Your day",
  "household.mouth.day_activity_hint":
    "Work and daily life, sport aside. Sport is the next question.",
  "household.mouth.sport": "Sport, for {who}",
  "household.mouth.sport_you": "Sport, for you",
  "household.mouth.sport_hint":
    "Sessions per week, the day aside. \"None\" is an answer, and it counts.",
  // ── ① LA STRUCTURE DU REPAS (2026-08-20) ───────────────────────────────
  // Le plan ne compose QUE le plat. Sans ces trois réponses, il fait porter au
  // seul plat une part MOYENNE du repas — juste par accident pour qui prend
  // pain, fromage et dessert, et près de deux fois trop petite pour qui ne
  // prend que du pain.
  "household.mouth.meal_structure": "What else is on {who}'s plate",
  "household.mouth.meal_structure_you": "What else is on your plate",
  "household.mouth.meal_structure_hint":
    "The plan only builds the main dish. Tell it what comes alongside.",
  "household.mouth.takes_dessert": "A dessert, a fruit or a yoghurt?",
  "household.mouth.takes_cheese": "Cheese?",
  "household.mouth.takes_bread": "Bread?",
  "household.mouth.answer_yes": "Yes",
  "household.mouth.answer_no": "No",
  // ── ⟳ 2026-09-23 · LES À-CÔTÉS, PAR PERSONNE ──────────────────────────
  // Entrée / fromage / dessert / pain, en TROIS états par type: « Selon
  // l'objectif » (clé absente — le défaut de son objectif), « Oui » (voulu),
  // « Non » (jamais). Écrit au déjeuner ET au dîner
  // (`household_member_habits.slots[].side_courses`). ⚠️ Ce n'est PAS la
  // question `takes_*` au-dessus: ces colonnes portaient le sens inverse, et
  // leurs valeurs sont périmées. Les types d'à-côté viennent de
  // `_shared/keel/side_courses_types.ts` (`SIDE_COURSE_KINDS`).
  "household.mouth.side_courses.title": "Does {who} have a starter, cheese, dessert or bread?",
  "household.mouth.side_courses.title_you": "Do you have a starter, cheese, dessert or bread?",
  "household.mouth.side_courses.hint":
    "Choose “Based on the goal” and you let Sophia decide whether they come with lunch or dinner.",
  "household.mouth.side_courses.starter": "Starter",
  "household.mouth.side_courses.cheese": "Cheese",
  "household.mouth.side_courses.dessert": "Dessert",
  "household.mouth.side_courses.bread": "Bread",
  "household.mouth.side_courses.auto": "Based on the goal",
  "household.mouth.side_courses.yes": "Yes",
  "household.mouth.side_courses.no": "No",
  // ── ⑤ L'APPÉTIT (2026-08-20) — ET IL EST TRANSITOIRE ──────────────────
  // ⚠️ LES LIBELLÉS NE DEMANDENT PAS « as-tu faim ». Les ±10 % sont
  // l'incertitude inter-individuelle de Mifflin-St Jeor, pas un curseur de
  // confort: la question est « la formule tombe-t-elle juste sur moi ? ».
  // Demander l'appétit obtiendrait une réponse à une autre question.
  "household.mouth.appetite": "How big is {who}’s appetite?",
  "household.mouth.appetite_you": "How big is your appetite?",
  // Voir la note de `fr.ts`: la phrase sur les ±10 % est partie le 2026-09-01,
  // et la comparaison qui reste porte un pronom — donc elle est voisée.
  //
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-10 · LOT 7 — CE QUE « APPÉTIT » VEUT DIRE, ENFIN ÉCRIT.
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ LA COPIE LAISSAIT LIRE « MOINS DE CALORIES », ET C'EST FAUX DEPUIS LE
  // RENVERSEMENT DU 2026-09-10. Le facteur (0,90 / 1,00 / 1,10) ne touche plus
  // l'énergie: il est posé sur les BORNES DE MASSE de l'assiette
  // (`plateBoundsFor`, `portion_sizing.ts`). « Avoir bon appétit ne fait pas
  // dépenser 10 % de plus » — posé sur l'entretien, il annulait en silence une
  // part du déficit de quelqu'un qui perd du poids parce qu'il aime manger.
  //
  // À énergie CONSTANTE: petit appétit ⇒ assiette plus dense et plus petite;
  // grand appétit ⇒ assiette plus volumineuse. C'est ce que la légende dit
  // maintenant, parce que quelqu'un qui croit choisir ses calories ici répond à
  // une autre question que celle qu'on pose.
  //
  // ⚠️ « À carrure égale » RESTE, et reste load-bearing: sans elle, la question
  // se relit « as-tu faim ».
  //
  // ⛔ ET LA PHRASE NE NOMME PAS UNE ÉNERGIE, MÊME POUR DIRE QU'ELLE NE BOUGE
  // PAS. `mouthFormDialog.int.test.ts` interdit « kcal », « calorie », « kg » et
  // « poids » sur toute cette fiche: un compte de moments est une STRUCTURE, il
  // ne traverse aucune des quatre portes de l'énergie, et il ne doit jamais
  // s'accompagner d'un chiffre sur le corps. D'où « what the day aims for »,
  // qui dit la même chose sans poser le mot.
  // ⟳ 2026-09-18 — the question now asks for the appetite in plain words and the
  // three answers are one word each (see the French note: this reverses the
  // « we do not ask about appetite » rule above, on the owner's call). The hint
  // is what still protects the reading: it names what the answer moves — the
  // VOLUME on the plate — and what it does not.
  "household.mouth.appetite_hint":
    "At the same build. This does not change what the day aims for — only how full {who}’s plate is.",
  "household.mouth.appetite_hint_you":
    "At the same build. This does not change what the day aims for — only how full your plate is.",
  // ⚠️ LES TROIS LIBELLÉS PARLENT DE VOLUME, PAS DE QUANTITÉ D'ÉNERGIE. « Less »
  // seul se lisait « moins à manger »; ici on nomme l'assiette, qui est très
  // exactement ce que le facteur déplace.
  "household.mouth.appetite_small": "Small",
  "household.mouth.appetite_average": "Average",
  "household.mouth.appetite_large": "Large",
  // ── BLOC 4 ──────────────────────────────────────────────────────────────
  // ── LA QUESTION DES MOMENTS A CHANGÉ D'ÉCRAN LE 2026-08-19 ────────────
  // Elle vivait à l'étape 3, deux écrans après « ce qu'elle mange déjà » —
  // qu'elle dimensionne. On demandait donc six repas à quelqu'un sans lui avoir
  // demandé combien il en fait.
  "household.mouth.eating": "When {who} eats, and what",
  "household.mouth.eating_you": "When you eat, and what",
  "household.mouth.eating_hint":
    "Tick the moments {who} really eats — each one opens a place to say what already happens there.",
  "household.mouth.eating_hint_you":
    "Tick the moments you really eat — each one opens a place to say what you already have there.",
  "household.mouth.habit_field": "Any habits?",
  // See fr.ts: the word is bare — the leading "+" is drawn by the screen, and
  // disappears once the bubble is on: it then STATES what is set, it no longer
  // offers to add it.
  "household.mouth.light": "light meal",
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-10 · LOT 7 — CE QUE « LÉGER » FAIT, ET CE QU'IL NE FAIT PAS.
  // ══════════════════════════════════════════════════════════════════════
  //
  // Il fait DEUX choses, et la légende n'en disait qu'une:
  //   · la part de ce moment dans la journée baisse, et les autres moments
  //     reprennent la différence (`LIGHT_SLOT_WEIGHT`);
  //   · son plancher de densité passe de 1,0 à 0,6 kcal/g (`plateBoundsFor`),
  //     donc l'assiette peut rester du même volume pour moins d'énergie.
  //
  // ⛔ ET IL NE SUPPRIME PAS LE MOMENT. « Je ne prends pas de goûter » se dit
  // en ne DÉCLARANT pas le goûter — la confusion entre les deux ferait cocher
  // « léger » pour dire « rien », et le plan composerait quand même un repas.
  // ⟳ 2026-09-20 — shortened on request; see `fr.ts` for what was dropped
  // and why the density floor stays out of the wording.
  "household.mouth.light_hint":
    "This meal weighs less than usual; the others take up the difference.",
  // ⟳ 2026-09-15 — `portions_plan_only` was removed; see fr.ts for why.
  "household.mouth.habit_shaker_here": "{who}’s shaker sits at this moment.",
  "household.mouth.habit_shaker_here_you": "Your shaker sits at this moment.",
  "household.mouth.shaker_at": "When {who} takes it",
  "household.mouth.shaker_at_you": "When you take it",
  "household.mouth.shaker_at_loose": "Not at a named moment",
  "household.mouth.rhythm":
    "How many times a day {who} eats",
  "household.mouth.rhythm_you":
    "How many times a day you eat",
  "household.mouth.rhythm_hint":
    "Tick the moments when {who} actually eats.",
  "household.mouth.rhythm_hint_you":
    "Tick the moments when you actually eat.",
  "household.mouth.rhythm_house":
    "Nothing ticked means {who} eats at the house’s moments — not that {who} never eats.",
  "household.mouth.rhythm_house_you":
    "Nothing ticked means you eat at the house’s moments — not that you never eat.",
  "household.mouth.habits":
    "What {who} already eats",
  "household.mouth.habits_you":
    "What you already eat",
  "household.mouth.habits_hint":
    "Something daily that should not change?",
  "household.mouth.habits_hint_you":
    "Something daily you do not want changed?",
  "household.mouth.habits_only_declared":
    "Show only their moments",
  "household.mouth.habits_only_declared_you":
    "Show only your moments",
  // Voir la note de `fr.ts`: un exemple par moment, parce qu'un exemple qui ne
  // va pas avec la question apprend surtout que l'écran ne suit pas.
  "household.mouth.habit_placeholder_breakfast": "coffee and two slices of toast, a bowl of cereal…",
  "household.mouth.habit_placeholder_snack_am": "a piece of fruit, a handful of almonds…",
  "household.mouth.habit_placeholder_lunch": "a salad at the desk, yesterday's leftovers…",
  "household.mouth.habit_placeholder_snack_pm": "a yoghurt, a square of chocolate…",
  "household.mouth.habit_placeholder_dinner": "soup, pasta thrown together…",
  "household.mouth.habit_placeholder_before_bed": "herbal tea, some fromage blanc…",
  // ⚠️ MIS EN AVANT POUR QUI PREND DU POIDS, PROPOSÉ SANS INSISTANCE AUX
  // AUTRES: quelqu'un qui perd du poids peut très bien en prendre un, et ne pas
  // le demander le rendrait invisible au calcul.
  // ── LE BLOC DE L'APPORT CHIFFRÉ, REFAIT LE 2026-08-19 ─────────────────
  // « On ne comprend vraiment pas. » Il lui manquait un nom, un cadre, des
  // étiquettes sur ses trois nombres, et une phrase disant où il part.
  "household.mouth.shaker_title":
    "Their shake or snack",
  "household.mouth.shaker_title_you":
    "Your shake or snack",
  "household.mouth.shaker_summary":
    "One serving: {grams} g · {protein} g of protein · {kcal} kcal. Read it back — a protein typed into the calorie box looks exactly like a filled-in form.",
  "household.mouth.shaker_kept":
    "It is saved with the rest of the sheet, by the button at the bottom — there is nothing to save here.",
  "household.mouth.shaker_foreground":
    "Putting weight on usually means a shake or a measured snack. Add it and it counts inside the day instead of on top of it.",
  "household.mouth.shaker_background":
    "A shake or a measured snack? Add it and it counts inside the day.",
  "household.mouth.shaker_add": "Add a shake or measured snack",
  "household.mouth.shaker_label":
    "What {who} calls it",
  "household.mouth.shaker_label_you":
    "What you call it",
  "household.mouth.shaker_label_hint":
    "« my shake », « the morning thing » — their words, not yours.",
  "household.mouth.shaker_label_hint_you":
    "« my shake », « the morning thing » — your words.",
  "household.mouth.shaker_grams": "grams per serving",
  "household.mouth.shaker_protein": "protein (g)",
  "household.mouth.shaker_kcal": "energy (kcal)",
  // LES DEUX NOMBRES SE LISENT SUR L'ÉTIQUETTE DU POT: c'est un fait du
  // produit, pas un verdict sur la personne.
  "household.mouth.shaker_label_source":
    "All three are on the tub's label. Without them the shake is worked around instead of counted.",
  // Voir la note de `fr.ts`: le bouton s'active à une mesure, le moteur en
  // exige trois, et l'écran dit dans lequel des deux états on est.
  "household.mouth.shaker_save": "Save",
  "household.mouth.shaker_counted":
    "Saved, and counted inside the day: all three numbers are there.",
  "household.mouth.shaker_kept_not_counted":
    "Saveable, but not counted yet: the plan needs all three numbers to fold it in rather than cook around it. What you typed is kept.",
  "household.mouth.shaker_needs_one":
    "It needs a name and at least one of the three numbers to be saved.",
  // Voir la note de `fr.ts`: « counted » est un fait sur la base, et la fiche
  // d'ajout n'a pas encore de ligne où écrire.
  "household.mouth.shaker_with_the_card":
    "It leaves with the rest of the sheet, when you save it.",
  "household.mouth.shaker_remove": "Remove it",
  // ── BLOC 6 ──────────────────────────────────────────────────────────────
  "household.mouth.tastes":
    "What {who} will not eat",
  "household.mouth.tastes_you":
    "What you will not eat",
  // ⛔ 2026-09-20 — this key and `dislikes_placeholder` are no longer rendered:
  // the one-word field became free text (`household.mouth.terms_*`). Kept for
  // fr/en parity.
  "household.mouth.dislikes": "Food they refuse",
  // ⚠️ UN DÉGOÛT N'EST PAS UNE ALLERGIE, et la phrase le dit à l'écran: les
  // fondre promettrait une garde de sécurité sur une préférence.
  "household.mouth.dislikes_placeholder": "mushrooms",
  // 2026-09-20 — free text for both sections; a short model call turns it
  // into chips, already ticked. The placeholder shows BOTH accepted shapes.
  "household.mouth.terms_placeholder_allergy":
    "peanuts, shellfish — or a whole sentence",
  "household.mouth.terms_placeholder_dislike":
    "mushrooms, tuna and mango — or a whole sentence",
  "household.mouth.terms_label_allergy": "Allergies, free text",
  "household.mouth.terms_label_dislike": "Foods they refuse, free text",
  "household.mouth.terms_working": "One moment…",
  // ── LE RÉGIME EST LA PREMIÈRE SECTION DEPUIS LE 2026-08-19 ──────────────
  // Il écarte des familles entières d'aliments: le poser après les dégoûts
  // faisait noter des dégoûts sur ce qu'on ne servirait jamais.
  "household.mouth.diet_hint":
    "Vegetarian, vegan, pescatarian, gluten-free, or none of those.",
  "household.mouth.diet":
    "How {who} eats",
  "household.mouth.diet_you":
    "How you eat",
  // ⚠️ UNE INVITE, PAS UN CONSTAT. C'était « Nobody has said » — une phrase sur
  // un tiers, proposée comme option à quelqu'un qui répond pour lui-même.
  // L'option reste (sinon l'écran annonce un régime que personne n'a choisi)
  // mais elle est `disabled`: elle nomme l'état de départ, elle ne se choisit
  // plus.
  "household.mouth.diet_unset": "Pick an answer",

  // A3 · P3, la 4e option d'objectif (2026-09-03). RETIRÉES EN PLACE dans ce pack:
  //   "household.member.goal_none"  — l'option vide de `MouthFields` (/app/household)
  //   "setup.mouths.goal_none"      — l'option vide de l'entonnoir (/app/setup)
  // AJOUTÉES — namespace `household`, déclaré sur /app/setup ET /app/household.
  // Registre ÉDUCATIF (PIVOT-FOYER §8.4): « Eat normally », jamais « keep weight ».
  "household.goal.minor_maintenance": "Eat normally",
  "household.goal.minor_only": "Under 18, this is the only direction offered.",
  "household.goal.minor_switched":
    "Under 18, “{from}” is no longer offered: what gets saved is “Eat normally”.",
  // Les deux refus S4 (`20260822041500`), nés le 2026-08-22 et arrivés en jeton brut
  // pendant douze jours. La phrase nomme le remède que la migration désigne.
  "household.error.goal_not_for_minor":
    "No weight direction for a child: under 18, only “Eat normally” is accepted. Pick it, then set the date.",
  "household.error.target_not_for_minor":
    "No target weight for a child: under 18, nothing is aimed at.",
  // A4 · P4, les idées de repas (2026-09-03, décision D4.1). RETIRÉES EN PLACE dans
  // ce pack — SEPT clés de l'écran `/app/meals` (supprimé), et AUCUNE du
  // vocabulaire du moteur (`meals.slot.*`, `meals.aisle.*`, `meals.tick.*`… restent):
  //   "app.nav.meals"        — l'onglet « Meal ideas » de la barre du bas (KeelAppShell)
  //   "app.nav.meals.short"  — sa forme courte « Meals »
  //   "meals.title"          — « Meal ideas », le titre de la page
  //   "meals.subtitle"       — « Dishes your coach put up for everyone… »
  //   "meals.list.title"     — « From your coach »
  //   "meals.list.empty"     — « Your coach has not put any meal ideas up yet… »
  //   "meals.error"          — « These could not be loaded just now. »
  // GARDÉE, contre la liste de huit du mandat: "meals.loading" — deux appelants
  // vivants sur `/app/plan` (`MealBuilder.tsx`, `StudentWeekPlanPage.tsx`), vus
  // par `tsc` quand on l'a retirée; redéposée près du moteur, avec sa note.
  // Et dans `catalog.ts`: l'entrée `"/app/meals"` de `PAGE_NAMESPACES`. Aucune clé ajoutée.

  // A6 · P6, le déjeuner en semaine quitte l'étape 3 (2026-09-03, D6.3). AUCUNE
  // clé ajoutée, AUCUNE retirée: le namespace `setup.work_lunch.*` est GARDÉ,
  // déjà déclaré sur /app/household (`catalog.ts`, inchangé). VALEURS CHANGÉES
  // EN PLACE dans ce pack, parce que la carte vit maintenant dans la fiche de
  // chaque bouche, juste au-dessus de sa grille, et que « at the next step »
  // mentait:
  //   "setup.work_lunch.intro"        — « Ask now, and the week comes out
  //                                     right » → « Their week, just below,
  //                                     has the last word »
  //   "setup.work_lunch.outside_note" — « will already be marked … at the next
  //                                     step » → « are marked … in their week,
  //                                     just below »
  //   "setup.work_lunch.grid_wins"    — « the grid at the next step » → « the
  //                                     grid of their week, just below »
  //   "setup.request.presence_intro"  — « Step three said the habit » → the
  //                                     habit is set on the Household page
  // ⟳ 2026-09-24 — `setup.work_lunch.*` RETIRÉ: plus aucun lecteur (question
  // supprimée le 2026-09-19, état « dehors » le 2026-09-24).

  // ── A5 · the Household page (2026-09-03) ─────────────────────────────────
  // The two named frames of a mouth's sheet (D5.1). The collapsed frame's
  // recap REUSES the add sheet's keys (`household.mouth.preferences_filled` /
  // `_empty`) — the same fact said with the same words in both places.
  "household.member.frame_identity": "Personal details",
  // ⟳ 2026-09-19 — LA FICHE EST DEUX FENÊTRES, DONC DEUX TITRES. Le
  // titre d'un `Modal` est aussi son `aria-label`: le seul prénom ne
  // disait plus laquelle des deux on vient d'ouvrir. Jumelle de
  // `household.mouth.preferences_title_named`, et même gabarit.
  "household.member.identity_title_named": "{name} — personal details",
  "household.member.frame_identity_hint":
    "What sizes their serving: who they are, their body, and which way their scale should go.",
  "household.member.frame_preferences": "Food preferences",
  "household.member.frame_preferences_hint":
    "What refines the plan: what they already eat, what they never eat, and what the house does not serve.",
  "household.mouth.frame_loading": "Reading what is already on file…",
  // ── HOUSEHOLD SETTINGS (A5, mandate point 4) ─────────────────────────────
  // The section that now holds the kitchen equipment and the tradition meals,
  // moved out of funnel step 3 — a funnel nobody ever walks twice.
  "household.settings.title": "Household settings",
  //   "setup.traditions.title"        — « The days you never move » → « Tradition
  //                                     meals » (mandate point 4). The KEY does
  //                                     not move.
  // ── ACCESS, FROM A MOUTH'S OWN ROW (A5, §5.5) ────────────────────────────
  // Three states DERIVED FROM FACTS: a non-null `user_id` ⇒ claimed; a live
  // invitation ⇒ invited; otherwise ⇒ free. ⛔ No amount is copied: the price
  // line reads `offer.extra` + `PRICES.claimedProfile` (D5.8).
  "household.access.claimed": "Has their own access",
  "household.access.invite": "Invite",
  "household.access.resend": "Send again",
  "household.access.invited": "Invitation sent on {date} to {email}",
  "household.access.copy": "Copy the link",
  "household.access.copied": "Link copied",
  // ⛔ "Write", not "Send": this product sends no invitation email (FF-060 R7).
  "household.access.mail": "Write the message",
  "household.access.mail_subject": "Your access to the household",
  // ── THE ADD WINDOW (A5, point 3) ─────────────────────────────────────────
  // The button that opens it. One window now carries both the required blocks
  // and the preferences, the latter in an accordion (⛔ never two nested modals).
  "household.add.open": "Add someone",

  // ── chantier-0904/FF-060 — les plages suivent le besoin — début ──
  //
  // ⛔ AUCUNE DE CES CLÉS N'ÉCRIT UN KCAL, et c'est délibéré: un compte de
  // moments est une STRUCTURE, pas une mesure de quelqu'un. Elles n'entrent
  // donc pas dans `ENERGY_KEYS_WITH_A_BASIS`, et le test négatif qui balaie les
  // deux packs le vérifie.
  //
  // ⚠️ ET ON NE COCHE JAMAIS UN MOMENT SANS LE DIRE — même règle que le shaker.
  // ⟳ 2026-09-06 — voir la note de `fr.ts`: l'écran ne coche plus rien tout
  // seul, et ces phrases disent ce que le plan fera du reste.
  // ⟳ 2026-09-08 — the moments are pre-ticked now, and both sentences follow.
  // "Tick the ones that are true" described a gesture already done, and "You
  // have ticked {count}" credited the person with a tick the screen made.
  // ⟳ 2026-09-08 (evening) — three stacked sentences became one per state, and
  // one of them was a lie: it said "untick the ones that aren't true" while the
  // floor held those very boxes greyed out. Each state now names only the
  // gesture that exists — free: remove; held: add. The standalone "why"
  // (`rhythm_derived_why`) is folded into the state that constrains.
  "household.mouth.rhythm_derived":
    "{who} needs {count} moments a day. We ticked them — untick the ones {who} doesn't have.",
  "household.mouth.rhythm_derived_you":
    "You need {count} moments a day. We ticked them — untick the ones you don't have.",
  // ⟳ 2026-09-15 — `rhythm_floor_locked` (+ `_you`) was removed; see fr.ts.
  // No box is ever held now, so there is no "held" state left to name.
  "household.mouth.shake_composed":
    "The plan will build {who} a drinkable shake in the afternoon. If {who} already has their own, add it below and the plan will leave it alone.",
  "household.mouth.shake_composed_you":
    "The plan will build you a drinkable shake in the afternoon. If you already have your own, add it below and the plan will leave it alone.",
} as const
