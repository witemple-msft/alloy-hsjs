import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import { EmitContext } from "@typespec/compiler";
import { JsServerEmitterOptions } from "../lib.js";
import { getAllHttpServices } from "@typespec/http";
import { Services } from "./service/Services.jsx";
import { WithRepr } from "../plugins/repr.jsx";
import { DEFAULT_REPR_PROVIDER } from "./data-types/Reference.jsx";
import {
  DeclarationContextProvider,
  Models,
} from "./data-types/declarations.jsx";

export interface JsServerOutputProps {
  /**
   * The emitter context that contains the program and options.
   */
  context: EmitContext<JsServerEmitterOptions>;
}

const EMIT_CONTEXT = ay.createContext<EmitContext<JsServerEmitterOptions>>();

export function useEmitContext(): EmitContext<JsServerEmitterOptions> {
  const ctx = ay.useContext(EMIT_CONTEXT);
  if (!ctx) {
    throw new Error("useEmitContext must be used within a JsServerOutput");
  }
  return ctx;
}

export function JsServerOutput(props: JsServerOutputProps) {
  return (
    <ay.Output externals={[ts.node.fs]}>
      <WithRepr provider={DEFAULT_REPR_PROVIDER}>
        <EMIT_CONTEXT.Provider value={props.context}>
          <Services />
        </EMIT_CONTEXT.Provider>
      </WithRepr>
    </ay.Output>
  );
}
