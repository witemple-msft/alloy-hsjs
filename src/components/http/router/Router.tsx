import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";
import { useServiceContext } from "../../service/Service.jsx";
import { parseCase, ReCase } from "../../../util/case.js";
import { getFullyQualifiedTypeName } from "../../../util/name.js";
import { useEmitContext } from "../../JsServerOutput.jsx";
import { HttpService } from "@typespec/http";
import { OperationContainer } from "@typespec/compiler";

const ROUTER = Symbol.for("TypeSpec.HSJS.Router");

export function routerRefkey(service: HttpService): ay.Refkey {
  return ay.refkey(ROUTER, service);
}

export function Router() {
  const { options } = useEmitContext();
  const service = useServiceContext();

  const routerName = parseCase(service.namespace.name).pascalCase + "Router";

  const serviceFqn = getFullyQualifiedTypeName(service.namespace);

  const routerKey = routerRefkey(service);

  const uniqueContainers = new Set(
    service.operations.map((op) => op.container)
  );

  const backends = new Map<OperationContainer, [ReCase, string]>();

  for (const container of uniqueContainers) {
  }

  return (
    <ts.SourceFile path="router.ts">
      <ts.InterfaceDeclaration
        export
        kind="type"
        name={routerName}
        refkey={routerKey}
        doc={`Router for the '${serviceFqn}' service.`}
      >
        {ay.code`
        /**
         * Dispatches the request to the appropriate service based on the request path.
         *
         * This member function may be used directly as a handler for a Node HTTP server.
         *
         * @param request - The incoming HTTP request.
         * @param response - The outgoing HTTP response.
         */
        dispatch(request: http.IncomingMessage, response: http.ServerResponse): void;
        `}
        {options.express &&
          ay.code`
        /**
         * An Express middleware function that dispatches the request to the appropriate service based on the request path.
         *
         * This member function may be used directly as an application-level middleware function in an Express app.
         *
         * If the router does not match a route, it will call the \`next\` middleware registered with the application,
         * so it is sensible to insert this middleware at the beginning of the middleware stack.
         *
         * @param req - The incoming HTTP request.
         * @param res - The outgoing HTTP response.
         * @param next - The next middleware function in the stack.
         */
        expressMiddleware(req: http.IncomingMessage, res: http.ServerResponse, next: () => void): void;
        `}
      </ts.InterfaceDeclaration>
      <hbr />
      <hbr />
      <ts.FunctionDeclaration
        export
        name={"create" + routerName}
        doc={`Creates a new instance of the router for the '${serviceFqn}' service.`}
        returnType={routerKey}
      ></ts.FunctionDeclaration>
    </ts.SourceFile>
  );
}
