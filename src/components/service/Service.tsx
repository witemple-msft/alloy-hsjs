import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import { HttpService } from "@typespec/http";
import { HelperTree } from "../../../generated-defs/helpers.jsx";
import { hsjsDependencies } from "../../../generated-defs/package.json.js";
import { parseCase } from "../../util/case.js";
import { HttpImplementation } from "../http/HttpImplementation.jsx";
import {
  DeclarationContextProvider,
  Models,
} from "../data-types/declarations.jsx";
import { Type } from "@typespec/compiler";

const SERVICE_CONTEXT = ay.createContext<HttpService>();

export function useServiceContext(): HttpService {
  const ctx = ay.useContext(SERVICE_CONTEXT);
  if (!ctx) {
    throw new Error(
      "useServiceContext must be used within a Service component"
    );
  }
  return ctx;
}

export function Service({ service }: { service: HttpService }) {
  const serviceName = parseCase(service.namespace?.name ?? "Service").kebabCase;

  const declarations = ay.reactive(new Map());

  return (
    <ts.PackageDirectory
      name={serviceName}
      version="1.0.0"
      scripts={{ build: "tsc" }}
      devDependencies={{ "@types/node": hsjsDependencies["@types/node"] }}
    >
      <SERVICE_CONTEXT.Provider value={service}>
        <DeclarationContextProvider value={declarations}>
          <ay.SourceDirectory path="src">
            <ay.SourceDirectory path="generated">
              <HelperTree />
              <Models />
              <HttpImplementation />
            </ay.SourceDirectory>
          </ay.SourceDirectory>
        </DeclarationContextProvider>
      </SERVICE_CONTEXT.Provider>
    </ts.PackageDirectory>
  );
}
