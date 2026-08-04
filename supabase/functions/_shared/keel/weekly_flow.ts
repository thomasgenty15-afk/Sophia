/**
 * PIVOT C4 — LE POINT HEBDOMADAIRE, PAR UN WHATSAPP FLOW.
 *
 * ── POURQUOI UN FLOW ET PAS UN ÉCRAN WEB ─────────────────────────────────
 * Le point du dimanche demande huit valeurs. Un tap à trois boutons ne peut
 * pas les porter, et l'écran web qui devait les recueillir n'a jamais existé:
 * la colonne `weekly_reviews.biofeedback` était LUE par `/app/progress` et
 * n'était ÉCRITE par personne. Toute la moitié « métriques » du produit
 * affichait donc des courbes vides.
 *
 * Un Flow ferme ce trou là où l'élève est déjà. Il n'a pas à ouvrir un
 * navigateur, se souvenir d'un mot de passe, ni changer d'app un dimanche
 * soir — et c'est exactement la population dont on veut la mesure: celle qui
 * ne serait jamais venue sur le site.
 *
 * ── LA DIVISION FRÉQUENCE / GRANULARITÉ ──────────────────────────────────
 * Trois niveaux tous les jours (le tap), 1-5 sur six axes une fois par semaine
 * (ici). On met la granularité là où le budget d'effort existe. Un 0-10
 * quotidien se masse sur 7-8 et ne transporte presque rien tout en ayant l'air
 * précis.
 *
 * ── CE QUE CE FICHIER NE PEUT PAS FAIRE ──────────────────────────────────
 * Créer le Flow chez Meta. Un Flow est un objet hébergé par Meta, créé et
 * publié dans le Flow Builder, et son identifiant est une donnée de
 * configuration. `WEEKLY_FLOW_JSON` est la définition à y coller, tenue ICI
 * pour que le parseur et le formulaire ne puissent pas diverger — mais tant
 * que quelqu'un ne l'a pas publiée chez Meta, rien de tout ceci n'envoie quoi
 * que ce soit. Voir docs/nutrition-pivot/META-TEMPLATES.md.
 *
 * PURE MODULE : no I/O, no clock (le caller passe `now`), no randomness.
 */

// ---------------------------------------------------------------------------
// Le vocabulaire (R1 : tokens ASCII)
// ---------------------------------------------------------------------------

/**
 * Les six axes, et pourquoi ces six-là.
 *
 * Les trois premiers reprennent EXACTEMENT les axes du tap quotidien. Ce n'est
 * pas une redite: le tap dit « quel jour a coincé », l'hebdo dit « à quel
 * niveau ça se situe ». Les mêmes tokens permettent de lire les deux ensemble
 * plutôt que de comparer deux vocabulaires qui parlent de la même chose.
 *
 * Les trois derniers n'ont de sens qu'à la semaine: on ne demande pas à
 * quelqu'un tous les soirs comment va sa digestion.
 */
export const WEEKLY_AXES = [
  "energy",
  "hunger",
  "sleep",
  "digestion",
  "mood",
  "training",
] as const;
export type WeeklyAxis = (typeof WEEKLY_AXES)[number];

/**
 * Meta coupe un label de Dropdown au-delà de 20 caractères sur les petits
 * écrans. La limite est tenue par un test: un label tronqué ne se voit pas
 * d'ici, il se voit sur le téléphone de l'élève.
 */
export const WEEKLY_LABEL_MAX_CHARS = 20;

export const WEEKLY_AXIS_LABELS_EN: Record<WeeklyAxis, string> = {
  energy: "Day-to-day energy",
  hunger: "Hunger between meals",
  sleep: "Sleep quality",
  digestion: "Digestion",
  mood: "Mood",
  training: "Training quality",
};

export const WEEKLY_SCALE_MIN = 1;
export const WEEKLY_SCALE_MAX = 5;

/** Les cinq crans, nommés. Un chiffre nu invite chacun à sa propre échelle. */
export const WEEKLY_SCALE_LABELS_EN: Record<number, string> = {
  1: "1 — bad",
  2: "2 — poor",
  3: "3 — ok",
  4: "4 — good",
  5: "5 — great",
};

/**
 * Bornes de plausibilité. HORS BORNES = REJETÉ ET NOMMÉ, jamais ramené au
 * bord: un 500 kg ramené à 400 produit une donnée fausse qui a l'air vraie, et
 * c'est bien pire qu'une case vide. Volontairement larges — il ne s'agit pas
 * de juger un corps mais d'attraper une faute de frappe.
 */
export const WEIGHT_KG_MIN = 25;
export const WEIGHT_KG_MAX = 400;
export const WAIST_CM_MIN = 30;
export const WAIST_CM_MAX = 250;

export const WEEKLY_FLOW_TOKEN_PREFIX = "KEEL_WEEKLY_";

// ---------------------------------------------------------------------------
// Le jeton de corrélation
// ---------------------------------------------------------------------------

/**
 * Le `flow_token` part avec le message et REVIENT tel quel dans la réponse.
 *
 * ── IL NE PORTE PAS D'IDENTITÉ, ET C'EST LA PROPRIÉTÉ DE SÉCURITÉ ────────
 * Il ne contient que la semaine. L'élève est identifié par le NUMÉRO qui écrit,
 * comme n'importe quel message entrant. Mettre un `user_id` dans un jeton qui
 * fait l'aller-retour par un client donnerait un identifiant modifiable qui
 * désigne la ligne à écrire — c'est-à-dire une écriture dans le dossier de
 * quelqu'un d'autre pour qui sait éditer une chaîne.
 */
export function buildWeeklyFlowToken(weekStart: string): string {
  return `${WEEKLY_FLOW_TOKEN_PREFIX}${weekStart}`;
}

/** Renvoie la semaine, ou null si ce n'est pas un jeton à nous. */
export function parseWeeklyFlowToken(token: string | null | undefined): string | null {
  const raw = String(token ?? "").trim();
  if (!raw.startsWith(WEEKLY_FLOW_TOKEN_PREFIX)) return null;
  const week = raw.slice(WEEKLY_FLOW_TOKEN_PREFIX.length);
  return /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : null;
}

// ---------------------------------------------------------------------------
// La définition du formulaire (à publier chez Meta)
// ---------------------------------------------------------------------------

/**
 * Le Flow JSON, en DEUX écrans.
 *
 * Deux et pas un: huit champs sur un seul écran se lit comme un formulaire
 * administratif et fait abandonner. Deux et pas trois: chaque écran
 * supplémentaire est une occasion de fermer l'app.
 *
 * Le second écran est entièrement facultatif. Un élève qui ne se pèse pas — ou
 * qui ne le souhaite pas, ce que ce produit respecte — termine quand même le
 * point, et ses six axes sont enregistrés. La mesure de vivabilité ne doit
 * jamais être l'otage d'une balance.
 */
export function weeklyFlowJson(): Record<string, unknown> {
  const axisForm = WEEKLY_AXES.map((axis) => ({
    type: "Dropdown",
    name: axis,
    label: WEEKLY_AXIS_LABELS_EN[axis],
    required: true,
    "data-source": Object.entries(WEEKLY_SCALE_LABELS_EN).map(([id, title]) => ({
      id,
      title,
    })),
  }));

  return {
    version: "7.0",
    screens: [
      {
        id: "WEEK_FELT",
        title: "Your week",
        terminal: false,
        layout: {
          type: "SingleColumnLayout",
          children: [
            {
              type: "TextSubheading",
              text: "How did the week actually feel?",
            },
            {
              type: "Form",
              name: "felt",
              children: [
                ...axisForm,
                {
                  type: "Footer",
                  label: "Next",
                  "on-click-action": {
                    name: "navigate",
                    next: { type: "screen", name: "NUMBERS" },
                    payload: Object.fromEntries(
                      WEEKLY_AXES.map((a) => [a, `\${form.${a}}`]),
                    ),
                  },
                },
              ],
            },
          ],
        },
      },
      {
        id: "NUMBERS",
        title: "Numbers",
        terminal: true,
        data: Object.fromEntries(
          WEEKLY_AXES.map((a) => [a, { type: "string", __example__: "3" }]),
        ),
        layout: {
          type: "SingleColumnLayout",
          children: [
            {
              type: "TextBody",
              text: "Both optional. Skip them and the rest still counts.",
            },
            {
              type: "Form",
              name: "numbers",
              children: [
                {
                  type: "TextInput",
                  name: "weight_kg",
                  label: "Weight (kg)",
                  "input-type": "number",
                  required: false,
                },
                {
                  type: "TextInput",
                  name: "waist_cm",
                  label: "Waist (cm)",
                  "input-type": "number",
                  required: false,
                },
                {
                  type: "Footer",
                  label: "Done",
                  "on-click-action": {
                    name: "complete",
                    payload: {
                      ...Object.fromEntries(
                        WEEKLY_AXES.map((a) => [a, `\${data.${a}}`]),
                      ),
                      weight_kg: "${form.weight_kg}",
                      waist_cm: "${form.waist_cm}",
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Lire la réponse
// ---------------------------------------------------------------------------

export interface WeeklyFlowReply {
  biofeedback: Partial<Record<WeeklyAxis, number>>;
  weightKg: number | null;
  waistCm: number | null;
  /** Ce qui a été écarté, nommément. Non vide = à regarder. */
  issues: string[];
}

/**
 * Une valeur de formulaire est une CHAÎNE ou un NOMBRE, jamais autre chose.
 *
 * `String(["80"])` vaut `"80"`, et `Number` en fait 80: un tableau malformé
 * produisait donc un poids parfaitement plausible, inventé à partir d'une forme
 * que ce formulaire n'émet pas. C'est exactement ce que le reste de ce module
 * refuse de faire pour un 500 kg — sauf que là, rien ne le disait.
 *
 * Renvoie `null` quand la forme n'est pas lisible; l'appelant NOMME l'écart.
 */
function readableText(raw: unknown): string | null {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number") return Number.isFinite(raw) ? String(raw) : null;
  return null;
}

function readScale(raw: unknown, axis: string, issues: string[]): number | null {
  const text = readableText(raw);
  if (text === null) {
    issues.push(`${axis}: ${JSON.stringify(raw)} is not a form value, dropped`);
    return null;
  }
  if (text === "") {
    // Une case vide sur un champ REQUIS ne devrait pas arriver: on le dit,
    // parce que ça signale un formulaire publié chez Meta qui a divergé de ce
    // fichier. On le dit TEL QUEL — « manquant » — et pas comme une valeur.
    //
    // `Number("")` vaut 0, et l'ancien code laissait donc un axe absent
    // ressortir en « 0 is outside 1-5 »: un axe jamais rempli était rapporté
    // comme une valeur hors bornes, c'est-à-dire un chiffre inventé dans le
    // seul canal censé dire la vérité sur ce qui a été écarté.
    issues.push(`${axis}: missing, dropped`);
    return null;
  }
  const n = Number(text);
  if (!Number.isFinite(n)) {
    issues.push(`${axis}: ${JSON.stringify(raw)} is not a number, dropped`);
    return null;
  }
  const v = Math.round(n);
  if (v < WEEKLY_SCALE_MIN || v > WEEKLY_SCALE_MAX) {
    issues.push(`${axis}: ${v} is outside ${WEEKLY_SCALE_MIN}-${WEEKLY_SCALE_MAX}, dropped`);
    return null;
  }
  return v;
}

function readMeasure(
  raw: unknown,
  field: string,
  min: number,
  max: number,
  issues: string[],
): number | null {
  const text = readableText(raw);
  if (text === null) {
    issues.push(`${field}: ${JSON.stringify(raw)} is not a form value, dropped`);
    return null;
  }
  // Vide = non renseigné, et c'est un choix légitime, pas une anomalie.
  if (!text) return null;
  // La virgule décimale est ce que tape la moitié de l'Europe.
  const n = Number(text.replace(",", "."));
  if (!Number.isFinite(n)) {
    issues.push(`${field}: ${JSON.stringify(text)} is not a number, dropped`);
    return null;
  }
  if (n < min || n > max) {
    issues.push(`${field}: ${n} is outside ${min}-${max}, dropped as a typo`);
    return null;
  }
  return Math.round(n * 10) / 10;
}

/**
 * Interprète le `response_json` d'un `nfm_reply`.
 *
 * Tolérant sur la forme (Meta rend tout en chaînes, et une clé peut manquer),
 * strict sur le sens: une valeur illisible est ÉCARTÉE ET NOMMÉE, jamais
 * devinée ni ramenée dans les bornes.
 */
export function parseWeeklyFlowResponse(responseJson: unknown): WeeklyFlowReply {
  const issues: string[] = [];
  let parsed: unknown = responseJson;
  if (typeof responseJson === "string") {
    try {
      parsed = JSON.parse(responseJson);
    } catch {
      return { biofeedback: {}, weightKg: null, waistCm: null, issues: ["response_json is not JSON"] };
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { biofeedback: {}, weightKg: null, waistCm: null, issues: ["response_json is not an object"] };
  }
  const obj = parsed as Record<string, unknown>;

  const biofeedback: Partial<Record<WeeklyAxis, number>> = {};
  for (const axis of WEEKLY_AXES) {
    const v = readScale(obj[axis], axis, issues);
    if (v !== null) biofeedback[axis] = v;
  }

  return {
    biofeedback,
    weightKg: readMeasure(obj.weight_kg, "weight_kg", WEIGHT_KG_MIN, WEIGHT_KG_MAX, issues),
    waistCm: readMeasure(obj.waist_cm, "waist_cm", WAIST_CM_MIN, WAIST_CM_MAX, issues),
    issues,
  };
}

/**
 * Le payload écrit sur `weekly_reviews`.
 *
 * Le poids vit DANS `biofeedback` avec les axes plutôt que dans une colonne à
 * lui: `outcomes` porte déjà des mesures dans le chemin 1:1 et deux endroits
 * pour une même grandeur finissent toujours par diverger. `/app/progress` lit
 * déjà ici.
 */
export function weeklyBiofeedbackPayload(reply: WeeklyFlowReply): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...reply.biofeedback };
  if (reply.weightKg !== null) payload.weight_kg = reply.weightKg;
  if (reply.waistCm !== null) payload.waist_cm = reply.waistCm;
  payload.source = "whatsapp_flow";
  return payload;
}

// ---------------------------------------------------------------------------
// Décider l'envoi
// ---------------------------------------------------------------------------

/** Dimanche soir, heure LOCALE de l'élève. */
export const WEEKLY_FLOW_DOW = 0; // 0 = dimanche, comme Date#getDay
export const WEEKLY_FLOW_HOUR_LOCAL = 18;
export const WEEKLY_FLOW_WINDOW_END_LOCAL = 21;

export const WEEKLY_FLOW_SKIP_REASONS = [
  "already_answered_this_week",
  "already_asked_this_week",
  "outside_window",
  "safety_active",
  "restriction_flagged",
  "opted_out",
  "no_active_plan",
  "flow_not_configured",
] as const;
export type WeeklyFlowSkipReason = (typeof WEEKLY_FLOW_SKIP_REASONS)[number];

export interface WeeklyFlowDecisionInput {
  localDow: number;
  localHour: number;
  answeredThisWeek: boolean;
  /**
   * A-t-on DÉJÀ POSÉ la question cette semaine ?
   *
   * ── POURQUOI CETTE GARDE EXISTE, ET POURQUOI `answeredThisWeek` NE SUFFIT
   *    PAS ─────────────────────────────────────────────────────────────────
   * La fenêtre est dimanche 18h-21h locales et le cron tourne à `:40`. Un élève
   * qui ne répond pas laisse `answeredThisWeek` à `false` aux trois ticks —
   * 18:40, 19:40, 20:40 — et reçoit donc TROIS fois le formulaire dans la même
   * soirée. Constaté en local le 2026-08-03: trois lignes
   * `whatsapp_outbound_messages` `status='sent'` pour un seul dimanche.
   *
   * L'élève silencieux est précisément celui que ce produit ne doit pas
   * harceler: son silence est une réponse, et la relance appartient au
   * réengagement, pas au point hebdo.
   *
   * ── SA CONDITION DE DÉSARMEMENT ──────────────────────────────────────────
   * Elle est portée par `weekStart`: une semaine NEUVE est une question neuve.
   * Et un envoi qui a ÉCHOUÉ ne compte pas comme posé — sinon un incident Meta
   * ferait taire l'élève pour la semaine entière. Voir `hasAskedWeek`.
   */
  askedThisWeek: boolean;
  /**
   * REQUIS, pas optionnel, et c'est délibéré.
   *
   * Les gardes `safetyBand` de `decideDailyPulse` et `decideReengagement` sont
   * optionnelles — et VÉRIFICATION FAITE, aucun de leurs deux appelants de
   * production ne les renseigne. Les gardes sont testées, vertes, et désarmées
   * en vrai. Un paramètre requis rend cet oubli-là impossible: le compilateur
   * force chaque appelant à DIRE ce qu'il sait, quitte à dire `null`.
   */
  safetyBand: "none" | "low" | "medium" | "high" | "critical" | null;
  /**
   * Le plancher TCA (`weekly_reviews.risk_band = 'restriction_flag'`).
   *
   * Garde distincte de `safetyBand` parce qu'elle porte un risque distinct et,
   * surtout, parce qu'elle est le seul signal clinique réellement PERSISTÉ et
   * interrogeable de ce dépôt. `/app/progress` le respecte déjà en masquant
   * tous les chiffres. Demander un poids à cet élève-là serait exactement ce
   * que cet écran refuse de lui montrer.
   */
  restrictionFlagged: boolean;
  optedOut?: boolean;
  hasActivePlan: boolean;
  /** L'identifiant du Flow publié chez Meta. Absent = rien à envoyer. */
  flowId: string | null;
}

export type WeeklyFlowDecision =
  | { decision: "send" }
  | { decision: "skip"; reason: WeeklyFlowSkipReason };

/**
 * L'ORDRE DES GARDES EST LE CONTRAT — le même que le tap quotidien, à une
 * garde près.
 *
 *   1. opted_out            — réglementaire, jamais surchargeable.
 *   2. safety_active        — on ne fait pas remplir un formulaire de mesures
 *                             corporelles à quelqu'un en crise.
 *   3. restriction_flagged  — le plancher TCA. Le poids est la métrique la plus
 *                             associée aux troubles alimentaires, et
 *                             `/app/progress` masque déjà tous les chiffres à
 *                             cet élève-là. Le lui DEMANDER par WhatsApp
 *                             pendant qu'un écran refuse de le lui montrer
 *                             serait une incohérence qui fait du dégât.
 *   4. no_active_plan       — rien à suivre, rien à demander.
 *   5. flow_not_configured  — le Flow n'existe pas chez Meta. On se tait
 *                             plutôt que d'émettre un message cassé.
 *   6. already_answered     — un point par semaine.
 *   7. already_asked        — une QUESTION par semaine. Le silence de l'élève
 *                             n'autorise pas à redemander à 19h40 puis à 20h40.
 *   8. outside_window       — hors dimanche 18h-21h locales, on ne fait rien.
 */
export function decideWeeklyFlow(input: WeeklyFlowDecisionInput): WeeklyFlowDecision {
  if (input.optedOut) return { decision: "skip", reason: "opted_out" };

  const band = input.safetyBand ?? "none";
  if (band !== "none") return { decision: "skip", reason: "safety_active" };

  if (input.restrictionFlagged) {
    return { decision: "skip", reason: "restriction_flagged" };
  }

  if (!input.hasActivePlan) return { decision: "skip", reason: "no_active_plan" };
  if (!String(input.flowId ?? "").trim()) {
    return { decision: "skip", reason: "flow_not_configured" };
  }
  if (input.answeredThisWeek) {
    return { decision: "skip", reason: "already_answered_this_week" };
  }
  if (input.askedThisWeek) {
    return { decision: "skip", reason: "already_asked_this_week" };
  }

  const hour = Math.floor(input.localHour);
  if (
    input.localDow !== WEEKLY_FLOW_DOW ||
    !Number.isFinite(hour) ||
    hour < WEEKLY_FLOW_HOUR_LOCAL ||
    hour >= WEEKLY_FLOW_WINDOW_END_LOCAL
  ) {
    return { decision: "skip", reason: "outside_window" };
  }

  return { decision: "send" };
}

// ---------------------------------------------------------------------------
// Le rendu
// ---------------------------------------------------------------------------

export const WEEKLY_FLOW_BODY_EN = "Two minutes on how the week actually went?";
export const WEEKLY_FLOW_CTA_EN = "Take the check-in";

/**
 * Le template approuvé qui PORTE le Flow hors fenêtre 24h.
 *
 * Le point hebdo part le dimanche soir à des élèves qui, par construction, ont
 * pu ne pas écrire de la journée. Sans ce repli, `whatsapp-send` refuse le
 * `interactive_flow` en 409 et le bilan n'est jamais demandé — le produit ne
 * mesurerait que les élèves déjà bavards.
 *
 * Le template déclare CHEZ META le Flow et son écran d'entrée; il ne reste à
 * l'envoi que le jeton, qui fait l'aller-retour et revient dans le `nfm_reply`.
 */
export const WEEKLY_TEMPLATE_NAME_DEFAULT = "keel_weekly_checkin_v1";
export const WEEKLY_TEMPLATE_LANG_DEFAULT = "en_GB";

/**
 * Le composant `button` du template: le jeton de corrélation, et rien d'autre.
 *
 * Le jeton ne porte que la semaine — l'élève est résolu par le numéro qui
 * répond. Cette propriété tient des deux côtés, natif comme template: elle
 * serait vide si le repli glissait un identifiant dans le jeton.
 */
export function weeklyTemplateFlowComponents(flowToken: string): unknown[] {
  return [{
    type: "button",
    sub_type: "flow",
    index: "0",
    parameters: [{ type: "action", action: { flow_token: flowToken } }],
  }];
}

/**
 * L'accusé après le point. Court, sans commentaire sur les valeurs.
 *
 * Il ne renvoie AUCUN chiffre à l'élève — ni son poids, ni une moyenne, ni une
 * variation. Renvoyer « -0,4 kg cette semaine » ferait de ce formulaire une
 * pesée commentée, ce qui est exactement l'usage que `/app/progress` évite en
 * plaçant le poids en dernier et en moyenne 7 jours.
 */
export function renderWeeklyFlowAck(reply: WeeklyFlowReply): string {
  const axes = Object.keys(reply.biofeedback).length;
  if (axes === 0) return "Got it.";
  return "Got it — thanks for taking the two minutes.";
}
