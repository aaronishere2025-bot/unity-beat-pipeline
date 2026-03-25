#!/bin/bash
# Check production deployment status

echo "🌐 Production Deployment Check"
echo "════════════════════════════════════════════════════"
echo ""

echo "1. Caddy Status:"
sudo systemctl status caddy --no-pager | head -10
echo ""

echo "2. Backend Server (localhost:8080):"
if curl -s http://localhost:8080/api/health > /dev/null 2>&1; then
  echo "   ✅ Backend responding"
  job_count=$(curl -s http://localhost:8080/api/jobs | jq '.data | length' 2>/dev/null)
  echo "   Jobs available: $job_count"
else
  echo "   ❌ Backend not responding"
fi
echo ""

echo "3. Production Domain (dontcomeherecrazydomain.com):"
if curl -s http://dontcomeherecrazydomain.com/api/health > /dev/null 2>&1; then
  echo "   ✅ Domain responding"
  domain_jobs=$(curl -s http://dontcomeherecrazydomain.com/api/jobs | jq '.data | length' 2>/dev/null)
  echo "   Jobs visible: $domain_jobs"
else
  echo "   ❌ Domain not responding"
fi
echo ""

echo "4. Port Listeners:"
sudo lsof -i :80 -i :8080 2>/dev/null | grep LISTEN
echo ""

echo "════════════════════════════════════════════════════"
echo "If domain is not responding, restart Caddy:"
echo "   sudo systemctl restart caddy"
