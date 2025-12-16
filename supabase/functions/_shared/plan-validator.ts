import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// --- ENUMS ---

const TrackingTypeSchema = z.enum(['boolean', 'counter']);
const TimeOfDaySchema = z.enum(['morning', 'afternoon', 'evening', 'night', 'any_time']);
const ActionTypeSchema = z.enum(['habitude', 'mission', 'framework']);
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

const ActionSchema = z.object({
  id: z.string(),
  type: ActionTypeSchema,
  title: z.string(),
  description: z.string().optional(),
  mantra: z.string().optional(), // Parfois Gemini en met un
  questType: z.string().optional(), // 'main' ou 'side'
  tips: z.string().optional(),
  rationale: z.string().optional(),
  
  // Nouveaux champs critiques
  tracking_type: TrackingTypeSchema,
  time_of_day: TimeOfDaySchema,
  
  // Champs conditionnels
  targetReps: z.number().optional(), // Pour habitudes et frameworks
  frameworkDetails: FrameworkDetailsSchema.optional(), // Uniquement si type = framework
});

const PhaseSchema = z.object({
  id: z.union([z.string(), z.number()]), // Gemini met parfois 1, parfois "1"
  title: z.string(),
  subtitle: z.string().optional(),
  rationale: z.string().optional(),
  status: z.string().optional(),
  actions: z.array(ActionSchema),
});

const VitalSignalSchema = z.object({
  name: z.string(),
  unit: z.string().optional(),
  startValue: z.string().optional(),
  targetValue: z.string().optional(),
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
  
  estimatedDuration: z.string(),
  phases: z.array(PhaseSchema),
});

// Type exporté pour TypeScript
export type PlanStructure = z.infer<typeof PlanSchema>;

// Helper de validation
export function validatePlan(data: any): PlanStructure {
  return PlanSchema.parse(data);
}

