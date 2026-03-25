#!/bin/bash
# Direct FFmpeg GPU encoding test

echo "🎬 Direct FFmpeg GPU Encoding Test"
echo ""

# Create test source
TEST_SOURCE="/tmp/unity-scratch/gpu-test-source.mp4"
TEST_OUTPUT_GPU="/tmp/unity-scratch/gpu-test-output-nvenc.mp4"
TEST_OUTPUT_CPU="/tmp/unity-scratch/gpu-test-output-cpu.mp4"

if [ ! -f "$TEST_SOURCE" ]; then
  echo "📹 Creating 5-second test video..."
  ffmpeg -y -f lavfi -i color=c=blue:s=1920x1080:d=5 \
    -vf "drawtext=text='Test Video':fontsize=96:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" \
    -c:v libx264 -preset ultrafast -pix_fmt yuv420p \
    "$TEST_SOURCE" 2>&1 | grep -E "frame=|Duration"
  echo "✅ Test source created"
  echo ""
fi

echo "🚀 Test 1: GPU Encoding (h264_nvenc)"
echo "Command: ffmpeg -y -stream_loop 359 -i source.mp4 -c:v h264_nvenc -preset p4 output.mp4"
echo "Target: 30 minutes (360 loops of 5 seconds)"
echo ""

START_TIME=$(date +%s)
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
echo ""

ffmpeg -y -stream_loop 359 -i "$TEST_SOURCE" \
  -c:v h264_nvenc -preset p4 -pix_fmt yuv420p \
  "$TEST_OUTPUT_GPU" 2>&1 | grep -E "frame=|fps=|speed=" | tail -5

END_TIME=$(date +%s)
GPU_TIME=$((END_TIME - START_TIME))

echo ""
echo "✅ GPU encoding complete"
echo "⏱️  Time: $GPU_TIME seconds"
echo "📦 Output: $TEST_OUTPUT_GPU"
ls -lh "$TEST_OUTPUT_GPU" | awk '{print "   Size: " $5}'

echo ""
echo "📊 Expected Times:"
echo "   - GPU (Tesla T4): ~60-90 seconds"
echo "   - CPU (fallback): ~600-900 seconds"
echo ""

if [ "$GPU_TIME" -lt 150 ]; then
  echo "🎉 GPU ENCODING CONFIRMED! (very fast)"
elif [ "$GPU_TIME" -lt 400 ]; then
  echo "⚡ Reasonably fast (likely GPU)"
else
  echo "🐌 Slow (might be CPU fallback)"
fi

echo ""
echo "🔍 Verify GPU was used:"
nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv
