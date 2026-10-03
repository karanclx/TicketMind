import { logger } from "../../config/logger.js"
import { randomUUID } from "node:crypto"

export type QueuePayload = {
  ticketId: string
  organizationId: string
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
  organizationId: string
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

/**
 * In-process job queue with retry/backoff and dead-letter tracking.
 *
 * LIMITATION: all state (pending jobs, retry timers, job tracking, dead-letter
 * entries) lives only in this process's memory.
 * - A restart or crash loses every queued, retrying and dead-lettered job; tickets
 *   caught mid-flight stay in "pending"/"processing" in MongoDB with no job to finish them.
 * - It does not work across multiple instances: each process has its own queue, and
 *   GET /health only reports the queue of whichever instance served the request.
 * A persistent broker (e.g. Redis/BullMQ) would be needed to lift this; that is
 * intentionally out of scope for now. See "Known Limitations" in README.md.
 */
export class TicketQueue {
  private readonly queue: QueueJob[] = []
  private readonly tracking = new Map<string, JobTracking>()
  private readonly deadLetter = new Map<string, JobTracking>()
  private active = false
  private readonly maxAttempts = 3

  constructor(private readonly processFn: ProcessCallback) {}

  public enqueue(ticketId: string, organizationId: string, incrementReprocessCount = false): { jobId: string } {
    const job: QueueJob = {
      jobId: randomUUID(),
      ticketId,
      organizationId,
      attempt: 1,
      maxAttempts: this.maxAttempts,
      incrementReprocessCount,
      createdAt: new Date().toISOString()
    }

    this.queue.push(job)
    this.tracking.set(job.jobId, {
      jobId: job.jobId,
      ticketId: job.ticketId,
      organizationId: job.organizationId,
      status: "queued",
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      updatedAt: new Date().toISOString()
    })

    this.run().catch((error: unknown) => {
      logger.error({ error }, "Queue run failed")
    })

    return { jobId: job.jobId }
  }

  public getJobStatus(jobId: string, organizationId: string): JobTracking | null {
    const job = this.tracking.get(jobId) ?? this.deadLetter.get(jobId) ?? null
    // If the job belongs to someone else, hide it
    if (job && job.organizationId !== organizationId) {
      return null
    }
    return job
  }

  public stats(organizationId: string): QueueStats {
    let processing = 0
    let retrying = 0
    let completed = 0
    let queued = 0
    let deadLetter = 0

    for (const item of this.queue) {
      if (item.organizationId === organizationId) queued++
    }

    for (const item of this.tracking.values()) {
      if (item.organizationId !== organizationId) continue
      
      if (item.status === "processing") processing += 1
      if (item.status === "retrying") retrying += 1
      if (item.status === "completed") completed += 1
    }

    for (const item of this.deadLetter.values()) {
      if (item.organizationId === organizationId) deadLetter += 1
    }

    return {
      active: this.active, // Queue runner active state is global
      queued,
      processing,
      retrying,
      completed,
      deadLetter
    }
  }

  public deadLetterJobs(organizationId: string): JobTracking[] {
    return [...this.deadLetter.values()].filter(job => job.organizationId === organizationId)
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
          organizationId: job.organizationId,
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
              organizationId: job.organizationId,
              attempt: nextAttempt,
              maxAttempts: job.maxAttempts,
              createdAt: job.createdAt,
              incrementReprocessCount: false
            })

            this.run().catch((runError: unknown) => {
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
