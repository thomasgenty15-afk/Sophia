import { existsSync, readFileSync } from "node:fs";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import MemberWorkLunchCard, {
  type MemberWorkLunchCardProps,
} from "./MemberWorkLunchCard";
import {
  commitMemberWorkLunch,
  commitWorkLunch,
  readWorkLunchAnswers,
} from "../lib/workLunchCommit";
import { type WorkLunchPerson, workLunchWriteIsNeeded } from "../lib/workLunchForm";
import type { WorkLunch } from "../lib/presenceMarks";
import { PAGE_NAMESPACES } from "../i18n/catalog";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { setChosenUiLocaleForTest } from "../i18n/runtime";

// ===========================================================================
// A6 (P6, 2026-09-03) — LE DÉJEUNER EN SEMAINE, DANS LA FICHE D'UNE BOUCHE
//
// La carte a quitté l'étape 3 de l'entonnoir (`WorkLunchCard`, toutes les
// bouches d'un coup) pour `MemberRow` de `/app/household`, au-dessus de la
// grille que sa réponse pré-remplit. Les DIX cas de `tableStepPlanning.int.test.ts`
// qui tenaient ses trois gardes ont déménagé ici avec elle — ils portent des
// cicatrices mesurées, et un déménagement qui les perdrait perdrait ce qu'ils
// gardent.
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts`. ⚠️ `renderToStaticMarkup` NE JOUE AUCUN EFFET et ne
// clique sur rien: c'est pour ça que la garde d'écriture vit dans un module
// pur (`commitMemberWorkLunch`), mesuré ici sans base.
// ===========================================================================

const HOUSEHOLD_PATH = "/app/household";

const ADULT: WorkLunchPerson = {
  memberId: "m-adult",
  firstName: "Christèle",
  ageState: "adult",
};
const OUTSIDE: WorkLunch = { atWork: true, mode: "outside", microwave: null };
const COLD_BOX: WorkLunch = { atWork: true, mode: "lunchbox", microwave: false };

/** Ce que React échappe dans un texte — pour comparer aux packs. */
function decode(s: string): string {
  return s
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function html(over: Partial<MemberWorkLunchCardProps> = {}): string {
  // `uiLocale()` lit le CHEMIN COURANT — la langue d'une page dépend de la
  // page, pas seulement du visiteur.
  Object.defineProperty(globalThis, "location", {
    value: {
      pathname: HOUSEHOLD_PATH,
      search: "",
      href: `http://localhost${HOUSEHOLD_PATH}`,
    },
    configurable: true,
    writable: true,
  });
  return decode(renderToStaticMarkup(
    createElement(MemberWorkLunchCard, {
      person: ADULT,
      answers: new Map<string, WorkLunch | null>(),
      readError: null,
      busy: false,
      onSave: async () => ({ ok: true, reason: null }),
      ...over,
    }),
  ));
}

/** La question, telle que la carte la NOMME pour cette personne. */
function question(pack: typeof fr | typeof en, name: string): string {
  return pack["setup.work_lunch.at_work"].replace("{name}", name);
}

afterEach(() => setChosenUiLocaleForTest("en"));
afterAll(() => setChosenUiLocaleForTest("en"));

describe("à qui la carte se pose — `age_state` du roster, jamais un `kind`", () => {
  it("un majeur avec une ligne: la carte, et la question qui le NOMME", () => {
    setChosenUiLocaleForTest("fr");
    const out = html({});
    expect(out).toContain(fr["setup.work_lunch.title"]);
    expect(out).toContain(question(fr, "Christèle"));
    expect(out).toContain(fr["setup.work_lunch.yes"]);
    expect(out).toContain(fr["setup.work_lunch.no"]);
  });

  it("un mineur: RIEN, pas même un titre", () => {
    // Un titre suivi du vide se lit comme un écran cassé, et la base refuserait
    // la réponse (`not_adult`).
    expect(html({ person: { ...ADULT, ageState: "minor" } })).toBe("");
  });

  it("⛔ un âge INCONNU n'est pas interrogé: « ne pas savoir » n'est pas « adulte »", () => {
    expect(html({ person: { ...ADULT, ageState: "unknown" } })).toBe("");
  });

  it("sans ligne en base, nulle part où écrire ⇒ rien", () => {
    expect(html({ person: { ...ADULT, memberId: null } })).toBe("");
  });

  it("⛔ la carte ne connaît NI `userId` NI `hasAccount`: compte ou pas, on demande", () => {
    // La porte SQL n'a pas de refus `has_account` — « où quelqu'un déjeune est
    // un FAIT ». Un filtre sur le compte retirerait la question à des gens à
    // qui la base accepte de répondre. Lecture de source, commentaires
    // blanchis: l'en-tête de la carte a le droit d'en parler, pas son code.
    const src = source("./MemberWorkLunchCard.tsx");
    expect(src).not.toContain("userId");
    expect(src).not.toContain("hasAccount");
    expect(src).not.toContain("claimed");
    // Et le filtre est le SEUL qui existe, importé, pas recopié.
    expect(src).toContain("workLunchIsAskable(props.person)");
  });
});

describe("⛔ le premier rendu n'affiche AUCUNE réponse non lue", () => {
  it("`answers === null`: la carte dit qu'elle lit, et ne pose PAS sa question", () => {
    // C'est l'instant que la cicatrice `mount-snapshot-forms-need-a-loading-gate`
    // vise: une question vierge ici, c'est « personne ne mange au bureau »
    // montré à un foyer qui a répondu — et le premier clic l'écrirait.
    setChosenUiLocaleForTest("fr");
    const out = html({ answers: null });
    expect(out).toContain(fr["setup.work_lunch.title"]);
    expect(out).toContain(fr["setup.work_lunch.loading"]);
    expect(out).not.toContain("déjeune au bureau");
    expect(out).not.toContain(fr["setup.work_lunch.yes"]);
  });

  it("une `Map` VIDE lue pour de vrai pose la question — ce n'est pas la même chose", () => {
    // « lu, personne n'a répondu » est une réponse légitime. Sans ce cas, une
    // carte qui se tairait sur toute Map passerait le test au-dessus.
    setChosenUiLocaleForTest("fr");
    const out = html({ answers: new Map() });
    expect(out).not.toContain(fr["setup.work_lunch.loading"]);
    expect(out).toContain(question(fr, "Christèle"));
  });

  it("une lecture RATÉE rend son motif, et ne pose pas la question par-dessus", () => {
    // `saved` serait périmé, donc la garde aussi: on dit le motif, on ne fait
    // pas semblant.
    setChosenUiLocaleForTest("fr");
    const out = html({ answers: new Map(), readError: "réseau tombé" });
    expect(out).toContain("réseau tombé");
    expect(out).not.toContain(question(fr, "Christèle"));
    expect(out).not.toContain(fr["setup.work_lunch.loading"]);
  });
});

describe("ce que la réponse va faire, DIT sur la fiche — et plus « à l'étape suivante »", () => {
  it("« dehors » ⇒ cinq midis annoncés, et la grille juste en dessous gagne", () => {
    setChosenUiLocaleForTest("fr");
    const out = html({ answers: new Map([[ADULT.memberId!, OUTSIDE]]) });
    expect(out).toContain(fr["setup.work_lunch.outside_note"].replace("{n}", "5"));
    expect(out).toContain(fr["setup.work_lunch.grid_wins"]);
    // ⛔ LA COPIE NE PARLE PLUS D'UNE ÉTAPE: la grille est sur le même écran.
    expect(out).not.toContain("étape suivante");
    expect(out).not.toContain("étape");
  });

  it("« gamelle sans micro-ondes » ⇒ bon froid, transportable, et AUCUN midi coché", () => {
    setChosenUiLocaleForTest("fr");
    const out = html({ answers: new Map([[ADULT.memberId!, COLD_BOX]]) });
    expect(out).toContain(fr["setup.work_lunch.cold_note"]);
    expect(out).toContain(fr["setup.work_lunch.lunchbox_note"]);
    // Une gamelle est un repas COMPOSÉ, pas un repas manqué: n = 0, pas de note.
    expect(out).not.toContain("midis de semaine");
  });

  it("en anglais aussi — et « next step » a disparu de la copie", () => {
    setChosenUiLocaleForTest("en");
    const out = html({ answers: new Map([[ADULT.memberId!, OUTSIDE]]) });
    expect(out).toContain(en["setup.work_lunch.title"]);
    expect(out).toContain(question(en, "Christèle"));
    expect(out).toContain(en["setup.work_lunch.outside_note"].replace("{n}", "5"));
    expect(out).toContain(en["setup.work_lunch.grid_wins"]);
    expect(out).not.toContain("next step");
    // Et les packs eux-mêmes, pas seulement le rendu: la phrase de l'étape 4
    // qui disait « l'étape trois disait l'habitude » est réécrite aussi.
    for (const pack of [fr, en]) {
      for (
        const key of [
          "setup.work_lunch.intro",
          "setup.work_lunch.outside_note",
          "setup.work_lunch.grid_wins",
          // ⛔ `setup.request.presence_intro` A ÉTÉ RETIRÉE DE CETTE LISTE —
          // 2026-09-08, parce que LA CLÉ N'EXISTE PLUS. Le bloc « qui est là,
          // jour par jour » de l'entonnoir est supprimé (décision produit): il
          // rendait une ligne par bouche, donc UNE ligne sur un foyer solo,
          // ouvrant la même grille que le lien juste au-dessus. La phrase qui
          // renvoyait à « la page Foyer » n'a plus de porteur.
          //
          // ⚠️ CE QUE CETTE LISTE GARDE EST INTACT: les trois clés de la carte
          // du déjeuner ne doivent toujours nommer aucune ÉTAPE — la question
          // a quitté l'entonnoir pour `/app/household`, et une copie qui
          // dirait encore « à l'étape suivante » enverrait vers un écran que
          // cette personne ne reverra jamais.
        ] as const
      ) {
        expect(pack[key].toLowerCase(), key).not.toMatch(/étape|next step|step three/);
      }
    }
  });

  it("D6.3 — le namespace `setup.work_lunch.*` est GARDÉ, et `/app/household` le déclare", () => {
    // Renommer casserait la parité pour rien. La page qui monte la carte doit
    // déclarer le namespace, sinon `pageSeams` rougit.
    expect(fr["setup.work_lunch.title"]).toBe("Le déjeuner en semaine");
    expect(en["setup.work_lunch.title"]).toBe("Lunch on a working day");
    expect(PAGE_NAMESPACES["/app/household"]).toContain("setup");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// LES DIX CAS DÉMÉNAGÉS DE `tableStepPlanning.int.test.ts:144-277` (L6, 2026-08-18)
// ───────────────────────────────────────────────────────────────────────────

describe("⛔ enregistrer une réponse RELIT ce qui est enregistré", () => {
  it("la relecture a lieu, et AVANT la relecture de la page", async () => {
    // ═══════════════════════════════════════════════════════════════════════
    // C'EST LA GARDE QUI EMPÊCHE LE FORMULAIRE D'EFFACER LA GRILLE.
    //
    // La porte SQL ré-applique son pré-remplissage à CHAQUE écriture, même
    // identique (L3-B): réécrire `{"at_work":true,"mode":"outside"}` REMET les
    // cinq midis « dehors », y compris celui qu'on venait de décocher à la main.
    // La carte s'en garde en comparant à ce qui est ENREGISTRÉ — et
    // « enregistré » ne redevient vrai que si on relit.
    // ═══════════════════════════════════════════════════════════════════════
    const order: string[] = [];
    const save = vi.fn(async () => {
      order.push("save");
      return { ok: true, reason: null };
    });
    const reread = vi.fn(async () => {
      order.push("reread");
    });
    const onSaved = vi.fn(async () => {
      order.push("onSaved");
    });

    const result = await commitWorkLunch({
      memberId: "own",
      answer: OUTSIDE,
      save,
      reread,
      onSaved,
    });

    expect(result).toEqual({ ok: true, reason: null });
    expect(order).toEqual(["save", "reread", "onSaved"]);
  });

  it("un refus ne relit RIEN — le motif reste sous le geste", async () => {
    const reread = vi.fn(async () => {});
    const onSaved = vi.fn(async () => {});
    const result = await commitWorkLunch({
      memberId: "m1",
      answer: OUTSIDE,
      save: async () => ({ ok: false, reason: "not_adult" }),
      reread,
      onSaved,
    });
    expect(result).toEqual({ ok: false, reason: "not_adult" });
    expect(reread).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("la réponse part telle quelle, sans être recomposée en route", async () => {
    const save = vi.fn(async () => ({ ok: true, reason: null }));
    await commitWorkLunch({
      memberId: "own",
      answer: OUTSIDE,
      save,
      reread: async () => {},
      onSaved: () => {},
    });
    expect(save).toHaveBeenCalledWith("own", OUTSIDE);
  });
});

describe("⛔ une lecture RATÉE ne fabrique pas de réponses vides", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // CE BLOC EXISTE PARCE QUE LA MUTATION SURVIVAIT.
  //
  // Le repli était écrit en `catch` dans `TableStepPlanning`, sous un pavé qui
  // l'interdisait — et y remplacer `null` par `new Map()` passait les NEUF
  // tests du fichier sans en faire tomber un: `renderToStaticMarkup` ne joue
  // aucun effet, donc ce `catch` n'était atteignable par aucun test du dépôt.
  // `readWorkLunchAnswers` a été sorti pour ça. Au nouveau site, la page fait
  // exactement la même chose (`HouseholdPage.refreshWorkLunch`), par la même
  // fonction.
  //
  // CE QUE ÇA COÛTE QUAND ÇA CASSE: `null` = « la lecture n'a pas eu lieu »
  // (la carte ne pose aucune question), une `Map` vide = « lu, personne n'a
  // répondu » (la carte pose sa question, vierge). Un réseau qui tombe sur une
  // bouche QUI A RÉPONDU afficherait donc une question vierge, et le premier
  // clic écrirait par-dessus la réponse en croyant la créer — et cette
  // écriture-là ré-applique le pré-remplissage des cinq midis.
  // ═══════════════════════════════════════════════════════════════════════════

  it("elle rend `null`, PAS une `Map` vide", async () => {
    const read = await readWorkLunchAnswers(() => {
      throw new Error("réseau tombé");
    });
    expect(read.answers).toBeNull();
    // Et le motif est là: une erreur avalée serait un « lecture… » éternel.
    expect(read.error).toBe("réseau tombé");
    // ⚠️ ET ON LE DIT UNE SECONDE FOIS, PAR L'AUTRE BOUT. `toBeNull` seul
    // suffit à faire tomber la mutation, mais il ne NOMME pas ce qui est
    // interdit: aucune `Map` — même vide — ne sort d'une lecture ratée.
    expect(read.answers instanceof Map).toBe(false);
  });

  it("un rejet ASYNCHRONE est attrapé aussi, pas seulement un jet immédiat", async () => {
    // `loadWorkLunch` est une fonction `async`: son échec arrive en promesse
    // rejetée, pas en exception synchrone.
    const read = await readWorkLunchAnswers(async () => {
      await Promise.resolve();
      throw new Error("401");
    });
    expect(read.answers).toBeNull();
    expect(read.error).toBe("401");
  });

  it("une lecture RÉUSSIE rend la Map telle quelle, sans motif", async () => {
    // LA GARDE A BESOIN D'UN CAS QUI PASSE: cassée, une fonction qui rendrait
    // `null` à tout le monde ferait passer les deux tests ci-dessus.
    const saved = new Map<string, WorkLunch | null>([["own", OUTSIDE]]);
    const read = await readWorkLunchAnswers(async () => saved);
    expect(read.answers).toBe(saved);
    expect(read.error).toBeNull();
  });

  it("une Map VIDE lue pour de vrai passe telle quelle — ce n'est pas la même chose", async () => {
    const read = await readWorkLunchAnswers(async () =>
      new Map<string, WorkLunch | null>()
    );
    expect(read.answers).toEqual(new Map());
    expect(read.error).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// LA GARDE D'ÉCRITURE, AU NOUVEAU SITE — dans un module pur, mesurable
// ───────────────────────────────────────────────────────────────────────────

describe("⛔ `workLunchWriteIsNeeded` — on n'écrit QUE sur un changement réel", () => {
  it("une réponse identique à l'enregistrée n'a pas lieu d'être écrite", () => {
    // Mesuré par L3-B: réenregistrer `{"at_work":true,"mode":"outside"}` REMET
    // les cinq midis, y compris celui que la grille avait retiré à la main.
    expect(workLunchWriteIsNeeded(OUTSIDE, { ...OUTSIDE })).toBe(false);
    expect(workLunchWriteIsNeeded(null, null)).toBe(false);
  });

  it("chacun des TROIS champs compte — les trois voyagent dans la charge", () => {
    expect(workLunchWriteIsNeeded(OUTSIDE, { ...OUTSIDE, atWork: false })).toBe(true);
    expect(workLunchWriteIsNeeded(OUTSIDE, { ...OUTSIDE, mode: "lunchbox" })).toBe(true);
    expect(workLunchWriteIsNeeded(COLD_BOX, { ...COLD_BOX, microwave: true })).toBe(true);
  });

  it("« jamais demandé » → une réponse, c'est une écriture", () => {
    expect(workLunchWriteIsNeeded(null, OUTSIDE)).toBe(true);
    expect(workLunchWriteIsNeeded(OUTSIDE, null)).toBe(true);
  });
});

describe("⛔ `commitMemberWorkLunch` — la garde est DEVANT le geste, et elle mord", () => {
  it("identique à `saved` ⇒ le geste n'est PAS appelé, et ce n'est pas un échec", async () => {
    const commit = vi.fn(async () => ({ ok: true, reason: null }));
    const res = await commitMemberWorkLunch({
      saved: OUTSIDE,
      next: { ...OUTSIDE },
      commit,
    });
    expect(commit).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true, reason: null, written: false });
  });

  it("différent de `saved` ⇒ le geste part, avec `next` tel quel", async () => {
    // LA GARDE A BESOIN D'UN CAS QUI PASSE.
    const commit = vi.fn(async () => ({ ok: true, reason: null }));
    const res = await commitMemberWorkLunch({ saved: OUTSIDE, next: COLD_BOX, commit });
    expect(commit).toHaveBeenCalledWith(COLD_BOX);
    expect(res).toEqual({ ok: true, reason: null, written: true });
  });

  it("« jamais demandé » ⇒ la première réponse s'écrit", async () => {
    const commit = vi.fn(async () => ({ ok: true, reason: null }));
    const res = await commitMemberWorkLunch({ saved: null, next: OUTSIDE, commit });
    expect(commit).toHaveBeenCalledOnce();
    expect(res.written).toBe(true);
  });

  it("un refus de la base remonte NOMMÉ, et `written` dit que le geste a eu lieu", async () => {
    const res = await commitMemberWorkLunch({
      saved: null,
      next: OUTSIDE,
      commit: async () => ({ ok: false, reason: "not_adult" }),
    });
    expect(res).toEqual({ ok: false, reason: "not_adult", written: true });
  });

  it("⛔ la carte passe par `commitMemberWorkLunch` et ne refait PAS la garde — ni aucun effet", () => {
    // Deux gardes pour une règle, et c'est celle qu'on regarde le moins qui
    // garde l'ancien comportement. Et AUCUN `useEffect`: la porte SQL
    // ré-applique son pré-remplissage à chaque écriture — un effet qui
    // « ré-émettrait pour être sûr » effacerait la correction de la grille.
    const src = source("./MemberWorkLunchCard.tsx");
    expect(src).toContain("commitMemberWorkLunch({");
    expect(src).not.toContain("workLunchWriteIsNeeded");
    expect(src).not.toContain("useEffect");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// LE DÉMÉNAGEMENT EST FAIT, ET IL TIENT — lecture de source, commentaires blanchis
// ───────────────────────────────────────────────────────────────────────────

function source(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

describe("le déménagement (A6): là où la carte est, et là où elle n'est plus", () => {
  it("`MemberRow` la monte AU-DESSUS de la grille de présence, avec `ageState` du roster", () => {
    const src = source("../pages/HouseholdPage.tsx");
    const card = src.indexOf("<MemberWorkLunchCard");
    const grid = src.lastIndexOf("<MealPickerGrid");
    const away = src.indexOf('t("household.away.title")');
    expect(card).toBeGreaterThan(0);
    expect(card).toBeLessThan(away);
    expect(away).toBeLessThan(grid);
    // L'âge vient du roster (`keel_household_member_age`), jamais d'un `kind`.
    expect(src).toContain("ageState: member.ageState");
    expect(src).not.toContain("workLunchRoster");
    expect(src).not.toContain("funnelMouthAgeState");
  });

  it("la page lit par `readWorkLunchAnswers` et écrit par `commitWorkLunch`, jamais à la main", () => {
    const src = source("../pages/HouseholdPage.tsx");
    expect(src).toContain("readWorkLunchAnswers(loadWorkLunch)");
    expect(src).toContain("reread: refreshWorkLunch");
    expect(src).toContain("onSaved: refresh");
    // Le repli d'une lecture ratée reste `null` — pas de `new Map()` posé ici,
    // ni à la lecture, ni au montage: la Map descend ENTIÈRE, `null` compris.
    expect(src).not.toMatch(/setWorkLunch\(new Map|workLunch \?\? new Map/);
    expect(src).toContain("answers={workLunch}");
    expect(src).toContain("workLunch={workLunch}");
  });

  it("l'étape 3 ne la pose plus: `SetupPage` n'en porte plus une trace", () => {
    // ⟳ A5, 2026-09-03 — `TableStepPlanning.tsx` A DISPARU (mandat point 4: les
    // traditions ont rejoint « Paramètres du foyer » sur `/app/household`, et
    // l'équipement se monte directement dans l'étape). La lecture de source qui
    // le visait devient donc la preuve de son ABSENCE, juste en dessous; ce
    // qu'elle gardait ICI — l'étape 3 ne pose plus le déjeuner — reste mesuré
    // sur `SetupPage`, qui est le seul fichier encore debout des deux.
    const setup = source("../pages/SetupPage.tsx");
    expect(setup).not.toContain("workLunchRoster");
    expect(setup).not.toContain("WorkLunchCard");
    expect(setup).not.toContain("people=");
  });

  it("la carte à N personnes et le roster de l'entonnoir n'existent plus", () => {
    expect(existsSync(new URL("./WorkLunchCard.tsx", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../lib/workLunchRoster.ts", import.meta.url))).toBe(false);
    // A5: l'enveloppe de l'étape 3 est partie avec sa seconde carte.
    expect(existsSync(new URL("./TableStepPlanning.tsx", import.meta.url))).toBe(false);
  });
});
