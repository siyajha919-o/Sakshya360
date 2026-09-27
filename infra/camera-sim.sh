#!/bin/sh
# Simulated CCTV camera, started by MediaMTX on demand for a path like P103_4 (G1=P103, G2=4).
# Loops real footage for the camera's role with a burned-in label and live IST clock; falls back to a
# test pattern if the clips have not been downloaded (infra/download-clips.sh).
# A marker file /outages/<path> makes the camera "dead" (demo outage / seeded offline cameras).
[ -e "/outages/$MTX_PATH" ] && exit 1

P=$G1; N=$G2
case "$N" in
  1) CLIP=entrance;  LABEL="MAIN GATE" ;;
  2) CLIP=dormitory; LABEL="DORMITORY" ;;
  3) CLIP=kitchen;   LABEL="KITCHEN - STORE" ;;
  *) CLIP=hall;      LABEL="ACTIVITY HALL" ;;
esac
FILE=/clips/$CLIP.mp4
FONT=/clips/cctv-font.ttf

if [ -s "$FILE" ]; then
  # Each centre starts at a different point in the clip so no two feeds look identical.
  OFFSET=$(( ${P#P} * 7 % 25 ))
  set -- -stream_loop -1 -re -ss "$OFFSET" -i "$FILE"
else
  set -- -re -f lavfi -i "testsrc2=size=640x360:rate=15"
fi

VF="scale=640:360,fps=15"
if [ -s "$FONT" ]; then
  BOX="fontfile=$FONT:fontsize=17:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=5"
  VF="$VF,drawtext=$BOX:text='CAM 0$N  $LABEL  $P':x=10:y=10"
  VF="$VF,drawtext=$BOX:text='%{localtime\:%d-%m-%Y %T} IST':x=w-tw-10:y=10"
  VF="$VF,drawtext=$BOX:text='REC':fontcolor=red:x=w-tw-10:y=h-th-12"
fi

exec ffmpeg -hide_banner -loglevel error "$@" -an -vf "$VF" \
  -c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline -pix_fmt yuv420p -g 30 -bf 0 \
  -f rtsp "rtsp://localhost:$RTSP_PORT/$MTX_PATH"
