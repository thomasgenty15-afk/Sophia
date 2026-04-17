import { z } from "./http.ts";
import { generateWithGemini } from "./gemini.ts";
import type { DefenseCardContent, ImpulseTrigger } from "./v2-types.ts";

const ILLUSTRATION_ICONS = [
  "moon",
  "book",
  "phone_off",
  "breath",
  "door",
  "tea",
  "water",
  "desk",
  "plate",
  "spark",
  "heart",
  "sunrise",
  "steps",
  "shield",
] as const;

const HEX_COLOR = /^#(?:[0-9a-fA-F]{6})$/;

const IllustrationSchema = z.object({
  icon: z.enum(ILLUSTRATION_ICONS),
  palette: z.array(z.string().regex(HEX_COLOR)).min(2).max(3),
  accent: z.string().regex(HEX_COLOR),
  scene: z.string().min(1).max(120),
});

const TriggerSchema = z.object({
  trigger_id: z.string().min(1),
  label: z.string().min(1).max(200),
  difficulty_preview: z.string().min(1).max(220).optional(),
  illustration: IllustrationSchema.optional(),
  situation: z.string().min(1).max(500),
  signal: z.string().min(1).max(500),
  defense_response: z.string().min(1).max(500),
  plan_b: z.string().min(1).max(500).optional(),
});

const ImpulseSchema = z.object({
  impulse_id: z.string().min(1),
  label: z.string().min(1).max(200),
  generic_defense: z.string().min(1).max(500),
  triggers: z.array(TriggerSchema).min(1).max(6),
});

const EnrichmentSchema = z.object({
  decision: z.enum(["allow", "allow_with_fixes", "block"]),
  reason_short: z.string().min(1).max(180),
  difficulty_map_summary: z.string().min(1).max(320).optional(),
  impulses: z.array(ImpulseSchema).min(1).max(3),
});

export type DefenseCardEnrichmentContext = {
  transformation_title?: string | null;
  transformation_summary?: string | null;
  request_id?: string;
  user_id?: string;
  model?: string;
};

function fallbackLabel(trigger: ImpulseTrigger, index: number): string {
  const explicit = String(trigger.label ?? "").trim();
  if (explicit) return explicit;

  const situation = String(trigger.situation ?? "").trim();
  if (situation) {
    const short = situation.split(/[.!?]/)[0]?.trim() ?? "";
    if (short) return short.slice(0, 80);
  }

  const signal = String(trigger.signal ?? "").trim();
  if (signal) {
    const short = signal.split(/[.!?]/)[0]?.trim() ?? "";
    if (short) return short.slice(0, 80);
  }

  return `Situation ${index + 1}`;
}

function keywordIcon(trigger: ImpulseTrigger): typeof ILLUSTRATION_ICONS[number] {
  const haystack = [
    trigger.label,
    trigger.situation,
    trigger.signal,
    trigger.defense_response,
    trigger.plan_b,
  ].join(" ").toLowerCase();

  if (/(nuit|soir|lit|sommeil|dorm|reveil)/.test(haystack)) return "moon";
  if (/(livre|lecture|book)/.test(haystack)) return "book";
  if (/(telephone|t[ée]l[ée]phone|ecran|serie|scroll|portable)/.test(haystack)) return "phone_off";
  if (/(respir|souffle|4-7-8|coherence)/.test(haystack)) return "breath";
  if (/(lever|sortir|piece|porte|quitter)/.test(haystack)) return "door";
  if (/(the|infusion|tisane|boisson chaude)/.test(haystack)) return "tea";
  if (/(eau|verre d'eau)/.test(haystack)) return "water";
  if (/(bureau|travail|ordi|ordinateur|mail)/.test(haystack)) return "desk";
  if (/(frigo|placard|manger|grignot|cuisine|assiette)/.test(haystack)) return "plate";
  if (/(marche|marcher|pas|escalier)/.test(haystack)) return "steps";
  if (/(coeur|relation|amour|conflit)/.test(haystack)) return "heart";
  if (/(matin|aube|reveil calme|demarrage)/.test(haystack)) return "sunrise";
  if (/(protection|defense|bouclier)/.test(haystack)) return "shield";
  return "spark";
}

function fallbackPalette(icon: typeof ILLUSTRATION_ICONS[number]) {
  switch (icon) {
    case "moon":
      return { palette: ["#102542", "#2c5f8a", "#7db7ff"], accent: "#facc15", scene: "nuit calme" };
    case "book":
      return { palette: ["#4c1d95", "#7c3aed", "#ddd6fe"], accent: "#f59e0b", scene: "lecture refuge" };
    case "phone_off":
      return { palette: ["#111827", "#334155", "#94a3b8"], accent: "#f97316", scene: "ecran mis a distance" };
    case "breath":
      return { palette: ["#0f766e", "#14b8a6", "#99f6e4"], accent: "#f8fafc", scene: "souffle qui revient" };
    case "door":
      return { palette: ["#78350f", "#b45309", "#fde68a"], accent: "#f8fafc", scene: "porte de sortie" };
    case "tea":
      return { palette: ["#7c2d12", "#ea580c", "#fed7aa"], accent: "#fff7ed", scene: "pause chaude" };
    case "water":
      return { palette: ["#0c4a6e", "#0284c7", "#bae6fd"], accent: "#eff6ff", scene: "eau qui recentre" };
    case "desk":
      return { palette: ["#1f2937", "#475569", "#cbd5e1"], accent: "#60a5fa", scene: "bureau recadre" };
    case "plate":
      return { palette: ["#365314", "#65a30d", "#d9f99d"], accent: "#fef3c7", scene: "rituel alimentaire calme" };
    case "heart":
      return { palette: ["#831843", "#db2777", "#fbcfe8"], accent: "#fff1f2", scene: "coeur apaise" };
    case "sunrise":
      return { palette: ["#7c2d12", "#fb7185", "#fde68a"], accent: "#fff7ed", scene: "nouveau depart" };
    case "steps":
      return { palette: ["#312e81", "#4f46e5", "#c7d2fe"], accent: "#eef2ff", scene: "mouvement qui relance" };
    case "shield":
      return { palette: ["#14532d", "#16a34a", "#bbf7d0"], accent: "#f0fdf4", scene: "protection active" };
    case "spark":
    default:
      return { palette: ["#92400e", "#f59e0b", "#fde68a"], accent: "#fff7ed", scene: "etincelle de reprise" };
  }
}

function fallbackIllustration(trigger: ImpulseTrigger) {
  const icon = keywordIcon(trigger);
  return {
    icon,
    ...fallbackPalette(icon),
  };
}

function cleanDifficultyText(value: string): string {
  return value
    .replace(/^(ici|la vraie difficulte|ce qui sera difficile|ce qui va etre difficile)\s*[:,]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackDifficultyPreview(trigger: ImpulseTrigger): string {
  const signal = cleanDifficultyText(String(trigger.signal ?? ""));
  const situation = cleanDifficultyText(String(trigger.situation ?? ""));

  if (signal) {
    const lowered = signal.charAt(0).toLowerCase() + signal.slice(1);
    return `Ne pas te laisser embarquer quand ${lowered}.`;
  }

  if (situation) {
    const lowered = situation.charAt(0).toLowerCase() + situation.slice(1);
    return `Tenir quand ${lowered}.`;
  }

  return "Ne pas laisser la resistance prendre toute la place.";
}

function fallbackDifficultyMapSummary(impulses: DefenseCardContent["impulses"]): string | null {
  const previews = impulses
    .flatMap((impulse) => impulse.triggers)
    .map((trigger) => cleanDifficultyText(String(trigger.difficulty_preview ?? "")))
    .filter(Boolean)
    .slice(0, 3);

  if (previews.length === 0) return null;
  if (previews.length === 1) return previews[0];
  if (previews.length === 2) return `${previews[0]} ${previews[1]}`;
  return `${previews[0]} ${previews[1]} ${previews[2]}`;
}

function normalizeEnrichedContent(
  original: DefenseCardContent,
  enriched: z.infer<typeof EnrichmentSchema> | null,
): DefenseCardContent {
  const sourceImpulses = enriched?.impulses ?? original.impulses;

  return {
    impulses: sourceImpulses.map((impulse, impulseIndex) => ({
      impulse_id: String(impulse.impulse_id).trim() || original.impulses[impulseIndex]?.impulse_id || `impulse-${impulseIndex + 1}`,
      label: String(impulse.label).trim() || original.impulses[impulseIndex]?.label || `Impulse ${impulseIndex + 1}`,
      generic_defense:
        String(impulse.generic_defense).trim() || original.impulses[impulseIndex]?.generic_defense || "",
      triggers: impulse.triggers.map((trigger, triggerIndex) => {
        const originalTrigger = original.impulses[impulseIndex]?.triggers[triggerIndex];
        const merged: ImpulseTrigger = {
          trigger_id: String(trigger.trigger_id).trim() || originalTrigger?.trigger_id || `trigger-${impulseIndex + 1}-${triggerIndex + 1}`,
          label: String(trigger.label).trim() || fallbackLabel(originalTrigger ?? trigger, triggerIndex),
          difficulty_preview:
            cleanDifficultyText(String(trigger.difficulty_preview ?? "").trim()) ||
            cleanDifficultyText(String(originalTrigger?.difficulty_preview ?? "").trim()) ||
            fallbackDifficultyPreview(originalTrigger ?? trigger),
          situation: String(trigger.situation).trim() || String(originalTrigger?.situation ?? "").trim(),
          signal: String(trigger.signal).trim() || String(originalTrigger?.signal ?? "").trim(),
          defense_response: String(trigger.defense_response).trim() || String(originalTrigger?.defense_response ?? "").trim(),
          plan_b:
            String(trigger.plan_b ?? "").trim() ||
            String(originalTrigger?.plan_b ?? "").trim() ||
            String(original.impulses[impulseIndex]?.generic_defense ?? "").trim(),
          illustration: trigger.illustration ?? originalTrigger?.illustration ?? fallbackIllustration(originalTrigger ?? trigger),
        };
        if (!merged.label) merged.label = fallbackLabel(merged, triggerIndex);
        if (!merged.illustration) merged.illustration = fallbackIllustration(merged);
        return merged;
      }),
    })),
    difficulty_map_summary:
      cleanDifficultyText(String(enriched?.difficulty_map_summary ?? "").trim()) ||
      cleanDifficultyText(String(original.difficulty_map_summary ?? "").trim()) ||
      fallbackDifficultyMapSummary(
        sourceImpulses.map((impulse, impulseIndex) => ({
          impulse_id: String(impulse.impulse_id).trim() || original.impulses[impulseIndex]?.impulse_id || `impulse-${impulseIndex + 1}`,
          label: String(impulse.label).trim() || original.impulses[impulseIndex]?.label || `Impulse ${impulseIndex + 1}`,
          generic_defense:
            String(impulse.generic_defense).trim() || original.impulses[impulseIndex]?.generic_defense || "",
          triggers: impulse.triggers.map((trigger, triggerIndex) => ({
            trigger_id: String(trigger.trigger_id).trim() || original.impulses[impulseIndex]?.triggers[triggerIndex]?.trigger_id || `trigger-${impulseIndex + 1}-${triggerIndex + 1}`,
            label: String(trigger.label).trim() || fallbackLabel(original.impulses[impulseIndex]?.triggers[triggerIndex] ?? trigger, triggerIndex),
            difficulty_preview:
              cleanDifficultyText(String(trigger.difficulty_preview ?? "").trim()) ||
              cleanDifficultyText(String(original.impulses[impulseIndex]?.triggers[triggerIndex]?.difficulty_preview ?? "").trim()) ||
              fallbackDifficultyPreview(original.impulses[impulseIndex]?.triggers[triggerIndex] ?? trigger),
            situation: String(trigger.situation).trim() || String(original.impulses[impulseIndex]?.triggers[triggerIndex]?.situation ?? "").trim(),
            signal: String(trigger.signal).trim() || String(original.impulses[impulseIndex]?.triggers[triggerIndex]?.signal ?? "").trim(),
            defense_response: String(trigger.defense_response).trim() || String(original.impulses[impulseIndex]?.triggers[triggerIndex]?.defense_response ?? "").trim(),
            plan_b:
              String(trigger.plan_b ?? "").trim() ||
              String(original.impulses[impulseIndex]?.triggers[triggerIndex]?.plan_b ?? "").trim() ||
              String(original.impulses[impulseIndex]?.generic_defense ?? "").trim(),
          })),
        })),
      ),
    review: {
      decision: enriched?.decision === "allow_with_fixes" ? "allow_with_fixes" : "allow",
      reason_short: String(enriched?.reason_short ?? "Carte relue en mode permissif.").trim().slice(0, 180),
      checked_at: new Date().toISOString(),
    },
  };
}

function buildEnrichmentPrompt(content: DefenseCardContent, context?: DefenseCardEnrichmentContext): string {
  const cardBlock = content.impulses
    .map((impulse) => {
      const triggers = impulse.triggers
        .map((trigger) =>
          [
            `- trigger_id: ${trigger.trigger_id}`,
            `  label: ${String(trigger.label ?? "").trim() || "(a creer)"}`,
            `  difficulty_preview: ${String(trigger.difficulty_preview ?? "").trim() || "(a creer)"}`,
            `  situation: ${trigger.situation}`,
            `  signal: ${trigger.signal}`,
            `  defense_response: ${trigger.defense_response}`,
            `  plan_b: ${String(trigger.plan_b ?? impulse.generic_defense ?? "").trim() || "(a creer)"}`,
          ].join("\n")
        )
        .join("\n");
      return [
        `Impulse: ${impulse.label} (${impulse.impulse_id})`,
        `generic_defense: ${impulse.generic_defense}`,
        triggers,
      ].join("\n");
    })
    .join("\n\n");

  return [
    context?.transformation_title ? `Transformation: ${context.transformation_title}` : null,
    context?.transformation_summary ? `Resume: ${context.transformation_summary}` : null,
    "",
    "Carte actuelle:",
    cardBlock,
  ].filter(Boolean).join("\n");
}

const ENRICHMENT_SYSTEM_PROMPT = `Tu relis une carte de defense d'une app de coaching.

Objectifs:
1. verifier l'ethique avec un filtre TRES permissif
2. corriger seulement les cas clairement problematiques
3. ajouter un nom court memorable a chaque carte-situation
4. generer une direction d'illustration engageante pour chaque carte
5. resumer la difficulte centrale de chaque carte, puis de l'ensemble

Politique ethique:
- Au moindre doute leger, ambigu, stylistique ou simplement bizarre: ALLOW.
- Ne considere comme problematique que les cas clairement chauds:
  - auto-agression, privation extreme, punition corporelle, vomissement, blessure
  - humiliation, menace, coercition, controle toxique
  - conduite dangereuse, illegal, substances, mise en danger
  - pseudo-conseil medical ou psychiatrique risqué
- Prefere une micro-correction plutot qu'un blocage.
- Ne bloque que si le contenu entier est impossible a rendre sur.

Regles de rendu:
- Garde la structure existante et les ids.
- Le label de chaque trigger doit etre court, concret, memorisable.
- \`difficulty_preview\` doit etre UNE phrase courte autonome qui nomme la difficulte a anticiper.
- Ne commence jamais \`difficulty_preview\` par "Ici", "Ce qui va etre difficile" ou une formule meta.
- Garde la structure produit explicite: situation = Le moment, signal = Le piege, defense_response = Mon geste, plan_b = Plan B.
- Exemples de bon style pour \`difficulty_preview\`:
  - "Ne pas te laisser glisser quand la fatigue te donne envie de negocier."
  - "Resister a l'appel du facile quand tu te retrouves seul le soir."
  - "Couper la bascule quand ton cerveau cherche une recompense immediate."
- \`difficulty_map_summary\` doit etre une synthese courte de l'ensemble des difficultes de la transformation.
- L'illustration doit faire comprendre en un coup d'oeil ce que la personne combat.
- Pense l'image comme un mini meme sans texte: une metaphore visuelle immediate, lisible, concrete, avec une petite touche d'humour.
- L'humour doit rester fin, complice, intelligent et jamais humiliant, grotesque ou moqueur.
- Ne fais pas une image "jolie" mais vide: montre la tension, le piege ou l'ennemi interieur en le rendant un peu plus leger a regarder.
- Garde un rendu simple, graphique, memorisable, legerement cinematographique, jamais infantile.
- Privilegie des scenes avec contraste clair entre le piege et le geste de reprise de controle.
- Choisis icon parmi: moon, book, phone_off, breath, door, tea, water, desk, plate, spark, heart, sunrise, steps, shield
- palette = 2 ou 3 couleurs hexadecimales
- accent = 1 couleur hexadecimale
- scene = mini scene de 2 a 6 mots, concrete et imageable, qui sonne comme le resume d'un gag visuel sans texte

Retourne UNIQUEMENT un JSON valide:
{
  "decision": "allow|allow_with_fixes|block",
  "reason_short": "string",
  "difficulty_map_summary": "string",
  "impulses": [
    {
      "impulse_id": "string",
      "label": "string",
      "generic_defense": "string",
      "triggers": [
        {
          "trigger_id": "string",
          "label": "string",
          "difficulty_preview": "string",
          "situation": "string",
          "signal": "string",
          "defense_response": "string",
          "plan_b": "string",
          "illustration": {
            "icon": "moon",
            "palette": ["#112233", "#445566"],
            "accent": "#ffffff",
            "scene": "string"
          }
        }
      ]
    }
  ]
}`;

export async function reviewAndEnrichDefenseCard(
  content: DefenseCardContent,
  context?: DefenseCardEnrichmentContext,
): Promise<DefenseCardContent> {
  try {
    const raw = await generateWithGemini(
      ENRICHMENT_SYSTEM_PROMPT,
      buildEnrichmentPrompt(content, context),
      0.2,
      true,
      [],
      "auto",
      {
        requestId: context?.request_id,
        userId: context?.user_id,
        source: "defense-card:ethics-and-illustration",
        model: context?.model ?? "gemini-2.5-flash",
        forceInitialModel: true,
        maxRetries: 2,
      },
    );

    const cleaned = String(raw ?? "").replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const parsed = EnrichmentSchema.parse(JSON.parse(cleaned));

    if (parsed.decision === "block") {
      throw new Error("__DEFENSE_CARD_ETHICS_BLOCK__");
    }

    return normalizeEnrichedContent(content, parsed);
  } catch (error) {
    if (error instanceof Error && error.message === "__DEFENSE_CARD_ETHICS_BLOCK__") {
      throw error;
    }
    console.warn("[defense-card-enrichment] fallback enrichment:", error);
    return normalizeEnrichedContent(content, null);
  }
}
