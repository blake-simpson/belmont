import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  consumeMissingRtkWarning,
  detectRtk,
  isRtkAvailable,
  resetRtkDetectCache,
  rtkWarningMessage,
  setRtkDetectorForTest,
} from "../src/cli/rtk-detect.js";

describe("rtk-detect", () => {
  beforeEach(() => {
    resetRtkDetectCache();
  });
  afterEach(() => {
    setRtkDetectorForTest(undefined);
  });

  it("reports available + version when probe succeeds", () => {
    setRtkDetectorForTest(() => ({ available: true, version: "rtk 1.2.3" }));
    const result = detectRtk();
    expect(result).toEqual({ available: true, version: "rtk 1.2.3" });
    expect(isRtkAvailable()).toBe(true);
  });

  it("reports not_on_path when which fails", () => {
    setRtkDetectorForTest(() => ({ available: false, reason: "not_on_path" }));
    expect(detectRtk()).toEqual({ available: false, reason: "not_on_path" });
    expect(isRtkAvailable()).toBe(false);
  });

  it("reports disabled_via_env when BELMONT_RTK_DISABLE=1", () => {
    setRtkDetectorForTest(() => ({ available: false, reason: "disabled_via_env" }));
    expect(detectRtk().reason).toBe("disabled_via_env");
  });

  it("caches the result — second call does not re-run the probe", () => {
    let calls = 0;
    setRtkDetectorForTest(() => {
      calls += 1;
      return { available: true };
    });
    detectRtk();
    detectRtk();
    detectRtk();
    expect(calls).toBe(1);
  });

  it("consumeMissingRtkWarning fires exactly once when rtk is missing", () => {
    setRtkDetectorForTest(() => ({ available: false, reason: "not_on_path" }));
    expect(consumeMissingRtkWarning()).toBe(true);
    expect(consumeMissingRtkWarning()).toBe(false);
    expect(consumeMissingRtkWarning()).toBe(false);
  });

  it("consumeMissingRtkWarning never fires when rtk IS available", () => {
    setRtkDetectorForTest(() => ({ available: true }));
    expect(consumeMissingRtkWarning()).toBe(false);
    expect(consumeMissingRtkWarning()).toBe(false);
  });

  it("rtkWarningMessage produces distinct strings per reason code", () => {
    const missing = rtkWarningMessage({ available: false, reason: "not_on_path" });
    const disabled = rtkWarningMessage({
      available: false,
      reason: "disabled_via_env",
    });
    expect(missing).toMatch(/RTK not on PATH/);
    expect(disabled).toMatch(/BELMONT_RTK_DISABLE/);
    expect(rtkWarningMessage({ available: true })).toBe("");
  });
});
