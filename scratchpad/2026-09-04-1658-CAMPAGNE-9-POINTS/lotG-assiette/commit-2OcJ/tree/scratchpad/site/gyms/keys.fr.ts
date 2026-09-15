// ===========================================================================
// /gyms — LE PACK DE CLÉS FRANÇAIS. À fusionner dans
// `frontend/src/keel/i18n/fr.public.ts` par l'orchestrateur, et à RETIRER de
// `PUBLIC_NAMESPACES_PENDING_TRANSLATION` (`i18n/catalog.ts:54`) dans le même
// geste : `gyms` n'était pas traduit, ce chantier ferme la dette.
//
// ── CE QUI NE SE TRADUIT PAS, ET POURQUOI ─────────────────────────────────
//  1. La marque. Sophia reste Sophia.
//  2. Les prix. « 7 € », « 6 € », « 25 € », « 925 € », « 666 € » — mêmes
//     nombres des deux côtés ; seule la mise en forme suit le français
//     (espace insécable avant l'euro, « 8 000 » et non « 8,000 »).
//  3. ⚠️ LES CHAÎNES DE PRODUIT CITÉES MOT POUR MOT. `gyms.fig.thread_*` et
//     `gyms.fig.monday_*` sont IDENTIQUES à l'anglais, délibérément. Ce sont
//     deux maquettes, et S10 exige qu'une maquette reprenne le vrai champ mot
//     pour mot. L'app authentifiée est déclarée en anglais
//     (`i18n/catalog.ts`) : traduire « All good » ou « Worth a message »
//     montrerait à un visiteur français un écran qui n'existe pas, et c'est
//     exactement la faute que l'audit passe trois cents lignes à traquer.
//     En revanche `gyms.fig.trace_*` SE TRADUIT : cette figure est un SCHÉMA,
//     pas une capture, et ses phrases sont un exemple, pas un champ.
//
// ── COMPOSITION (charte §3) ───────────────────────────────────────────────
//  · Apostrophe typographique ’ (U+2019), jamais '.
//  · Espace insécable U+00A0 avant : ; ! ? » € %, et après «. ⚠️ JAMAIS
//    U+202F : mesuré sans glyphe dans les deux familles du site, il tomberait
//    en repli système au milieu d'un mot.
//  · Pas de « → » en texte courant : absent des deux familles.
//
// ── PARITÉ ────────────────────────────────────────────────────────────────
// Aucune clé de ce namespace ne porte de trou d'interpolation `{…}` : la
// parité est donc triviale des deux côtés, et le test `parity.int.test.ts`
// n'a qu'à vérifier qu'aucune clé FR n'est orpheline.
// ===========================================================================

export const gymsFr = {
  "gyms.seo_title": "Sophia pour les salles — un palier nutrition que vos membres paient",
  "gyms.seo_description":
    "La deuxième ligne de revenu d’une salle indépendante : un palier nutrition au-dessus de l’abonnement, tenu chaque jour par un agent qui travaille depuis votre méthode. Vous payez 7 € par membre rattaché et vous fixez ce qu’ils paient par-dessus. Ce que Sophia écrit dans le chat est relu contre vos lignes rouges avant d’être envoyé, sans modèle dans cette boucle. Le lundi, une page calculée nomme les membres qui valent un message pendant qu’on peut encore les joindre.",

  // ── HERO ────────────────────────────────────────────────────────────────
  "gyms.hero.eyebrow": "Pour les salles indépendantes — box, salles de force, studios hybrides",
  "gyms.hero.title": "Vous coachez trois heures par semaine. Ils font vingt et un repas sans vous.",
  "gyms.hero.lede":
    "C’est de là que vient le palier, et un membre qui ne voit plus son corps changer ne vient pas vous en parler : il vient moins, puis il vient le samedi, puis il ne vient plus. Sophia est un palier nutrition au-dessus de votre abonnement. Vous enregistrez une fois comment vous nourrissez des athlètes, et un agent répond à chaque membre que vous rattachez, tous les jours, depuis votre méthode.",
  "gyms.hero.cta": "Commencer l’essai de 14 jours",
  "gyms.hero.trial_note": "14 jours, 3 membres au plus, puis ça s’arrête tout seul.",
  "gyms.hero.note":
    "Vos membres entrent une adresse e-mail à la fois, sur invitation. Il n’y a pas de lien à faire circuler, et c’est voulu. Ça tourne à côté de ce que vous employez déjà pour gérer la salle : il n’y a rien à connecter.",

  // Figure 1 — la semaine d'un membre.
  "gyms.fig.week_t": "La semaine d’un membre : trois séances coachées, vingt et un repas ailleurs",
  "gyms.fig.week_d":
    "Une semaine dessinée en marques. Sur la première ligne, les trois séances coachées dans la salle. Sur la seconde, les vingt et un repas qui se passent là où la salle n’est pas — la part dont cette page parle.",
  "gyms.fig.week_label": "LA SEMAINE D’UN MEMBRE",
  "gyms.fig.week_row1": "TROIS HEURES DANS LA SALLE",
  "gyms.fig.week_row2": "VINGT ET UN REPAS, PARTOUT AILLEURS",

  // ── L'ARITHMÉTIQUE ──────────────────────────────────────────────────────
  "gyms.money.eyebrow": "L’arithmétique",
  "gyms.money.title": "Un palier que vos membres paient, en plus de l’abonnement.",
  "gyms.money.body":
    "Vous payez 7 € par membre rattaché et vous fixez ce qu’ils vous paient. Aucun forfait plateforme, aucun frais d’installation, et vous cessez de payer le mois où vous éteignez un siège. Personne chez vous n’écrit de menu, donc le palier ne vous coûte pas une heure — et c’est précisément pour ça que ce qu’il faut mettre en face n’est pas le temps qu’il fait gagner.",
  "gyms.money.close":
    "Ce que vous achetez, ce sont des mois d’abonnement. Combien vaut, pour vous, un membre qui reste trois mois de plus ? C’est le chiffre à mettre en face de 7 €, et il est à vous, pas à nous : nous n’avons pas de chiffre de rétention à vous vendre, et nous n’allons pas en inventer un.",
  "gyms.money.caption":
    "Un exemple, et il le dit. Nous ne connaissons ni votre taux de prise ni le prix que vous fixeriez, et ce sont les deux chiffres qui décident du total. Le seul qui ne soit pas une estimation est le nôtre : 7 € par membre rattaché.",

  // Figure 2 — l'exemple chiffré. Les nombres ne bougent pas ; seule la mise en
  // forme suit le français (espace insécable, « 8 000 » et non « 8,000 »).
  "gyms.fig.money_t": "Un exemple chiffré pour une salle de 250 membres",
  "gyms.fig.money_d":
    "Quatre lignes d’arithmétique. Trente-sept membres sur le palier à 25 € chacun font 925 € encaissés ; sept euros chacun pour Sophia font 259 € payés ; 666 € restent à la salle chaque mois.",
  "gyms.fig.money_label": "UN EXEMPLE — UNE SALLE DE 250 MEMBRES",
  "gyms.fig.money_uptake_label": "Sur le palier nutrition",
  "gyms.fig.money_uptake_value": "37 membres",
  "gyms.fig.money_uptake_hint": "15 % de prise, arrondi à l’entier inférieur",
  "gyms.fig.money_in_label": "Ils vous paient 25 € chacun",
  "gyms.fig.money_in_value": "925 €",
  "gyms.fig.money_out_label": "Vous payez 7 € chacun à Sophia",
  "gyms.fig.money_out_value": "− 259 €",
  "gyms.fig.money_keep_label": "Il vous reste, chaque mois",
  "gyms.fig.money_keep_value": "666 €",
  "gyms.fig.money_keep_hint": "environ 8 000 € par an",

  // ── TOUS LES JOURS ──────────────────────────────────────────────────────
  // ⚠️ « dès que la réponse n’est pas All good » est écrit à ce mot près (B23) :
  // la relance d'axe part sur tout niveau différent de « good », donc aussi sur
  // « So-so ». Ne pas ramener ça à « si c’était dur ».
  "gyms.daily.eyebrow": "Tous les jours",
  "gyms.daily.title": "Il est réveillé à 21 h un mardi soir. Vous êtes chez vous.",
  "gyms.daily.body":
    "Un membre envoie la photo d’une assiette ou une phrase sur sa journée, et reçoit une réponse construite depuis votre méthode, dans un fil qui reste ouvert. Le soir, un tap dit comment la journée s’est passée — trois boutons, et dès que la réponse n’est pas « All good », une relance demande si c’était l’énergie, la faim ou le sommeil. C’est toute la soirée.",
  // ⚠️ La dernière phrase existe pour empêcher « rien n’arrive la nuit » de
  // repousser (S5) : les heures calmes ne couvrent que la relance.
  "gyms.daily.quiet_title": "Trois jours de silence, un message.",
  "gyms.daily.quiet_body":
    "Puis ça se tait : un seul message par épisode, et une semaine avant qu’un autre soit seulement possible. Une relance au deuxième jour n’apprendrait qu’une chose, que le silence fait sonner, et elle brûlerait le signal du neuvième. Cette relance-là s’abstient entre 21 h et 8 h. Le tap du soir, lui, a sa propre fenêtre, et il peut tomber à 21 h 50.",
  "gyms.daily.fig_caption":
    "Chaque mot de ce fil est celui du produit : la question, les trois boutons, la relance, et ce que dit le champ de saisie quand il est vide.",

  // Figure 3 — le fil du soir. ⚠️ IDENTIQUE À L'ANGLAIS, ET C'EST VOULU :
  // c'est une maquette, l'app authentifiée est en anglais, et une capture
  // traduite montrerait un écran qui n'existe pas (S10).
  "gyms.fig.thread_t": "Le fil du soir, tel que le produit le rend",
  "gyms.fig.thread_d":
    "Une surface de chat. Sophia demande comment la journée s’est passée et propose trois boutons ; une seconde question demande quel axe a été dur et en propose trois autres. En bas, le champ où le membre écrit. Les libellés sont ceux du produit, en anglais.",
  "gyms.fig.thread_app": "Sophia",
  "gyms.fig.thread_sub": "Your day-to-day, with your coach's method behind it.",
  "gyms.fig.thread_q1": "How was today?",
  "gyms.fig.thread_b1": "All good",
  "gyms.fig.thread_b2": "So-so",
  "gyms.fig.thread_b3": "Rough",
  "gyms.fig.thread_q2": "What was hard?",
  "gyms.fig.thread_a1": "Energy",
  "gyms.fig.thread_a2": "Hunger",
  "gyms.fig.thread_a3": "Sleep",
  "gyms.fig.thread_composer": "Write to Sophia",
  "gyms.fig.thread_send": "Send",

  // ── LE LUNDI ────────────────────────────────────────────────────────────
  "gyms.monday.eyebrow": "Chaque lundi",
  "gyms.monday.title": "Les noms qui valent un message, pendant qu’on peut encore les joindre.",
  "gyms.monday.body":
    "Une page, calculée sur ce qui s’est passé et rendue par un gabarit. Aucun modèle ne la rédige, et c’est pour ça qu’elle ne peut pas vous flatter. Un membre qui a écrit dans les deux derniers jours est joignable ; entre deux et cinq jours, il décroche ; au-delà de cinq, il est silencieux.",
  "gyms.monday.close":
    "Celui qui décroche est le seul utile. Il est encore joignable, et un message de vous arrive encore. Votre logiciel de badges vous dira la même chose dans six semaines, et le mot pour le dire sera « ancien membre ».",
  "gyms.monday.scope": "Vous voyez les membres que vous avez rattachés, et personne d’autre.",
  "gyms.monday.fig_caption":
    "Un schéma de cette page. Les noms sont inventés ; les libellés, les motifs et les états sont les mots du produit, en anglais.",

  // Figure 4 — le lundi. ⚠️ IDENTIQUE À L'ANGLAIS, même raison que la figure 3.
  "gyms.fig.monday_t": "La page du lundi : les membres qui valent un message",
  "gyms.fig.monday_d":
    "La page hebdomadaire du propriétaire. Trois membres qui valent un message, chacun avec le motif observé et son état de contact — et, sur le troisième, la mention qu’il n’y a aucun chiffre à montrer.",
  "gyms.fig.monday_app": "This week",
  "gyms.fig.monday_worth": "WORTH A MESSAGE",
  "gyms.fig.monday_n1": "Chen Wei",
  "gyms.fig.monday_r1": "Going quiet",
  "gyms.fig.monday_s1": "slipping",
  "gyms.fig.monday_n2": "Amina Diop",
  "gyms.fig.monday_r2": "Has not written in days",
  "gyms.fig.monday_s2": "silent",
  "gyms.fig.monday_n3": "Luca Ferrari",
  "gyms.fig.monday_r3": "Barely logged anything",
  "gyms.fig.monday_s3": "no number to show",

  // ── UNE FOIS ────────────────────────────────────────────────────────────
  "gyms.fit.eyebrow": "Une fois",
  "gyms.fit.title": "Ça ne marche que si la méthode est la vôtre.",
  "gyms.fit.body":
    "Un entretien guidé transforme ce que vous dites déjà sur le plateau en quelque chose qu’un agent peut tenir : ce dont vous êtes convaincu, ce que vous excluez, ce que vous tranchez sur les cas difficiles, vos mots. Vous relisez exactement ce qu’il a compris avant de publier. Vous révisez quand vous voulez, et vous revenez à une version antérieure sans perdre l’historique de ce que vos membres ont réellement reçu.",
  // B20 : la limite est dite. Une salle à trois coachs = un compte coach.
  "gyms.fit.one_title": "Un compte, une méthode.",
  "gyms.fit.one_body":
    "Une salle à trois coachs enregistre une méthode, pas trois. Il n’y a pas d’entité salle au-dessus du compte, ni de liste de coachs dedans : celui qui s’assied à l’entretien est celui depuis qui l’agent travaille, et ce doit être celui à qui ça profite.",
  "gyms.fit.no_title": "Pas le diététicien qu’on désigne.",
  "gyms.fit.no_body":
    "Confiez l’entretien à un salarié et vous récupérerez ce que vous y avez mis : une doctrine remplie sous contrainte, et un agent qui parle comme toutes les autres applis de nutrition. Un agent générique est le mode d’échec de ce produit, pas une version plus petite.",

  // ── LE DOUBLE VERROU ────────────────────────────────────────────────────
  // ⚠️ Formulation B8b. La méthode ENTRE dans le chat, dans chaque semaine et
  // chaque repas ; ce qui est écrit DANS LE CHAT est relu. Pas « chaque message
  // sortant » : quatre surfaces ne sont pas scannées.
  "gyms.lock.eyebrow": "Ce dont il faut avoir le plus peur",
  "gyms.lock.title": "Un agent qui répond à votre place est un risque. On le traite comme tel.",
  "gyms.lock.body":
    "Un prompt est une consigne, pas une garantie. Dites à n’importe quel modèle de ne jamais recommander de grignoter entre les repas et il obéira presque toujours — et presque toujours est le mauvais chiffre quand une seule contradiction publique, devant quelqu’un qui s’entraîne sous votre nom, est ce que la salle retiendra.",
  "gyms.lock.l1_tag": "Votre méthode entre",
  "gyms.lock.l1": "Elle entre dans le chat, et dans chaque semaine et chaque repas que Sophia rédige.",
  "gyms.lock.l2_tag": "Ce qui sort du chat est relu",
  "gyms.lock.l2":
    "Ce que Sophia écrit dans le chat est vérifié contre vos lignes rouges avant d’être envoyé. Déterministe, sans modèle dans cette boucle. C’est celui-là, la garantie.",
  "gyms.lock.instead":
    "Votre membre ne reçoit jamais un refus. Chaque ligne rouge porte ce que vous faites à la place, dans vos mots et signé de votre nom, et c’est ça qui arrive.",
  "gyms.lock.trace_example": "Exemple — une salle dont la méthode exclut le grignotage entre les repas.",
  "gyms.lock.traceable":
    "Et quand un membre compose une semaine à partir de votre méthode, la base refuse une ligne qui ne cite aucune de vos convictions. Une contrainte, pas une convention.",
  "gyms.lock.close":
    "Votre membre a votre réponse à 21 h un mardi soir, sur une question que vous avez tranchée cent fois sur le plateau.",

  // Figure 5 — la trace. Elle, SE TRADUIT : c'est un schéma, pas une capture,
  // et ses trois phrases sont un exemple, pas un champ du produit.
  "gyms.fig.trace_t": "Un message, de la question à ce qui est parti",
  "gyms.fig.trace_d":
    "Trois étapes. La question d’un membre, le brouillon qui franchissait une ligne rouge et a été retenu, et la ligne qui est partie à la place — celle qu’a écrite le propriétaire.",
  "gyms.fig.trace_label": "UN MESSAGE, DE BOUT EN BOUT",
  "gyms.fig.trace_s1": "UN MEMBRE DEMANDE",
  "gyms.fig.trace_t1": "« Je peux ajouter une collation entre midi et le dîner ? »",
  "gyms.fig.trace_s2": "LE BROUILLON DISAIT",
  "gyms.fig.trace_t2": "« Une petite collation l’après-midi peut aider. »",
  "gyms.fig.trace_held": "retenu",
  "gyms.fig.trace_s3": "CE QUI EST PARTI À LA PLACE",
  "gyms.fig.trace_t3": "« Trois vrais repas. Si tu as faim, le précédent était trop petit. »",

  // ── LE PRIX ─────────────────────────────────────────────────────────────
  // ⚠️ `annual` est la CORRECTION du claim faux B2 : l'intervalle annuel est
  // celui du coach, jamais du membre. « pour un siège payé à l’année ».
  "gyms.price.eyebrow": "Le prix",
  "gyms.price.title": "7 € par membre. C’est vous qui fixez ce qu’il paie.",
  "gyms.price.seat": "7 €",
  "gyms.price.seat_period": "par membre rattaché et par mois",
  "gyms.price.seat_label": "Aucun forfait plateforme. Aucune installation. Rien d’autre.",
  "gyms.price.annual": "6 € pour un siège payé à l’année.",
  "gyms.price.why":
    "Vous payez les sièges que vous avez ouverts, et vous cessez de payer le mois où vous en éteignez un. S’abonner demande au moins un membre rattaché : le premier siège vient donc avant la première facture. Après ça, l’arithmétique est la même à un membre et à cinq cents.",
  "gyms.price.billing_note":
    "Vous facturez vos membres vous-même, sur ce que vous employez déjà pour l’abonnement. Sophia ne touche jamais à leur paiement et ne le voit jamais.",
  "gyms.price.cta": "Commencer l’essai de 14 jours",
  "gyms.price.trial_note": "14 jours, 3 membres au plus, puis ça s’arrête tout seul.",

  // ── LA CLÔTURE ──────────────────────────────────────────────────────────
  "gyms.close.title": "Vous coachez déjà l’entraînement. Voici les vingt et un autres repas.",
  "gyms.close.cta": "Commencer l’essai de 14 jours",
  "gyms.close.trial_note": "14 jours, 3 membres au plus, puis ça s’arrête tout seul.",
} as const;
