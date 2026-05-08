class VoiceController {
  constructor() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition || null;

    this.recognition = SpeechRecognition ? new SpeechRecognition() : null;
    this.isSupported = Boolean(this.recognition);
    this.isRecording = false;

    if (this.recognition) {
      this.recognition.lang = "en-US";
      this.recognition.interimResults = true;
      this.recognition.continuous = true;
    }
  }

  speak(text) {
    if (!("speechSynthesis" in window)) {
      throw new Error("Text-to-speech is not supported in this browser.");
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.95;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  startRecording({ onInterim, onFinal, onError }) {
    if (!this.recognition) {
      onError?.("Speech recognition is not supported in this browser.");
      return;
    }

    this.isRecording = true;
    let finalTranscript = "";

    this.recognition.onresult = (event) => {
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += `${transcript} `;
        } else {
          interimTranscript += transcript;
        }
      }

      onInterim?.(`${finalTranscript}${interimTranscript}`.trim());
    };

    this.recognition.onerror = (event) => {
      this.isRecording = false;
      onError?.(event.error === "no-speech"
        ? "No speech was detected. Please try again."
        : "Speech recognition failed. Please try again.");
    };

    this.recognition.onend = () => {
      const cleaned = finalTranscript.trim();
      this.isRecording = false;
      if (cleaned) {
        onFinal?.(cleaned);
      }
    };

    this.recognition.start();
  }

  stopRecording() {
    if (this.recognition && this.isRecording) {
      this.recognition.stop();
    }
  }
}

window.voiceController = new VoiceController();
