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
  Enum: ({ type }) => <Enum type={type} />,
  EnumMember: ({ type }) =>
    ay.memberRefkey(ay.refkey(type.enum), ay.refkey(type)),
  Model: (props) => <Model {...props} />,
  Interface: ({ type }) => <Interface type={type} />,
  Intrinsic: ({ type }) => <Intrinsic type={type} />,
  FunctionParameter: () => "never",
  ModelProperty: ({ type }) =>
    ay.memberRefkey(ay.refkey(type.model), ay.refkey(type)),
  Namespace: ({ type }) => <Namespace type={type} />,
  Operation: ({ type }) => <Operation type={type} />,
  Scalar: ({ type }) => <Scalar type={type} />,
  // TODO: needs some kind of binding logic to map scalar constructors to abstract behaviors.
  ScalarConstructor: () => "never",
  StringTemplate: ({ type }) => <StringTemplate type={type} />,
  StringTemplateSpan: () => "never",
  TemplateParameter: () => "never",
  Tuple: ({ type }) => <Tuple type={type} />,
  Union: ({ type }) => <Union type={type} />,
  UnionVariant: ({ type }) => <Reference type={type} />,
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
