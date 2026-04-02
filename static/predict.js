(function () {
    const METADATA = {
        ph: { label: "pH", unit: "", min: 0, max: 14, safe: [6.5, 8.5], moderate: [6, 9], train: [0, 14], default: 7.2 },
        hardness: { label: "Hardness", unit: " mg/L", min: 0, max: 1500, safe: [60, 180], moderate: [40, 300], train: [47.432, 323.124], default: 160 },
        solids: { label: "TDS", unit: " ppm", min: 0, max: 100000, safe: [150, 500], moderate: [500, 1000], train: [320.942611, 61227.196008], default: 500 },
        chloramines: { label: "Chloramines", unit: " ppm", min: 0, max: 50, safe: [0, 4], moderate: [4, 8], train: [0.352, 13.127], default: 4.2 },
        sulfate: { label: "Sulfate", unit: " mg/L", min: 0, max: 2000, safe: [120, 250], moderate: [80, 400], train: [129.0, 481.03], default: 200 },
        conductivity: { label: "Conductivity", unit: " uS/cm", min: 0, max: 5000, safe: [200, 500], moderate: [150, 800], train: [181.483754, 753.34262], default: 420 },
        organic_carbon: { label: "Organic Carbon", unit: " ppm", min: 0, max: 100, safe: [2.2, 10], moderate: [10, 17], train: [2.2, 28.3], default: 8 },
        trihalomethanes: { label: "Trihalomethanes", unit: " ug/L", min: 0, max: 1000, safe: [0.738, 80], moderate: [80, 100], train: [0.738, 124], default: 75 },
        turbidity: { label: "Turbidity", unit: " NTU", min: 0, max: 1000, safe: [1.45, 2], moderate: [2, 5], train: [1.45, 6.739], default: 3.1 }
    };

    const form = document.getElementById("predict-form");
    const liveSimulation = document.getElementById("liveSimulation");
    const analyzeBtn = document.getElementById("analyzeBtn");
    const resetBtn = document.getElementById("resetBtn");

    const analyzingBadge = document.getElementById("analyzingBadge");
    const waterFill = document.getElementById("waterFill");
    const waterRipple = document.getElementById("waterRipple");
    const waterParticles = document.getElementById("waterParticles");
    const waterBubbles = document.getElementById("waterBubbles");
    const scoreValue = document.getElementById("scoreValue");
    const scoreLabel = document.getElementById("scoreLabel");
    const impactList = document.getElementById("impactList");
    const insightText = document.getElementById("insightText");
    const warningBox = document.getElementById("warningBox");
    const warningText = document.getElementById("warningText");

    const inputs = {};
    let pendingAnalyze = null;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function statusFromValue(value, meta) {
        if (value >= meta.safe[0] && value <= meta.safe[1]) return "good";
        if (value >= meta.moderate[0] && value <= meta.moderate[1]) return "warning";
        return "bad";
    }

    function severityFromValue(value, meta) {
        if (value >= meta.safe[0] && value <= meta.safe[1]) return 0.1;
        if (value >= meta.moderate[0] && value <= meta.moderate[1]) return 0.45;

        const lowGap = value < meta.moderate[0] ? (meta.moderate[0] - value) / Math.max(1, meta.moderate[0]) : 0;
        const highGap = value > meta.moderate[1] ? (value - meta.moderate[1]) / Math.max(1, meta.moderate[1]) : 0;
        return clamp(0.7 + (lowGap + highGap) * 0.9, 0.7, 1);
    }

    function createWaterElements() {
        for (let i = 0; i < 22; i += 1) {
            const particle = document.createElement("span");
            particle.className = "particle";
            particle.style.left = `${6 + Math.random() * 86}%`;
            particle.style.bottom = `${8 + Math.random() * 84}%`;
            particle.style.animationDelay = `${(Math.random() * 2.4).toFixed(2)}s`;
            particle.style.animationDuration = `${(2.4 + Math.random() * 2.8).toFixed(2)}s`;
            waterParticles.appendChild(particle);
        }

        for (let i = 0; i < 18; i += 1) {
            const bubble = document.createElement("span");
            bubble.className = "bubble";
            bubble.style.left = `${8 + Math.random() * 84}%`;
            bubble.style.bottom = `${4 + Math.random() * 16}%`;
            bubble.style.animationDelay = `${(Math.random() * 2.3).toFixed(2)}s`;
            bubble.style.animationDuration = `${(2.2 + Math.random() * 2.6).toFixed(2)}s`;
            waterBubbles.appendChild(bubble);
        }
    }

    function setAnalyzing(active) {
        if (!analyzingBadge) return;
        analyzingBadge.classList.toggle("active", active);
    }

    function animateScore(target) {
        const start = Number(scoreValue.textContent) || 0;
        const duration = 550;
        const t0 = performance.now();

        function frame(t) {
            const p = clamp((t - t0) / duration, 0, 1);
            const next = start + (target - start) * p;
            scoreValue.textContent = next.toFixed(1);
            if (p < 1) window.requestAnimationFrame(frame);
        }

        window.requestAnimationFrame(frame);
    }

    function renderImpactRows(values) {
        if (!impactList) return;
        impactList.innerHTML = "";

        const rows = Object.keys(METADATA).map((key) => {
            const meta = METADATA[key];
            const value = Number(values[key]);
            const status = statusFromValue(value, meta);
            const severity = severityFromValue(value, meta);
            return { key, meta, value, status, severity };
        });

        const topProblems = rows
            .filter((item) => item.status !== "good")
            .sort((a, b) => b.severity - a.severity)
            .slice(0, 2)
            .map((item) => item.key);

        rows.forEach((item, idx) => {
            const row = document.createElement("div");
            row.className = `impact-row${topProblems.includes(item.key) ? " critical" : ""}`;
            row.innerHTML = `
                <div class="impact-head">
                    <span>${item.meta.label}</span>
                    <span>${item.value.toFixed(2)}${item.meta.unit} | ${item.status === "good" ? "Good" : item.status === "warning" ? "Warning" : "Bad"}</span>
                </div>
                <div class="impact-bar"><div class="impact-fill ${item.status}" data-width="${Math.round(item.severity * 100)}"></div></div>
            `;
            impactList.appendChild(row);

            const fill = row.querySelector(".impact-fill");
            if (fill) {
                setTimeout(() => {
                    fill.style.width = `${fill.dataset.width}%`;
                }, 20 * idx + 80);
            }
        });

        return rows;
    }

    function renderWarning(values) {
        const outFields = Object.keys(METADATA).filter((key) => {
            const value = Number(values[key]);
            const [min, max] = METADATA[key].train;
            return value < min || value > max;
        });

        if (outFields.length === 0) {
            warningBox.hidden = true;
            return outFields;
        }

        warningBox.hidden = false;
        warningText.textContent = `Reliability warning: value outside training range for ${outFields.map((key) => METADATA[key].label).join(", ")}.`;
        warningBox.classList.remove("shake");
        window.requestAnimationFrame(() => warningBox.classList.add("shake"));
        return outFields;
    }

    function renderInsight(rows, label) {
        const bad = rows.filter((r) => r.status === "bad").sort((a, b) => b.severity - a.severity);
        const warn = rows.filter((r) => r.status === "warning").sort((a, b) => b.severity - a.severity);

        if (bad.length >= 2) {
            insightText.textContent = `Water is ${label.toLowerCase()} mainly due to ${bad[0].meta.label.toLowerCase()} and ${bad[1].meta.label.toLowerCase()}.`;
            return;
        }

        if (bad.length === 1) {
            insightText.textContent = `Primary risk detected in ${bad[0].meta.label.toLowerCase()}. Further treatment and retesting are advised.`;
            return;
        }

        if (warn.length >= 1) {
            const names = warn.slice(0, 2).map((w) => w.meta.label.toLowerCase()).join(" and ");
            insightText.textContent = `Water profile is mostly stable. Monitor ${names} to keep quality in the safe zone.`;
            return;
        }

        insightText.textContent = "All key parameters are within healthy bands. Sample appears balanced for drinking use.";
    }

    function renderWater(score, label) {
        const level = clamp(32 + score * 5.5, 30, 86);
        waterFill.style.setProperty("--level", `${level}%`);
        waterFill.classList.remove("safe", "risky", "unsafe");
        waterFill.classList.add(label.toLowerCase());

        const particleOpacity = label === "Safe" ? 0.35 : label === "Risky" ? 0.65 : 0.9;
        waterParticles.style.opacity = String(particleOpacity);

        const bubbleOpacity = label === "Safe" ? 0.65 : label === "Risky" ? 0.45 : 0.3;
        waterBubbles.style.opacity = String(bubbleOpacity);
    }

    function collectValues() {
        const values = {};

        Object.keys(METADATA).forEach((key) => {
            const entry = inputs[key];
            const value = Number(entry.number.value);
            values[key] = Number.isFinite(value) ? value : METADATA[key].default;
        });
        return values;
    }

    function scoreSnapshot(values) {
        const rows = Object.keys(METADATA).map((key) => {
            const meta = METADATA[key];
            const value = Number(values[key]);
            const status = statusFromValue(value, meta);
            const severity = severityFromValue(value, meta);
            return { key, meta, value, status, severity };
        });

        const avgSeverity = rows.reduce((sum, row) => sum + row.severity, 0) / rows.length;
        const score = clamp(10 - avgSeverity * 10, 0, 10);
        const label = score >= 7 ? "Safe" : score >= 4 ? "Risky" : "Unsafe";
        return { rows, score, label };
    }

    function renderPreviewOnly() {
        const values = collectValues();
        const snapshot = scoreSnapshot(values);
        renderWater(snapshot.score, snapshot.label);
        renderWarning(values);
    }

    function computeFromInputs() {
        const values = collectValues();

        const snapshot = scoreSnapshot(values);
        const rows = renderImpactRows(values) || snapshot.rows;
        const score = snapshot.score;
        const label = snapshot.label;

        animateScore(score);
        scoreLabel.textContent = label;
        scoreLabel.classList.remove("safe", "risky", "unsafe");
        scoreLabel.classList.add(label.toLowerCase());

        renderWater(score, label);
        renderInsight(rows, label);
        renderWarning(values);
    }

    function syncRangeStyle(slider, key) {
        const meta = METADATA[key];
        const pct = ((Number(slider.value) - meta.min) / (meta.max - meta.min)) * 100;
        const safeStart = ((meta.safe[0] - meta.min) / (meta.max - meta.min)) * 100;
        const safeEnd = ((meta.safe[1] - meta.min) / (meta.max - meta.min)) * 100;
        const modStart = ((meta.moderate[0] - meta.min) / (meta.max - meta.min)) * 100;
        const modEnd = ((meta.moderate[1] - meta.min) / (meta.max - meta.min)) * 100;

        slider.style.setProperty("--safe-start", `${safeStart.toFixed(2)}%`);
        slider.style.setProperty("--safe-end", `${safeEnd.toFixed(2)}%`);
        slider.style.setProperty("--mod-start", `${modStart.toFixed(2)}%`);
        slider.style.setProperty("--mod-end", `${modEnd.toFixed(2)}%`);
        slider.style.setProperty("--pct", `${pct.toFixed(2)}%`);
    }

    function updateControlStatus(key) {
        const entry = inputs[key];
        const value = Number(entry.number.value);
        const status = statusFromValue(value, METADATA[key]);
        entry.chip.textContent = status === "good" ? "Good" : status === "warning" ? "Warning" : "Bad";
        entry.chip.classList.remove("good", "warning", "bad");
        entry.chip.classList.add(status);
    }

    function schedulePreview(live) {
        if (pendingAnalyze) {
            clearTimeout(pendingAnalyze);
            pendingAnalyze = null;
        }

        setAnalyzing(true);
        pendingAnalyze = setTimeout(() => {
            setAnalyzing(false);
            if (live) {
                computeFromInputs();
                return;
            }
            renderPreviewOnly();
        }, 340);
    }

    function triggerRipple() {
        waterRipple.classList.remove("active");
        window.requestAnimationFrame(() => {
            waterRipple.classList.add("active");
        });
    }

    Object.keys(METADATA).forEach((key) => {
        const meta = METADATA[key];
        const slider = document.getElementById(`${key}_slider`);
        const number = document.getElementById(key);
        const chip = document.querySelector(`[data-param='${key}'] .status-chip`);

        if (!slider || !number || !chip) return;

        const initial = number.value === "" ? meta.default : Number(number.value);
        const safeInitial = Number.isFinite(initial) ? clamp(initial, meta.min, meta.max) : meta.default;
        slider.value = String(safeInitial);
        number.value = String(Number(safeInitial.toFixed(3)));
        syncRangeStyle(slider, key);
        inputs[key] = { slider, number, chip };
        updateControlStatus(key);

        slider.addEventListener("input", () => {
            number.value = String(Number(slider.value).toFixed(3));
            syncRangeStyle(slider, key);
            updateControlStatus(key);
            schedulePreview(liveSimulation.checked);
        });

        number.addEventListener("input", () => {
            const rawText = number.value.trim();
            if (rawText === "" || rawText === "-" || rawText === "." || rawText === "-.") {
                return;
            }

            const raw = Number(rawText);
            if (!Number.isFinite(raw)) return;

            const clamped = clamp(raw, meta.min, meta.max);
            slider.value = String(clamped);
            syncRangeStyle(slider, key);
            updateControlStatus(key);
            schedulePreview(liveSimulation.checked);
        });

        number.addEventListener("change", () => {
            const rawText = number.value.trim();
            const fallback = Number(slider.value);
            const parsed = Number(rawText);
            const base = Number.isFinite(parsed) ? parsed : fallback;
            const clamped = clamp(base, meta.min, meta.max);
            number.value = String(Number(clamped.toFixed(3)));
            slider.value = String(clamped);
            syncRangeStyle(slider, key);
            updateControlStatus(key);
            schedulePreview(liveSimulation.checked);
        });
    });

    liveSimulation.addEventListener("change", () => {
        if (liveSimulation.checked) {
            analyzeBtn.textContent = "Analyze Water (Optional)";
            computeFromInputs();
        } else {
            analyzeBtn.textContent = "Analyze Water";
        }
    });

    resetBtn.addEventListener("click", () => {
        Object.keys(METADATA).forEach((key) => {
            const meta = METADATA[key];
            inputs[key].slider.value = String(meta.default);
            inputs[key].number.value = String(meta.default);
            syncRangeStyle(inputs[key].slider, key);
            updateControlStatus(key);
        });
        computeFromInputs();
    });

    form.addEventListener("submit", (event) => {
        triggerRipple();
        setAnalyzing(true);
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = "Analyzing...";

        setTimeout(() => {
            form.submit();
        }, 420);

        event.preventDefault();
    });

    createWaterElements();
    computeFromInputs();

    const payload = window.serverPredictionPayload || {};
    if (typeof payload.safeProbability === "number" && Number.isFinite(payload.safeProbability)) {
        const score = clamp(payload.safeProbability * 10, 0, 10);
        const label = payload.safeProbability >= 0.72 ? "Safe" : payload.safeProbability >= 0.45 ? "Risky" : "Unsafe";
        animateScore(score);
        scoreLabel.textContent = label;
        scoreLabel.classList.remove("safe", "risky", "unsafe");
        scoreLabel.classList.add(label.toLowerCase());
        renderWater(score, label);
        computeFromInputs();
        setAnalyzing(false);
    }
})();
