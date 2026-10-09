// Used for switching between regular topics and FA2026 in-class public assistant topics
// regular topics are under /public-assistant, while FA2026 topics are under /public-assistant-class

export const TOPIC_SETS = {
    default: { dir: 'topics', topics: ['congestion_pricing', 'covenant_marriage'] },
    fa2026: { dir: 'topics-fa2026', topics: ['1_swim_test', '2_four_day_week'] }
}