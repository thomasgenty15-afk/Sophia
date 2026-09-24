// Pack français — le namespace `gyms`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `gyms.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frGyms = {
  // ── GYMS — la page des salles (`/gyms`) ─────────────────────────────────
  //
  // REGISTRE: `/gyms` VOUVOIE (fixé par l'en-tête de `fr.ts`).
  // VOCABULAIRE: des CLIENTS. « Élève » est le mot de `/coaches` seulement, et
  // ⛔ « votre équipe » n'existe pas ici — une salle à trois coachs est UN compte
  // (B20). ⛔ « Suivi personnalisé » est interdit partout.
  //
  // COMPOSITION: apostrophe typographique ’ (U+2019), espace insécable U+00A0
  // avant : ; ! ? » € % et après «. ⛔ JAMAIS U+202F (mesurée sans glyphe dans
  // les deux polices). ⛔ Pas de flèche U+2192 en texte courant: dans une figure, la flèche
  // se DESSINE.
  "gyms.seo_title": "Sophia pour les salles — le palier nutrition que vous n’avez pas à écrire",
  "gyms.seo_description":
    "Vos clients s’entraînent sérieusement et mangent au hasard. Sophia est un palier nutrition au-dessus de l’abonnement : un agent répond à chaque client que vous rattachez, tous les jours, et vous n’écrivez rien — vous déléguez à la méthode de Sophia, et l’agent signe du nom de Sophia, jamais du vôtre. 7 € par client rattaché et par mois.",

  // ── BANDE 1 · douleur 01 ────────────────────────────────────────────────
  // ⚠️ Le titre ne dit plus « vous coachez trois heures par semaine ». Une
  // salle ne coache pas : ses clients s’entraînent, et la plupart n’ont aucun
  // coach. C’est le recadrage du segment.
  "gyms.hero.eyebrow": "Pour les salles indépendantes — box, salles de force, studios hybrides",
  "gyms.hero.title": "Ils s’entraînent sérieusement. Ils mangent au hasard.",
  "gyms.hero.lede":
    "Trois heures par semaine dans votre salle, et vingt et un repas où personne ne demande rien. C’est cette moitié-là qui décide de ce que renvoie le miroir — et un client qui ne voit plus son corps changer ne vient pas vous en parler, il cesse de venir. Sophia est un palier nutrition au-dessus de votre abonnement : un agent répond à chaque client que vous rattachez, tous les jours. Personne n’écrit de menu, et personne n’embauche de diététicien.",
  "gyms.hero.cta": "Commencer l’essai de 14 jours",
  "gyms.hero.trial_note": "14 jours, 3 clients au plus, puis ça s’arrête tout seul.",

  "gyms.fig.week_t": "La semaine d’un client : trois séances dans la salle, vingt et un repas ailleurs",
  "gyms.fig.week_d":
    "Une semaine dessinée en marques. La ligne du haut porte les trois séances dans la salle. Celle du bas porte les vingt et un repas qui se passent là où la salle n’est pas.",
  "gyms.fig.week_label": "LA SEMAINE D’UN CLIENT",
  "gyms.fig.week_row1": "TROIS HEURES DANS LA SALLE",
  "gyms.fig.week_row2": "VINGT ET UN REPAS, PARTOUT AILLEURS",

  "gyms.day.title": "Il est réveillé à 21 h un mardi soir. Vous êtes chez vous.",
  "gyms.day.body":
    "Un client pose sa question au moment où il l’a, et la réponse est construite depuis la méthode qui tient son compte — dans le chat, et dans chaque repas que Sophia rédige.",

  "gyms.money.title": "C’est vous qui le vendez. C’est vous qui fixez le prix.",
  "gyms.money.body":
    "Vous payez 7 € par client rattaché, et vous décidez de ce que le palier coûte de votre côté du comptoir. Aucun forfait plateforme, aucune installation, et vous cessez de payer le mois où vous éteignez un siège.",
  "gyms.money.caption":
    "Un exemple, et il le dit : nous ne connaissons ni votre taux de prise ni le prix que vous fixeriez, et ce sont les deux chiffres qui décident du total.",
  // B31 — VERBATIM. Ne pas réécrire cette phrase.
  "gyms.money.close":
    "Ce que vous achetez, ce sont des mois d’abonnement. Combien vaut, pour vous, un client qui reste trois mois de plus ? C’est le chiffre à mettre en face de 7 €, et il est à vous, pas à nous : nous n’avons pas de chiffre de rétention à vous vendre, et nous n’allons pas en inventer un.",

  // Les nombres ne bougent pas ; seule la mise en forme suit le français
  // (insécable avant €, « 8 000 » et non « 8,000 »).
  "gyms.fig.money_t": "Un exemple chiffré pour une salle de 250 clients",
  "gyms.fig.money_d":
    "Quatre lignes d’arithmétique. Trente-sept clients à 25 € chacun font 925 € encaissés ; sept euros chacun pour Sophia font 259 € payés ; 666 € restent à la salle.",
  "gyms.fig.money_label": "UN EXEMPLE — UNE SALLE DE 250 CLIENTS",
  "gyms.fig.money_uptake_label": "Sur le palier nutrition",
  "gyms.fig.money_uptake_value": "37 clients",
  "gyms.fig.money_uptake_hint": "15 % de prise, arrondi à l’entier inférieur",
  "gyms.fig.money_in_label": "Ils vous paient 25 € chacun",
  "gyms.fig.money_in_value": "925 €",
  "gyms.fig.money_out_label": "Vous payez 7 € chacun à Sophia",
  "gyms.fig.money_out_value": "− 259 €",
  "gyms.fig.money_keep_label": "Il vous reste, chaque mois",
  "gyms.fig.money_keep_value": "666 €",
  "gyms.fig.money_keep_hint": "environ 8 000 € par an",

  // ── BANDE 2 · douleur 02 ────────────────────────────────────────────────
  "gyms.monday.eyebrow": "Chaque lundi",
  "gyms.monday.title": "Les noms qui valent un message, pendant qu’on peut encore les joindre.",
  "gyms.monday.body":
    "Une page, calculée sur ce qui s’est passé et rendue par un gabarit. Aucun modèle ne la rédige, et c’est pour ça qu’elle ne peut pas vous flatter. Un client qui a écrit dans les deux derniers jours est joignable ; au-delà de deux jours, il décroche ; au-delà de cinq, il est silencieux — compté sur son dernier message entrant, pas sur le nôtre.",
  "gyms.monday.close":
    "Celui qui décroche est le seul utile : il est encore joignable, et un message de vous arrive encore. Votre logiciel de badges vous dira la même chose dans six semaines, et le mot sera « ancien client ».",
  "gyms.monday.scope": "Vous voyez les clients que vous avez rattachés, et personne d’autre.",
  "gyms.monday.fig_caption":
    "Un schéma de cette page. Les noms sont inventés ; le titre, les motifs et les états sont les mots du produit.",

  // ⚠️ CE BLOC ÉTAIT EN ANGLAIS, SOUS UNE LÉGENDE QUI JURAIT QUE C’ÉTAIT LES
  // MOTS DU PRODUIT. Le commentaire qui le justifiait disait « l’app
  // authentifiée est en anglais » — c’était vrai, ça ne l’est plus depuis le
  // lot 5. Le lundi d’un gérant francophone dit « Cette semaine » et « À qui
  // écrire »: la maquette montrait donc à un acheteur français un écran qui
  // n’existe dans aucune langue, ce qui est EXACTEMENT la faute que S10
  // existe pour éviter — la règle avait survécu à sa cause.
  //
  // Chaque valeur ci-dessous est recopiée de sa clé produit, dans ce fichier:
  //   monday_app   ← `coach.weekly.title`             (:3693)
  //   monday_worth ← `coach.weekly.flagged_title`     (:3702)
  //   monday_r1    ← `coach.flag.slipping_contact`    (:3721)
  //   monday_r2    ← `coach.flag.silent_5d`           (:3720)
  //   monday_r3    ← `coach.flag.coverage_below_gate` (:3723)
  //   monday_s3    ← `coach.weekly.no_number`         (:3705)
  // Seuls les trois PRÉNOMS sont inventés, et la légende le dit.
  "gyms.fig.monday_t": "La page du lundi : les clients qui valent un message",
  "gyms.fig.monday_d":
    "Trois clients qui valent un message, chacun avec le motif observé et son état de contact — et, sur le troisième, la mention qu’il n’y a aucun chiffre à montrer.",
  "gyms.fig.monday_app": "Cette semaine",
  "gyms.fig.monday_worth": "À QUI ÉCRIRE",
  "gyms.fig.monday_n1": "Chen Wei",
  "gyms.fig.monday_r1": "S’éloigne",
  "gyms.fig.monday_s1": "S’éloigne",
  "gyms.fig.monday_n2": "Amina Diop",
  "gyms.fig.monday_r2": "N’a rien écrit depuis plusieurs jours",
  "gyms.fig.monday_s2": "Silence",
  "gyms.fig.monday_n3": "Luca Ferrari",
  "gyms.fig.monday_r3": "N’a presque rien noté",
  "gyms.fig.monday_s3": "aucun chiffre à montrer",

  // ── BANDE 3 · douleur 03 — la délégation. Le seul argument NEUF. ─────────
  "gyms.house.eyebrow": "Rien à écrire",
  "gyms.house.title": "Vous n’avez pas de méthode à prêter. Vous n’en avez pas besoin.",
  "gyms.house.body":
    "Une salle vend une salle, pas une doctrine, et s’inventer une légitimité qu’on n’a pas serait la pire chose à faire avec un agent. Alors vous déléguez : vos clients sont suivis par la méthode de Sophia, et l’agent le dit — il signe « Sophia », jamais votre nom.",
  "gyms.house.sign_title": "Un seul nom, partout où un nom apparaît.",
  "gyms.house.sign_body":
    "La conversation et le message hebdomadaire à votre cohorte lisent la même réponse à « qui signe ça ». Un client ne rencontre jamais deux identités.",
  "gyms.house.one_title": "Un compte, une signature.",
  "gyms.house.one_body":
    "Une salle à trois coachs est un compte. Il n’y a pas d’entité salle au-dessus, ni de liste de coachs dedans.",
  "gyms.house.reserve":
    "Deux choses à savoir avant de basculer. Ça se défait : coupez la délégation et l’agent signe de nouveau de votre nom et sert ce que vous avez publié — rien de ce que vous aviez écrit n’est supprimé entre-temps. Et la méthode de la maison est en cours d’écriture en ce moment même : ce que vous activez aujourd’hui, c’est la délégation, pas une bibliothèque finie.",

  "gyms.fig.house_t": "La délégation : la salle n’écrit rien, et un seul nom signe les deux surfaces",
  "gyms.fig.house_d":
    "À gauche, la méthode de la salle : une carte vide. Deux branches en partent vers les deux endroits où un client rencontre un nom, et les deux sont signés Sophia.",
  "gyms.fig.house_label": "QUI SIGNE",
  "gyms.fig.house_gym": "VOTRE SALLE",
  "gyms.fig.house_gym_v": "rien d’écrit",
  "gyms.fig.house_s1": "LA CONVERSATION",
  "gyms.fig.house_s2": "LE MESSAGE DE LA SEMAINE",
  "gyms.fig.house_sign": "— Sophia",

  // ── BANDE 4 · le prix et la clôture ─────────────────────────────────────
  // ⚠️ `annual` est la CORRECTION du claim faux B2 : l’intervalle annuel est
  // celui du coach, jamais du client. « pour un siège payé à l’année ».
  "gyms.price.eyebrow": "Le prix",
  "gyms.price.title": "7 € par client. C’est vous qui fixez ce qu’il paie.",
  "gyms.price.seat_period": "par client rattaché et par mois",
  "gyms.price.seat_label": "Aucun forfait plateforme. Aucune installation. Rien d’autre.",
  "gyms.price.annual": "6 € pour un siège payé à l’année.",
  "gyms.price.why":
    "Vous payez les sièges que vous avez ouverts, et vous cessez de payer le mois où vous en éteignez un. S’abonner demande au moins un client rattaché : le premier siège vient donc avant la première facture.",
  "gyms.price.billing_note":
    "Vous facturez vos clients vous-même, sur ce que vous employez déjà pour l’abonnement. Sophia ne touche jamais à leur paiement.",
  "gyms.price.cta": "Commencer l’essai de 14 jours",
  "gyms.price.trial_note": "14 jours, 3 clients au plus, puis ça s’arrête tout seul.",
  "gyms.close.line": "Vous menez l’entraînement. Voici les vingt et un autres repas.",
} satisfies TranslatedMessagesOf<"gyms">;
