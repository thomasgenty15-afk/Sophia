import { z } from "npm:zod@3.22.4";

// --- ENUMS ---

const TrackingTypeSchema = z.enum(['boolean', 'counter']);
const TimeOfDaySchema = z.enum(['morning', 'afternoon', 'evening', 'night', 'any_time']);
// Support both "habitude" and legacy "habit" to reduce pointless regeneration loops.
const ActionTypeSchema = z.enum(['habitude', 'habit', 'mission', 'framework']);
const VitalTypeSchema = z.enum(['time', 'duration', 'number', 'range', 'text', 'constat']); // 'constat' ajouté par sécurité
const SurveillanceTypeSchema = z.enum(['surveillance']);

// --- SUB-SCHEMAS ---

const FrameworkSectionSchema = z.object({
  id: z.string(),
  label: z.string(),
  inputType: z.enum(['text', 'textarea', 'scale', 'list', 'categorized_list']),
  placeholder: z.string().optional(),
});

const FrameworkDetailsSchema = z.object({
  type: z.enum(['one_shot', 'recurring']),
  intro: z.string().optional(),
  sections: z.array(FrameworkSectionSchema),
});

const ActionIdSchema = z.union([z.string(), z.number()]).transform((v) => String(v));

const ActionSchema = z.object({
  id: ActionIdSchema,
  type: ActionTypeSchema,
  title: z.string(),
  description: z.string().optional(),
  mantra: z.string().optional(), // Parfois Gemini en met un
  questType: z.string().optional(), // 'main' ou 'side' (validated at plan-level)
  tips: z.string().optional(),
  rationale: z.string().optional(),
  
  // Nouveaux champs critiques
  tracking_type: TrackingTypeSchema,
  time_of_day: TimeOfDaySchema,
  
  // Champs conditionnels
  targetReps: z.number().optional(), // Pour habitudes et frameworks
  scheduledDays: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).optional(), // Habitudes: optionnel (jours planifiés)
  frameworkDetails: FrameworkDetailsSchema.optional(), // Uniquement si type = framework
});

const PhaseSchema = z.object({
  id: z.union([z.string(), z.number()]).transform((v) => String(v)), // Gemini met parfois 1, parfois "1"
  title: z.string(),
  subtitle: z.string().optional(),
  rationale: z.string().optional(),
  status: z.string().optional(),
  actions: z.array(ActionSchema),
});

const VitalSignalSchema = z.object({
  name: z.string(),
  unit: z.string().optional(),
  startValue: z.union([z.string(), z.number()]).transform((v) => String(v)).optional(),
  targetValue: z.union([z.string(), z.number()]).transform((v) => String(v)).optional(),
  description: z.string().optional(),
  type: z.string(), // On laisse string large pour éviter les blocages bêtes, ou VitalTypeSchema
  tracking_type: TrackingTypeSchema.optional().default('counter'), // Default safety
});

const MaintenanceCheckSchema = z.object({
  question: z.string(),
  frequency: z.string(),
  type: z.string(),
});

// --- MAIN SCHEMA ---

export const PlanSchema = z.object({
  grimoireTitle: z.string(),
  strategy: z.string(),
  sophiaKnowledge: z.string().optional(),
  context_problem: z.string().optional(),
  identity: z.string(),
  deepWhy: z.string(),
  goldenRules: z.string(),
  
  vitalSignal: VitalSignalSchema,
  maintenanceCheck: MaintenanceCheckSchema,
  
  estimatedDuration: z.enum(["1 mois", "2 mois", "3 mois"]),
  phases: z.array(PhaseSchema),
}).superRefine((plan, ctx) => {
  // --- STRICT PLAN SHAPE (post-generation checker) ---
  if (plan.phases.length !== 4) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["phases"],
      message: `Le plan doit contenir exactement 4 phases (reçu: ${plan.phases.length}).`,
    });
  }

  for (let i = 0; i < plan.phases.length; i++) {
    const phase = plan.phases[i]!;
    if (phase.actions.length !== 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phases", i, "actions"],
        message: `Chaque phase doit contenir exactement 2 actions (phase ${i + 1}, reçu: ${phase.actions.length}).`,
      });
    }
    
    // Vérifier qu'il y a au moins 1 habitude par phase
    const habitudeCount = phase.actions.filter(
      (a) => (a.type ?? "").toLowerCase().trim() === "habitude" || (a.type ?? "").toLowerCase().trim() === "habit"
    ).length;
    if (habitudeCount < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phases", i, "actions"],
        message: `Chaque phase doit contenir au moins 1 habitude (phase ${i + 1}, habitudes trouvées: ${habitudeCount}).`,
      });
    }

    // Quests: exactly 1 main + 1 side (with 2 actions/phase, this makes the plan readable).
    // We validate this at the phase level to keep ActionSchema permissive (helps model convergence),
    // while still enforcing hard structure.
    const mains = phase.actions.filter((a) => String((a as any)?.questType ?? "").toLowerCase().trim() === "main").length;
    const sides = phase.actions.filter((a) => String((a as any)?.questType ?? "").toLowerCase().trim() === "side").length;
    if (phase.actions.length === 2 && (mains !== 1 || sides !== 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phases", i, "actions"],
        message: `Chaque phase doit contenir exactement 1 quête principale (questType="main") et 1 quête secondaire (questType="side").`,
      });
    }
  }

  // Conditional requirements (keep it strict but practical)
  for (let p = 0; p < plan.phases.length; p++) {
    const phase = plan.phases[p]!;
    for (let a = 0; a < phase.actions.length; a++) {
      const action = phase.actions[a]!;
      const t = (action.type ?? "").toLowerCase().trim();

      // Habits require targetReps
      if ((t === "habitude" || t === "habit") && typeof action.targetReps !== "number") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["phases", p, "actions", a, "targetReps"],
          message: `Une action "habitude" doit définir targetReps.`,
        });
      }
      // Habits: targetReps is weekly frequency (max 6).
      if ((t === "habitude" || t === "habit") && typeof action.targetReps === "number") {
        if (action.targetReps < 1 || action.targetReps > 6) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["phases", p, "actions", a, "targetReps"],
            message: `Pour une "habitude", targetReps doit être entre 1 et 6 (fois / semaine).`,
          });
        }
      }
      // Habits: scheduledDays must not exceed targetReps (weekly frequency)
      if ((t === "habitude" || t === "habit") && Array.isArray((action as any).scheduledDays) && typeof action.targetReps === "number") {
        const days = (action as any).scheduledDays as string[];
        if (days.length > action.targetReps) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["phases", p, "actions", a, "scheduledDays"],
            message: `scheduledDays ne peut pas contenir plus de jours que targetReps (reçu: ${days.length}, targetReps: ${action.targetReps}).`,
          });
        }
      }

      // Frameworks require frameworkDetails + targetReps
      if (t === "framework") {
        if (!action.frameworkDetails) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["phases", p, "actions", a, "frameworkDetails"],
            message: `Une action "framework" doit définir frameworkDetails.`,
          });
        }
        if (typeof action.targetReps !== "number") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["phases", p, "actions", a, "targetReps"],
            message: `Une action "framework" doit définir targetReps.`,
          });
        }
      }
    }
  }
});

// Type exporté pour TypeScript
export type PlanStructure = z.infer<typeof PlanSchema>;

// Helper de validation
export function validatePlan(data: any): PlanStructure {
  return PlanSchema.parse(data);
}

