import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";
import { Operation } from "@typespec/compiler";

import { HttpOperation } from "@typespec/http";
import { raw } from "express";
import { getFullyQualifiedTypeName } from "../../../util/name.js";
import { Helper } from "../../helpers.jsx";
import { HELPERS } from "../../../../generated-defs/helpers.jsx";
import { parseCase } from "../../../util/case.js";
import { useCanonicalizedOperation } from "../../../core/http/operation.js";

const RAW_OPERATION = Symbol.for("TypeSpec.HSJS.RawOperation");

export function rawOperationRefkey(operation: Operation): ay.Refkey {
  return ay.refkey(RAW_OPERATION, operation);
}

export function RawOperation(props: { operation: HttpOperation }) {
  const tspOperation = useCanonicalizedOperation(props.operation.operation);

  const operationFqn = getFullyQualifiedTypeName(tspOperation);

  const doc = (
    <>Raw operation implementation for the operation '{operationFqn}'.</>
  );

  const ctx = ay.refkey();
  const path = ay.refkey();

  const operationName = parseCase(operationFqn).snakeCase + "_raw";

  const parameters: ts.ParameterDescriptor[] = [
    {
      name: "ctx",
      type: HELPERS.router.HttpContext,
      doc: "The HTTP context for the operation.",
      refkey: ctx,
    },
  ];

  return (
    <ts.FunctionDeclaration
      export
      async
      name={operationName}
      refkey={rawOperationRefkey(tspOperation)}
      doc={doc}
      parameters={parameters}
      returnType={"void"}
    />
  );
}
