import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { SKILL_NAME, skillDescription, skillTemplate } from "./src/skill.ts"
import {
  attachArgsFor,
  createRealDeps,
  listBackend,
  resolveBinary,
  startBackend,
  stopBackend,
} from "./src/obscura/index.ts"

export const OpenCodeAgentBrowser: Plugin = async (ctx) => {
  return {
    tool: {
      load_agent_browser_skill: tool({
        description: `Load the agent-browser skill for browser automation. Use when tasks involve: screenshots, web scraping, form automation, browser navigation, visual testing, or webpage interaction. Trigger phrases: screenshot, scrape, browser, webpage, navigate, fill form, test website.`,
        args: {},
        async execute(args, toolCtx) {
          await ctx.client.session.prompt({
            path: { id: toolCtx.sessionID },
            body: {
              noReply: true,
              parts: [
                {
                  type: "text",
                  text: `# Skill Loaded: ${SKILL_NAME}\n\n${skillTemplate}`,
                },
              ],
            },
          })
          return `Skill "${SKILL_NAME}" loaded. Use bash to execute agent-browser commands. Run "agent-browser skills get core --full" for the complete reference.`
        },
      }),

      obscura_backend: tool({
        description:
          "Manage the OPT-IN experimental Obscura backend (a local lightweight CDP engine). Chrome remains the default; this never runs at startup and never replaces Chrome unless explicitly started. Actions: start | attach | status | doctor | stop. Fixture mode (private-network access) is off by default and only allowed with explicit loopback-only targets.",
        args: {
          action: tool.schema
            .enum(["start", "attach", "status", "doctor", "stop"])
            .describe("start = launch local engine; attach = print agent-browser command; status/doctor = list runs; stop = terminate owned runs."),
          port: tool.schema
            .number()
            .int()
            .min(1)
            .max(65535)
            .optional()
            .describe("Explicit CDP port. Reserved ports (9222/8377/9333/...) are refused."),
          fixtureMode: tool.schema
            .boolean()
            .optional()
            .describe("Enables --allow-private-network. OFF by default; requires loopback-only targets."),
          targets: tool.schema
            .array(tool.schema.string())
            .optional()
            .describe("Declared fixture targets; all must be http(s) loopback URLs when fixtureMode is set."),
          sessionName: tool.schema
            .string()
            .optional()
            .describe("agent-browser session name (default obscura-<runId>)."),
          runId: tool.schema.string().optional().describe("Target a specific run for stop."),
        },
        async execute(args) {
          const deps = createRealDeps()
          switch (args.action) {
            case "start": {
              if (!resolveBinary()) {
                return JSON.stringify(
                  {
                    ok: false,
                    error:
                      "Obscura binary not found. Set OBSCURA_BIN to the obscura executable, or put it on PATH. Chrome (the default) is unaffected.",
                  },
                  null,
                  2,
                )
              }
              try {
                const res = await startBackend(deps, {
                  port: args.port,
                  fixtureMode: args.fixtureMode,
                  targets: args.targets,
                })
                const session = args.sessionName ?? `obscura-${res.runId}`
                const command = `agent-browser --session ${session} ${res.attachArgs.join(" ")} open <url>`
                return JSON.stringify(
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
                )
              } catch (err) {
                return JSON.stringify({ ok: false, error: (err as Error).message }, null, 2)
              }
            }
            case "attach": {
              try {
                const argv = attachArgsFor(deps, args.port, args.sessionName)
                const session = args.sessionName ?? "obscura-work"
                return JSON.stringify(
                  {
                    ok: true,
                    backend: "obscura",
                    attachArgs: argv,
                    exampleCommand: `agent-browser --session ${session} ${argv.join(" ")} open <url>`,
                  },
                  null,
                  2,
                )
              } catch (err) {
                return JSON.stringify({ ok: false, error: (err as Error).message }, null, 2)
              }
            }
            case "status":
            case "doctor": {
              const runs = listBackend(deps)
              return JSON.stringify({ ok: true, action: args.action, count: runs.length, runs }, null, 2)
            }
            case "stop": {
              const verdicts = stopBackend(deps, args.runId)
              return JSON.stringify(
                {
                  ok: true,
                  stopped: verdicts.filter((v) => v.owned).length,
                  results: verdicts,
                  note: "Only processes positively verified as owned by a launcher run were terminated.",
                },
                null,
                2,
              )
            }
          }
        },
      }),
    },

    "experimental.chat.system.transform": async (input, output) => {
      output.system.push(`
<available-skills>
## agent-browser
${skillDescription}
To use: Call the \`load_agent_browser_skill\` tool, then use bash to execute agent-browser commands.
</available-skills>
`)
    },
  }
}

export default OpenCodeAgentBrowser
