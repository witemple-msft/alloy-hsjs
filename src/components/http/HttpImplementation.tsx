import * as ay from "@alloy-js/core";
import { ServerRaw } from "./server/ServerRaw.jsx";
import { Router } from "./router/Router.jsx";

export function HttpImplementation() {
  return (
    <ay.SourceDirectory path="http">
      <Router />
      <ServerRaw />
    </ay.SourceDirectory>
  );
}
