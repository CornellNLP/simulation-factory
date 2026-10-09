export enum PolicyType {
  CONDUCT = 'CONDUCT',
  CONTENT = 'CONTENT',
  DELETION = 'DELETION',
  ENFORCEMENT = 'ENFORCEMENT',
  LEGAL = 'LEGAL',
  PROCEDURAL = 'PROCEDURAL',
  MISCELLANEOUS = 'MISCELLANEOUS',
}

export interface Policy {
    name: string
    type: PolicyType
}

const POLICY_GROUPS: Partial<Record<PolicyType, string[]>> = {
  [PolicyType.CONDUCT]: [
    'WP:Civility',
    'WP:Clean start',
    'WP:Consensus',
    'WP:Dispute resolution',
    'WP:Edit warring',
    'WP:Editing policy',
    'WP:Harassment',
    'WP:No personal attacks',
    'WP:Ownership of content',
    'WP:Sockpuppetry',
    'WP:Username policy',
    'WP:Vandalism',
  ],
  [PolicyType.CONTENT]: [
    'WP:Article titles',
    'WP:Biographies of living persons',
    'WP:Image use policy',
    'WP:Neutral point of view',
    'WP:No original research',
    'WP:Verifiability',
    'WP:What Wikipedia is not',
  ],
  [PolicyType.DELETION]: [
    'WP:Attack page',
    'WP:Criteria for speedy deletion',
    'WP:Deletion policy',
    'WP:Oversight',
    'WP:Proposed deletion',
    'WP:Proposed deletion of biographies of living people',
    'WP:Revision deletion',
  ],
  [PolicyType.ENFORCEMENT]: [
    'WP:Administrators',
    'WP:Banning policy',
    'WP:Blocking policy',
    'WP:Page protection policy',
  ],
  [PolicyType.LEGAL]: [
    'WP:Child protection',
    'WP:Copyright violations',
    'WP:Copyrights',
    'WP:Libel',
    'WP:No legal threats',
    'WP:Non-free content criteria',
    'WP:Paid-contribution disclosure',
    'WP:Reusing Wikipedia content',
    'WP:Terms of use',
  ],
  [PolicyType.PROCEDURAL]: [
    'WP:Arbitration Committee/CheckUser and Oversight',
    'WP:Arbitration/Policy',
    'WP:Bot policy',
    'WP:CheckUser',
    'WP:Edit filter manager',
    'WP:Edit filter helper',
    'WP:Event coordinator',
    'WP:Global rights policy',
    'WP:Interface administrators',
    'WP:IP block exemption',
    'WP:Open proxies',
    'WP:Page mover',
    'WP:Policies and guidelines',
    'WP:Temporary account IP viewer',
    'WP:Volunteer response team',
    'WP:Wikimedia policy',
  ],
  [PolicyType.MISCELLANEOUS]: [
    'WP:Ignore all rules',
    'WP:Password strength requirements',
  ],
}

export const POLICIES: Policy[] = Object.entries(POLICY_GROUPS).flatMap(
  ([type, names]) => (names ?? []).map(name => ({ name, type: type as PolicyType }))
)
