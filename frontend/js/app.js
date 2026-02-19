// Tab Switching
const tabs = document.querySelectorAll('.tab-btn');
const contents = document.querySelectorAll('.tab-content');

// Helper to show a specific tab
function showTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(button => {
        button.classList.remove('border-blue-500', 'text-white', 'active');
        button.classList.add('border-transparent', 'text-slate-400');
    });

    // Show selected tab content
    const contentId = (tabName === 'github') ? 'githubContent' : `tab-${tabName}`;
    const content = document.getElementById(contentId);
    if (content) content.classList.remove('hidden');

    // Add active class to selected tab button
    // Handle both data-tab and onClick styles
    const tabSelector = (tabName === 'github') ? '#githubTab' : `[data-tab="${tabName}"]`;
    const tabButton = document.querySelector(tabSelector);

    if (tabButton) {
        if (tabName === 'github') {
            // GitHub tab has different styling in user request, but let's try to match existing if possible or use user's custom style
            tabButton.classList.add('text-white', 'bg-gray-800'); // User requested style classes
            tabButton.classList.remove('text-gray-400');
        } else {
            tabButton.classList.remove('border-transparent', 'text-slate-400');
            tabButton.classList.add('border-blue-500', 'text-white', 'active');
        }
    }

    // If GitHub tab, check connection
    if (tabName === 'github') {
        checkGitHubConnection();
    }
}


tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        showTab(target);
    });
});

// App Logic
const API_URL = 'http://127.0.0.1:8000/api';

const codeInput = document.getElementById('code-input');
const langSelect = document.getElementById('language-select');
const loader = document.getElementById('loader');

const clearCodeBtn = document.getElementById('clear-code');
if (clearCodeBtn) {
    clearCodeBtn.addEventListener('click', () => {
        codeInput.value = '';
        codeInput.focus();
    });
}

function getFocusAreas() {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

async function postData(endpoint, data) {
    loader.classList.remove('hidden');
    try {
        const response = await fetch(`${API_URL}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail?.user_message || errData.detail?.message || `Error: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error("API Error:", error);
        alert("An error occurred. Check console for details.");
        return null;
    } finally {
        loader.classList.add('hidden');
    }
}

// ── Animated counter ──
function animateCount(el, target) {
    let current = 0;
    const step = Math.max(1, Math.ceil(target / 20));
    const interval = setInterval(() => {
        current = Math.min(current + step, target);
        el.textContent = current;
        if (current >= target) clearInterval(interval);
    }, 40);
}

// ── Safe number helper ──
function num(x, d) { d = (d === undefined) ? 0 : d; const n = Number(x); return Number.isFinite(n) ? n : d; }

// ── Animate a number from 0 → target in an element ──
function animateValue(el, target, suffix) {
    suffix = suffix || '';
    target = num(target);
    if (target === 0) { el.textContent = '0' + suffix; return; }
    let current = 0;
    const step = Math.max(1, Math.ceil(target / 25));
    const iv = setInterval(() => {
        current = Math.min(current + step, target);
        el.textContent = current + suffix;
        if (current >= target) clearInterval(iv);
    }, 30);
}

// ── Show score-unavailable state ──
function showScoreUnavailable() {
    const container = document.getElementById('quality-score-container');
    if (!container) return;
    container.classList.remove('hidden');
    const gl = document.getElementById('grade-letter');
    const sn = document.getElementById('score-number');
    if (gl) gl.textContent = '-';
    if (sn) sn.textContent = '--/100';
    ['security', 'performance', 'maintainability', 'readability'].forEach(cat => {
        const valEl = document.getElementById(`score-${cat}-val`);
        const bar = document.getElementById(`bar-${cat}`);
        if (valEl) valEl.textContent = '--';
        if (bar) bar.style.width = '0%';
    });
}

// ── Display quality scores with animated gauge ──
// Accepts EITHER nested format { overall_score, grade, categories: { security: {score} } }
// OR flat format { overall, grade, security, performance, ... }
function displayQualityScores(scores) {
    console.log('quality_scores received:', scores);
    if (!scores) { showScoreUnavailable(); return; }

    const container = document.getElementById('quality-score-container');
    if (!container) { console.error('Missing #quality-score-container'); return; }
    container.classList.remove('hidden');

    // Support both nested (quality_scores) and flat (review.score) overall
    const overall = (scores.overall_score !== undefined) ? num(scores.overall_score) : num(scores.overall);
    const grade = scores.grade || '?';

    // ── SVG ring animation ──
    const circle = document.getElementById('score-circle');
    if (circle) {
        const circumference = 2 * Math.PI * 70; // r=70 in HTML
        circle.style.strokeDasharray = String(circumference);
        circle.style.strokeDashoffset = String(circumference); // reset to 0%
        // Update color by grade
        const gradeColors = { A: 'text-emerald-400', B: 'text-blue-400', C: 'text-yellow-400', D: 'text-orange-400', F: 'text-red-400' };
        ['text-emerald-400', 'text-blue-400', 'text-blue-500', 'text-yellow-400', 'text-orange-400', 'text-red-400'].forEach(cls => circle.classList.remove(cls));
        circle.classList.add(gradeColors[grade] || 'text-blue-500');
        // Animate ring
        const targetOffset = circumference - (overall / 100) * circumference;
        requestAnimationFrame(() => {
            circle.style.transition = 'stroke-dashoffset 1.2s ease-out';
            circle.style.strokeDashoffset = String(targetOffset);
        });
    } else { console.error('Missing #score-circle'); }

    // ── Grade letter + overall number ──
    const gradeLetter = document.getElementById('grade-letter');
    const scoreNumber = document.getElementById('score-number');
    if (gradeLetter) gradeLetter.textContent = grade;
    if (scoreNumber) animateValue(scoreNumber, overall, '/100');

    // ── Category bars with animated values ──
    const cats = ['security', 'performance', 'maintainability', 'readability'];
    cats.forEach((cat, i) => {
        // Read from nested categories first, fall back to flat
        let val = 0;
        if (scores.categories && scores.categories[cat] && scores.categories[cat].score !== undefined) {
            val = num(scores.categories[cat].score);
        } else {
            val = num(scores[cat]);
        }
        const bar = document.getElementById(`bar-${cat}`);
        const valEl = document.getElementById(`score-${cat}-val`);
        if (bar) {
            bar.style.width = '0%';
            setTimeout(() => { bar.style.width = `${val}%`; }, 150 + i * 100);
        } else { console.error(`Missing #bar-${cat}`); }
        if (valEl) {
            animateValue(valEl, val);
        } else { console.error(`Missing #score-${cat}-val`); }
    });
}

// ── Render badges ──
function renderBadges(badges) {
    let container = document.getElementById('badges-container');
    if (!container) return;
    container.innerHTML = '';
    (badges || []).forEach(b => {
        const chip = document.createElement('span');
        chip.className = 'inline-block bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-xs font-semibold px-3 py-1.5 rounded-full mr-2 mb-2 animate-pulse';
        chip.textContent = b;
        container.appendChild(chip);
        setTimeout(() => chip.classList.remove('animate-pulse'), 1500);
    });
}

// ── Render severity sections ──
function renderSections(sections) {
    const md = document.getElementById('review-markdown');
    if (!md) return;
    const sevMeta = {
        critical: { icon: '🔴', color: 'border-red-500', bg: 'bg-red-500/10' },
        high: { icon: '🟠', color: 'border-orange-500', bg: 'bg-orange-500/10' },
        medium: { icon: '🟡', color: 'border-yellow-500', bg: 'bg-yellow-500/10' },
        low: { icon: '🟢', color: 'border-emerald-500', bg: 'bg-emerald-500/10' }
    };
    let html = '';
    for (const [sev, meta] of Object.entries(sevMeta)) {
        const items = sections[sev] || [];
        if (!items.length) continue;
        html += `<div class="mb-4"><h4 class="text-sm font-bold text-white mb-2">${meta.icon} ${sev.charAt(0).toUpperCase() + sev.slice(1)} (${items.length})</h4>`;
        items.forEach(item => {
            const lineTag = item.line ? `<span class="text-xs bg-slate-700 px-1.5 py-0.5 rounded text-slate-400 ml-2">L${item.line}</span>` : '';
            html += `<div class="mb-3 p-3 rounded-lg ${meta.bg} border-l-4 ${meta.color}">
                <div class="font-semibold text-white text-sm">${item.title || 'Issue'}${lineTag}</div>
                <p class="text-slate-300 text-xs mt-1">${item.detail || ''}</p>
                ${item.suggestion ? `<p class="text-emerald-400 text-xs mt-1">💡 ${item.suggestion}</p>` : ''}
            </div>`;
        });
        html += `</div>`;
    }
    md.innerHTML = html || '<p class="text-slate-400">No issues found — great code!</p>';
}

// ── Review Logic ──
const btnReview = document.getElementById('btn-review');
if (btnReview) {
    btnReview.addEventListener('click', async () => {
        const code = codeInput.value;
        if (!code.trim()) return alert("Please enter some code first.");

        // Switch to review tab + disable button
        showTab('review');
        btnReview.disabled = true;
        const origLabel = btnReview.innerHTML;
        btnReview.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-1"></i>Reviewing…';

        const data = await postData('review', {
            code: code,
            language: langSelect.value,
            focus_areas: getFocusAreas(),
            calculate_score: true
        });

        btnReview.disabled = false;
        btnReview.innerHTML = origLabel;

        if (!data) {
            // Network / server error — postData already showed alert
            showScoreUnavailable();
            return;
        }

        console.log('Review response keys:', Object.keys(data));

        if (data.success) {
            const r = data.review || {};
            document.getElementById('review-empty').classList.add('hidden');
            document.getElementById('review-content').classList.remove('hidden');

            // Animated severity counts
            animateCount(document.getElementById('count-critical'), r.counts?.critical || 0);
            animateCount(document.getElementById('count-high'), r.counts?.high || 0);
            animateCount(document.getElementById('count-medium'), r.counts?.medium || 0);
            animateCount(document.getElementById('count-low'), r.counts?.low || 0);

            // Summary
            const summaryEl = document.getElementById('review-summary');
            if (summaryEl) {
                if (Array.isArray(r.summary)) {
                    summaryEl.innerHTML = '<ul class="list-disc list-inside space-y-1">' +
                        r.summary.map(s => `<li>${s}</li>`).join('') + '</ul>';
                } else {
                    summaryEl.textContent = r.summary || 'No summary available.';
                }
            }

            // Badges
            renderBadges(r.badges);

            // XP
            const xpEl = document.getElementById('xp-display');
            if (xpEl) xpEl.textContent = `⚡ XP to gain if fixed: ${r.xp || 0}`;

            // ── Quality Scores: prefer top-level quality_scores, fallback to review.score ──
            const qs = data.quality_scores || r.score || null;
            if (qs) {
                displayQualityScores(qs);
            } else {
                showScoreUnavailable();
            }

            // Detailed sections
            renderSections(r.sections || {});
        } else {
            // API returned error payload
            document.getElementById('review-empty').classList.add('hidden');
            document.getElementById('review-content').classList.remove('hidden');
            showScoreUnavailable();
            const md = document.getElementById('review-markdown');
            if (md) md.innerHTML = `<div class="bg-red-500/10 border border-red-500/30 p-4 rounded-lg text-red-300">${data.message || 'Review failed.'}</div>`;
        }
    });
}

// Rewrite Logic
const btnRewrite = document.getElementById('btn-rewrite');
if (btnRewrite) {
    btnRewrite.addEventListener('click', async () => {
        const code = codeInput.value;
        if (!code.trim()) return alert("Please enter some code first.");

        // Switch to rewrite tab
        showTab('rewrite');

        const data = await postData('rewrite', {
            code: code,
            language: langSelect.value,
            focus_areas: getFocusAreas()
        });

        if (data) {
            document.getElementById('rewrite-empty').classList.add('hidden');
            document.getElementById('rewrite-content').classList.remove('hidden');
            document.getElementById('improvements-panel').classList.remove('hidden');

            // Update Code display
            document.getElementById('original-code-display').textContent = code;

            let cleanCode = data.rewritten_code;
            if (cleanCode.startsWith('```')) {
                const matches = cleanCode.match(/```(?:\w+)?\n([\s\S]*?)```/);
                if (matches && matches[1]) cleanCode = matches[1];
            }

            const rewrittenBlock = document.getElementById('rewritten-code-display');
            rewrittenBlock.textContent = cleanCode;

            // Highlight
            hljs.highlightElement(document.getElementById('original-code-display'));
            hljs.highlightElement(rewrittenBlock);

            // Improvements
            document.getElementById('improvements-list').innerHTML = marked.parse(data.improvements || "");
        }
    });
}

function copyText(elementId) {
    const text = document.getElementById(elementId).innerText;
    navigator.clipboard.writeText(text).then(() => {
        // Could show a toast here
        const btn = event.currentTarget; // This might fail if called from inline onclick. 
        // Need to pass event or handle differently. Use closest button.
        // But for now keeping as is from original code.
        alert('Copied!');
    });
}

// --- AI Chat Logic ---
const chatInput = document.getElementById('chat-input');
const chatHistory = document.getElementById('chat-history');
const typingIndicator = document.getElementById('typing-indicator');
const sendChatBtn = document.getElementById('send-chat');
const clearChatBtn = document.getElementById('clear-chat');

function getLatestReviewSummary() {
    const summaryEl = document.getElementById('review-summary');
    return summaryEl ? summaryEl.textContent : "";
}

function appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = `flex gap-4 ${role === 'user' ? 'flex-row-reverse' : ''}`;

    const avatar = role === 'ai'
        ? `<div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">🤖</div>`
        : `<div class="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center shrink-0"><i class="fas fa-user"></i></div>`;

    const bubbleClass = role === 'ai'
        ? 'bg-slate-800/80 border border-slate-700 rounded-tl-none'
        : 'bg-blue-600 text-white rounded-tr-none';

    // Parse Markdown for AI, text for User
    const content = role === 'ai' ? marked.parse(text) : text.replace(/\n/g, '<br>');

    div.innerHTML = `
        ${avatar}
        <div class="${bubbleClass} p-4 rounded-2xl max-w-[80%] text-sm ${role === 'ai' ? 'text-slate-300 markdown-body' : ''}">
            ${content}
            ${role === 'ai' ? `
            <div class="mt-2 flex justify-end">
                <button class="text-xs text-slate-500 hover:text-white transition-colors" onclick="navigator.clipboard.writeText(this.parentElement.parentElement.innerText).then(() => alert('Copied!'))">
                    <i class="fas fa-copy mr-1"></i>Copy
                </button>
            </div>` : ''}
        </div>
    `;

    chatHistory.appendChild(div);
    if (role === 'ai') {
        div.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    }
    scrollToBottom();
}

function scrollToBottom() {
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function showTyping() {
    typingIndicator.classList.remove('hidden');
    scrollToBottom();
}

function hideTyping() {
    typingIndicator.classList.add('hidden');
}

async function handleSendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    chatInput.value = '';
    appendMessage('user', message);

    // Create a placeholder for the AI message
    const aiMessageDiv = appendMessage('ai', '');
    const aiContentDiv = aiMessageDiv.querySelector('.markdown-body');
    const aiBubble = aiMessageDiv.querySelector('.bg-slate-800\\/80'); // Select the bubble

    // Add typing cursor
    const cursor = document.createElement('span');
    cursor.className = 'inline-block w-2 h-4 bg-slate-400 ml-1 animate-pulse';
    aiContentDiv.appendChild(cursor);

    scrollToBottom();

    const context = {
        message: message,
        language: langSelect.value,
        context_code: codeInput.value,
        review_summary: getLatestReviewSummary()
    };

    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(context)
        });

        if (!response.ok) throw new Error(`Error: ${response.statusText}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            fullText += chunk;

            // Update UI with partial text
            // Helper to render markdown for partial text? 
            // For now, just render the full text so far using marked.parse
            // This might flicker for large texts, but marked is fast.
            // Using requestAnimationFrame for smoother updates if needed.

            aiContentDiv.innerHTML = marked.parse(fullText);
            aiContentDiv.appendChild(cursor); // Keep cursor at end

            // Highlight code blocks dynamically
            aiContentDiv.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });

            scrollToBottom();
        }

        // Cleanup after stream ends
        cursor.remove();

        // Add copy button manually since we rebuilt innerHTML
        const copyBtnDiv = document.createElement('div');
        copyBtnDiv.className = 'mt-2 flex justify-end';
        copyBtnDiv.innerHTML = `
            <button class="text-xs text-slate-500 hover:text-white transition-colors" onclick="navigator.clipboard.writeText(this.parentElement.parentElement.innerText).then(() => alert('Copied!'))">
                <i class="fas fa-copy mr-1"></i>Copy
            </button>`;
        aiBubble.appendChild(copyBtnDiv);

    } catch (error) {
        console.error("Chat Error:", error);
        cursor.remove();
        aiContentDiv.innerHTML += `<br><br><span class="text-red-400">⚠️ Error: ${error.message}</span>`;
    }
}

// if (sendChatBtn) sendChatBtn.addEventListener('click', handleSendMessage);

// if (chatInput) {
//     chatInput.addEventListener('keypress', (e) => {
//         if (e.key === 'Enter') {
//             handleSendMessage();
//         }
//     });
// }
// Chat logic moved to assistant.js

if (clearChatBtn) {
    clearChatBtn.addEventListener('click', () => {
        if (confirm("Clear chat history?")) {
            const welcome = chatHistory.firstElementChild;
            chatHistory.innerHTML = '';
            chatHistory.appendChild(welcome);
        }
    });
}


// --- GitHub Integration ---

async function checkGitHubConnection() {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');

    if (!statusIndicator || !statusText) return;

    try {
        // Note: Using relative path to match API_URL structure or root relative
        const response = await fetch('/api/github/installations');

        if (!response.ok) {
            throw new Error('Failed to fetch installations');
        }

        const data = await response.json();

        if (data.installations && data.installations.length > 0) {
            statusIndicator.className = 'w-3 h-3 bg-green-500 rounded-full animate-pulse';
            statusText.textContent = `✅ Connected to ${data.installations.length} installation(s)`;
            statusText.className = 'text-green-400 font-semibold';

            // Display installations
            displayInstallations(data.installations);
        } else {
            statusIndicator.className = 'w-3 h-3 bg-yellow-500 rounded-full';
            statusText.textContent = '⚠️ Not connected - Install the GitHub App first';
            statusText.className = 'text-yellow-400';
        }

    } catch (error) {
        console.error('Error checking GitHub connection:', error);
        statusIndicator.className = 'w-3 h-3 bg-red-500 rounded-full';
        statusText.textContent = '❌ Error checking connection';
        statusText.className = 'text-red-400';
    }
}

function displayInstallations(installations) {
    const activityDiv = document.getElementById('recentActivity');
    if (!activityDiv) return;

    activityDiv.innerHTML = installations.map(inst => `
        <div class="bg-gray-700 rounded-lg p-4 mb-3 flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                    ${inst.account.toUpperCase().substring(0, 2)}
                </div>
                <div>
                    <div class="text-white font-semibold">${inst.account}</div>
                    <div class="text-sm text-gray-400">Type: ${inst.type}</div>
                </div>
            </div>
            <div class="text-sm text-green-400">
                ✓ Active
            </div>
        </div>
    `).join('');
}

// Check connection on load if we are on the page
document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('githubTab')) {
        checkGitHubConnection();
    }
});

// --- Bumble Launch Logic ---
async function launchBumble() {
    const btn = document.getElementById('btn-bumble');
    const originalContent = btn.innerHTML;

    // Loading state
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Launching...`;

    try {
        const response = await fetch(`${API_URL}/bumble/launch`, {
            method: 'POST'
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.detail || 'Failed to launch');

        // Success state
        btn.innerHTML = `<i class="fas fa-check"></i> Launched!`;
        btn.classList.remove('from-pink-500', 'to-purple-600');
        btn.classList.add('bg-green-500');

        // Reset after 2 seconds
        setTimeout(() => {
            btn.innerHTML = originalContent;
            btn.disabled = false;
            btn.classList.remove('bg-green-500');
            btn.classList.add('from-pink-500', 'to-purple-600');
        }, 2000);

    } catch (error) {
        console.error('Bumble Launch Error:', error);

        // Error state
        btn.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Error`;
        btn.classList.remove('from-pink-500', 'to-purple-600');
        btn.classList.add('bg-red-500');

        alert(`Failed to launch Bumble:\n${error.message}`);

        // Reset
        setTimeout(() => {
            btn.innerHTML = originalContent;
            btn.disabled = false;
            btn.classList.remove('bg-red-500');
            btn.classList.add('from-pink-500', 'to-purple-600');
        }, 3000);
    }
}
