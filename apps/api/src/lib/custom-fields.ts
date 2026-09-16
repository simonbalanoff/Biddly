import { CandidateFieldDefinition, CandidateFieldType } from "@biddly/db";

export function validateCustomFieldValues(
  definitions: CandidateFieldDefinition[],
  values: Record<string, unknown>,
  publicOnly: boolean,
  enforceRequired = true
) {
  const allowed = definitions.filter((field) => !publicOnly || field.visibleOnPublicForm);
  const byKey = new Map(allowed.map((field) => [field.key, field]));

  for (const key of Object.keys(values)) {
    if (!byKey.has(key)) {
      return { ok: false as const, error: `Unknown field: ${key}` };
    }
  }

  for (const field of allowed) {
    const value = values[field.key];

    if (enforceRequired && field.required && isEmpty(value)) {
      return { ok: false as const, error: `${field.label} is required` };
    }

    if (isEmpty(value)) {
      continue;
    }

    if (!matchesFieldType(field.type, value, field.options)) {
      return { ok: false as const, error: `${field.label} has an invalid value` };
    }

    const validationError = validateRules(value, field.validation);

    if (validationError) {
      return { ok: false as const, error: `${field.label} ${validationError}` };
    }
  }

  return { ok: true as const, fields: allowed };
}

function isEmpty(value: unknown) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function matchesFieldType(type: CandidateFieldType, value: unknown, options: unknown) {
  switch (type) {
    case "SHORT_TEXT":
    case "LONG_TEXT":
    case "PHONE":
      return typeof value === "string";
    case "EMAIL":
      return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case "NUMBER":
    case "YEAR":
      return typeof value === "number" && Number.isFinite(value);
    case "DATE":
      return typeof value === "string" && !Number.isNaN(Date.parse(value));
    case "BOOLEAN":
      return typeof value === "boolean";
    case "SELECT": {
      const choices = getOptions(options);
      return typeof value === "string" && choices.includes(value);
    }
    case "MULTI_SELECT": {
      const choices = getOptions(options);
      return Array.isArray(value) && value.every((item) => typeof item === "string" && choices.includes(item));
    }
  }
}

function getOptions(options: unknown) {
  if (!options || typeof options !== "object" || !("choices" in options)) {
    return [];
  }

  const choices = (options as { choices?: unknown }).choices;
  return Array.isArray(choices) ? choices.filter((item): item is string => typeof item === "string") : [];
}

function validateRules(value: unknown, validation: unknown) {
  if (!validation || typeof validation !== "object") {
    return null;
  }

  const rules = validation as { min?: unknown; max?: unknown; minLength?: unknown; maxLength?: unknown };

  if (typeof value === "number") {
    if (typeof rules.min === "number" && value < rules.min) {
      return `must be at least ${rules.min}`;
    }

    if (typeof rules.max === "number" && value > rules.max) {
      return `must be at most ${rules.max}`;
    }
  }

  if (typeof value === "string") {
    if (typeof rules.minLength === "number" && value.length < rules.minLength) {
      return `must be at least ${rules.minLength} characters`;
    }

    if (typeof rules.maxLength === "number" && value.length > rules.maxLength) {
      return `must be at most ${rules.maxLength} characters`;
    }
  }

  return null;
}
