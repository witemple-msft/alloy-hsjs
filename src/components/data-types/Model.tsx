import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import {
  getDiscriminatedUnionFromInheritance,
  getDiscriminator,
  getDoc,
  Model as ModelType,
} from "@typespec/compiler";
import { parseCase } from "../../util/case.js";
import { Reference } from "./Reference.jsx";
import { useEmitContext } from "../JsServerOutput.jsx";
import { useDeclarationModule } from "./declarations.jsx";
import { useTsp } from "@typespec/emitter-framework";
import { getFullyQualifiedTypeName } from "../../util/name.js";
import { UnionLike } from "./Union.jsx";
import { TypeShape } from "../../plugins/ExprShape.jsx";

export class ModelInterfaceShape extends TypeShape<ModelType> {
  renderTypeRef() {
    return <Model {...this.options} type={this.type} />;
  }
}

export function Model(props: { type: ModelType; altName?: string }) {
  const { $, program } = useTsp();

  // Well-known models
  if ($.array.is(props.type) && props.type.name === "Array") {
    return ay.code`Array<${(<Reference type={$.array.getElementType(props.type)} />)}>`;
  } else if (
    $.record.is(props.type) &&
    getFullyQualifiedTypeName(props.type) === "TypeSpec.Record"
  ) {
    const element = $.record.getElementType(props.type);
    return ay.code`Record<string, ${(<Reference type={element} />)}>`;
  }

  // Legacy discriminated unions.
  const discriminator = getDiscriminator(program, props.type);
  if (discriminator) {
    const [legacyUnion] = getDiscriminatedUnionFromInheritance(
      props.type,
      discriminator
    );

    return <UnionLike variants={[...legacyUnion.variants.values()]} />;
  }

  const refkey = ay.refkey(props.type);

  const container = useDeclarationModule(props.type);

  container.addDeclaration(refkey, () => <ModelDeclaration {...props} />);

  return refkey;
}

export function ModelDeclaration(props: { type: ModelType; altName?: string }) {
  const { type } = props;

  const { program } = useEmitContext();

  const fqn = getFullyQualifiedTypeName(type);

  const modelName = type.name ? parseCase(type.name).pascalCase : props.altName;

  if (!modelName) throw new Error("Model must have a name or an altName");

  return (
    <ts.InterfaceDeclaration
      export
      name={modelName}
      extends={type.baseModel && <Reference type={type.baseModel} />}
      refkey={ay.refkey(type)}
      doc={
        getDoc(program, type) ??
        `A TypeScript representation of the '${fqn}' TypeSpec model.`
      }
      kind="type"
    >
      <ay.For each={type.properties} semicolon enderPunctuation doubleHardline>
        {(name, prop) => (
          <ts.InterfaceMember
            refkey={ay.refkey(prop)}
            name={parseCase(name).camelCase}
            optional={prop.optional}
            doc={getDoc(program, prop)}
          >
            <Reference
              type={prop.type}
              altName={modelName + parseCase(prop.name).pascalCase}
            />
          </ts.InterfaceMember>
        )}
      </ay.For>
      {type.indexer && (
        // TODO: doesn't work with `TypeSpec.integer` or any scalar with a shape that isn't `string | number | symbol`.
        <ts.InterfaceMember
          indexer={
            <>
              k: <Reference type={type.indexer.key} />
            </>
          }
        >
          <Reference type={type.indexer.value} />
        </ts.InterfaceMember>
      )}
    </ts.InterfaceDeclaration>
  );
}
