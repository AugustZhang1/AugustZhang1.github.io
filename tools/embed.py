r"""Build the static embedding payload used by index.html.

Run from the repository root with:
  C:\Users\augus\AppData\Local\Temp\embed-venv\Scripts\python.exe tools/embed.py
"""

from __future__ import annotations

import base64
import json
import re
from pathlib import Path

import numpy as np
from fastembed import TextEmbedding


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "index.html"
OUT = ROOT / "embeddings.js"
MODEL = "BAAI/bge-small-en-v1.5"
CACHE = r"C:\Users\augus\AppData\Local\Temp\embed-models"
REDUCED_DIM = 192
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "

# Broad recruiter vocabulary. Corpus words are added below, so these are only
# the concepts a recruiter might type without seeing the resume wording.
RECRUITER_WORDS = """
backend frontend fullstack web mobile app desktop software engineering developer
database data storage sql nosql postgres postgresql firebase supabase redis cache
cloud aws azure gcp google cloud deployment devops cicd docker kubernetes testing
test automation unit integration api rest graphql websocket realtime real-time
distributed systems concurrency parallel processing performance latency scalable
machine learning ml ai artificial intelligence deep learning model training
computer vision nlp natural language llm rag retrieval embeddings semantic search
security privacy pii secrets authentication authorization oauth payments stripe
react vue angular javascript typescript python java go rust c++ kotlin android
html css tailwind nextjs node fastapi flask django spring vite cloudflare workers
pipeline data pipeline analytics statistics dashboard monitoring observability
postgres database schema indexing query optimization algorithms architecture
frontend ui ux design accessibility browser extension chrome firefox
github actions ci cd continuous integration continuous delivery linux
production internship experience collaboration leadership troubleshooting
real time streaming telemetry sensors lidar gps imu camera robotics iot
api service microservices monolith worker queue jobs scheduling automation
documents forms scraping ranking recommendation search
video audio pdf speech text generation tts games gaming minecraft league sports
payments checkout webhooks calendar email oauth forms mobile-first pwa
reliable resilience error handling reconnect validation audit history
""".split()

RECRUITER_PHRASES = """
backend development|frontend development|full stack|web application|mobile application|mobile app|desktop application
software engineering|computer engineering|application development|database design|database systems|data modeling
data storage|relational database|NoSQL database|SQL query|PostgreSQL database|Firebase backend|Supabase database
cloud computing|cloud architecture|cloud deployment|AWS services|Google Cloud|Azure cloud|Cloudflare Workers
continuous integration|continuous delivery|CI/CD pipeline|devops automation|Docker deployment|Kubernetes cluster
automated testing|unit testing|integration testing|end to end testing|test driven development|quality assurance
REST API|GraphQL API|web API|backend API|API design|real time systems|real-time data|WebSocket server
distributed systems|distributed computing|concurrent programming|parallel processing|high performance|low latency
scalable architecture|system design|microservices architecture|modular monolith|background worker|job queue
machine learning|machine learning pipeline|deep learning|artificial intelligence|AI model|model training
model evaluation|natural language processing|computer vision|large language model|language model|LLM application
retrieval augmented generation|semantic search|vector search|vector database|embedding model|information retrieval
prompt engineering|AI evaluation|RAG evaluation|hybrid search|machine learning operations|MLOps pipeline
data pipeline|data engineering|data analysis|data visualization|business intelligence|time series|statistical model
real time streaming|event streaming|telemetry data|sensor fusion|Internet of Things|IoT device|robotics system
LiDAR sensing|GPS tracking|camera integration|Android application|mobile first|progressive web app|browser extension
React application|React component|Vue.js frontend|TypeScript project|JavaScript application|Python service|Java backend
Go service|Rust programming|Kotlin Android|HTML CSS|Tailwind CSS|Next.js application|Node.js service|FastAPI backend
Flask application|Django project|Spring Boot|Vite frontend|Chrome extension|Firefox extension|responsive design
user interface|user experience|accessible design|component library|design system|frontend performance
authentication system|authorization service|OAuth integration|API security|application security|data privacy
personally identifiable information|secrets management|secure coding|Stripe payments|payment processing|webhook handling
production deployment|release automation|GitHub Actions|Linux server|Docker Compose|monitoring and observability
logging and tracing|performance monitoring|error handling|fault tolerance|automatic reconnection|reliable service
database indexing|query optimization|schema migration|audit history|data validation|input validation|form autofill
web scraping|job board scraping|ranking algorithm|recommendation system|duplicate detection|document generation
email processing|calendar integration|Google OAuth|PDF processing|text to speech|speech synthesis|video processing
audio conversion|game development|Minecraft plugin|sports analytics|betting odds|volunteer scheduling
healthcare application|appointment booking|payment checkout|continuous deployment|software internship|production software
""".strip()
RECRUITER_PHRASES = [phrase.strip().lower() for phrase in re.split(r"[|\n]+", RECRUITER_PHRASES) if phrase.strip()]


def parse_source(text: str) -> tuple[list[dict], dict[str, dict]]:
    chunks: list[dict] = []
    for line in text.splitlines():
        if "{ id:" not in line:
            continue
        m = re.search(
            r'\{ id: "([^"]+)", project: "([^"]+)", kind: "([^"]+)", '
            r'text: "((?:\\.|[^"\\])*)", terms: (\[[^\]]*\])',
            line,
        )
        if not m:
            continue
        terms = json.loads(m.group(5))
        chunks.append(
            {
                "id": m.group(1),
                "project": m.group(2),
                "kind": m.group(3),
                "text": json.loads('"' + m.group(4) + '"'),
                "terms": terms,
            }
        )
    if not chunks:
        raise RuntimeError("No CHUNKS rows found in index.html")

    start = text.index("  const META = {")
    end = text.index("\n  };", start) + len("\n  };")
    meta_text = text[start:end]
    meta: dict[str, dict] = {}
    key_re = re.compile(r"^    ('?[A-Za-z0-9-]+'?): \{", re.M)
    keys = list(key_re.finditer(meta_text))
    for i, key_match in enumerate(keys):
        key = key_match.group(1).strip("'")
        block_end = keys[i + 1].start() if i + 1 < len(keys) else len(meta_text)
        block = meta_text[key_match.end() : block_end]
        title = re.search(r"title: '((?:\\.|[^'])*)'", block)
        tech = re.search(r"tech: \[([^\]]*)\]", block)
        if not title or not tech:
            raise RuntimeError(f"Could not parse META title/tech for {key}")
        tech_values = re.findall(r"'((?:\\.|[^'])*)'", tech.group(1))
        meta[key] = {"title": title.group(1), "tech": tech_values}
    if set(meta) != {c["project"] for c in chunks}:
        raise RuntimeError("META and CHUNKS project sets differ")
    return chunks, meta


def tokens(value: str) -> list[str]:
    words = re.split(r"[^a-z0-9+#.]+", value.lower())
    return [re.sub(r"^[^a-z0-9]+|[^a-z0-9+#]+$", "", w) for w in words if len(w) > 1 and re.sub(r"^[^a-z0-9]+|[^a-z0-9+#]+$", "", w)]


def search_forms(value: str) -> list[str]:
    """Add ordinary inflections so a short query shares words with passages."""
    out = set(tokens(value))
    for word in list(out):
        if word.endswith("ies") and len(word) > 4:
            out.add(word[:-3] + "y")
        if word.endswith("ing") and len(word) > 5:
            base = word[:-3]
            out.update((base, base + "e"))
        if word.endswith("ed") and len(word) > 4:
            out.add(word[:-2])
        if word.endswith("s") and len(word) > 3:
            out.add(word[:-1])
    return sorted(out)


def quantized_rows(rows: np.ndarray) -> str:
    rows = np.asarray(rows, dtype=np.float32)
    q = np.clip(np.rint(rows * 127.0), -127, 127).astype(np.int8)
    return base64.b64encode(q.tobytes()).decode("ascii")


def float_rows(rows: np.ndarray) -> str:
    rows = np.asarray(rows, dtype="<f4")
    return base64.b64encode(rows.tobytes()).decode("ascii")


def pca_positions(rows: np.ndarray, ids: list[str]) -> dict[str, list[float]]:
    centered = rows - rows.mean(axis=0, keepdims=True)
    # eigh is deterministic for this fixed matrix; sign stabilisation removes
    # the only arbitrary eigenvector choice.
    _, vecs = np.linalg.eigh(centered.T @ centered)
    components = vecs[:, -3:][:, ::-1]
    for j in range(3):
        pivot = int(np.argmax(np.abs(components[:, j])))
        if components[pivot, j] < 0:
            components[:, j] *= -1
    projected = centered @ components
    scale = np.max(np.abs(projected), axis=0)
    projected /= np.where(scale > 1e-12, scale, 1)
    return {key: [round(float(v), 6) for v in row] for key, row in zip(ids, projected)}


def reduce_rows(chunk_rows: np.ndarray, vocab_rows: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Project centered, normalized rows through a deterministic PCA basis."""
    all_rows = np.vstack([chunk_rows, vocab_rows])
    _, vecs = np.linalg.eigh(all_rows.T @ all_rows)
    basis = vecs[:, -REDUCED_DIM:][:, ::-1]
    for j in range(REDUCED_DIM):
        pivot = int(np.argmax(np.abs(basis[:, j])))
        if basis[pivot, j] < 0:
            basis[:, j] *= -1
    projected = all_rows @ basis
    chunks = projected[: len(chunk_rows)]
    vocab = projected[len(chunk_rows) :]
    chunks /= np.linalg.norm(chunks, axis=1, keepdims=True)
    vocab /= np.linalg.norm(vocab, axis=1, keepdims=True)
    return chunks.astype(np.float32), vocab.astype(np.float32)


def main() -> None:
    source = HTML.read_text(encoding="utf-8")
    chunks, meta = parse_source(source)
    model = TextEmbedding(model_name=MODEL, cache_dir=CACHE, local_files_only=True)

    chunk_texts = []
    seen_projects: set[str] = set()
    for c in chunks:
        forms = search_forms(f"{c['text']} {' '.join(c['terms'])}")
        m = meta[c["project"]]
        context = ""
        if c["project"] not in seen_projects:
            context = f"Project {m['title']}. Technologies: {', '.join(m['tech'])}. "
            seen_projects.add(c["project"])
        chunk_texts.append(
            f"{context}Resume chunk: {c['text']} Terms: {', '.join(c['terms'])}. "
            f"Search forms: {', '.join(forms)}"
        )
    chunk_rows = np.asarray(list(model.embed(chunk_texts)), dtype=np.float32)

    corpus_words = set(RECRUITER_WORDS)
    for phrase in RECRUITER_PHRASES:
        corpus_words.update(tokens(phrase))
    for c in chunks:
        corpus_words.update(tokens(c["text"]))
        for term in c["terms"]:
            corpus_words.update(tokens(term))
    for data in meta.values():
        corpus_words.update(tokens(data["title"]))
        for tech in data["tech"]:
            corpus_words.update(tokens(tech))
    vocab = sorted(corpus_words | set(RECRUITER_PHRASES))
    vocab_rows = np.asarray(list(model.embed([QUERY_PREFIX + term for term in vocab])), dtype=np.float32)
    # BGE's common passage bias makes short-query cosines cluster tightly.
    # Remove the corpus direction from both sides before reduction so the
    # browser compares vectors in a discriminative, shared centred space.
    corpus_mean = chunk_rows.mean(axis=0, keepdims=True)
    chunk_rows = chunk_rows - corpus_mean
    vocab_rows = vocab_rows - corpus_mean
    chunk_rows /= np.linalg.norm(chunk_rows, axis=1, keepdims=True)
    vocab_rows /= np.linalg.norm(vocab_rows, axis=1, keepdims=True)
    chunk_rows, vocab_rows = reduce_rows(chunk_rows, vocab_rows)

    projects = sorted({c["project"] for c in chunks})
    raw_centroids = []
    for project in projects:
        rows = chunk_rows[[i for i, c in enumerate(chunks) if c["project"] == project]]
        center = rows.mean(axis=0)
        center /= np.linalg.norm(center)
        raw_centroids.append(center)

    payload = {
        "version": 1,
        "model": MODEL,
        "dim": int(chunk_rows.shape[1]),
        "rawDim": int(chunk_rows.shape[1]),
        "chunkIds": [c["id"] for c in chunks],
        "chunks": quantized_rows(chunk_rows),
        "vocabTerms": vocab,
        "vocab": quantized_rows(vocab_rows),
        "centroidIds": projects,
        "centroids": float_rows(raw_centroids),
        "pos": pca_positions(chunk_rows, [c["id"] for c in chunks]),
    }
    body = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    header = (
        "// Generated by tools/embed.py. Re-run with:\n"
        "// C:\\Users\\augus\\AppData\\Local\\Temp\\embed-venv\\Scripts\\python.exe "
        "tools/embed.py\n"
    )
    OUT.write_text(header + "window.EMBED = " + body + ";\n", encoding="utf-8", newline="\n")
    print(f"{OUT}: {OUT.stat().st_size:,} bytes; {len(chunks)} chunks; {len(vocab)} vocab terms; {chunk_rows.shape[1]} dimensions")


if __name__ == "__main__":
    main()
