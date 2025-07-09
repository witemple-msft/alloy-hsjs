import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import { useServiceContext } from "../../service/Service.jsx";
import { RawOperation } from "./RawOperation.jsx";

export function ServerRaw() {
  const service = useServiceContext();

  return (
    <ts.SourceFile path="server-raw.ts">
      <ay.For each={service.operations} doubleHardline>
        {(operation) => <RawOperation operation={operation} />}
      </ay.For>
    </ts.SourceFile>
  );
}
