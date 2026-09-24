// Seed anglais — le namespace `photo`, et lui seul.
// Assemblé dans `../en.ts`; une clé `photo.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enPhoto = {
  // Meal photo (W5.4). CONTRACT non-input #4 governs every string below: a
  // photo evidences what is on the plate, it never measures it. No calorie, no
  // gram, no percentage — including no confidence percentage — appears here.
  "photo.button": "Add a photo",
  "photo.button_hint": "Snap the plate. I read what is on it, never how many calories.",
  "photo.choose": "Choose a photo",
  "photo.change": "Choose another",
  "photo.preview_alt": "The photo you are about to send",
  "photo.send": "Send this photo",
  "photo.sending": "Reading your photo...",
  "photo.cancel": "Cancel",
  "photo.saved": "Photo saved.",
  "photo.already_on_file": "That photo was already on file. Nothing was logged twice.",
  "photo.analysis_failed":
    "Your photo is saved, but I could not read it this time. Nothing was recorded about its content.",
  "photo.unusable":
    "Your photo is saved. I could not make out the food well enough to say anything about it.",
  "photo.detected_label": "On the plate",
  "photo.portion_label": "Portion",
  "photo.portion.small": "On the small side",
  "photo.portion.moderate": "Moderate",
  "photo.portion.large": "Generous",
  "photo.portion.unclear": "Hard to tell from the photo",
  "photo.verdict_label": "Against your plan",
  "photo.verdict.consistent": "Looks consistent",
  "photo.verdict.partial": "Partly there",
  "photo.verdict.inconsistent": "Does not line up",
  "photo.verdict.not_visible": "Cannot tell from this photo",
  "photo.low_confidence": "I am not confident about this reading. Correct me if I got it wrong.",
  "photo.energy_label": "Energy",
  // ⚠️ LE CHIFFRE ET SA BASE DANS LA MÊME LIGNE, jamais dans deux. Une base
  // posée à côté (une note plus bas, un libellé de colonne) se lit comme une
  // remarque générale; collée au nombre, elle en fait partie.
  "photo.energy.photo_estimate": "about {kcal} kcal, guessed from the photo",
  "photo.energy.declared_quantities": "about {kcal} kcal, from the quantities you gave me",
  "photo.no_quantity_note":
    "A photo tells me what is on the plate, not how much of it. Nothing here is a measurement.",
  // La note ci-dessus CONTREDIRAIT un chiffre affiché (« pas quelle quantité »).
  // Celle-ci la remplace dès qu'un chiffre est là, et elle dit la direction du
  // biais: −26,6 % mesuré, toujours du même côté, pire sur les gros repas.
  // « Une estimation » sans direction laisserait croire à une erreur
  // symétrique, ce qui est précisément le contraire du fait.
  "photo.no_quantity_note_estimate":
    "That figure is guessed from the photo, not measured - and photo guesses run low, more so on big plates. Take it as an order of magnitude.",
  "photo.error": "That did not send. Nothing was saved - try again.",
  "photo.too_large": "That image is too large. Try a smaller photo.",
  "photo.unsupported_type": "That file is not a JPEG, PNG or WebP image.",
} as const
