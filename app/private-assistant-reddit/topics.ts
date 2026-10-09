interface RedditPost {
    title : string
    description : string
    link : string
}

export const CMV_POSTS : RedditPost[] = [
    {
        title: "CMV: Taxpayer dollars should not be used to subsidize the building of new professional sports stadiums.",
        description: `Professional sports teams are most often owned by millionaires and billionaires. So why is it when they need a new stadium, so often are the taxpayers forced to have their money spent on building it? Especially in large cities that already have robust tourism?

There is an argument that the stadiums bring in revenue to the city/local economy that offset the subsidies. It is thought that people traveling to the city for games will spend money on hotels, restaurants, shopping, seeing local museums and the like, and that the income from those new tourists, brought on solely by the professional sports team, will be a boon to the local economy. This "fact", however, has been disputed by economists for decades. Here are a few resources showing that this is not the case:

https://www.usnews.com/opinion/thomas-jefferson-street/articles/2017-03-28/las-vegas-bet-on-an-oakland-raiders-stadium-wont-pay-off

https://economicaccountability.org/get-informed/stadium-subsidies/

https://taxfoundation.org/blog/sports-stadium-subsidies-taxpayers/

https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4022547

Understand that most of the resources posted are articles, however they link to or cite studies. The last one is a literature review looking at over 130 studies to determine that there is likely 0 to almost 0 positive economic impact from a professional sports stadium.

When pitching their stadiums and asking for the subsidies, teams will often cite high numbers of potential economic impact, however these numbers are generally inflated by treating all potential visitors as "new spenders", when the majority are locals anyway, and the spending that would occur in the community would likely occur anyway, regardless of the sports team, and can even take away spending from other local entertainment venues.

The "jobs created" are generally low-paying, seasonal, and very part-time. One quote from the literature review stated “The large and growing peer-reviewed economics literature on the economic impacts of stadiums, arenas, sports franchises, and sport megaevents has consistently found no substantial evidence of increased jobs, incomes, or tax revenues for a community associated with any of these things.”

I feel all of this is doubly true when we're talking about building a new stadium for a team that already has a stadium in that city. In this case, there will be no real positive impact on the local economy, because most of the jobs already exist, and the draw for city tourism already exists.

To change my view: You'll need to show that the evidence I've presented is somehow faulty. That there are well-developed studies that show that tax subsidies for the building of new professional sports stadiums have a significant positive impact on the community that outweighs the taxpayer dollars used in the construction/maintenance.

Or, you can show that even with a mostly zero positive economic impact, that there is some other positive community impact that justifies the utilization of large amounts of taxpayer dollars that could otherwise be used for other community improvements.`,
        link: 'https://www.reddit.com/r/changemyview/comments/1vnig0x/cmv_taxpayer_dollars_should_not_be_used_to/'
    },
    {
        title: "CMV: Tigers are the most all-around aesthetic animals",
        description: `My CMV: Tigers are the most all-around aesthetic animals. Other species may be superior in particular categories, but tigers combine categories in a way that makes them aesthetically superior.

Color scheme. Their bright orange stripes are beautiful.

There are snakes, birds, and fish that may have superior colors, but they all lose out in other categories.

2. Body proportion. A tiger’s paws, head, and torso all fit together perfectly.

Contrast with freaks like bison. Tiny legs, giant head.

3. Majesty. Tigers are beautiful and terrifying.

Other species can be more majestic — whales are probably the most majestic animals on the planet, but fail in other categories.

4. Cuteness. They have the fluffiness and some of the cute behavior of house cats, like sitting in boxes.

This is certainly the tiger’s weakness, as it is very easy to list cuter animals. Pandas, red pandas, otters, and so on — but where is the majesty of the panda? Nowhere to be seen.

So that’s why tigers rule.`,
        link: "https://www.reddit.com/r/changemyview/comments/1vrdlmu/cmv_tigers_are_the_most_allaround_aesthetic/"
    }

]

interface CMVRule {
    rule : string
    title : string
    description : string
}

export const CMV_RULES : CMVRule[] = [
    {
        rule: "A",
        title: "Rule A - Doesn't Explain View",
        description: "Explain the reasoning behind your view, not just what that view is (500+ human-generated characters required)."
    },
    {
        rule: "B",
        title: "Rule B - 3rd Party/Devils Advocate/Soapboxing",
        description: "You must personally hold the view and demonstrate that you are open to it changing. A post cannot be on behalf of others, playing devil's advocate, as any entity other than yourself, or 'soapboxing'. Posts by throwaway accounts must be approved through modmail."
    },
    {
        rule: "C",
        title: "Rule C - Unclear/Improper Title",
        description: `Submission titles must adequately sum up your view and include "CMV:" at the beginning. Posts with misleading/overly-simplistic titles or titles that contain spoilers may be removed.`
    },
    {
        rule: "D",
        title: "Rule D - Neutral/Transgender/Harm a specific person/Promo/Meta",
        description: "Posts cannot express a neutral stance, a stance regarding transgender topics, suggest harm against a specific person, be self-promotional, or discuss this subreddit (visit r/ideasforcmv instead)."
    },
    {
        rule: "E",
        title: "Rule E - No/Minimal Replies from OP in 2 hours",
        description: "Only post if you are willing to have a conversation with those who reply to you, and are available to do so within 2 hours of your post going live. If you haven't replied during this time, your post will be removed."
    },
    {
        rule: "1",
        title: "Rule 1 - Doesn't Challenge OP (top-level only)",
        description: "Direct responses to a CMV post must challenge at least one aspect of OP's stated view (however minor), unless they are asking a clarifying question."
    },
    {
        rule: "2",
        title: "Rule 2 - Rude/Hostile Comment",
        description: "Don't be rude or hostile to other users. Your comment will be removed even if the rest of it is solid. 'They started it' is not an excuse. You should report it, not respond to it."
    },
    {
        rule: "3",
        title: "Rule 3 - Bad Faith Accusation",
        description: "Refrain from accusing OP or anyone else of being unwilling to change their view, of using AI to generate their post or comment, of lying, or of arguing in bad faith. If you are unsure whether someone is genuine, ask clarifying questions (see: socratic method). If you think they are still exhibiting ill behaviour, please message us."
    },
    {
        rule: "4",
        title: "Rule 4 - Delta Abuse/Misuse or Should Award Delta",
        description: "Award a delta if you've acknowledged a change in your view. Do not use deltas for any other purpose. You must include an explanation of the change along with the delta so we know it's genuine. Delta abuse includes sarcastic deltas, joke deltas, super-upvote deltas, etc."
    },
    {
        rule: "5",
        title: "Rule 5 - Doesn't Contribute Meaningfully",
        description: `Comments must contain human-generated content and contribute meaningfully to the conversation. Comments that are only links, jokes, or "written upvotes" will be removed. Humor and affirmations of agreement can be contained within more substantial comments.`
    }
]