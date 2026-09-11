// The legal entity behind sophia-coach.ai, in one place.
//
// WHY THIS IS A MODULE AND NOT COPY PASTED INTO THE PAGE. Two different
// audiences read this data and they must never disagree:
//
//  1. A human on /legal — the French `mentions légales`, mandatory under
//     art. 6-III of the LCEN for any site published by a company.
//  2. A MACHINE — the JSON-LD `Organization` block. App Store and Play Store
//     reviewers, and Google, verify a developer account by checking that the
//     domain it declares actually names the same company. A reviewer who sees
//     "IKIZEN SAS" on a D&B record and a bare "sophia-coach.ai" on the site
//     has no way to join the two, and the account stalls.
//
// So the identifiers below are the JOIN KEY between the domain and the
// company registry, and every field has to match the external record it will
// be cross-checked against — the D&B filing, the RCS entry, the VAT register.
// Changing an address here without changing it at D&B breaks the check that
// this file exists to pass.
//
// `phone` is part of that cross-check: the number shown here is the number
// given to Apple, on purpose. If one moves, the other moves the same day.

export const LEGAL_ENTITY = {
  /** The site this entity publishes. No scheme — rendered as text. */
  domain: "sophia-coach.ai",
  siteUrl: "https://sophia-coach.ai",

  /** Registered company name, exactly as filed. */
  legalName: "IKIZEN",
  /** Société par actions simplifiée. Kept in French: it is a form in French law. */
  legalForm: "SAS",
  /**
   * UN NOMBRE, ET PAS « €10 ».
   *
   * La chaîne portait la convention ANGLAISE du montant (symbole devant, pas
   * d'espace), donc la page française affichait « au capital social de €10 ».
   * Un montant est un fait; sa mise en forme est de la langue. `formatPrice`
   * rend « €10 » et « 10 € » à partir de la même valeur — même arbitrage que
   * `keel/i18n/prices.ts` pour les tarifs.
   */
  shareCapitalEur: 10,

  /**
   * RCS registration number (9 digits, also the SIREN). The VAT number below
   * embeds it, which is what makes the two independently checkable.
   */
  rcsNumber: "100 166 917",
  vatNumber: "FR01 100 166 917",

  registeredOffice: {
    street: "9 allée du Point du Jour",
    postalCode: "78120",
    city: "Rambouillet",
    country: "France",
    countryCode: "FR",
  },

  /** Directeur de la publication — a named natural person, as the LCEN requires. */
  publicationDirector: "Thomas Genty",
  /**
   * The director's own address, distinct from support below on purpose: the
   * LCEN wants a way to reach the PERSON responsible for what is published,
   * and `sophia@` is a shared support alias that answers as the company.
   */
  publicationDirectorEmail: "thomas@sophia-coach.ai",

  /**
   * Support / GDPR contact. Already used site-wide (public footer, the
   * "exercise your rights" block), so it stays the address on the outside of
   * the product — changing it here would silently change it in four places.
   */
  contactEmail: "sophia@sophia-coach.ai",
  /** Display form. */
  phone: "+33 6 74 63 72 78",
  /** E.164, for `tel:` links and for JSON-LD. Same number, no spaces. */
  phoneE164: "+33674637278",

  host: {
    name: "Vercel Inc.",
    street: "440 N Barranca Ave #4133",
    city: "Covina",
    region: "CA",
    postalCode: "91723",
    // ⚠️ PAS DE `country` ICI, ET C'EST LE SEUL CHAMP D'ADRESSE QUI N'Y EST
    // PAS. Le nom d'un pays s'écrit dans la langue de qui lit — la convention
    // postale française veut « États-Unis », pas « United States » — donc il
    // vit dans les DEUX packs, sous `legal.mentions.hosting_body`. C'est là
    // qu'il faut le changer le jour où l'hébergeur déménage.
  },
} as const;

/** One-line postal address, the form a reviewer scans for. */
export function registeredOfficeLine(): string {
  const o = LEGAL_ENTITY.registeredOffice;
  return `${o.street}, ${o.postalCode} ${o.city}, ${o.country}`;
}

/**
 * The `Organization` node published as JSON-LD.
 *
 * `legalName`, `vatID`, `taxID` and `address` are the fields an automated
 * verifier reads; without them the markup says a site exists but not who
 * runs it, which is precisely the gap this whole file closes.
 */
export function organizationStructuredData(): Record<string, unknown> {
  const o = LEGAL_ENTITY.registeredOffice;
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Sophia",
    legalName: `${LEGAL_ENTITY.legalName} ${LEGAL_ENTITY.legalForm}`,
    url: `${LEGAL_ENTITY.siteUrl}/`,
    // ⚠️ `icon-512.png` ET PAS `apple-touch-icon.png`. C'est le logo que Google
    // lit pour son panneau de connaissance, et l'icône iOS n'a que 180px de
    // côté — sous le minimum que la documentation de Google demande à une image
    // de `logo`. Les deux fichiers portent le MÊME dessin, composé par
    // `scripts/brand-icons.mjs`; seule la taille change.
    logo: `${LEGAL_ENTITY.siteUrl}/icon-512.png`,
    email: LEGAL_ENTITY.contactEmail,
    telephone: LEGAL_ENTITY.phoneE164,
    vatID: LEGAL_ENTITY.vatNumber.replace(/\s/g, ""),
    taxID: LEGAL_ENTITY.rcsNumber.replace(/\s/g, ""),
    address: {
      "@type": "PostalAddress",
      streetAddress: o.street,
      postalCode: o.postalCode,
      addressLocality: o.city,
      addressCountry: o.countryCode,
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: LEGAL_ENTITY.contactEmail,
      telephone: LEGAL_ENTITY.phoneE164,
    },
  };
}
