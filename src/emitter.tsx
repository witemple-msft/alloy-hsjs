// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

import { EmitContext } from "@typespec/compiler";
import { writeOutput } from "@typespec/emitter-framework";
import { JsServerEmitterOptions } from "./lib.js";
import { JsServerOutput } from "./components/JsServerOutput.jsx";

export async function $onEmit(context: EmitContext<JsServerEmitterOptions>) {
  try {
    await context.program.host.stat(context.emitterOutputDir);
    await context.program.host.rm(context.emitterOutputDir, {
      recursive: true,
    });
  } catch {}

  await writeOutput(
    context.program,
    <JsServerOutput context={context} />,
    context.emitterOutputDir
  );
}
