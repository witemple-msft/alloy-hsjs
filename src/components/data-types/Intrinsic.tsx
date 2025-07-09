import * as ay from "@alloy-js/core";

import { IntrinsicType } from "@typespec/compiler";

export function Intrinsic(props: { type: IntrinsicType }) {
  return (
    <ay.Switch>
      <ay.Match when={props.type.name === "never"}>never</ay.Match>
      <ay.Match when={props.type.name === "null"}>null</ay.Match>
      <ay.Match when={props.type.name === "void"}>void</ay.Match>
      <ay.Match else>unknown</ay.Match>
    </ay.Switch>
  );
}
