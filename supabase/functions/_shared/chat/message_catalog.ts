/// <reference path="../../tsserver-shims.d.ts" />

export type WhatsAppTemplateDefinition = {
  name: string;
  body: string;
  buttons: string[];
};

export const WHATSAPP_TEMPLATE_CATALOG: Record<
  string,
  WhatsAppTemplateDefinition
> = {
  global_reach_template: {
    name: "global_reach_template",
    body: "J'ai une info pour toi, je peux te la donner ? 😊",
    buttons: ["Oui!", "Plus tard!"],
  },
  // W2.B: `weekly_planning_validation_v1` et `auto_validation_v1` ont été
  // retirés du catalogue avec la machine de validation hebdo. Les templates
  // restent approuvés côté Meta mais ce dépôt n'en émet plus aucun.
  sophia_winback_step1_soft: {
    name: "sophia_winback_step1_soft",
    body:
      "Je te laisse un petit mot ici au cas où.\nSi tu veux reprendre doucement, je suis là. 🧙",
    buttons: ["Je veux bien", "Pas maintenant", "J'ai décroché"],
  },
  sophia_winback_step2_refocus: {
    name: "sophia_winback_step2_refocus",
    body:
      "Je retente juste une fois comme ça.\nSi tu veux, on peut reprendre en version très simple, sans se prendre la tête. 😊",
    buttons: ["On fait simple", "Pas cette semaine", "Laisse-moi revenir"],
  },
  sophia_winback_step3_opendoor: {
    name: "sophia_winback_step3_opendoor",
    body:
      "Je te laisse la porte ouverte, sans urgence.\nMême un simple “salut” et on repart tranquillement.",
    buttons: ["Salut", "Pause", "Stop"],
  },
  sophia_reminder_consent_v1_: {
    name: "sophia_reminder_consent_v1_",
    // NOTE: keep this body in sync with the Meta-approved template. The button
    // label was changed to "Pas maintenant" (decline is recognized by the
    // isCheckinLater regex in whatsapp-webhook/index.ts).
    body: "Hello, tu veux que je t'envoie ton rendez-vous maintenant ? 😊",
    buttons: ["Avec plaisir !", "Pas maintenant"],
  },
  end_subscription_v1: {
    name: "end_subscription_v1",
    body:
      "Coucou {{1}}, ton abonnement Sophia s'est terminé. 🥲\nSi tu veux, je peux t'envoyer le lien pour réactiver ton accès et continuer ensemble. Tu veux ? ☺️",
    buttons: ["Avec plaisir!", "Pas pour le moment!"],
  },
  end_trial_v1: {
    name: "end_trial_v1",
    body:
      "Coucou {{1}}, ton essai s'est terminé. 🥲\nSi tu as trouvé l'aide que tu cherchais, je peux t'envoyer le lien pour continuer ensemble. Tu veux ? ☺️",
    buttons: ["C'est parti !", "Pas pour le moment"],
  },
  subscription_confirmed_v1: {
    name: "subscription_confirmed_v1",
    body:
      "C’est confirmé ✅\nTon abonnement Sophia est bien activé.\n\nJe suis contente de te retrouver ici.",
    buttons: [],
  },
  plan_activated_v1: {
    name: "plan_activated_v1",
    body: "Ça y est {{1}}, ton plan est validé et lancé ! 🎉",
    buttons: [],
  },
  sophia_bilan_weekly_v1: {
    name: "sophia_bilan_weekly_v1",
    body:
      "Hello {{1}}, c'est l'heure de ton bilan de la semaine (important!). 😉\nOn y va ?",
    buttons: ["Go !", "La semaine prochaine!"],
  },
  sophia_bilan_v2: {
    name: "sophia_bilan_v2",
    body: "Hey {{1}} 😊\nPrêt pour ton petit bilan ?",
    buttons: ["Carrément!", "On le fait demain!"],
  },
  sophia_checkin_v2: {
    name: "sophia_checkin_v2",
    // Meta-approved body has zero placeholders: do not inject a name param.
    body:
      "Hello 🙂\nJ’aimerais prendre rapidement de tes nouvelles. C’est ok pour toi ?",
    buttons: ["Oui !", "Une prochaine fois !"],
  },
  morning_nudge_v1: {
    name: "morning_nudge_v1",
    body: "Hello ! Prêt pour ton boost du matin ? 💥",
    buttons: ["Go !"],
  },
  // Out-of-24h "bonne journée" variants: self-contained, no button, no pending.
  // Used only when nothing is planned and the 24h window is closed.
  morning_light_v1: {
    name: "morning_light_v1",
    body:
      "Hello 🙂 Juste un petit mot pour te souhaiter une belle journée. Rien de prévu de mon côté aujourd'hui, profite bien !",
    buttons: [],
  },
  morning_light_v2: {
    name: "morning_light_v2",
    body:
      "Coucou ✨ Belle journée à toi aujourd'hui. Prends-la à ton rythme, sans te mettre la pression.",
    buttons: [],
  },
  morning_light_v3: {
    name: "morning_light_v3",
    body:
      "Hello ! J'espère que ta journée démarre en douceur. Je reste dispo si tu as besoin, sinon passe une super journée 🙂",
    buttons: [],
  },
  morning_light_v4: {
    name: "morning_light_v4",
    body:
      "Bonjour 🌤️ Une belle journée à toi. Pas d'objectif particulier de mon côté aujourd'hui, juste l'envie de te souhaiter le meilleur.",
    buttons: [],
  },
  sophia_birthday_v1: {
    name: "sophia_birthday_v1",
    body:
      "Joyeux anniversaire {{1}} !\nJe pense à toi aujourd'hui. Je te souhaite une journée douce, vivante, et vraiment à toi.",
    buttons: [],
  },
  sophia_optin_v2: {
    name: "sophia_optin_v2",
    body:
      "Hello {{1}}, c’est Sophia.\nPrêt pour devenir la meilleure version de toi-même ? 👊",
    buttons: ["Absolument !", "Euh.. Mauvais numéro !"],
  },
  // Opt-in winback touch 2: sent to users who received the opt-in template but
  // never crossed the WhatsApp threshold. {{1}} = first name. Provisional copy —
  // the founder can adjust before Meta approval.
  sophia_optin_winback_v2: {
    name: "sophia_optin_winback_v2",
    body:
      "Hello {{1}} 👋 C’est Sophia. Je m’assure juste d’écrire au bon numéro avant de t’accompagner — c’est bien le tien ?",
    // "C'est bien moi !" => recognized as opt-in-yes in the webhook (same path as
    // "Absolument !"); "Mauvais numéro !" => handleWrongNumber (no opt-in).
    buttons: ["C'est bien moi !", "Euh.. Mauvais numéro !"],
  },
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

export function extractTemplateBodyParams(components: unknown): string[] {
  if (!Array.isArray(components)) return [];
  const bodyComponent = components.find((component) =>
    component && typeof component === "object" &&
    cleanText((component as Record<string, unknown>).type).toLowerCase() ===
      "body"
  ) as Record<string, unknown> | undefined;
  const parameters = bodyComponent?.parameters;
  if (!Array.isArray(parameters)) return [];
  return parameters.map((parameter) => {
    if (!parameter || typeof parameter !== "object") return "";
    const record = parameter as Record<string, unknown>;
    return cleanText(record.text ?? record.payload ?? record.value);
  });
}

export function renderWhatsAppTemplate(args: {
  name: string;
  components?: unknown;
  fallbackParams?: string[];
}): {
  name: string;
  content: string;
  buttons: string[];
  known: boolean;
  params: string[];
} {
  const name = cleanText(args.name);
  const definition = WHATSAPP_TEMPLATE_CATALOG[name];
  const params = extractTemplateBodyParams(args.components);
  const effectiveParams = params.length > 0
    ? params
    : (args.fallbackParams ?? []);
  if (!definition) {
    return {
      name,
      content: `[TEMPLATE:${name}]`,
      buttons: [],
      known: false,
      params: effectiveParams,
    };
  }

  const content = definition.body.replace(
    /\{\{(\d+)\}\}/g,
    (_match, indexRaw) => {
      const index = Number.parseInt(String(indexRaw), 10) - 1;
      return cleanText(effectiveParams[index]) || `{{${indexRaw}}}`;
    },
  );

  return {
    name,
    content,
    buttons: definition.buttons,
    known: true,
    params: effectiveParams,
  };
}

// --- Morning "bonne journée" variants (out-of-24h, self-contained) -----------

export const MORNING_LIGHT_TEMPLATE_VARIANTS = [
  "morning_light_v1",
  "morning_light_v2",
  "morning_light_v3",
  "morning_light_v4",
] as const;

// Deterministic rotation keyed on the local date (YYYY-MM-DD). No Math.random /
// Date.now so the same day always maps to the same variant (idempotent retries).
export function pickMorningLightVariant(localDateYmd: unknown): string {
  const digits = String(localDateYmd ?? "").replace(/\D/g, "");
  let sum = 0;
  for (const ch of digits) sum += ch.charCodeAt(0);
  const idx = sum % MORNING_LIGHT_TEMPLATE_VARIANTS.length;
  return MORNING_LIGHT_TEMPLATE_VARIANTS[idx];
}

// (Retrait résidus 2026-08-08: le teaser potion et ses segments sont partis
// avec les potions — plus aucun appelant depuis la démolition B2C W2.B.)
