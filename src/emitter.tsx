import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";
import { EmitContext } from "@typespec/compiler";
import { writeOutput } from "@typespec/emitter-framework";
import { JsServerEmitterOptions } from "./lib.js";
import { JsServerOutput } from "./components/JsServerOutput.jsx";
// import { hsjsDependencies } from "../generated-defs/package.json.js";
// import { HELPERS, HelperTree } from "../generated-defs/helpers.jsx";

// const extrasContext = ay.createContext<ay.Reactive<Set<string>>>();

// const useExtras = function useExtras(): ay.Reactive<Set<string>> | undefined {
//   return ay.useContext(extrasContext);
// };

// const ExtrasProvider = extrasContext.Provider;

/**
 * Main function to handle the emission process.
 * @param context - The context for the emission process.
 */
export async function $onEmit(context: EmitContext<JsServerEmitterOptions>) {
  // const packageName = context.options["package-name"] ?? "test-package";

  // const extras = ay.reactive(new Set<string>());

  // const myFunction = ay.refkey();

  // const express = ts.createPackage({
  //   name: "express",
  //   descriptor: {
  //     ".": {
  //       default: "express",
  //       named: [
  //         {
  //           name: "Application",
  //           staticMembers: ["default"],
  //           instanceMembers: ["use"],
  //         },
  //       ],
  //     },
  //   },
  //   version: hsjsDependencies.express,
  // });

  // const output = (
  //   <JsServerOutput context={context} externals={[ts.node.fs, express]}>
  //     <ExtrasProvider value={extras}>
  //       <ts.PackageDirectory
  //         name={packageName}
  //         version="0.1.0"
  //         path="."
  //         scripts={{ build: "tsc" }}
  //         devDependencies={{ "@types/node": hsjsDependencies["@types/node"] }}
  //       >
  //         <ay.SourceDirectory path="src">
  //           <HelperTree />
  //           <ay.For each={extras.values()}>
  //             {(decl) => (
  //               <ts.SourceFile path={`${decl}.ts`}>
  //                 <ay.StatementList>
  //                   <Example />
  //                   <ts.VarDeclaration
  //                     const
  //                     name="app"
  //                     initializer={
  //                       <ts.NewExpression target={express.Application} />
  //                     }
  //                   />
  //                   <ts.VarDeclaration
  //                     const
  //                     name={"myFunction"}
  //                     initializer={'"asdf"'}
  //                     doc={"Example documentation."}
  //                   />
  //                   <ts.VarDeclaration
  //                     export
  //                     const
  //                     name={"foo"}
  //                     initializer={ay.code`${(<ts.FunctionCallExpression target={myFunction} />)} + ${(<ts.FunctionCallExpression target={HELPERS.header.parseHeaderValueParameters} />)}.length`}
  //                     // initializer={ay.code`${(<ts.FunctionCallExpression target={myFunction} />)}`}
  //                   />
  //                 </ay.StatementList>
  //               </ts.SourceFile>
  //             )}
  //           </ay.For>
  //           <Lazy refkey={myFunction} />
  //         </ay.SourceDirectory>
  //       </ts.PackageDirectory>
  //     </ExtrasProvider>
  //   </JsServerOutput>
  // );

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

// function Example() {
//   const params: ts.ParameterDescriptor[] = [
//     {
//       name: "name",
//       type: "string",
//       doc: "The name of the file to write.",
//       refkey: ay.refkey(),
//     },
//     {
//       name: "content",
//       type: "string",
//       doc: "The content to write to the file.",
//       refkey: ay.refkey(),
//     },
//   ];

//   return (
//     <ts.FunctionDeclaration
//       export
//       async
//       name="exWriteFile"
//       parameters={params}
//       returnType="Promise<void>"
//     >
//       return {ts.node.fs["./promises"].writeFile}({params[0].refkey},{" "}
//       {params[1].refkey}
//       );
//     </ts.FunctionDeclaration>
//   );
// }

// function Lazy(props: { refkey: ay.Refkey }) {
//   const extras = useExtras();

//   if (!extras) return <></>;

//   extras.add("test");

//   return (
//     <ts.SourceFile path="deferred.ts">
//       <ts.FunctionDeclaration
//         export
//         name="myFunction"
//         refkey={props.refkey}
//         returnType="number"
//       >
//         return 42;
//       </ts.FunctionDeclaration>
//     </ts.SourceFile>
//   );
// }
