// `${VAR}` / `$env:VAR` interpolation for MCP config string fields.
//
// v2.3 §12.2 documents `${ENV}` expansion "across every string-valued
// field". Belmont's v1.0 supports both shapes so `.belmont/mcp.json`
// stays compatible with Claude-flavoured and pi-mcp-adapter-flavoured
// configs the user may already have:
//
//   - `${FOO}`         — POSIX-style; widely used by Anthropic configs.
//   - `$env:FOO`       — PowerShell-style; pi-mcp-adapter supports this.
//
// Missing vars resolve to the empty string AND surface as a
// `MissingEnvVar` diagnostic the caller can log. We never fall through
// to a literal `${FOO}` in the expanded output — that almost always
// papers over a real configuration bug (server boots with a bogus
// header value and fails opaquely at runtime).
//
// The function is pure (env is injected via the second argument) so
// the adapter's tests don't need to mutate process.env between cases.

const VAR_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$env:([A-Za-z_][A-Za-z0-9_]*)/g;

export type InterpResult = {
  value: string;
  missing: string[];
};

export function interpolate(
  input: string,
  env: NodeJS.ProcessEnv = process.env,
): InterpResult {
  const missing: string[] = [];
  const value = input.replace(VAR_RE, (_match, brace: string | undefined, ps: string | undefined) => {
    const name = brace ?? ps ?? "";
    const v = env[name];
    if (v === undefined) {
      if (!missing.includes(name)) missing.push(name);
      return "";
    }
    return v;
  });
  return { value, missing };
}

/** Expand every string in a record. Returns the new record plus all
 *  missing var names accumulated across the values. */
export function interpolateRecord(
  rec: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
): { record: Record<string, string>; missing: string[] } {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const [k, v] of Object.entries(rec)) {
    const r = interpolate(v, env);
    out[k] = r.value;
    for (const m of r.missing) {
      if (!missing.includes(m)) missing.push(m);
    }
  }
  return { record: out, missing };
}

/** Expand `~` and `~/` to the user's home dir. POSIX semantics. */
export function expandTilde(path: string, home: string | undefined = process.env.HOME): string {
  if (!home) return path;
  if (path === "~") return home;
  if (path.startsWith("~/")) return home + path.slice(1);
  return path;
}
