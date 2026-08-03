# meal-photo-upload-v1

KEEL W5.4 — the **web** path for a meal photo. The WhatsApp equivalent is
`whatsapp-webhook/handlers_meal_photo.ts` (W5.1); the two differ only in how the
bytes arrive.

## Why this function exists instead of a direct browser upload

Migration `20260727130000_keel_storage.sql` states it, and W1.4 R3 re-affirms it:
there are **no `storage.objects` policies**. `anon` and `authenticated` are
structurally unable to touch `meal-photos`. Every file access goes through an
edge function in `service_role` that has already checked ownership. This function
is that consequence, not a preference.

## The sequence, and what each step refuses to skip

1. **Authenticate the student** with their own JWT (`auth.getUser`). The row's
   `user_id` is that identity and nothing else — a body-supplied `user_id` would
   let any authenticated account write facts into someone else's protocol.
2. **Rate-limit per user**, after auth: 6 / 10 min and 40 / day, mirroring the
   WhatsApp windows. A vision call costs money, so the limit is keyed on the
   identity, not on an IP a phone rotates.
3. **Verify the mime by magic bytes** (`sniffImageMime`), then compare it to the
   declared header. A mismatch is a **refusal**, not a silent correction — the
   disagreement is itself the signal. JPEG / PNG / WebP only, 8 MB decoded max.
4. **Resolve the local date server-side** from `plan_versions.timezone`
   (R7: an unknown zone throws). A client-supplied date is a client-supplied
   fact: it would let a student file today's plate on a day the evaluator has
   already closed.
5. **Verify `commitment_id`** against *this student's* published plan before it
   is written into `recognized`. Same discipline the analyzer applies to the
   model: `recognized.commitment_id` is the evaluator's explicit binding, so an
   id from anywhere else would write a grade onto an arbitrary line.
6. **Upload, read the object back, insert the row, read the row back.** Nothing
   is announced that is not a re-read row. An upload that reports success but is
   not listable throws rather than writing a `media_path` pointing at nothing.
7. **Call `analyze-meal-photo-v1`.** Its failure never fails the upload: the fact
   is already committed and the response says plainly `analysis.status:"failed"`.
   A saved photo with no verdict beats a lost photo.

## Object key (RGPD, load-bearing)

```
<auth_user_id>/<local_date>/<client_upload_id>.<jpg|png|webp>
```

The first segment must be the owner's auth user id: `account-export-v1` bundles
`<user_id>/` and `purge-deleted-accounts` deletes `<user_id>/`. A key that does
not start with it survives account deletion — an RGPD defect, not a cosmetic one.

## Contract

`POST` with the student's `Authorization: Bearer <access_token>`.

```jsonc
{
  "mime_type": "image/jpeg",
  "base64": "...",                 // raw base64, no data: prefix needed
  "slot_key": "lunch",             // optional, R7-parsed
  "commitment_id": "uuid",         // optional, verified against the plan
  "student_note": "...",           // optional
  "client_upload_id": "..."        // optional idempotence key, per selected file
}
```

Response (200): `idempotent`, `event` (the re-read row), `media_path`,
`local_date`, `slot_key`, `analysis` (the `analyze-meal-photo-v1` body, or
`{status:"failed"|"skipped"}`).

`409` when the student has no published plan: there is no timezone to resolve the
day in and no line to evidence.

**Idempotence.** `client_upload_id` keys both the object path (`upsert`) and
`source_message_id`, so a retry of the same upload overwrites the same object and
collides on `protocol_events_source_message_idx` instead of creating a second
fact. Without it, a retry is a new photo — the honest reading of a request that
carries no identity.

## Cost

One upload triggers at most one vision call: **~$0.0037 / photo measured**
(the BUILD_PLAN sized the pilot on ~$0.0015). The measurement, the cause and the
two levers are in
[`analyze-meal-photo-v1/README.md`](../analyze-meal-photo-v1/README.md#cost).

## Non-input #4 at the insert

The row is written with `quantity`, `unit`, `substance_ref` and `food_group_ref`
all NULL. A photo evidences; it does not measure. `evidence_weight` is `1.0`
(SCHEMA.md ladder: photo 1.0 / detailed text 0.8 / thumbs-up 0.4).
