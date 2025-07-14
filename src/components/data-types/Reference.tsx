import * as ay from "@alloy-js/core";

import { Namespace as NamespaceType, Type } from "@typespec/compiler";
import { ReprProvider, useReprProvider } from "../../plugins/repr.js";
import { Enum } from "./Enum.jsx";
import { Model } from "./Model.jsx";
import { Intrinsic } from "./Intrinsic.jsx";
import { Interface } from "./Interface.jsx";
import { Namespace } from "./Namespace.jsx";
import { Operation } from "./Operation.jsx";
import { Scalar } from "./Scalar.jsx";
import { StringTemplate } from "./StringTemplate.jsx";
import { Tuple } from "./Tuple.jsx";
import { Union } from "./Union.jsx";

export const DEFAULT_REPR_PROVIDER: Required<ReprProvider> = {
  Boolean: ({ type }) => String(type.value),
  String: ({ type }) => `"${type.value}"`,
  Number: ({ type }) => type.valueAsString,
  Decorator: () => "never",
  Enum: (props) => <Enum {...props} />,
  EnumMember: ({ type }) =>
    ay.memberRefkey(ay.refkey(type.enum), ay.refkey(type)),
  Model: (props) => <Model {...props} />,
  Interface: (props) => <Interface {...props} />,
  Intrinsic: (props) => <Intrinsic {...props} />,
  FunctionParameter: () => "never",
  ModelProperty: ({ type }) =>
    ay.memberRefkey(ay.refkey(type.model), ay.refkey(type)),
  Namespace: (props) => <Namespace {...props} />,
  Operation: (props) => <Operation {...props} />,
  Scalar: (props) => <Scalar {...props} />,
  // TODO: needs some kind of binding logic to map scalar constructors to abstract behaviors.
  ScalarConstructor: () => "never",
  StringTemplate: (props) => <StringTemplate {...props} />,
  StringTemplateSpan: () => "never",
  TemplateParameter: () => "never",
  Tuple: (props) => <Tuple {...props} />,
  Union: (props) => <Union {...props} />,
  UnionVariant: (props) => <Reference {...props} type={props.type.type} />,
};

export type DeclarableType = Extract<Type, { namespace?: NamespaceType }>;

export type ImmediateType = Exclude<Type, DeclarableType>;

export interface DeclarableReferenceProps<
  T extends DeclarableType = DeclarableType,
> {
  type: T;
  altName?: string;
  requireDeclaration?: true;
}

export interface ImmediateReferenceProps<
  T extends ImmediateType = ImmediateType,
> {
  type: T;
}

export interface AnyReferenceProps<T extends Type = Type> {
  type: T;
  altName?: string;
  requireDeclaration?: boolean;
}

type PickReferenceProps<T extends Type> = [T] extends [DeclarableType]
  ? DeclarableReferenceProps<T>
  : [T] extends [ImmediateType]
    ? ImmediateReferenceProps<T>
    : AnyReferenceProps<T>;

export function Reference<T extends Type>(props: PickReferenceProps<T>) {
  const reprProvider = useReprProvider();

  const RefRepr = reprProvider[props.type.kind];

  return <RefRepr {...(props as any)} />;
}
