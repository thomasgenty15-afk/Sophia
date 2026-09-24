// Pack français — le namespace `pro`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `pro.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frPro = {
  //
  // ── LE MOT QUI CHANGE D'UNE PAGE À L'AUTRE ───────────────────────────────
  // Ici ce sont des CLIENTS. « Élèves » appartient à `/coaches` seulement.
  // ⛔ « suivi personnalisé » nulle part. ⛔ Jamais « votre équipe » (B20).
  "pro.seo_title": "Sophia pour les pros — votre méthode, qui répond chaque jour",
  "pro.seo_description":
    "Vous enregistrez votre méthode une fois ; Sophia répond à vos clients avec elle, dans la conversation comme dans chaque semaine et chaque repas qu’elle rédige. 7 € par client et par mois.",

  "pro.hero.kicker": "Pour ceux qui vendent une méthode, pas des heures",
  "pro.hero.title": "Votre méthode au travail les jours où vous n’êtes pas là.",
  "pro.hero.lede":
    "Coachs, salles, communautés payantes : cinq choses qui doivent tenir quand vous n’êtes pas là.",
  "pro.hero.cta": "Démarrer l’essai de 14 jours",
  "pro.hero.note":
    "14 jours, jusqu’à 3 clients, puis ça s’arrête tout seul. Ensuite 7 € par client et par mois.",

  "pro.lines.kicker": "Le produit entier",
  // ⚠️ Voir la note anglaise: on ne sert pas au lecteur le nom de notre grille.
    // ⚠️ CINQ, ET C'ÉTAIT « SIX » JUSQU'AU 2026-08-19. Le compte n'est pas un
  // effet de style: la grille en dessous rend exactement autant de lignes. La
  // ligne 05 (B27, « chaque ligne cite la conviction qu'elle applique ») a été
  // retirée ce jour-là — le pourquoi est écrit une seule fois, dans `en.ts`,
  // et le `lede` du hero porte le même compte.
  "pro.lines.title": "Cinq fois où ça casse sans vous. Cinq réponses.",

  "pro.line.method.pain":
    "Ce qui doit être dit chaque jour ne peut pas dépendre de votre présence.",
  "pro.line.method.title": "Une méthode posée une fois, puis elle répond.",
  "pro.line.method.body":
    "La vôtre — ou la nôtre, si vous n’en avez pas. Le chemin existe ; le contenu de la méthode maison, lui, s’écrit encore.",

  "pro.line.daily.pain": "Vos clients ont des questions entre deux séances.",
  "pro.line.daily.title": "Le quotidien, tenu par votre méthode.",
  "pro.line.daily.body":
    "Elle entre à trois endroits : la conversation, le repas qu’ils cuisinent, et celui qu’ils cuisinent pour une table.",

  "pro.line.lock.pain": "Une IA qui parle en votre nom vous contredira.",
  "pro.line.lock.title": "Le double verrou.",
  "pro.line.lock.body":
    "Votre méthode entre dans la conversation, dans chaque semaine et dans chaque repas ; et ce qu’elle écrit dans la conversation est relu contre vos lignes rouges avant l’envoi — sans modèle dans cette boucle.",

  "pro.line.monday.pain":
    "Vous apprenez qu’un client a décroché une fois qu’il est parti.",
  "pro.line.monday.title": "Le lundi en une page.",
  "pro.line.monday.body":
    "Qui a répondu, qui s’est tu depuis deux jours, qui n’a rien dit depuis cinq. Calculée, jamais rédigée par un modèle — et vos clients seulement.",

  // ⚠️ `pro.line.cite.*` retirées le 2026-08-19 — voir le commentaire d'en.ts.
  // La garantie B27 reposait sur un CHECK que plus aucun écrivain ne satisfait.

  "pro.line.seat.pain": "Les plateformes facturent par palier.",
  "pro.line.seat.title": "Le siège est le seul poste.",
  "pro.line.seat.body":
    "7 € par client et par mois. Éteignez un siège, il cesse d’être facturé ce mois-là. Pas de forfait plateforme.",

  "pro.fig.alt":
    "Votre méthode et vos lignes rouges entrent ; ce qui franchit une ligne est retenu et remplacé avant l’envoi.",
  "pro.fig.method": "VOTRE MÉTHODE",
  "pro.fig.method_2": "écrite une fois",
  "pro.fig.lines": "VOS LIGNES ROUGES",
  "pro.fig.lines_2": "et ce que vous faites",
  "pro.fig.check": "relu",
  "pro.fig.sent": "ENVOYÉ",
  "pro.fig.held": "RETENU",
  "pro.fig.held_2": "dans vos mots",
  "pro.fig.caption":
    "Une consigne est suivie presque toujours. Une relecture n’en est pas une : elle tourne sur ce qui va partir.",

  "pro.close.title":
    "Nous n’avons pas de chiffre de rétention à vous vendre, et nous n’allons pas en inventer un.",
  "pro.close.body":
    "Rien ici ne mesure le churn contre un témoin : un chiffre écrit ici ne serait que de la décoration.",
  "pro.close.cta": "Démarrer l’essai de 14 jours",

  "pro.doors.title": "Trois métiers, trois pages.",
  "pro.door.coaches.title": "Vous vendez une formation",
  // ⚠️ Voir la note du bloc anglais: la carte citait le H1 de `/coaches`.
  "pro.door.coaches.body": "Ce qui ne se vendait qu’une fois, facturé chaque mois.",
  "pro.door.coaches.cta": "Voir pour une formation",
  "pro.door.gyms.title": "Vous tenez une salle indépendante",
  "pro.door.gyms.body":
    "Trois heures par semaine avec vous ; vingt et un repas sans vous.",
  "pro.door.gyms.cta": "Voir pour une salle",
  "pro.door.communities.title": "Vous tenez une communauté payante",
  "pro.door.communities.body":
    "Un fil n’a pas de destinataire. Voici la couche individuelle qui se pose dessous.",
  "pro.door.communities.cta": "Voir pour une communauté",
} satisfies TranslatedMessagesOf<"pro">;
