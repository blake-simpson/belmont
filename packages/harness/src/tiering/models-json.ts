// FS entrypoint for the M7 `.belmont/models.json` reader.
//
// Thin wrapper around `validateModelsJson` from @belmont/knowledge-schema
// (the Zod schema lives there per v2.3 §17 M7 P0). This module owns the
// FS read + JSON parse + error-shape normalisation so siblings in the
// harness (snapshot cache, doctor, /belmont:models commands) can ask one
// question — "give me the models.json or tell me why you can't" — and
// get a uniform answer.
//
// Stays out of pi: no imports from ./pi/sdk.js (pure FS + knowledge-
// schema). Importable from anywhere in the harness (including tests
// that don't spin up pi).

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  type Diagnostic,
  type ModelsJson,
  validateModelsJson,
} from "@belmont/knowledge-schema";

export type LoadModelsJsonResult =
  | { ok: true; data: ModelsJson; warnings: Diagnostic[]; path: string }
  | {
      ok: false;
      errors: Diagnostic[];
      path: string;
      /** True when the file did not exist (vs malformed/invalid). */
      missing: boolean;
    };

const MODELS_JSON_REL = ".belmont/models.json";

export function modelsJsonPath(projectRoot: string): string {
  return join(projectRoot, MODELS_JSON_REL);
}

export async function loadModelsJson(
  projectRoot: string,
): Promise<LoadModelsJsonResult> {
  const path = modelsJsonPath(projectRoot);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err: unknown) {
    if (isNoEnt(err)) {
      return {
        ok: false,
        path,
        missing: true,
        errors: [
          {
            code: "MODELS_JSON_MISSING",
            severity: "error",
            message: `${MODELS_JSON_REL} not found at ${path}. Run \`belmont init\` to scaffold it.`,
          },
        ],
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      path,
      missing: false,
      errors: [
        {
          code: "MODELS_JSON_READ_ERROR",
          severity: "error",
          message: `${MODELS_JSON_REL}: read failed: ${msg}`,
        },
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      path,
      missing: false,
      errors: [
        {
          code: "MODELS_JSON_PARSE_ERROR",
          severity: "error",
          message: `${MODELS_JSON_REL}: invalid JSON — ${msg}`,
        },
      ],
    };
  }

  const validation = validateModelsJson(parsed);
  if (!validation.ok) {
    return { ok: false, path, missing: false, errors: validation.errors };
  }
  return {
    ok: true,
    path,
    data: validation.data,
    warnings: validation.warnings,
  };
}

function isNoEnt(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}
