import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

// tour for the prolific toolkit (ProlificMediatorApp); competition has competitionTour.ts
export function startTour() {
    driver({
        showProgress: true,
        steps: [
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
            // { element: '#tour-template-upload', popover: { title: 'Import your Mediator', description: 'Use this to upload a previously exported mediator template.' } },
            {
                element: '#tour-create',
                popover: {
                    title: 'Test in example discussion',
                    description:
                        'You can check your mediator and see how the participants will experience it during an example discussion. ' +
                        'You can test it by seeing how two agents discuss with each other.',
                },
            },
            {
                element: '#tour-simulate',
                popover: {
                    title: 'Check Validity',
                    description:
                        'Here you can check if your mediator is valid for submission. ' +
                        'This is done by analyzing how your mediator performs in simulated conversations. ' +
                        'You can run a total of 20 tests per day.',
                },
            },
            {
                element: '#tour-history',
                popover: {
                    title: 'History Runs',
                    description:
                        'Results of your 20 most recent tests, across all your mediators. ' +
                        'A ✓ marks a score that meets its target, and Passed means both do. ' +
                        'Click Load to bring back the version of the mediator used in that test.',
                },
            },
            {
                element: '#tour-template-download',
                popover: {
                    title: 'Export your Mediator',
                    description:
                        'Download your mediator. ' +
                        'You will need this file for your submission.',
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
