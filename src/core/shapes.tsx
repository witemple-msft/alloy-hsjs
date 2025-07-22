// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";
import { EXTERNALS } from "../components/JsServerOutput.jsx";
import { ExprShape } from "../plugins/ExprShape.jsx";
import {
  ExpressionBuilder,
  ExpressionBuilderBase,
} from "../plugins/ExpressionBuilder.jsx";

export class PromiseShape<Result extends ExprShape> extends ExprShape {
  constructor(public readonly result: Result) {
    super();
  }

  renderTypeRef(): ay.Children {
    return `Promise<${this.result.renderTypeRef()}>`;
  }

  await(
    expr: ExpressionBuilderBase<PromiseShape<Result>>
  ): ExpressionBuilder<Result> {
    return expr.map_into(this.result, (expr) => ay.code`await ${expr}`);
  }
}

export class ReadableShape<Element extends ExprShape> extends ExprShape {
  constructor(public readonly element: Element) {
    super();
  }

  renderTypeRef(): ay.Children {
    return ay.code`${EXTERNALS["node:stream"].Readable}<${this.element.renderTypeRef()}>`;
  }

  collect(
    expr: ExpressionBuilderBase<ReadableShape<Element>>
  ): ExpressionBuilder<PromiseShape<ArrayShape<Element>>> {
    const vars = {
      result: ay.refkey(),
      resolve: ay.refkey(),
      reject: ay.refkey(),
    };

    return expr.map_into(
      new PromiseShape(new ArrayShape(this.element)),
      (expr) => (
        <ts.NewExpression
          target="globalThis.Promise"
          args={[
            <ts.FunctionExpression
              parameters={[
                { name: "resolve", refkey: vars.resolve },
                { name: "reject", refkey: vars.reject },
              ]}
            >
              <ts.VarDeclaration
                const
                name="result"
                refkey={vars.result}
                type={`Array<${this.element.renderTypeRef()}>`}
              >
                []
              </ts.VarDeclaration>
              ;
              <hbr />
              <hbr />
              {ay.code`
              ${expr}.on("data", (__value) => {
                ${vars.result}.push(__value);
              });

              ${expr}.on("end", () => ${vars.resolve}(${vars.result}));

              ${expr}.on("error", (__err) => ${vars.reject}(__err));
              `}
            </ts.FunctionExpression>,
          ]}
        />
      )
    );
  }
}

export class ArrayShape<Element extends ExprShape> extends ExprShape {
  constructor(public readonly element: Element) {
    super();
  }

  renderTypeRef(): ay.Children {
    return `Array<${this.element.renderTypeRef()}>`;
  }
}

export type BytesShape = typeof BytesShape;
export const BytesShape = (() => {
  class BytesShape extends ExprShape {
    private constructor() {
      super();
    }

    renderTypeRef() {
      return "Uint8Array";
    }

    concat(
      chunks: ExpressionBuilderBase<ArrayShape<BytesShape>>
    ): ExpressionBuilder<BytesShape> {
      return chunks.map_into(
        this,
        (expr) => ay.code`Buffer.concat(${expr})`
      ) as any;
    }

    decode(
      expr: ExpressionBuilderBase<BytesShape>,
      encoding:
        | BufferEncoding
        | ExpressionBuilderBase<BufferEncodingShape> = "utf-8"
    ): ExpressionBuilder<StringShape> {
      const encodingExpr =
        typeof encoding === "string"
          ? BufferEncodingShape.literal(encoding)
          : encoding;

      const unbound = expr.inject(encodingExpr);

      return expr.map_into(StringShape, (expr) => {
        return ay.code`(${expr}).toString(${unbound.unwrapExpr()})`;
      });
    }
  }

  const instance = new (BytesShape as any)();

  return instance as BytesShape;
})();

export class BaseStringShape<V extends string = string> extends ExprShape {
  protected constructor() {
    super();
  }

  renderTypeRef() {
    return "string";
  }

  encode(
    expr: ExpressionBuilderBase<this>,
    encoding:
      | BufferEncoding
      | ExpressionBuilderBase<BufferEncodingShape> = "utf-8"
  ): ExpressionBuilder<BytesShape> {
    const encodingExpr =
      typeof encoding === "string"
        ? BufferEncodingShape.literal(encoding)
        : encoding;

    const unbound = expr.inject(encodingExpr);

    return expr.map_into(BytesShape, (expr) => {
      return ay.code`Buffer.from(${expr}, ${unbound.unwrapExpr()})`;
    });
  }

  literal(value: V): ExpressionBuilder<this> {
    return ExpressionBuilder.create(JSON.stringify(value), this);
  }
}

export type StringShape = typeof StringShape;
export const StringShape = new (BaseStringShape as any)() as BaseStringShape;

export type BufferEncodingShape = typeof BufferEncodingShape;
export const BufferEncodingShape = (() => {
  class BufferEncodingShape extends BaseStringShape<BufferEncoding> {
    protected constructor() {
      super();
    }

    renderTypeRef() {
      return "globalThis.BufferEncoding";
    }
  }

  const instance = new (BufferEncodingShape as any)();

  return instance as BufferEncodingShape;
})();

export class OptionalShape<Shape extends ExprShape> extends ExprShape {
  constructor(public readonly inner: Shape) {
    super();
  }

  renderTypeRef() {
    return `${this.inner.renderTypeRef()} | undefined`;
  }

  assertDefined(expr: ExpressionBuilderBase<this>): ExpressionBuilder<Shape> {
    return expr.map_into(this.inner, (expr) => ay.code`(${expr})!`);
  }

  optionalChain<Output extends ExprShape>(
    expr: ExpressionBuilderBase<this>,
    handler: (expr: ExpressionBuilder<Shape>) => ExpressionBuilder<Output>,
    orElse: ExpressionBuilderBase<Output>
  ): ExpressionBuilder<Output>;
  optionalChain<Output extends ExprShape>(
    expr: ExpressionBuilderBase<this>,
    handler: (expr: ExpressionBuilder<Shape>) => ExpressionBuilder<Output>
  ): ExpressionBuilder<OptionalShape<Output>>;

  optionalChain<Output extends ExprShape>(
    expr: ExpressionBuilderBase<this>,
    handler: (expr: ExpressionBuilder<Shape>) => ExpressionBuilder<Output>,
    orElse?: ExpressionBuilderBase<Output>
  ): ExpressionBuilder<OptionalShape<Output>> | ExpressionBuilder<Output> {
    const opt = expr.map_into(this.inner, (expr) => ay.code`(${expr})?`);

    const out = handler(opt);

    if (orElse) {
      const unbound = out.inject(orElse);

      return out.map_into(orElse.shape, (expr) => {
        return ay.code`(${expr}) ?? ${unbound.unwrapExpr()}`;
      });
    } else {
      return out.__unsafe_transmute(new OptionalShape(out.shape));
    }
  }

  orElse(
    expr: ExpressionBuilderBase<this>,
    else_: ExpressionBuilderBase<Shape>
  ): ExpressionBuilder<Shape> {
    const unbound = expr.inject(else_);

    return expr.map_into(this.inner, (expr) => {
      return ay.code`(${expr}) ?? ${unbound.unwrapExpr()}`;
    });
  }
}

export class ObjectShape extends ExprShape {
  constructor() {
    super();
  }

  renderTypeRef() {
    return "Record<string, any>";
  }

  static fromInitializer(
    initializer: Map<string, ExpressionBuilder>
  ): ExpressionBuilder<ObjectShape> {
    const blank = ExpressionBuilder.create("", new ObjectShape());

    const pairs: [string, ay.Children][] = [];

    for (const [propertyKey, value] of initializer) {
      const unbound = blank.inject(value);

      pairs.push([propertyKey, unbound.unwrapExpr()]);
    }

    return blank.map_into(blank.shape, () => {
      return (
        <ts.ObjectExpression>
          <ay.For each={pairs} comma enderPunctuation>
            {([name, value]) => <ts.ObjectProperty name={name} value={value} />}
          </ay.For>
        </ts.ObjectExpression>
      );
    });
  }
}
