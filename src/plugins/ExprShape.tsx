import * as ay from "@alloy-js/core";

import { Namespace, Type } from "@typespec/compiler";

export type ShapeProvider = {
  /**
   * A mapping of TypeSpec type kinds to their corresponding representation components.
   *
   * A representation component MUST return a _reference_ to the type it represents.
   *
   * It MAY declare the type it represents anywhere it likes.
   */
  // [K in Type["kind"]]: (
  //   props: (Extract<Type, { kind: K }> extends DeclarableType
  //     ? DeclarableReferenceProps
  //     : ImmediateReferenceProps) & { type: Extract<Type, { kind: K }> }
  // ) => ay.Children;
  [K in Type["kind"]]: TypeShapeClass<Extract<Type, { kind: K }>>;
};

export type ExprShapeClass = new (...args: any[]) => ExprShape;

/**
 * A shape is an abstract representation of the type of a code entity.
 *
 * Think of a `Shape` as being like a value's type. You can use it to render a reference to the type it represents as well
 * as query the type to determine if it supports certain features.
 */
export abstract class ExprShape {
  /**
   * Renders a references to the type of this representation.
   *
   * Note: this is NOT a component. It is a function that returns children. If you mount this into the output tree
   * as if it were a component, you WILL end up with unbound `this` references!
   */
  abstract renderTypeRef(): ay.Children;
}

/**
 * The constraint of all shapes that represent TypeSpec types.
 */
export type TypeShapeClass<T extends Type = Type> = new (
  type: T,
  options?: PickTypeShapeOptions<T>
) => TypeShape<T>;

export abstract class TypeShape<T extends Type = Type> extends ExprShape {
  #type: T;
  #options: PickTypeShapeOptions<T>;

  constructor(type: T, options?: PickTypeShapeOptions<T>) {
    super();
    this.#type = type;
    this.#options = options ?? {};
  }

  get type(): T {
    return this.#type;
  }

  get options(): PickTypeShapeOptions<T> {
    return this.#options;
  }

  abstract renderTypeRef(): ay.Children;
}

export type TypeShapeOptions = DeclarationShapeOptions | ImmediateShapeOptions;

export interface DeclarationShapeOptions {
  altName?: string;
  requireDeclaration?: true;
}

export interface ImmediateShapeOptions {}

export type DeclarableType = Extract<Type, { namespace?: Namespace }>;

export type ImmediateType = Exclude<Type, DeclarableType>;

export type PickTypeShapeOptions<T extends Type> = [T] extends [DeclarableType]
  ? DeclarationShapeOptions
  : [T] extends [ImmediateType]
    ? ImmediateShapeOptions
    : TypeShapeOptions;

const SHAPE_PROVIDER_CONTEXT = ay.createContext<ShapeProvider>();

export function useShapeProvider(): ShapeProvider {
  const provider = ay.useContext(SHAPE_PROVIDER_CONTEXT);
  if (!provider) {
    throw new Error("ShapeProvider is not available in the current context.");
  }
  return provider;
}

export function useShape<T extends Type>(type: T): ExprShape {
  const provider = useShapeProvider();

  const Shape = provider[type.kind] as TypeShapeClass;

  return new Shape(type);
}

export function WithShapeProvider(props: {
  provider: ShapeProvider;
  children: ay.Children;
}) {
  const provider = ay.useContext(SHAPE_PROVIDER_CONTEXT) ?? {};

  return (
    <SHAPE_PROVIDER_CONTEXT.Provider value={{ ...provider, ...props.provider }}>
      {props.children}
    </SHAPE_PROVIDER_CONTEXT.Provider>
  );
}
