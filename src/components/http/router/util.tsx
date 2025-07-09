// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

import * as ay from "@alloy-js/core";

import { Operation, OperationContainer } from "@typespec/compiler";
import { HttpService } from "@typespec/http";
import { ReCase } from "../../../util/case.js";

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

const OPERATION_IMPL = Symbol.for("TypeSpec.HSJS.Router.Operation");

/**
 * Gets the reference key for a particular operation.
 *
 * You MUST provide a CANONICALIZED operation. See {@link useCanonicalizedOperation}.
 *
 * @param operation The operation.
 * @returns The operation reference key.
 */
export function operationImplRefkey(operation: Operation): ay.Refkey {
  return ay.refkey(OPERATION_IMPL, operation);
}

const ROUTE_PARAM_CONTEXT = ay.createContext<Record<string, ay.Refkey>>({});

export function useRouteParams() {
  return ay.useContext(ROUTE_PARAM_CONTEXT)!;
}

export function WithRouteParams(props: {
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
 * Properties for all route handler components.
 */
export interface RouteHandlerProps {
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
