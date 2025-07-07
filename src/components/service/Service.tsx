import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import { HttpService } from "@typespec/http";
import { HELPERS, HelperTree } from "../../../generated-defs/helpers.jsx";
import { hsjsDependencies } from "../../../generated-defs/package.json.js";
import { parseCase } from "../../util/case.js";
import { HttpImplementation } from "../http/HttpImplementation.jsx";

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

  return (
    <ts.PackageDirectory
      name={serviceName}
      version="1.0.0"
      scripts={{ build: "tsc" }}
      devDependencies={{ "@types/node": hsjsDependencies["@types/node"] }}
    >
      <SERVICE_CONTEXT.Provider value={service}>
        <ay.SourceDirectory path="src">
          <ay.SourceDirectory path="generated">
            <HelperTree />
            <ts.SourceFile path="index.ts">
              <ay.StatementList>
                <ts.VarDeclaration
                  export
                  const
                  name="example"
                  initializer={HELPERS.header.parseHeaderValueParameters}
                />
              </ay.StatementList>
            </ts.SourceFile>
            <HttpImplementation />
          </ay.SourceDirectory>
        </ay.SourceDirectory>
      </SERVICE_CONTEXT.Provider>
    </ts.PackageDirectory>
  );
}
