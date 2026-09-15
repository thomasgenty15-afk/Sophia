// `/app/chat` — LA BULLE, AU NAVIGATEUR, CONTRE LA VRAIE PILE.
//
// ── POURQUOI CE FICHIER EXISTE À CÔTÉ DES TESTS DÉJÀ VERTS ──────────────────
// `chatMerge.int.test.ts` prouve la fusion de liste, `chat_inbound_int_test.ts`
// prouve le transport HTTP, et les deux étaient verts pendant que la
// conversation rendait « Content de te lire. On reprend où tu veux ? » à une
// question sur une barre Mars (mesuré en base le 2026-09-09). Aucun des deux ne
// pouvait le voir: le défaut naissait de la rencontre entre un état serveur et
// un tour réel, et il ne se voit QUE bout en bout.
//
// Les trois autres specs de ce dossier (`stress-chat`, `chat-delete`,
// `network-chaos`) visent `/chat` et le scope `web` — la surface de de-whatsapp,
// morte depuis P1. Celle-ci vise ce qui est vendu: `/app/chat`, scope `app`.
//
// ── CE QUI EST RÉEL ICI, ET CE QUI NE L'EST PAS ─────────────────────────────
// RÉEL: la pile Supabase locale, le JWT, la RLS, Realtime, `chat-inbound-v1`,
// le moteur de tour, et donc un VRAI appel de modèle (4 à 17 s par tour,
// mesuré). SIMULÉ: rien.
//
// Conséquence assumée: ces tests coûtent des jetons et ils sont lents. C'est le
// prix de la seule chose qu'on n'a pas su tester autrement.
//
// ── LA SESSION EST POSÉE, PAS TAPÉE ────────────────────────────────────────
// `auth.admin.createUser` rend « invalid JWT: signing method HS256 is invalid »
// de façon intermittente sur la pile locale (mesuré: 2 succès sur 8 au même
// run, voir `scripts/dev_make_chat_student.ts`). On passe donc par `signUp`, et
// on pose la session en `localStorage` avant le boot de l'app — ce qui teste
// aussi que la bulle se contente de ce que le vrai formulaire y écrit.
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function mustEnv(name: string, ...fallbacks: string[]): string {
  for (const candidate of [name, ...fallbacks]) {
    const v = process.env[candidate];
    if (v) return v;
  }
  throw new Error(`Missing env: ${[name, ...fallbacks].join(" or ")}`);
}

const SUPABASE_URL = mustEnv("VITE_SUPABASE_URL", "SUPABASE_URL");
const ANON_KEY = mustEnv("VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY");
const SERVICE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

/**
 * La clé de `localStorage` que supabase-js choisit tout seul:
 * `sb-<ref>-auth-token`, où `<ref>` est le PREMIER segment du nom d'hôte. En
 * local, `127.0.0.1` donne donc `sb-127-auth-token`. Dérivée et non écrite en
 * dur: un test qui pointe la mauvaise clé ne se plaint pas, il affiche
 * simplement un écran déconnecté.
 */
function storageKey(): string {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  return `sb-${ref}-auth-token`;
}

type Student = {
  admin: SupabaseClient;
  userId: string;
  session: Record<string, unknown>;
};

/**
 * Un élève qui ATTEINT `/app/chat`, et pas un de moins.
 *
 * Les trois gardes de la route se lisent dans `App.tsx`:
 *   `KeelHouseholdRoute` → `keel_role = 'student'` (ou un foyer);
 *   `KeelPaywallGate`    → passe, sauf foyer gelé;
 *   `KeelOnboardingGate` → une ligne `student_goals`, sinon on est renvoyé
 *                          dans l'entonnoir `/app/setup`.
 * Oublier `student_goals` ne donne pas un test rouge mais un test qui teste
 * l'entonnoir: la redirection est silencieuse.
 */
async function seedStudent(): Promise<Student> {
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nonce = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
  const { data, error } = await anon.auth.signUp({
    email: `e2e-app-chat-${nonce}@test.dev`,
    password: "TestPassword!123",
  });
  if (error || !data.user || !data.session) {
    throw new Error(`signUp failed: ${error?.message ?? "no session"}`);
  }
  const userId = data.user.id;

  const { error: profileError } = await admin.from("profiles").update({
    keel_role: "student",
    full_name: "E2E Chat",
    timezone: "Europe/Paris",
    country: "FR",
    locale: "fr-FR",
    proactive_muted_at: null,
    deletion_requested_at: null,
  }).eq("id", userId);
  if (profileError) throw profileError;

  // `content_locale` est NOT NULL sans défaut: la base refuse un objectif qui
  // ne dit pas dans quelle langue son plan doit être écrit. On le passe donc,
  // et on le passe ÉGAL à `profiles.locale` — un objectif `fr-FR` sous un
  // profil anglais est un état que le produit n'a pas à produire ici.
  const { error: goalError } = await admin
    .from("student_goals")
    .upsert({ user_id: userId, goal: "fat_loss", content_locale: "fr-FR" });
  if (goalError) throw goalError;

  return {
    admin,
    userId,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      token_type: "bearer",
      expires_in: data.session.expires_in ?? 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3400,
      user: {
        id: userId,
        aud: "authenticated",
        role: "authenticated",
        email: data.user.email,
      },
    },
  };
}

async function cleanup(student: Student) {
  const db = student.admin;
  await db.from("inbound_dedup").delete().eq("user_id", student.userId);
  await db.from("chat_messages").delete().eq("user_id", student.userId);
  await db.from("student_goals").delete().eq("user_id", student.userId);
  await db.auth.admin.deleteUser(student.userId).catch(() => {});
}

async function openChat(page: Page, student: Student) {
  await page.addInitScript(
    ([key, session]) => {
      window.localStorage.setItem(key as string, JSON.stringify(session));
    },
    [storageKey(), student.session] as const,
  );
  await page.goto("/app/chat");
  // Le composeur, et pas un texte de la page: c'est lui qui prouve que les
  // trois gardes ont laissé passer. Un `/app/setup` rendu à la place afficherait
  // sa propre page, tout aussi « chargée ».
  await expect(page.getByTestId("chat-input")).toBeVisible({ timeout: 30_000 });
}

/** Le texte des bulles d'un côté de la conversation, dans l'ordre. */
async function bubbles(
  page: Page,
  role: "user" | "assistant",
): Promise<string[]> {
  return await page.locator(`[data-role="${role}"]`).allInnerTexts();
}

async function send(page: Page, text: string) {
  await page.getByTestId("chat-input").fill(text);
  await page.getByTestId("chat-send").click();
}

// ── LE TOUR QUI COMPTE ──────────────────────────────────────────────────────

test("un tour de conversation: la réponse arrive, l'écho ne double pas", async ({ page }) => {
  test.setTimeout(180_000);
  const student = await seedStudent();
  try {
    await openChat(page, student);
    await expect(page.locator('[data-role="assistant"]')).toHaveCount(0);

    await send(page, "salut, comment tu vas ?");

    // ① L'indicateur s'allume. Il est la seule chose qui dise « c'est parti »
    //    pendant les 4 à 17 s du modèle; s'il n'apparaît pas, la personne
    //    renvoie son message.
    await expect(page.getByTestId("chat-thinking")).toBeVisible();

    // ② La réponse arrive PAR REALTIME, sans rechargement.
    await expect(page.locator('[data-role="assistant"]')).toHaveCount(1, {
      timeout: 150_000,
    });

    // ③ L'indicateur s'éteint — et il s'éteint sur l'ARRIVÉE, pas sur un
    //    minuteur (`answerLandedAfter`).
    await expect(page.getByTestId("chat-thinking")).toBeHidden();

    // ④ UN SEUL écho. Le doublon d'affichage (écho optimiste + ligne réelle
    //    livrée par Realtime) est le défaut n°1 de cet écran, et il n'est
    //    visible qu'ici: il naît de la rencontre entre l'état React et une
    //    livraison Realtime.
    expect(await bubbles(page, "user")).toEqual(["salut, comment tu vas ?"]);

    // ⑤ Aucune erreur affichée.
    await expect(page.getByTestId("chat-error")).toHaveCount(0);

    // ⑥ La base dit la même chose que l'écran: un entrant, une réponse, dans
    //    le scope que la bulle lit.
    const { data: rows } = await student.admin
      .from("chat_messages")
      .select("role,content")
      .eq("user_id", student.userId)
      .eq("scope", "app")
      .order("created_at", { ascending: true });
    const list = (rows ?? []) as Array<{ role: string; content: string }>;
    expect(list.filter((r) => r.role === "user")).toHaveLength(1);
    expect(list.filter((r) => r.role === "assistant")).toHaveLength(1);
    const reply = list.find((r) => r.role === "assistant")!;
    expect(reply.content.trim().length).toBeGreaterThan(0);

    // ⑦ LE TOUR N'A PAS ÉTÉ CONFISQUÉ. C'est le défaut du 2026-09-09: un flow
    //    résiduel (`keel_reengagement_resume_v1`) possédait le tour et rendait
    //    une phrase fixe. Le propriétaire du tour est tracé; on l'exige.
    const { data: traces } = await student.admin
      .from("conversation_turn_traces")
      .select("response_owner")
      .eq("user_id", student.userId);
    const owners = ((traces ?? []) as Array<{ response_owner: string }>)
      .map((t) => t.response_owner);
    expect(owners).toEqual(["normal_reply"]);
  } finally {
    await cleanup(student);
  }
});

test("la continuité: ce qui est dit au tour 1 est relu au tour 2", async ({ page }) => {
  // LE TROU `history: []` DE FF-023, VU DE L'ÉCRAN.
  // Il a été fermé côté serveur (`chat-inbound-v1` garde 6), et ce test est le
  // seul endroit qui vérifie que la fermeture tient de bout en bout. Le fait
  // rappelé est un ALIMENT exprès: c'est le vocabulaire du produit, donc le
  // chemin que le prompt a le plus de raisons de porter.
  test.setTimeout(240_000);
  const student = await seedStudent();
  try {
    await openChat(page, student);

    // ⚠️ PAS UNE DÉCLARATION DE REPAS. « j'ai mangé une pizza » est désormais
    // intercepté AVANT le moteur (deux boutons, zéro tour). Un fait alimentaire
    // reste le bon vocabulaire à mémoriser — on le pose comme une préférence,
    // pas comme un repas à enregistrer.
    await send(page, "mon plat préféré c'est la pizza aux anchois");
    await expect(page.locator('[data-role="assistant"]')).toHaveCount(1, {
      timeout: 150_000,
    });
    await expect(page.getByTestId("chat-thinking")).toBeHidden();

    await send(page, "rappelle-moi quel est mon plat préféré ?");
    await expect(page.locator('[data-role="assistant"]')).toHaveCount(2, {
      timeout: 150_000,
    });
    await expect(page.getByTestId("chat-thinking")).toBeHidden();

    // ⚠️ L'ASSERTION PORTE SUR LE FAIT, PAS SUR LA FORMULATION. On exige le mot
    // que la personne a donné — « anchois ». Une réponse qui ne le porte pas
    // est soit un aveu (« je ne l'ai plus »), soit une confabulation: les deux
    // sont le RED le plus grave de FF-023, et les deux doivent être rouges.
    const replies = await bubbles(page, "assistant");
    expect(replies[1].toLowerCase()).toContain("anchois");
  } finally {
    await cleanup(student);
  }
});

// ── LES BORDS ───────────────────────────────────────────────────────────────

test("réseau coupé: le message est marqué échoué, l'indicateur s'éteint", async ({ page }) => {
  // Le pire état possible de cet écran n'est PAS l'erreur: c'est l'indicateur
  // « Sophia écrit… » qui tourne pour toujours. La personne attend une réponse
  // qui ne viendra jamais et n'a rien à réessayer.
  test.setTimeout(120_000);
  const student = await seedStudent();
  try {
    await openChat(page, student);
    await page.route(
      "**/functions/v1/chat-inbound-v1",
      (route) => route.abort(),
    );

    await send(page, "est-ce que ça part ?");

    await expect(page.getByTestId("chat-error")).toBeVisible({
      timeout: 30_000,
    });
    // L'indicateur DOIT retomber: il est le seul signal d'attente.
    await expect(page.getByTestId("chat-thinking")).toBeHidden();
    // L'écho reste à l'écran, marqué — le texte tapé ne doit pas disparaître.
    expect(await bubbles(page, "user")).toEqual(["est-ce que ça part ?"]);
    // Et rien n'a été écrit: un échec réseau ne laisse pas de tour fantôme.
    const { count } = await student.admin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", student.userId)
      .eq("scope", "app");
    expect(count ?? 0).toBe(0);
  } finally {
    await cleanup(student);
  }
});

test("tour joué mais rien livré: l'attente s'arrête et se dit", async ({ page }) => {
  // LE DERNIER CHEMIN VERS « ÇA RÉPOND PAS » SANS QUE RIEN NE LE DISE.
  //
  // `deliverChatMessage` refuse un contenu vide (`empty_content`) et rend
  // `{ ok: true, delivered: false }` — un SUCCÈS HTTP sans bulle. Le texte vide
  // est atteignable par construction: `finalVisibleText` est une chaîne de
  // RETRAITS (commentaires cachés, vocabulaire périmé, scripts étrangers) et
  // rien n'y pose de plancher.
  //
  // MESURÉ AVANT LA CORRECTION: « Sophia écrit… » encore visible 20 s après
  // l'envoi, zéro erreur affichée. La réponse du serveur est SIMULÉE ici, et
  // c'est le seul endroit de ce fichier où quelque chose l'est: provoquer un
  // texte vide depuis un vrai modèle n'est pas reproductible, alors que le
  // CONTRAT qu'il faut tenir, lui, est exact et vérifiable.
  test.setTimeout(120_000);
  const student = await seedStudent();
  try {
    await openChat(page, student);
    await page.route("**/functions/v1/chat-inbound-v1", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          delivered: false,
          delivery_reason: "empty_content",
          chat_message_id: null,
          request_id: "e2e",
        }),
      }));

    await send(page, "est-ce que tu me réponds ?");

    // L'attente S'ARRÊTE. C'est l'assertion qui compte: un indicateur sans fin
    // est indiscernable d'une panne totale, vu de la personne.
    await expect(page.getByTestId("chat-thinking")).toBeHidden({
      timeout: 30_000,
    });
    // Et elle se DIT — le silence serait un écran qui ment par omission.
    await expect(page.getByTestId("chat-error")).toBeVisible();

    // ⛔ L'ÉCHO N'EST PAS MARQUÉ EN ÉCHEC. Le message est bien arrivé; le
    // proposer à réessayer ferait rejouer un tour pour le même résultat, et
    // laisserait croire que ce qu'on a écrit est perdu.
    expect(await bubbles(page, "user")).toEqual(["est-ce que tu me réponds ?"]);
    await expect(page.getByText("Le message n’est pas parti. Réessaie."))
      .toHaveCount(0);
  } finally {
    await cleanup(student);
  }
});

test("un tap sur une question armée: écriture réelle, accusé, aucun modèle", async ({ page }) => {
  // LA QUESTION ARMÉE EST LA MOITIÉ NON TEXTUELLE DU CHAT, et c'est celle que
  // les élèves réels utilisent le plus (mesuré: 35 des 42 tours de la base
  // locale sont des taps). Elle ne doit PAS traverser un modèle: un
  // `button_payload` est une valeur que nous avons émise et qui n'a qu'un sens.
  test.setTimeout(120_000);
  const student = await seedStudent();
  try {
    // La bulle armée est POSÉE en base, comme le cron du soir la pose. Le
    // `mute` est choisi parce qu'il écrit une colonne du produit sans exiger
    // ni plan ni repas — voir `chat_inbound_int_test.ts` pour le même choix.
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await student.admin.from("chat_messages").insert({
      user_id: student.userId,
      scope: "app",
      role: "assistant",
      content: "Tu as mangé le plat prévu pour le dîner ?",
      metadata: {
        channel: "in_app",
        purpose: "keel_slot_meal",
        is_proactive: true,
        delivery_reason: "guaranteed",
        buttons: [
          {
            label: "Ne plus me demander à chaque repas",
            payload: `KEEL_SLOTMEAL_mute|${today}|dinner`,
          },
        ],
      },
    });
    if (error) throw error;

    await openChat(page, student);

    // Les boutons ne s'affichent que sur la DERNIÈRE bulle de Sophia — c'est le
    // désarmement (FF-062 R13) vu de l'écran.
    const tap = page.getByRole("button", {
      name: "Ne plus me demander à chaque repas",
    });
    await expect(tap).toBeVisible({ timeout: 30_000 });
    await tap.click();

    // L'accusé arrive: deux bulles de Sophia, la question et la réponse.
    await expect(page.locator('[data-role="assistant"]')).toHaveCount(2, {
      timeout: 60_000,
    });
    await expect(page.getByTestId("chat-thinking")).toBeHidden();

    // L'écriture EST en base. Un accusé sur une écriture ratée est un
    // `phantom_commit`: rien à l'écran ne dirait que le geste s'est perdu.
    const { data: profile } = await student.admin
      .from("profiles")
      .select("slot_meal_ask_enabled")
      .eq("id", student.userId)
      .maybeSingle();
    expect(
      (profile as { slot_meal_ask_enabled?: boolean | null } | null)
        ?.slot_meal_ask_enabled,
    ).toBe(false);

    // AUCUN tour de moteur: un tap déterministe ne paie pas un modèle.
    const { count: traces } = await student.admin
      .from("conversation_turn_traces")
      .select("turn_id", { count: "exact", head: true })
      .eq("user_id", student.userId);
    expect(traces ?? 0).toBe(0);
  } finally {
    await cleanup(student);
  }
});

test("un repas tapé en texte libre: deux boutons, zéro fait, zéro modèle", async ({ page }) => {
  // LA DÉCISION PRODUIT DU 2026-09-13, VU DE L'ÉCRAN.
  // « j'ai mangé une pizza » est le geste le plus naturel, et c'était le
  // seul des trois chemins à n'écrire ni calories ni créneau. On rend la
  // main: Photo, ou écrire le plat. Le tour s'arrête AVANT le moteur.
  test.setTimeout(120_000);
  const student = await seedStudent();
  try {
    await openChat(page, student);

    await send(page, "j'ai mangé une pizza ce midi");

    const photo = page.getByRole("button", { name: "Prendre une photo" });
    const write = page.getByRole("button", { name: "Écrire ton plat" });
    await expect(photo).toBeVisible({ timeout: 30_000 });
    await expect(write).toBeVisible();
    await expect(page.getByTestId("chat-thinking")).toBeHidden();

    // ⛔ ZÉRO FAIT. Sans ça, un clic ensuite ferait DEUX lignes pour un repas.
    const { count: facts } = await student.admin
      .from("protocol_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", student.userId);
    expect(facts ?? 0).toBe(0);

    // AUCUN tour de moteur: la lane a pris le tour.
    const { count: traces } = await student.admin
      .from("conversation_turn_traces")
      .select("turn_id", { count: "exact", head: true })
      .eq("user_id", student.userId);
    expect(traces ?? 0).toBe(0);

    // « Écrire ton plat » ouvre LE champ, au créneau que la phrase a nommé.
    await write.click();
    await expect(page.locator("#tracking-describe")).toBeVisible({
      timeout: 10_000,
    });
  } finally {
    await student.admin.from("protocol_events").delete().eq("user_id", student.userId);
    await cleanup(student);
  }
});
