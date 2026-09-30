import path from 'path'

export const SEED = 123

const LOCAL = process.env.NODE_ENV === 'development'

export const BASE_URL = LOCAL
  ? 'http://127.0.0.1:5001/your-project-id/us-central1/api/v1'
  : 'https://us-central1-traust-491612.cloudfunctions.net/api/v1'

export const CREATE_PARTICIPANT_URL = LOCAL
  ? 'http://127.0.0.1:5001/your-project-id/us-central1/createParticipant'
  : 'https://us-central1-traust-491612.cloudfunctions.net/createParticipant'

export const FRONTEND_BASE = LOCAL
  ? 'https://localhost:4201'
  : 'https://convoarena.infosci.cornell.edu'

export const API_KEY = process.env.DL_API_KEY ?? ''

export const PROJECT_ROOT = process.cwd()

export const MEDIATOR_DEFAULT = path.join(PROJECT_ROOT, 'public', 'templates', 'defaults', 'mediator.yaml')
export const EXPERIMENT_DEFAULT = path.join(PROJECT_ROOT, 'public', 'templates', 'defaults', 'experiment.yaml')

export const STAGE_R1 = 'chat-round-1'
export const PRE_SURVEY_STAGE_ID = "pre-survey"
export const POST_SURVEY_STAGE_ID = "post-survey"

export const COMPLETION_CODE = ''