import { StringTemplate } from "@typespec/compiler";
import { TypeShape } from "../../plugins/ExprShape.jsx";

export class StringTemplateShape extends TypeShape<StringTemplate> {
  renderTypeRef() {
    return "string";
  }
}
