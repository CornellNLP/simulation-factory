import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

// tour for the prolific toolkit (ProlificMediatorApp); competition keeps tour.ts
export function startTour() {
    driver({
        showProgress: true,
        steps: [
            { element: '#tour-template-name', popover: { title:'', description: 'Your mediator template\'s name. Click the pencil next to it to rename.' } },
            { element: '#tour-save', popover: { title: '', description: 'Save changes to this template\'s content.' } },
            { element: '#tour-new-template', popover: { title: '', description: 'Create a new template — start from scratch (Default Template) or duplicate one of your existing templates.' } },
            { element: '#tour-prompt-editors', popover: { title: 'Prompt Editors', description: 'Prompt editors: this is the soul of your Mediator, the prompts determine when and how it intervenes.  Be creative!' } },
            { element: '#tour-prompt-tab-response', popover: { title: 'Intervention Prompt Editor', description: 'Intervention prompt editor: here you design how the Mediator intervenes. You can combine different prompt-blocks (such as the topic being discussed, the content of the chat, etc.).' } },
            { element: '#tour-prompt-tab-should-respond', popover: { title: 'Should Intervene Editor', description: 'Your mediator uses this prompt after each message in the discussion to decide whether this is a good time to intervene.' } },
            { element: '#tour-prompt-tab-initialization', popover: { title: 'Initialization Prompt Editor', description: 'A prompt that is run at the start of the conversation to gather information about the topic, participants, or anything else. This is information that can subsequently be accessed by your mediator during the conversation.' } },
            { element: '#tour-add-item', popover: { title: 'Add Item', description: 'Here you can add to your prompt any of the prompt blocks listed above, or a Freeform Text block.  You can edit and reorder the sequence of blocks to obtain unique instructions for your Mediator.' } },
            { element: '#tour-preview', popover: { title: 'Preview Prompt', description: 'See what the prompt looks like in the experiment, with an example topic filled in.' } },
            { element: '#tour-template-download', popover: { title: 'Export your Mediator', description: 'You will need this for the submission.' } },
            // { element: '#tour-template-upload', popover: { title: 'Import your Mediator', description: 'Use this to upload a previously exported mediator template.' } },
            { element: '#tour-create',popover: { title: 'See an Example Discussion', description: 'Click Create to set up one example discussion between two AI participants and your mediator. Open the links that appear to watch it the way participants see it.' } },
            { element: '#tour-simulate', popover: { title: 'Simulate', description: 'This is the main section where you can run multiple discussions with agents to see how your Mediator behaves across multiple scenarios.  You can compute a score for the task to help you understand the results.  (Note that the simulations are resource-intensive, so they will take some time to run and there is a limit of how many you can run each day.)' } },
            { element: '#tour-show', popover: { title: 'Tour', description: 'Click here to show the tour again.' } },
        ],
    }).drive()
}
