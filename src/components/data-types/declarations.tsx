import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";
import { Namespace, Type } from "@typespec/compiler";

export const DECLARATION_CONTEXT: ay.ComponentContext<
  ay.Reactive<Map<Type, () => ay.Children>>
> = ay.createContext<ay.Reactive<Map<Type, () => ay.Children>>>();

export const DeclarationContextProvider: (props: {
  value: ay.Reactive<Map<Type, () => ay.Children>>;
  children: ay.Children;
}) => ay.Children = DECLARATION_CONTEXT.Provider;

export function useDeclarations(): ay.Reactive<Map<Type, () => ay.Children>> {
  const declarations: ay.Reactive<Map<Type, () => ay.Children>> | undefined =
    ay.useContext(DECLARATION_CONTEXT);

  if (declarations === undefined) {
    throw new Error(
      "useDeclarations must be used within a declaration context"
    );
  }

  return declarations;
}

export interface DeclarationModule {
  addDeclaration: (type: Type, declaration: () => ay.Children) => void;
}

export type NamespacedType = Extract<Type, { namespace?: Namespace }>;

export function useDeclarationModule(type: NamespacedType): DeclarationModule {
  const declarations = useDeclarations();

  return {
    addDeclaration: (type, declaration) => {
      if (!declarations.has(type)) declarations.set(type, declaration);
    },
  };
}

export function Models() {
  const declarations = useDeclarations();

  return (
    <ts.SourceFile path="models.ts">
      <ay.For each={declarations} hardline>
        {(_, declaration) => declaration()}
      </ay.For>
    </ts.SourceFile>
  );
}
