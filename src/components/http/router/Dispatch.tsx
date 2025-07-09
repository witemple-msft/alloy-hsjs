import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import { RouteTree, RouteOperation } from "../../../core/http/route-tree.js";
import { EXTERNALS, useEmitContext } from "../../JsServerOutput.jsx";
import {
  containerRefkey,
  operationImplRefkey,
  RouteHandlerProps,
  useRouteParams,
} from "./util.js";
import {
  CodeTree,
  PreciseType,
  useDifferentiateModelTypes,
} from "../../../util/differentiate.jsx";
import { getHeaderFieldName, isHeader } from "@typespec/http";
import { Model, ModelProperty, UnknownType } from "@typespec/compiler";

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
                  <CallImpl operation={ops[0]} {...props} />
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
  const { program } = useEmitContext();

  const headers = ay.memberRefkey(
    props.params.request,
    EXTERNALS["node:http"].IncomingMessage.instance.headers
  );

  const operationParamsMap = new Map<Model, RouteOperation>(
    props.operations.map((op) => [op.operation.parameters, op])
  );

  const differentiated = useDifferentiateModelTypes(operationParamsMap, {
    renderPropertyName(prop) {
      return getHeaderFieldName(program, prop);
    },
    filter(prop) {
      return isHeader(program, prop);
    },
    else: {
      kind: "verbatim",
      body: ay.code`return ${props.locals.notFound};`,
    },
  });

  return (
    <CodeTree
      tree={differentiated}
      referenceModelProperty={referenceModelProperty}
      renderResult={renderResult}
      subject={headers}
    />
  );

  function referenceModelProperty(p: ModelProperty) {
    const headerFieldName = getHeaderFieldName(program, p);

    return ay.code`${headers}[${JSON.stringify(headerFieldName)}]`;
  }

  function renderResult(type: PreciseType | UnknownType) {
    const model = type as Model;

    const operation = operationParamsMap.get(model)!;

    return <CallImpl operation={operation} {...props} />;
  }
}

interface CallImplProps extends RouteHandlerProps {
  operation: RouteOperation;
}

function CallImpl(props: CallImplProps) {
  const routeParams = useRouteParams();

  const args: ay.Children[] = [
    props.params.ctx,
    ay.memberRefkey(
      props.implParam,
      containerRefkey(props.operation.container)
    ),
  ];

  if (props.operation.parameters.length > 0) {
    args.push(
      <ts.ObjectExpression>
        <ay.For each={props.operation.parameters} comma enderPunctuation>
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
        target={operationImplRefkey(props.operation.operation)}
        args={args}
      />
      ;
    </>
  );
}
