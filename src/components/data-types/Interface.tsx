import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import { getDoc, Interface as InterfaceType } from "@typespec/compiler";
import { useDeclarationModule } from "./declarations.jsx";
import { useCanonicalizedOperation } from "../../core/http/operation.js";
import { parseCase } from "../../util/case.js";
import { getFullyQualifiedTypeName } from "../../util/name.js";
import { Reference } from "./Reference.jsx";
import { useEmitContext } from "../JsServerOutput.jsx";

export function Interface(props: { type: InterfaceType; altName?: string }) {
  const refkey = ay.refkey(props.type);

  const container = useDeclarationModule(props.type);

  container.addDeclaration(props.type, () => (
    <InterfaceOperations type={props.type} altName={props.altName} />
  ));

  return refkey;
}

export function InterfaceOperations(props: {
  type: InterfaceType;
  altName?: string;
}) {
  const { program } = useEmitContext();

  const { type } = props;

  const fqn = getFullyQualifiedTypeName(type);

  const name = type.name ? parseCase(type.name).pascalCase : props.altName;

  if (!name) throw new Error("Namespace must have a name or an altName");

  const protocolCtx = ay.refkey();

  const typeParameters: ts.TypeParameterDescriptor[] = [
    {
      name: "Context",
      default: "unknown",
      refkey: protocolCtx,
    },
  ];

  return (
    <ts.InterfaceDeclaration
      export
      name={name}
      refkey={ay.refkey(type)}
      kind="type"
      doc={getDoc(program, type)}
      typeParameters={typeParameters}
    >
      <ay.For each={type.operations}>
        {(name, operation) => {
          const canonical = useCanonicalizedOperation(operation);

          const ctxLocal = ay.refkey(protocolCtx, canonical);

          const parameters: ts.ParameterDescriptor[] = [
            {
              name: "ctx",
              type: protocolCtx,
              doc: "The protocol context for the operation implementation.",
              refkey: ctxLocal,
            },
            ...[...canonical.parameters.properties].map(
              ([name, prop]): ts.ParameterDescriptor => ({
                name: parseCase(name).camelCase,
                type: <Reference type={prop.type} />,
                doc: getDoc(program, prop),
              })
            ),
          ];

          const opName = parseCase(name);

          return (
            <>
              <ts.InterfaceMethod
                async
                name={opName.camelCase}
                refkey={ay.refkey(canonical)}
                doc={getDoc(program, canonical)}
                parameters={parameters}
                returnType={
                  <Reference
                    type={canonical.returnType}
                    altName={opName.pascalCase + "Response"}
                  />
                }
              />
              ;
            </>
          );
        }}
      </ay.For>
    </ts.InterfaceDeclaration>
  );
}
