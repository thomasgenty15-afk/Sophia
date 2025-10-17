import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

export const DifficultyLevelEnum = z.enum(["facile", "moyen", "difficile"]);
export type DifficultyLevel = z.infer<typeof DifficultyLevelEnum>;

export const ObjectiveStatusEnum = z.enum(["active", "paused", "completed", "abandoned"]);
export type ObjectiveStatus = z.infer<typeof ObjectiveStatusEnum>;

export const MessageDirectionEnum = z.enum(["inbound", "outbound"]);
export type MessageDirection = z.infer<typeof MessageDirectionEnum>;

export const MessageChannelEnum = z.enum(["whatsapp"]);
export type MessageChannel = z.infer<typeof MessageChannelEnum>;

export const CheckinStatusEnum = z.enum(["done", "missed", "skipped", "no_reply"]);
export type CheckinStatus = z.infer<typeof CheckinStatusEnum>;

export const BadgeTypeEnum = z.enum(["bronze", "argent", "or"]);
export type BadgeType = z.infer<typeof BadgeTypeEnum>;

export const AgentCodeEnum = z.enum(["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"]);
export type AgentCode = z.infer<typeof AgentCodeEnum>;

export const ISODateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const ISOTimeString = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
export const UUIDSchema = z.string().uuid();

export const UserProfileSchema = z.object({
  id: UUIDSchema,
  first_name: z.string().nullable(),
  locale: z.string(),
  timezone: z.string(),
  phone_e164: z.string().nullable(),
  whatsapp_opt_in: z.boolean(),
  onboarding_status: z.enum(["pending", "completed", "blocked"]),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const UserSettingsSchema = z.object({
  user_id: UUIDSchema,
  weekly_checkin_dow: z.number().int().min(1).max(7),
  weekly_checkin_time: ISOTimeString,
  quiet_hours_start: ISOTimeString.nullable(),
  quiet_hours_end: ISOTimeString.nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type UserSettings = z.infer<typeof UserSettingsSchema>;

export const ObjectiveScheduleSchema = z.object({
  days: z.array(z.number().int().min(1).max(7)),
  time: ISOTimeString.nullable().optional(),
});

export const UserObjectiveSchema = z.object({
  id: UUIDSchema,
  user_id: UUIDSchema,
  objective_code: z.string(),
  status: ObjectiveStatusEnum,
  started_at: ISODateString,
  ended_at: ISODateString.nullable(),
  frequency_per_week: z.number().int().min(1).max(7).nullable(),
  schedule: ObjectiveScheduleSchema,
  last_checkin_at: ISODateString.nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type UserObjective = z.infer<typeof UserObjectiveSchema>;

export const UserObjectiveEntrySchema = z.object({
  id: UUIDSchema,
  user_objective_id: UUIDSchema,
  day: ISODateString,
  status: CheckinStatusEnum,
  source: z.enum(["whatsapp_optin", "manual"]),
  note: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type UserObjectiveEntry = z.infer<typeof UserObjectiveEntrySchema>;

export const UserMessageSchema = z.object({
  id: UUIDSchema,
  user_id: UUIDSchema,
  direction: MessageDirectionEnum,
  channel: MessageChannelEnum,
  body: z.string().nullable(),
  template_key: z.string().nullable(),
  payload: z.record(z.unknown()).nullable(),
  related_user_objective_id: UUIDSchema.nullable(),
  external_id: z.string().nullable(),
  is_proactive: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type UserMessage = z.infer<typeof UserMessageSchema>;

export const OptinButtonSchema = z.object({
  type: z.literal("quick_reply"),
  text: z.string(),
});

export const OptinTemplateSchema = z.object({
  key: z.string(),
  category: z.string(),
  language: z.string(),
  body_template: z.string(),
  buttons: z.array(OptinButtonSchema),
  version: z.number().int().positive(),
  active: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type OptinTemplate = z.infer<typeof OptinTemplateSchema>;

export const BilanWeeklySchema = z.object({
  id: UUIDSchema,
  user_id: UUIDSchema,
  week_start_date: ISODateString,
  responses: z.record(z.unknown()),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type BilanWeekly = z.infer<typeof BilanWeeklySchema>;

export const UserBadgeSchema = z.object({
  id: UUIDSchema,
  user_id: UUIDSchema,
  user_objective_id: UUIDSchema.nullable(),
  badge: BadgeTypeEnum,
  week_start_date: ISODateString.nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type UserBadge = z.infer<typeof UserBadgeSchema>;

export const AiLogSchema = z.object({
  id: UUIDSchema,
  agent: AgentCodeEnum,
  user_id: UUIDSchema.nullable(),
  input: z.record(z.unknown()),
  output: z.record(z.unknown()).nullable(),
  trace_id: z.string().nullable(),
  status: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type AiLog = z.infer<typeof AiLogSchema>;

export const ContextSignalSchema = z.object({
  id: UUIDSchema,
  user_id: UUIDSchema,
  subject: z.string(),
  sentiment: z.string().nullable(),
  detected_at: z.string().datetime(),
  ttl: z.string().nullable(),
  processed: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type ContextSignal = z.infer<typeof ContextSignalSchema>;

export const QAAnswerSchema = z.union([z.string(), z.array(z.string())]);
export const QAItemSchema = z.object({
  q: z.string(),
  a: QAAnswerSchema,
});
export const ObjectiveQAResponsesSchema = z.object({
  user_objective_id: UUIDSchema,
  answers: z.array(QAItemSchema),
});
export const WeeklyResponsesSchema = z.object({
  objectives: z.array(ObjectiveQAResponsesSchema),
  bilan_feedback: z.string().nullable().optional(),
});

export const MeSchema = z.object({
  id: UUIDSchema,
  email: z.string().email().nullable(),
  first_name: z.string().nullable(),
  phone_e164: z.string().nullable(),
});
export type MeResponse = z.infer<typeof MeSchema>;

// Payload schemas for Edge Functions -----------------------------------------

export const SetCheckinPayloadSchema = z.object({
  weekly_checkin_dow: z.number().int().min(1).max(7),
  weekly_checkin_time: ISOTimeString,
});

export const A1SuggestionsPayloadSchema = z.object({
  iteration: z.number().int().min(1),
  excluded_codes: z.array(z.string()),
  result: z.object({
    suggested_objectives: z.array(z.object({
      code: z.string(),
      title: z.string(),
      reason: z.string(),
      difficulty: DifficultyLevelEnum,
    })),
  }),
  feedback: z.object({
    selected: z.array(z.string()).optional(),
    comment: z.string().optional(),
  }).optional(),
});

export const ActivateObjectivesPayloadSchema = z.object({
  objectives: z.array(z.object({
    objective_code: z.string(),
    frequency_per_week: z.number().int().min(1).max(7),
    schedule: ObjectiveScheduleSchema,
  })).min(1),
});

export const ReactivateObjectivesPayloadSchema = z.object({
  ids: z.array(UUIDSchema).min(1),
});

export const ReplaceObjectivesPayloadSchema = z.object({
  complete: z.array(UUIDSchema).optional(),
  pause: z.array(UUIDSchema).optional(),
  activate_new: ActivateObjectivesPayloadSchema.shape.objectives.optional(),
  reactivate_paused: z.array(UUIDSchema).optional(),
}).refine((payload) => (
  (payload.complete && payload.complete.length > 0) ||
  (payload.pause && payload.pause.length > 0) ||
  (payload.activate_new && payload.activate_new.length > 0) ||
  (payload.reactivate_paused && payload.reactivate_paused.length > 0)
), { message: "At least one action is required" });

export const OptinWebhookPayloadSchema = z.object({
  user_id: UUIDSchema,
  direction: MessageDirectionEnum,
  template_key: z.string().nullable(),
  body: z.string().nullable(),
  payload: z.record(z.unknown()).nullable(),
  objective_entry: z.object({
    user_objective_id: UUIDSchema,
    day: ISODateString,
    status: CheckinStatusEnum,
    note: z.string().nullable().optional(),
  }).optional(),
  is_proactive: z.boolean().optional(),
  external_id: z.string().nullable().optional(),
});

export const EntriesUpsertPayloadSchema = z.object({
  entries: z.array(z.object({
    user_objective_id: UUIDSchema,
    day: ISODateString,
    status: CheckinStatusEnum,
    source: z.enum(["whatsapp_optin", "manual"]),
    note: z.string().nullable().optional(),
  })).min(1),
});

export const BilanSubmitPayloadSchema = z.object({
  week_start_date: ISODateString,
  responses: WeeklyResponsesSchema,
});

export const BilanEmailCronPayloadSchema = z.object({
  week_start_date: ISODateString,
});

export type SetCheckinPayload = z.infer<typeof SetCheckinPayloadSchema>;
export type A1SuggestionsPayload = z.infer<typeof A1SuggestionsPayloadSchema>;
export type ActivateObjectivesPayload = z.infer<typeof ActivateObjectivesPayloadSchema>;
export type ReactivateObjectivesPayload = z.infer<typeof ReactivateObjectivesPayloadSchema>;
export type ReplaceObjectivesPayload = z.infer<typeof ReplaceObjectivesPayloadSchema>;
export type OptinWebhookPayload = z.infer<typeof OptinWebhookPayloadSchema>;
export type EntriesUpsertPayload = z.infer<typeof EntriesUpsertPayloadSchema>;
export type BilanSubmitPayload = z.infer<typeof BilanSubmitPayloadSchema>;
export type BilanEmailCronPayload = z.infer<typeof BilanEmailCronPayloadSchema>;
