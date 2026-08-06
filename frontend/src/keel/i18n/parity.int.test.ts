// KEEL — ce que le TYPE ne peut pas dire sur le pack français.
//
// `PublicMessages` garantit déjà qu'aucune clé publique ne manque: `fr.public.ts`
// ne compile pas sans elles. Ces ceintures-ci gardent le reste — et le reste
// est ce qui casse en silence.

import { describe, expect, it } from "vitest";
import { en } from "./en";
import { fr } from "./fr.public";
import {
  isPublicMessageKey,
  PUBLIC_NAMESPACES,
  PUBLIC_NAMESPACES_PENDING_TRANSLATION,
} from "./catalog";

/** `{date}`, `{count}` — les trous que `t()` remplit à l'appel. */
function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe("pack français de la vitrine", () => {
  it("porte exactement les clés publiques, ni plus ni moins", () => {
    // Le type couvre le « ni moins ». Le « ni plus » compte aussi: une clé
    // française orpheline est du travail de traduction payé pour un écran qui
    // ne l'affiche plus, et elle survit aux suppressions sans bruit.
    const frKeys = Object.keys(fr).sort();
    const publicKeys = Object.keys(en).filter(isPublicMessageKey).sort();
    expect(frKeys).toEqual(publicKeys);
  });

  it("garde les MÊMES trous d'interpolation que l'anglais", () => {
    // LA ceinture de plus forte valeur du lot. Si `en` porte `{date}` et que la
    // traduction écrit `{jour}`, le type est content, le test de clés est
    // content, et `t()` lève au rendu — en DEV chez nous si on ouvre la page,
    // sinon chez un visiteur. Rien d'autre ne l'attrape.
    const mismatches: string[] = [];
    for (const key of Object.keys(fr) as Array<keyof typeof fr>) {
      const a = placeholders(en[key]);
      const b = placeholders(fr[key]);
      if (a.join(",") !== b.join(",")) {
        mismatches.push(`${key}: en={${a.join(",")}} fr={${b.join(",")}}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("ne recopie pas l'anglais pour faire verdir la CI", () => {
    // Une valeur identique à l'anglais est presque toujours une clé oubliée.
    // Les exceptions sont réelles mais rares, et chacune est une ligne VISIBLE
    // en diff — c'est tout l'intérêt d'une liste explicite plutôt que d'un
    // seuil de tolérance.
    const legitimatelyIdentical = new Set<string>([
      "brand.wordmark", // un nom de marque
      "public.footer.contact_email", // une adresse
      "public.footer.contact", // « Contact » s'écrit pareil dans les deux langues
      "public.locale.en", // un sélecteur nomme chaque langue DANS sa langue
      "public.locale.fr",
      "public.locale.switch_to_en",
      "public.locale.switch_to_fr",
      "landing.pricing.seat", // un prix est un fait commercial
    ]);
    const copied = (Object.keys(fr) as Array<keyof typeof fr>)
      .filter((key) => !legitimatelyIdentical.has(key))
      .filter((key) => fr[key].trim() === en[key].trim());
    expect(copied).toEqual([]);
  });

  it("n'a ni valeur vide ni espace de bord", () => {
    const bad = (Object.keys(fr) as Array<keyof typeof fr>)
      .filter((key) => fr[key] !== fr[key].trim() || fr[key] === "");
    expect(bad).toEqual([]);
  });

  it("la frontière déclarée est cohérente: aucun namespace des deux côtés", () => {
    // `PUBLIC_NAMESPACES` est la promesse « traduit »; la liste d'attente est la
    // promesse « pas encore ». Un namespace dans les deux serait une frontière
    // qui ment, et c'est exactement ce qu'on refuse de livrer.
    const overlap = PUBLIC_NAMESPACES_PENDING_TRANSLATION
      .filter((ns) => (PUBLIC_NAMESPACES as readonly string[]).includes(ns));
    expect(overlap).toEqual([]);
  });

  it("chaque namespace en attente existe VRAIMENT dans le seed", () => {
    // Sans ça, la liste d'attente vieillit: un namespace renommé ou supprimé y
    // resterait comme une dette qu'on croit avoir, et personne ne le saurait.
    const missing = PUBLIC_NAMESPACES_PENDING_TRANSLATION.filter((ns) =>
      !Object.keys(en).some((key) => key.startsWith(`${ns}.`))
    );
    expect(missing).toEqual([]);
  });
});
