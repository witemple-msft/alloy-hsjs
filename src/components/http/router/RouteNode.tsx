import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";
import { RouteTree } from "../../../core/http/route-tree.js";
import { Dispatch } from "./Dispatch.jsx";
import {
  BindRouteParams,
  BindRouteParamsProps,
} from "./BindRouteParamsProps.jsx";
import { RouteHandlerProps } from "./util.jsx";

/**
 * Properties for the route tree component.
 */
interface RouteNodeProps extends RouteHandlerProps {
  /** The route tree to generate. */
  routeTree: RouteTree;
}
/**
 * Generate the routing logic for a single route tree node.
 */

export function RouteNode(props: RouteNodeProps) {
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
