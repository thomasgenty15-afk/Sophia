// FF-066 — le tri des identifiants, le filtre du plancher, le choix de variante,
// le bloc, et la seule lecture en base. Les fiches sont SYNTHÉTIQUES ici: ce
// fichier teste la mécanique, `cards_test.ts` teste le contenu.

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  APP_HELP_MAX_TOPICS,
  appHelpContextBlock,
  appHelpDispatcherLines,
  appHelpLocaleOf,
  appHelpTopicsAllowed,
  loadAppHelpViewer,
  photoTopicsIn,
  selectAppHelpTopics,
  UNKNOWN_APP_HELP_VIEWER,
} from "./block.ts";
import { APP_HELP_BLOCK_TITLE } from "./block_title.ts";
import { APP_HELP_TOPIC_IDS, type AppHelpCard } from "./cards.ts";

const PHOTO_CARD: AppHelpCard = {
  id: "meal_photo_how",
  title: { fr: "Envoyer une photo", en: "Sending a photo" },
  dispatcherHint: "comment envoyer une photo",
  answer: {
    fr: ["Réponse générale, conditions énoncées."],
    en: ["General answer, conditions stated."],
  },
  variants: [
    {
      when: { goals: ["fat_loss", "muscle_gain"] },
      answer: { fr: ["Variante objectif."], en: ["Goal variant."] },
    },
    {
      when: { roles: ["member"] },
      answer: { fr: ["Variante membre."], en: ["Member variant."] },
    },
  ],
  doesNotExist: { fr: ["le scan"], en: ["scanning"] },
  labels: [],
  routes: [],
};
const LIST_CARD: AppHelpCard = {
  id: "shopping_list",
  title: { fr: "La liste de courses", en: "The shopping list" },
  dispatcherHint: "ou est la liste de courses",
  answer: { fr: ["Ligne A.", "Ligne B."], en: ["Line A.", "Line B."] },
  labels: [],
  routes: [],
};
const UNKNOWN_CARD: AppHelpCard = {
  id: "unknown_feature",
  title: { fr: "Ce qui n'existe pas", en: "What does not exist" },
  dispatcherHint: "autre chose",
  answer: { fr: [], en: [] },
  labels: [],
  routes: [],
};
const CARDS = [PHOTO_CARD, LIST_CARD, UNKNOWN_CARD];

Deno.test("selectAppHelpTopics — garde les connus, dédoublonne, 3 au plus, dans l'ordre", () => {
  const got = selectAppHelpTopics([
    " Meal_Photo_How ",
    "meal_photo_how",
    "shopping_list",
    "invented_topic",
    "price_trial",
    "account_delete",
  ]);
  assertEquals(got.topics, ["meal_photo_how", "shopping_list", "price_trial"]);
  assertEquals(got.dropped, ["invented_topic"]);
  assertEquals(got.topics.length <= APP_HELP_MAX_TOPICS, true);
});

Deno.test("selectAppHelpTopics — rien de connu ⇒ unknown_feature, jamais rien", () => {
  assertEquals(selectAppHelpTopics(["scan_barcode"]).topics, ["unknown_feature"]);
  assertEquals(selectAppHelpTopics(undefined).topics, ["unknown_feature"]);
  assertEquals(selectAppHelpTopics("shopping_list").topics, ["shopping_list"]);
});

Deno.test("appHelpTopicsAllowed — sous le plancher ou pour un mineur, pas de fiche de chiffres", () => {
  const topics = ["plan_calories_display", "shopping_list", "weight_entry"] as const;
  assertEquals(
    appHelpTopicsAllowed({ topics: [...topics], restrictionFlag: false, isMinor: false })
      .topics,
    [...topics],
  );
  for (const gate of [
    { restrictionFlag: true, isMinor: false },
    { restrictionFlag: false, isMinor: true },
  ]) {
    const got = appHelpTopicsAllowed({ topics: [...topics], ...gate });
    assertEquals(got.topics, ["shopping_list"]);
    assertEquals(got.droppedByFloor, ["plan_calories_display", "weight_entry"]);
  }
});

Deno.test("photoTopicsIn — seulement les fiches qui expliquent un geste photo", () => {
  assertEquals(photoTopicsIn(["meal_photo_how"]), true);
  assertEquals(photoTopicsIn(["meal_not_eaten"]), true);
  assertEquals(photoTopicsIn(["shopping_list", "price_trial"]), false);
});

Deno.test("appHelpLocaleOf — le français est servi en français, tout le reste en anglais", () => {
  assertEquals(appHelpLocaleOf("fr-FR"), "fr");
  assertEquals(appHelpLocaleOf("FR"), "fr");
  assertEquals(appHelpLocaleOf("en-GB"), "en");
  assertEquals(appHelpLocaleOf("de-DE"), "en");
  assertEquals(appHelpLocaleOf(null), "en");
});

Deno.test("le bloc porte le titre que la règle du composeur désigne, dans la langue de la réponse", () => {
  const fr = appHelpContextBlock({
    topics: ["shopping_list"],
    locale: "fr-FR",
    viewer: UNKNOWN_APP_HELP_VIEWER,
    cards: CARDS,
  })!;
  assert(fr.startsWith(`=== ${APP_HELP_BLOCK_TITLE.fr} ===`));
  assert(fr.includes("[La liste de courses]\n- Ligne A.\n- Ligne B."));
  const en = appHelpContextBlock({
    topics: ["shopping_list"],
    locale: "en-US",
    viewer: UNKNOWN_APP_HELP_VIEWER,
    cards: CARDS,
  })!;
  assert(en.startsWith(`=== ${APP_HELP_BLOCK_TITLE.en} ===`));
  assert(en.includes("[The shopping list]\n- Line A.\n- Line B."));
});

Deno.test("variante — la première qui tient gagne; profil inconnu ⇒ réponse par défaut", () => {
  const block = (viewer: Parameters<typeof appHelpContextBlock>[0]["viewer"]) =>
    appHelpContextBlock({ topics: ["meal_photo_how"], locale: "fr", viewer, cards: CARDS })!;
  assert(block({ role: "solo", goal: "fat_loss" }).includes("Variante objectif."));
  assert(block({ role: "member", goal: "maintenance" }).includes("Variante membre."));
  assert(block({ role: "solo", goal: "maintenance" }).includes("Réponse générale"));
  // ⚠️ UN PROFIL NON LU NE TOMBE DANS AUCUNE VARIANTE DE RÔLE.
  assert(block(UNKNOWN_APP_HELP_VIEWER).includes("Réponse générale"));
  assert(block({ role: null, goal: null }).includes("N'existe pas : le scan"));
});

Deno.test("unknown_feature — la liste de ce qui existe vient des TITRES des autres fiches", () => {
  const block = appHelpContextBlock({
    topics: ["unknown_feature"],
    locale: "fr",
    viewer: UNKNOWN_APP_HELP_VIEWER,
    cards: CARDS,
  })!;
  assert(block.includes("  · Envoyer une photo"));
  assert(block.includes("  · La liste de courses"));
  assert(!block.includes("  · Ce qui n'existe pas"));
  assert(block.includes("sans promettre que ça viendra"));
});

Deno.test("pas de bloc au-dessus du vide", () => {
  assertEquals(
    appHelpContextBlock({ topics: [], locale: "fr", viewer: UNKNOWN_APP_HELP_VIEWER, cards: CARDS }),
    null,
  );
  assertEquals(
    appHelpContextBlock({
      topics: ["price_trial"],
      locale: "fr",
      viewer: UNKNOWN_APP_HELP_VIEWER,
      cards: CARDS,
    }),
    null,
  );
});

Deno.test("les lignes du dispatcher suivent APP_HELP_TOPIC_IDS, une par identifiant", () => {
  const lines = appHelpDispatcherLines(CARDS);
  assertEquals(lines.length, APP_HELP_TOPIC_IDS.length);
  assertEquals(lines[APP_HELP_TOPIC_IDS.indexOf("shopping_list")], "   - shopping_list: ou est la liste de courses");
});

// ── LA LECTURE ────────────────────────────────────────────────────────────────

type Answer = { data?: unknown; error?: unknown; count?: number | null };

function fakeClient(tables: Record<string, Answer | ((filters: Record<string, unknown>) => Answer)>) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const resolve = () => {
        const entry = tables[table];
        const answer = typeof entry === "function" ? entry(filters) : entry ?? {};
        return { data: answer.data ?? null, error: answer.error ?? null, count: answer.count ?? null };
      };
      const query: any = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return query;
        },
        maybeSingle: async () => resolve(),
        then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(resolve()).then(onFulfilled),
      };
      return query;
    },
  };
}

Deno.test("loadAppHelpViewer — sans ligne de foyer: solo; objectif lu", async () => {
  const got = await loadAppHelpViewer(
    fakeClient({
      household_members: { data: null },
      student_goals: { data: { goal: "fat_loss" } },
    }),
    "u1",
  );
  assertEquals(got, { viewer: { role: "solo", goal: "fat_loss" }, read: "ok" });
});

Deno.test("loadAppHelpViewer — titulaire seul à table: solo; titulaire d'un foyer: owner", async () => {
  const withMouths = (count: number) =>
    fakeClient({
      household_members: (filters) =>
        "household_id" in filters
          ? { count }
          : { data: { role: "owner", household_id: "h1" } },
      student_goals: { data: { goal: "maintenance" } },
    });
  assertEquals((await loadAppHelpViewer(withMouths(1), "u1")).viewer.role, "solo");
  assertEquals((await loadAppHelpViewer(withMouths(3), "u1")).viewer.role, "owner");
});

Deno.test("loadAppHelpViewer — membre; objectif hors vocabulaire ⇒ null", async () => {
  const got = await loadAppHelpViewer(
    fakeClient({
      household_members: { data: { role: "member", household_id: "h1" } },
      student_goals: { data: { goal: "get_shredded" } },
    }),
    "u2",
  );
  assertEquals(got, { viewer: { role: "member", goal: null }, read: "ok" });
});

Deno.test("loadAppHelpViewer — une lecture en panne rend un rôle INCONNU, jamais solo", async () => {
  const got = await loadAppHelpViewer(
    fakeClient({
      household_members: { error: { message: "boom" } },
      student_goals: { data: { goal: "muscle_gain" } },
    }),
    "u3",
  );
  assertEquals(got.viewer.role, null);
  assertEquals(got.viewer.goal, "muscle_gain");
  assertEquals(got.read, "failed");
  assertEquals((await loadAppHelpViewer(null, "u3")).read, "failed");
});
