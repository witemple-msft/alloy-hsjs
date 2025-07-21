// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

import { LiteralType } from "@typespec/compiler";
import { EXTERNALS } from "../JsServerOutput.jsx";
import { TypeShape } from "../../plugins/ExprShape.jsx";

export class LiteralShape<L extends LiteralType> extends TypeShape<L> {
  renderTypeRef() {
    switch (this.type.kind) {
      case "String":
        return JSON.stringify(this.type.value);
      case "Number": {
        const { numericValue: numeric } = this.type;

        const number = numeric.asNumber();

        if (number) return String(number);

        if (numeric.isInteger) return String(numeric.asBigInt()) + "n";

        // Not expressible as a literal...
        return EXTERNALS["decimal.js"].Decimal;
      }
      case "Boolean":
        return String(this.type.value);
    }
  }
}
