type UsageCycle = {
  ticketsProcessedThisCycle: number
  cycleResetAt?: Date | null | undefined
  createdAt?: Date | undefined
}

// Usage quotas renew on the first day of each UTC calendar month, for every plan.
export function nextUsageReset(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
}

export function resetMonthlyUsage(organization: UsageCycle, now = new Date()): boolean {
  const resetAt = organization.cycleResetAt ?? nextUsageReset(organization.createdAt ?? now)
  if (resetAt <= now) {
    organization.ticketsProcessedThisCycle = 0
    organization.cycleResetAt = nextUsageReset(now)
    return true
  }
  if (!organization.cycleResetAt) {
    organization.cycleResetAt = resetAt
    return true
  }
  return false
}
