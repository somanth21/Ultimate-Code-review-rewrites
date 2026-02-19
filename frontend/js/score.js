/* ── Code Score Feature ─────────────────────────────────── */
(function () {

    // Grade helper
    function getGrade(score) {
        if (score >= 90) return { label: "A", color: "#10B981" };
        if (score >= 80) return { label: "B", color: "#3B82F6" };
        if (score >= 70) return { label: "C", color: "#F59E0B" };
        if (score >= 60) return { label: "D", color: "#F97316" };
        return { label: "F", color: "#EF4444" };
    }

    // Animate number
    function animateNumber(el, end, duration) {
        duration = duration || 1000;
        if (!el) return;
        var start = 0;
        var startTime = performance.now();
        function step(now) {
            var elapsed = now - startTime;
            var progress = Math.min(elapsed / duration, 1);
            var ease = 1 - Math.pow(1 - progress, 4);
            el.textContent = Math.floor(start + (end - start) * ease);
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    // Main score handler
    async function runCodeScore() {
        // Get code and language from existing input fields
        var codeEl = document.getElementById('code-input');
        var langEl = document.getElementById('language-select');

        if (!codeEl || !codeEl.value.trim()) {
            alert("Please enter some code first.");
            return;
        }

        var code = codeEl.value;
        var language = langEl ? langEl.value : "python";

        // Show loading state
        var btn = document.getElementById('btn-score');
        var originalText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML =
                '<svg class="animate-spin w-5 h-5 inline mr-2" viewBox="0 0 24 24">' +
                '<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>' +
                '<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>' +
                '</svg>Analyzing...';
        }

        // Switch to score tab
        if (typeof showTab === 'function') showTab('score');

        try {
            var response = await fetch('http://127.0.0.1:8000/api/score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code, language: language })
            });

            if (!response.ok) {
                var err = {};
                try { err = await response.json(); } catch (e) { }
                throw new Error(err.detail || 'Error ' + response.status);
            }

            var data = await response.json();
            console.log("✅ /api/score response:", data);

            // Show content, hide empty state
            var emptyEl = document.getElementById('score-empty');
            var contentEl = document.getElementById('score-content');
            if (emptyEl) emptyEl.classList.add('hidden');
            if (contentEl) contentEl.classList.remove('hidden');

            // ── Overall score ring ─────────────────────────────
            var circle = document.getElementById('score-ring-circle');
            if (circle) {
                var radius = 70;
                var circumference = 2 * Math.PI * radius; // ≈ 439.82
                var offset = circumference - (data.overall_score / 100) * circumference;
                var grade = getGrade(data.overall_score);
                circle.style.stroke = grade.color;
                circle.style.strokeDashoffset = String(offset);
            }

            // ── Animate number ─────────────────────────────────
            animateNumber(document.getElementById('score-value'), data.overall_score);

            // ── Grade badge ────────────────────────────────────
            var gradeEl = document.getElementById('score-grade');
            if (gradeEl) {
                var g = getGrade(data.overall_score);
                gradeEl.textContent = g.label;
                gradeEl.style.color = g.color;
                gradeEl.style.borderColor = g.color;
            }

            // ── Progress bars ──────────────────────────────────
            function setBar(barId, valId, score) {
                var bar = document.getElementById(barId);
                var val = document.getElementById(valId);
                if (bar) bar.style.width = Math.max(0, Math.min(100, score)) + '%';
                if (val) val.textContent = Math.round(score);
            }

            setBar('perf-bar', 'perf-score-val', data.performance_score);
            setBar('sec-bar', 'sec-score-val', data.security_score);
            setBar('read-bar', 'read-score-val', data.readability_score);
            setBar('maint-bar', 'maint-score-val', data.maintainability_score);

            // ── Text fields ────────────────────────────────────
            var reasoning = document.getElementById('score-reasoning');
            if (reasoning) reasoning.textContent = data.reasoning_summary || "No summary available.";

            var timeC = document.getElementById('time-complexity');
            if (timeC) timeC.textContent = data.time_complexity || "O(?)";

            var spaceC = document.getElementById('space-complexity');
            if (spaceC) spaceC.textContent = data.space_complexity || "O(?)";

        } catch (err) {
            console.error("Score error:", err);
            var emptyEl2 = document.getElementById('score-empty');
            var contentEl2 = document.getElementById('score-content');
            if (emptyEl2) emptyEl2.classList.remove('hidden');
            if (contentEl2) contentEl2.classList.add('hidden');
            alert('Failed to get code score:\n' + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    }

    // Wire the button — no DOMContentLoaded needed since script is at bottom
    var btn = document.getElementById('btn-score');
    if (btn) {
        btn.addEventListener('click', runCodeScore);
    } else {
        console.warn("⚠️ #btn-score not found in DOM");
    }

})();
