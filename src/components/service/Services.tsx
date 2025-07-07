import * as ay from "@alloy-js/core";

import { useEmitContext } from "../JsServerOutput.jsx";
import { ServiceDirectory } from "./ServiceDirectory.jsx";
import { Service } from "./Service.jsx";
import { getAllHttpServices } from "@typespec/http";

export function Services() {
  const { program } = useEmitContext();

  const [services] = getAllHttpServices(program);

  return (
    <ay.Switch>
      <ay.Match when={services.length === 0}>
        <></>
      </ay.Match>
      <ay.Match when={services.length === 1}>
        <Service service={services[0]} />
      </ay.Match>
      <ay.Match else>
        <ay.For each={services}>
          {(service) => <ServiceDirectory service={service} />}
        </ay.For>
      </ay.Match>
    </ay.Switch>
  );
}
