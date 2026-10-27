import { Plugin, Skill } from "@opencode/plugin"
import { SKILL_NAME, skillDescription, skillTemplate } from "./src/skill.ts"
import {
  attachArgsFor,
  createRealDeps,
  listBackend,
  resolveBinary,
  startBackend,
  stopBackend,
} from "./src/obscura/index.ts"

export default Plugin.define({
  id: "opencode-browser-agent",
  async setup(ctx) {
    // Register the skill-loading tool.
    await ctx.tool.transform((editor) => {
      editor.add({
        name: "load_agent_browser_skill",
        description:
          "Load the agent-browser skill for browser automation. Use when tasks involve: screenshots, web scraping, form automation, browser navigation, visual testing, or webpage interaction. Trigger phrases: screenshot, scrape, browser, webpage, navigate, fill form, test website.",
        input: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        async execute(_input, toolCtx) {
          await ctx.session.synthetic({
            sessionID: toolCtx.sessionID,
            text: `# Skill Loaded: ${SKILL_NAME}\n\n${skillTemplate}`,
          })
          return {
            content: `Skill "${SKILL_NAME}" loaded. Use bash to execute agent-browser commands. Run "agent-browser skills get core --full" for the complete reference.`,
          }
        },
      })

      // Register the opt-in Obscura backend tool.
      editor.add({
        name: "obscura_backend",
        description:
          "Manage the OPT-IN experimental Obscura backend (a local lightweight CDP engine). Chrome remains the default; this never runs at startup and never replaces Chrome unless explicitly started. Actions: start | attach | status | doctor | stop. Fixture mode (private-network access) is off by default and only allowed with explicit loopback-only targets.",
        input: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["start", "attach", "status", "doctor", "stop"],
              description:
                "start = launch local engine; attach = print agent-browser command; status/doctor = list runs; stop = terminate owned runs.",
            },
            port: {
              type: "number",
              minimum: 1,
              maximum: 65535,
              description: "Explicit CDP port. Reserved ports (9222/8377/9333/...) are refused.",
            },
            fixtureMode: {
              type: "boolean",
              description:
                "Enables --allow-private-network. OFF by default; requires loopback-only targets.",
            },
            targets: {
              type: "array",
              items: { type: "string" },
              description:
                "Declared fixture targets; all must be http(s) loopback URLs when fixtureMode is set.",
            },
            sessionName: {
              type: "string",
              description: "agent-browser session name (default obscura-<runId>).",
            },
            runId: {
              type: "string",
              description: "Target a specific run for stop.",
            },
          },
          required: ["action"],
          additionalProperties: false,
        },
        async execute(args) {
          const deps = createRealDeps()
          const a = args as {
            action: "start" | "attach" | "status" | "doctor" | "stop"
            port?: number
            fixtureMode?: boolean
            targets?: string[]
            sessionName?: string
            runId?: string
          }
          switch (a.action) {
            case "start": {
              if (!resolveBinary()) {
                return {
                  content: JSON.stringify(
                    {
                      ok: false,
                      error:
                        "Obscura binary not found. Set OBSCURA_BIN to the obscura executable, or put it on PATH. Chrome (the default) is unaffected.",
                    },
                    null,
                    2,
                  ),
                }
              }
              try {
                const res = await startBackend(deps, {
                  port: a.port,
                  fixtureMode: a.fixtureMode,
                  targets: a.targets,
                })
                const session = a.sessionName ?? `obscura-${res.runId}`
                const command = `agent-browser --session ${session} ${res.attachArgs.join(" ")} open <url>`
                return {
                  content: JSON.stringify(
                    {
                      ok: true,
                      backend: "obscura",
                      runId: res.runId,
                      pid: res.pid,
                      host: res.host,
                      port: res.port,
                      fixtureMode: res.fixtureMode,
                      attachArgs: res.attachArgs,
                      exampleCommand: command,
                      note: "Chrome remains the default. Stop this engine with obscura_backend stop when done.",
                    },
                    null,
                    2,
                  ),
                }
              } catch (err) {
                return {
                  content: JSON.stringify({ ok: false, error: (err as Error).message }, null, 2),
                }
              }
            }
            case "attach": {
              try {
                const argv = attachArgsFor(deps, a.port, a.sessionName)
                const session = a.sessionName ?? "obscura-work"
                return {
                  content: JSON.stringify(
                    {
                      ok: true,
                      backend: "obscura",
                      attachArgs: argv,
                      exampleCommand: `agent-browser --session ${session} ${argv.join(" ")} open <url>`,
                    },
                    null,
                    2,
                  ),
                }
              } catch (err) {
                return {
                  content: JSON.stringify({ ok: false, error: (err as Error).message }, null, 2),
                }
              }
            }
            case "status":
            case "doctor": {
              const runs = listBackend(deps)
              return {
                content: JSON.stringify({ ok: true, action: a.action, count: runs.length, runs }, null, 2),
              }
            }
            case "stop": {
              const verdicts = stopBackend(deps, a.runId)
              return {
                content: JSON.stringify(
                  {
                    ok: true,
                    stopped: verdicts.filter((v) => v.owned).length,
                    results: verdicts,
                    note: "Only processes positively verified as owned by a launcher run were terminated.",
                  },
                  null,
                  2,
                ),
              }
            }
          }
        },
      })
    })

    // Register the skill so it shows up in OpenCode's /skills list.
    await ctx.skill.transform((editor) => {
      editor.add({
        id: Skill.ID.make("agent-browser"),
        name: Skill.Name.make("agent-browser"),
        description: skillDescription,
        path: "/builtin/agent-browser.md" as any,
        content: skillTemplate,
        autoinvoke: false,
      })
    })

    // Surface the skill in the system prompt so the model knows when to use it.
    await ctx.session.hook("context", (event) => {
      event.system.push({
        type: "text",
        text: `
<available-skills>
## agent-browser
${skillDescription}
To use: Call the \`load_agent_browser_skill\` tool, then use bash to execute agent-browser commands.
</available-skills>
`,
      })
    })
  },
})