// ---------------------------------------------------------------------------
// Feature Verdict Engine — frontend logic
// Talks only to our own backend (/api/audit). No API key ever touches the browser.
// ---------------------------------------------------------------------------

const form = document.getElementById("verdictForm");
const output = document.getElementById("output");
const submitBtn = document.getElementById("submitBtn");

form.addEventListener("submit", (e) => {
  e.preventDefault();
  runAudit();
});

function getFormValues() {
  return {
    appName: document.getElementById("appName").value.trim(),
    featureIdea: document.getElementById("featureIdea").value.trim(),
    metric: document.getElementById("metric").value.trim(),
  };
}

async function runAudit() {
  const { appName, featureIdea, metric } = getFormValues();

  if (!appName || !featureIdea) {
    renderError("App name and feature idea are both required.");
    return;
  }

  renderLoading();
  submitBtn.disabled = true;
  submitBtn.textContent = "Running audit…";

  try {
    const response = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appName, featureIdea, metric }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Something went wrong running the audit.");
    }

    renderReport(data);
  } catch (err) {
    console.error(err);
    renderError(err.message || "Something went wrong. Try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Run audit";
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderLoading() {
  output.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Running audit…</p>
    </div>
  `;
}

function renderError(message) {
  output.innerHTML = `
    <div class="error-state">
      <p>${escapeHtml(message)}</p>
      <button class="retry-btn" id="retryBtn">Try again</button>
    </div>
  `;
  document.getElementById("retryBtn").addEventListener("click", runAudit);
}

function renderReport(data) {
  const verdict = data.verdict || "proceed_with_caution";
  const verdictLabels = {
    ship_it: "✓ Ship it",
    proceed_with_caution: "△ Proceed with caution",
    reject: "✕ Reject",
  };

  const scoreLabels = {
    feasibility: "Feasibility",
    adoption_prediction: "Adoption prediction",
    novelty: "Novelty",
    necessity: "Necessity",
    competitive_edge: "Competitive edge",
  };

  const statusLabels = {
    has_it: "Has it",
    partial: "Partial",
    does_not_have_it: "Doesn't have it",
  };

  const scoresHtml = Object.entries(data.scores || {})
    .map(([key, val]) => {
      const label = scoreLabels[key] || key;
      const score = Number(val?.score) || 0;
      const pct = Math.max(0, Math.min(10, score)) * 10;
      return `
        <div class="score-row">
          <div class="score-row-top">
            <span class="score-label">${escapeHtml(label)}</span>
            <span class="score-value">${score}/10</span>
          </div>
          <div class="gauge-track">
            <div class="gauge-fill" style="width:${pct}%"></div>
          </div>
          <p class="score-reasoning">${escapeHtml(val?.reasoning || "")}</p>
        </div>
      `;
    })
    .join("");

  const competitiveRows = (data.competitive_landscape || [])
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.competitor || "—")}</td>
          <td><span class="status-pill ${row.status || ""}">${
        statusLabels[row.status] || row.status || "—"
      }</span></td>
          <td>${escapeHtml(row.note || "")}</td>
        </tr>
      `
    )
    .join("");

  const guardrails = (data.metric_critique?.recommended_guardrail_metrics || [])
    .map((m) => `<li>${escapeHtml(m)}</li>`)
    .join("");

  const risks = (data.risks || [])
    .map((r) => `<li>${escapeHtml(r)}</li>`)
    .join("");

  const overlap = data.existing_overlap || {};
  const nextStep = data.next_step || {};
  const metricCritique = data.metric_critique || {};

  const nextStepLabels = {
    ship_as_is: "Ship as-is",
    run_experiment: "Run an experiment",
    narrow_scope: "Narrow the scope",
    do_not_build: "Do not build",
  };

  output.innerHTML = `
    <div class="report">

      <div class="verdict-banner ${verdict}">
        <span class="verdict-badge">${verdictLabels[verdict] || verdict}</span>
        <p class="verdict-rationale">${escapeHtml(data.verdict_rationale || "")}</p>
      </div>

      <div class="panel">
        <div class="section-title">Existing overlap</div>
        <div class="overlap-box">
          <span class="overlap-flag ${overlap.already_exists ? "yes" : "no"}">
            ${overlap.already_exists ? "Already exists" : "Not found"}
          </span>
          <p>${escapeHtml(overlap.explanation || "")}</p>
        </div>
      </div>

      <div class="panel">
        <div class="section-title">Score dashboard</div>
        ${scoresHtml}
      </div>

      <div class="panel">
        <div class="section-title">Competitive landscape</div>
        <table class="comp-table">
          <thead>
            <tr><th>Competitor</th><th>Status</th><th>Note</th></tr>
          </thead>
          <tbody>${competitiveRows}</tbody>
        </table>
      </div>

      <div class="panel metric-block">
        <div class="section-title">Metric critique</div>
        ${
          metricCritique.user_proposed_metric
            ? `<p><span class="metric-label">Your proposed metric</span>${escapeHtml(metricCritique.user_proposed_metric)}</p>`
            : `<p><span class="metric-label">Your proposed metric</span>None provided</p>`
        }
        <p><span class="metric-label">Critique</span>${escapeHtml(metricCritique.critique || "")}</p>
        <p><span class="metric-label">Recommended primary metric</span>${escapeHtml(metricCritique.recommended_primary_metric || "")}</p>
        <span class="metric-label">Guardrail metrics</span>
        <ul class="guardrails">${guardrails}</ul>
      </div>

      <div class="panel">
        <div class="section-title">Risks</div>
        <ul class="risk-list">${risks}</ul>
      </div>

      <div class="panel next-step-panel">
        <div class="section-title">Next step</div>
        <span class="next-step-rec">${nextStepLabels[nextStep.recommendation] || nextStep.recommendation || ""}</span>
        <p class="next-step-detail">${escapeHtml(nextStep.detail || "")}</p>
      </div>

    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}