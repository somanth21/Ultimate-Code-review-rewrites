// Assistant Logic
const ASSISTANT_API_URL = 'http://127.0.0.1:8000/api/assistant';

// State
let sessionId = localStorage.getItem('assistant_session_id');
if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('assistant_session_id', sessionId);
}

const assistantInput = document.getElementById('chat-input'); // Re-using existing input if possible, or new one
const assistantHistory = document.getElementById('chat-history');
const modeSelect = document.getElementById('assistant-mode'); // To be added to HTML

// We need to hook into the existing UI or replace the event listeners
// The existing app.js handles #chat-input and #send-chat.
// We should probably replace that logic OR add a new specific input for the assistant if we want to separate them cleanly.
// However, the request says "Upgrade AI Assistant UI behavior".
// I will reuse the existing elements but change their behavior.

document.addEventListener('DOMContentLoaded', () => {
    // Override the send button behavior if we are on the assistant tab
    const sendBtn = document.getElementById('send-chat');
    if (sendBtn) {
        // Remove old listener effectively by cloning? Or just add new one and handle logic
        // Best to just replace the handleSendMessage function in app.js or 
        // create a new function and attach it, removing the old one if possible.
        // Since I cannot easily remove anonymous event listeners, I might need to
        // modifying app.js to *delegate* to this script if the mode is "assistant".
        // OR better: I will modify app.js to NOT handle the chat if I replace the logic here?
        // Actually, the user asked for `frontend/static/js/assistant.js`.
        // I should probably modify `index.html` to point to this new script AND potentially remove the old chat logic from `app.js` or `index.html` to avoid conflicts.

        // Let's create a specific function here and bind it.
        sendBtn.addEventListener('click', handleAssistantSend);
    }

    if (assistantInput) {
        assistantInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleAssistantSend();
        });
    }

    // Load initial greeting
    if (assistantHistory && assistantHistory.children.length === 0) {
        appendAssistantMessage('ai', "Hello! I'm your upgraded AI Assistant. I can help you with your project code using RAG. Select 'Project' mode to use your codebase as context.");
    }
});

async function handleAssistantSend() {
    const message = assistantInput.value.trim();
    if (!message) return;

    // UI Updates
    assistantInput.value = '';
    appendAssistantMessage('user', message);
    showTyping(); // Reuse existing function if available globally, else re-implement

    const mode = document.getElementById('assistant-mode') ? document.getElementById('assistant-mode').value : 'project';

    try {
        const response = await fetch(`${ASSISTANT_API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                message: message,
                mode: mode
            })
        });

        const data = await response.json();

        hideTyping(); // Reuse

        if (data.success) {
            appendAssistantMessage('ai', data.answer, data.citations);
        } else {
            appendAssistantMessage('ai', "⚠️ Error: " + data.answer);
        }

    } catch (error) {
        console.error("Assistant Error:", error);
        hideTyping();
        appendAssistantMessage('ai', "⚠️ Network error. Please check backend.");
    }
}

function appendAssistantMessage(role, text, citations = []) {
    const div = document.createElement('div');
    div.className = `flex gap-4 ${role === 'user' ? 'flex-row-reverse' : ''}`;

    const avatar = role === 'ai'
        ? `<div class="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">🧠</div>`
        : `<div class="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center shrink-0"><i class="fas fa-user"></i></div>`;

    const bubbleClass = role === 'ai'
        ? 'bg-slate-800/90 border border-slate-700 rounded-tl-none'
        : 'bg-blue-600 text-white rounded-tr-none';

    let contentHtml = role === 'ai' ? marked.parse(text) : text.replace(/\n/g, '<br>');

    // Add citations if any
    if (citations && citations.length > 0) {
        contentHtml += `<div class="mt-4 pt-3 border-t border-slate-700/50 text-xs text-slate-400">
            <p class="font-semibold mb-1">📚 Configured Context:</p>
            <ul class="space-y-1">
                ${citations.map(c => `<li><i class="fas fa-file-code mr-1"></i> ${c.source}</li>`).join('')}
            </ul>
        </div>`;
    }

    div.innerHTML = `
        ${avatar}
        <div class="${bubbleClass} p-4 rounded-2xl max-w-[85%] text-sm ${role === 'ai' ? 'text-slate-300 markdown-body' : ''}">
            ${contentHtml}
        </div>
    `;

    assistantHistory.appendChild(div);
    assistantHistory.scrollTop = assistantHistory.scrollHeight;

    // Highlight code
    if (role === 'ai') {
        div.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
    }
}

// Helper to interact with global UI
function showTyping() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.classList.remove('hidden');
        if (assistantHistory) assistantHistory.scrollTop = assistantHistory.scrollHeight;
    }
}

function hideTyping() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.classList.add('hidden');
}
