export type CompetitionTask = 'task1' | 'task2'

export const COMPETITION_RUN_LIMITS: Record<CompetitionTask, number> = { task1: 10, task2: 10 }

export function isCompetitionTask(t: unknown): t is CompetitionTask {
  return t === 'task1' || t === 'task2'
}

export function competitionQuotaFields(config: Record<string, unknown>, task: CompetitionTask) {
  return {
    countField: `competitionRuns_${task}`,
    dateField: `competitionRunsDate_${task}`,
    limit: (config[`competitionRunLimit_${task}`] as number | undefined) ?? COMPETITION_RUN_LIMITS[task],
  }
}
