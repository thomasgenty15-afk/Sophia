// Seed anglais — le namespace `install_app`, et lui seul.
// Assemblé dans `../en.ts`; une clé `install_app.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enInstallApp = {
  // ══ `/installer-app` — AJOUTER SOPHIA À L'ÉCRAN D'ACCUEIL ════════════════
  // `pages/InstallAppGuide.tsx`, page de support publique (noindex). Le texte
  // d'origine était français, en dur.
  "install_app.seo_title": "Install Sophia on your phone",
  "install_app.seo_description":
    "How to install Sophia on Android or iPhone, then save your login details to sign back in without friction.",
  "install_app.back_home": "Back to home",
  "install_app.title": "Install Sophia",
  "install_app.lead": "Add Sophia to your phone to open it like a real app.",
  "install_app.detected": "Detected device: {platform}",
  "install_app.device_unknown": "your device",
  "install_app.android.title": "Install Sophia on Android",
  "install_app.android.body":
    "If your browser allows it, you can install Sophia as an app. Otherwise, go through the browser menu.",
  "install_app.android.step1": "Open Sophia in Chrome on Android.",
  "install_app.android.step2": "Tap the browser menu.",
  "install_app.android.step3": "Choose the option to install or add the app.",
  "install_app.android.install_now": "Install now",
  "install_app.android.fallback":
    "If the direct install button doesn't appear, just use the browser menu.",
  "install_app.ios.title": "Add Sophia to the Home Screen on iPhone",
  "install_app.ios.body":
    "On iPhone, installing goes through Safari. There is no native button like the one on Android.",
  "install_app.ios.step1": "Open Sophia in Safari.",
  "install_app.ios.step2": "Tap the Share button.",
  "install_app.ios.step3": "Choose Add to Home Screen.",
  "install_app.ios.step4": "Confirm to create the Sophia icon.",
  "install_app.ios.tip":
    "Tip: if you're using Chrome on iPhone, open Sophia in Safari to do this step.",
  "install_app.credentials.title": "Save your login details",
  "install_app.credentials.lead": "To come back to Sophia in one click, without friction.",
  "install_app.credentials.android_title": "On Android",
  "install_app.credentials.android_body":
    "Turn on the saving offered by Chrome or Google Password Manager.",
  "install_app.credentials.ios_title": "On iPhone",
  "install_app.credentials.ios_body":
    "Turn on iCloud Keychain so Safari offers to save your login details.",
} as const
