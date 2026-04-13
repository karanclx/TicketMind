import { describe, expect, it, jest } from "@jest/globals"

import { AiPipelineService } from "../modules/ai-pipeline/ai-pipeline.service.js"
import type { LlmClient } from "../modules/ai-pipeline/llm-client.js"

describe("AiPipelineService", () => {
  it("processes all three steps with mock LLM", async () => {
    const completeJson = jest
      .fn<
        LlmClient["completeJson"]
      >()
      .mockResolvedValueOnce({
        cleaned_title: "VPN issue",
        cleaned_description: "VPN disconnects for all users",
        key_signals: ["vpn", "all users"],
        impact_scope: "org",
        confidence: 0.9
      })
      .mockResolvedValueOnce({
        category: "Network",
        priority: "Critical",
        summary: "VPN outage affecting users.",
        rationale: "Multiple outage indicators found.",
        confidence: 0.92
      })
      .mockResolvedValueOnce({
        root_cause: "Likely VPN gateway outage.",
        suggested_resolution: "1) Check gateway health. 2) Restart failover. 3) Notify users.",
        auto_resolve: true,
        confidence: 0.9
      })

    const service = new AiPipelineService({ completeJson })

    const output = await service.processTicket({
      title: "VPN down",
      description: "Entire team cannot connect",
      user_role: "admin",
      timestamp: "2026-04-07T10:00:00.000Z"
    })

    expect(output.result.category).toBe("Network")
    expect(output.result.priority).toBe("Critical")
    expect(output.result.auto_resolve).toBe(false)
    expect(output.trace).toEqual({ extraction: "success", classification: "success", resolution: "success" })
    expect(completeJson).toHaveBeenCalledTimes(3)
  })

  it("retries step and falls back if invalid output persists", async () => {
    const completeJson = jest
      .fn<
        LlmClient["completeJson"]
      >()
      .mockResolvedValue({
        invalid: true
      })

    const service = new AiPipelineService({ completeJson })

    const output = await service.processTicket({
      title: "Password reset",
      description: "Forgot password and cannot login",
      user_role: "employee",
      timestamp: "2026-04-07T10:00:00.000Z"
    })

    expect(output.trace.extraction).toBe("fallback")
    expect(output.result.category).toBe("Login")
    expect(completeJson).toHaveBeenCalledTimes(3)
  })
})
