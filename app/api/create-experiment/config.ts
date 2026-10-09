import path from 'path'
import {resolveDlApiKey} from '../dl-key'


export const SEED = 123

const LOCAL = false && process.env.NODE_ENV === 'development'

export const BASE_URL = LOCAL
? 'http://127.0.0.1:5001/traust-491612/us-central1/api/v1'
: 'https://us-central1-traust-491612.cloudfunctions.net/api/v1'

export const CREATE_PARTICIPANT_URL = LOCAL
? 'http://127.0.0.1:5001/traust-491612/us-central1/createParticipant'
: 'https://us-central1-traust-491612.cloudfunctions.net/createParticipant'

export const FRONTEND_BASE = LOCAL
  ? 'https://localhost:4201'
  : 'https://convoarena.infosci.cornell.edu'

export const API_KEY = resolveDlApiKey()

export const PROJECT_ROOT = process.cwd()

export const PUBLIC_ASSISTANT_DEFAULT = path.join(PROJECT_ROOT, 'public', 'templates', 'defaults', 'mediator.yaml')
// Stock public assistant used when a caller (e.g. the simulation toolkit) runs without
// authoring one. Same file the public assistant toolkit seeds its editor with, and it
// is layered over PUBLIC_ASSISTANT_DEFAULT by buildPublicAssistant just like an authored one.
export const PUBLIC_ASSISTANT_PRESET = path.join(PROJECT_ROOT, 'public', 'templates', 'competition', 'mediator.yaml')
export const ASSISTANT_DEFAULT = path.join(PROJECT_ROOT, 'public', 'templates', 'defaults', 'assistant.yaml')
export const EXPERIMENT_DEFAULT = path.join(PROJECT_ROOT, 'public', 'templates', 'defaults', 'experiment.yaml')
export const COMPETITION_PUBLIC_ASSISTANT = path.join(PROJECT_ROOT, 'public', 'templates', 'competition', 'mediator.yaml')

export const STAGE_R1 = 'chat-round-1'
export const PRE_SURVEY_STAGE_ID = "pre-survey"
export const POST_SURVEY_STAGE_ID = "post-survey"

export const COMPLETION_CODE = ''
