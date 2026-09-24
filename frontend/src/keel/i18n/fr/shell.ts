// Pack français — le namespace `shell`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `shell.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frShell = {
  // ══════════════════════════════════════════════════════════════════════════
  // LOT 3 — LA COQUILLE DE L'APP CONNECTÉE
  //
  // `KeelAppShell` entoure chaque écran d'élève et de coach. Ces douze mots
  // sont ce qu'on lit AUTOUR de tout le reste; tant qu'ils étaient anglais,
  // aucune page d'app ne pouvait basculer sans être cousue.
  // ══════════════════════════════════════════════════════════════════════════
  "shell.nav.students": "Élèves",
  "shell.nav.templates": "Modèles",
  // « Aliments recommandés » et pas « Méthode »: l'écran ne demande plus une
  // posture sur des groupes abstraits, il demande les ALIMENTS avec lesquels le
  // coach construit.
  "shell.nav.protocol": "Aliments recommandés",
  "shell.nav.doctrine": "Doctrine",
  // La bibliothèque de recettes, pas les repas de l'élève.
  "shell.nav.meals": "Recettes",
  "shell.nav.weekly": "Cette semaine",
  "shell.nav.account": "Compte",
  "shell.nav.billing": "Abonnement",
  "shell.nav.install_app": "Installer l’app",
  // FF-064 — voir le pavé de `en.ts`.
  "shell.trial.ending": "Ta semaine offerte se termine dans {days}.",
  // ⚠️ Sous `shell` et pas sous `billing` — voir le pavé de `en.ts`.
  "shell.trial.days_one": "{count} jour",
  "shell.trial.days_many": "{count} jours",
  "shell.trial.cta": "Voir mon abonnement",
  "shell.trial.dismiss": "Masquer jusqu’à demain",
  "shell.nav.legal": "Mentions légales",
  "shell.nav.sign_out": "Se déconnecter",
  "shell.nav.menu": "Menu",
  "shell.nav.menu_close": "Fermer",
  "shell.nav.primary": "Sections principales",
  // Voir le pavé jumelé dans `en.ts`: la forme visible tient dans la colonne,
  // l'`aria` porte la raison.
  "shell.quick_add.caption": "Hors du plan",
  "shell.quick_add.aria":
    "Ajouter un plat hors du plan, pour qu'il soit pris en compte",
} satisfies TranslatedMessagesOf<"shell">;
