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
import { containerRefkey } from "../router/Router.jsx";

const RAW_OPERATION = Symbol.for("TypeSpec.HSJS.RawOperation");

export function rawOperationRefkey(operation: Operation): ay.Refkey {
  return ay.refkey(RAW_OPERATION, operation);
}

export function RawOperation(props: { operation: HttpOperation }) {
  const tspOperation = useCanonicalizedOperation(props.operation.operation);

  const operationFqn = getFullyQualifiedTypeName(tspOperation);

  const ctx = ay.refkey();
  const impl = ay.refkey();
  const path = ay.refkey();

  const operationName = parseCase(operationFqn).snakeCase + "_raw";

  const container = containerRefkey(props.operation.container);
  const containerName = parseCase(props.operation.container.name);

  const parameters: ts.ParameterDescriptor[] = [
    {
      name: "ctx",
      type: HELPERS.router.HttpContext,
      doc: "The HTTP context for the operation.",
      refkey: ctx,
    },
    {
      name: containerName.camelCase,
      type: container,
      doc: `The backend implementation of the '${containerName.pascalCase}' interface.`,
      refkey: impl,
    },
  ];

  return (
    <ts.FunctionDeclaration
      export
      async
      name={operationName}
      refkey={rawOperationRefkey(tspOperation)}
      doc={`Raw operation implementation for the operation '${operationFqn}'.`}
      parameters={parameters}
      returnType={"void"}
    />
  );
}
