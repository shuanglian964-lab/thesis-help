import os
import json
import uuid
import tempfile

import pdfplumber
from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI

# ─────────────────────────────────────────────
#  Configuration
# ─────────────────────────────────────────────
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "YOUR_DEEPSEEK_API_KEY_HERE")

client = OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url="https://api.deepseek.com",
)

app = Flask(__name__)
CORS(app)  # Allow frontend (any origin) to call this API

# In-memory store for uploaded file text (fine for MVP / single-server)
file_store: dict[str, str] = {}

# ─────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────

def extract_pdf_text(file_obj) -> str:
    """Extract all text from an uploaded PDF file object."""
    text_parts = []
    with pdfplumber.open(file_obj) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n".join(text_parts)


def truncate_text(text: str, max_chars: int = 12000) -> str:
    """Keep token usage reasonable for long papers."""
    if len(text) <= max_chars:
        return text
    half = max_chars // 2
    return text[:half] + "\n\n[...middle section truncated...]\n\n" + text[-half:]


def call_deepseek(system_prompt: str, user_prompt: str) -> str:
    """Call DeepSeek chat completion and return the assistant message text."""
    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        temperature=0.7,
    )
    return response.choices[0].message.content.strip()


def parse_json_response(raw: str) -> dict:
    """Strip markdown fences and parse JSON."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        cleaned = cleaned.rsplit("```", 1)[0]
    return json.loads(cleaned.strip())


# ─────────────────────────────────────────────
#  Routes
# ─────────────────────────────────────────────

@app.route("/upload", methods=["POST"])
def upload():
    """Receive a PDF, extract its text, return a file_id."""
    if "file" not in request.files:
        return jsonify({"error": "No file provided."}), 400

    file = request.files["file"]
    if not file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Only PDF files are accepted."}), 400

    try:
        # Save to a temp file so pdfplumber can seek
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            file.save(tmp.name)
            text = extract_pdf_text(tmp.name)
        os.unlink(tmp.name)
    except Exception as exc:
        return jsonify({"error": f"PDF extraction failed: {exc}"}), 500

    if not text.strip():
        return jsonify({"error": "Could not extract text. The PDF may be scanned or image-based."}), 422

    file_id = str(uuid.uuid4())
    file_store[file_id] = truncate_text(text)

    return jsonify({"file_id": file_id, "filename": file.filename})


@app.route("/analyze", methods=["POST"])
def analyze():
    """Generate defense questions + presentation script from stored paper text."""
    body = request.get_json(force=True)
    file_id = body.get("file_id")

    if not file_id or file_id not in file_store:
        return jsonify({"error": "Unknown file_id. Please upload again."}), 404

    paper_text = file_store[file_id]

    system_prompt = (
        "You are an expert academic thesis examiner. "
        "You always respond in valid JSON only — no markdown, no extra text."
    )

    user_prompt = f"""
Read the thesis below and return a JSON object with exactly these keys:

{{
  "questions": [
    {{
      "id": 1,
      "type": "basic | deep | tricky",
      "difficulty": "Basic | Deep | Tricky",
      "question": "...",
      "reference_answer": "..."
    }}
    // 6-8 questions total: 2 basic, 3 deep, 2-3 tricky
  ],
  "script": "A full 10-minute presentation outline as plain text, covering: Title & Introduction, Background & Motivation, Problem Statement, Methodology, Experiment Design, Key Results, Contributions, Limitations, Future Work, Closing."
}}

All content must be in English. Reference answers should be 2-4 sentences.

--- THESIS START ---
{paper_text}
--- THESIS END ---
"""

    try:
        raw = call_deepseek(system_prompt, user_prompt)
        result = parse_json_response(raw)
    except json.JSONDecodeError:
        return jsonify({"error": "AI returned malformed JSON. Please try again."}), 502
    except Exception as exc:
        return jsonify({"error": f"AI call failed: {exc}"}), 502

    return jsonify(result)


@app.route("/evaluate", methods=["POST"])
def evaluate():
    """Score a student's answer to one defense question."""
    body = request.get_json(force=True)
    question         = body.get("question", "")
    answer           = body.get("answer", "")
    reference_answer = body.get("reference_answer", "")

    if not question or not answer:
        return jsonify({"error": "question and answer are required."}), 400

    system_prompt = (
        "You are a strict but fair academic thesis examiner. "
        "You always respond in valid JSON only — no markdown, no extra text."
    )

    user_prompt = f"""
Evaluate the student's answer to this thesis defense question.

Question: {question}
Reference Answer: {reference_answer}
Student's Answer: {answer}

Return a JSON object with exactly these keys:
{{
  "score": <number 0-10, one decimal place>,
  "strengths": ["...", "..."],
  "improvements": ["...", "..."],
  "overall_feedback": "2-3 sentence summary of the answer quality."
}}

Scoring rubric (each dimension up to 2 points):
- Relevance: does the answer address the question?
- Accuracy: is the content factually correct relative to the thesis?
- Clarity: is the logic clear and well-structured?
- Completeness: are key points covered?
- English Fluency: is the expression natural and fluent?
"""

    try:
        raw = call_deepseek(system_prompt, user_prompt)
        result = parse_json_response(raw)
    except json.JSONDecodeError:
        return jsonify({"error": "AI returned malformed JSON. Please try again."}), 502
    except Exception as exc:
        return jsonify({"error": f"AI call failed: {exc}"}), 502

    return jsonify(result)


# ─────────────────────────────────────────────
#  Entry point
# ─────────────────────────────────────────────
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
