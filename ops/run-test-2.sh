#!/bin/bash
# Test 2: Another 30-minute GPU encoding test

echo "🎬 Test 2: Another 30-minute GPU encoding test"
echo ""
echo "Using existing test source from previous run..."
echo ""

TEST_SOURCE="/tmp/unity-scratch/gpu-test-source.mp4"
TEST_OUTPUT="/tmp/unity-scratch/gpu-test-output-run2.mp4"

echo "📊 Pre-test GPU status:"
nvidia-smi --query-gpu=utilization.gpu,utilization.memory,memory.used,temperature.gpu --format=csv,noheader
echo ""

echo "🚀 Starting 30-minute encode with h264_nvenc..."
echo "⏱️  Start time: $(date +"%H:%M:%S")"
echo ""

START_TIME=$(date +%s)

ffmpeg -y -stream_loop 359 -i "$TEST_SOURCE" \
  -c:v h264_nvenc -preset p4 -pix_fmt yuv420p \
  "$TEST_OUTPUT" 2>&1 | grep -E "frame=.*fps=.*speed=" | tail -10

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
MINUTES=$(echo "scale=1; $ELAPSED/60" | bc)

echo ""
echo "✅ Complete!"
echo "⏱️  Total time: $ELAPSED seconds ($MINUTES minutes)"
echo "📦 Output: $TEST_OUTPUT"
ls -lh "$TEST_OUTPUT" | awk '{print "   Size: " $5}'
echo ""

echo "📊 Post-test GPU status:"
nvidia-smi --query-gpu=utilization.gpu,utilization.memory,memory.used,temperature.gpu --format=csv,noheader
echo ""

REALTIME_SPEED=$(echo "scale=1; 1800/$ELAPSED" | bc)

if [ "$ELAPSED" -lt 150 ]; then
  echo "🎉 EXCELLENT! GPU encoding at full speed"
  echo "   Speed: ${REALTIME_SPEED}x realtime"
else
  echo "⚠️  Slower than expected (might be CPU fallback)"
fi
