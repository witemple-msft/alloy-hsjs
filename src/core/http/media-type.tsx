// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import { MediaTypeConstraintRegistry } from "../../util/media-type.js";
import { ExpressionBuilder } from "../../plugins/ExpressionBuilder.jsx";
import { RequestShape, JsonShape } from "./shapes.jsx";
import { BytesShape, StringShape } from "../shapes.jsx";
import { ExprShape } from "../../plugins/ExprShape.jsx";

export interface MediaTypeHandler<Shape extends ExprShape = ExprShape> {
  parseRequest(req: ExpressionBuilder<RequestShape>): ExpressionBuilder<Shape>;
}

const BytesHandler: MediaTypeHandler<BytesShape> = {
  parseRequest(req) {
    return BytesShape.concat(req.collect().await());
  },
};

export const MEDIA_TYPE_REGISTRY =
  new MediaTypeConstraintRegistry<MediaTypeHandler>(BytesHandler);

const JsonHandler: MediaTypeHandler<JsonShape> = {
  parseRequest(req) {
    return JsonShape.parse(TextHandler.parseRequest(req));
  },
};

MEDIA_TYPE_REGISTRY.register("application/json", JsonHandler);
MEDIA_TYPE_REGISTRY.register("text/json", JsonHandler);

const TextHandler: MediaTypeHandler<StringShape> = {
  parseRequest(req) {
    // TODO: we can stream this with a TextDecoder. For now we collect to an intermediate buffer.
    return BytesShape.concat(req.collect().await()).decode(
      req.contentEncoding().bind("contentEncoding")
    );
  },
};

MEDIA_TYPE_REGISTRY.register("text/*", TextHandler);
