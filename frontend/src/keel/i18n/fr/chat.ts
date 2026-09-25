// Pack français — le namespace `chat`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `chat.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frChat = {
  // ══════════════════════════════════════════════════════════════════════════
  // LOT 3 — LA BULLE
  //
  // ⚠️ ELLE ENTRE PAR LA COQUILLE AUTANT QUE PAR SA PAGE: `KeelAppShell` rend
  // `chat.title` (le titre de la notification) et `chat.unread.aria` (le
  // libellé de la pastille) sur TOUS les écrans élève. Traduire la coquille
  // sans la bulle aurait laissé deux chaînes anglaises dans la barre.
  // ══════════════════════════════════════════════════════════════════════════
  "chat.title": "Sophia",
  "chat.empty":
    "Rien ici pour l’instant. Pose-moi une question sur ton plan ou sur l’app, ou dis-moi ce que tu as mangé.",
  "chat.input.placeholder": "Écrire à Sophia",
  "chat.send": "Envoyer",
  "chat.thinking": "Sophia écrit…",
  "chat.history.more": "Charger les messages précédents",
  "chat.history.loading": "Chargement…",
  "chat.error.send": "Le message n’est pas parti. Réessaie.",
  // ⚠️ CE N'EST PAS `chat.error.send`, ET LA DIFFÉRENCE EST TOUT LE PROPOS.
  // Là, le message EST arrivé et il est en base — c'est la réponse qui manque.
  // Dire « réessaie » serait faux deux fois: ça laisserait croire que ce qu'on
  // a écrit est perdu, et ça ferait rejouer un tour pour le même résultat.
  "chat.error.noReply":
    "Ton message est bien arrivé, mais Sophia n’a pas répondu cette fois. Réécris-lui, ou reformule.",
  // Honnête plutôt que rassurant: on dit que la livraison instantanée est
  // tombée ET que rien n'est perdu, parce que les deux sont vrais.
  "chat.status.offline":
    "Les mises à jour en direct sont coupées — les messages arrivent quand même, juste plus lentement.",
  // Le libellé est le MÊME pour les trois messages qui partent sans qu'on ait
  // rien demandé: il dit qui a ouvert la bouche, pas pourquoi.
  "chat.proactive.label": "Sophia a écrit la première",
  "chat.answer.kicker": "Ta réponse",
  "chat.unread.aria": "Messages non lus de Sophia : {count}",
  "chat.settings.toggle": "Notifications",
  // ⟳ 2026-09-23 — UN SEUL INTERRUPTEUR, activé ou désactivé. Il remplace
  // « Les nouvelles de Sophia », « Me demander à chaque repas » et « Me
  // prévenir sur cet appareil ». Allumé, il rallume les trois; éteint, il
  // coupe tout ce que Sophia envoie d'elle-même. Elle répond toujours quand
  // on lui écrit — la phrase le dit, sinon on croirait se couper d'elle.
  "chat.settings.all.label": "Recevoir les notifications",
  "chat.settings.all.help":
    "Sophia t’écrit le soir, et cet appareil te prévient quand elle le fait. Éteint, elle ne t’écrit plus d’elle-même ; elle répond toujours quand tu lui écris.",
  "chat.settings.notify.blocked":
    "Ton navigateur bloque les notifications pour ce site — autorise-les là-bas d’abord.",
  // ── LE GESTE « + » DU COMPOSEUR ────────────────────────────────────────
  //
  // ⛔ PAS « APPAREIL PHOTO ». Une icône d'appareil photo promet
  // « photographie tout »; le « + » promet « déclare quelque chose qui n'était
  // pas prévu », et deux des trois options ne sont pas des photos.
  "chat.compose.add": "Ajouter quelque chose",
  "chat.compose.add.close": "Fermer",
  "chat.compose.add.photo": "Photo d'un repas non prévu",
  "chat.compose.add.describe": "Décrire un repas non prévu",
  "chat.compose.add.weight": "Mettre à jour mon poids",
  "chat.compose.add.week": "Suivi des repas",
  "chat.photo.label": "Photo",
  "chat.photo.sending": "Envoi d’une photo…",
  "chat.photo.error.type":
    "Ce type de fichier n’est pas accepté — envoie un JPEG, un PNG ou un WebP.",
  "chat.photo.error.size": "Cette photo est trop lourde. Essaie-en une plus petite.",
  // Une photo choisie ATTEND dans le composeur au lieu de partir seule: le mot
  // qui l'accompagne se tape après l'avoir choisie, jamais avant.
  "chat.photo.attached": "Photo prête à partir",
  "chat.photo.remove": "Retirer",
  "chat.photo.caption.placeholder": "Dis-en un mot (facultatif)",

  "chat.weekly.title": "Comment la semaine s’est vraiment passée",
  "chat.weekly.subtitle":
    "Six lectures rapides. Deux minutes, et rien ici n’est noté.",
  // R4 — le sous-titre du dimanche POIDS SEUL. Sans lecteur humain, l'écran se
  // réduit aux deux mesures, et « six lectures » annoncerait quatre questions
  // qu'on a décidé de ne pas poser.
  "chat.weekly.subtitle.measures":
    "Deux nombres, si tu les suis. Rien ici n’est noté.",
  "chat.weekly.optional": "Facultatif — seulement si tu les suis.",
  "chat.weekly.weight": "Poids (kg)",
  "chat.weekly.waist": "Tour de taille (cm)",
  "chat.weekly.submit": "Envoyer",
  "chat.weekly.cancel": "Pas maintenant",
  "chat.weekly.error.empty":
    "Donne une note à l’une des six, ou remplis un nombre.",
  "chat.weekly.error.empty.measures": "Remplis au moins l’un des deux.",
  "chat.weekly.error.number": "{field} doit être un nombre.",
  // Hors bornes = refusé et NOMMÉ, jamais ramené au bord: une valeur corrigée
  // en silence est une donnée fausse qui a l'air vraie.
  "chat.weekly.error.range": "{field} doit être entre {min} et {max}.",

  // ══ FF-062 C2 — LE RAPPEL DE PESÉE ══════════════════════════════════════
  //
  // ⚠️ LE PLACEHOLDER DU CHAMP PORTE LE DERNIER POIDS, ET C'EST R8. Il n'a PAS
  // de clé: c'est un NOMBRE, formaté par `formatNumber`. Le champ
  // reste VIDE: un champ pré-rempli se valide sans être lu, et on
  // enregistrerait la valeur de l'avant-veille comme une pesée d'aujourd'hui.
  "chat.weighin.title": "Ton poids",
  "chat.weighin.subtitle": "Un chiffre. C’est là-dessus que ton plan est calibré.",
  "chat.weighin.field": "Poids (kg)",
  "chat.weighin.submit": "Enregistrer",
  "chat.weighin.cancel": "Pas maintenant",
  "chat.weighin.error.empty":
    "Rien n’a été saisi — tape un poids, ou reviens plus tard.",
  "chat.weighin.error.number": "Ça doit être un nombre.",
  "chat.weighin.error.range": "Un poids doit être entre {min} et {max} kg.",
  // FF-062 C1 — le créneau qu'une question de repas a NOMMÉ, et que la photo
  // suivante portera. Affiché parce qu'un créneau forcé invisible est un état
  // caché qui décide d'un fait.
  "chat.slotmeal.forced": "Cette photo sera enregistrée pour : {slot}",
  // Les six moments, DANS le namespace `chat` — voir `api/slotMeal.ts`.
  "chat.slotmeal.slot.breakfast": "le petit-déjeuner",
  "chat.slotmeal.slot.snack_am": "ta collation du matin",
  "chat.slotmeal.slot.lunch": "le déjeuner",
  "chat.slotmeal.slot.snack_pm": "ton goûter",
  "chat.slotmeal.slot.dinner": "le dîner",
  "chat.slotmeal.slot.before_bed": "ta collation du soir",

  // ══ FF-062 R11 — LE CHIFFRE D'ÉNERGIE, CORRIGÉ ══════════════════════════
  //
  // ⚠️ LE PLACEHOLDER PORTE LE CHIFFRE ACTUEL, ET LE CHAMP RESTE VIDE — un
  // champ pré-rempli validé sans être lu réécrirait le chiffre DEVINÉ en le
  // faisant passer pour une déclaration.
  // ── LES SIX AXES ET LES CINQ CRANS ──────────────────────────────────────
  // ⚠️ L'ANGLAIS DE CES ONZE CLÉS EST SOUS CONTRAT AVEC UN FICHIER DENO
  // (`weekly_flow.ts`, comparé mot pour mot par un test). Le FRANÇAIS, lui, est
  // libre: les constantes serveur ne servent que des consignes de modèle et un
  // formulaire Meta hérité, jamais un écran d'élève. Voir la note d'`en.ts`.
  //
  // L'article défini sur chaque axe (« l’énergie », « la faim ») et pas le nom
  // nu: la question posée est « comment ça s’est passé », et une liste de noms
  // nus se lirait comme un questionnaire clinique.
  "chat.weekly.axis.energy": "L’énergie au quotidien",
  "chat.weekly.axis.hunger": "La faim entre les repas",
  "chat.weekly.axis.sleep": "La qualité du sommeil",
  "chat.weekly.axis.digestion": "La digestion",
  "chat.weekly.axis.mood": "L’humeur",
  "chat.weekly.axis.training": "La qualité des séances",
  "chat.weekly.scale.1": "1 — mauvais",
  "chat.weekly.scale.2": "2 — médiocre",
  "chat.weekly.scale.3": "3 — correct",
  "chat.weekly.scale.4": "4 — bien",
  "chat.weekly.scale.5": "5 — très bien",
} satisfies TranslatedMessagesOf<"chat">;
