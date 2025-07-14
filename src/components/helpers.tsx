import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import { HttpService } from "@typespec/http";
import { useServiceContext } from "./service/Service.jsx";

export interface Helper {
  name: string;
  code: ay.Children;
  externalDependencies?: readonly string[];
}

const HELPERS_MAP = new WeakMap<
  HttpService,
  WeakMap<Helper, ay.Reactive<Map<string, ay.Refkey>>>
>();

function useHelperDecls(helper: Helper): ay.Reactive<Map<string, ay.Refkey>> {
  const service = useServiceContext();

  let helperMap = HELPERS_MAP.get(service);

  if (!helperMap) {
    helperMap = new WeakMap();
    HELPERS_MAP.set(service, helperMap);
  }

  let decls = helperMap.get(helper);

  if (!decls) {
    decls = ay.reactive(new Map<string, ay.Refkey>());
    helperMap.set(helper, decls);
  }

  return decls;
}

export function HelperModule(props: { helper: Readonly<Helper> }) {
  const decls = useHelperDecls(props.helper);

  return (
    <ay.Show when={decls.size > 0}>
      <ts.SourceFile path={props.helper.name}>
        <ay.For each={decls}>
          {(name, refkey) => <ay.Declaration name={name} refkey={refkey} />}
        </ay.For>
        {props.helper.code}
      </ts.SourceFile>
    </ay.Show>
  );
}

export function Helper(props: { helper: Helper; name: string }) {
  const decls = useHelperDecls(props.helper);

  let refkey = decls.get(props.name);

  if (!refkey) {
    refkey = ay.refkey();
    decls.set(props.name, refkey);
  }

  return ay.code`${refkey}`;
}
