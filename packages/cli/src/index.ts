// @belmont/cli — the `belmont` launcher. Imports @belmont/harness only.
// Real subcommand routing (`init`, `update`, `status`, `validate`) lands
// in M3 (v2.3 §17 M3).

export { PACKAGE_NAME as HARNESS_PACKAGE } from "@belmont/harness";

export const PACKAGE_NAME = "@belmont/cli";

export type PlaceholderM3 = {
  message: "M1 stub — replaced in M3 with subcommand router + pi --extension exec";
};
