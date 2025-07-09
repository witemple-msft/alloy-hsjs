import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import { RouteTree, RouteOperation } from "../../../core/http/route-tree.js";
import { EXTERNALS } from "../../JsServerOutput.jsx";
import {
  containerRefkey,
  operationImplRefkey,
  RouteHandlerProps,
  useRouteParams,
} from "./util.js";

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
export function Dispatch(props: DispatchProps) {
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
                          target={operationImplRefkey(ops[0].operation)}
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
