// ===========================================================================
// /coaches — LES CLÉS FRANÇAISES. Namespace `coaches`.
// ===========================================================================
// À insérer dans `frontend/src/keel/i18n/fr.public.ts`. Même jeu de clés que
// `keys.en.ts`, mêmes trous d'interpolation (il n'y en a aucun ici).
//
// Ce n'est pas un calque : c'est une page de vente réécrite. Le tutoiement est
// celui de la vitrine française existante (`fr.public.ts`, `landing.*`), et il
// ne se discute pas ici — un coach vouvoyé dans une moitié du site et tutoyé
// dans l'autre lit deux produits.
//
// ── DEUX ÉCARTS ASSUMÉS AVEC LE FICHIER FR EXISTANT ───────────────────────
//
// 1. COMPOSITION FRANÇAISE (CHARTE §3, « non négociable »). Ce fichier emploie
//    l'apostrophe typographique ’ (U+2019) et l'espace insécable U+00A0 avant
//    : ; ! ? » et après «, ainsi que devant € et %. Le fichier legacy n'en a
//    aucune (mesuré : 0 U+00A0, 137 apostrophes droites) — c'est le legacy qui
//    est en retard sur la charte, pas l'inverse.
//    ⚠️ JAMAIS U+202F (espace fine insécable) : mesurée sans glyphe dans les
//    deux familles retenues et dans 24 autres. Elle tomberait en repli système
//    au milieu d'un mot. Contrôle :
//      python3 -c "s=open('keys.fr.ts').read(); print(s.count('\u202f'))"  → 0
//
// 2. LES CHAÎNES QUE LA PAGE PRÉTEND CITER RESTENT EN ANGLAIS. Le fichier
//    legacy traduit les maquettes (« Ça a donné quoi, aujourd'hui ? » pour
//    « How was today? »). Ici non, et pour la raison même qui vaut à ce
//    chantier son audit : une maquette reprend le vrai champ mot pour mot, ou
//    ce n'est pas une maquette (S10). La page du lundi et la question du soir
//    sont annoncées « mot pour mot » dans leur légende ; les traduire ferait
//    de cette légende un mensonge, exactement comme « wrote » pour « built »
//    (B13). Ce qui est un EXEMPLE (les bulles, la substitution, la note) est
//    en français : la frontière entre les deux est visible à l'œil, et c'est
//    l'effet recherché.
//    Si le propriétaire préfère la règle legacy, l'édition est locale : les
//    clés concernées sont `coaches.fig.monday.*` (sauf title/desc) et
//    `coaches.fig.chat.question` / `.tap_*`.
// ===========================================================================

export const coachesFr = {
  "coaches.seo_title": "Sophia — ta méthode répond à tes élèves, tous les jours",
  "coaches.seo_description":
    "Sophia apprend ta façon de coacher — tes convictions, tes lignes rouges, ce que tu dis à la place — et répond à tes élèves avec ta méthode, tous les jours. Ce qu’elle écrit dans le chat est relu contre tes lignes rouges avant d’être envoyé, par du code. Le lundi, tu lis une page. 7 € par élève et par mois, sans forfait de plateforme.",

  // ── Hero ────────────────────────────────────────────────────────────────
  "coaches.hero.kicker": "Pour les coachs qui vendent une méthode, pas des heures",
  "coaches.hero.title": "Ta formation se termine. Ton coaching, non.",
  "coaches.hero.lede":
    "Tu as écrit ta méthode une fois. Sophia répond à tes élèves avec elle, tous les jours — la question de 21 h, la semaine qu’ils composent, les repas qu’elle leur propose. Ce que tu ne pouvais vendre qu’une fois devient ce qu’on paie chaque mois.",
  "coaches.hero.cta": "Démarrer l’essai de 14 jours",
  "coaches.hero.note":
    "14 jours, jusqu’à 3 élèves, puis ça s’arrête tout seul. Ils entrent sur invitation par e-mail et reçoivent un espace à eux, chat compris. Rien ne revient dans une boîte de réception chez toi — il n’y en a pas.",
  "coaches.hero.fig_caption":
    "Tu l’enregistres une fois, dans un entretien guidé : tes convictions, tes lignes rouges, ce que tu dis à la place, ton vocabulaire. Tu la révises quand tu veux — une correction s’applique dès le message suivant — et tu reviens à une version précédente sans perdre l’historique de ce que tes élèves ont reçu.",

  "coaches.fig.method.title": "Une méthode, quatre endroits où elle est écrite",
  "coaches.fig.method.desc":
    "La méthode publiée à gauche. À droite, les quatre choses que Sophia compose pour un élève : son chat, la semaine qu’il compose, les repas qu’elle lui propose, les repas de son foyer. Chacune est composée avec la méthode dedans.",
  "coaches.fig.method.eq": "ENREGISTRÉE UNE FOIS",
  "coaches.fig.method.source": "TA MÉTHODE",
  "coaches.fig.method.l1": "tes convictions",
  "coaches.fig.method.l2": "tes lignes rouges",
  "coaches.fig.method.l3": "ce que tu dis à la place",
  "coaches.fig.method.l4": "ton vocabulaire",
  "coaches.fig.method.out1": "son chat",
  "coaches.fig.method.out2": "sa semaine composée",
  "coaches.fig.method.out3": "les repas proposés",
  "coaches.fig.method.out4": "les repas du foyer",

  // ── La journée ──────────────────────────────────────────────────────────
  "coaches.day.kicker": "Chaque jour",
  "coaches.day.title": "Les questions qui arrivent une fois la formation finie.",
  "coaches.day.body":
    "Les modules sont enregistrés, la cohorte est pleine, la méthode est bonne. Et puis c’est mardi soir, et un élève a une question qui n’est dans aucun module — parce qu’elle porte sur sa soirée, sa cuisine, sa semaine à lui. Multiplie par tous les inscrits.",
  "coaches.day.q1": "« Je peux remplacer le riz par des pâtes ce soir ? »",
  "coaches.day.q2": "« Je meurs de faim à 16 h — c’est normal ? »",
  "coaches.day.q3": "« J’ai mal mangé à un mariage. J’ai foutu la semaine en l’air ? »",
  "coaches.day.close":
    "Chacune a une réponse, et cette réponse est la tienne — tu l’as tranchée cent fois. Personne ne part parce que la méthode était mauvaise. Ils s’éloignent parce que mardi soir, personne qui pense comme toi n’était là.",
  "coaches.day.fig_caption":
    "L’échange est un exemple. La question du soir et ses trois boutons sont les mots du produit, mot pour mot : un tap par jour, et si la journée a été dure — ou seulement mitigée — une relance demande l’énergie, la faim ou le sommeil.",

  "coaches.fig.chat.title": "Une journée dans le chat d’un élève",
  "coaches.fig.chat.desc":
    "L’élève écrit ce qui s’est passé à midi et reçoit une réponse composée avec la méthode de son coach. Le soir, une question et trois boutons : All good, So-so, Rough.",
  "coaches.fig.chat.heading": "Dans son chat, aujourd’hui",
  "coaches.fig.chat.them": "L’ÉLÈVE",
  "coaches.fig.chat.sophia": "SOPHIA",
  "coaches.fig.chat.student": "Mangé dehors ce midi. Aucune idée du contenu.",
  "coaches.fig.chat.reply1": "Alors ce soir, simple : une protéine, des légumes,",
  "coaches.fig.chat.reply2": "une portion normale. Un repas ne fait pas la semaine.",
  "coaches.fig.chat.evening": "LE SOIR",
  // MOT POUR MOT, en anglais dans les deux locales — voir l'en-tête, écart n°2.
  "coaches.fig.chat.question": "How was today?",
  "coaches.fig.chat.tap_good": "All good",
  "coaches.fig.chat.tap_mixed": "So-so",
  "coaches.fig.chat.tap_rough": "Rough",

  // ── Le bloc sombre ──────────────────────────────────────────────────────
  "coaches.lock.kicker": "La partie qui devrait te faire le plus peur",
  "coaches.lock.title": "Une IA qui parle en ton nom est un risque. On le traite comme tel.",
  "coaches.lock.body":
    "Un prompt est une consigne, pas une garantie. Dis à n’importe quel modèle « ne recommande jamais de grignoter entre les repas » et il obéira presque toujours — et presque toujours est le mauvais chiffre quand une seule contradiction publique est ce que tes élèves retiendront.",
  "coaches.lock.scope":
    "Alors ta méthode est écrite dans tout ce que Sophia compose pour tes élèves : le chat, chaque semaine, chaque repas. Ça, c’est une consigne. La suite n’en est pas une : ce qu’elle écrit dans le chat est relu contre tes lignes rouges avant d’être envoyé, par du code, sans modèle dans cette boucle.",
  "coaches.lock.instead":
    "Et ce qui part à la place ne vient pas de nous non plus. Chaque ligne rouge porte ce que tu dis à la place, dans tes mots, et c’est signé de ton nom — ton élève lit ta position, et sait qu’elle est de toi.",
  "coaches.lock.close":
    "Il ne reçoit jamais un refus, et jamais un « demande à ton coach » — dans une masterclasse, ça désigne une porte qui n’existe pas. Il reçoit ta réponse.",

  "coaches.fig.lock.title": "Un message retenu, et ce qui part à sa place",
  "coaches.fig.lock.desc":
    "La question d’un élève, le brouillon qui franchissait une ligne rouge, la relecture qui le retient, et la phrase que le coach a écrite pour ce cas exact, qui part à sa place, signée de son nom.",
  "coaches.fig.lock.eq": "DANS LE CHAT, AVANT L’ENVOI",
  "coaches.fig.lock.ask_label": "UN ÉLÈVE DEMANDE",
  "coaches.fig.lock.ask": "« Je rajoute une collation entre midi et le soir ? »",
  "coaches.fig.lock.draft_label": "LE BROUILLON DISAIT",
  "coaches.fig.lock.draft": "« Une petite collation l’après-midi peut aider. »",
  "coaches.fig.lock.held": "retenu",
  "coaches.fig.lock.gate": "TA LIGNE ROUGE — pas de grignotage entre les repas",
  "coaches.fig.lock.gate_note": "aucun modèle dans cette boucle",
  "coaches.fig.lock.sent_label": "CE QUI EST PARTI",
  "coaches.fig.lock.sent1": "« Trois vrais repas. Si tu as faim entre les deux,",
  "coaches.fig.lock.sent2": "c’est que le repas d’avant était trop petit. »",
  "coaches.fig.lock.sign": "— Marc",

  // ── Le lundi ────────────────────────────────────────────────────────────
  "coaches.monday.kicker": "Chaque lundi",
  "coaches.monday.title": "Une page, et aucun modèle ne l’a écrite.",
  "coaches.monday.body":
    "Qui parle encore, comment la semaine a été vécue, ce que tes élèves se sont fixé. Rendu par un gabarit à partir de ce qui s’est réellement passé — et quand il n’y a pas de quoi dire quelque chose, c’est ça qui est écrit, plutôt qu’un arrondi.",
  "coaches.monday.thresholds":
    "En contact veut dire qu’ils ont écrit dans les deux jours. Décrochage, c’est deux à cinq jours. Silencieux, cinq et plus. Et là où il n’y a pas de chiffre, la page écrit « no number to show » au lieu de combler le trou.",
  "coaches.monday.fig_caption":
    "Un schéma de la page du lundi. Les phrases sont celles que le moteur écrit, mot pour mot ; la cohorte est un exemple.",

  // Mot pour mot, en anglais dans les deux locales — voir l'en-tête, écart n°2.
  "coaches.fig.monday.title": "Le lundi, en une page",
  "coaches.fig.monday.desc":
    "La page hebdomadaire du coach : la semaine en prose d’abord, puis les élèves à qui écrire avec la raison attachée, puis les chiffres, en dernier et en petit.",
  "coaches.fig.monday.app_title": "This week",
  "coaches.fig.monday.week_label": "WEEK OF 2026-08-03",
  "coaches.fig.monday.week_to": "2026-08-09",
  "coaches.fig.monday.line1": "34 students this week: 25 in touch, 6 slipping, 3 silent.",
  "coaches.fig.monday.line2":
    "How the week felt: 21 holding up, 9 strained, 4 having a hard time.",
  "coaches.fig.monday.line3": "21 of 34 built themselves a week from your method.",
  "coaches.fig.monday.flagged_label": "WORTH A MESSAGE",
  "coaches.fig.monday.s1_name": "Chen Wei",
  "coaches.fig.monday.s1_reason": "Going quiet",
  "coaches.fig.monday.s1_state": "slipping",
  "coaches.fig.monday.s2_name": "Amina Diop",
  "coaches.fig.monday.s2_reason": "Has not written in days",
  "coaches.fig.monday.s2_state": "silent",
  "coaches.fig.monday.s3_name": "Luca Ferrari",
  "coaches.fig.monday.s3_reason": "Barely logged anything",
  "coaches.fig.monday.s3_none": "no number to show",
  "coaches.fig.monday.numbers_label": "THE NUMBERS",
  "coaches.fig.monday.n1_label": "responsive",
  "coaches.fig.monday.n2_label": "slipping",
  "coaches.fig.monday.n3_label": "silent",

  // ── La note 1:1 ─────────────────────────────────────────────────────────
  "coaches.note.kicker": "Si tu coaches dix personnes que tu connais vraiment",
  "coaches.note.title": "Ta méthode, c’est ce que tu dirais à n’importe lequel. Ceci est le reste.",
  "coaches.note.body":
    "Un champ, un élève, 1 500 caractères, dans tes mots : que celui-là travaille de nuit, que celle-là raye le dimanche de sa semaine. Ça atteint son chat, la semaine qu’il compose et les repas que Sophia lui propose — ta méthode, lue à travers ce que tu sais de lui. Et ça ne passe jamais devant quoi que ce soit : ses allergies d’abord, ta méthode ensuite, la note en dernier.",
  "coaches.note.limit":
    "Sophia a pour consigne de ne jamais la citer. Celle-là est une consigne, pas une vérification, et on préfère te dire laquelle est laquelle. C’est aussi une note sur une personne, donc elle lui appartient aussi : elle est incluse s’il demande un jour ses données.",
  "coaches.note.mock_label": "SUR SA PAGE, DANS TON ESPACE",
  "coaches.note.mock_heading": "Ce que tu as remarqué chez lui",
  "coaches.note.mock_body": "Travaille de nuit, mange vers 3 h du matin. Déteste cuisiner le dimanche.",
  "coaches.note.mock_caption":
    "Laisse-la vide et rien n’atteint le modèle pour dire que tu l’as laissée vide. Deux cents élèves, n’en écris aucune. Dix, écris-en dix.",

  // ── Le prix ─────────────────────────────────────────────────────────────
  "coaches.pricing.kicker": "Le prix",
  "coaches.pricing.title": "Une seule ligne. Elle grandit avec ce que tu vends.",
  "coaches.pricing.seat": "7 €",
  "coaches.pricing.seat_period": "par élève et par mois",
  "coaches.pricing.seat_label":
    "Pas de forfait de plateforme. Pas de frais d’installation. Pas de palier à dépasser.",
  "coaches.pricing.body":
    "Tu paies les élèves que tu as inscrits, et tu arrêtes de payer le mois où tu éteins un siège. Ce que tu leur factures est à toi, encaissé avec tes propres outils — nous ne facturons jamais ton élève. L’essai dure 14 jours avec 3 élèves au maximum ; pour t’abonner ensuite, il te faut au moins un élève rattaché, parce que c’est le siège qu’on facture.",
  "coaches.pricing.no_number":
    "Ce que vaut un élève qui reste au lieu de s’éloigner, c’est ton chiffre, pas le nôtre. Nous n’avons pas de chiffre de rétention à te vendre, et nous n’allons pas en inventer un.",
  "coaches.pricing.cta": "Démarrer l’essai de 14 jours",
  "coaches.pricing.trial_note": "14 jours, jusqu’à 3 élèves, puis ça s’arrête tout seul.",

  // ── La sortie ───────────────────────────────────────────────────────────
  "coaches.closing.title":
    "Tu as déjà écrit la méthode. Voici ce qui la rend payable chaque mois.",
  "coaches.closing.cta": "Démarrer l’essai de 14 jours",
};
