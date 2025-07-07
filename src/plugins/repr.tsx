import * as ay from "@alloy-js/core";

import { Type } from "@typespec/compiler";
import {
  DeclarableReferenceProps,
  DeclarableType,
  ImmediateReferenceProps,
} from "../components/data-types/Reference.jsx";

export type ReprProvider = {
  /**
   * A mapping of TypeSpec type kinds to their corresponding representation components.
   *
   * A representation component MUST return a _reference_ to the type it represents.
   *
   * It MAY declare the type it represents anywhere it likes.
   */
  [K in Type["kind"]]: (
    props: (Extract<Type, { kind: K }> extends DeclarableType
      ? DeclarableReferenceProps
      : ImmediateReferenceProps) & { type: Extract<Type, { kind: K }> }
  ) => ay.Children;
};

const REPR_CONTEXT = ay.createContext<ReprProvider>();

export function useReprProvider(): ReprProvider {
  const provider = ay.useContext(REPR_CONTEXT);
  if (!provider) {
    throw new Error("ReprProvider is not available in the current context.");
  }
  return provider;
}

export function WithRepr(props: {
  provider: ReprProvider;
  children: ay.Children;
}) {
  const provider = ay.useContext(REPR_CONTEXT) ?? {};

  return (
    <REPR_CONTEXT.Provider value={{ ...provider, ...props.provider }}>
      {props.children}
    </REPR_CONTEXT.Provider>
  );
}
