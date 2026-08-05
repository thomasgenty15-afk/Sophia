/**
 * CE QUE LES OCTETS SONT, PAS CE QUE L'APPELANT PRÉTEND.
 *
 * Le contrôle vivait dans `meal-photo-upload-v1/index.ts`, où seul le chemin
 * photo de l'élève pouvait l'atteindre: chaque fonction edge se bundle
 * séparément et `_shared` est la seule racine partageable. La bibliothèque de
 * recettes du coach a besoin EXACTEMENT du même contrôle — un `.exe` renommé
 * `.jpg` ne doit pas plus entrer par la porte du coach que par celle de l'élève.
 *
 * Deux copies de cette règle divergeraient en silence: l'une accepterait un
 * format que l'autre refuse, et personne ne le saurait avant l'incident.
 *
 * PURE MODULE: aucun I/O, aucune horloge, aucun aléatoire.
 */

/** Les mimes acceptés, et leur extension de stockage. */
export const SUPPORTED_IMAGE_MIMES: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Le mime SNIFFÉ, ou `null` quand la charge ne correspond à aucune signature
 * supportée.
 *
 * L'en-tête déclaré par le client est ensuite comparé à ce résultat — un
 * désaccord est un REFUS, pas une correction, parce que le désaccord est
 * lui-même le signal.
 */
export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && PNG.every((b, i) => bytes[i] === b)) {
    return "image/png";
  }
  // RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}
