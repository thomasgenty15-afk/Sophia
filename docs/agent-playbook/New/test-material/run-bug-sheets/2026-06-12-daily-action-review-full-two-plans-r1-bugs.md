# Run Bug Sheet - Daily Action Review Full Two Plans R1

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-12-daily-action-review-full-two-plans-r1.md`

## Bugs

### R1-B01

- Tours: Tour 1
- Famille: `BF-LEDGER-02`
- Domaine owner: daily action review visible response / WhatsApp final response pipeline.
- Source amont: visible agent `daily_action_review.visible.commit_success` ou normalisation avant `chat_messages`.
- Symptome visible: Sophia envoie un tableau JSON serialise au lieu d'un texte de cloture.
- Preuve systeme: `chat_messages.content` vaut `[\n  "Bravo pour tes cinq minutes..."\n]`; logs `daily_action_review.visible.commit_success`, model `gemini-3-flash-preview`, pending `done`, 2 entries creees.
- Correction attendue: forcer une sortie plain text; extraire/rejeter les arrays JSON et objets message avant persistance/envoi.
- Statut: verified
- Fix reference: local fix in `supabase/functions/_shared/daily_action_review/local_flow.ts`; verified by rerun `daily-full-two-plans-rerun-20260612140903-r1`
- Tests requis: commit daily 2 actions -> message plain text; visible agent retourne array JSON -> sanitizer garde uniquement le texte; anti-faux-positif pour un user qui demande explicitement du JSON hors daily.

### R1-B02

- Tours: Tour 2
- Famille: `BF-LEDGER-02`
- Domaine owner: WhatsApp final response adapter / hidden note sanitizer.
- Source amont: `replyWithBrain` ou couche d'envoi/persistance WhatsApp apres generation.
- Symptome visible: une note interne `<!--fil_rouge_whatsapp: ...-->` apparait dans la reponse envoyee.
- Preuve systeme: tour post-cloture, pending handler `handled=false`, assistant content contient le commentaire HTML `fil_rouge_whatsapp`.
- Correction attendue: stripper les notes cachees avant persistance dans `chat_messages` et avant envoi WhatsApp; garder ces notes uniquement dans metadata/temp memory si necessaire.
- Statut: verified
- Fix reference: local fix in `supabase/functions/sophia-brain/chat_text.ts` and `supabase/functions/whatsapp-webhook/wa_reply.ts`; verified by rerun `daily-full-two-plans-rerun-20260612140903-r1`
- Tests requis: reponse WhatsApp normale apres flow local clos -> aucun commentaire HTML; invariant global `chat_messages.content not like '%fil_rouge_whatsapp%'`; verifier que la note reste disponible dans le stockage interne attendu si le systeme en a besoin.
