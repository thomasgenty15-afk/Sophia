import { assertEquals } from "jsr:@std/assert@1";

import {
  chooseLifecycleSegment,
  decideLifecycleSend,
  isEphemeralEmail,
  isLifecycleEmailType,
  isLifecycleSendHour,
  LIFECYCLE_CAP_WINDOW_DAYS,
  LIFECYCLE_EMAIL_TYPES,
  LIFECYCLE_MONTHLY_CAP,
  LIFECYCLE_PRIORITY,
  LIFECYCLE_QUIET_HOURS,
  type LifecycleCadenceFacts,
  type LifecycleRefusal,
  lifecycleEmailShell,
  lifecycleLocalDate,
  sendLifecycleEmail,
  unsubscribeUrl,
} from "./lifecycle_email.ts";

// FF-063 LOT 2 — LA CADENCE.
//
// Sept refus, un ordre, trois nombres. Ce fichier tient l'ORDRE autant que les
// nombres: `skipped_by_reason` n'est lisible que si « plafond atteint » et
// « s'est désinscrit » ne se recouvrent jamais, et c'est une propriété de
// l'ordre, pas des seuils.

const NOW = new Date("2026-09-09T08:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function facts(over: Partial<LifecycleCadenceFacts> = {}): LifecycleCadenceFacts {
  return {
    optedOutAt: null,
    accountStatus: "active",
    email: "someone@example.org",
    alreadySent: false,
    recentSentAt: [],
    proactiveSpokeToday: false,
    ...over,
  };
}

function agoIso(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

Deno.test("cadence — le cas nominal envoie", () => {
  assertEquals(decideLifecycleSend(facts(), NOW), { ok: true });
});

Deno.test("cadence — les sept refus, un par un", () => {
  const cases: ReadonlyArray<[Partial<LifecycleCadenceFacts>, LifecycleRefusal]> = [
    [{ optedOutAt: "2026-09-01T10:00:00Z" }, "opted_out"],
    [{ accountStatus: "deletion_pending" }, "deletion_pending"],
    [{ email: null }, "no_email"],
    [{ email: "   " }, "no_email"],
    [{ email: "qa0805.marc@example.com" }, "ephemeral"],
    [{ alreadySent: true }, "already_sent"],
    [{
      recentSentAt: [agoIso(4 * DAY), agoIso(9 * DAY), agoIso(14 * DAY), agoIso(20 * DAY)],
    }, "monthly_cap"],
    [{ recentSentAt: [agoIso(12 * HOUR)] }, "too_soon"],
    [{ proactiveSpokeToday: true }, "proactive_spoke_today"],
  ];
  for (const [over, reason] of cases) {
    assertEquals(
      decideLifecycleSend(facts(over), NOW),
      { ok: false, reason },
      `mauvais motif pour ${JSON.stringify(over)}`,
    );
  }
});

Deno.test("cadence — L'ORDRE des refus est le contrat", () => {
  // Quelqu'un qui s'est désinscrit ET qui a dépassé le plafond ET à qui on a
  // parlé aujourd'hui est compté UNE fois, comme désinscrit. Si le plafond
  // passait devant, un compte-rendu dirait « saturé » d'une personne qui a
  // simplement dit non — et c'est le chiffre qu'on lirait pour décider
  // d'augmenter la cadence.
  const everything = facts({
    optedOutAt: "2026-09-01T10:00:00Z",
    accountStatus: "deletion_pending",
    email: "qa@example.com",
    alreadySent: true,
    recentSentAt: [agoIso(1 * HOUR), agoIso(2 * DAY), agoIso(3 * DAY), agoIso(4 * DAY)],
    proactiveSpokeToday: true,
  });
  assertEquals(decideLifecycleSend(everything, NOW), {
    ok: false,
    reason: "opted_out",
  });

  // Et le rang suivant apparaît dès que le précédent tombe.
  const noOptOut = { ...everything, optedOutAt: null };
  assertEquals(decideLifecycleSend(noOptOut, NOW).ok, false);
  assertEquals(
    (decideLifecycleSend(noOptOut, NOW) as { reason: string }).reason,
    "deletion_pending",
  );
});

Deno.test("cadence — le plafond mord AU quatrième, pas au troisième", () => {
  const three = facts({
    recentSentAt: [agoIso(4 * DAY), agoIso(9 * DAY), agoIso(14 * DAY)],
  });
  assertEquals(decideLifecycleSend(three, NOW), { ok: true });

  const four = facts({
    recentSentAt: [
      agoIso(4 * DAY),
      agoIso(9 * DAY),
      agoIso(14 * DAY),
      agoIso(20 * DAY),
    ],
  });
  assertEquals(decideLifecycleSend(four, NOW), {
    ok: false,
    reason: "monthly_cap",
  });
  assertEquals(LIFECYCLE_MONTHLY_CAP, 4);
});

Deno.test("cadence — la fenêtre du plafond GLISSE", () => {
  // Quatre envois, mais le plus vieux est sorti de la fenêtre: on repart.
  // Sans ce bord, le plafond deviendrait un plafond à vie.
  const justOutside = facts({
    recentSentAt: [
      agoIso(4 * DAY),
      agoIso(9 * DAY),
      agoIso(14 * DAY),
      agoIso(LIFECYCLE_CAP_WINDOW_DAYS * DAY + HOUR),
    ],
  });
  assertEquals(decideLifecycleSend(justOutside, NOW), { ok: true });
});

Deno.test("cadence — le silence de 72 h, des deux côtés du seuil", () => {
  const tooSoon = facts({
    recentSentAt: [agoIso(LIFECYCLE_QUIET_HOURS * HOUR - 60_000)],
  });
  assertEquals(decideLifecycleSend(tooSoon, NOW), {
    ok: false,
    reason: "too_soon",
  });

  const justEnough = facts({
    recentSentAt: [agoIso(LIFECYCLE_QUIET_HOURS * HOUR + 60_000)],
  });
  assertEquals(decideLifecycleSend(justEnough, NOW), { ok: true });
});

Deno.test("cadence — un horodatage illisible ne compte pour rien", () => {
  // PostgREST peut rendre `null`, et une date cassée ne doit ni autoriser ni
  // interdire: elle doit disparaître. `NaN` dans un `Math.max` rendrait `NaN`,
  // et `now - NaN < seuil` est `false` — donc un envoi d'il y a une heure
  // deviendrait invisible. C'est ce filtre qui l'empêche.
  const broken = facts({ recentSentAt: ["pas une date", agoIso(1 * HOUR)] });
  assertEquals(decideLifecycleSend(broken, NOW), {
    ok: false,
    reason: "too_soon",
  });
});

Deno.test("adresse éphémère — la seule convention QA lue par du code de prod", () => {
  assertEquals(isEphemeralEmail("qa0805.marc@example.com"), true);
  assertEquals(isEphemeralEmail("QA@EXAMPLE.COM"), true);
  assertEquals(isEphemeralEmail("  a@example.com  "), true);
  assertEquals(isEphemeralEmail("a@example.company"), false);
  // ⚠️ `@keeltest.dev` n'est PAS filtré: aucun runtime ne l'a jamais lu, et le
  // prétendre ici créerait une seconde convention à tenir.
  assertEquals(isEphemeralEmail("qa0805.marc@keeltest.dev"), false);
  assertEquals(isEphemeralEmail(null), false);
});

Deno.test("l'heure d'envoi est LOCALE, et un fuseau illisible se tait", () => {
  // 08:00 UTC = 10:00 à Paris, 04:00 à New York.
  assertEquals(isLifecycleSendHour("Europe/Paris", NOW), true);
  assertEquals(isLifecycleSendHour("America/New_York", NOW), false);
  // Un job quotidien en UTC aurait écrit aux deux à la même seconde.
  assertEquals(isLifecycleSendHour("Asia/Tokyo", NOW), false);

  // Fuseau absent ou faux: on ne devine pas, on ne spamme pas.
  assertEquals(isLifecycleSendHour(null, NOW), false);
  assertEquals(isLifecycleSendHour("", NOW), false);
  assertEquals(isLifecycleSendHour("Pas/UnFuseau", NOW), false);
});

Deno.test("la journée locale, ou `null` quand on ne sait pas", () => {
  assertEquals(lifecycleLocalDate("Europe/Paris", NOW), "2026-09-09");
  // 08:00 UTC le 9 = 17:00 le 9 à Tokyo, mais 04:00 le 9 à New York.
  assertEquals(lifecycleLocalDate("Asia/Tokyo", NOW), "2026-09-09");
  assertEquals(
    lifecycleLocalDate("Pacific/Auckland", new Date("2026-09-09T20:00:00Z")),
    "2026-09-10",
  );
  assertEquals(lifecycleLocalDate(null, NOW), null);
  assertEquals(lifecycleLocalDate("Pas/UnFuseau", NOW), null);
});

Deno.test("le vocabulaire des types est FERMÉ", () => {
  assertEquals(isLifecycleEmailType("coverage_ends_tomorrow"), true);
  assertEquals(isLifecycleEmailType("welcome_email"), false);
  assertEquals(isLifecycleEmailType("trial_ended_j_plus_3"), false);
  // Onze types, et le compte est là pour qu'un ajout se remarque.
  assertEquals(LIFECYCLE_EMAIL_TYPES.length, 11);
  assertEquals(new Set(LIFECYCLE_EMAIL_TYPES).size, 11);
});

Deno.test("le lien de désinscription porte la langue du COMPTE", () => {
  const previous = Deno.env.get("APP_BASE_URL");
  Deno.env.set("APP_BASE_URL", "https://sophia-coach.ai/");
  try {
    assertEquals(
      unsubscribeUrl("7f3a1c2e-9b44-4d1f-8a76-1e2d3c4b5a60", "fr-FR"),
      "https://sophia-coach.ai/unsubscribe?token=7f3a1c2e-9b44-4d1f-8a76-1e2d3c4b5a60&lang=fr",
    );
    assertEquals(
      unsubscribeUrl("7f3a1c2e-9b44-4d1f-8a76-1e2d3c4b5a60", "en-US"),
      "https://sophia-coach.ai/unsubscribe?token=7f3a1c2e-9b44-4d1f-8a76-1e2d3c4b5a60&lang=en",
    );
    // Une langue non livrée est déjà ramenée à l'anglais en amont; ici « pas
    // français » veut donc bien dire « anglais ».
    assertEquals(
      unsubscribeUrl("t", "de-DE").endsWith("&lang=en"),
      true,
    );
  } finally {
    if (previous === undefined) Deno.env.delete("APP_BASE_URL");
    else Deno.env.set("APP_BASE_URL", previous);
  }
});

Deno.test("la coquille porte TOUJOURS la sortie, dans les deux langues", () => {
  const href = "https://sophia-coach.ai/unsubscribe?token=abc&lang=fr";
  const fr = lifecycleEmailShell("<p>Bonjour</p>", {
    unsubscribeHref: href,
    locale: "fr-FR",
  });
  assertEquals(fr.includes(href), true);
  assertEquals(fr.includes("Ne plus recevoir ces e-mails"), true);

  const en = lifecycleEmailShell("<p>Hello</p>", {
    unsubscribeHref: href,
    locale: "en-US",
  });
  assertEquals(en.includes(href), true);
  assertEquals(en.includes("Stop these emails"), true);
  // Bidirectionnel: le pack anglais ne doit pas laisser fuir le français.
  assertEquals(en.includes("Ne plus recevoir"), false);
  assertEquals(fr.includes("Stop these emails"), false);
});

// ---------------------------------------------------------------------------
// L'ENVOI — l'ordre invariant, et ce qui arrive quand rien ne part
// ---------------------------------------------------------------------------

/** Un faux `admin` qui retient ce qu'on lui insère. */
function fakeAdmin() {
  const inserted: Array<Record<string, unknown>> = [];
  return {
    inserted,
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserted.push({ table, ...row });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

async function withDeliveryDisabled<T>(fn: () => Promise<T>): Promise<T> {
  const previous = Deno.env.get("EMAIL_DELIVERY_ENABLED");
  Deno.env.set("EMAIL_DELIVERY_ENABLED", "0");
  try {
    return await fn();
  } finally {
    if (previous === undefined) Deno.env.delete("EMAIL_DELIVERY_ENABLED");
    else Deno.env.set("EMAIL_DELIVERY_ENABLED", previous);
  }
}

Deno.test("envoi — livraison coupée: `suppressed`, et le journal le DIT", async () => {
  // ⚠️ `sendResendEmail` rend `ok: true` quand il n'a RIEN envoyé. Compter ça
  // comme `sent` ferait croire à chaque run local qu'un e-mail est parti —
  // c'est le défaut que `coach-invite-student-v1` a déjà nommé.
  const admin = fakeAdmin();
  const state = await withDeliveryDisabled(() =>
    sendLifecycleEmail(admin, {
      userId: "u1",
      email: "someone@example.org",
      type: "coverage_ends_tomorrow",
      subject: "Ton plan se termine demain",
      html: "<p>hello</p>",
      metadata: { segment: "coverage_ends_tomorrow" },
    })
  );

  assertEquals(state, "suppressed");
  assertEquals(admin.inserted.length, 1);
  const row = admin.inserted[0] as Record<string, unknown>;
  assertEquals(row.table, "communication_logs");
  assertEquals(row.channel, "email");
  assertEquals(row.type, "coverage_ends_tomorrow");
  // `skipped` et pas `sent`: la ligne ne doit pas mentir sur ce qui est parti.
  assertEquals(row.status, "skipped");
  const meta = row.metadata as Record<string, unknown>;
  assertEquals(meta.skipped, true);
  assertEquals(meta.resend_id, "resend_DISABLED");
  assertEquals(meta.segment, "coverage_ends_tomorrow");
  assertEquals(meta.dedup_key, null);
});

Deno.test("envoi — la clé de dédup se retrouve dans le journal", async () => {
  // C'est elle que `loadLifecycleCadenceFacts` relira: sans elle en base, un
  // type répétable redeviendrait un type unique.
  const admin = fakeAdmin();
  await withDeliveryDisabled(() =>
    sendLifecycleEmail(admin, {
      userId: "u1",
      email: "someone@example.org",
      type: "long_lapse_d14",
      subject: "s",
      html: "<p>h</p>",
      dedupKey: "2026-09-13",
    })
  );
  const meta = (admin.inserted[0] as Record<string, unknown>)
    .metadata as Record<string, unknown>;
  assertEquals(meta.dedup_key, "2026-09-13");
});

Deno.test("envoi — un échec n'écrit RIEN, et c'est ce qui sauve le prochain essai", async () => {
  // L'invariant des quatre écrivains existants: la ligne de journal n'existe
  // que si l'envoi a réussi. Une ligne écrite avant l'envoi transformerait un
  // échec réseau en « déjà envoyé », c'est-à-dire en e-mail perdu pour
  // toujours.
  const admin = fakeAdmin();
  const previousKey = Deno.env.get("RESEND_API_KEY");
  const previousDelivery = Deno.env.get("EMAIL_DELIVERY_ENABLED");
  const previousMega = Deno.env.get("MEGA_TEST_MODE");
  Deno.env.set("EMAIL_DELIVERY_ENABLED", "1");
  Deno.env.set("MEGA_TEST_MODE", "0");
  Deno.env.delete("RESEND_API_KEY"); // => `{ ok: false, error: "Missing RESEND_API_KEY" }`
  try {
    const state = await sendLifecycleEmail(admin, {
      userId: "u1",
      email: "someone@example.org",
      type: "coverage_lapsed_d3",
      subject: "s",
      html: "<p>h</p>",
    });
    assertEquals(state, "failed");
    assertEquals(admin.inserted.length, 0);
  } finally {
    if (previousKey === undefined) Deno.env.delete("RESEND_API_KEY");
    else Deno.env.set("RESEND_API_KEY", previousKey);
    if (previousDelivery === undefined) Deno.env.delete("EMAIL_DELIVERY_ENABLED");
    else Deno.env.set("EMAIL_DELIVERY_ENABLED", previousDelivery);
    if (previousMega === undefined) Deno.env.delete("MEGA_TEST_MODE");
    else Deno.env.set("MEGA_TEST_MODE", previousMega);
  }
});

// ---------------------------------------------------------------------------
// L'ORDRE TOTAL — qui gagne quand deux segments matchent
// ---------------------------------------------------------------------------

Deno.test("priorité — la liste couvre EXACTEMENT les onze types", () => {
  // Un type absent de la liste ne serait jamais choisi, et rien ne le dirait:
  // le job compterait un `no_segment` de plus et le compte-rendu aurait l'air
  // normal. C'est la seule assertion qui rend cet oubli visible.
  assertEquals(
    [...LIFECYCLE_PRIORITY].sort(),
    [...LIFECYCLE_EMAIL_TYPES].sort(),
  );
  assertEquals(new Set(LIFECYCLE_PRIORITY).size, LIFECYCLE_PRIORITY.length);
});

Deno.test("priorité — le chevauchement réel: premier plan jamais touché, fini il y a 3 jours", () => {
  // Les deux segments matchent vraiment dans ce cas. `first_plan_no_trace`
  // gagne parce qu'il est PLUS SPÉCIFIQUE — « tu n'as jamais rien coché » dit
  // quelque chose que « rien de prévu depuis trois jours » ne dit pas.
  assertEquals(
    chooseLifecycleSegment(["coverage_lapsed_d3", "first_plan_no_trace"]),
    "first_plan_no_trace",
  );
  // L'ordre des candidats ne change rien: c'est la liste qui tranche.
  assertEquals(
    chooseLifecycleSegment(["first_plan_no_trace", "coverage_lapsed_d3"]),
    "first_plan_no_trace",
  );
});

Deno.test("priorité — ce qui arrive AVANT le problème passe devant", () => {
  // `coverage_ends_tomorrow` est le seul e-mail de la séquence qui prévient.
  // Le reporter d'un jour lui retire toute sa valeur; une question, non.
  assertEquals(
    chooseLifecycleSegment(["first_plan_no_trace", "coverage_ends_tomorrow"]),
    "coverage_ends_tomorrow",
  );
  // Et un fait sur l'ACCÈS passe devant un fait sur le plan: écrire « ton plan
  // se termine demain » à quelqu'un dont l'abonnement s'arrête ce soir se lit
  // comme une insulte.
  assertEquals(
    chooseLifecycleSegment(["coverage_ends_tomorrow", "trial_ends_tomorrow"]),
    "trial_ends_tomorrow",
  );
  assertEquals(
    chooseLifecycleSegment(["trial_ends_tomorrow", "cancel_intent"]),
    "cancel_intent",
  );
});

Deno.test("priorité — aucun candidat, et un candidat inconnu", () => {
  assertEquals(chooseLifecycleSegment([]), null);
  assertEquals(chooseLifecycleSegment([null, null]), null);
  // Un type hors liste est IGNORÉ, pas rangé en dernier: se retrouver au bout
  // d'une liste par défaut est exactement la façon dont un nouveau type n'est
  // jamais envoyé sans que personne le remarque.
  assertEquals(
    chooseLifecycleSegment(["pas_un_type" as never, "long_lapse_d14"]),
    "long_lapse_d14",
  );
  assertEquals(chooseLifecycleSegment(["pas_un_type" as never]), null);
});
