// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

import { useStateMap } from "@typespec/compiler/utils";
import { createStateSymbol } from "../lib.js";
import { ModelProperty, Operation, Program, Type } from "@typespec/compiler";

/**
 * Metadata indicating that an operation or model property has decayed to a base representation.
 */
interface DecayMetadata<
  T extends Operation | ModelProperty = Operation | ModelProperty,
> {
  /**
   * The original type before decay. For an operation, this is the return type of the operation.
   * For a model property, this is the type of the model property.
   */
  original: {
    Operation: Operation["returnType"];
    ModelProperty: ModelProperty["type"];
  }[T["kind"]];
}

const [getDecay, setDecay] = useStateMap<
  Operation | ModelProperty,
  DecayMetadata
>(createStateSymbol("DecayMetadata"));

/**
 * Gets the decay metadata for a given operation or model property.
 *
 * If the decay metadata is set for an operation, it indicates that the _return type_ of the operation_
 * decayed to a base representation.
 *
 * If the decay metadata is set for a model property, it indicates that the _type_ of the model property
 * decayed to a base representation.
 */
export function getDecayMetadata<T extends Operation | ModelProperty>(
  program: Program,
  item: T
): DecayMetadata<T> | undefined {
  return getDecay(program, item) as DecayMetadata<T> | undefined;
}

/**
 * Sets the decay metadata for a given operation or model property.
 *
 * This is used to indicate that the _return type_ of the operation or the _type_ of the model property
 * decayed to a base representation during canonicalization.
 */
export function setDecayMetadata<T extends Operation | ModelProperty>(
  program: Program,
  item: T,
  metadata: DecayMetadata<T>
): void {
  setDecay(program, item, metadata);
}
