import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";
import { useServiceContext } from "../../service/Service.jsx";
import { parseCase, ReCase } from "../../../util/case.js";
import { getFullyQualifiedTypeName } from "../../../util/name.js";
import { EXTERNALS, useEmitContext } from "../../JsServerOutput.jsx";
import { OperationContainer } from "@typespec/compiler";
import { Reference } from "../../data-types/Reference.jsx";
import { HELPERS } from "../../../../generated-defs/helpers.jsx";
import { rawOperationRefkey } from "../server/RawOperation.jsx";
import { useCanonicalizedOperation } from "../../../core/http/operation.js";
import { implRefkey, operationImplRefkey, routerRefkey } from "./util.js";
import { RouterLogicImpl } from "./RouterLogicImpl.jsx";
import { RouteHandler } from "./RouteHandler.jsx";

const LOCAL = Symbol.for("TypeSpec.HSJS.Router.Local");

/**
 * Generates a router implementation for the HTTP service in the current service context.
 */
export function Router() {
  const { options } = useEmitContext();
  const service = useServiceContext();

  const serviceName = parseCase(service.namespace.name).pascalCase;
  const serviceFqn = getFullyQualifiedTypeName(service.namespace);

  const routerName = serviceName + "Router";
  const routerKey = routerRefkey(service);

  const implTypeKey = implRefkey(service);
  const implParamKey = ay.refkey();

  const optionsRefkey = ay.refkey();

  const handlers = {
    onRequestNotFound: local("onRequestNotFound"),
    onInvalidRequest: local("onInvalidRequest"),
    onInternalError: local("onInternalError"),
  };

  const uniqueContainers = new Set(
    service.operations.map((op) => op.container)
  );

  const backends = new Map<OperationContainer, [ReCase, ay.Children]>();

  for (const container of uniqueContainers) {
    const reCase = parseCase(container.name);

    backends.set(container, [reCase, <Reference type={container} />]);
  }

  const routeConfig = (
    <ts.InterfaceExpression>
      <ay.For each={backends} semicolon enderPunctuation>
        {(_, [name, ref]) => (
          <ts.InterfaceMember
            name={name.camelCase}
            type={ay.code`${ref}<${HELPERS.router.HttpContext}>`}
          />
        )}
      </ay.For>
    </ts.InterfaceExpression>
  );

  const createParams: ts.ParameterDescriptor[] = [
    {
      name: "impl",
      type: implTypeKey,
      doc: `The implementation of the '${serviceFqn}' service.`,
      refkey: implParamKey,
    },
    {
      name: "options",
      type: ay.code`${HELPERS.router.RouterOptions}<${routeConfig}>`,
      doc: "Optional configuration for the router.",
      default: "{}",
      refkey: optionsRefkey,
    },
  ];

  return (
    <ts.SourceFile path="router.ts">
      <RouterLogicImpl
        service={service}
        backends={backends}
        refkey={implTypeKey}
      />
      <hbr />
      <hbr />
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
          dispatch(request: ${EXTERNALS["node:http"].IncomingMessage}, response: ${EXTERNALS["node:http"].ServerResponse}): void;
        `}
        <ay.Show when={options.express}>
          <hbr />
          <hbr />
          {ay.code`
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
            expressMiddleware(req: ${EXTERNALS["node:http"].IncomingMessage}, res: ${EXTERNALS["node:http"].ServerResponse}, next: () => void): void;
          `}
        </ay.Show>
      </ts.InterfaceDeclaration>
      <hbr />
      <hbr />
      <ts.FunctionDeclaration
        export
        name={"create" + routerName}
        doc={`Creates a new instance of the router for the '${serviceFqn}' service.`}
        parameters={createParams}
        returnType={routerKey}
      >
        <ts.VarDeclaration
          const
          name="onRequestNotFound"
          refkey={handlers.onRequestNotFound}
        >
          {ay.code`options.onRequestNotFound ?? ((ctx) => ${(
            <ay.Block>
              ctx.response.statusCode = 404;
              <hbr />
              ctx.response.setHeader("Content-Type", "text/plain");
              <hbr />
              ctx.response.end("Not Found");
            </ay.Block>
          )});`}
        </ts.VarDeclaration>
        <hbr />
        <hbr />
        <ts.VarDeclaration
          const
          name="onInvalidRequest"
          refkey={handlers.onInvalidRequest}
        >
          {ay.code`options.onInvalidRequest ?? ((ctx, route, error) => ${(
            <ay.Block>
              ctx.response.statusCode = 400;
              <hbr />
              ctx.response.setHeader("Content-Type", "application/json");
              <hbr />
              ctx.response.end(JSON.stringify({"{"} route, error {"}"}));
            </ay.Block>
          )});`}
        </ts.VarDeclaration>
        <hbr />
        <hbr />
        <ts.VarDeclaration
          const
          name="onInternalError"
          refkey={handlers.onInternalError}
        >
          {ay.code`options.onInternalError ?? ((ctx, error) => ${(
            <ay.Block>
              ctx.response.statusCode = 500;
              <hbr />
              ctx.response.setHeader("Content-Type", "application/json");
              <hbr />
              ctx.response.end(JSON.stringify(error));
            </ay.Block>
          )});`}
        </ts.VarDeclaration>
        <hbr />
        <hbr />
        <ts.VarDeclaration
          const
          name="routePolicies"
          refkey={local("routePolicies")}
        >
          {ay.code`options.routePolicies ?? {};`}
        </ts.VarDeclaration>
        <hbr />
        <hbr />
        <ts.VarDeclaration
          const
          name="routeHandlers"
          refkey={local("routeHandlers")}
        >
          <ts.ObjectExpression>
            <ay.For each={service.operations} comma enderPunctuation>
              {(op) => {
                const canonical = useCanonicalizedOperation(op.operation);

                return (
                  <ts.ObjectProperty
                    name={
                      parseCase(op.container.name).snakeCase +
                      "_" +
                      parseCase(op.operation.name).snakeCase
                    }
                    refkey={operationImplRefkey(canonical)}
                  >
                    <ts.FunctionCallExpression
                      target={HELPERS.router.createPolicyChainForRoute}
                      args={[
                        `"${
                          parseCase(op.container.name).camelCase +
                          parseCase(op.operation.name).pascalCase +
                          "Dispatch"
                        }"`,
                        local("routePolicies"),
                        `"${parseCase(op.container.name).camelCase}"`,
                        `"${parseCase(op.operation.name).camelCase}"`,
                        rawOperationRefkey(canonical),
                      ]}
                    />
                  </ts.ObjectProperty>
                );
              }}
            </ay.For>
          </ts.ObjectExpression>
          ;
        </ts.VarDeclaration>
        <hbr />
        <hbr />
        <ts.VarDeclaration const name="dispatch" refkey={local("dispatch")}>
          <ts.FunctionCallExpression
            target={HELPERS.router.createPolicyChain}
            args={[
              `"${routerName}Dispatch"`,
              ay.code`${optionsRefkey}.policies ?? []`,
              <RouteHandler
                impl={implParamKey}
                handlers={local("routeHandlers")}
                service={service}
                backends={backends}
              />,
            ]}
          />
        </ts.VarDeclaration>
        ;
        <hbr />
        <hbr />
        <ts.VarDeclaration
          const
          name="errorHandlers"
          refkey={local("errorHandlers")}
        >
          <ts.ObjectExpression>
            <ts.ObjectProperty
              name="onRequestNotFound"
              value={handlers.onRequestNotFound}
            />
            ,
            <hbr />
            <ts.ObjectProperty
              name="onInvalidRequest"
              value={handlers.onInvalidRequest}
            />
            ,
            <hbr />
            <ts.ObjectProperty
              name="onInternalError"
              value={handlers.onInternalError}
            />
          </ts.ObjectExpression>
        </ts.VarDeclaration>
        ;
        <hbr />
        <hbr />
        return{" "}
        <ts.ObjectExpression>
          <ts.ObjectProperty name="dispatch">
            <ts.FunctionExpression parameters={["request", "response"]}>
              <ts.VarDeclaration const name="ctx" refkey={local("ctx")}>
                <ts.ObjectExpression>
                  <ts.ObjectProperty name="request" value={"request"} />,
                  <hbr />
                  <ts.ObjectProperty name="response" value={"response"} />,
                  <hbr />
                  <ts.ObjectProperty
                    name="errorHandlers"
                    value={local("errorHandlers")}
                  />
                  ,
                </ts.ObjectExpression>
              </ts.VarDeclaration>
              ;
              <hbr />
              <hbr />
              return{" "}
              <ts.FunctionCallExpression
                target={local("dispatch")}
                args={[local("ctx"), "request"]}
              />
              .catch((e) {"=>"} {handlers.onInternalError}(ctx, e));
            </ts.FunctionExpression>
          </ts.ObjectProperty>
          ,
          <ay.Show when={options.express}>
            <hbr />
            <ts.ObjectProperty name="expressMiddleware">
              <ts.FunctionExpression parameters={["req", "res", "next"]}>
                <ts.VarDeclaration const name="ctx" refkey={local("ctx", 2)}>
                  <ts.ObjectExpression>
                    <ts.ObjectProperty name="request" value={"req"} />,
                    <hbr />
                    <ts.ObjectProperty name="response" value={"res"} />,
                    <hbr />
                    <ts.ObjectProperty name="errorHandlers">
                      <ts.ObjectExpression>
                        ...{local("errorHandlers")},
                        <hbr />
                        <ts.ObjectProperty name="onRequestNotFound">
                          <ts.FunctionExpression>next();</ts.FunctionExpression>
                        </ts.ObjectProperty>
                      </ts.ObjectExpression>
                    </ts.ObjectProperty>
                    ,
                  </ts.ObjectExpression>
                </ts.VarDeclaration>
                ;
                <hbr />
                <hbr />
                void{" "}
                <ts.FunctionCallExpression
                  target={local("dispatch")}
                  args={[local("ctx", 2), "req"]}
                />
                .catch((e) {"=>"} {handlers.onInternalError}(ctx, e));
              </ts.FunctionExpression>
            </ts.ObjectProperty>
          </ay.Show>
        </ts.ObjectExpression>
        ;
      </ts.FunctionDeclaration>
    </ts.SourceFile>
  );

  function local(name: string, idx: number = 0): ay.Refkey {
    return ay.refkey(LOCAL, name, idx);
  }
}
