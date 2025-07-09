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
import {
  RouteOperation,
  RouteTree,
  useRouteTree,
} from "../../../core/http/route-tree.js";

const ROUTER = Symbol.for("TypeSpec.HSJS.Router");

/**
 * Get the router type reference key for a service.
 * @param service The HTTP service.
 * @returns The router reference key.
 */
export function routerRefkey(service: HttpService): ay.Refkey {
  return ay.refkey(ROUTER, service);
}

const IMPL = Symbol.for("TypeSpec.HSJS.Router.Impl");

/**
 * Get the customer implementation type reference key for a service.
 * @param service The HTTP service.
 * @returns The implementation reference key.
 */
export function implRefkey(service: HttpService): ay.Refkey {
  return ay.refkey(ROUTER, IMPL, service);
}

const CONTAINER = Symbol.for("TypeSpec.HSJS.Router.Container");

/**
 * Gets the reference key for a particular operation container.
 * @param container The operation container.
 * @returns The container reference key.
 */
export function containerRefkey(container: OperationContainer): ay.Refkey {
  return ay.refkey(CONTAINER, container);
}

const OPERATION = Symbol.for("TypeSpec.HSJS.Router.Operation");

/**
 * Gets the reference key for a particular operation.
 *
 * You MUST provide a CANONICALIZED operation. See {@link useCanonicalizedOperation}.
 *
 * @param operation The operation.
 * @returns The operation reference key.
 */
function operationRefkey(operation: Operation): ay.Refkey {
  return ay.refkey(OPERATION, operation);
}

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

/**
 * Generates the router backend logic implementation interface for the given HTTP service and its operation containers.
 */
function RouterLogicImpl(props: {
  /** The HTTP service to generate for. */
  service: HttpService;
  /** The operation containers in the router. */
  backends: Map<OperationContainer, [ReCase, ay.Children]>;
  /** An reference key to bind the implementation type to. */
  refkey: ay.Refkey;
}) {
  const serviceName = parseCase(props.service.namespace.name).pascalCase;
  const serviceFqn = getFullyQualifiedTypeName(props.service.namespace);

  const implName = serviceName + "Impl";

  return (
    <ts.InterfaceDeclaration
      export
      name={serviceName + "Impl"}
      kind="type"
      refkey={props.refkey}
      doc={`Business logic implementation for the '${serviceFqn}' service.`}
    >
      <ay.For each={props.backends}>
        {(container, [name, ref]) => (
          <>
            <ts.InterfaceMember
              name={name.camelCase}
              type={ay.code`${ref}<${HELPERS.router.HttpContext}>`}
              doc={`The '${name.pascalCase}' backend for the '${serviceFqn}' service.`}
              refkey={containerRefkey(container)}
            />
            ;
          </>
        )}
      </ay.For>
    </ts.InterfaceDeclaration>
  );
}

function RouteHandler(props: {
  impl: ay.Refkey;
  service: HttpService;
  backends: Map<OperationContainer, [ReCase, ay.Children]>;
  handlers: ay.Refkey;
}) {
  const notFound = ay.refkey();

  const params = {
    ctx: ay.refkey(),
    request: ay.refkey(),
  };

  const locals = {
    path: ay.refkey(),
    notFound: <ts.FunctionCallExpression target={notFound} />,
    fragmentIndex: ay.refkey(),
  };

  const paramDescriptors: ts.ParameterDescriptor[] = [
    { name: "ctx", refkey: params.ctx, type: HELPERS.router.HttpContext },
    {
      name: "request",
      refkey: params.request,
      type: EXTERNALS["node:http"].IncomingMessage,
    },
  ];

  const routeTree = useRouteTree(props.service);

  return (
    <ts.FunctionExpression
      parameters={paramDescriptors}
      returnType="Promise<void>"
    >
      <ts.VarDeclaration let name="path" refkey={locals.path}>
        {ay.memberRefkey(
          params.request,
          EXTERNALS["node:http"].IncomingMessage.instance.url
        )}
        ?.split("?", 1)[0] ?? "/"
      </ts.VarDeclaration>
      ;
      <hbr />
      <hbr />
      <RouteNode
        implParam={props.impl}
        handlers={props.handlers}
        routeTree={routeTree}
        locals={locals}
        params={params}
        backends={props.backends}
      />
      <hbr />
      <hbr />
      return {locals.notFound};
      <hbr />
      <hbr />
      <ts.FunctionDeclaration name="notFound" refkey={notFound}>
        {params.ctx}.errorHandlers.onRequestNotFound({params.ctx});
        <hbr />
        return globalThis.Promise.resolve();
      </ts.FunctionDeclaration>
      <hbr />
      <hbr />
      <ts.FunctionDeclaration
        name="fragmentIndex"
        parameters={["path: string"]}
        refkey={locals.fragmentIndex}
        returnType="number"
      >
        const idx = path.indexOf("/");
        <hbr />
        <hbr />
        return idx + ((idx {">>"} 31) & (path.length - idx));
      </ts.FunctionDeclaration>
    </ts.FunctionExpression>
  );
}

/**
 * Properties for all route handler components.
 */
interface RouteHandlerProps {
  /** The reference key for the route handlers. */
  handlers: ay.Refkey;
  /** The operation container backends. */
  backends: Map<OperationContainer, [ReCase, ay.Children]>;
  /** A reference key for the service implementation parameter */
  implParam: ay.Refkey;
  /** Local variables bound in the router implementation. */
  locals: {
    path: ay.Refkey;
    notFound: ay.Children;
    fragmentIndex: ay.Refkey;
  };
  /** Parameters bound in the router dispatch function. */
  params: {
    ctx: ay.Refkey;
    request: ay.Refkey;
  };
}

/**
 * Properties for the route tree component.
 */
interface RouteTreeProps extends RouteHandlerProps {
  /** The route tree to generate. */
  routeTree: RouteTree;
}

const ROUTE_PARAM_CONTEXT = ay.createContext<Record<string, ay.Refkey>>({});

function useRouteParams() {
  return ay.useContext(ROUTE_PARAM_CONTEXT)!;
}

function WithRouteParams(props: {
  routeParams: Record<string, ay.Refkey>;
  children: ay.Children;
}) {
  const routeParams = useRouteParams();

  return (
    <ROUTE_PARAM_CONTEXT.Provider
      value={{ ...routeParams, ...props.routeParams }}
    >
      {props.children}
    </ROUTE_PARAM_CONTEXT.Provider>
  );
}

/**
 * Generate the routing logic for a single route tree node.
 */
function RouteNode(props: RouteTreeProps) {
  const { routeTree } = props;

  const mustTerminate = routeTree.edges.length === 0 && !routeTree.bind;

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
              implParam={props.implParam}
              operations={routeTree.operations}
            />
          </ay.Match>
          <ay.Match else>return {props.locals.notFound};</ay.Match>
        </ay.Switch>
      </ts.IfStatement>
      <ay.Show when={mustTerminate}>
        <ts.ElseClause>return {props.locals.notFound};</ts.ElseClause>
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
        <BindRouteParams
          {...props}
          routeTree={routeTree as BindRouteParamsProps["routeTree"]}
        />
      </ay.Show>
    </>
  );
}

/**
 * Properties for a route tree parameter binding node.
 */
interface BindRouteParamsProps extends RouteHandlerProps {
  routeTree: RouteTree & { bind: [Set<string>, RouteTree] };
}

/**
 * Bind parameters from a given route tree.
 */
function BindRouteParams(props: BindRouteParamsProps) {
  const [parameterSet, nextTree] = props.routeTree.bind;
  const parameters = Array.from(parameterSet);

  const paramName =
    parameters.length === 1 ? parameters[0] : parameters.join("_");

  const idx = ay.refkey();

  const paramBindingKey = ay.refkey();

  const routeParamBindings = Object.fromEntries(
    parameters.map((p) => [p, paramBindingKey])
  );

  return (
    <ts.ElseClause>
      <ts.VarDeclaration let name="idx" refkey={idx}>
        {props.locals.fragmentIndex}({props.locals.path})
      </ts.VarDeclaration>
      ;
      <hbr />
      <ts.VarDeclaration const name={paramName} refkey={paramBindingKey}>
        {props.locals.path}.slice(0, {idx})
      </ts.VarDeclaration>
      ;
      <hbr />
      {props.locals.path} = {props.locals.path}.slice({idx});
      <hbr />
      <hbr />
      <WithRouteParams routeParams={routeParamBindings}>
        <RouteNode {...props} routeTree={nextTree} />
      </WithRouteParams>
    </ts.ElseClause>
  );
}

/**
 * Properties for the Dispatch component.
 */
interface DispatchProps extends RouteHandlerProps {
  /** The operations mounted at the route's node. */
  operations: RouteTree["operations"];
}

/**
 * Dispatch the request to the appropriate operation based on the HTTP verb.
 */
function Dispatch(props: DispatchProps) {
  return (
    <ts.SwitchStatement
      expression={ay.memberRefkey(
        props.params.request,
        EXTERNALS["node:http"].IncomingMessage.instance.method
      )}
    >
      <ay.For each={props.operations}>
        {(verb, ops) => {
          return (
            <ts.CaseClause
              expression={JSON.stringify(verb.toUpperCase())}
              block
            >
              <ay.Switch>
                <ay.Match when={ops.length === 1}>
                  {() => {
                    const [op] = ops;

                    const routeParams = useRouteParams();

                    const args: ay.Children[] = [
                      props.params.ctx,
                      ay.memberRefkey(
                        props.implParam,
                        containerRefkey(ops[0].container)
                      ),
                    ];

                    if (op.parameters.length > 0) {
                      args.push(
                        <ts.ObjectExpression>
                          <ay.For each={op.parameters} comma enderPunctuation>
                            {(param) => (
                              <ts.ObjectProperty
                                name={param.name}
                                value={routeParams[param.name]!}
                              ></ts.ObjectProperty>
                            )}
                          </ay.For>
                        </ts.ObjectExpression>
                      );
                    }

                    return (
                      <>
                        return{" "}
                        <ts.FunctionCallExpression
                          target={operationRefkey(ops[0].operation)}
                          args={args}
                        />
                        ;
                      </>
                    );
                  }}
                </ay.Match>
                <ay.Match else>
                  <DispatchMultiple {...props} operations={ops} />
                </ay.Match>
              </ay.Switch>
            </ts.CaseClause>
          );
        }}
      </ay.For>
      <hbr />
      <ts.CaseClause default block>
        return {props.locals.notFound};
      </ts.CaseClause>
    </ts.SwitchStatement>
  );
}

/**
 * Properties for the DispatchMultiple component.
 */
interface DispatchMultipleProps extends RouteHandlerProps {
  /** The operations that can be dispatched in this node. */
  operations: RouteOperation[];
}

/**
 * Dispatch one of multiple operations based on route differentiators.
 */
function DispatchMultiple(props: DispatchMultipleProps) {
  // TODO: need to implement differentiator
  return <></>;
}
