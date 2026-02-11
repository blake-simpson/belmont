//go:build embed

package main

import "embed"

//go:embed all:skills
var embeddedSkills embed.FS

//go:embed all:agents
var embeddedAgents embed.FS

var hasEmbeddedFiles = true
