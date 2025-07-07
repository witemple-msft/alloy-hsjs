import { EmitContext } from "@typespec/compiler";
import { writeOutput } from "@typespec/emitter-framework";
import { JsServerEmitterOptions } from "./lib.js";
import { JsServerOutput } from "./components/JsServerOutput.jsx";

/**
 * Main function to handle the emission process.
 * @param context - The context for the emission process.
 */
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
