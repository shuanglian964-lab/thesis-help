const state = {
  uploadedFile: null,
  analysis: null,
  currentQuestionIndex: 0,
  evaluations: [],
  currentAnswer: "",
};

const elements = {
  views: {
    upload: document.getElementById("upload-view"),
    prepare: document.getElementById("prepare-view"),
    defense: document.getElementById("defense-view"),
    results: document.getElementById("results-view"),
  },
  steps: [...document.querySelectorAll(".step")],
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("file-input"),
  fileMeta: document.getElementById("file-meta"),
  analyzeBtn: document.getElementById("analyze-btn"),
  uploadStatus: document.getElementById("upload-status"),
  questionList: document.getElementById("question-list"),
  summaryPill: document.getElementById("summary-pill"),
  scriptBox: document.getElementById("script-box"),
  copyScriptBtn: document.getElementById("copy-script-btn"),
  downloadScriptBtn: document.getElementById("download-script-btn"),
  startDefenseBtn: document.getElementById("start-defense-btn"),
  questionCounter: document.getElementById("question-counter"),
  progressBar: document.getElementById("progress-bar"),
  currentQuestion: document.getElementById("current-question"),
  speakBtn: document.getElementById("speak-btn"),
  recordBtn: document.getElementById("record-btn"),
  submitAnswerBtn: document.getElementById("submit-answer-btn"),
  recordingIndicator: document.getElementById("recording-indicator"),
  waveform: document.getElementById("waveform"),
  answerBox: document.getElementById("answer-box"),
  speechStatus: document.getElementById("speech-status"),
  evaluationEmpty: document.getElementById("evaluation-empty"),
  evaluationBox: document.getElementById("evaluation-box"),
  scoreValue: document.getElementById("score-value"),
  strengthsList: document.getElementById("strengths-list"),
  improvementsList: document.getElementById("improvements-list"),
  overallFeedback: document.getElementById("overall-feedback"),
  nextQuestionBtn: document.getElementById("next-question-btn"),
  overallScore: document.getElementById("overall-score"),
  finalFeedback: document.getElementById("final-feedback"),
  scoreChart: document.getElementById("score-chart"),
  resultsList: document.getElementById("results-list"),
  restartBtn: document.getElementById("restart-btn"),
  toast: document.getElementById("toast"),
};

function setView(viewKey) {
  Object.entries(elements.views).forEach(([key, node]) => {
    node.classList.toggle("active", key === viewKey);
  });

  elements.steps.forEach((step) => {
    step.classList.toggle("active", step.dataset.step === viewKey);
  });
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.classList.add("hidden");
  }, 2800);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function renderFileMeta(file) {
  elements.fileMeta.classList.remove("hidden");
  elements.fileMeta.innerHTML = `
    <strong>${file.name}</strong><br />
    <span>Size: ${formatBytes(file.size)}</span>
  `;
}

function renderQuestions() {
  const questions = state.analysis.questions || [];
  elements.questionList.innerHTML = questions
    .map(
      (item, index) => `
        <div class="accordion-item">
          <button class="accordion-header" data-accordion="${index}">
            <span>${item.id}. ${item.question}</span>
            <span class="difficulty">${item.difficulty}</span>
          </button>
          <div class="accordion-body hidden" id="accordion-body-${index}">
            <p><strong>Reference answer:</strong> ${item.reference_answer}</p>
          </div>
        </div>
      `
    )
    .join("");

  [...document.querySelectorAll("[data-accordion]")].forEach((button) => {
    button.addEventListener("click", () => {
      const body = document.getElementById(`accordion-body-${button.dataset.accordion}`);
      body.classList.toggle("hidden");
    });
  });
}

function renderPrepareView() {
  renderQuestions();
  elements.scriptBox.textContent = state.analysis.script;
  elements.summaryPill.textContent = `${state.analysis.questions.length} questions ready`;
}

function getCurrentQuestion() {
  return state.analysis.questions[state.currentQuestionIndex];
}

function updateDefenseView() {
  const total = state.analysis.questions.length;
  const current = getCurrentQuestion();
  elements.questionCounter.textContent = `Question ${state.currentQuestionIndex + 1} of ${total}`;
  elements.currentQuestion.textContent = current.question;
  elements.progressBar.style.width = `${((state.currentQuestionIndex + 1) / total) * 100}%`;
  elements.answerBox.value = "";
  elements.speechStatus.textContent = "";
  state.currentAnswer = "";
  elements.submitAnswerBtn.disabled = true;
  elements.evaluationEmpty.classList.remove("hidden");
  elements.evaluationBox.classList.add("hidden");
}

function setRecordingUI(active, label = "Idle") {
  elements.recordingIndicator.classList.toggle("active", active);
  elements.recordingIndicator.querySelector("span:last-child").textContent = label;
  elements.waveform.classList.toggle("active", active);
}

function populateEvaluation(result) {
  elements.evaluationEmpty.classList.add("hidden");
  elements.evaluationBox.classList.remove("hidden");
  elements.scoreValue.textContent = Number(result.score).toFixed(1);
  elements.strengthsList.innerHTML = result.strengths.map((item) => `<li>${item}</li>`).join("");
  elements.improvementsList.innerHTML = result.improvements.map((item) => `<li>${item}</li>`).join("");
  elements.overallFeedback.textContent = result.overall_feedback;
}

function renderResults() {
  const scores = state.evaluations.map((item) => Number(item.score));
  const overall = scores.reduce((sum, item) => sum + item, 0) / scores.length;
  elements.overallScore.textContent = Number.isFinite(overall) ? overall.toFixed(1) : "0.0";
  elements.finalFeedback.textContent =
    overall >= 8
      ? "Strong overall defense performance. Your answers were mostly clear, relevant, and academically persuasive."
      : overall >= 6
        ? "Solid performance with room to improve precision, confidence, and supporting detail."
        : "You have a workable foundation, but your answers need stronger structure, detail, and fluency.";

  elements.scoreChart.innerHTML = state.evaluations
    .map((item, index) => {
      const height = Math.max(16, Number(item.score) * 18);
      return `
        <div class="bar-wrap">
          <div class="bar" style="height:${height}px"></div>
          <span class="bar-label">Q${index + 1}</span>
          <span class="bar-value">${Number(item.score).toFixed(1)}</span>
        </div>
      `;
    })
    .join("");

  elements.resultsList.innerHTML = state.evaluations
    .map(
      (item, index) => `
        <div>
          <strong>Question ${index + 1}:</strong> ${item.question}<br />
          <span>Score: ${Number(item.score).toFixed(1)} / 10</span>
        </div>
      `
    )
    .join("<br />");
}

async function handleFileSelection(file) {
  if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
    showToast("Please upload a PDF file.");
    return;
  }

  state.uploadedFile = file;
  renderFileMeta(file);
  elements.analyzeBtn.disabled = false;
  elements.uploadStatus.textContent = "PDF selected and ready for analysis.";
}

async function runUploadAndAnalyze() {
  if (!state.uploadedFile) return;

  try {
    elements.analyzeBtn.disabled = true;
    elements.uploadStatus.textContent = "Uploading thesis and generating defense materials...";

    const uploadResult = await uploadPdf(state.uploadedFile);
    const analysisResult = await analyzeThesis({
      file_id: uploadResult.file_id,
      filename: uploadResult.filename,
    });

    state.analysis = analysisResult;
    state.currentQuestionIndex = 0;
    state.evaluations = [];

    renderPrepareView();
    setView("prepare");
    elements.uploadStatus.textContent = "Analysis complete.";
    showToast("Questions and script are ready.");
  } catch (error) {
    elements.uploadStatus.textContent = error.message;
    showToast(error.message);
  } finally {
    elements.analyzeBtn.disabled = false;
  }
}

async function submitCurrentAnswer() {
  const question = getCurrentQuestion();
  const answer = elements.answerBox.value.trim();

  if (!answer) {
    showToast("Please provide an answer before submitting.");
    return;
  }

  try {
    elements.submitAnswerBtn.disabled = true;
    elements.speechStatus.textContent = "Evaluating your answer...";

    const evaluation = await evaluateAnswer({
      question: question.question,
      answer,
      reference_answer: question.reference_answer,
    });

    const entry = {
      question: question.question,
      score: evaluation.score,
      details: evaluation,
    };

    state.evaluations[state.currentQuestionIndex] = entry;
    populateEvaluation(evaluation);
    elements.speechStatus.textContent = "Evaluation complete.";

    try {
      window.voiceController.speak(`Your score is ${Number(evaluation.score).toFixed(1)} out of 10. ${evaluation.overall_feedback}`);
    } catch (error) {
      // TTS failure should not break the page.
    }
  } catch (error) {
    elements.speechStatus.textContent = error.message;
    showToast(error.message);
  } finally {
    elements.submitAnswerBtn.disabled = false;
  }
}

function exportScript() {
  const blob = new Blob([state.analysis.script], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "ppt-script-outline.txt";
  anchor.click();
  URL.revokeObjectURL(url);
}

function restartApp() {
  state.uploadedFile = null;
  state.analysis = null;
  state.currentQuestionIndex = 0;
  state.evaluations = [];
  state.currentAnswer = "";

  elements.fileInput.value = "";
  elements.fileMeta.classList.add("hidden");
  elements.fileMeta.innerHTML = "";
  elements.uploadStatus.textContent = "";
  elements.answerBox.value = "";
  setView("upload");
}

elements.dropzone.addEventListener("click", () => elements.fileInput.click());
elements.dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    elements.fileInput.click();
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  elements.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropzone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  elements.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropzone.classList.remove("dragover");
  });
});

elements.dropzone.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files[0];
  handleFileSelection(file);
});

elements.fileInput.addEventListener("change", (event) => {
  handleFileSelection(event.target.files[0]);
});

elements.analyzeBtn.addEventListener("click", runUploadAndAnalyze);

elements.copyScriptBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.analysis.script);
    showToast("Script copied.");
  } catch (error) {
    showToast("Copy failed.");
  }
});

elements.downloadScriptBtn.addEventListener("click", exportScript);

elements.startDefenseBtn.addEventListener("click", () => {
  updateDefenseView();
  setView("defense");
});

elements.speakBtn.addEventListener("click", () => {
  try {
    window.voiceController.speak(getCurrentQuestion().question);
  } catch (error) {
    showToast(error.message);
  }
});

function beginRecording() {
  if (!window.voiceController.isSupported) {
    showToast("Speech recognition is not supported in this browser.");
    return;
  }

  setRecordingUI(true, "Recording...");
  elements.speechStatus.textContent = "Listening for your answer...";

  window.voiceController.startRecording({
    onInterim: (transcript) => {
      elements.answerBox.value = transcript;
      state.currentAnswer = transcript;
    },
    onFinal: (transcript) => {
      elements.answerBox.value = transcript;
      state.currentAnswer = transcript;
      elements.submitAnswerBtn.disabled = !transcript.trim();
      elements.speechStatus.textContent = "Recording complete. Review your answer, then submit.";
      setRecordingUI(false, "Recorded");
    },
    onError: (message) => {
      elements.speechStatus.textContent = message;
      setRecordingUI(false, "Idle");
      showToast(message);
    },
  });
}

function endRecording() {
  window.voiceController.stopRecording();
  setRecordingUI(false, "Processing...");
}

elements.recordBtn.addEventListener("mousedown", beginRecording);
elements.recordBtn.addEventListener("mouseup", endRecording);
elements.recordBtn.addEventListener("mouseleave", endRecording);
elements.recordBtn.addEventListener("touchstart", (event) => {
  event.preventDefault();
  beginRecording();
}, { passive: false });
elements.recordBtn.addEventListener("touchend", (event) => {
  event.preventDefault();
  endRecording();
}, { passive: false });

elements.answerBox.addEventListener("input", (event) => {
  state.currentAnswer = event.target.value;
  elements.submitAnswerBtn.disabled = !event.target.value.trim();
});

elements.submitAnswerBtn.addEventListener("click", submitCurrentAnswer);

elements.nextQuestionBtn.addEventListener("click", () => {
  if (state.currentQuestionIndex < state.analysis.questions.length - 1) {
    state.currentQuestionIndex += 1;
    updateDefenseView();
  } else {
    renderResults();
    setView("results");
  }
});

elements.restartBtn.addEventListener("click", restartApp);
