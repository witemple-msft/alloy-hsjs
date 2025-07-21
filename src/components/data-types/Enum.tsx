import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import { Enum as EnumType, getDoc } from "@typespec/compiler";
import { useDeclarationModule } from "./declarations.jsx";
import { parseCase } from "../../util/case.js";
import { useEmitContext } from "../JsServerOutput.jsx";
import { getFullyQualifiedTypeName } from "../../util/name.js";
import { Literal } from "../../util/literal.jsx";
import { TypeShape } from "../../plugins/ExprShape.jsx";

export class EnumShape extends TypeShape<EnumType> {
  renderTypeRef() {
    return <Enum type={this.type} />;
  }
}

export function Enum(props: { type: EnumType; altName?: string }) {
  const rk = ay.refkey(props.type);

  const container = useDeclarationModule(props.type);

  container.addDeclaration(rk, () => <EnumDeclaration {...props} />);

  return rk;
}

function EnumDeclaration(props: { type: EnumType; altName?: string }) {
  const { program } = useEmitContext();

  const { type } = props;

  const fqn = getFullyQualifiedTypeName(type);

  const name = type.name ? parseCase(type.name).pascalCase : props.altName;

  if (!name) throw new Error("Enum must have a name or an altName");

  return (
    <ts.EnumDeclaration
      export
      name={name}
      refkey={ay.refkey(type)}
      doc={
        getDoc(program, type) ??
        `A TypeScript representation of the '${fqn}' TypeSpec enum.`
      }
    >
      <ay.For each={type.members} comma enderPunctuation doubleHardline>
        {(name, member) => (
          <ts.EnumMember
            name={parseCase(name).pascalCase}
            refkey={ay.refkey(member)}
            value={<Literal value={member.value ?? name} />}
            doc={getDoc(program, member) ?? `The '${name}' member of the enum.`}
          />
        )}
      </ay.For>
    </ts.EnumDeclaration>
  );
}
