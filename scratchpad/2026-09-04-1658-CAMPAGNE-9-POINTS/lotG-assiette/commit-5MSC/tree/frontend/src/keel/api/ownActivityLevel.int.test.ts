import { beforeEach, expect, it, vi } from "vitest";

/**
 * L0 — L'ÉCRIVAIN DU NIVEAU D'ACTIVITÉ, ET RIEN NE LE GARDAIT.
 *
 * ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
 *
 * Le lot L0 existe pour fermer un LECTEUR SANS ÉCRIVAIN: la colonne
 * `profiles.activity_level` et son facteur (`ACTIVITY_FACTORS`, 1,45 → 2,00,
 * soit 38 % d'enveloppe) étaient posés, et aucun écran ne les écrivait.
 *
 * La vérification du 2026-08-18 a mesuré que le lot reproduisait le défaut
 * d'un cran plus haut. En retirant la ligne
 *
 *     if (args.activityLevel !== null) patch.activity_level = args.activityLevel;
 *
 * de `saveOwnProfile`, **`tsc` restait à 0 et les 76 tests restaient verts**.
 * Six tests neufs gardaient la table du moteur, le catalogue de l'entonnoir et
 * le refus de bloquer — aucun ne touchait l'écriture. Le champ traversait tout
 * le formulaire, le type était honoré partout, et la colonne serait restée
 * `null` pour tout le monde: c'est-à-dire exactement l'état d'avant le lot,
 * sous l'apparence d'un lot livré.
 *
 * ── LA FORME DU MOCK EST LA MOITIÉ DU TEST ────────────────────────────────
 *
 * Repris de `ownBirthDate.int.test.ts`, et pour la même raison qui y est
 * écrite: le faux PostgREST n'accepte QUE `from().update().eq().select()`. Un
 * mock permissif rendrait le même vert à une écriture qui aurait perdu son
 * `.eq()` — c'est-à-dire à une écriture sur tous les profils.
 *
 * ── LE CAS QUI PASSE COMPTE AUTANT QUE LES AUTRES ─────────────────────────
 *
 * `null` veut dire « personne n'a coché », et la colonne n'a **pas de défaut**
 * en base précisément pour que la non-réponse reste une non-réponse. Le cas 2
 * prouve donc qu'on n'écrit PAS `null` par-dessus une réponse — une garde qui
 * écrirait toujours la clé serait aussi fausse que celle qui ne l'écrit
 * jamais, et elle aurait l'air de marcher.
 */

/** Ce que le faux PostgREST a reçu. Vidé avant chaque cas. */
let writes: Array<{
  table: string;
  patch: Record<string, unknown>;
  column: string;
  value: string;
}> = [];

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: (column: string, value: string) => ({
          select: async () => {
            writes.push({ table, patch, column, value });
            return { data: [{ id: value }], error: null };
          },
        }),
      }),
    }),
    rpc: async () => {
      throw new Error("mock: saveOwnProfile ne doit PAS passer par une RPC");
    },
  },
}));

const { saveOwnProfile } = await import("./onboarding");

const ME = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  writes = [];
});

it("le cran coché arrive dans le patch envoyé à profiles", async () => {
  await saveOwnProfile({
    userId: ME,
    firstName: "Ada",
    heightCm: 170,
    gender: "female",
    activityLevel: "trains_hard",
  });

  expect(writes).toHaveLength(1);
  expect(writes[0].table).toBe("profiles");
  expect(writes[0].column).toBe("id");
  expect(writes[0].value).toBe(ME);
  // LE CŒUR: sans cette ligne, la colonne reste `null` pour tout le monde et
  // le moteur sert 1,5 à quelqu'un qui s'entraîne quatre fois par semaine.
  expect(writes[0].patch.activity_level).toBe("trains_hard");
});

it("les quatre crans traversent, aucun n'est traduit en route", async () => {
  for (const level of ["sedentary", "on_feet", "trains_some", "trains_hard"] as const) {
    writes = [];
    await saveOwnProfile({
      userId: ME,
      firstName: "Ada",
      heightCm: 170,
      gender: "female",
      activityLevel: level,
    });
    expect(writes[0].patch.activity_level).toBe(level);
  }
});

it("`null` n'écrit PAS la clé — une non-réponse n'écrase pas une réponse", async () => {
  await saveOwnProfile({
    userId: ME,
    firstName: "Ada",
    heightCm: 170,
    gender: "female",
    activityLevel: null,
  });

  expect(writes).toHaveLength(1);
  expect("activity_level" in writes[0].patch).toBe(false);
  // Et le reste du patch part quand même: la garde ne doit pas emporter
  // l'écriture qu'elle accompagne.
  expect(writes[0].patch.height_cm).toBe(170);
  expect(writes[0].patch.gender).toBe("female");
});

it("une écriture partie nulle part LÈVE, elle ne rend pas un succès muet", async () => {
  // La cicatrice `RLS ne remplace pas un .eq(user_id)`: PostgREST rend 204 sur
  // un update qui touche zéro ligne, et l'écran dirait « enregistré ».
  const { supabase } = await import("../../lib/supabase");
  const original = supabase.from;
  (supabase as unknown as { from: unknown }).from = () => ({
    update: () => ({
      eq: () => ({ select: async () => ({ data: [], error: null }) }),
    }),
  });

  await expect(
    saveOwnProfile({
      userId: ME,
      firstName: "Ada",
      heightCm: 170,
      gender: "female",
      activityLevel: "sedentary",
    }),
  ).rejects.toThrow(/nothing was saved/);

  (supabase as unknown as { from: unknown }).from = original;
});
