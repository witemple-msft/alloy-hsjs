import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import { Namespace as NamespaceType } from "@typespec/compiler";
import { useDeclarationModule } from "./declarations.jsx";
import { parseCase } from "../../util/case.js";
import { getFullyQualifiedTypeName } from "../../util/name.js";
import { useCanonicalizedOperation } from "../../core/http/operation.js";
import { TypeShape } from "../../plugins/ExprShape.jsx";

export class NamespaceShape extends TypeShape<NamespaceType> {
  renderTypeRef() {
    return <Namespace type={this.type} />;
  }
}

export function Namespace(props: { type: NamespaceType; altName?: string }) {
  const refkey = ay.refkey(props.type);

  const container = useDeclarationModule(props.type);

  container.addDeclaration(refkey, () => (
    <NamespaceOperations type={props.type} />
  ));

  return refkey;
}

export function NamespaceOperations(props: {
  type: NamespaceType;
  altName?: string;
}) {
  const { type } = props;

  const fqn = getFullyQualifiedTypeName(type);

  const name = type.name ? parseCase(type.name).pascalCase : props.altName;

  if (!name) throw new Error("Namespace must have a name or an altName");

  return (
    <ts.InterfaceDeclaration
      export
      name={name}
      refkey={ay.refkey(type)}
      kind="type"
      doc={`An interface containing the operations defined directly in the '${fqn}' namespace.`}
    >
      <ay.For each={type.operations}>
        {(name, operation) => {
          const canonical = useCanonicalizedOperation(operation);

          return (
            <ts.InterfaceMethod
              name={parseCase(name).camelCase}
              refkey={ay.refkey(canonical)}
              doc={`A method defined directly in the '${fqn}' namespace.`}
            />
          );
        }}
      </ay.For>
    </ts.InterfaceDeclaration>
  );
}
