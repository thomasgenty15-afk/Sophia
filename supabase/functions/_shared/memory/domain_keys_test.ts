import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  DOMAIN_KEYS_V1,
  DOMAIN_KEYS_V1_DATA,
  DOMAIN_KEYS_V1_VERSION,
  DOMAIN_PREFIXES_V1,
  isValidDomainKey,
  isValidDomainPrefix,
} from "./domain_keys.ts";

Deno.test("domain keys v1 exposes the locked registry", () => {
  assertEquals(DOMAIN_KEYS_V1_VERSION, 1);
  assertEquals(DOMAIN_KEYS_V1_DATA.format, "domain.subdomain");
  assertEquals(DOMAIN_KEYS_V1.size, 38);
  assertEquals([...DOMAIN_PREFIXES_V1], [
    "psychologie",
    "relations",
    "addictions",
    "sante",
    "travail",
    "habitudes",
    "objectifs",
  ]);
});

Deno.test("isValidDomainKey accepts known MVP keys", () => {
  assertEquals(isValidDomainKey("psychologie.estime_de_soi"), true);
  assertEquals(isValidDomainKey("addictions.cannabis"), true);
  assertEquals(isValidDomainKey("habitudes.reprise_apres_echec"), true);
});

Deno.test("isValidDomainPrefix accepts only known domain prefixes", () => {
  assertEquals(isValidDomainPrefix("psychologie"), true);
  assertEquals(isValidDomainPrefix("relations"), true);
  assertEquals(isValidDomainPrefix("psychologie.estime_de_soi"), false);
  assertEquals(isValidDomainPrefix("finance"), false);
});

Deno.test("isValidDomainKey rejects invented or malformed keys", () => {
  assertEquals(isValidDomainKey("psychologie"), false);
  assertEquals(isValidDomainKey("psychologie.general"), false);
  assertEquals(isValidDomainKey("unknown.domain"), false);
});

Deno.test("domain keys use domain.subdomain format", () => {
  for (const entry of DOMAIN_KEYS_V1_DATA.keys) {
    assertEquals(/^[a-z]+[a-z_]*\.[a-z]+[a-z_]*$/.test(entry.key), true);
  }
});
