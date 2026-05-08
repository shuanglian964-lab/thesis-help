import os
import json
import uuid
import tempfile
import requests

import pdfplumber
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")

app = Flask(__name__, static_folder="frontend", static_url_path="")
CORS(app)

file_store = {}

def extract_pdf_text(filepath):
    text_parts = []
    with pdfplumber.open(filepath) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n".join(text_parts)

def truncate_text(text, max_chars=12000):
    if len(text) <= max_chars:
        return text
    half = max_chars // 2
    return text[:half] + "\n\n[...truncated...]\n\n" + text[-half:]

def call_deepseek(system_prompt, user_prompt):
    response = requests.post(
        "https://api.deepseek.com/chat/completions",
        headers={
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            "temperature": 0.7,
        },
        timeout=60,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"].strip()

def parse_json_response(raw):
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        cleaned = cleaned.rsplit("```", 1)[0]
    return json.loads(cleaned.strip())

# ── Serve frontend ──
@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

# ── API routes ──
@app.route("/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return jsonify({"error": "No file provided."}), 400
    file = request.files["file"]
    if not file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Only PDF files are accepted."}), 400
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            file.save(tmp.name)
            text = extract_pdf_text(tmp.name)
        os.unlink(tmp.name)
    except Exception as exc:
        return jsonify({"error": f"PDF extraction failed: {exc}"}), 500
    if not text.strip():
        return jsonify({"error": "Could not extract text. PDF may be scanned."}), 422
    file_id = str(uuid.uuid4())
    file_store[file_id] = truncate_text(text)
    return jsonify({"file_id": file_id, "filename": file.filename})

@app.route("/analyze", methods=["POST"])
def analyze():
    body = request.get_json(force=True)
    file_id = body.get("file_id")
    if not file_id or file_id not in file_store:
        return jsonify({"error": "Unknown file_id. Please upload again."}), 404
    paper_text = file_store[file_id]
    system_prompt = "You are an expert academic thesis examiner. You always respond in valid JSON only — no markdown, no extra text."
    user_prompt = f"""Read the thesis below and return a JSON object with exactly these keys:
{{
  "questions": [
    {{
      "id": 1,
      "type": "basic",
      "difficulty": "Basic",
      "question": "...",
      "reference_answer": "..."
    }}
  ],
  "script": "A full 10-minute presentation outline as plain text."
}}
Generate 6-8 questions: 2 basic, 3 deep, 2-3 tricky. All in English.
--- THESIS ---
{paper_text}
--- END ---"""
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
    body = request.get_json(force=True)
    question = body.get("question", "")
    answer = body.get("answer", "")
    reference_answer = body.get("reference_answer", "")
    if not question or not answer:
        return jsonify({"error": "question and answer are required."}), 400
    system_prompt = "You are a strict but fair academic thesis examiner. You always respond in valid JSON only — no markdown, no extra text."
    user_prompt = f"""Evaluate the student's answer.
Question: {question}
Reference Answer: {reference_answer}
Student's Answer: {answer}
Return JSON:
{{
  "score": 7.5,
  "strengths": ["..."],
  "improvements": ["..."],
  "overall_feedback": "..."
}}"""
    try:
        raw = call_deepseek(system_prompt, user_prompt)
        result = parse_json_response(raw)
    except json.JSONDecodeError:
        return jsonify({"error": "AI returned malformed JSON. Please try again."}), 502
    except Exception as exc:
        return jsonify({"error": f"AI call failed: {exc}"}), 502
    return jsonify(result)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
