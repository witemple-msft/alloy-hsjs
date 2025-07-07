// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

import { Namespace, Type } from "@typespec/compiler";

/**
 * A TypeSpec type that may be attached to a namespace.
 */
export type NamespacedType = Extract<
  Type,
  { namespace?: Namespace | undefined }
>;

/**
 * Computes the fully-qualified name of a TypeSpec type, i.e. `TypeSpec.boolean` for the built-in `boolean` scalar.
 */
export function getFullyQualifiedTypeName(type: NamespacedType): string {
  const name = type.name ?? "<unknown>";
  if (type.namespace) {
    const nsPath = _getFullyQualifiedNamespacePath(type.namespace);

    if (nsPath.length === 0) return name;

    return (nsPath[0] === "" ? nsPath.slice(1) : nsPath).join(".") + "." + name;
  } else {
    return name;
  }
}

/**
 * Computes the fully-qualified path to a TypeSpec type, including all parent namespaces.
 * @param ns - The namespace to compute the path for.
 * @returns An array of strings representing the fully-qualified path to the namespace.
 */
export function getFullyQualifiedTypePath(type: NamespacedType): string[] {
  const name = type.name ?? "unknown";
  const path = type.namespace
    ? _getFullyQualifiedNamespacePath(type.namespace)
    : [];

  path.push(name);

  return path;
}

function _getFullyQualifiedNamespacePath(ns: Namespace): string[] {
  if (ns.namespace) {
    const innerPath = _getFullyQualifiedNamespacePath(ns.namespace);
    innerPath.push(ns.name);
    return innerPath;
  } else if (ns.name) {
    return [ns.name];
  } else {
    return [];
  }
}
