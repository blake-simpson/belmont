package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// The reverify loop shells out to a real tool binary, so these tests put a stub
// `claude` on PATH that does nothing and exits 0. That drives runReverifyCmd
// end to end — fixture, loop, summary — with no token spend.
func stubToolOnPath(t *testing.T) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("stub tool is a shell script")
	}
	stubDir := t.TempDir()
	stub := filepath.Join(stubDir, "claude")
	if err := os.WriteFile(stub, []byte("#!/bin/sh\nexit 0\n"), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", stubDir+string(os.PathListSeparator)+os.Getenv("PATH"))
}

func writeReverifyFixture(t *testing.T, progress string) string {
	t.Helper()
	root := t.TempDir()
	dir := filepath.Join(root, ".belmont", "features", "demo")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "PRD.md"), []byte("# Demo\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "PROGRESS.md"), []byte(progress), 0644); err != nil {
		t.Fatal(err)
	}
	return root
}

// reverifySummary is the consumer's view of the JSON contract. Decoded from the
// binary's actual output, not rebuilt in the test — issue #61's field was wrong
// for as long as it was because nothing ever parsed what the command printed.
type reverifySummary struct {
	Feature     string `json:"feature"`
	Processed   int    `json:"processed"`
	Passed      int    `json:"passed"`
	TotalFwlups int    `json:"total_fwlups"`
	Results     []struct {
		ID     string `json:"id"`
		Passed bool   `json:"passed"`
	} `json:"results"`
}

// A milestone the stub tool "verified" without flipping anything stays [x], so
// it was processed and did not pass. The old top-line field reported it under
// "verified" — two verified, none passed, nothing actually verified (#61).
func TestReverifyJSONReportsProcessedNotVerified(t *testing.T) {
	stubToolOnPath(t)
	root := writeReverifyFixture(t, `# Progress

## Milestones

### M1: One

- [x] P1-1: Done thing

### M2: Two

- [x] P2-1: Other done thing
`)

	var runErr error
	out := captureStdout(t, func() {
		runErr = runReverifyCmd([]string{"--root", root, "--feature", "demo", "--format", "json", "--tool", "claude"})
	})
	if runErr != nil {
		t.Fatalf("runReverifyCmd: %v", runErr)
	}

	var doc reverifySummary
	if err := json.Unmarshal([]byte(out), &doc); err != nil {
		t.Fatalf("output is not valid JSON: %v\noutput: %s", err, out)
	}
	if doc.Feature != "demo" {
		t.Errorf("feature = %q, want %q", doc.Feature, "demo")
	}
	if doc.Processed != 2 {
		t.Errorf("processed = %d, want 2 (both milestones were dispatched)", doc.Processed)
	}
	if doc.Passed != 0 {
		t.Errorf("passed = %d, want 0 (the stub flipped nothing, both stay [x])", doc.Passed)
	}
	if len(doc.Results) != 2 {
		t.Fatalf("results has %d entries, want 2", len(doc.Results))
	}
	for _, r := range doc.Results {
		if r.Passed {
			t.Errorf("result %s reports passed=true; the stub verified nothing", r.ID)
		}
	}

	// The misleading key is gone, not merely joined by a better one.
	var raw map[string]any
	if err := json.Unmarshal([]byte(out), &raw); err != nil {
		t.Fatal(err)
	}
	if _, ok := raw["verified"]; ok {
		t.Errorf(`output still carries a "verified" key: %s`, out)
	}
}

// Nothing to re-verify prints the same schema with zero counts, so a consumer
// parses one shape whether or not anything was dispatched. The old empty case
// was `{"verified":0,"results":[]}` — different keys from the full document.
func TestReverifyJSONEmptyCaseSameSchema(t *testing.T) {
	stubToolOnPath(t)
	root := writeReverifyFixture(t, `# Progress

## Milestones

### M1: One

- [ ] P1-1: Not started
`)

	var runErr error
	out := captureStdout(t, func() {
		runErr = runReverifyCmd([]string{"--root", root, "--feature", "demo", "--format", "json", "--tool", "claude"})
	})
	if runErr != nil {
		t.Fatalf("runReverifyCmd: %v", runErr)
	}

	var doc reverifySummary
	if err := json.Unmarshal([]byte(out), &doc); err != nil {
		t.Fatalf("output is not valid JSON: %v\noutput: %s", err, out)
	}
	if doc.Feature != "demo" {
		t.Errorf("feature = %q, want %q", doc.Feature, "demo")
	}
	if doc.Processed != 0 || doc.Passed != 0 || doc.TotalFwlups != 0 {
		t.Errorf("empty case counts = %d/%d/%d, want 0/0/0", doc.Processed, doc.Passed, doc.TotalFwlups)
	}
	if doc.Results == nil || len(doc.Results) != 0 {
		t.Errorf("results = %v, want present and empty", doc.Results)
	}
	var raw map[string]any
	if err := json.Unmarshal([]byte(out), &raw); err != nil {
		t.Fatal(err)
	}
	if _, ok := raw["verified"]; ok {
		t.Errorf(`empty case still carries a "verified" key: %s`, out)
	}
	for _, key := range []string{"feature", "processed", "passed", "total_fwlups", "results"} {
		if _, ok := raw[key]; !ok {
			t.Errorf("empty case is missing %q — the two branches should share one schema; output: %s", key, out)
		}
	}
}
