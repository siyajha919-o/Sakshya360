#!/bin/sh
# Downloads real CCTV-style footage for the simulated cameras and converts it once to the stream format
# (640x360, 15 fps, H.264), so looping 32 cameras stays cheap. Uses the MediaMTX image's ffmpeg – no local
# ffmpeg needed. Clips: Intel IoT DevKit sample videos, CC BY 4.0 (see clips/CREDITS.md).
set -e
cd "$(dirname "$0")/clips"
BASE=https://raw.githubusercontent.com/intel-iot-devkit/sample-videos/master
IMAGE=bluenviron/mediamtx:latest-ffmpeg

# camera role  <-  source clip
for pair in entrance:people-detection dormitory:one-by-one-person-detection kitchen:store-aisle-detection hall:classroom; do
  name=${pair%%:*}; src=${pair#*:}
  if [ -s "$name.mp4" ]; then echo "ok       $name.mp4"; continue; fi
  echo "fetch    $src.mp4"
  curl -fsSL -o "src-$src.mp4" "$BASE/$src.mp4"
  echo "convert  -> $name.mp4"
  docker run --rm --entrypoint ffmpeg -v "$PWD:/w" -w /w "$IMAGE" -hide_banner -loglevel error -y \
    -i "src-$src.mp4" -an -vf "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,fps=15" \
    -c:v libx264 -preset veryfast -crf 26 -profile:v baseline -pix_fmt yuv420p -g 15 -bf 0 -movflags +faststart "$name.mp4"
  rm -f "src-$src.mp4"
done

if [ ! -s cctv-font.ttf ]; then
  echo "fetch    Share Tech Mono (SIL OFL 1.1)"
  curl -fsSL -o cctv-font.ttf https://github.com/google/fonts/raw/main/ofl/sharetechmono/ShareTechMono-Regular.ttf
fi
ls -la *.mp4 cctv-font.ttf
