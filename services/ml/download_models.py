"""Downloads the OpenCV face models (YuNet detector, SFace recogniser) from opencv_zoo."""
import hashlib
import urllib.request
from pathlib import Path

MODELS = Path(__file__).parent / "models"
FILES = {
    "face_detection_yunet_2023mar.onnx": "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "face_recognition_sface_2021dec.onnx": "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
}


def main():
    MODELS.mkdir(exist_ok=True)
    for name, url in FILES.items():
        path = MODELS / name
        if path.exists() and path.stat().st_size > 100_000:
            print(f"ok      {name}")
            continue
        print(f"fetch   {name}")
        urllib.request.urlretrieve(url, path)
        if path.stat().st_size < 100_000:
            raise SystemExit(f"{name} looks wrong (Git LFS pointer?) – download manually from {url}")
        print(f"        {path.stat().st_size // 1024} KB sha256 {hashlib.sha256(path.read_bytes()).hexdigest()[:16]}")


if __name__ == "__main__":
    main()
