Update coach-preferences tool skill target for S6.

Architecture alignment:
- User-message understanding lives in `slot_filler.ts`, which returns structured JSON.
- `intake.ts` only merges/validates structured state, computes missing slots, persists operation input, and triggers draft generation.
- No regex or keyword fallback is allowed for preference, value, or confirmation interpretation.
