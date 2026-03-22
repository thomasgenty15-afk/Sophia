# Coaching Intervention Phase 1

Phase 1 adds a dedicated foundation for concrete coaching interventions without wiring it into the chat runtime yet.

Scope:
- canonical catalog of 6 blockers
- canonical catalog of 10 techniques
- blocker -> technique mapping
- momentum-based intervention gate
- structured contract for a future micro-LLM selector

Files:
- `supabase/functions/sophia-brain/coaching_interventions.ts`
- `supabase/functions/sophia-brain/coaching_intervention_selector.ts`

Design rules:
- momentum stays the relationship and pressure layer
- the selector chooses at most one technique
- blocked or distress states fail closed
- support states require explicit help request before concrete coaching
- the selector never invents blockers or techniques outside the canonical catalog

Not included yet:
- runtime call from the router
- persistence of intervention attempts
- weekly consolidation
- personalization from historical effectiveness
