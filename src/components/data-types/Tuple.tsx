import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import { Tuple as TupleType } from "@typespec/compiler";
import { Reference } from "./Reference.jsx";

export function Tuple(props: { type: TupleType }) {
  ts.ArrayExpression;
  return (
    <group>
      [
      <indent>
        <sbr />
        <ay.For
          each={props.type.values}
          joiner={
            <ifBreak flatContents=", ">
              ,<sbr />
            </ifBreak>
          }
          ender={<ifBreak>,</ifBreak>}
        >
          {(t) => <Reference type={t} />}
        </ay.For>
      </indent>
      <sbr />]
    </group>
  );
}
