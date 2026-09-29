## Command used to docker build

docker buildx build --platform linux/amd64 \
  -t us-central1-docker.pkg.dev/traust-491612/cloud-run-source-deploy/convokit-service \
  --push .

## Command used to deploy on Cloud Run

gcloud run deploy convokit-service \
  --image us-central1-docker.pkg.dev/traust-491612/cloud-run-source-deploy/convokit-service \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=your-key \
  --port 8080

## Start FastAPI server

uvicorn app:app --host 0.0.0.0 --port 8080 --reload
