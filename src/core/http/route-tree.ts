import { Operation, OperationContainer, Type } from "@typespec/compiler";
import {
  getHttpOperation,
  HttpOperation,
  HttpService,
  HttpVerb,
} from "@typespec/http";
import { useCanonicalizedOperation } from "./operation.js";
import { useEmitContext } from "../../components/JsServerOutput.jsx";
import { bifilter } from "../../util/iter.js";

/**
 * A tree of routes in an HTTP router domain.
 */
export interface RouteTree {
  /**
   * A list of operations that can be dispatched at this node.
   */
  operations: Map<HttpVerb, RouteOperation[]>;
  /**
   * A set of parameters that are bound in this position before proceeding along the subsequent tree.
   */
  bind?: [Set<string>, RouteTree];
  /**
   * A list of static edges that can be taken from this node.
   */
  edges: RouteTreeEdge[];
}

/**
 * An edge in the route tree. The edge contains a literal string prefix that must match before the next node is visited.
 */
export type RouteTreeEdge = readonly [string, RouteTree];

/**
 * An operation that may be dispatched at a given tree node.
 */
export interface RouteOperation {
  /**
   * The HTTP operation corresponding to this route operation.
   */
  operation: Operation;
  /**
   * The operation's container.
   */
  container: OperationContainer;
  /**
   * The path parameters that the route template for this operation binds.
   */
  parameters: RouteParameter[];
  /**
   * The HTTP verb (GET, PUT, etc.) that this operation requires.
   */
  verb: HttpVerb;
}

/**
 * A single route split into segments of strings and parameters.
 */
export interface Route extends RouteOperation {
  segments: RouteSegment[];
}

/**
 * A segment of a single route.
 */
export type RouteSegment = string | RouteParameter;

/**
 * A parameter in the route segment with its expected type.
 */
export interface RouteParameter {
  name: string;
  type: Type;
}

/**
 * Create a route tree for a given service.
 */
export function useRouteTree(service: HttpService): RouteTree {
  const { program } = useEmitContext();
  // First get the Route for each operation in the service.
  const routes = service.operations.map(function (operation) {
    const canonicalOperation = useCanonicalizedOperation(operation.operation);
    const [httpOperation] = getHttpOperation(program, canonicalOperation);
    const segments = getRouteSegments(httpOperation);
    return {
      operation: canonicalOperation,
      container: operation.container,
      verb: httpOperation.verb,
      parameters: segments.filter((segment) => typeof segment !== "string"),
      segments,
    } as Route;
  });

  // Build the tree by iteratively removing common prefixes from the text segments.

  const tree = intoRouteTree(routes);

  return tree;
}

/**
 * Build a route tree from a list of routes.
 *
 * This iteratively removes common segments from the routes and then for all routes matching a given common prefix,
 * builds a nested tree from their subsequent segments.
 *
 * @param routes - the routes to build the tree from
 */
function intoRouteTree(routes: Route[]): RouteTree {
  const [operations, rest] = bifilter(
    routes,
    (route) => route.segments.length === 0
  );
  const [literal, parameterized] = bifilter(
    rest,
    (route) => typeof route.segments[0]! === "string"
  );

  const edgeMap = new Map<string, Route[]>();

  // Group the routes by common prefix

  outer: for (const literalRoute of literal) {
    const segment = literalRoute.segments[0] as string;

    for (const edge of [...edgeMap.keys()]) {
      const prefix = commonPrefix(segment, edge);

      if (prefix.length > 0) {
        const existing = edgeMap.get(edge)!;
        edgeMap.delete(edge);
        edgeMap.set(prefix, [...existing, literalRoute]);
        continue outer;
      }
    }

    edgeMap.set(segment, [literalRoute]);
  }

  const edges = [...edgeMap.entries()].map(
    ([edge, routes]) =>
      [
        edge,
        intoRouteTree(
          routes.map(function removePrefix(route) {
            const [prefix, ...rest] = route.segments as [
              string,
              ...RouteSegment[],
            ];

            if (prefix === edge) {
              return { ...route, segments: rest };
            } else {
              return {
                ...route,
                segments: [prefix.substring(edge.length), ...rest],
              };
            }
          })
        ),
      ] as const
  );

  let bind: [Set<string>, RouteTree] | undefined;

  if (parameterized.length > 0) {
    const parameters = new Set<string>();
    const nextRoutes: Route[] = [];
    for (const parameterizedRoute of parameterized) {
      const [{ name }, ...rest] = parameterizedRoute.segments as [
        RouteParameter,
        ...RouteSegment[],
      ];

      parameters.add(name);
      nextRoutes.push({ ...parameterizedRoute, segments: rest });
    }

    bind = [parameters, intoRouteTree(nextRoutes)];
  }

  const operationMap = new Map<HttpVerb, RouteOperation[]>();

  for (const operation of operations) {
    let operations = operationMap.get(operation.verb);
    if (!operations) {
      operations = [];
      operationMap.set(operation.verb, operations);
    }

    operations.push(operation);
  }

  return {
    operations: operationMap,
    bind,
    edges,
  };

  function commonPrefix(a: string, b: string): string {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) {
      i++;
    }
    return a.substring(0, i);
  }
}

function getRouteSegments(operation: HttpOperation): RouteSegment[] {
  // Parse the route template into segments of "prefixes" (i.e. literal strings)
  // and parameters (names enclosed in curly braces). The "/" character does not
  // actually matter for this. We just want to know what the segments of the route
  // are.
  //
  // Examples:
  //  "" => []
  //  "/users" => ["/users"]
  //  "/users/{userId}" => ["/users/", {name: "userId"}]
  //  "/users/{userId}/posts/{postId}" => ["/users/", {name: "userId"}, "/posts/", {name: "postId"}]

  const segments: RouteSegment[] = [];

  const parameterTypeMap = new Map<string, Type>(
    [...operation.parameters.parameters.values()].map(
      (p) =>
        [
          p.param.name,
          p.param.type.kind === "ModelProperty"
            ? p.param.type.type
            : p.param.type,
        ] as const
    )
  );

  let remainingTemplate = operation.path;

  while (remainingTemplate.length > 0) {
    // Scan for next `{` character
    const openBraceIndex = remainingTemplate.indexOf("{");

    if (openBraceIndex === -1) {
      // No more parameters, just add the remaining string as a segment
      segments.push(remainingTemplate);
      break;
    }

    // Add the prefix before the parameter, if there is one
    if (openBraceIndex > 0) {
      segments.push(remainingTemplate.substring(0, openBraceIndex));
    }

    // Scan for next `}` character
    const closeBraceIndex = remainingTemplate.indexOf("}", openBraceIndex);

    if (closeBraceIndex === -1) {
      // This is an error in the HTTP layer, so we'll just treat it as if the parameter ends here
      // and captures the rest of the string as its name.
      segments.push({
        name: remainingTemplate.substring(openBraceIndex + 1),
        type: undefined as any,
      });
      break;
    }

    // Extract the parameter name
    const parameterName = remainingTemplate.substring(
      openBraceIndex + 1,
      closeBraceIndex
    );

    segments.push({
      name: parameterName,
      type: parameterTypeMap.get(parameterName)!,
    });

    // Move to the next segment
    remainingTemplate = remainingTemplate.substring(closeBraceIndex + 1);
  }

  return segments;
}
