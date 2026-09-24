// Pack français — le namespace `coaches`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `coaches.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frCoaches = {
  // ── COACHES — la page des formations (`/coaches`) ───────────────────────
  //
  // REGISTRE: `/coaches` TUTOIE (en-tête de `fr.ts`). On tutoie la personne qui
  // est entrée; on vouvoie l'acheteur qu'on ne connaît pas. `/pro` et `/gyms`
  // vouvoient ET disent « clients »; ici c'est « élèves », parce qu'ils ont
  // choisi quelqu'un pour apprendre de lui.
  //
  // COMPOSITION: apostrophe typographique ’ (U+2019), espace insécable U+00A0
  // avant : ; ! ? » € % et après «. JAMAIS U+202F — mesurée sans glyphe dans les
  // deux polices. Pas de → : il n'existe dans aucune des deux familles.
  //
  // CE N'EST PAS UN CALQUE. « Your course ends. Your coaching doesn't. » a un
  // rythme qui ne survit pas à la traduction mot à mot.
  // ── SEO ─────────────────────────────────────────────────────────────────
  "coaches.seo_title": "Sophia — ta méthode répond à tes élèves, tous les jours",
  "coaches.seo_description":
    "Tu as enregistré ta méthode une fois. Sophia répond à tes élèves avec elle tous les jours — dans le chat, dans chaque semaine et dans chaque repas qu’elle rédige. Ce qu’elle écrit dans le chat est relu contre tes lignes rouges avant d’être envoyé, sans modèle dans cette boucle. 7 € par élève et par mois, sans forfait de plateforme.",

  // ── BANDE 1 — DOULEUR 01 ────────────────────────────────────────────────
  "coaches.hero.kicker": "Pour les coachs qui vendent une méthode, pas des heures",
  "coaches.hero.title": "Ta formation se termine. Ton coaching, non.",
  "coaches.hero.lede":
    "Tu as enregistré ta méthode une fois. Sophia répond à tes élèves avec elle, tous les jours — la question de 21 h, la semaine qu’ils composent, les repas qu’elle rédige. Ce que tu ne pouvais vendre qu’une fois devient ce qu’on paie chaque mois.",
  "coaches.hero.cta": "Démarrer l’essai de 14 jours",
  "coaches.hero.note":
    "14 jours, jusqu’à 3 élèves, puis ça s’arrête tout seul. Ils entrent sur invitation par e-mail et reçoivent un espace à eux. Rien ne revient dans une boîte de réception chez toi — il n’y en a pas.",
  "coaches.hero.fig_caption":
    "Tu l’enregistres une fois, dans un entretien guidé. Tu la révises quand tu veux — une correction s’applique dès le message suivant — et tu reviens à une version précédente sans perdre ce que tes élèves ont déjà reçu.",

  "coaches.fig.after.title": "La formation s’arrête ; la méthode continue de répondre",
  "coaches.fig.after.desc":
    "Deux lignes sur une même durée. La formation est une boîte fermée, qui s’arrête à la dernière vidéo. La méthode, enregistrée au même moment, ne se referme pas à droite : elle continue au-delà, et répond jour après jour.",
  "coaches.fig.after.eq": "APRÈS LA DERNIÈRE VIDÉO",
  "coaches.fig.after.course": "TA FORMATION",
  "coaches.fig.after.modules": "les modules",
  "coaches.fig.after.end": "ELLE S’ARRÊTE ICI",
  "coaches.fig.after.method": "TA MÉTHODE",
  "coaches.fig.after.recorded": "enregistrée une fois",
  "coaches.fig.after.every_day": "elle répond, jour après jour",

  // ── BANDE 2 — DOULEUR 02 ────────────────────────────────────────────────
  "coaches.day.kicker": "Mardi, 21 h",
  "coaches.day.title": "Les questions qui arrivent quand tu n’es pas là.",
  // ⚠️ Voir la note du bloc anglais: la question du remplacement tombait sur la
  // chaîne 1:1, que ce produit ne vend pas.
  "coaches.day.q1": "« J’ai vraiment besoin d’un petit-déjeuner ? »",
  "coaches.day.q2": "« Je meurs de faim à 16 h — c’est normal ? »",
  "coaches.day.q3": "« J’ai mal mangé à un mariage. J’ai foutu la semaine en l’air ? »",
  "coaches.day.body":
    "Aucune n’est dans un module : elles portent sur ce soir, cette cuisine, cette semaine. Chacune a une réponse, et cette réponse est la tienne — tu l’as tranchée cent fois. Ils s’éloignent parce que mardi soir, personne qui pense comme toi n’était là.",
  "coaches.day.reserve":
    "Rien de tout ça ne te revient. Pas de boîte de réception, pas de file de réponses, pas de fil qui attend ta soirée : tes élèves posent la question dans leur espace, et la réponse est là — sans passer par toi.",

  "coaches.fig.method.title": "Une méthode, quatre endroits où elle est écrite",
  "coaches.fig.method.desc":
    "La méthode publiée à gauche. À droite, les quatre choses que Sophia compose pour un élève : son chat, la semaine qu’il compose, les repas qu’elle rédige, les repas de son foyer — chacune avec la méthode dedans.",
  "coaches.fig.method.eq": "ENREGISTRÉE UNE FOIS",
  "coaches.fig.method.source": "TA MÉTHODE",
  "coaches.fig.method.l1": "tes convictions",
  "coaches.fig.method.l2": "tes lignes rouges",
  "coaches.fig.method.l3": "ce que tu dis à la place",
  "coaches.fig.method.l4": "ton vocabulaire",
  // ⚠️ TROIS SORTIES DEPUIS LE 2026-08-19 — voir le commentaire d'en.ts.
  "coaches.fig.method.out1": "son chat",
  "coaches.fig.method.out2": "les repas rédigés",
  "coaches.fig.method.out3": "les repas du foyer",

  // ── BANDE 3 — DOULEUR 03 · LE BLOC SOMBRE ───────────────────────────────
  "coaches.lock.kicker": "La partie qui devrait te faire le plus peur",
  "coaches.lock.title": "Une IA qui parle en ton nom est un risque. On le traite comme tel.",
  "coaches.lock.body":
    "Un prompt est une consigne, pas une garantie. Dis à n’importe quel modèle « ne recommande jamais six petits repas » et il obéira presque toujours — et presque toujours est le mauvais chiffre quand une seule contradiction publique est ce que tes élèves retiendront.",
  "coaches.lock.scope":
    "Alors ta méthode entre dans le chat et dans chaque repas que Sophia rédige. Ça, c’est une consigne. La suite n’en est pas une : ce qu’elle écrit dans le chat est relu contre tes lignes rouges avant d’être envoyé, par du code, sans modèle dans cette boucle.",
  "coaches.lock.reserve":
    "Ton élève ne reçoit jamais un refus, et jamais un « demande à ton coach » — dans une masterclasse, ça désigne une porte qui n’existe pas. Là où tu n’as rien écrit à la place, ce qui part est notre phrase à nous, non signée : on ne met pas ton nom sur des mots que tu n’as pas écrits.",

  // ── LA DÉMONSTRATION ────────────────────────────────────────────────────
  "coaches.lock.demo.eq": "DANS LE CHAT, AVANT L’ENVOI",
  "coaches.lock.demo.written_label": "CE QUE TU AS ÉCRIT, UNE FOIS",
  "coaches.lock.demo.line_label": "ta ligne rouge",
  "coaches.lock.demo.line_value": "six petits repas",
  "coaches.lock.demo.instead_label": "ce que tu dis à la place",
  "coaches.lock.demo.instead_value":
    "Trois vrais repas. Si tu as faim entre les deux, c’est que le repas d’avant était trop petit.",
  "coaches.lock.demo.group_label": "SI LE MODÈLE ÉCRIT",
  "coaches.lock.demo.draft_a": "« Essaie six petits repas dans la journée. »",
  "coaches.lock.demo.draft_b": "« Ton coach ne fait pas de six petits repas. »",
  "coaches.lock.demo.out_label": "CE QUE TON ÉLÈVE LIT",
  "coaches.lock.demo.verdict_a": "Retenu, et remplacé.",
  "coaches.lock.demo.verdict_b": "Envoyé tel quel.",
  "coaches.lock.demo.why_a":
    "Le message entier est remplacé par ta phrase, et signé de ton nom.",
  "coaches.lock.demo.why_b":
    "Nommer ta ligne rouge pour l’expliquer, c’est ta méthode qui fonctionne : rien n’y touche.",
  // ⚠️ Voir la note du bloc anglais: c’est la fiche du lecteur, pas celle de Marc.
  "coaches.lock.demo.sign": "— ton nom",
  "coaches.lock.demo.foot":
    "Deux brouillons, une ligne rouge. La relecture est une règle que tu as écrite, appliquée par du code : aucun modèle ne décide si un message part.",

  // ── BANDE 4 — LE PRIX ET LA CLÔTURE, FUSIONNÉS ──────────────────────────
  "coaches.price.kicker": "Le prix",
  "coaches.price.title":
    "Tu as déjà écrit la méthode. Voici ce qui la rend payable chaque mois.",
  "coaches.price.seat_period": "par élève et par mois",
  "coaches.price.seat_label":
    "Pas de forfait de plateforme. Pas de frais d’installation. Pas de palier à dépasser.",
  "coaches.price.yearly":
    "le siège si tu paies à l’année — c’est ton échéance à toi, pas celle de ton élève.",
  "coaches.price.body":
    "Tu paies les élèves que tu as inscrits, et tu arrêtes de payer le mois où tu éteins un siège. Ce que tu leur factures est à toi — nous ne facturons jamais ton élève. Pour t’abonner, il te faut au moins un élève rattaché : c’est le siège qu’on facture.",
  "coaches.price.no_number":
    "Ce que vaut un élève qui reste au lieu de s’éloigner, c’est ton chiffre, pas le nôtre. Nous n’avons pas de chiffre de rétention à te vendre, et nous n’allons pas en inventer un.",
  "coaches.price.cta": "Démarrer l’essai de 14 jours",
  "coaches.price.trial_note": "14 jours, jusqu’à 3 élèves, puis ça s’arrête tout seul.",
} satisfies TranslatedMessagesOf<"coaches">;
