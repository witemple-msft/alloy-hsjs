// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

export function Literal(props: {
  value: string | number | boolean | null | bigint;
}) {
  switch (typeof props.value) {
    case "string":
      return JSON.stringify(props.value);
    case "number":
      return String(props.value);
    case "boolean":
      return props.value ? "true" : "false";
    case "bigint":
      return String(props.value) + "n";
    case "object":
      if (props.value === null) {
        return "null";
      }
    // eslint-disable-next-line no-fallthrough
    default:
      throw new Error("Unsupported literal type: " + typeof props.value);
  }
}
