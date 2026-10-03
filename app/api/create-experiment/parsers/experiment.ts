import crypto from 'crypto'
import { COMPLETION_CODE } from '../config'
import { wrapChars } from '../utils'
import type { AgentMediatorTemplate } from './mediator'
import type { AgentParticipantTemplate } from './agent'
import { substituteTokens } from '../utils'


export function buildTopic(t: Record<string, any>): Record<string, any> {
  return {
    name: t.name,
    statement: t.statement,
    scale_low: t.scale_low ?? 'Strongly disagree',
    scale_high: t.scale_high ?? 'Strongly agree',
    favor_disagree: t.favor_disagree,
    favor_agree: t.favor_agree,
  }
}

export function buildStages(experimentTemplate: Record<string, any>, topicInfo: Record<string, any>): Record<string, any>[] {
  const subs: Record<string, string> = {
    '{name}': topicInfo.name,
    '{statement}': topicInfo.statement,
    '{scale_low}': wrapChars(topicInfo.scale_low),
    '{scale_high}': wrapChars(topicInfo.scale_high),
    '{favor_disagree}': topicInfo.favor_disagree,
    '{favor_agree}': topicInfo.favor_agree,
  }
  return experimentTemplate.stageConfigs.map((s: any) => substituteTokens(s, subs))
}

export function buildExperiment(
  experimentTemplate: Record<string, any>,
  topicInfo: Record<string, any>,
  stages: Record<string, any>[],
  stageIdsInOrder: string[],
  mediator: AgentMediatorTemplate,
  agents: AgentParticipantTemplate[] | null,
  mode: string,
  sim: boolean
): [Record<string, any>, string] {

  const subs: Record<string, string> = { '{name}': topicInfo.name, '{statement}': topicInfo.statement }
  const exp = substituteTokens(experimentTemplate.experiment, subs)
  const meta = exp.metadata ?? {}
  const perm = exp.permissions ?? {}
  const cohort = exp.defaultCohortConfig ?? {}
  const prolific = exp.prolificConfig ?? {}

  const alias = topicInfo.name.toLowerCase().replaceAll(' ', '-')
  const eid = `toolkit-${alias}`
  const timeHash = crypto.createHash('sha256').update(String(process.hrtime.bigint())).digest('hex')
  const publicEid = 'exp-' + timeHash.slice(0, 16)
  const cohortAlias = `cohort-${eid}`

  let cohortDefinitions: Record<string, any>[]
  let cohortLockMap: Record<string, boolean>
  if (sim) {
    // config is taken care when creating the simulation, ignore them here.
    cohortDefinitions = []
    cohortLockMap = {}
  } else {
    cohortDefinitions = [
        {
          id: cohortAlias,
          alias: cohortAlias,
          name: `[toolkit] ${alias}`,
          description: `Test link for ${topicInfo.name}.`,
          maxParticipantsPerCohort: cohort.maxParticipantsPerCohort ?? 2,
        }
  
    ]
    cohortLockMap = { [cohortAlias]: false }

  }

  const template = {
    id: `template-${eid}`,
    experiment: {
      id: publicEid,
      versionId: 0,
      metadata: {
        name: `[${mode}] ${alias}`,
        publicName: meta.publicName ?? `${topicInfo.name} debate`,
        description: meta.description ?? '',
        tags: meta.tags ?? ['toolkit'],
      },
      permissions: { visibility: perm.visibility ?? 'public', readers: [] },
      defaultCohortConfig: {
        minParticipantsPerCohort: cohort.minParticipantsPerCohort ?? 2,
        maxParticipantsPerCohort: cohort.maxParticipantsPerCohort ?? 2,
        includeAllParticipantsInCohortCount: cohort.includeAllParticipantsInCohortCount ?? true,
        botProtection: cohort.botProtection ?? true,
      },
      prolificConfig: {
        enableProlificIntegration: prolific.enableProlificIntegration ?? false,
        defaultRedirectCode: prolific.defaultRedirectCode ?? COMPLETION_CODE,
        attentionFailRedirectCode: prolific.attentionFailRedirectCode ?? '',
        bootedRedirectCode: prolific.bootedRedirectCode ?? '',
      },
      stageIds: stageIdsInOrder,
      cohortLockMap: cohortLockMap,
      cohortDefinitions: cohortDefinitions,
      unlockTimeMs: exp.unlockTimeMs ?? null,
      unlockDurationMs: exp.unlockDurationMs ?? null,
    },
    stageConfigs: stages,
    agentMediators: [mediator],
    agentParticipants: agents ?? [],
    agentAssistants: [],
  }
  return [template, cohortAlias]
}
