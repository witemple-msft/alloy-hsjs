// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import { HELPERS } from "../../../generated-defs/helpers.jsx";
import { EXTERNALS } from "../../components/JsServerOutput.jsx";
import { ExprShape } from "../../plugins/ExprShape.jsx";
import {
  ExpressionBuilder,
  ExpressionBuilderBase,
} from "../../plugins/ExpressionBuilder.jsx";
import {
  BaseStringShape,
  BufferEncodingShape,
  BytesShape,
  OptionalShape,
  ReadableShape,
  StringShape,
} from "../shapes.jsx";

/**
 * The representation of an HTTP Request (e.g. `IncomingMessage`).
 */
export type RequestShape = typeof RequestShape;
export const RequestShape = (() => {
  class RequestShape extends ReadableShape<BytesShape> {
    private constructor() {
      super(BytesShape);
    }

    renderTypeRef() {
      return EXTERNALS["node:http"].IncomingMessage;
    }

    /**
     * Gets the effective content-encoding of the request.
     */
    contentEncoding(
      expr: ExpressionBuilderBase<RequestShape>
    ): ExpressionBuilder<BufferEncodingShape> {
      const headerValues = HeaderValueShape.parse(
        this.header(expr, "content-type")
      );
      return headerValues.shape.optionalChain(
        headerValues,
        (expr) => {
          return (
            expr
              .map_into(BufferEncodingShape, (expr) => {
                return ay.code`${expr}.params["charset"]`;
              })
              // TODO: this downcast is not really safe, because the charset values are not exactly the same as BufferEncoding.
              // though there is a lot of overlap.
              .downcast(BufferEncodingShape)
          );
        },
        BufferEncodingShape.literal("utf-8")
      );
    }

    header(
      expr: ExpressionBuilderBase<RequestShape>,
      name: string | ExpressionBuilderBase<StringShape>
    ): ExpressionBuilder<OptionalShape<HeaderShape>> {
      const nameExpr =
        typeof name === "string"
          ? StringShape.literal(name.toLowerCase())
          : name;

      return expr.map_into(new OptionalShape(HeaderShape), (req) => {
        return ay.code`(${req}).headers[${nameExpr.unwrapExpr()}]`;
      });
    }
  }

  const instance = new (RequestShape as any)();

  return instance as RequestShape;
})();

/**
 * The representation of the HSJS HTTP Context.
 */
export type CtxShape = typeof CtxShape;
export const CtxShape = (() => {
  class CtxShape extends ExprShape {
    private constructor() {
      super();
    }

    renderTypeRef() {
      return HELPERS.router.HttpContext;
    }

    request(
      expr: ExpressionBuilderBase<CtxShape>
    ): ExpressionBuilder<RequestShape> {
      return expr.map_into(RequestShape, (expr) => ay.code`${expr}.request`);
    }
  }
  const instance = new (CtxShape as any)();

  return instance as CtxShape;
})();

export type JsonShape = typeof JsonShape;
export const JsonShape = (() => {
  class JsonShape extends ExprShape {
    private constructor() {
      super();
    }

    renderTypeRef() {
      return HELPERS.json.JsonValue;
    }

    parse(expr: ExpressionBuilderBase<StringShape>): ExpressionBuilder<this> {
      return expr.map_into(this, (expr) => {
        return ay.code`globalThis.JSON.parse(${expr})`;
      });
    }
  }
  const instance = new (JsonShape as any)();

  return instance as JsonShape;
})();

export type HeaderShape = typeof HeaderShape;
export const HeaderShape = (() => {
  class HeaderShape extends BaseStringShape {
    private constructor() {
      super();
    }

    parse(
      expr: ExpressionBuilderBase<HeaderShape>
    ): ExpressionBuilder<HeaderValueShape> {
      return HeaderValueShape.parse(expr);
    }
  }

  const instance = new (HeaderShape as any)();

  return instance as HeaderShape;
})();

export type HeaderValueShape = typeof HeaderValueShape;
export const HeaderValueShape = (() => {
  class HeaderValueShape extends ExprShape {
    private constructor() {
      super();
    }

    renderTypeRef() {
      return HELPERS.header.HeaderValueParameters;
    }

    parse(
      expr: ExpressionBuilderBase<OptionalShape<HeaderShape>>
    ): ExpressionBuilder<OptionalShape<this>>;
    parse(expr: ExpressionBuilderBase<HeaderShape>): ExpressionBuilder<this>;
    parse(
      expr:
        | ExpressionBuilderBase<OptionalShape<HeaderShape>>
        | ExpressionBuilderBase<HeaderShape>
    ): ExpressionBuilder<OptionalShape<this>> | ExpressionBuilder<this> {
      const isOptional = expr.shape instanceof OptionalShape;

      return expr.map_into(
        isOptional ? new OptionalShape(this) : this,
        (expr) => {
          return (
            <ts.FunctionCallExpression
              target={HELPERS.header.parseHeaderValueParameters}
              args={[expr]}
            />
          );
        }
      ) as ExpressionBuilder<OptionalShape<this>> | ExpressionBuilder<this>;
    }
  }

  const instance = new (HeaderValueShape as any)();

  return instance as HeaderValueShape;
})();
