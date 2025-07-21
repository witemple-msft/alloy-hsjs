// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

interface MediaTypeConstraint {
  type: string;
  subtype: string;
  suffix?: string;
  parameters: Record<string, string>;
}

function parseMediaTypeConstraint(input: string): MediaTypeConstraint {
  const [fullType, ...paramParts] = input.split(";");
  const parameters: Record<string, string> = {};

  for (const param of paramParts) {
    const [keyRaw, value] = param.split("=", 2).map((s) => s.trim());
    if (keyRaw) {
      const key = keyRaw.toLowerCase();
      parameters[key] = value ?? "";
    }
  }

  const [typePart, subtypePartRaw] = fullType.trim().split("/", 2);
  const type = (typePart || "*").toLowerCase();
  const subtypePart = (subtypePartRaw || "*").toLowerCase();

  let subtype = subtypePart;
  let suffix: string | undefined;

  const plusIndex = subtypePart.indexOf("+");
  if (plusIndex !== -1) {
    subtype = subtypePart.slice(0, plusIndex);
    suffix = subtypePart.slice(plusIndex + 1);
  }

  return { type, subtype, suffix, parameters };
}

function matchesConstraint(
  actual: MediaTypeConstraint,
  constraint: MediaTypeConstraint
): boolean {
  if (constraint.type !== "*" && constraint.type !== actual.type) return false;

  const subtypeMatches =
    constraint.subtype === "*" ||
    constraint.subtype === actual.subtype ||
    // Special suffix override match
    (constraint.suffix === undefined && actual.suffix === constraint.subtype);

  if (!subtypeMatches) return false;

  if (constraint.suffix && constraint.suffix !== actual.suffix) return false;

  for (const [key, val] of Object.entries(constraint.parameters)) {
    if (actual.parameters[key] !== val) return false;
  }

  return true;
}

function computeSpecificityScore(c: MediaTypeConstraint): number {
  let score = 0;
  if (c.type !== "*") score += 4;
  if (c.subtype !== "*") score += 4;
  if (c.suffix) score += 2;
  score += Object.keys(c.parameters).length;
  return score;
}

/**
 * Registry for media type constraints that allows resolving the most specific matching constraint to some
 * other input constraint.
 */
export class MediaTypeConstraintRegistry<T> {
  #entries: {
    raw: string;
    constraint: MediaTypeConstraint;
    value: T;
  }[] = [];

  #default: T;

  /**
   * Creates a new MediaTypeConstraintRegistry with a default value.
   *
   * @param defaultValue - the value to return if no constraints match.
   */
  constructor(defaultValue: T) {
    this.#default = defaultValue;
  }

  /**
   * Registers a media type constraint to a value.
   *
   * @param constraint - The media type constraint to register.
   * @param value - The value to be associated with the constraint.
   */
  register(constraint: string, value: T) {
    const parsedConstraint = parseMediaTypeConstraint(constraint);
    this.#entries.push({
      raw: constraint,
      constraint: parsedConstraint,
      value,
    });
  }

  /**
   * Resolves the most specific value for the given media type constraint.
   *
   * @param constraint - The media type constraint to resolve.
   * @returns The most specific value associated with the constraint, or the default value if no match is found.
   */
  resolve(constraint: string): T {
    const input = parseMediaTypeConstraint(constraint);

    let best: { score: number; value: T } | undefined = undefined;

    for (const entry of this.#entries) {
      if (matchesConstraint(input, entry.constraint)) {
        const score = computeSpecificityScore(entry.constraint);
        if (!best || score > best.score) {
          best = { score, value: entry.value };
        }
      }
    }

    return best?.value ?? this.#default;
  }
}
