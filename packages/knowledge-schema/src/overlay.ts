// parseMilestoneOverlay — HTML-comment token grammar per v2.3 §9.3.
//
// Grammar:
//   <agent>=<value>[,<agent>=<value>...]    // tokens separated by whitespace
//   value  ::= <tier> ["+" <override>]
//   override ::= <provider> "/" <model> [":" <thinking>] ["@" <baseURL>]
//
// Parsed right-to-left within `override` to disambiguate `qwen3:8b`
// (colon-inside-model) from `claude-sonnet-4-6:high` (model + thinking):
// only a trailing `:<token>` whose token is one of {high, medium, low, off}
// is peeled as thinking. The baseURL (after `@`) is split off first.

import { parseProgress } from "./progress.js";
import {
  AGENT_ROLES,
  THINKING_LEVELS,
  TIER_NAMES,
} from "./types.js";
import type {
  AgentRole,
  Diagnostic,
  OverlayTokens,
  OverlayValue,
  ParseOverlayResult,
  ThinkingLevel,
  TierName,
} from "./types.js";

export function parseMilestoneOverlay(
  md: string,
  milestoneId: string,
): ParseOverlayResult {
  const parsed = parseProgress(md);
  const milestone = parsed.milestones.find((m) => m.id === milestoneId);
  if (!milestone || milestone.overlay === null) {
    return { overlay: null, warnings: [] };
  }
  return parseOverlayString(milestone.overlay, milestoneId);
}

export function parseOverlayString(
  raw: string,
  milestoneId: string,
): ParseOverlayResult {
  const warnings: Diagnostic[] = [];
  const overlay: OverlayTokens = {};
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { overlay: null, warnings };
  }
  const tokens = trimmed.split(/\s+/);

  for (const tok of tokens) {
    const eqIdx = tok.indexOf("=");
    if (eqIdx === -1) {
      warnings.push({
        code: "OVERLAY_MALFORMED_TOKEN",
        severity: "error",
        message: `Invalid milestone overlay on ${milestoneId}: malformed token "${tok}" (expected agent=value).`,
      });
      continue;
    }
    const agent = tok.slice(0, eqIdx);
    const value = tok.slice(eqIdx + 1);
    if (!isAgentRole(agent)) {
      warnings.push({
        code: "OVERLAY_UNKNOWN_AGENT",
        severity: "error",
        message: `Invalid milestone overlay on ${milestoneId}: unknown agent "${agent}". Valid: ${AGENT_ROLES.join(", ")}.`,
      });
      continue;
    }
    const parsedValue = parseOverlayValue(value, agent, milestoneId, warnings);
    if (parsedValue) {
      overlay[agent] = parsedValue;
    }
  }

  if (Object.keys(overlay).length === 0) {
    return { overlay: null, warnings };
  }
  return { overlay, warnings };
}

function parseOverlayValue(
  raw: string,
  agent: AgentRole,
  milestoneId: string,
  warnings: Diagnostic[],
): OverlayValue | null {
  const plusIdx = raw.indexOf("+");
  const tierStr = plusIdx === -1 ? raw : raw.slice(0, plusIdx);
  const overrideStr = plusIdx === -1 ? null : raw.slice(plusIdx + 1);

  if (!isTierName(tierStr)) {
    warnings.push({
      code: "OVERLAY_UNKNOWN_TIER",
      severity: "error",
      message: `Invalid milestone overlay on ${milestoneId}: unknown tier "${tierStr}" for ${agent}. Valid: ${TIER_NAMES.join(", ")}.`,
    });
    return null;
  }

  const value: OverlayValue = { tier: tierStr };
  if (overrideStr === null) return value;

  // Peel @baseURL (first `@` wins; the baseURL itself may contain colons).
  let modelPart = overrideStr;
  const atIdx = overrideStr.indexOf("@");
  if (atIdx !== -1) {
    value.baseURL = overrideStr.slice(atIdx + 1);
    modelPart = overrideStr.slice(0, atIdx);
  }

  // Peel :thinking iff the trailing :<token> is a known thinking level.
  const lastColonIdx = modelPart.lastIndexOf(":");
  if (lastColonIdx !== -1) {
    const candidate = modelPart.slice(lastColonIdx + 1);
    if (isThinkingLevel(candidate)) {
      value.thinking = candidate;
      modelPart = modelPart.slice(0, lastColonIdx);
    }
  }

  const slashIdx = modelPart.indexOf("/");
  if (slashIdx === -1) {
    warnings.push({
      code: "OVERLAY_MALFORMED_OVERRIDE",
      severity: "error",
      message: `Invalid milestone overlay on ${milestoneId}: override "${overrideStr}" for ${agent} must include "<provider>/<model>".`,
    });
    return null;
  }
  value.provider = modelPart.slice(0, slashIdx);
  value.model = modelPart.slice(slashIdx + 1);

  if (!value.provider || !value.model) {
    warnings.push({
      code: "OVERLAY_MALFORMED_OVERRIDE",
      severity: "error",
      message: `Invalid milestone overlay on ${milestoneId}: override "${overrideStr}" for ${agent} has empty provider or model.`,
    });
    return null;
  }

  return value;
}

function isAgentRole(s: string): s is AgentRole {
  return (AGENT_ROLES as readonly string[]).includes(s);
}

function isTierName(s: string): s is TierName {
  return (TIER_NAMES as readonly string[]).includes(s);
}

function isThinkingLevel(s: string): s is ThinkingLevel {
  return (THINKING_LEVELS as readonly string[]).includes(s);
}
