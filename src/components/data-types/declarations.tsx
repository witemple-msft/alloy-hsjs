import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";
import { Namespace, Type } from "@typespec/compiler";

export type DeclarationStore = ay.Reactive<Map<ay.Refkey, () => ay.Children>>;

export const DECLARATION_CONTEXT: ay.ComponentContext<DeclarationStore> =
  ay.createContext<DeclarationStore>();

export const DeclarationContextProvider: (props: {
  value: DeclarationStore;
  children: ay.Children;
}) => ay.Children = DECLARATION_CONTEXT.Provider;

export function useDeclarations(): DeclarationStore {
  const declarations = ay.useContext(DECLARATION_CONTEXT);

  if (declarations === undefined) {
    throw new Error(
      "useDeclarations must be used within a declaration context"
    );
  }

  return declarations;
}

export interface DeclarationModule {
  addDeclaration: (refkey: ay.Refkey, declaration: () => ay.Children) => void;
}

export type NamespacedType = Extract<Type, { namespace?: Namespace }>;

export function useDeclarationModule(type: NamespacedType): DeclarationModule {
  const declarations = useDeclarations();

  return {
    addDeclaration: (rk, declaration) => {
      if (!declarations.has(rk)) declarations.set(rk, declaration);
    },
  };
}

export function Models() {
  const declarations = useDeclarations();

  return (
    <ts.SourceFile path="models.ts">
      <ay.For each={declarations} doubleHardline>
        {(_, declaration) => declaration()}
      </ay.For>
    </ts.SourceFile>
  );
}
