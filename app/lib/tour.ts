import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

export function startTour() {
    driver({
        showProgress: true,
        steps: [
            { element: '#tour-template-name', popover: { title:'', description: 'Your public assistant template\'s name. Click the pencil next to it to rename.' } },
            { element: '#tour-save', popover: { title: '', description: 'Save changes to this template\'s content.' } },
            { element: '#tour-new-template', popover: { title: '', description: 'Create a new template — start from scratch (Default Template) or duplicate one of your existing templates.' } },
            { element: '#tour-prompt-editors', popover: { title: 'Prompt Editors', description: 'Prompt editors: this is the soul of your Public Assistant, the prompts determine when and how it intervenes.  Be creative!' } },
            { element: '#tour-prompt-tab-response', popover: { title: 'Intervention Prompt Editor', description: 'Intervention prompt editor: here you design how the Public Assistant intervenes. You can combine different prompt-blocks (such as the topic being discussed, the content of the chat, etc.).' } },
            { element: '#tour-prompt-tab-should-respond', popover: { title: 'Should Intervene Editor', description: 'Your public assistant uses this prompt after each message in the discussion to decide whether this is a good time to intervene.' } },
            { element: '#tour-prompt-tab-initialization', popover: { title: 'Initialization Prompt Editor', description: 'A prompt that is run at the start of the conversation to gather information about the topic, participants, or anything else. This is information that can subsequently be accessed by your public assistant during the conversation.' } },
            { element: '#tour-add-item', popover: { title: 'Add Item', description: 'Here you can add to your prompt any of the prompt blocks listed above, or a Freeform Text block.  You can edit and reorder the sequence of blocks to obtain unique instructions for your Public Assistant.' } },
            { element: '#tour-chat-settings', popover: { title: 'Public Assistant Parameters', description: 'Public Assistant parameters: here you can change different parameters that dictate how your public assistant behaves.' } },
            // { element: '#tour-template-upload', popover: { title: 'Import your Public Assistant', description: 'Use this to upload a previously exported public assistant template.' } },
            { element: '#tour-show', popover: { title: 'Tour', description: 'Click here to show the tour again.' } },
        ],
    }).drive()
}
