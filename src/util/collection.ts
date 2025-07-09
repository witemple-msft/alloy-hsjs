// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

/**
 * An interface that represents a read-only set of values.
 *
 * This interface is a subset of the standard `Set` functionality, allowing `Map` values to also be provided.
 */
export interface ReadonlySetLike<T> {
  /**
   * Checks if the set contains the specified value.
   * @param value The value to check for existence in the set.
   */
  has(value: T): boolean;

  /**
   * The number of elements in the set.
   */
  size: number;

  /**
   * Despite its name, this method returns an iterable of the values in the set.
   */
  keys(): Iterable<T>;
}
