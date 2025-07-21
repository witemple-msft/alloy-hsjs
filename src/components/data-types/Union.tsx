import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import { Type, Union as UnionType } from "@typespec/compiler";
import { Reference } from "./Reference.jsx";
import { TypeShape } from "../../plugins/ExprShape.jsx";

export class UnionShape extends TypeShape<UnionType> {
  renderTypeRef() {
    return <Union type={this.type} />;
  }
}

export function Union(props: { type: UnionType }) {
  // TODO: if union is discriminated.

  return (
    <group>
      <indent>
        <ifBreak>
          <sbr />|{" "}
        </ifBreak>
        <ay.For
          each={props.type.variants}
          joiner={
            <>
              <sbr />
              <ifBreak flatContents={" "}>
                <></>
              </ifBreak>
              |{" "}
            </>
          }
        >
          {(_, variant) => <Reference type={variant} />}
        </ay.For>
      </indent>
    </group>
  );
}

// TODO: bad duplication
export function UnionLike(props: { variants: Type[] }) {
  return (
    <group>
      <indent>
        <ifBreak>
          <sbr />|{" "}
        </ifBreak>
        <ay.For
          each={props.variants}
          joiner={
            <>
              <sbr />
              <ifBreak flatContents={" "}>
                <></>
              </ifBreak>
              |{" "}
            </>
          }
        >
          {(variant) => <Reference type={variant} />}
        </ay.For>
      </indent>
    </group>
  );
}
