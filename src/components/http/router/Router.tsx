import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";
import { useServiceContext } from "../../service/Service.jsx";
import { parseCase, ReCase } from "../../../util/case.js";
import { getFullyQualifiedTypeName } from "../../../util/name.js";
import { EXTERNALS, useEmitContext } from "../../JsServerOutput.jsx";
import { HttpService } from "@typespec/http";
import { Operation, OperationContainer } from "@typespec/compiler";
import { Reference } from "../../data-types/Reference.jsx";
import { HELPERS } from "../../../../generated-defs/helpers.jsx";
import { rawOperationRefkey } from "../server/RawOperation.jsx";
import { useCanonicalizedOperation } from "../../../core/http/operation.js";
import { RouteTree, useRouteTree } from "../../../core/http/route-tree.js";

const ROUTER = Symbol.for("TypeSpec.HSJS.Router");

export function routerRefkey(service: HttpService): ay.Refkey {
  return ay.refkey(ROUTER, service);
}

const IMPL = Symbol.for("TypeSpec.HSJS.Router.Impl");

export function implRefkey(service: HttpService): ay.Refkey {
  return ay.refkey(ROUTER, IMPL, service);
}

const CONTAINER = Symbol.for("TypeSpec.HSJS.Router.Container");

export function containerRefkey(container: OperationContainer): ay.Refkey {
  return ay.refkey(CONTAINER, container);
}

const OPERATION = Symbol.for("TypeSpec.HSJS.Router.Operation");

function operationRefkey(operation: Operation): ay.Refkey {
  return ay.refkey(OPERATION, operation);
}

const LOCAL = Symbol.for("TypeSpec.HSJS.Router.Local");

export function Router() {
  const { options } = useEmitContext();
  const service = useServiceContext();

  const serviceName = parseCase(service.namespace.name).pascalCase;
  const serviceFqn = getFullyQualifiedTypeName(service.namespace);

  const routerName = serviceName + "Router";
  const routerKey = routerRefkey(service);

  const implName = serviceName + "Impl";
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
      <ay.For each={backends}>
        {(container, [name, ref]) => (
          <ts.InterfaceMember
            name={name.camelCase}
            type={ay.code`${ref}<${HELPERS.router.HttpContext}>;`}
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
      <ts.InterfaceDeclaration
        export
        name={implName}
        kind="type"
        refkey={implTypeKey}
        doc={`Business logic implementation for the '${serviceFqn}' service.`}
      >
        <ay.For each={backends}>
          {(container, [name, ref]) => (
            <>
              <ts.InterfaceMember
                name={name.camelCase}
                type={ref}
                doc={`The '${name.pascalCase}' backend for the '${serviceFqn}' service.`}
                refkey={containerRefkey(container)}
              />
              ;
            </>
          )}
        </ay.For>
      </ts.InterfaceDeclaration>
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
              ctx.response.end(JSON.stringify(error));
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
            <ay.For each={service.operations}>
              {(op) => {
                const canonical = useCanonicalizedOperation(op.operation);

                return (
                  <ts.ObjectProperty
                    name={
                      parseCase(op.container.name).snakeCase +
                      "_" +
                      parseCase(op.operation.name).snakeCase
                    }
                    refkey={operationRefkey(canonical)}
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
                args={[local("ctx"), "request", "response"]}
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
                  args={[local("ctx", 2), "req", "res"]}
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

function RouteHandler(props: {
  service: HttpService;
  backends: Map<OperationContainer, [ReCase, ay.Children]>;
  handlers: ay.Refkey;
}) {
  const params = {
    ctx: ay.refkey(),
    request: ay.refkey(),
    response: ay.refkey(),
  };

  const locals = {
    url: ay.refkey(),
    path: ay.refkey(),
  };

  const paramDescriptors: ts.ParameterDescriptor[] = [
    { name: "ctx", refkey: params.ctx },
    { name: "request", refkey: params.request },
    { name: "response", refkey: params.response },
  ];

  const routeTree = useRouteTree(props.service);

  return (
    <ts.FunctionExpression async parameters={paramDescriptors}>
      <ts.VarDeclaration const name="url" refkey={locals.url}>
        <ts.NewExpression
          target="globalThis.URL"
          args={[
            ay.code`${params.request}.url!`,
            ay.code`\`http://\${${params.request}.headers.host}\``,
          ]}
        />
      </ts.VarDeclaration>
      ;
      <hbr />
      <ts.VarDeclaration let name="path" refkey={locals.path}>
        {ay.code`${locals.url}.pathname`}
      </ts.VarDeclaration>
      ;
      <hbr />
      <hbr />
      <RouteNode
        handlers={props.handlers}
        routeTree={routeTree}
        locals={locals}
        params={params}
        backends={props.backends}
      />
      <hbr />
      <hbr />
      return {params.ctx}.errorHandlers.onRequestNotFound({params.ctx});
    </ts.FunctionExpression>
  );
}

interface RouteHandlerProps {
  handlers: ay.Refkey;
  backends: Map<OperationContainer, [ReCase, ay.Children]>;
  locals: {
    url: ay.Refkey;
    path: ay.Refkey;
  };
  params: {
    ctx: ay.Refkey;
    request: ay.Refkey;
    response: ay.Refkey;
  };
}

interface RouteTreeProps extends RouteHandlerProps {
  routeTree: RouteTree;
}

function RouteNode(props: RouteTreeProps) {
  const { routeTree } = props;

  const mustTerminate = routeTree.edges.length === 0 && !routeTree.bind;

  const onRouteNotFound = ay.code`${props.params.ctx}.errorHandlers.onRequestNotFound`;

  return (
    <>
      <ts.IfStatement condition={ay.code`${props.locals.path}.length === 0`}>
        <ay.Switch>
          <ay.Match when={routeTree.operations.size > 0}>
            <Dispatch
              locals={props.locals}
              backends={props.backends}
              handlers={props.handlers}
              params={props.params}
              operations={routeTree.operations}
            />
          </ay.Match>
          <ay.Match else>
            return {onRouteNotFound}({props.params.ctx});
          </ay.Match>
        </ay.Switch>
      </ts.IfStatement>
      <ay.Show when={mustTerminate}>
        <ts.ElseClause>
          return {onRouteNotFound}({props.params.ctx});
        </ts.ElseClause>
      </ay.Show>
      <ay.For each={routeTree.edges}>
        {([edge, next]) => {
          const edgePattern =
            edge.length === 1 ? `'${edge}'` : JSON.stringify(edge);
          return (
            <ts.ElseIfClause
              condition={ay.code`${props.locals.path}.startsWith(${edgePattern})`}
            >
              {props.locals.path} = {props.locals.path}.slice({edge.length});
              <hbr />
              <RouteNode {...props} routeTree={next} />
            </ts.ElseIfClause>
          );
        }}
      </ay.For>
      <ay.Show when={!!routeTree.bind}>
        <ts.ElseClause>
          <ts.VarDeclaration let name="idx" refkey={local("idx")}>
            {props.locals.path}.indexOf("/")
          </ts.VarDeclaration>
          ;
          <hbr />
          {local("idx")} = {local("idx")} === -1 ? {props.locals.path}.length :{" "}
          {local("idx")};
          <hbr />
          {() => {
            const [parameterSet, nextTree] = routeTree.bind!;
            const parameters = Array.from(parameterSet);

            const paramName =
              parameters.length === 1 ? parameters[0] : parameters.join("_");

            return (
              <ts.VarDeclaration const name={paramName} refkey={local("param")}>
                {props.locals.path}.slice({local("idx")})
              </ts.VarDeclaration>
            );
          }}
          <hbr />
        </ts.ElseClause>
      </ay.Show>
    </>
  );

  function local(name: string, idx: number = 0): ay.Refkey {
    return ay.refkey(LOCAL, routeTree, name, idx);
  }
}

interface DispatchProps extends RouteHandlerProps {
  operations: RouteTree["operations"];
}

function Dispatch(props: DispatchProps) {
  return (
    <ts.SwitchStatement expression={ay.code`${props.params.request}.method`}>
      <ay.For each={props.operations}>
        {(verb, ops) => {
          return (
            <ay.Switch>
              <ay.Match when={ops.length === 1}>
                <ts.CaseClause expression={JSON.stringify(verb.toUpperCase())}>
                  return{" "}
                  <ts.FunctionCallExpression
                    target={operationRefkey(ops[0].operation)}
                    args={[props.params.ctx]}
                  />
                  ;
                </ts.CaseClause>
              </ay.Match>
              <ay.Match else>
                <></>
              </ay.Match>
            </ay.Switch>
          );
        }}
      </ay.For>
      <hbr />
      <ts.CaseClause default>
        return {props.params.ctx}.errorHandlers.onRequestNotFound(
        {props.params.ctx}
        );
      </ts.CaseClause>
    </ts.SwitchStatement>
  );
}
