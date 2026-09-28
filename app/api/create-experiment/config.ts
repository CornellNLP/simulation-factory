import path from 'path'
import {resolveDlApiKey} from '../dl-key'


export const SEED = 123

const LOCAL = process.env.NODE_ENV === 'development'


// The local Functions emulator's project id must match whatever project it
// was actually started for (see .firebaserc in that backend checkout) — it
// has no relation to which project the deployed (non-local) URL below points
// at, so don't assume they're the same string.
export const BASE_URL = LOCAL
? 'http://127.0.0.1:5001/convoarenadev/us-central1/api/v1'
: 'https://us-central1-convoarenadev.cloudfunctions.net/api/v1'




export const CREATE_PARTICIPANT_URL = LOCAL
? 'http://127.0.0.1:5001/convoarenadev/us-central1/createParticipant'
: 'https://us-central1-convoarenadev.cloudfunctions.net/createParticipant'




export const FRONTEND_BASE = LOCAL
  ? 'https://localhost:4201'
  : 'https://convoarenadev.web.app'

export const API_KEY = resolveDlApiKey()

export const PROJECT_ROOT = process.cwd()

export const MEDIATOR_DEFAULT = path.join(PROJECT_ROOT, 'public', 'templates', 'defaults', 'mediator.yaml')
// Stock mediator used when a caller (e.g. the simulation toolkit) runs without
// authoring one. Same file the mediator toolkit seeds its editor with, and it
// is layered over MEDIATOR_DEFAULT by buildMediator just like an authored one.
export const MEDIATOR_PRESET = path.join(PROJECT_ROOT, 'public', 'templates', 'competition', 'mediator.yaml')
export const ASSISTANT_DEFAULT = path.join(PROJECT_ROOT, 'public', 'templates', 'defaults', 'assistant.yaml')
export const EXPERIMENT_DEFAULT = path.join(PROJECT_ROOT, 'public', 'templates', 'defaults', 'experiment.yaml')
export const COMPETITION_MEDIATOR = path.join(PROJECT_ROOT, 'public', 'templates', 'competition', 'mediator.yaml')

export const STAGE_R1 = 'chat-round-1'
export const PRE_SURVEY_STAGE_ID = "pre-survey"
export const POST_SURVEY_STAGE_ID = "post-survey"

export const COMPLETION_CODE = ''
