// Used for switching between regular topics and FA2026 in-class mediator topics
// regular topics are under /mediator, while FA2026 topics are under /mediator-class

export const TOPIC_SETS = {
    default: { dir: 'topics', topics: ['congestion_pricing', 'covenant_marriage'] },
    prolific: { dir: 'topics', topics: ['congestion_pricing', 'covenant_marriage'] },
    fa2026: { dir: 'topics-fa2026', topics: ['1_swim_test', '2_four_day_week'] }
}