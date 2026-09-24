// Pack français — le namespace `install_app`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `install_app.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frInstallApp = {
  // ══ `/installer-app` ════════════════════════════════════════════════════
  // Le texte d'origine de la page, repris tel quel.
  "install_app.seo_title": "Installer Sophia sur son téléphone",
  "install_app.seo_description":
    "Comment installer Sophia sur Android ou iPhone, puis enregistrer ses identifiants pour se reconnecter sans friction.",
  "install_app.back_home": "Retour à l'accueil",
  "install_app.title": "Installer Sophia",
  "install_app.lead": "Ajoute Sophia à ton téléphone pour l’ouvrir comme une vraie app.",
  "install_app.detected": "Appareil détecté : {platform}",
  "install_app.device_unknown": "ton appareil",
  "install_app.android.title": "Installer Sophia sur Android",
  "install_app.android.body":
    "Si ton navigateur le permet, tu peux installer Sophia comme une app. Sinon, passe par le menu du navigateur.",
  "install_app.android.step1": "Ouvre Sophia dans Chrome sur Android.",
  "install_app.android.step2": "Touche le menu du navigateur.",
  "install_app.android.step3": "Choisis l'option pour installer ou ajouter l'app.",
  "install_app.android.install_now": "Installer maintenant",
  "install_app.android.fallback":
    "Si le bouton d'installation directe n'apparaît pas, utilise simplement le menu du navigateur.",
  "install_app.ios.title": "Ajouter Sophia à l'écran d'accueil sur iPhone",
  "install_app.ios.body":
    "Sur iPhone, l'installation passe par Safari. Il n'y a pas le même bouton natif que sur Android.",
  "install_app.ios.step1": "Ouvre Sophia dans Safari.",
  "install_app.ios.step2": "Touche le bouton Partager.",
  "install_app.ios.step3": "Choisis Sur l'écran d'accueil.",
  "install_app.ios.step4": "Valide pour créer l'icône Sophia.",
  "install_app.ios.tip":
    "Astuce : si tu es sur Chrome sur iPhone, ouvre Sophia dans Safari pour faire cette étape.",
  "install_app.credentials.title": "Enregistrer tes identifiants",
  "install_app.credentials.lead": "Pour revenir à Sophia en un clic, sans friction.",
  "install_app.credentials.android_title": "Sur Android",
  "install_app.credentials.android_body":
    "Active la sauvegarde proposée par Chrome ou Google Password Manager.",
  "install_app.credentials.ios_title": "Sur iPhone",
  "install_app.credentials.ios_body":
    "Active Trousseau iCloud pour que Safari propose d'enregistrer tes identifiants.",
} satisfies TranslatedMessagesOf<"install_app">;
