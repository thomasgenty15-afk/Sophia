import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { linkMemoryItemToAction } from "./link_action.ts";
import { linkMemoryItemToEntities } from "./link_entity.ts";
import { linkMemoryItemToTopic } from "./link_topic.ts";
import type { ValidatedMemoryItem } from "./types.ts";

const item: ValidatedMemoryItem = {
  kind: "action_observation",
  content_text: "J'ai pas fait ma marche hier soir.",
  normalized_summary: "marche ratee",
  domain_keys: ["habitudes.execution"],
  confidence: 0.8,
  sensitivity_level: "normal",
  source_message_ids: ["m1"],
  canonical_key: "habitudes.execution.action_observation.marche",
  topic_hint: "marche soir",
  entity_mentions: ["papa"],
  metadata: { observation_role: "single" },
};

Deno.test("linkers resolve topic/entity/action without LLM UUID invention", () => {
  assertEquals(
    linkMemoryItemToTopic({
      item,
      known_topics: [{
        id: "t1",
        slug: "marche_soir",
        title: "Marche du soir",
      }],
    }).topic_slug,
    "marche_soir",
  );
  assertEquals(
    linkMemoryItemToEntities({
      item,
      resolved_entities: [{
        extracted: {
          entity_type: "person",
          display_name: "papa",
          aliases: ["papa"],
          confidence: 0.8,
        },
        decision: "reuse",
        entity_id: "e1",
        normalized_key: "papa",
        aliases: ["papa"],
        reason: "exact",
      }],
    })[0].entity_id,
    "e1",
  );
  const action = linkMemoryItemToAction({
    item,
    plan_signals: [{
      plan_item_id: "plan-walk",
      title: "marche",
      occurrence_ids: ["occ-1"],
    }],
  });
  assertEquals(action?.plan_item_id, "plan-walk");
  assertEquals(action?.occurrence_ids, ["occ-1"]);
});

Deno.test("action linker uses action family and refuses ambiguous fallback", () => {
  const linked = linkMemoryItemToAction({
    item: {
      ...item,
      content_text: "J'ai fait mes pompes ce matin mais la derniere serie etait dure.",
      normalized_summary: "pompes difficiles",
      metadata: { observation_role: "single_occurrence" },
    },
    plan_signals: [
      {
        plan_item_id: "plan-pushups-w2",
        title: "Faire 12 pompes",
        action_family_key: "habit:pompes",
        aliases: ["pompes"],
        occurrence_ids: ["entry-1"],
      },
      {
        plan_item_id: "plan-stretch",
        title: "Etirements 8 minutes",
        action_family_key: "habit:etirements",
      },
    ],
  });
  assertEquals(linked?.plan_item_id, "plan-pushups-w2");
  assertEquals(linked?.action_family_key, "habit:pompes");
  assertEquals(linked?.metadata?.action_family_key, "habit:pompes");

  const ambiguous = linkMemoryItemToAction({
    item: {
      ...item,
      content_text: "J'ai rate mon action ce matin.",
      normalized_summary: "action ratee",
      metadata: { observation_role: "single_occurrence" },
    },
    plan_signals: [
      { plan_item_id: "plan-a", title: "Pompes" },
      { plan_item_id: "plan-b", title: "Etirements" },
    ],
  });
  assertEquals(ambiguous, null);
});

Deno.test("action linker can attach explicit task statements to active actions", () => {
  const linked = linkMemoryItemToAction({
    item: {
      ...item,
      kind: "statement",
      content_text:
        "L'utilisateur bloque sur la premiere phrase pour ses messages de relance, comme pour Clara.",
      normalized_summary: "blocage premiere phrase relance Clara",
      metadata: { statement_role: "instruction" },
    },
    plan_signals: [
      {
        plan_item_id: "plan-clara",
        title: "Envoyer un message a Clara",
        action_family_key: "task:message_clara",
        aliases: ["message clara", "relance clara"],
      },
      {
        plan_item_id: "plan-pushups",
        title: "Faire 12 pompes",
        action_family_key: "habit:pompes",
        aliases: ["pompes"],
      },
    ],
  });
  assertEquals(linked?.plan_item_id, "plan-clara");
  assertEquals(linked?.action_family_key, "task:message_clara");
});

Deno.test("topic linker prefers semantic match over sticky active topic", () => {
  const decision = linkMemoryItemToTopic({
    item: {
      ...item,
      topic_hint: null,
      content_text:
        "Ma mere critique souvent ma discipline et ca active beaucoup de doute.",
      normalized_summary: "critique familiale",
      domain_keys: ["relations.famille", "psychologie.estime_de_soi"],
      entity_mentions: ["mere"],
    },
    active_topic: {
      id: "t1",
      slug: "projet_sophia",
      title: "Projet Sophia",
      search_doc: "Sophia app coaching WhatsApp memoire",
    },
    known_topics: [
      {
        id: "t1",
        slug: "projet_sophia",
        title: "Projet Sophia",
        search_doc: "Sophia app coaching WhatsApp memoire",
      },
      {
        id: "t2",
        slug: "relations_famille",
        title: "Relations famille",
        search_doc: "mere famille soeur critique doute discipline",
      },
    ],
  });

  assertEquals(decision.topic_slug, "relations_famille");
  assertEquals(decision.reason, "entity_topic_match");
});

Deno.test("topic linker uses domain keys for durable topic routing", () => {
  const topics = [
    {
      id: "t1",
      slug: "projet_sophia",
      title: "Projet Sophia",
      search_doc: "Sophia app coaching WhatsApp memoire",
      domain_keys: ["travail.carriere", "travail.performance"],
    },
    {
      id: "t2",
      slug: "routine_execution",
      title: "Routine et execution",
      search_doc: "routine marche procrastination fatigue",
      domain_keys: [
        "habitudes.execution",
        "habitudes.procrastination",
        "habitudes.planification",
        "psychologie.motivation",
        "psychologie.emotions",
        "sante.activite_physique",
      ],
    },
    {
      id: "t3",
      slug: "relations_travail_famille",
      title: "Relations travail et famille",
      search_doc: "manager Karim mere soeur Tania",
      domain_keys: [
        "relations.famille",
        "relations.couple",
        "travail.conflits",
        "psychologie.emotions",
        "psychologie.discipline",
        "habitudes.reprise_apres_echec",
      ],
    },
    {
      id: "t4",
      slug: "sensible_cannabis",
      title: "Sujets sensibles",
      search_doc: "cannabis sensible",
      domain_keys: ["addictions.cannabis", "relations.limites", "psychologie.emotions"],
    },
    {
      id: "t5",
      slug: "coaching_preferences",
      title: "Preferences de coaching",
      search_doc: "Sophia ton direct fatigue reponses courtes plan trois etapes",
      domain_keys: [
        "relations.limites",
        "sante.energie",
        "psychologie.motivation",
        "habitudes.execution",
        "habitudes.planification",
      ],
    },
    {
      id: "t6",
      slug: "psychologie_identite",
      title: "Identite emotions et confiance",
      search_doc: "identite emotion nul faible demander aide doute estime peur echec",
      domain_keys: [
        "psychologie.identite",
        "psychologie.estime_de_soi",
        "psychologie.peur_echec",
        "psychologie.emotions",
      ],
    },
  ];

  assertEquals(
    linkMemoryItemToTopic({
      item: {
        ...item,
        topic_hint: null,
        content_text: "Je procrastine quand l'action est floue.",
        domain_keys: ["habitudes.procrastination", "habitudes.execution"],
      },
      known_topics: topics,
    }).topic_slug,
    "routine_execution",
  );
  assertEquals(
    linkMemoryItemToTopic({
      item: {
        ...item,
        topic_hint: null,
        content_text: "Le cannabis ne doit pas ressortir hors contexte.",
        domain_keys: ["addictions.cannabis", "relations.limites"],
      },
      known_topics: topics,
    }).topic_slug,
    "sensible_cannabis",
  );
  assertEquals(
    linkMemoryItemToTopic({
      item: {
        ...item,
        topic_hint: null,
        content_text: "Tania est son ex-partenaire.",
        domain_keys: ["relations.couple"],
        entity_mentions: ["Tania"],
      },
      known_topics: topics,
    }).topic_slug,
    "relations_travail_famille",
  );
  assertEquals(
    linkMemoryItemToTopic({
      item: {
        ...item,
        topic_hint: null,
        content_text: "Il aime les réponses courtes et directes quand il est fatigué.",
        domain_keys: ["sante.energie", "relations.limites"],
        entity_mentions: [],
      },
      known_topics: topics,
      active_topic: topics[0],
    }).topic_slug,
    "coaching_preferences",
  );
  assertEquals(
    linkMemoryItemToTopic({
      item: {
        ...item,
        topic_hint: null,
        content_text: "Dire je suis nul est une emotion du moment, pas son identite.",
        domain_keys: [
          "psychologie.identite",
          "psychologie.emotions",
          "psychologie.estime_de_soi",
        ],
        entity_mentions: [],
      },
      known_topics: topics,
      active_topic: topics[0],
    }).topic_slug,
    "psychologie_identite",
  );
  assertEquals(
    linkMemoryItemToTopic({
      item: {
        ...item,
        topic_hint: null,
        content_text: "Nadia est sa soeur et aide a relativiser en cas de rechute.",
        domain_keys: ["relations.famille", "habitudes.reprise_apres_echec"],
        entity_mentions: [],
      },
      known_topics: topics,
      active_topic: topics[0],
    }).topic_slug,
    "relations_travail_famille",
  );
  assertEquals(
    linkMemoryItemToTopic({
      item: {
        ...item,
        topic_hint: null,
        content_text: "Il a marche 27 minutes apres le diner pour reduire la pression.",
        domain_keys: ["sante.activite_physique", "psychologie.emotions"],
        entity_mentions: [],
      },
      known_topics: topics,
      active_topic: topics[0],
    }).topic_slug,
    "routine_execution",
  );
});

Deno.test("topic linker does not link on generic domain keys alone", () => {
  const topics = [
    {
      id: "t1",
      slug: "apprentissage_japonais",
      title: "Apprentissage du japonais",
      search_doc: "japonais JLPT N5 Mika professeur prononciation Anki flashcards",
      domain_keys: [
        "objectifs.court_terme",
        "habitudes.execution",
        "psychologie.motivation",
      ],
    },
    {
      id: "t2",
      slug: "budget_administratif",
      title: "Budget et administratif",
      search_doc: "budget depenses factures assurance achats impulsifs administratif",
      domain_keys: [
        "objectifs.court_terme",
        "habitudes.planification",
        "psychologie.controle_impulsions",
      ],
    },
  ];

  assertEquals(
    linkMemoryItemToTopic({
      item: {
        ...item,
        topic_hint: null,
        content_text:
          "L'utilisateur souhaite que la photographie reste un loisir creatif et non un projet professionnel.",
        normalized_summary: "photo comme loisir creatif",
        domain_keys: ["objectifs.court_terme"],
        entity_mentions: [],
      },
      known_topics: topics,
    }).topic_id,
    null,
  );

  assertEquals(
    linkMemoryItemToTopic({
      item: {
        ...item,
        topic_hint: null,
        content_text:
          "L'objectif budget est de garder les depenses variables sous 350 euros.",
        normalized_summary: "objectif budget mensuel",
        domain_keys: ["objectifs.court_terme"],
        entity_mentions: [],
      },
      known_topics: topics,
    }).topic_slug,
    "budget_administratif",
  );
  assertEquals(
    linkMemoryItemToTopic({
      item: {
        ...item,
        topic_hint: null,
        content_text: "A oublie de confirmer l'hotel et a du appeler.",
        normalized_summary: "hotel a confirmer",
        domain_keys: ["habitudes.planification"],
        entity_mentions: [],
      },
      known_topics: [{
        id: "t3",
        slug: "voyage_lisbonne",
        title: "Voyage a Lisbonne",
        search_doc: "Lisbonne voyage aeroport train hotel reservation valise budget",
        domain_keys: ["habitudes.planification", "objectifs.court_terme"],
      }],
    }).confidence >= 0.70,
    true,
  );
});
