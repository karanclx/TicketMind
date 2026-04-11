import { logger } from "../../config/logger.js"
import { randomUUID } from "node:crypto"

export type QueuePayload = {
  ticketId: string
  incrementReprocessCount: boolean
}

type QueueJob = QueuePayload & {
  jobId: string
  attempt: number
  maxAttempts: number
  createdAt: string
}

type JobStatus = "queued" | "processing" | "retrying" | "completed" | "dead_letter"

type JobTracking = {
  jobId: string
  ticketId: string
  status: JobStatus
  attempt: number
  maxAttempts: number
  lastError?: string
  updatedAt: string
}

type QueueStats = {
  active: boolean
  queued: number
  processing: number
  retrying: number
  completed: number
  deadLetter: number
}

type ProcessCallback = (payload: QueuePayload) => Promise<void>

export class TicketQueue {
  private readonly queue: QueueJob[] = []
  private readonly tracking = new Map<string, JobTracking>()
  private readonly deadLetter = new Map<string, JobTracking>()
  private active = false
  private readonly maxAttempts = 3

  constructor(private readonly processFn: ProcessCallback) {}

  public enqueue(ticketId: string, incrementReprocessCount = false): { jobId: string } {
    const job: QueueJob = {
      jobId: randomUUID(),
      ticketId,
      attempt: 1,
      maxAttempts: this.maxAttempts,
      incrementReprocessCount,
      createdAt: new Date().toISOString()
    }

    this.queue.push(job)
    this.tracking.set(job.jobId, {
      jobId: job.jobId,
      ticketId: job.ticketId,
      status: "queued",
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      updatedAt: new Date().toISOString()
    })

    this.run().catch((error) => {
      logger.error({ error }, "Queue run failed")
    })

    return { jobId: job.jobId }
  }

  public getJobStatus(jobId: string): JobTracking | null {
    return this.tracking.get(jobId) ?? this.deadLetter.get(jobId) ?? null
  }

  public stats(): QueueStats {
    let processing = 0
    let retrying = 0
    let completed = 0

    for (const item of this.tracking.values()) {
      if (item.status === "processing") {
        processing += 1
      }
      if (item.status === "retrying") {
        retrying += 1
      }
      if (item.status === "completed") {
        completed += 1
      }
    }

    return {
      active: this.active,
      queued: this.queue.length,
      processing,
      retrying,
      completed,
      deadLetter: this.deadLetter.size
    }
  }

  public deadLetterJobs(): JobTracking[] {
    return [...this.deadLetter.values()]
  }

  private async run(): Promise<void> {
    if (this.active) {
      return
    }

    this.active = true
    while (this.queue.length > 0) {
      const job = this.queue.shift()
      if (!job) {
        continue
      }

      this.updateJob(job.jobId, {
        status: "processing",
        attempt: job.attempt
      })

      try {
        await this.processFn({
          ticketId: job.ticketId,
          incrementReprocessCount: job.incrementReprocessCount
        })

        this.updateJob(job.jobId, {
          status: "completed",
          attempt: job.attempt
        })
      } catch (error) {
        logger.warn({ error, ticketId: job.ticketId, attempt: job.attempt }, "Ticket processing failed")

        if (job.attempt < this.maxAttempts) {
          const nextAttempt = job.attempt + 1
          const delay = 200 * 2 ** (nextAttempt - 1)

          this.updateJob(job.jobId, {
            status: "retrying",
            attempt: job.attempt,
            lastError: error instanceof Error ? error.message : "Unknown processing error"
          })

          setTimeout(() => {
            this.queue.push({
              jobId: job.jobId,
              ticketId: job.ticketId,
              attempt: nextAttempt,
              maxAttempts: job.maxAttempts,
              createdAt: job.createdAt,
              incrementReprocessCount: false
            })

            this.run().catch((runError) => {
              logger.error({ error: runError }, "Queue retry run failed")
            })
          }, delay)
        } else {
          const lastError = error instanceof Error ? error.message : "Unknown processing error"

          this.updateJob(job.jobId, {
            status: "dead_letter",
            attempt: job.attempt,
            lastError
          })

          const finalState = this.tracking.get(job.jobId)
          if (finalState) {
            this.deadLetter.set(job.jobId, finalState)
          }

          logger.error(
            { jobId: job.jobId, ticketId: job.ticketId, attempt: job.attempt, error: lastError },
            "Job moved to dead-letter queue"
          )
        }
      }
    }

    this.active = false
  }

  private updateJob(
    jobId: string,
    patch: Partial<Pick<JobTracking, "status" | "attempt" | "lastError">>
  ): void {
    const current = this.tracking.get(jobId)
    if (!current) {
      return
    }

    this.tracking.set(jobId, {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString()
    })
  }
}
