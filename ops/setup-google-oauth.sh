#!/bin/bash

echo "🔐 Setting up Google OAuth 2.0 for SaaS Login"
echo "================================================"
echo ""

PROJECT_ID="unity-ai-1766877776"

echo "Step 1: Enabling required APIs..."
gcloud services enable iamcredentials.googleapis.com --project=$PROJECT_ID
gcloud services enable oauth2.googleapis.com --project=$PROJECT_ID

echo "✅ APIs enabled"
echo ""

echo "Step 2: Opening Google Cloud Console to create OAuth credentials..."
echo ""
echo "Please follow these steps in the browser:"
echo ""
echo "1. Click 'CREATE CREDENTIALS' → 'OAuth client ID'"
echo "2. Application type: 'Web application'"
echo "3. Name: 'Unity AI SaaS Login'"
echo "4. Authorized redirect URIs:"
echo "   - http://localhost:8080/api/auth/google/callback"
echo "   - http://localhost:5173/auth-callback"
echo "5. Click 'CREATE'"
echo "6. Copy the Client ID and Client Secret"
echo ""
echo "Opening browser..."
sleep 2

# Open browser to OAuth consent screen / credentials page
open "https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID" 2>/dev/null || \
xdg-open "https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID" 2>/dev/null || \
echo "Please manually open: https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"

echo ""
echo "After creating the OAuth client, paste your credentials below:"
echo ""

read -p "Enter Client ID: " CLIENT_ID
read -p "Enter Client Secret: " CLIENT_SECRET

# Update .env file
if [ -f .env ]; then
  # Check if GOOGLE_CLIENT_ID already exists
  if grep -q "^GOOGLE_CLIENT_ID=" .env; then
    # Update existing
    sed -i.bak "s|^GOOGLE_CLIENT_ID=.*|GOOGLE_CLIENT_ID=\"$CLIENT_ID\"|" .env
    sed -i.bak "s|^GOOGLE_CLIENT_SECRET=.*|GOOGLE_CLIENT_SECRET=\"$CLIENT_SECRET\"|" .env
    echo "✅ Updated existing credentials in .env"
  else
    # Append new
    echo "" >> .env
    echo "# Google OAuth 2.0 (for SaaS login)" >> .env
    echo "GOOGLE_CLIENT_ID=\"$CLIENT_ID\"" >> .env
    echo "GOOGLE_CLIENT_SECRET=\"$CLIENT_SECRET\"" >> .env
    echo "✅ Added credentials to .env"
  fi
else
  echo "❌ .env file not found!"
  exit 1
fi

echo ""
echo "✨ Google OAuth setup complete!"
echo ""
echo "Credentials saved to .env:"
echo "  GOOGLE_CLIENT_ID=$CLIENT_ID"
echo "  GOOGLE_CLIENT_SECRET=(hidden)"
echo ""
echo "Next: Run the server and test OAuth login"
echo "  npm run dev"
echo "  Visit: http://localhost:8080/api/auth/google/url"
echo ""
