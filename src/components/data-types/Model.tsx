import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import { getDoc, Model as ModelType } from "@typespec/compiler";
import { parseCase } from "../../util/case.js";
import { Reference } from "./Reference.jsx";
import { useEmitContext } from "../JsServerOutput.jsx";
import { useDeclarationModule } from "./declarations.jsx";

export function Model(props: { type: ModelType; altName?: string }) {
  const refkey = ay.refkey(props.type);

  const container = useDeclarationModule(props.type);

  container.addDeclaration(props.type, () => (
    <ModelDeclaration type={props.type} altName={props.altName} />
  ));

  return refkey;
}

export function ModelDeclaration(props: { type: ModelType; altName?: string }) {
  const { type } = props;

  const { program } = useEmitContext();

  const name = type.name ? parseCase(type.name).pascalCase : props.altName;

  if (!name) throw new Error("Model must have a name or an altName");

  return (
    <ts.InterfaceDeclaration
      export
      name={name}
      extends={type.baseModel && <Reference type={type.baseModel} />}
      refkey={ay.refkey(type)}
      doc={getDoc(program, type)}
      kind="type"
    >
      <ay.For each={type.properties} semicolon enderPunctuation>
        {(name, prop) => (
          <ts.InterfaceMember
            refkey={ay.refkey(prop)}
            name={parseCase(name).camelCase}
            optional={prop.optional}
            doc={getDoc(program, prop)}
          >
            <Reference
              type={prop.type}
              altName={name + parseCase(prop.name).pascalCase}
            />
          </ts.InterfaceMember>
        )}
      </ay.For>
      {type.indexer && (
        <ts.InterfaceMember indexer={<Reference type={type.indexer.key} />}>
          <Reference type={type.indexer.value} />
        </ts.InterfaceMember>
      )}
    </ts.InterfaceDeclaration>
  );
}
