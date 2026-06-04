// belmont_ask_user — structured AskUserQuestion-style dialog for pi.
// Inspired by @mazli/pi-ask-user-question (MIT): multi-question tabs,
// option descriptions, Other/custom text, notes, multi-select, preview,
// and review/submit, while preserving Belmont's legacy question/choices API.

import { Type, type Static } from "typebox";
import {
  Editor,
  Key,
  matchesKey,
  Text,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type AgentToolResult,
  type EditorTheme,
  type ExtensionAPI,
  type ExtensionContext,
  type ToolDefinition,
} from "../pi/sdk.js";

const QUESTION_OPTION_SCHEMA = Type.Object({
  label: Type.String({ minLength: 1, maxLength: 120 }),
  description: Type.Optional(Type.String({ maxLength: 400 })),
  preview: Type.Optional(Type.String({ maxLength: 4000 })),
});

const QUESTION_SCHEMA = Type.Object({
  question: Type.String({ minLength: 1, maxLength: 500 }),
  header: Type.Optional(Type.String({ minLength: 1, maxLength: 12 })),
  context: Type.Optional(Type.String({ maxLength: 2000 })),
  options: Type.Optional(
    Type.Array(Type.Union([Type.String({ minLength: 1 }), QUESTION_OPTION_SCHEMA]), {
      minItems: 2,
      maxItems: 8,
    }),
  ),
  multiSelect: Type.Optional(Type.Boolean({ default: false })),
  allowCustomAnswer: Type.Optional(Type.Boolean({ default: true })),
  placeholder: Type.Optional(Type.String({ maxLength: 200 })),
});

const ASK_USER_SCHEMA = Type.Object({
  question: Type.Optional(QUESTION_SCHEMA.properties.question),
  context: Type.Optional(QUESTION_SCHEMA.properties.context),
  choices: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 2, maxItems: 8 })),
  allowCustomAnswer: Type.Optional(QUESTION_SCHEMA.properties.allowCustomAnswer),
  placeholder: Type.Optional(QUESTION_SCHEMA.properties.placeholder),
  questions: Type.Optional(Type.Array(QUESTION_SCHEMA, { minItems: 1, maxItems: 8 })),
});

export type BelmontAskUserInput = Static<typeof ASK_USER_SCHEMA>;

export type BelmontAskUserDetails = {
  mode: "dialog";
  cancelled: boolean;
  answers?: Record<string, string>;
  annotations?: Record<string, { notes?: string; preview?: string }>;
};

type QuestionOption = string | { label: string; description?: string; preview?: string };
type DisplayOption = { label: string; description: string; preview?: string; isOther?: boolean };
type InputMode = "other" | "notes" | null;

type NormalizedQuestion = {
  question: string;
  header: string;
  context?: string;
  options: DisplayOption[];
  multiSelect: boolean;
  allowCustomAnswer: boolean;
  placeholder?: string;
};

type DialogResult = BelmontAskUserDetails;

const OTHER_LABEL = "Other...";

export function buildBelmontAskUserTool(): ToolDefinition<typeof ASK_USER_SCHEMA, BelmontAskUserDetails> {
  return {
    name: "belmont_ask_user",
    label: "Belmont ask user",
    description:
      "Ask the human one or more structured questions in a custom terminal dialog. Supports context, option descriptions, Other/custom text, notes, multi-select, previews, and batched review/submit. Legacy `question`/`choices` still works.",
    promptSnippet:
      "Ask contextual clarifying or decision questions through a custom dialog. Prefer `questions: [{ question, header, context, options: [{ label, description, preview }], multiSelect }]`; users can choose options, type Other answers, and add notes.",
    promptGuidelines: [
      "Use belmont_ask_user when user preference materially changes the result or context cannot resolve ambiguity.",
      "Prefer 2–4 high-quality options per question; put the recommended option first and suffix it with ` (Recommended)`.",
      "Include `context` when the trade-off is not obvious; include option `description` for implications.",
      "Use `multiSelect: true` when answers are not mutually exclusive; use `preview` only for single-select visual/code comparisons.",
      "Do not ask for plan approval or risky-action confirmation; use the planning or permission flow instead.",
      "If belmont_ask_user fails because no UI is attached, ask directly in your response.",
    ],
    parameters: ASK_USER_SCHEMA,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return await executeBelmontAskUser(ctx, params);
    },
    renderCall(args, theme) {
      const count = (args as Partial<BelmontAskUserInput>).questions?.length ?? 1;
      return new Text(theme.fg("toolTitle", theme.bold(`Belmont ask user `)) + theme.fg("muted", `${count} question${count === 1 ? "" : "s"}`), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as BelmontAskUserDetails | undefined;
      if (!details) return new Text(result.content[0]?.type === "text" ? result.content[0].text : "", 0, 0);
      if (details.cancelled) return new Text(theme.fg("warning", "Belmont ask user cancelled"), 0, 0);
      const lines = Object.entries(details.answers ?? {}).map(
        ([question, answer]) => `${theme.fg("success", "✓ ")}${theme.fg("accent", question)} ${theme.fg("muted", "→")} ${answer}`,
      );
      return new Text(lines.join("\n"), 0, 0);
    },
  };
}

export async function executeBelmontAskUser(
  ctx: ExtensionContext,
  params: BelmontAskUserInput,
): Promise<AgentToolResult<BelmontAskUserDetails>> {
  if (!ctx.hasUI) {
    throw new Error("belmont_ask_user: no UI attached (print/RPC mode). Ask the user directly in your response instead.");
  }

  const questions = normalizeQuestions(params);
  const validationError = validateQuestions(questions);
  if (validationError) throw new Error(`belmont_ask_user: ${validationError}`);

  const result =
    (await ctx.ui.custom<DialogResult>((tui, theme, _keybindings, done) => {
      let currentTab = 0;
      let optionIndex = 0;
      let submitIndex = 0;
      let inputMode: InputMode = null;
      let pendingEscape = false;
      let showHelp = false;
      let status = "";
      let cachedLines: string[] | undefined;

      const answers: Record<string, string> = {};
      const annotations: NonNullable<DialogResult["annotations"]> = {};
      const single = new Map<number, number>();
      const multi = new Map<number, Set<number>>();
      const other = new Set<number>();
      const custom = new Map<number, string>();
      const emptyWarnings = new Set<number>();

      const editorTheme: EditorTheme = {
        borderColor: (s: string) => theme.fg("accent", s),
        selectList: {
          selectedPrefix: (s: string) => theme.fg("accent", s),
          selectedText: (s: string) => theme.fg("accent", s),
          description: (s: string) => theme.fg("muted", s),
          scrollInfo: (s: string) => theme.fg("dim", s),
          noMatch: (s: string) => theme.fg("warning", s),
        },
      };
      const editor = new Editor(tui, editorTheme);

      const multiQuestion = questions.length > 1;
      const reviewTab = questions.length;
      const totalTabs = multiQuestion ? questions.length + 1 : questions.length;

      const refresh = () => {
        cachedLines = undefined;
        tui.requestRender();
      };
      const onReview = () => multiQuestion && currentTab === reviewTab;
      const qIndex = () => Math.min(currentTab, questions.length - 1);
      const q = () => questions[qIndex()]!;
      const opts = () => q().options;
      const allAnswered = () => questions.every((question) => Object.hasOwn(answers, question.question));
      const currentMulti = () => {
        let selection = multi.get(qIndex());
        if (!selection) {
          selection = new Set<number>();
          multi.set(qIndex(), selection);
        }
        return selection;
      };
      const selected = (index: number, option: DisplayOption) =>
        q().multiSelect ? currentMulti().has(index) || (option.isOther === true && other.has(qIndex())) : single.get(qIndex()) === index;
      const answerText = (value: string) => (value === "" ? "(empty answer)" : value);
      const finish = () => done({ mode: "dialog", cancelled: false, answers, annotations: Object.keys(annotations).length ? annotations : undefined });
      const cancel = () => done({ mode: "dialog", cancelled: true });

      const focusPreferred = () => {
        if (onReview()) {
          optionIndex = 0;
          return;
        }
        const optionCount = opts().length;
        const selectedSingle = single.get(qIndex());
        if (selectedSingle !== undefined) optionIndex = selectedSingle;
        else if (q().multiSelect && currentMulti().size > 0) optionIndex = Math.min(...currentMulti());
        else if (other.has(qIndex())) optionIndex = optionCount - 1;
        else optionIndex = 0;
      };

      const moveNext = () => {
        if (!multiQuestion) {
          finish();
          return;
        }
        for (let offset = 1; offset <= questions.length; offset++) {
          const candidate = (qIndex() + offset) % questions.length;
          if (!Object.hasOwn(answers, questions[candidate]!.question)) {
            currentTab = candidate;
            focusPreferred();
            status = "";
            refresh();
            return;
          }
        }
        currentTab = reviewTab;
        submitIndex = 0;
        status = "";
        refresh();
      };

      const setMultiAnswer = () => {
        const labels = Array.from(currentMulti())
          .sort((a, b) => a - b)
          .map((index) => opts()[index])
          .filter((option): option is DisplayOption => option !== undefined && option.isOther !== true)
          .map((option) => option.label);
        if (other.has(qIndex())) labels.push(custom.get(qIndex()) ?? "");
        answers[q().question] = labels.join(", ");
      };

      const startInput = (mode: InputMode) => {
        inputMode = mode;
        pendingEscape = false;
        status = mode === "other" ? "Type a custom answer." : "Add a note for the focused option.";
        editor.setText(mode === "other" ? (custom.get(qIndex()) ?? "") : "");
        refresh();
      };

      editor.onSubmit = (value) => {
        const text = value.trim();
        if (!text) {
          status = "Input cannot be empty.";
          refresh();
          return;
        }
        if (inputMode === "other") {
          const index = qIndex();
          other.add(index);
          custom.set(index, text);
          if (q().multiSelect) setMultiAnswer();
          else {
            single.set(index, opts().length - 1);
            answers[q().question] = text;
          }
          inputMode = null;
          editor.setText("");
          moveNext();
          return;
        }
        if (inputMode === "notes") {
          annotations[q().question] = { ...annotations[q().question], notes: text };
          inputMode = null;
          editor.setText("");
          status = "Note saved.";
          refresh();
        }
      };

      const confirmFocused = () => {
        const option = opts()[optionIndex];
        if (!option) return;
        if (option.isOther) {
          startInput("other");
          return;
        }
        if (q().multiSelect) {
          const hasSelection = currentMulti().size > 0 || other.has(qIndex());
          if (!hasSelection && !emptyWarnings.has(qIndex())) {
            emptyWarnings.add(qIndex());
            status = "No options selected. Press Enter again to confirm an empty answer.";
            refresh();
            return;
          }
          if (hasSelection) setMultiAnswer();
          else answers[q().question] = "";
          moveNext();
          return;
        }
        single.set(qIndex(), optionIndex);
        other.delete(qIndex());
        custom.delete(qIndex());
        answers[q().question] = option.label;
        if (option.preview) annotations[q().question] = { ...annotations[q().question], preview: option.preview };
        moveNext();
      };

      const toggleMulti = () => {
        const option = opts()[optionIndex];
        if (!option) return;
        if (option.isOther) {
          startInput("other");
          return;
        }
        const selection = currentMulti();
        if (selection.has(optionIndex)) selection.delete(optionIndex);
        else selection.add(optionIndex);
        setMultiAnswer();
        emptyWarnings.delete(qIndex());
        status = Object.hasOwn(answers, q().question) ? "Answer updated." : "";
        refresh();
      };

      const handleInput = (data: string) => {
        if (matchesKey(data, Key.ctrl("c"))) return cancel();
        if (inputMode) {
          if (matchesKey(data, Key.escape)) {
            inputMode = null;
            editor.setText("");
            status = "";
            refresh();
            return;
          }
          editor.handleInput(data);
          refresh();
          return;
        }
        if (showHelp) {
          showHelp = false;
          refresh();
          return;
        }
        if (matchesKey(data, Key.escape)) {
          if (pendingEscape) return cancel();
          pendingEscape = true;
          status = "Press Esc again to dismiss and return to chat.";
          refresh();
          return;
        }
        pendingEscape = false;
        if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
          currentTab = (currentTab + 1) % totalTabs;
          focusPreferred();
          submitIndex = 0;
          status = "";
          refresh();
          return;
        }
        if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
          currentTab = (currentTab - 1 + totalTabs) % totalTabs;
          focusPreferred();
          submitIndex = 0;
          status = "";
          refresh();
          return;
        }
        if (onReview()) {
          if (matchesKey(data, Key.up) || matchesKey(data, "k") || matchesKey(data, Key.down) || matchesKey(data, "j")) {
            submitIndex = submitIndex === 0 ? 1 : 0;
            refresh();
            return;
          }
          if (matchesKey(data, Key.enter)) {
            if (submitIndex === 1) return cancel();
            if (!allAnswered()) {
              status = `Answer remaining questions: ${questions.filter((question) => !Object.hasOwn(answers, question.question)).map((question) => question.header).join(", ")}`;
              refresh();
              return;
            }
            finish();
          }
          return;
        }
        if (matchesKey(data, Key.up) || matchesKey(data, "k")) {
          optionIndex = wrapIndex(optionIndex, -1, opts().length);
          status = "";
          refresh();
          return;
        }
        if (matchesKey(data, Key.down) || matchesKey(data, "j")) {
          optionIndex = wrapIndex(optionIndex, 1, opts().length);
          status = "";
          refresh();
          return;
        }
        if (matchesKey(data, Key.space)) {
          if (q().multiSelect) toggleMulti();
          return;
        }
        if (matchesKey(data, Key.enter)) return confirmFocused();
        if (matchesKey(data, "o")) return startInput("other");
        if (matchesKey(data, "n")) return startInput("notes");
        if (matchesKey(data, "?")) {
          showHelp = true;
          refresh();
        }
      };

      const pad = (text: string, width: number) => text + " ".repeat(Math.max(0, width - visibleWidth(text)));
      const add = (lines: string[], content: string, innerWidth: number) =>
        lines.push(`${theme.fg("accent", "│ ")}${pad(truncateToWidth(content, innerWidth), innerWidth)}${theme.fg("accent", " │")}`);
      const chipLines = (width: number) => {
        const chips = questions.map((question, index) => {
          const answered = Object.hasOwn(answers, question.question);
          const active = !onReview() && index === qIndex();
          const raw = `[${answered ? "✓" : "○"} ${question.header}]`;
          if (active) return theme.bg("selectedBg", theme.fg("text", raw));
          return theme.fg(answered ? "success" : "muted", raw);
        });
        if (multiQuestion) {
          const raw = "[✓ Submit]";
          chips.push(onReview() ? theme.bg("selectedBg", theme.fg("text", raw)) : theme.fg(allAnswered() ? "success" : "dim", raw));
        }
        return wrapInline(chips, width);
      };
      const marker = (focused: boolean, isSelected: boolean) => {
        if (isSelected) return q().multiSelect ? "[X]" : "✓";
        return q().multiSelect ? "[ ]" : focused ? "●" : "○";
      };
      const optionLines = (width: number) => {
        const lines: string[] = [];
        opts().forEach((option, index) => {
          const focused = index === optionIndex;
          const isSelected = selected(index, option);
          const prefix = focused ? theme.fg("accent", "› ") : "  ";
          const label = `${marker(focused, isSelected)} ${option.label}`;
          const labelStyle = isSelected ? "warning" : focused ? "accent" : "text";
          lines.push(`${prefix}${theme.fg(labelStyle, label)}`);
          const description = option.isOther && isSelected && custom.has(qIndex()) ? answerText(custom.get(qIndex()) ?? "") : option.description;
          if (description.length > 0) {
            for (const line of wrapTextWithAnsi(description, Math.max(1, width - 6))) lines.push(`      ${theme.fg(option.isOther && isSelected ? "warning" : "muted", line)}`);
          }
        });
        return lines.map((line) => truncateToWidth(line, width));
      };
      const renderPreview = (lines: string[], innerWidth: number) => {
        const leftWidth = Math.max(24, Math.min(42, Math.floor((innerWidth - 3) * 0.42)));
        const rightWidth = Math.max(12, innerWidth - leftWidth - 3);
        const left = optionLines(leftWidth);
        const preview = opts()[optionIndex]?.preview ?? "No preview for this option.";
        const right = preview.split("\n").flatMap((line) => wrapTextWithAnsi(line || " ", Math.max(1, rightWidth - 2)));
        add(lines, `${theme.fg("accent", "Options")}${" ".repeat(Math.max(1, leftWidth - 7))}   ${theme.fg("accent", "Preview")}`, innerWidth);
        for (let i = 0; i < Math.max(left.length, right.length); i++) add(lines, `${pad(left[i] ?? "", leftWidth)} ${theme.fg("muted", "│")} ${pad(theme.fg("text", right[i] ?? ""), rightWidth)}`, innerWidth);
      };
      const renderReview = (lines: string[], innerWidth: number) => {
        add(lines, theme.fg("accent", theme.bold("Review your answers")), innerWidth);
        add(lines, "", innerWidth);
        for (const question of questions) {
          if (!Object.hasOwn(answers, question.question)) continue;
          add(lines, `${theme.fg("muted", "• ")}${theme.fg("accent", question.header)}`, innerWidth);
          for (const line of wrapTextWithAnsi(`→ ${answerText(answers[question.question] ?? "")}`, Math.max(1, innerWidth - 2))) add(lines, `  ${theme.fg("text", line)}`, innerWidth);
        }
        const missing = questions.filter((question) => !Object.hasOwn(answers, question.question)).map((question) => question.header);
        if (missing.length > 0) {
          add(lines, "", innerWidth);
          add(lines, theme.fg("warning", `⚠ Answer remaining questions: ${missing.join(", ")}`), innerWidth);
        }
        add(lines, "", innerWidth);
        ["Submit answers", "Cancel / return to chat"].forEach((label, index) => {
          const row = `${submitIndex === index ? "› " : "  "}${index + 1}. ${label}`;
          add(lines, submitIndex === index ? theme.bg("selectedBg", theme.fg("text", row)) : theme.fg(index === 0 ? "success" : "muted", row), innerWidth);
        });
      };
      const render = (width: number) => {
        if (cachedLines) return cachedLines;
        const safeWidth = Math.max(50, width);
        const innerWidth = safeWidth - 4;
        const lines: string[] = [];
        const title = onReview() ? " Review answers " : ` Question ${qIndex() + 1}/${questions.length} `;
        lines.push(theme.fg("accent", `╭─${title}${"─".repeat(Math.max(0, safeWidth - visibleWidth(title) - 3))}╮`));
        if (multiQuestion) {
          for (const chip of chipLines(innerWidth)) add(lines, chip, innerWidth);
          add(lines, "", innerWidth);
        }
        if (!onReview()) {
          for (const line of wrapTextWithAnsi(q().question, innerWidth)) add(lines, theme.fg("text", line), innerWidth);
          const context = q().context;
          if (context) {
            add(lines, "", innerWidth);
            for (const line of wrapTextWithAnsi(context, innerWidth)) add(lines, theme.fg("muted", line), innerWidth);
          }
          add(lines, "", innerWidth);
        }
        if (onReview()) renderReview(lines, innerWidth);
        else if (showHelp) ["↑/↓ or j/k: move focus", "space: toggle multi-select", "enter: confirm", "o or Other...: custom answer", "n: add note", "tab/shift+tab: switch questions", "esc then esc: dismiss", "?: close help"].forEach((line) => add(lines, theme.fg("muted", line), innerWidth));
        else if (inputMode) {
          add(lines, theme.fg("accent", inputMode === "other" ? "Custom answer:" : "Notes:"), innerWidth);
          for (const line of editor.render(innerWidth)) add(lines, line, innerWidth);
        } else if (!q().multiSelect && opts().some((option) => option.preview !== undefined)) renderPreview(lines, innerWidth);
        else for (const line of optionLines(innerWidth)) add(lines, line, innerWidth);
        add(lines, "", innerWidth);
        if (status) add(lines, theme.fg("warning", status), innerWidth);
        add(lines, theme.fg("dim", inputMode ? "Enter submit • Esc back" : onReview() ? "↑↓/jk move • Enter confirm • Tab questions • Esc Esc cancel" : q().multiSelect ? "↑↓/jk move • Space toggle • Enter confirm • o Other • n notes • ? help" : "↑↓/jk move • Enter select • o Other • n notes • Tab questions • ? help"), innerWidth);
        lines.push(theme.fg("accent", `╰${"─".repeat(safeWidth - 2)}╯`));
        cachedLines = lines.map((line) => truncateToWidth(line, safeWidth));
        return cachedLines;
      };

      return { render, invalidate: () => (cachedLines = undefined), handleInput };
    })) ?? { mode: "dialog", cancelled: true };

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    details: result,
  };
}

function normalizeQuestions(params: BelmontAskUserInput): NormalizedQuestion[] {
  const source = params.questions && params.questions.length > 0 ? params.questions : params.question ? [{ question: params.question, context: params.context, options: params.choices, allowCustomAnswer: params.allowCustomAnswer, placeholder: params.placeholder }] : [];
  return source.map((question, index) => {
    const baseOptions = question.options && question.options.length > 0 ? question.options : undefined;
    const options = (baseOptions ?? ["Yes", "No"]).map(normalizeOption);
    if (question.allowCustomAnswer ?? true) options.push({ label: OTHER_LABEL, description: "Type a custom answer.", isOther: true });
    return {
      question: question.question,
      header: question.header ?? `Q${index + 1}`,
      context: question.context,
      options,
      multiSelect: question.multiSelect ?? false,
      allowCustomAnswer: question.allowCustomAnswer ?? true,
      placeholder: question.placeholder,
    };
  });
}

function normalizeOption(option: QuestionOption): DisplayOption {
  if (typeof option === "string") return { label: option, description: "" };
  return { label: option.label, description: option.description ?? "", preview: option.preview };
}

function shortHeader(question: string, index: number): string {
  const firstWords = question.replace(/\?$/u, "").split(/\s+/u).slice(0, 2).join(" ");
  const header = firstWords || `Q${index + 1}`;
  return header.length <= 12 ? header : `Q${index + 1}`;
}

function validateQuestions(questions: NormalizedQuestion[]): string | undefined {
  if (questions.length < 1 || questions.length > 8) return "questions must have 1–8 items";
  const seen = new Set<string>();
  for (const question of questions) {
    if (seen.has(question.question)) return "duplicate question text; result keys would collide";
    seen.add(question.question);
    if (question.header.length > 12) return `header exceeds 12 chars: ${question.header}`;
    if (question.options.length < 2 || question.options.length > 9) return "each question needs 2–8 options plus optional Other";
    for (const option of question.options) {
      if (question.multiSelect && option.preview !== undefined) return "preview is only supported on single-select questions";
    }
  }
  return undefined;
}

function wrapIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return (((current + delta) % count) + count) % count;
}

function wrapInline(items: string[], width: number): string[] {
  const safeWidth = Math.max(1, width);
  const lines: string[] = [];
  let current = "";
  for (const item of items) {
    const fitted = visibleWidth(item) > safeWidth ? truncateToWidth(item, safeWidth) : item;
    const candidate = current ? `${current} ${fitted}` : fitted;
    if (!current || visibleWidth(candidate) <= safeWidth) current = candidate;
    else {
      lines.push(current);
      current = fitted;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export function registerBelmontAskUserTool(pi: ExtensionAPI): void {
  pi.registerTool(buildBelmontAskUserTool());
}
