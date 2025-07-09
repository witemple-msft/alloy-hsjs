// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

import * as ay from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";

import {
  BooleanLiteral,
  EnumMember,
  Model,
  ModelProperty,
  NullType,
  NumericLiteral,
  Scalar,
  StringLiteral,
  Type,
  Union,
  UnknownType,
  VoidType,
  getDiscriminator,
  getMaxValue,
  getMinValue,
  isNeverType,
  isUnknownType,
} from "@typespec/compiler";
import { $ } from "@typespec/compiler/typekit";
import { reportDiagnostic } from "../lib.js";
import { isUnspeakable, parseCase } from "./case.js";
import { UnimplementedError, UnreachableError } from "./error.js";
import { getAllProperties } from "./extends.js";
import { categorize } from "./iter.js";
import { useJsScalar } from "../core/scalar.jsx";
import { useEmitContext } from "../components/JsServerOutput.jsx";
import { Literal } from "./literal.jsx";
import { ReadonlySetLike } from "./collection.js";

/**
 * A tree structure representing a body of TypeScript code.
 */
export type CodeTree = Result | IfChain | Switch | Verbatim;

export type JsLiteralType =
  | StringLiteral
  | BooleanLiteral
  | NumericLiteral
  | EnumMember;

/**
 * A TypeSpec type that is precise, i.e. the type of a single value.
 */
export type PreciseType = Scalar | Model | JsLiteralType | VoidType | NullType;

/**
 * Determines if `t` is a precise type.
 * @param t - the type to test
 * @returns true if `t` is precise, false otherwise.
 */
export function isPreciseType(t: Type): t is PreciseType {
  return (
    t.kind === "Scalar" ||
    t.kind === "Model" ||
    t.kind === "Boolean" ||
    t.kind === "Number" ||
    t.kind === "String" ||
    (t.kind === "Intrinsic" && (t.name === "void" || t.name === "null"))
  );
}

/**
 * An if-chain structure in the CodeTree DSL. This represents a cascading series of if-else-if statements with an optional
 * final `else` branch.
 */
export interface IfChain {
  kind: "if-chain";
  branches: IfBranch[];
  else?: CodeTree;
}

/**
 * A branch in an if-chain.
 */
export interface IfBranch {
  /**
   * A condition to test for this branch.
   */
  condition: Expression;
  /**
   * The body of this branch, to be executed if the condition is true.
   */
  body: CodeTree;
}

/**
 * A node in the code tree indicating that a precise type has been determined.
 */
export interface Result {
  kind: "result";
  type: PreciseType | UnknownType;
}

/**
 * A switch structure in the CodeTree DSL.
 */
export interface Switch {
  kind: "switch";
  /**
   * The expression to switch on.
   */
  condition: Expression;
  /**
   * The cases to test for.
   */
  cases: SwitchCase[];
  /**
   * The default case, if any.
   */
  default?: CodeTree;
}

/**
 * A verbatim code block.
 */
export interface Verbatim {
  kind: "verbatim";
  body: ay.Children;
}

/**
 * A case in a switch statement.
 */
export interface SwitchCase {
  /**
   * The value to test for in this case.
   */
  value: Expression;
  /**
   * The body of this case.
   */
  body: CodeTree;
}

/**
 * An expression in the CodeTree DSL.
 */
export type Expression =
  | BinaryOp
  | UnaryOp
  | TypeOf
  | Literal
  | VerbatimExpression
  | SubjectReference
  | ModelPropertyReference
  | InRange;

/**
 * A binary operation.
 */
export interface BinaryOp {
  kind: "binary-op";
  /**
   * The operator to apply. This operation may be sensitive to the order of the left and right expressions.
   */
  operator:
    | "==="
    | "!=="
    | "<"
    | "<="
    | ">"
    | ">="
    | "+"
    | "-"
    | "*"
    | "/"
    | "%"
    | "&&"
    | "||"
    | "instanceof"
    | "in";
  /**
   * The left-hand-side operand.
   */
  left: Expression;
  /**
   * The right-hand-side operand.
   */
  right: Expression;
}

/**
 * A unary operation.
 */
export interface UnaryOp {
  kind: "unary-op";
  /**
   * The operator to apply.
   */
  operator: "!" | "-";
  /**
   * The operand to apply the operator to.
   */
  operand: Expression;
}

/**
 * A type-of operation.
 */
export interface TypeOf {
  kind: "typeof";
  /**
   * The operand to apply the `typeof` operator to.
   */
  operand: Expression;
}

/**
 * A literal JavaScript value. The value will be converted to the text of an expression that will yield the same value.
 */
export interface Literal {
  kind: "literal";
  /**
   * The value of the literal.
   */
  value: LiteralValue;
}

/**
 * A verbatim expression, written as-is with no modification.
 */
export interface VerbatimExpression {
  kind: "verbatim";
  /**
   * The exact text of the expression.
   */
  value: ay.Children;
}

/**
 * A reference to the "subject" of the code tree.
 *
 * The "subject" is a special expression denoting an input value.
 */
export interface SubjectReference {
  kind: "subject";
}

const SUBJECT = { kind: "subject" } as SubjectReference;

/**
 * A reference to a model property. Model property references are rendered by the `referenceModelProperty` function in the
 * options given to `writeCodeTree`, allowing the caller to define how model properties are stored.
 */
export interface ModelPropertyReference {
  kind: "model-property";
  property: ModelProperty;
}

/**
 * A check to see if a value is in an integer range.
 */
export interface InRange {
  kind: "in-range";
  /**
   * The expression to check.
   */
  expr: Expression;
  /**
   * The range to check against.
   */
  range: IntegerRange;
}

/**
 * A literal value that can be used in a JavaScript expression.
 */
export type LiteralValue = string | number | boolean | bigint;

function isLiteralValueType(type: Type): type is JsLiteralType {
  return (
    type.kind === "Boolean" ||
    type.kind === "Number" ||
    type.kind === "String" ||
    type.kind === "EnumMember"
  );
}

const PROPERTY_ID = (prop: ModelProperty) => parseCase(prop.name).camelCase;

/**
 * Differentiates the variants of a union type. This function returns a CodeTree that will test an input "subject" and
 * determine which of the cases it matches.
 *
 * Compared to `differentiateTypes`, this function is specialized for union types, and will consider union
 * discriminators first, then delegate to `differentiateTypes` for the remaining cases.
 *
 * @param ctx
 * @param type
 */
export function useDifferentiateUnion(
  union: Union,
  renderPropertyName: (prop: ModelProperty) => string = PROPERTY_ID
): CodeTree {
  const ctx = useEmitContext();

  const discriminator = getDiscriminator(ctx.program, union)?.propertyName;
  // Exclude `never` from the union variants.
  const variants = [...union.variants.values()].filter(
    (v) => !isNeverType(v.type)
  );

  if (variants.some((v) => isUnknownType(v.type))) {
    // Collapse the whole union to `unknown`.
    return { kind: "result", type: $(ctx.program).intrinsic.any };
  }

  if (!discriminator) {
    const cases = new Set<PreciseType>();

    for (const variant of variants) {
      if (!isPreciseType(variant.type)) {
        reportDiagnostic(ctx.program, {
          code: "undifferentiable-union-variant",
          target: variant,
        });
      } else {
        cases.add(variant.type);
      }
    }

    return useDifferentiateTypes(cases, renderPropertyName);
  } else {
    const property = (variants[0].type as Model).properties.get(discriminator)!;

    return {
      kind: "switch",
      condition: {
        kind: "model-property",
        property,
      },
      cases: variants.map((v) => {
        const discriminatorPropertyType = (v.type as Model).properties.get(
          discriminator
        )!.type as JsLiteralType | EnumMember;

        return {
          value: {
            kind: "literal",
            value: useJsValue(discriminatorPropertyType),
          },
          body: { kind: "result", type: v.type },
        } as SwitchCase;
      }),
      default: {
        kind: "verbatim",
        body: [
          'throw new Error("Unreachable: discriminator did not match any known value or was not present.");',
        ],
      },
    };
  }
}

/**
 * Differentiates a set of input types. This function returns a CodeTree that will test an input "subject" and determine
 * which of the cases it matches, executing the corresponding code block.
 *
 * @param ctx - The emitter context.
 * @param cases - A map of cases to differentiate to their respective code blocks.
 * @returns a CodeTree to use with `writeCodeTree`
 */
export function useDifferentiateTypes(
  cases: Set<PreciseType>,
  renderPropertyName: (prop: ModelProperty) => string = PROPERTY_ID
): CodeTree {
  const ctx = useEmitContext();

  if (cases.size === 0) {
    return {
      kind: "verbatim",
      body: [
        'throw new Error("Unreachable: encountered a value in differentiation where no variants exist.");',
      ],
    };
  }

  const categories = categorize(cases.keys(), (type) => type.kind);

  const literals = [
    ...(categories.Boolean ?? []),
    ...(categories.Number ?? []),
    ...(categories.String ?? []),
  ] as JsLiteralType[];
  const models = (categories.Model as Model[]) ?? [];
  const scalars = (categories.Scalar as Scalar[]) ?? [];

  const intrinsics = (categories.Intrinsic as (VoidType | NullType)[]) ?? [];

  if (literals.length + scalars.length + intrinsics.length === 0) {
    return useDifferentiateModelTypes(select(models, cases), {
      renderPropertyName,
    });
  } else {
    const branches: IfBranch[] = [];

    for (const intrinsic of intrinsics) {
      const intrinsicValue = intrinsic.name === "void" ? "undefined" : "null";
      branches.push({
        condition: {
          kind: "binary-op",
          operator: "===",
          left: SUBJECT,
          right: {
            kind: "verbatim",
            value: intrinsicValue,
          },
        },
        body: {
          kind: "result",
          type: intrinsic,
        },
      });
    }

    for (const literal of literals) {
      branches.push({
        condition: {
          kind: "binary-op",
          operator: "===",
          left: SUBJECT,
          right: { kind: "literal", value: useJsValue(literal) },
        },
        body: {
          kind: "result",
          type: literal,
        },
      });
    }

    const scalarRepresentations = new Map<string, Scalar>();

    for (const scalar of scalars) {
      const jsScalar = useJsScalar(scalar, scalar);

      if (typeof jsScalar.type !== "string") {
        reportDiagnostic(ctx.program, {
          code: "undifferentiable-scalar",
          target: scalar,
          messageId: "scalar-not-implemented",
          format: {
            scalar: scalar.name,
          },
        });
        continue;
      }

      if (scalarRepresentations.has(jsScalar.type)) {
        reportDiagnostic(ctx.program, {
          code: "undifferentiable-scalar",
          target: scalar,
          format: {
            competitor: scalarRepresentations.get(jsScalar.type)!.name,
          },
        });
        continue;
      }

      let test: Expression;

      // TODO: this should be a protocol exposed by the scalar repr.

      switch (jsScalar.type) {
        case "Uint8Array":
          test = {
            kind: "binary-op",
            operator: "instanceof",
            left: SUBJECT,
            right: { kind: "verbatim", value: "Uint8Array" },
          };
          break;
        case "number":
          test = {
            kind: "binary-op",
            operator: "===",
            left: { kind: "typeof", operand: SUBJECT },
            right: { kind: "literal", value: "number" },
          };
          break;
        case "bigint":
          test = {
            kind: "binary-op",
            operator: "===",
            left: { kind: "typeof", operand: SUBJECT },
            right: { kind: "literal", value: "bigint" },
          };
          break;
        case "string":
          test = {
            kind: "binary-op",
            operator: "===",
            left: { kind: "typeof", operand: SUBJECT },
            right: { kind: "literal", value: "string" },
          };
          break;
        case "boolean":
          test = {
            kind: "binary-op",
            operator: "===",
            left: { kind: "typeof", operand: SUBJECT },
            right: { kind: "literal", value: "boolean" },
          };
          break;
        case "Date":
          test = {
            kind: "binary-op",
            operator: "instanceof",
            left: SUBJECT,
            right: { kind: "verbatim", value: "Date" },
          };
          break;
        default:
          throw new UnimplementedError(
            `scalar differentiation for unknown JS Scalar '${jsScalar}'.`
          );
      }

      branches.push({
        condition: test,
        body: {
          kind: "result",
          type: scalar,
        },
      });
    }

    return {
      kind: "if-chain",
      branches,
      else:
        models.length > 0
          ? useDifferentiateModelTypes(select(models, cases), {
              renderPropertyName,
            })
          : undefined,
    };
  }

  /**
   * Select a subset of keys from a map.
   *
   * @param keys - The keys to select.
   * @param map - The map to select from.
   * @returns a map containing only those keys of the original map that were also in the `keys` iterable.
   */
  function select<V1, V2 extends V1>(
    keys: Iterable<V2>,
    set: Set<V1>
  ): Set<V2> {
    const result = new Set<V2>();
    for (const key of keys) {
      if (set.has(key)) result.add(key);
    }
    return result;
  }
}

/**
 * Gets a JavaScript literal value for a given LiteralType.
 */
function useJsValue(literal: JsLiteralType | EnumMember): LiteralValue {
  const ctx = useEmitContext();

  switch (literal.kind) {
    case "Boolean":
      return literal.value;
    case "Number": {
      const asNumber = literal.numericValue.asNumber();

      if (asNumber) return asNumber;

      const asBigInt = literal.numericValue.asBigInt();

      if (asBigInt) return asBigInt;

      reportDiagnostic(ctx.program, {
        code: "unrepresentable-numeric-constant",
        target: literal,
      });
      return 0;
    }
    case "String":
      return literal.value;
    case "EnumMember":
      return literal.value ?? literal.name;
    default:
      throw new UnreachableError(
        "getJsValue for " + (literal satisfies never as JsLiteralType).kind,
        { literal }
      );
  }
}

/**
 * An integer range, inclusive.
 */
type IntegerRange = [number, number];

function useIntegerRange(property: ModelProperty): IntegerRange | false {
  const ctx = useEmitContext();

  if (
    property.type.kind === "Scalar" &&
    useJsScalar(property.type, property).type === "number"
  ) {
    const minValue = getMinValue(ctx.program, property);
    const maxValue = getMaxValue(ctx.program, property);

    if (minValue !== undefined && maxValue !== undefined) {
      return [minValue, maxValue];
    }
  }

  return false;
}

function overlaps(range: IntegerRange, other: IntegerRange): boolean {
  return range[0] <= other[1] && range[1] >= other[0];
}

/**
 * Optional parameters for model differentiation.
 */
interface DifferentiateModelOptions {
  /**
   * A function that converts a model property reference over the subject to a string.
   *
   * Default: `(prop) => prop.name`
   */
  renderPropertyName?: (prop: ModelProperty) => string;

  /**
   * A filter function that determines which properties to consider for differentiation.
   *
   * Default: `() => true`
   */
  filter?: (prop: ModelProperty) => boolean;

  /**
   * The default case to use if no other cases match.
   *
   * Default: undefined.
   */
  else?: CodeTree | undefined;
}

const DEFAULT_DIFFERENTIATE_OPTIONS = {
  renderPropertyName: PROPERTY_ID,
  filter: () => true,
  else: undefined,
} as const;

/**
 * Differentiate a set of model types based on their properties. This function returns a CodeTree that will test an input
 * "subject" and determine which of the cases it matches, executing the corresponding code block.
 *
 * @param ctx - The emitter context.
 * @param models - A map of models to differentiate to their respective code blocks.
 * @param renderPropertyName - A function that converts a model property reference over the subject to a string.
 * @returns a CodeTree to use with `writeCodeTree`
 */
export function useDifferentiateModelTypes(
  models: ReadonlySetLike<Model>,
  options?: DifferentiateModelOptions
): CodeTree;
export function useDifferentiateModelTypes(
  models: ReadonlySetLike<Model>,
  _options: DifferentiateModelOptions = {}
): CodeTree {
  const ctx = useEmitContext();

  const options = { ...DEFAULT_DIFFERENTIATE_OPTIONS, ..._options };
  // Horrible n^2 operation to get the unique properties of all models in the map, but hopefully n is small, so it should
  // be okay until you have a lot of models to differentiate.

  type PropertyName = string;
  type RenderedPropertyName = string & { __brand: "RenderedPropertyName" };

  const uniqueProps = new Map<Model, Set<PropertyName>>();

  // Map of property names to maps of literal values that identify a model.
  const propertyLiterals = new Map<
    RenderedPropertyName,
    Map<LiteralValue, Model>
  >();
  // Map of models to properties with values that can uniquely identify it
  const uniqueLiterals = new Map<Model, Set<RenderedPropertyName>>();

  const propertyRanges = new Map<
    RenderedPropertyName,
    Map<IntegerRange, Model>
  >();
  const uniqueRanges = new Map<Model, Set<RenderedPropertyName>>();

  for (const model of models.keys()) {
    const props = new Set<string>();

    for (const prop of getAllProperties(model).filter(options.filter)) {
      // Don't consider optional properties for differentiation.
      if (prop.optional) continue;

      // Ignore properties that have no parseable name.
      if (isUnspeakable(prop.name)) continue;

      const renderedPropName = options.renderPropertyName(
        prop
      ) as RenderedPropertyName;

      // CASE - literal value

      if (isLiteralValueType(prop.type)) {
        let literals = propertyLiterals.get(renderedPropName);
        if (!literals) {
          literals = new Map();
          propertyLiterals.set(renderedPropName, literals);
        }

        const value = useJsValue(prop.type);

        const other = literals.get(value);

        if (other) {
          // Literal already used. Leave the literal in the propertyLiterals map to prevent future collisions,
          // but remove the model from the uniqueLiterals map.
          uniqueLiterals.get(other)?.delete(renderedPropName);
        } else {
          // Literal is available. Add the model to the uniqueLiterals map and set this value.
          literals.set(value, model);
          let modelsUniqueLiterals = uniqueLiterals.get(model);
          if (!modelsUniqueLiterals) {
            modelsUniqueLiterals = new Set();
            uniqueLiterals.set(model, modelsUniqueLiterals);
          }
          modelsUniqueLiterals.add(renderedPropName);
        }
      }

      // CASE - unique range

      const range = useIntegerRange(prop);
      if (range) {
        let ranges = propertyRanges.get(renderedPropName);
        if (!ranges) {
          ranges = new Map();
          propertyRanges.set(renderedPropName, ranges);
        }

        const overlappingRanges = [...ranges.entries()].filter(([r]) =>
          overlaps(r, range)
        );

        if (overlappingRanges.length > 0) {
          // Overlapping range found. Remove the model from the uniqueRanges map.
          for (const [, other] of overlappingRanges) {
            uniqueRanges.get(other)?.delete(renderedPropName);
          }
        } else {
          // No overlapping range found. Add the model to the uniqueRanges map and set this range.
          ranges.set(range, model);
          let modelsUniqueRanges = uniqueRanges.get(model);
          if (!modelsUniqueRanges) {
            modelsUniqueRanges = new Set();
            uniqueRanges.set(model, modelsUniqueRanges);
          }
          modelsUniqueRanges.add(renderedPropName);
        }
      }

      // CASE - unique property

      let valid = true;
      for (const [, other] of uniqueProps) {
        if (
          other.has(prop.name) ||
          (isLiteralValueType(prop.type) &&
            propertyLiterals
              .get(renderedPropName)
              ?.has(useJsValue(prop.type as JsLiteralType)))
        ) {
          valid = false;
          other.delete(prop.name);
        }
      }

      if (valid) {
        props.add(prop.name);
      }
    }

    uniqueProps.set(model, props);
  }

  const branches: IfBranch[] = [];

  let defaultCase: CodeTree | undefined = options.else;

  for (const [model, unique] of uniqueProps) {
    const literals = uniqueLiterals.get(model);
    const ranges = uniqueRanges.get(model);
    if (
      unique.size === 0 &&
      (!literals || literals.size === 0) &&
      (!ranges || ranges.size === 0)
    ) {
      if (defaultCase) {
        reportDiagnostic(ctx.program, {
          code: "undifferentiable-model",
          target: model,
        });
        return defaultCase;
      } else {
        // Allow a single default case. This covers more APIs that have a single model that is not differentiated by a
        // unique property, in which case we can make it the `else` case.
        defaultCase = { kind: "result", type: model };
        continue;
      }
    }

    if (literals && literals.size > 0) {
      // A literal property value exists that can differentiate this model.
      const firstUniqueLiteral = literals.values().next()
        .value as RenderedPropertyName;

      const property = [...model.properties.values()].find(
        (p) =>
          (options.renderPropertyName(p) as RenderedPropertyName) ===
          firstUniqueLiteral
      )!;

      branches.push({
        condition: {
          kind: "binary-op",
          left: {
            kind: "binary-op",
            left: {
              kind: "literal",
              value: options.renderPropertyName(property),
            },
            operator: "in",
            right: SUBJECT,
          },
          operator: "&&",
          right: {
            kind: "binary-op",
            left: { kind: "model-property", property },
            operator: "===",
            right: {
              kind: "literal",
              value: useJsValue(property.type as JsLiteralType),
            },
          },
        },
        body: { kind: "result", type: model },
      });
    } else if (ranges && ranges.size > 0) {
      // A range property value exists that can differentiate this model.
      const firstUniqueRange = ranges.values().next()
        .value as RenderedPropertyName;

      const property = [...model.properties.values()].find(
        (p) => options.renderPropertyName(p) === firstUniqueRange
      )!;

      const range = [...propertyRanges.get(firstUniqueRange)!.entries()].find(
        ([range, candidate]) => candidate === model
      )![0];

      branches.push({
        condition: {
          kind: "binary-op",
          left: {
            kind: "binary-op",
            left: {
              kind: "literal",
              value: options.renderPropertyName(property),
            },
            operator: "in",
            right: SUBJECT,
          },
          operator: "&&",
          right: {
            kind: "in-range",
            expr: { kind: "model-property", property },
            range,
          },
        },
        body: { kind: "result", type: model },
      });
    } else {
      const firstUniqueProp = unique.values().next().value as PropertyName;

      branches.push({
        condition: {
          kind: "binary-op",
          left: { kind: "literal", value: firstUniqueProp },
          operator: "in",
          right: SUBJECT,
        },
        body: { kind: "result", type: model },
      });
    }
  }

  return {
    kind: "if-chain",
    branches,
    else: defaultCase,
  };
}

/**
 * Options for the `writeCodeTree` function.
 */
export interface CodeTreeOptions {
  /**
   * The subject expression to use in the code tree.
   *
   * This text is used whenever a `SubjectReference` is encountered in the code tree, allowing the caller to specify
   * how the subject is stored and referenced.
   */
  subject: ay.Children;

  /**
   * A function that converts a model property to a string reference.
   *
   * This function is used whenever a `ModelPropertyReference` is encountered in the code tree, allowing the caller to
   * specify how model properties are stored and referenced.
   */
  referenceModelProperty: (p: ModelProperty) => ay.Children;

  /**
   * Renders a result when encountered in the code tree.
   */
  renderResult: (type: PreciseType | UnknownType) => ay.Children;
}

export interface CodeTreeProps extends CodeTreeOptions {
  tree: CodeTree;
}

export function CodeTree(props: CodeTreeProps) {
  const { tree, ...options } = props;

  switch (tree.kind) {
    case "result":
      return options.renderResult(tree.type);
    case "if-chain": {
      const clauses: ay.Children[] = [];

      let first = true;

      for (const branch of tree.branches) {
        const condition = (
          <Expression {...options} expression={branch.condition} />
        );

        if (first) {
          first = false;
          clauses.push(
            <ts.IfStatement condition={condition}>
              <CodeTree {...options} tree={branch.body} />
            </ts.IfStatement>
          );
        } else {
          clauses.push(
            <ts.ElseIfClause condition={condition}>
              <CodeTree {...options} tree={branch.body} />
            </ts.ElseIfClause>
          );
        }
      }

      if (tree.else) {
        clauses.push(
          <ts.ElseClause>
            <CodeTree {...options} tree={tree.else} />
          </ts.ElseClause>
        );
      }

      return clauses;
    }
    case "switch": {
      return (
        <ts.SwitchStatement
          expression={<Expression {...options} expression={tree.condition} />}
        >
          <ay.For each={tree.cases}>
            {(_case) => (
              <ts.CaseClause
                expression={
                  <Expression {...options} expression={_case.value} />
                }
                block
              >
                <CodeTree {...options} tree={_case.body} />
              </ts.CaseClause>
            )}
          </ay.For>
        </ts.SwitchStatement>
      );
    }
    case "verbatim": {
      return tree.body;
    }
    default:
      throw new UnreachableError(
        "CodeTree for " + (tree satisfies never as CodeTree).kind,
        { tree }
      );
  }
}

interface ExpressionProps extends CodeTreeOptions {
  expression: Expression;
}

function Expression(props: ExpressionProps) {
  const { expression, ...options } = props;

  switch (expression.kind) {
    case "binary-op":
      const l = <Expression {...options} expression={expression.left} />;
      const r = <Expression {...options} expression={expression.right} />;
      return ay.code`(${l}) ${expression.operator} (${r})`;
    case "unary-op":
      return ay.code`${expression.operator}(${(<Expression {...options} expression={expression.operand} />)})`;
    case "typeof":
      return ay.code`typeof (${(<Expression {...options} expression={expression.operand} />)})`;
    case "literal":
      return <Literal value={expression.value} />;
    case "in-range": {
      const e = <Expression {...options} expression={expression.expr} />;
      const [min, max] = expression.range;

      // IIFE required to avoid evaluating the expression twice.
      const rk = ay.refkey();

      const iife = (
        <>
          (
          <ts.ArrowFunction parameters={[{ name: "v", refkey: rk }]}>
            {rk} {">="} {min} && {rk} {"<="} {max}
          </ts.ArrowFunction>
          )
        </>
      );

      return <ts.FunctionCallExpression args={[e]} target={iife} />;
    }
    case "verbatim": {
      return expression.value;
    }
    case "subject": {
      return options.subject;
    }
    case "model-property": {
      return options.referenceModelProperty(expression.property);
    }
    default: {
      throw new UnreachableError(
        "writeExpression for " +
          (expression satisfies never as Expression).kind,
        {
          expression,
        }
      );
    }
  }
}
