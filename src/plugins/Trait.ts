// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

import { Children } from "@alloy-js/core/jsx-runtime";
import { ExprShape } from "./ExprShape.jsx";
import { ExpressionBuilder } from "./ExpressionBuilder.jsx";

/**
 * This is a symbolic type that refers to the type of a Trait implementor.
 *
 * @final
 */
export class Self extends ExprShape {
  // This private symbol just makes this class unique and prevents other ExprShapes from
  #mark: never;
  private constructor() {
    throw new Error(
      "Attempted to instantiate symbolic shape 'Self'. This is not allowed."
    );
    super();
  }
  renderTypeRef(): Children {}
}
Object.freeze(Self);
Object.freeze(Self.prototype);

/**
 * Replaces instances of `Self` in a type with the given arguments.
 *
 * This transform respects variance inversions. If `Self` is used in a covariant position (API output), it will be replaced with `Cov`.
 * If `Self` is used in a contravariant position (API input), it will be replaced with `Cont`.
 */
export type ReplaceSelf<
  In,
  Cov extends ExprShape,
  Cont extends ExprShape = Cov,
> = In extends string | number | bigint | symbol | void | null | undefined
  ? In
  : In extends Self
    ? Cov
    : In extends ExpressionBuilder<infer R>
      ? ExpressionBuilder<R extends Self ? Cov : R>
      : In extends any[]
        ? { [K in keyof In]: ReplaceSelf<In[K], Cov, Cont> }
        : In;

/**
 * The type of a constructor that creates an expression shape.
 */
export type ShapeConstructor<Shape extends ExprShape = ExprShape> = new (
  ...args: any[]
) => Shape;

/**
 * A definition of an implementation of a trait for a specific type.
 */
export type ImplementationDefinition<
  Implementation extends {},
  Shape extends ExprShape,
> = {
  [K in keyof Implementation]: Implementation[K] extends (...args: any[]) => any
    ? (
        this: Shape,
        ...args: ReplaceSelf<Parameters<Implementation[K]>, Shape>
      ) => ReplaceSelf<ReturnType<Implementation[K]>, Shape>
    : ReplaceSelf<Implementation[K], Shape>;
};

/**
 * A resolved trait implementation.
 */
export type TraitImplementation<
  Implementation extends {},
  Constraint extends ExprShape,
  Of extends ExprShape,
> = {
  [K in keyof Implementation]: Implementation[K] extends (...args: any[]) => any
    ? (
        ...args: ReplaceSelf<Parameters<Implementation[K]>, Of, Constraint>
      ) => ReplaceSelf<ReturnType<Implementation[K]>, Constraint, Of>
    : ReplaceSelf<Implementation[K], Constraint, Of>;
};

export class Trait<Impl extends {}, Constraint extends ExprShape = ExprShape> {
  #impls: Map<ShapeConstructor, Impl> = new Map();

  implement<R extends Constraint>(
    shapeClass: ShapeConstructor<R>,
    impl: ImplementationDefinition<Impl, R>
  ): void {
    this.#impls.set(shapeClass, impl as Impl);
  }

  resolveImplementation<T extends Constraint>(
    shape: T
  ): TraitImplementation<Impl, Constraint, T> | undefined {
    let ctor = shape.constructor as ShapeConstructor;

    while (ctor) {
      const impl = this.#impls.get(ctor);

      if (impl) return shallowBind(shape, impl) as any;

      ctor = Object.getPrototypeOf(ctor);
    }

    return undefined;

    function shallowBind(shape: T, impl: Impl): Impl {
      return Object.fromEntries(
        Object.entries(impl).map(([k, v]) => [
          k,
          typeof v === "function" ? v.bind(shape) : v,
        ])
      ) as Impl;
    }
  }
}
