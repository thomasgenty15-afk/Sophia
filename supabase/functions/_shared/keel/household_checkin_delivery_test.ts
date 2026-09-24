// ===========================================================================
// UN FOYER QUI PAIE REÇOIT SES RAPPELS — 2026-09-24
//
// `process-checkins` demande à `isWhatsappCoachingAccessAllowed` si un compte
// a encore le droit de recevoir ce qui a été programmé pour lui. Refusé, il
// annule tous ses `scheduled_checkins` et saute ses rappels ponctuels.
// Le prédicat ne connaissait pas 'household': un foyer qui venait de payer
// perdait tous ses rappels, pendant que le chat lui confirmait « c'est noté ».
//
// Ce test vit sous `_shared/keel/` pour une raison: c'est le seul dossier dont
// le gate LANCE les tests. Posé à côté de `process-checkins/index.ts`, il
// n'aurait tourné qu'à la main.
// ===========================================================================

import { assertEquals } from "jsr:@std/assert@1";
import { isWhatsappCoachingAccessAllowed } from "../../process-checkins/access.ts";

const NOW = Date.parse("2026-09-24T12:00:00Z");

Deno.test("un foyer qui paie ('household') reçoit ses rappels", () => {
  assertEquals(
    isWhatsappCoachingAccessAllowed({ access_tier: "household" }, NOW),
    true,
  );
});

Deno.test("un profil réclamé ('household_member') reçoit ses rappels", () => {
  assertEquals(
    isWhatsappCoachingAccessAllowed({ access_tier: "household_member" }, NOW),
    true,
  );
});

Deno.test("un compte sans accès ('none') ne reçoit rien", () => {
  assertEquals(
    isWhatsappCoachingAccessAllowed({ access_tier: "none" }, NOW),
    false,
  );
});

Deno.test("un compte sans profil ne reçoit rien", () => {
  assertEquals(isWhatsappCoachingAccessAllowed(null, NOW), false);
});

Deno.test("un essai en cours reçoit ; un essai terminé ne reçoit plus", () => {
  assertEquals(
    isWhatsappCoachingAccessAllowed(
      { access_tier: "trial", trial_end: "2026-09-30T00:00:00Z" },
      NOW,
    ),
    true,
  );
  assertEquals(
    isWhatsappCoachingAccessAllowed(
      { access_tier: "trial", trial_end: "2026-09-20T00:00:00Z" },
      NOW,
    ),
    false,
  );
});

Deno.test("les paliers déjà acceptés le restent (coach, student)", () => {
  assertEquals(
    isWhatsappCoachingAccessAllowed({ access_tier: "coach" }, NOW),
    true,
  );
  assertEquals(
    isWhatsappCoachingAccessAllowed({ access_tier: "Student " }, NOW),
    true,
  );
});
