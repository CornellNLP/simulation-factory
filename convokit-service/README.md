# ConvoKit Service

A small FastAPI microservice that converts a simulation-factory experiment export into a zipped [ConvoKit](https://convokit.cornell.edu/) corpus. It's called by the main app's `app/api/convokit/route.ts` via the `CONVOKIT_SERVICE_URL` environment variable and is independently deployable.

## Endpoints

- `GET /health` — health check (used by the Docker Compose healthcheck).
- `POST /convert` — accepts an experiment export JSON body and returns a `convokit-corpus.zip` built by `exporter.py`.

## Local development

```bash
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8080 --reload
```

## Docker

Build and push the image:

```bash
docker buildx build --platform linux/amd64 \
  -t us-central1-docker.pkg.dev/traust-491612/cloud-run-source-deploy/convokit-service \
  --push .
```

Deploy to Cloud Run:

```bash
gcloud run deploy convokit-service \
  --image us-central1-docker.pkg.dev/traust-491612/cloud-run-source-deploy/convokit-service \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080
```

Alternatively, run it together with the main web app via `docker compose up` from the repo root (see the [root README](../README.md)).
