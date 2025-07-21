// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import { ExprShape, TypeShape, TypeShapeClass } from "./ExprShape.jsx";

export type ExpressionBuilder<Shape extends ExprShape = ExprShape> =
  ExpressionBuilderBase<Shape> &
    RemoveNever<{
      // If the method is a function
      [K in Exclude<
        keyof Shape,
        keyof ExpressionBuilderBase
      >]: Shape[K] extends (...args: any[]) => any
        ? // If the method has _no_ parameters, it is not a mixin.
          Shape[K] extends () => any
          ? never
          : // Infer all the things
            Shape[K] extends (
                expr: ExpressionBuilderBase<infer T>,
                ...args: infer Args
              ) => infer Ret
            ? // Only a mixin if we can assign _this_ typed expr to the first param
              Shape extends T
              ? (...args: Args) => Ret
              : never
            : never
        : never;
    }>;
export const ExpressionBuilder = {
  create<Shape extends ExprShape = ExprShape>(
    expr: ay.Children,
    shape: Shape
  ): ExpressionBuilder<Shape> {
    return ExpressionBuilderBase.create<Shape>(
      expr,
      shape
    ) as ExpressionBuilder<Shape>;
  },
};

/**
 * Removes properties from a type that are `never`, used to clean up types that are filtered by conditional types.
 */
export type RemoveNever<T> = {
  [K in keyof T as T[K] extends never ? never : K]: T[K];
};

export class ExpressionBuilderBase<Shape extends ExprShape = ExprShape> {
  #contextBlock: ay.Children[];

  /**
   * Creates a new ExpressionBuilder from a literal expression that is known to be of the given shape.
   *
   * @param expr - The Alloy tree that renders the expression.
   * @param shape - The representation of the expression's type.
   * @returns A new ExpressionBuilder instance with no block context.
   */
  static create<Shape extends ExprShape = ExprShape>(
    expr: ay.Children,
    shape: Shape
  ): ExpressionBuilder<Shape> {
    return new ExpressionBuilderBase<Shape>(
      expr,
      shape,
      []
    ) as ExpressionBuilder<Shape>;
  }

  private constructor(
    public readonly expr: ay.Children,
    public readonly shape: Shape,
    contextBlock: ay.Children[]
  ) {
    this.#contextBlock = contextBlock;

    this.#attachMixins(shape.constructor.prototype);
  }

  #attachMixins(prototype: any) {
    // Walk the inheritance hierarchy of R
    while (prototype && prototype !== ExprShape.prototype) {
      const descriptors = Object.entries(
        Object.getOwnPropertyDescriptors(prototype)
      );

      const applicableDescriptors = descriptors.filter(([key, descriptor]) => {
        if (key === "constructor" || !!(this as any)[key]) {
          return false;
        }

        return typeof descriptor.value === "function";
      });

      for (const [key, descriptor] of applicableDescriptors) {
        const boundFn = descriptor.value.bind(this.shape);
        (this as any)[key] = (...args: any[]) => boundFn(this, ...args);
      }

      prototype = Object.getPrototypeOf(prototype) as TypeShapeClass;
    }
  }

  #mergeContext(context: ay.Children[]) {
    const breaks = this.#contextBlock.length > 0 ? [<hbr />, <hbr />] : [];

    this.#contextBlock.push(...breaks, ...context);
  }

  downcast<LowerShape extends Shape>(
    shape: LowerShape
  ): ExpressionBuilder<LowerShape> {
    return new ExpressionBuilderBase<LowerShape>(
      ay.code`(${this.expr}) as ${shape.renderTypeRef()}`,
      shape,
      this.#contextBlock
    ) as ExpressionBuilder<LowerShape>;
  }

  /**
   * Injects the context of the given expression into the current context block, returning an ExpressionBuilder with
   * no context.
   *
   * This makes the given expression valid in the context of this expression's block, so that it can be used in an
   * expression in this context.
   *
   * @param expr - The expression to inject into the context block.
   */
  inject<Shape extends ExprShape>(
    expr: ExpressionBuilderBase<Shape>
  ): ExpressionBuilder<Shape> {
    const { expr: next, context } = expr.consume();
    this.#mergeContext(context);

    return ExpressionBuilderBase.create<Shape>(
      next,
      expr.shape
    ) as ExpressionBuilder<Shape>;
  }

  map_into<NextShape extends ExprShape>(
    nextShape: NextShape,
    fn: (expr: ay.Children, shape: Shape) => ay.Children
  ): ExpressionBuilder<NextShape> {
    return new ExpressionBuilderBase<NextShape>(
      fn(this.expr, this.shape),
      nextShape,
      [...this.#contextBlock]
    ) as ExpressionBuilder<NextShape>;
  }

  /**
   * Pushes the current expression into the context block, binding it to a variable with the given name.
   *
   * Sets the expr to the newly-bound variable.
   *
   * @param name - The name to bind the variable to.
   * @param props - Additional properties for the variable declaration.
   * @returns A new ExpressionBuilder with the bound variable.
   */
  bind(
    name: string,
    props: Omit<
      ts.VarDeclarationProps,
      "name" | "type" | keyof ts.BaseDeclarationProps
    > = {}
  ): ExpressionBuilder<Shape> {
    const refkey = ay.refkey();

    this.#mergeContext([
      <>
        <ts.VarDeclaration
          {...props}
          name={name}
          type={this.shape.renderTypeRef()}
          refkey={refkey}
        >
          {this.expr}
        </ts.VarDeclaration>
        ;
      </>,
    ]);

    return new ExpressionBuilderBase<Shape>(
      refkey,
      this.shape,
      this.#contextBlock
    ) as ExpressionBuilder<Shape>;
  }

  /**
   * Converts the current expression into a new ExpressionBuilder with the given shape.
   *
   * This does not change the underlying expression, only transmutes it from one type to another.
   *
   * @param nextShape - The new shape to transmute the expression into.
   * @returns A new ExpressionBuilder instance with the given shape.
   */
  __unsafe_transmute<R extends ExprShape>(nextShape: R): ExpressionBuilder<R> {
    return new ExpressionBuilderBase<R>(this.expr, nextShape, [
      ...this.#contextBlock,
    ]) as ExpressionBuilder<R>;
  }

  /**
   * Consumes the current expression, returning the fragment and the final expression.
   */
  consume(): {
    expr: ay.Children;
    context: ay.Children[];
  } {
    return {
      expr: this.expr,
      context: this.#contextBlock,
    };
  }

  /**
   * Unwraps the expression, returning the Alloy tree that represents it.
   *
   * This method will throw an error if the expression has any context block. To use an expression with context, call
   * `consume()` instead.
   */
  unwrapExpr(): ay.Children {
    if (this.#contextBlock.length > 0) {
      throw new Error("Cannot unwrap expression with context");
    }
    return this.expr;
  }
}

export function Consume(props: {
  expr: ExpressionBuilderBase;
  children: (expr: ay.Children) => ay.Children;
}) {
  const { expr, context } = props.expr.consume();

  return (
    <>
      {context}
      <hbr />
      <hbr />
      {props.children(expr)}
    </>
  );
}
