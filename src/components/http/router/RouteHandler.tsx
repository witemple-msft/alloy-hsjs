import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";
import { OperationContainer } from "@typespec/compiler";
import { HttpService } from "@typespec/http";
import { HELPERS } from "../../../../generated-defs/helpers.jsx";
import { useRouteTree } from "../../../core/http/route-tree.js";
import { ReCase } from "../../../util/case.js";
import { EXTERNALS } from "../../JsServerOutput.jsx";
import { RouteNode } from "./RouteNode.jsx";

export function RouteHandler(props: {
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
