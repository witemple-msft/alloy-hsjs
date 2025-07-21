// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as ay from "@alloy-js/core";

import { Operation as OperationType } from "@typespec/compiler";
import { TypeShape } from "../../plugins/ExprShape.jsx";

export class OperationShape extends TypeShape<OperationType> {
  renderTypeRef() {
    // TODO: do we ever actually ref an operation type for any reason?
    return ay.code`(...args: any[]) => any`;
  }
}
