import type { Relation } from "./types.js";

export interface RelationDefinition {
  description: string;
  walkable: boolean;
  externalTargetAllowed: boolean;
}

/** Closed, versioned relation ontology. Values preserve the v1 graph schema. */
export const GRAPH_ONTOLOGY_VERSION = 1;
export const RELATION_ONTOLOGY: Readonly<Record<Relation, RelationDefinition>> = Object.freeze({
  contains: {
    description: "structural ownership (file→symbol or type→member)",
    walkable: false,
    externalTargetAllowed: false,
  },
  calls: {
    description: "callable invocation",
    walkable: true,
    externalTargetAllowed: false,
  },
  imports: {
    description: "module import dependency",
    walkable: true,
    externalTargetAllowed: true,
  },
  references: {
    description: "non-call symbol reference",
    walkable: true,
    externalTargetAllowed: true,
  },
  implements: {
    description: "implementation of an interface/protocol",
    walkable: true,
    externalTargetAllowed: true,
  },
  extends: {
    description: "inheritance from a base type",
    walkable: true,
    externalTargetAllowed: true,
  },
});

export const RELATIONS: ReadonlySet<Relation> = new Set(
  Object.keys(RELATION_ONTOLOGY) as Relation[],
);
export const WALKABLE_RELATIONS: ReadonlySet<Relation> = new Set(
  (Object.entries(RELATION_ONTOLOGY) as Array<[Relation, RelationDefinition]>)
    .filter(([, value]) => value.walkable)
    .map(([relation]) => relation),
);
export const EXTERNAL_TARGET_RELATIONS: ReadonlySet<Relation> = new Set(
  (Object.entries(RELATION_ONTOLOGY) as Array<[Relation, RelationDefinition]>)
    .filter(([, value]) => value.externalTargetAllowed)
    .map(([relation]) => relation),
);