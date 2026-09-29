import io
import os
import tempfile
import zipfile
import base64

from fastapi import Body, FastAPI
from fastapi.responses import Response

from exporter import to_convokit
from judge import score_conversations

app = FastAPI(title="ConvoKit Converter")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/convert")
def convert(export: dict = Body(...)):
    """Convert an experiment export JSON into a zipped ConvoKit corpus."""
    corpus = to_convokit(export)
    audit_result = score_conversations(corpus)
    with tempfile.TemporaryDirectory() as d:
        corpus.dump("corpus", base_path=d)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for root, _, files in os.walk(d):
                for f in files:
                    full = os.path.join(root, f)
                    z.write(full, os.path.relpath(full, d))
    
    return {
        "scores": audit_result,
        "zip": base64.b64encode(buf.getvalue()).decode(),
    }
