import * as ay from "@alloy-js/core";

import { HttpService } from "@typespec/http";
import { parseCase } from "../../util/case.js";
import { Service } from "./Service.jsx";

export function ServiceDirectory(props: { service: HttpService }) {
  const serviceName = parseCase(
    props.service.namespace?.name ?? "Service"
  ).kebabCase;

  return (
    <ay.SourceDirectory path={serviceName}>
      <Service service={props.service} />
    </ay.SourceDirectory>
  );
}
