import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";
import { OperationContainer } from "@typespec/compiler";
import { HttpService } from "@typespec/http";
import { HELPERS } from "../../../../generated-defs/helpers.jsx";
import { ReCase, parseCase } from "../../../util/case.js";
import { getFullyQualifiedTypeName } from "../../../util/name.js";
import { containerRefkey } from "./util.jsx";

/**
 * Generates the router backend logic implementation interface for the given HTTP service and its operation containers.
 */
export function RouterLogicImpl(props: {
  /** The HTTP service to generate for. */
  service: HttpService;
  /** The operation containers in the router. */
  backends: Map<OperationContainer, [ReCase, ay.Children]>;
  /** An reference key to bind the implementation type to. */
  refkey: ay.Refkey;
}) {
  const serviceName = parseCase(props.service.namespace.name).pascalCase;
  const serviceFqn = getFullyQualifiedTypeName(props.service.namespace);

  const implName = serviceName + "Impl";

  return (
    <ts.InterfaceDeclaration
      export
      name={serviceName + "Impl"}
      kind="type"
      refkey={props.refkey}
      doc={`Business logic implementation for the '${serviceFqn}' service.`}
    >
      <ay.For each={props.backends}>
        {(container, [name, ref]) => (
          <>
            <ts.InterfaceMember
              name={name.camelCase}
              type={ay.code`${ref}<${HELPERS.router.HttpContext}>`}
              doc={`The '${name.pascalCase}' backend for the '${serviceFqn}' service.`}
              refkey={containerRefkey(container)}
            />
            ;
          </>
        )}
      </ay.For>
    </ts.InterfaceDeclaration>
  );
}
