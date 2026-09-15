import { beforeEach, describe, expect, it, vi } from "vitest";

// ===========================================================================
// LOT C · « ALIMENTS REFUSÉS » ÉCRIT UNE PRÉFÉRENCE, PAS UN INTERDIT
//
// ── LE DÉFAUT QUE CE FICHIER GARDE ────────────────────────────────────────
// Le champ « Aliments refusés » de la fiche d'une bouche demandait un DÉGOÛT et
// écrivait dans `household_food_restrictions` — la table des RÈGLES DE MAISON,
// celle dont `household_restriction_lock.ts` censure le « pourquoi » des plats
// (« Sophia ne se cache jamais derrière le parent »). Un goût déclaré par la
// personne elle-même devenait donc une décision domestique qu'il fallait
// cacher, et le plan perdait le droit de dire pourquoi il ne servait pas de
// poisson.
//
// ⚠️ CE TEST SUIT L'ÉCRITURE JUSQU'AU BOUT — du brouillon de la fiche jusqu'aux
// ARGUMENTS de la RPC. Une garde qui s'arrêterait à « la porte est appelée »
// resterait verte sur une porte qui écrit dans la mauvaise clé, avec le mauvais
// sujet, ou sous la mauvaise source: trois façons silencieuses de rendre la
// ligne invisible à la ceinture d'exclusion, qui compare le sujet caractère par
// caractère.
// ===========================================================================

const port = vi.hoisted(() => ({
  rpcs: [] as Array<{ name: string; args: Record<string, unknown> }>,
  reads: [] as Array<{ table: string }>,
  constraints: null as Record<string, unknown> | null,
  hasRow: true,
  reply: { data: { ok: true } as unknown, error: null as unknown },
}));

vi.mock("../../lib/supabase", () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      port.rpcs.push({ name, args });
      return Promise.resolve(port.reply);
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            port.reads.push({ table });
            return Promise.resolve({
              data: port.hasRow
                ? { practical_constraints: port.constraints }
                : null,
              error: null,
            });
          },
        }),
      }),
    }),
  },
}));

import { addWrittenFoodExclusions, loadWrittenDislikes } from "./retainedItems";
import { writtenDislikeWriter } from "./mouthProfile";

const TOM = "11111111-1111-4111-8111-111111111111";
const LEA = "22222222-2222-4222-8222-222222222222";
const OWNER = "33333333-3333-4333-8333-333333333333";

/** Les items tels que la RPC les a reçus, ou `[]` si elle n'a pas été appelée. */
function writtenItems(): Array<Record<string, unknown>> {
  const call = port.rpcs.find((c) => c.name === "keel_write_retained_items");
  if (!call) return [];
  return (call.args.p_items ?? []) as Array<Record<string, unknown>>;
}

beforeEach(() => {
  port.rpcs = [];
  port.reads = [];
  port.constraints = {};
  port.hasRow = true;
  port.reply = { data: { ok: true }, error: null };
});

describe("le champ « Aliments refusés » atteint `retained_items`", () => {
  it("écrit un `food.exclude` sur LA BOUCHE, tapé, durable", async () => {
    await addWrittenFoodExclusions({
      userId: OWNER,
      memberId: TOM,
      foods: ["saumon"],
      todayLocalIso: "2026-09-03",
    });
    const items = writtenItems();
    expect(items).toHaveLength(1);
    // ⚠️ LES QUATRE AXES, UN PAR UN. La nomenclature en compte quatre
    // (`kind`, `scope`, `subject`, `source`) et chacun a un lecteur différent:
    // se tromper d'un seul rend la ligne inerte sans erreur nulle part.
    expect(items[0].kind).toBe("food.exclude");
    expect(items[0].scope).toBe("durable");
    expect(items[0].subject).toBe(`member:${TOM}`);
    expect(items[0].source).toBe("written");
    expect(items[0].text).toBe("saumon");
    expect(items[0].at).toBe("2026-09-03");
    // ⛔ `item: ""` — PAS D'IDENTIFIANT DE SOUVENIR. La ligne ne vient pas du
    // memorizer, et lui en attribuer un la rendrait effaçable par une
    // réconciliation qui n'a rien à voir avec elle.
    expect(items[0].item).toBe("");
  });

  it("⛔ ET SUR LA LIGNE DE QUI COMPOSE, pas sur celle de la bouche", () => {
    // La bouche n'a pas forcément de compte — un enfant de huit ans n'en a pas.
    // Le magasin vit donc sur la ligne de la personne qui compose, et c'est le
    // `subject` qui dit de qui on parle. Écrire « chez Tom » n'aurait nulle
    // part où écrire dans le cas le plus courant du produit.
    expect(port.reads.every((r) => r.table === "student_goals")).toBe(true);
  });

  it("un aliment DÉJÀ exclu pour cette bouche n'est pas réécrit", async () => {
    port.constraints = {
      retained_items: [{
        kind: "food.exclude",
        scope: "durable",
        subject: `member:${TOM}`,
        source: "written",
        text: "Saumon",
        at: "2026-08-01",
        item: "",
        confidence: null,
        quote: null,
      }],
    };
    await addWrittenFoodExclusions({
      userId: OWNER,
      memberId: TOM,
      // ⚠️ CASSE ET ESPACES DIFFÉRENTS: c'est la normalisation qu'on mesure.
      foods: ["  saumon  "],
      todayLocalIso: "2026-09-03",
    });
    // ⛔ AUCUNE ÉCRITURE DU TOUT, et c'est plus fort qu'« une seule ligne »:
    // réécrire la colonne à l'identique ferait bouger la ligne de la personne
    // sur un geste qui n'ajoute rien, et perdrait la course avec un autre
    // onglet pour rien.
    expect(port.rpcs).toHaveLength(0);
  });

  it("…mais le MÊME aliment sur une AUTRE bouche est une autre ligne", async () => {
    // Sans ce cas, la garde du dessus serait verte sur un dédoublonnage qui
    // ignore le sujet — c'est-à-dire sur un produit où interdire le saumon à
    // Tom l'interdirait à Léa, en silence.
    port.constraints = {
      retained_items: [{
        kind: "food.exclude",
        scope: "durable",
        subject: `member:${TOM}`,
        source: "written",
        text: "saumon",
        at: "2026-08-01",
        item: "",
        confidence: null,
        quote: null,
      }],
    };
    await addWrittenFoodExclusions({
      userId: OWNER,
      memberId: LEA,
      foods: ["saumon"],
      todayLocalIso: "2026-09-03",
    });
    const items = writtenItems();
    expect(items).toHaveLength(2);
    expect(items[1].subject).toBe(`member:${LEA}`);
  });

  it("plusieurs aliments partent en UNE écriture", async () => {
    // ⚠️ LA RPC EST UNE LECTURE-MODIFICATION-ÉCRITURE AVEC `expected`: une
    // écriture par mot ferait que la seconde se présente avec l'attente de la
    // première, et se ferait refuser `stale_snapshot` sur son propre geste.
    await addWrittenFoodExclusions({
      userId: OWNER,
      memberId: TOM,
      foods: ["saumon", "fenouil", "saumon"],
      todayLocalIso: "2026-09-03",
    });
    expect(port.rpcs).toHaveLength(1);
    const items = writtenItems();
    expect(items.map((i) => i.text)).toEqual(["saumon", "fenouil"]);
  });

  it("ce qui vit déjà dans la colonne n'est pas emporté", async () => {
    // La RPC est CIBLÉE: elle ne touche que les clés nommées. Le test le vérifie
    // du côté de l'appelant — c'est ici qu'on choisit quoi lui donner.
    port.constraints = {
      cooking_time_min: 45,
      retained_items: [],
      retained_next_plan: [],
    };
    await addWrittenFoodExclusions({
      userId: OWNER,
      memberId: TOM,
      foods: ["saumon"],
      todayLocalIso: "2026-09-03",
    });
    const args = port.rpcs[0].args;
    // ⛔ `p_notes` NON TOUCHÉ: le magasin plat est une archive gelée depuis ce
    // lot. Un couple `notes`/`expected_notes` envoyé pour rien le réécrirait.
    expect(args.p_notes).toBeNull();
    expect(args.p_origins).toBeNull();
    // Et le témoin de concurrence porte bien ce qu'on a lu.
    expect(args.p_expected).toEqual([]);
  });

  it("une bouche sans `student_goals` LÈVE, elle ne se tait pas", async () => {
    port.hasRow = false;
    await expect(
      addWrittenFoodExclusions({
        userId: OWNER,
        memberId: TOM,
        foods: ["saumon"],
        todayLocalIso: "2026-09-03",
      }),
    ).rejects.toThrow(/student_goals/);
  });

  it("un `memberId` difforme LÈVE, il n'écrit pas un sujet invisible", async () => {
    // La ceinture compare le sujet caractère par caractère: un sujet difforme
    // produit une ligne que RIEN ne lit, et qui a pourtant l'air enregistrée.
    await expect(
      addWrittenFoodExclusions({
        userId: OWNER,
        memberId: "pas-un-uuid",
        foods: ["saumon"],
        todayLocalIso: "2026-09-03",
      }),
    ).rejects.toThrow(/uuid/);
  });
});

describe("l'adaptateur de la fiche traduit le refus, il ne le perd pas", () => {
  it("un refus nommé de la RPC ressort sous son nom", async () => {
    port.reply = { data: { ok: false, reason: "stale_snapshot" }, error: null };
    const res = await writtenDislikeWriter(OWNER, "2026-09-03")(TOM, ["saumon"]);
    expect(res.ok).toBe(false);
    // ⛔ PAS « ça n'a pas marché ». « Ta carte a bougé pendant que tu écrivais »
    // et « le réseau est tombé » demandent deux gestes différents.
    expect(res.reason).toBe("stale_snapshot");
  });

  it("le cas qui passe rend `ok`", async () => {
    const res = await writtenDislikeWriter(OWNER, "2026-09-03")(TOM, ["saumon"]);
    expect(res).toEqual({ ok: true, reason: "" });
  });
});

describe("la relecture rend les dégoûts par bouche", () => {
  it("groupe par `member_id` et ignore le sujet `household`", async () => {
    port.constraints = {
      retained_items: [
        {
          kind: "food.exclude",
          scope: "durable",
          subject: `member:${TOM}`,
          source: "written",
          text: "saumon",
          at: "2026-08-01",
          item: "",
          confidence: null,
          quote: null,
        },
        {
          kind: "food.exclude",
          scope: "durable",
          subject: `member:${TOM}`,
          // ⚠️ UNE AUTRE SOURCE, ET ELLE COMPTE AUSSI. Un aliment exclu par un
          // bilan de fin de plan est exclu; ne rendre que le `written` ferait
          // réapparaître dans le champ un aliment déjà exclu, et la personne
          // l'écrirait une seconde fois pour rien.
          source: "questionnaire",
          text: "fenouil",
          at: "2026-08-20",
          item: "",
          confidence: null,
          quote: "les recettes du plan : plus jamais",
        },
        {
          kind: "food.exclude",
          scope: "durable",
          subject: "household",
          source: "written",
          text: "abats",
          at: "2026-08-01",
          item: "",
          confidence: null,
          quote: null,
        },
        {
          kind: "food.prefer",
          scope: "durable",
          subject: `member:${TOM}`,
          source: "written",
          text: "poulet",
          at: "2026-08-01",
          item: "",
          confidence: null,
          quote: null,
        },
      ],
    };
    const out = await loadWrittenDislikes(OWNER);
    expect(out.get(TOM)).toEqual(["saumon", "fenouil"]);
    // ⛔ LA LIGNE DE TOUTE LA TABLE N'EST PAS SEMÉE DANS LA FICHE DE CHACUN:
    // elle ferait croire que tout le monde l'a dite, et le premier
    // « Enregistrer » la recopierait sur une bouche qui n'a rien demandé.
    expect([...out.keys()]).toEqual([TOM]);
  });
});
