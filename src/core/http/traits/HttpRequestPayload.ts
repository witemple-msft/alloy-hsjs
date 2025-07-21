// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

import * as ay from "@alloy-js/core";

import { HttpOperation } from "@typespec/http";
import { ModelInterfaceShape } from "../../../components/data-types/Model.jsx";
import { Trait, Self } from "../../../plugins/Trait.js";
import { ExpressionBuilder } from "../../../plugins/ExpressionBuilder.jsx";
import { CtxShape, RequestShape } from "../shapes.jsx";
import { BytesShape } from "../../shapes.jsx";
import { UnimplementedError } from "../../../util/error.js";
import { MEDIA_TYPE_REGISTRY } from "../media-type.jsx";

/**
 * A trait for shapes that support acting as the primary payload of an HTTP request.
 */
export const HttpRequestPayload = new Trait<
  {
    /**
     * Parses the request for the given operation into a typed expression.
     *
     * NOTE: `operation` MUST be of a canonicalized TypeSpec operation using {@link useCanonicalizedOperation}.
     *
     * @param operation - The HTTP operation to parse the request for.
     * @param ctx - The HTTP context expression for the operation.
     * @param routeParams - A refkey to the `routeParameters` of the operation.
     */
    parseRequest(
      operation: HttpOperation,
      ctx: ExpressionBuilder<CtxShape>,
      routeParams: ay.Refkey
    ): ExpressionBuilder<Self>;
  },
  ModelInterfaceShape
>();

HttpRequestPayload.implement(ModelInterfaceShape, {
  parseRequest(
    operation,
    ctx,
    routeParams
  ): ExpressionBuilder<ModelInterfaceShape> {
    if (operation.parameters.body) {
      // Get all the content types, match them to media type handlers, and bind different logic based on the media types.

      const contentTypes = operation.parameters.body.contentTypes;

      if (contentTypes.length > 1) {
        // Multiple possible content types for the body, so we need to switch on them.
        throw new UnimplementedError(
          "Multiple body content types not yet implemented."
        );
      } else {
        // Single content type, get the handler for it.
        const contentType = contentTypes[0];

        const handler = MEDIA_TYPE_REGISTRY.resolve(contentType);

        const parsed = handler.parseRequest(ctx.request()).bind("parsedBody");

        return parsed as ExpressionBuilder<ModelInterfaceShape>;
      }
    }

    return BytesShape.concat(ctx.request().collect().await())
      .decode("utf-8")
      .bind("bodasdfy")
      .map_into(
        new ModelInterfaceShape(operation.operation.parameters),
        (expr) => "fsd"
      );
  },
});
