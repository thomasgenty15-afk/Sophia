import { z } from "npm:zod@3.22.4";

// --- 1. ROUTER (DISPATCHER) ---

export const DispatcherSchema = z.object({
  targetMode: z.enum(['sentry', 'firefighter', 'investigator', 'architect', 'assistant', 'companion']),
  riskScore: z.number().min(0).max(10)
});

// --- 2. ACTION (BREAK DOWN) ---

export const MiniActionSchema = z.object({
  title: z.string(),
  description: z.string(),
  questType: z.string().optional(),
  type: z.enum(['mission', 'habitude', 'framework']),
  tracking_type: z.enum(['boolean', 'counter']),
  time_of_day: z.enum(['morning', 'afternoon', 'evening', 'night', 'any_time']),
  targetReps: z.number().optional(),
  tips: z.string().optional(),
  rationale: z.string().optional(),
  frameworkDetails: z.object({
      type: z.enum(['one_shot', 'recurring']),
      intro: z.string().optional(),
      sections: z.array(z.object({
          id: z.string(),
          label: z.string(),
          inputType: z.string(),
          placeholder: z.string().optional()
      })).optional()
  }).optional()
});

// --- 3. SORT PRIORITIES ---

export const SortedAxesSchema = z.object({
  sortedAxes: z.array(z.object({
      originalId: z.string(),
      role: z.enum(['foundation', 'lever', 'optimization']),
      reasoning: z.string()
  }))
});

// --- HELPERS ---

export function validateDispatcher(data: any) { return DispatcherSchema.parse(data); }
export function validateMiniAction(data: any) { return MiniActionSchema.parse(data); }
export function validateSortedAxes(data: any) { return SortedAxesSchema.parse(data); }

