import * as ay from "@alloy-js/core";

import {
  EnumMember,
  ModelProperty,
  Namespace as NamespaceType,
  Type,
  UnionVariant,
} from "@typespec/compiler";
import {
  PickTypeShapeOptions,
  ShapeProvider,
  TypeShape,
  useShape,
  useShapeProvider,
} from "../../plugins/ExprShape.jsx";
import { EnumShape } from "./Enum.jsx";
import { ModelInterfaceShape } from "./Model.jsx";
import { IntrinsicShape } from "./Intrinsic.jsx";
import { InterfaceShape } from "./Interface.jsx";
import { NamespaceShape } from "./Namespace.jsx";
import { ScalarShape } from "./Scalar.jsx";
import { TupleShape } from "./Tuple.jsx";
import { UnionShape } from "./Union.jsx";
import { OperationShape } from "./Operation.jsx";
import { LiteralShape } from "./Literal.jsx";
import { StringTemplateShape } from "./StringTemplate.jsx";

export const DEFAULT_SHAPE_PROVIDER: () => Required<ShapeProvider> = () => ({
  Boolean: LiteralShape,
  String: LiteralShape,
  Number: LiteralShape,
  StringTemplate: StringTemplateShape,
  Intrinsic: IntrinsicShape,

  Tuple: TupleShape,

  Enum: EnumShape,
  EnumMember: class extends TypeShape<EnumMember> {
    renderTypeRef() {
      return ay.memberRefkey(ay.refkey(this.type.enum), ay.refkey(this.type));
    }
  },

  Model: ModelInterfaceShape,
  ModelProperty: class extends TypeShape<ModelProperty> {
    renderTypeRef() {
      return ay.memberRefkey(ay.refkey(this.type.model), ay.refkey(this.type));
    }
  },

  Union: UnionShape,
  UnionVariant: class extends TypeShape<UnionVariant> {
    renderTypeRef() {
      const inner = useShape(this.type.type);

      return inner.renderTypeRef();
    }
  },

  Interface: InterfaceShape,
  Namespace: NamespaceShape,
  Operation: OperationShape,

  Scalar: ScalarShape,
  // TODO: needs some kind of binding logic to map scalar constructors to abstract behaviors.
  ScalarConstructor: NeverShape,

  // Weird cases that have no representation.
  Decorator: NeverShape,
  FunctionParameter: NeverShape,
  StringTemplateSpan: NeverShape,
  TemplateParameter: NeverShape,
});

export class NeverShape<T extends Type> extends TypeShape<T> {
  renderTypeRef() {
    return <>never</>;
  }
}

export function Reference<T extends Type>(
  props: { type: T } & PickTypeShapeOptions<T>
) {
  const provider = useShapeProvider();

  const Shape = provider[props.type.kind];

  const shape = new Shape(props.type as any, props);

  return shape.renderTypeRef();
}
