// Pack français — le namespace `photo`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `photo.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frPhoto = {
  // ── La photo de repas ────────────────────────────────────────────────────
  // CONTRAT non-entrée n°4: une photo atteste ce qu'il y a dans l'assiette,
  // elle ne le mesure jamais. Aucune calorie, aucun gramme, aucun pourcentage
  // — y compris aucun pourcentage de confiance — ne doit apparaître ici.
  "photo.button": "Ajouter une photo",
  "photo.button_hint":
    "Prends l’assiette en photo. Je lis ce qu’il y a dessus, jamais combien de calories.",
  "photo.choose": "Choisir une photo",
  "photo.change": "En choisir une autre",
  "photo.preview_alt": "La photo que tu t’apprêtes à envoyer",
  "photo.send": "Envoyer cette photo",
  "photo.sending": "Je lis ta photo…",
  "photo.cancel": "Annuler",
  "photo.saved": "Photo enregistrée.",
  "photo.already_on_file":
    "Cette photo était déjà là. Rien n’a été enregistré deux fois.",
  "photo.analysis_failed":
    "Ta photo est enregistrée, mais je n’ai pas su la lire cette fois. Rien n’a été noté sur son contenu.",
  "photo.unusable":
    "Ta photo est enregistrée. Je n’ai pas distingué les aliments assez nettement pour en dire quoi que ce soit.",
  "photo.detected_label": "Dans l’assiette",
  "photo.portion_label": "Portion",
  "photo.portion.small": "Plutôt petite",
  "photo.portion.moderate": "Moyenne",
  "photo.portion.large": "Généreuse",
  "photo.portion.unclear": "Difficile à dire sur la photo",
  "photo.verdict_label": "Face à ton plan",
  "photo.verdict.consistent": "Ça colle",
  "photo.verdict.partial": "En partie",
  "photo.verdict.inconsistent": "Ça ne colle pas",
  "photo.verdict.not_visible": "Impossible à dire sur cette photo",
  "photo.low_confidence":
    "Je ne suis pas sûre de cette lecture. Corrige-moi si je me trompe.",
  "photo.energy_label": "Énergie",
  // ⚠️ LE CHIFFRE ET SA BASE DANS LA MÊME LIGNE, jamais dans deux. Une base
  // posée à côté se lit comme une remarque générale; collée au nombre, elle en
  // fait partie.
  "photo.energy.photo_estimate": "environ {kcal} kcal, deviné d’après la photo",
  "photo.energy.declared_quantities":
    "environ {kcal} kcal, d’après les quantités que tu m’as données",
  "photo.no_quantity_note":
    "Une photo me dit ce qu’il y a dans l’assiette, pas quelle quantité. Rien ici n’est une mesure.",
  // La note ci-dessus CONTREDIRAIT un chiffre affiché (« pas quelle
  // quantité »). Celle-ci la remplace dès qu’un chiffre est là, et elle dit la
  // DIRECTION du biais: −26,6 % mesuré, toujours du même côté, pire sur les
  // grosses assiettes. « Une estimation » sans direction laisserait croire à
  // une erreur symétrique, ce qui est le contraire du fait.
  "photo.no_quantity_note_estimate":
    "Ce chiffre est deviné d’après la photo, pas mesuré — et les estimations sur photo tirent vers le bas, d’autant plus sur les grosses assiettes. Prends-le comme un ordre de grandeur.",
  "photo.error": "L’envoi n’a pas abouti. Rien n’a été enregistré — réessaie.",
  "photo.too_large": "Cette image est trop lourde. Essaie une photo plus petite.",
  "photo.unsupported_type": "Ce fichier n’est pas une image JPEG, PNG ou WebP.",
} satisfies TranslatedMessagesOf<"photo">;
