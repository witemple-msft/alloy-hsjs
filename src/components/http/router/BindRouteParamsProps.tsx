import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import { RouteTree } from "../../../core/http/route-tree.js";
import { RouteNode } from "./RouteNode.jsx";
import { RouteHandlerProps, WithRouteParams } from "./util.jsx";

/**
 * Properties for a route tree parameter binding node.
 */

export interface BindRouteParamsProps extends RouteHandlerProps {
  routeTree: RouteTree & { bind: [Set<string>, RouteTree] };
}
/**
 * Bind parameters from a given route tree.
 */

export function BindRouteParams(props: BindRouteParamsProps) {
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
