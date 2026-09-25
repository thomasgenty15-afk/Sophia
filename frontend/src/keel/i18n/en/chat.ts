// Seed anglais — le namespace `chat`, et lui seul.
// Assemblé dans `../en.ts`; une clé `chat.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enChat = {
  // DE-WHATSAPP — la bulle. C'est LE canal, plus un simulateur: la
  // conversation quotidienne avec Sophia vit ici, dans l'app.
  "chat.title": "Sophia",
  "chat.empty": "Nothing here yet. Ask me about your plan or the app, or tell me what you ate.",
  "chat.input.placeholder": "Write to Sophia",
  "chat.send": "Send",
  "chat.thinking": "Sophia is writing…",
  "chat.history.more": "Load earlier messages",
  "chat.history.loading": "Loading…",
  "chat.error.send": "That didn't go through. Try again.",
  // ⚠️ CE N'EST PAS `chat.error.send`, ET LA DIFFÉRENCE EST TOUT LE PROPOS.
  // Là, le message EST arrivé et il est en base — c'est la réponse qui manque.
  "chat.error.noReply":
    "Your message came through, but Sophia didn't reply this time. Write again, or put it another way.",
  // Honnête plutôt que rassurant: on dit que la livraison instantanée est
  // tombée ET que rien n'est perdu, parce que les deux sont vrais.
  "chat.status.offline":
    "Live updates are off right now — messages still arrive, just more slowly.",

  // ── CE QUI DIT « ELLE A ÉCRIT LA PREMIÈRE » ────────────────────────────────
  // Trois messages partent sans que l'élève ait rien demandé: le tap du soir,
  // le point du dimanche, et la relance après un silence. Rendus sans marque,
  // ils se lisaient comme la réponse à quelque chose qu'il n'avait pas dit.
  // Le libellé est le MÊME pour les trois: il dit qui a ouvert la bouche, pas
  // pourquoi — la raison est dans le message lui-même.
  "chat.proactive.label": "Sophia reached out",
  "chat.answer.kicker": "Your answer",
  "chat.unread.aria": "Unread messages from Sophia: {count}",

  // Les réglages de la bulle. `proactive_muted_at` existait, la politique de
  // livraison le respectait, et AUCUN écran ne pouvait le poser.
  "chat.settings.toggle": "Notifications",
  // ⟳ 2026-09-23 — one switch, on or off (see `fr.ts`).
  "chat.settings.all.label": "Get notifications",
  "chat.settings.all.help":
    "Sophia writes to you in the evening, and this device lets you know when she does. Turned off, she no longer writes first; she always answers when you write to her.",
  "chat.settings.notify.blocked":
    "Your browser is blocking notifications for this site — allow them there first.",

  // Le point hebdomadaire, dans l'app. C'était un WhatsApp Flow: deux écrans
  // declares chez Meta. Il ne reste que ce qui comptait.
  // The composer "+" — never a camera icon: two of the three options are not
  // photos, so a camera would lie about two thirds of the menu.
  "chat.compose.add": "Add something",
  "chat.compose.add.close": "Close",
  "chat.compose.add.photo": "Photo of an unplanned meal",
  "chat.compose.add.describe": "Describe an unplanned meal",
  "chat.compose.add.weight": "Update my weight",
  "chat.compose.add.week": "Meal tracking",
  "chat.photo.label": "Photo",
  "chat.photo.sending": "Sending a photo…",
  "chat.photo.error.type": "That file type isn't supported — send a JPEG, PNG or WebP.",
  "chat.photo.error.size": "That photo is too large. Try a smaller one.",
  // Une photo choisie ATTEND dans le composeur au lieu de partir seule: le mot
  // qui l'accompagne — « la moitié », « c'était hier » — se tape après l'avoir
  // choisie, jamais avant.
  "chat.photo.attached": "Photo ready to send",
  "chat.photo.remove": "Remove",
  "chat.photo.caption.placeholder": "Say something about it (optional)",

  "chat.weekly.title": "How the week actually went",
  "chat.weekly.subtitle": "Six quick reads. Two minutes, and nothing here is graded.",
  // R4 — LE SOUS-TITRE DU DIMANCHE POIDS-SEUL. Les six axes ne se demandent
  // qu'aux élèves dont un coach humain lit la synthèse; sans lecteur, l'écran se
  // réduit aux deux mesures. « Six quick reads » sous deux champs annoncerait
  // quatre questions qu'on a décidé de ne pas poser.
  "chat.weekly.subtitle.measures":
    "Two numbers, if you track them. Nothing here is graded.",
  "chat.weekly.optional": "Optional — only if you track them.",
  "chat.weekly.weight": "Weight (kg)",
  "chat.weekly.waist": "Waist (cm)",
  "chat.weekly.submit": "Send",
  "chat.weekly.cancel": "Not now",
  // Les deux vacuités, et elles ne disent pas la même chose. Avec les axes, un
  // score OU une mesure suffit — refuser un poids seul au nom d'une question non
  // remplie était le défaut que R4 a trouvé. Sans les axes, il ne reste que les
  // deux nombres, et le message ne doit pas citer « les six ».
  "chat.weekly.error.empty": "Give one of the six a score, or fill in a number.",
  "chat.weekly.error.empty.measures": "Fill in at least one of the two.",
  "chat.weekly.error.number": "{field} should be a number.",
  // Hors bornes = refusé et NOMMÉ, jamais ramené au bord: une valeur corrigee
  // en silence est une donnee fausse qui a l'air vraie.
  "chat.weekly.error.range": "{field} should be between {min} and {max}.",

  // ══ FF-062 C2 — LE RAPPEL DE PESÉE ══════════════════════════════════════
  //
  // ⚠️ LE PLACEHOLDER DU CHAMP PORTE LE DERNIER POIDS, ET C'EST R8. Il n'a PAS
  // de clé: c'est un NOMBRE, formaté par `formatNumber` (78,4 en français, 78.4
  // en anglais) — une clé qui ne contiendrait que `{kg}` serait un mot de
  // traduction sans mot, et la garde d'anti-recopie du pack la refuse à juste
  // titre. Le point
  // du dimanche met le LIBELLÉ en placeholder (« Poids (kg) ») parce que son
  // champ est un parmi huit; ici le champ est seul, donc le placeholder peut
  // porter le repère. Le champ, lui, reste VIDE — un champ pré-rempli se valide
  // sans être lu, et on enregistrerait la valeur de l'avant-veille comme une
  // pesée d'aujourd'hui.
  "chat.weighin.title": "Your weight",
  "chat.weighin.subtitle": "One number. It is what your plan is sized on.",
  "chat.weighin.field": "Weight (kg)",
  "chat.weighin.submit": "Save",
  "chat.weighin.cancel": "Not now",
  "chat.weighin.error.empty": "Nothing entered — type a weight, or come back later.",
  "chat.weighin.error.number": "That should be a number.",
  "chat.weighin.error.range": "A weight should be between {min} and {max} kg.",
  // FF-062 C1 — le créneau qu'une question de repas a NOMMÉ, et que la photo
  // suivante portera. Affiché parce qu'un créneau forcé invisible est un état
  // caché qui décide d'un fait.
  "chat.slotmeal.forced": "This photo will be logged as {slot}",
  // Les six moments, DANS le namespace `chat` — voir `api/slotMeal.ts`:
  // `/app/chat` ne déclare pas `slot`, et l'y faire entrer y amènerait cinq
  // autres namespaces d'un coup.
  "chat.slotmeal.slot.breakfast": "breakfast",
  "chat.slotmeal.slot.snack_am": "your morning snack",
  "chat.slotmeal.slot.lunch": "lunch",
  "chat.slotmeal.slot.snack_pm": "your afternoon snack",
  "chat.slotmeal.slot.dinner": "dinner",
  "chat.slotmeal.slot.before_bed": "your evening snack",

  // ══ FF-062 R11 — LE CHIFFRE D'ÉNERGIE, CORRIGÉ ══════════════════════════
  //
  // ⚠️ LE PLACEHOLDER PORTE LE CHIFFRE ACTUEL, ET LE CHAMP RESTE VIDE. Même
  // règle que le rappel de pesée, et elle compte davantage ici: un champ
  // pré-rempli validé sans être lu réécrirait le chiffre DEVINÉ en le faisant
  // passer pour une déclaration — c'est-à-dire exactement la distinction que
  // cette correction existe pour établir.
  // ── LES SIX AXES ET LES CINQ CRANS (lot 4) ──────────────────────────────
  //
  // ⚠️ CES ONZE VALEURS SONT SOUS CONTRAT AVEC UN FICHIER DENO, et le contrat
  // est vérifié: `api/weeklyCheckIn.int.test.ts` lit
  // `supabase/functions/_shared/keel/weekly_flow.ts` sur le disque et compare
  // MOT POUR MOT avec l'ANGLAIS ci-dessous. Changer un mot ici sans le changer
  // là-bas fait rougir — et c'est voulu.
  //
  // Ce que le contrat N'EMPÊCHE PAS, et c'est ce qui a débloqué la traduction:
  // les constantes serveur portent le suffixe `_EN` et n'ont pas de jumelle
  // française parce qu'elles ne servent PAS d'interface. Leurs deux lecteurs
  // sont (1) des consignes de modèle — `meal_generation.ts`,
  // `week_plan_generation.ts` écrivent « the one thing they want to see
  // improve: … » dans un prompt anglais — et (2) `weeklyFlowJson()`, la
  // définition d'un formulaire Meta hérité du canal WhatsApp. Aucun des deux
  // n'est lu par un élève. Le pack français vit donc ENTIÈREMENT côté front, et
  // le mot-pour-mot est réancré sur le seed anglais, qui est la même chaîne
  // qu'avant.
  // ⚠️ LA TROISIÈME COPIE DE CES SIX MOTS EST PARTIE (lot 6).
  // `api/bodyMeasures.ts` portait `FOCUS_AXIS_LABELS`, lu par
  // `StudentWeekPlanPage` (le sélecteur « ce que tu veux voir bouger ») et par
  // `bodyMeasures` lui-même. Le contrat croisé ci-dessus ne la couvrait pas — il
  // compare le front au Deno, pas le front à lui-même. Elle lit maintenant CES
  // clés-ci, par `focusAxisLabel(axis)`.
  //
  // ⚠️ ET LE DÉPLACEMENT SEUL N'AURAIT PAS SUFFI: son unique lecteur mettait
  // l'étiquette en minuscules DANS une phrase anglaise construite en dur
  // (« working on … »). Traduire la table sans réécrire la phrase aurait
  // déplacé la copie en gardant la couture. La phrase est
  // `plan.goal.working_on`, et elle a son propre trou.
  "chat.weekly.axis.energy": "Day-to-day energy",
  "chat.weekly.axis.hunger": "Hunger between meals",
  "chat.weekly.axis.sleep": "Sleep quality",
  "chat.weekly.axis.digestion": "Digestion",
  "chat.weekly.axis.mood": "Mood",
  "chat.weekly.axis.training": "Training quality",
  // Les cinq crans, nommés. Un chiffre nu invite chacun à sa propre échelle.
  "chat.weekly.scale.1": "1 — bad",
  "chat.weekly.scale.2": "2 — poor",
  "chat.weekly.scale.3": "3 — ok",
  "chat.weekly.scale.4": "4 — good",
  "chat.weekly.scale.5": "5 — great",
} as const
