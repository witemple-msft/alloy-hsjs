import { Scalar as ScalarType } from "@typespec/compiler";
import { useJsScalar } from "../../core/scalar.jsx";

export function Scalar(props: { type: ScalarType }) {
  const scalar = useJsScalar(props.type, props.type);

  return scalar.type;
}
