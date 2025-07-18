import * as ay from "@alloy-js/core";

import {
  getParameterVisibilityFilter,
  getReturnTypeVisibilityFilter,
  isVisible,
  Model,
  ModelProperty,
  Operation,
  Program,
  Tuple,
  Type,
  Union,
  UnionVariant,
  VisibilityFilter,
} from "@typespec/compiler";
import {
  unsafe_mutateSubgraph as mutateSubgraph,
  unsafe_Mutator as Mutator,
  unsafe_MutatorFlow as MutatorFlow,
} from "@typespec/compiler/experimental";
import { $ } from "@typespec/compiler/typekit";
import { useStateMap } from "@typespec/compiler/utils";
import {
  createMetadataInfo,
  getHttpOperation,
  getVisibilitySuffix,
  HttpVisibilityProvider,
  isApplicableMetadataOrBody,
  MetadataInfo,
  resolveRequestVisibility,
  Visibility,
} from "@typespec/http";
import { createStateSymbol } from "../../lib.js";
import { useEmitContext } from "../../components/JsServerOutput.jsx";
import { useEncodingChain } from "../../util/encoding.js";
import { setDecayMetadata } from "../../util/decay.js";

const CANONICAL_VISIBILITY = Visibility.Read;

const [getCachedCanonicalOperation, setCachedCanonicalOperation] = useStateMap<
  Operation,
  Operation
>(createStateSymbol("CanonicalOperationCache"));

interface CanonicalizationContext {
  metadataInfo?: MetadataInfo;
  canonicalizationCache: { [vfKey: string]: Mutator | undefined };
}

const CANONICALIZATION_CONTEXT = ay.createContext<CanonicalizationContext>({
  metadataInfo: undefined,
  canonicalizationCache: {},
});

/**
 * Gets the 'canonicalized' version of an operation.
 *
 * This is the version of the operation that is accurate to `@typespec/http` interpretation of the
 * operation.
 *
 * - Implicit visibility is applied to the parameters and return type according to the HTTP verb.
 * - Properties and scalars that have unrecognized encoding chains are replaced by their lowest recognized
 *   logical type.
 *
 * @param ctx
 * @param operation
 * @returns
 */
export function useCanonicalizedOperation(operation: Operation): Operation {
  const { program } = useEmitContext();

  const canonicalizationCtx = ay.useContext(CANONICALIZATION_CONTEXT)!;

  let canonical = getCachedCanonicalOperation(program, operation);

  if (canonical) return canonical;

  const metadataInfo = (canonicalizationCtx.metadataInfo ??= createMetadataInfo(
    program,
    {
      canonicalVisibility: CANONICAL_VISIBILITY,
    }
  ));

  canonical = _canonicalizeHttpOperation();

  setCachedCanonicalOperation(program, operation, canonical);

  return canonical;

  function _canonicalizeHttpOperation(): Operation {
    const [httpOperation] = getHttpOperation(program, operation);

    const httpVisibilityProvider = HttpVisibilityProvider();

    const parameterVisibilityFilter = getParameterVisibilityFilter(
      program,
      operation,
      httpVisibilityProvider
    );

    const httpParameterVisibility = resolveRequestVisibility(
      program,
      operation,
      httpOperation.verb
    );

    const parameterMutator = bindMutator(
      httpParameterVisibility,
      parameterVisibilityFilter
    );

    const mutatedParameters = cachedMutateSubgraph(
      program,
      parameterMutator,
      operation.parameters
    ).type as Model;

    const returnTypeVisibilityFilter = getReturnTypeVisibilityFilter(
      program,
      operation,
      httpVisibilityProvider
    );

    // For return types, the visibility is always Visibility.Read, but we could have a
    // custom returnTypeVisibilityFilter that is more restrictive. We will always use
    // Visibility.Read as the HTTP visibility for suffixing and metadataInfo tests, but
    // still check visibility based on the configured filter.
    const returnTypeMutator = bindMutator(
      Visibility.Read,
      returnTypeVisibilityFilter
    );

    const mutatedReturnType = isCanonicalizationSubject(operation.returnType)
      ? cachedMutateSubgraph(program, returnTypeMutator, operation.returnType)
          .type
      : operation.returnType;

    const clonedOperation = $(program).type.clone(operation);

    clonedOperation.parameters = mutatedParameters;
    clonedOperation.returnType = mutatedReturnType;

    $(program).type.finishType(clonedOperation);

    return clonedOperation;
  }

  function bindMutator(
    httpVisibility: Visibility,
    visibilityFilter: VisibilityFilter
  ): Mutator {
    const cacheKey =
      String(httpVisibility) +
      "--" +
      VisibilityFilter.toCacheKey(program, visibilityFilter);

    const cached = canonicalizationCtx.canonicalizationCache[cacheKey];

    if (cached) return cached;

    const visibilitySuffix = getVisibilitySuffix(
      httpVisibility,
      CANONICAL_VISIBILITY
    );

    const primaryMutator: Mutator = {
      name: "CanonicalizeHttpOperation",
      Model: {
        filter: () => MutatorFlow.DoNotRecur,
        replace: (model, clone, program, realm) => {
          let modified = false;

          const indexer = model.indexer;

          if (indexer) {
            if ($(realm).array.is(model)) {
              // Array items have a bit of a special visibility concern

              const { type: mutated } = isCanonicalizationSubject(indexer.value)
                ? cachedMutateSubgraph(program, arrayItemMutator, indexer.value)
                : { type: indexer.value };

              clone.indexer = { key: indexer.key, value: mutated };
            } else {
              const { type: mutated } = isCanonicalizationSubject(indexer.value)
                ? cachedMutateSubgraph(program, primaryMutator, indexer.value)
                : { type: indexer.value };

              clone.indexer = { key: indexer.key, value: mutated };
            }

            modified ||= indexer.value !== clone.indexer.value;
          }

          for (const [name, property] of model.properties) {
            if (isVisible(program, property, visibilityFilter)) {
              const mutated = cachedMutateSubgraph(program, mpMutator, property)
                .type as ModelProperty;

              clone.properties.set(name, mutated);

              modified ||= property.type !== mutated.type;
            } else {
              clone.properties.delete(name);
              realm.remove(property);
              modified = true;
            }
          }

          if (clone.name) clone.name = clone.name + visibilitySuffix;

          return modified ? clone : model;
        },
      },
      Union: {
        filter: () => MutatorFlow.DoNotRecur,
        replace: (union, clone, program, realm) => {
          let modified = false;
          for (const [name, variant] of union.variants) {
            const { type: mutated } = isCanonicalizationSubject(variant.type)
              ? cachedMutateSubgraph(program, primaryMutator, variant.type)
              : variant;

            clone.variants.set(
              name,
              $(realm).unionVariant.create({
                name: variant.name,
                type: mutated,
                union: clone,
              })
            );

            modified ||= variant.type !== mutated;
          }

          if (clone.name) clone.name = clone.name + visibilitySuffix;

          return modified ? clone : union;
        },
      },
      ModelProperty: {
        filter: () => MutatorFlow.DoNotRecur,
        replace: (modelProperty, clone, program, realm) => {
          // Passthrough -- but with encoding decay.
          const encoders = useEncodingChain(modelProperty, modelProperty.type);

          if (encoders.canonicalType !== modelProperty.type) {
            clone.type = encoders.canonicalType;

            return clone;
          } else {
            return modelProperty;
          }
        },
      },
      UnionVariant: {
        filter: () => MutatorFlow.DoNotRecur,
        replace: (variant, clone, program, realm) => {
          const { type: mutated } = isCanonicalizationSubject(variant.type)
            ? cachedMutateSubgraph(program, primaryMutator, variant.type)
            : variant;

          clone.type = mutated;

          return mutated !== variant.type ? clone : variant;
        },
      },
      Tuple: {
        filter: () => MutatorFlow.DoNotRecur,
        replace: (tuple, clone, program, realm) => {
          let modified = false;
          clone.values = [...tuple.values];
          for (const [idx, value] of tuple.values.map(
            (v, idx) => [idx, v] as const
          )) {
            const { type: mutated } = isCanonicalizationSubject(value)
              ? cachedMutateSubgraph(program, primaryMutator, value)
              : { type: value };

            clone.values[idx] = mutated;

            modified ||= value !== mutated;
          }

          return modified ? clone : tuple;
        },
      },
      Scalar: {
        filter: () => MutatorFlow.DoNotRecur,
        replace: (scalar, clone, program, realm) => {
          // Passthrough -- but with encoding decay.
          const encoders = useEncodingChain(scalar, scalar);

          return encoders.canonicalType;
        },
      },
    };

    const arrayItemMutator =
      httpVisibility & Visibility.Item
        ? primaryMutator
        : bindMutator(httpVisibility | Visibility.Item, visibilityFilter);

    const mpMutator: Mutator = {
      name: primaryMutator.name + "ModelProperty",
      ModelProperty: {
        filter: () => MutatorFlow.DoNotRecur,
        replace: (modelProperty, clone, program, realm) => {
          let modified = false;
          const { type: originalCanonicalType } = isCanonicalizationSubject(
            modelProperty.type
          )
            ? cachedMutateSubgraph(program, primaryMutator, modelProperty.type)
            : { type: modelProperty.type };

          const encodingChain = useEncodingChain(
            modelProperty,
            originalCanonicalType
          );

          clone.type = encodingChain.canonicalType;

          modified ||= modelProperty.type !== clone.type;

          if (
            metadataInfo.isPayloadProperty(modelProperty, httpVisibility) &&
            !isApplicableMetadataOrBody(
              program,
              modelProperty,
              httpVisibility
            ) &&
            metadataInfo.isOptional(modelProperty, httpVisibility)
          ) {
            clone.optional = true;
            modified ||= !modelProperty.optional;
          }

          return modified ? clone : modelProperty;
        },
      },
    };

    return (canonicalizationCtx.canonicalizationCache[cacheKey] =
      primaryMutator);
  }
}

type CanonicalizationSubject =
  | Model
  | Union
  | ModelProperty
  | UnionVariant
  | Tuple;

function isCanonicalizationSubject(t: Type): t is CanonicalizationSubject {
  return (
    t.kind === "Model" ||
    t.kind === "Union" ||
    t.kind === "ModelProperty" ||
    t.kind === "UnionVariant" ||
    t.kind === "Tuple" ||
    t.kind === "Scalar"
  );
}

const MUTATOR_RESULT = Symbol.for("TypeSpec.HttpServerJs.MutatorResult");

interface MutatorResultCache {
  [MUTATOR_RESULT]: WeakMap<
    CanonicalizationSubject,
    ReturnType<typeof mutateSubgraph>
  >;
}

function cachedMutateSubgraph(
  program: Program,
  mutator: Mutator,
  type: CanonicalizationSubject
): ReturnType<typeof mutateSubgraph> {
  const cache = ((mutator as unknown as MutatorResultCache)[MUTATOR_RESULT] ??=
    new WeakMap());

  let cached = cache.get(type);

  if (cached) return cached;

  cached = mutateSubgraph(program, [mutator], type);

  cache.set(type, cached);

  return cached;
}
