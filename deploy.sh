#!/bin/bash
set -e

echo "🚀 Deploying BeatForge to Google Cloud Run"
echo "Project: unity-ai-1766877776"
echo "Domain: dontcomeherecrazydomain.com"
echo ""

# Enable required APIs
echo "📦 Enabling Cloud Run and Artifact Registry APIs..."
gcloud services enable run.googleapis.com --project=unity-ai-1766877776
gcloud services enable artifactregistry.googleapis.com --project=unity-ai-1766877776

# Build the application
echo "🔨 Building application..."
npm run build

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy beatforge \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --max-instances 10 \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,KLING_SECRET_KEY=KLING_SECRET_KEY:latest,SUNO_API_KEY=SUNO_API_KEY:latest,YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,JWT_SECRET=JWT_SECRET:latest,SESSION_SECRET=SESSION_SECRET:latest" \
  --set-env-vars="NODE_ENV=production,GOOGLE_REDIRECT_URI=https://dontcomeherecrazydomain.com/api/auth/google/callback" \
  --project=unity-ai-1766877776

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Get your Cloud Run URL:"
echo "   gcloud run services describe beatforge --region us-central1 --format='value(status.url)'"
echo ""
echo "2. Map custom domain in Cloudflare (I'll help with this)"
