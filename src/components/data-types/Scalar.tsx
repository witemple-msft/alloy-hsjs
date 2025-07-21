import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import { getDoc, Scalar as ScalarType } from "@typespec/compiler";
import { useJsScalar } from "../../core/scalar.jsx";
import { parseCase } from "../../util/case.js";
import { getFullyQualifiedTypeName } from "../../util/name.js";
import { useEmitContext } from "../JsServerOutput.jsx";
import { useDeclarationModule } from "./declarations.jsx";
import { TypeShape } from "../../plugins/ExprShape.jsx";

export class ScalarShape extends TypeShape<ScalarType> {
  renderTypeRef() {
    return <Scalar type={this.type} />;
  }
}

export function Scalar(props: {
  type: ScalarType;
  requireDeclaration?: boolean;
}) {
  const scalar = useJsScalar(props.type, props.type);

  if (props.requireDeclaration) {
    const refkey = ay.refkey(props.type);

    const container = useDeclarationModule(props.type);

    container.addDeclaration(refkey, () => <ScalarDeclaration {...props} />);
  }

  return scalar.type;
}

export function ScalarDeclaration(props: { type: ScalarType }) {
  const { program } = useEmitContext();

  const jsScalar = useJsScalar(props.type, props.type);

  const name = parseCase(props.type.name).pascalCase;

  return (
    <ts.TypeDeclaration
      export
      name={name}
      kind="type"
      refkey={ay.refkey(props.type)}
      doc={
        getDoc(program, props.type) ??
        `A TypeScript representation of the '${getFullyQualifiedTypeName(props.type)}' TypeSpec scalar.`
      }
    >
      {jsScalar.type}
    </ts.TypeDeclaration>
  );
}
