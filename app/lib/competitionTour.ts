import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

export function startTour() {
    driver({
        showProgress: true,
        steps: [
            {
                element: '#tour-tracks',
                popover: {
                    title: 'Mediator Tabs',
                    description:
                        'Switch between your constructive mediator and your covert mediator. Each one has its own prompts.',
                        // 'Each one has its own template, and the simulation checks the one you are working on.',
                    onNextClick: (_element, _step, opts) => {
                        document.querySelector<HTMLElement>('#tour-tab-task2')?.click()
                        setTimeout(() => opts.driver.moveNext())
                    },
                },
            },
            {
                element: '#tour-copy-constructive',
                popover: {
                    title: 'Copy Your Constructive Mediator',
                    description: 'Start your covert influence mediator from a copy of your constructive mediator.',
                },
            },
            {
                element: '#tour-template-name',
                popover: {
                    title: '',
                    description:
                        'Your mediator\'s name. ' +
                        'Click the pencil next to it to rename.',
                },
            },
            {
                element: '#tour-save',
                popover: {
                    title: '',
                    description: 'Save your mediator.',
                },
            },
            {
                element: '#tour-new-template',
                popover: {
                    title: '',
                    description: 'Create a new mediator, either starting from the default template or from one of your saved mediators.',
                },
            },
            {
                element: '#tour-prompt-editors',
                popover: {
                    title: 'Prompt Editors',
                    description:
                        'Prompt editors: this is the soul of your Mediator, the prompts determine when and how it intervenes. ' +
                        'Be creative!',
                },
            },
            {
                element: '#tour-prompt-tab-response',
                popover: {
                    title: 'Intervention Prompt Editor',
                    description:
                        'Intervention prompt editor: here you design how the Mediator intervenes. ' +
                        'You can combine different prompt-blocks (such as the topic being discussed, the content of the chat, etc.) and connect them with your own text.',
                },
            },
            {
                element: '#tour-prompt-tab-should-respond',
                popover: {
                    title: 'Should Intervene Editor',
                    description: 'Your mediator uses this prompt after each message in the discussion to decide whether this is a good time to intervene.',
                },
            },
            {
                element: '#tour-prompt-tab-initialization',
                popover: {
                    title: 'Initialization Prompt Editor',
                    description:
                        'A prompt that is run at the start of the conversation to gather information about the topic, participants, or anything else. ' +
                        'This is information that can subsequently be accessed by your mediator during the conversation.',
                },
            },
            {
                element: '#tour-add-item',
                popover: {
                    title: 'Add Item',
                    description:
                        'Here you can add to your prompt any of the prompt blocks listed above, or your own Freeform Text block to provide instructions and connect these blocks. ' +
                        'You can edit and reorder the sequence of blocks to obtain unique instructions for your Mediator.',
                },
            },
            {
                element: '#tour-preview',
                popover: {
                    title: 'Preview Prompt',
                    description: 'See the prompt your mediator will receive during a discussion with congestion pricing as an example.',
                },
            },
            {
                element: '#tour-chat-settings',
                popover: {
                    title: 'Mediator Parameters (Advanced)',
                    description: 'Mediator parameters: here you can change different parameters that dictate how your mediator behaves.',
                },
            },
            // { element: '#tour-template-upload', popover: { title: 'Import your Mediator', description: 'Use this to upload a previously exported mediator template.' } },
            {
                element: '#tour-create',
                popover: {
                    title: 'Test in example discussion',
                    description:
                        'You can check your mediator and see how the participants will experience it during an example discussion. ' +
                        'You can test it in a discussion between you and a friend, with an agent, or by seeing how two agents discuss with each other.',
                },
            },
            {
                element: '#tour-simulate',
                popover: {
                    title: 'Check Validity',
                    description:
                        'Here you can check if your mediators are a valid for submitting to the competition. ' +
                        'This is done by analyzing how your mediator performs in simulated conversations. ' +
                        'There are different tests for the constructive mediator and for the covert influence mediator. ' +
                        'You can run a total of 10 tests per day, and each test contains multiple runs.',
                },
            },
            {
                element: '#tour-template-download',
                popover: {
                    title: 'Export your Mediator',
                    description:
                        'Download both your constructive and covert influence mediators. ' +
                        'You will need both files for your submission.',
                },
            },
            {
                element: '#tour-submit',
                popover: {
                    title: 'Submit your Mediators',
                    description: 'Once you developed and downloaded both your mediators you can use this button to fill in the submission form.',
                },
            },
            {
                element: '#tour-show',
                popover: {
                    title: 'Tour',
                    description: 'Click here to show the tour again.',
                },
            },
        ],
    }).drive()
}
