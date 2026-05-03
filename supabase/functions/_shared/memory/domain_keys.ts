import data from "./domain_keys.v1.json" with { type: "json" };

export interface DomainKeyDefinition {
  key: string;
  label: string;
}

export interface DomainKeysRegistry {
  version: number;
  format: "domain.subdomain";
  keys: DomainKeyDefinition[];
}

export const DOMAIN_KEYS_V1_DATA = data as DomainKeysRegistry;
export const DOMAIN_KEYS_V1_VERSION: number = DOMAIN_KEYS_V1_DATA.version;
export const DOMAIN_KEYS_V1_DEFINITIONS: readonly DomainKeyDefinition[] =
  DOMAIN_KEYS_V1_DATA.keys;
export const DOMAIN_KEYS_V1: ReadonlySet<string> = new Set(
  DOMAIN_KEYS_V1_DATA.keys.map((k) => k.key),
);

export function isValidDomainKey(key: string): boolean {
  return DOMAIN_KEYS_V1.has(key);
}
