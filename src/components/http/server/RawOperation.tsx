import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";
import { Operation } from "@typespec/compiler";

import { getHttpOperation, HttpOperation } from "@typespec/http";
import { getFullyQualifiedTypeName } from "../../../util/name.js";
import { HELPERS } from "../../../../generated-defs/helpers.jsx";
import { parseCase } from "../../../util/case.js";
import { useCanonicalizedOperation } from "../../../core/http/operation.js";
import { useEmitContext } from "../../JsServerOutput.jsx";
import { containerRefkey } from "../router/util.jsx";

const RAW_OPERATION = Symbol.for("TypeSpec.HSJS.RawOperation");

/**
 * Produces a refkey that refers to the raw operation implementation for a given TypeSpec operation.
 *
 * HTTP: You MUST provide a CANONICALIZED operation. {@link useCanonicalizedOperation}
 *
 * @param operation
 * @returns
 */
export function rawOperationRefkey(operation: Operation): ay.Refkey {
  return ay.refkey(RAW_OPERATION, operation);
}

export function RawOperation(props: { operation: HttpOperation }) {
  const { program } = useEmitContext();

  const canonical = useCanonicalizedOperation(props.operation.operation);
  const [operation] = getHttpOperation(program, canonical);

  const operationFqn = getFullyQualifiedTypeName(canonical);

  const ctx = ay.refkey();
  const impl = ay.refkey();
  const routeParams = ay.refkey();

  const operationName = parseCase(operationFqn).snakeCase + "_raw";

  const container = containerRefkey(operation.container);
  const containerName = parseCase(operation.container.name);

  const routeParameters = operation.parameters.parameters.filter(
    (p) => p.type === "path"
  );

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

  if (routeParameters.length > 0)
    parameters.push({
      name: "routeParams",
      type: (
        <ts.InterfaceExpression>
          <ay.For each={routeParameters} semicolon enderPunctuation>
            {(param) => (
              <ts.InterfaceMember
                name={parseCase(param.name).camelCase}
                type="string"
              />
            )}
          </ay.For>
        </ts.InterfaceExpression>
      ),
      doc: "The text of parameters extracted from the route.",
      refkey: routeParams,
    });

  return (
    <ts.FunctionDeclaration
      export
      async
      name={operationName}
      refkey={rawOperationRefkey(canonical)}
      doc={`Raw operation implementation for the operation '${operationFqn}'.`}
      parameters={parameters}
      returnType={"void"}
    />
  );
}
