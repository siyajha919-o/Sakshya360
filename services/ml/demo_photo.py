"""Synthetic site photos for demo inspection reports (no phone needed).

Draws a centre building with its signboard, some residents, and the same GPS/time caption band the
mobile app burns into real evidence photos. Demo/development use only.
"""
import cv2
import numpy as np

W, H = 960, 1280  # portrait, like a phone photo


def _person(img, x, y, scale, rng):
    colour = tuple(int(c) for c in rng.integers(40, 200, 3))
    skin = (int(rng.integers(60, 110)), int(rng.integers(110, 160)), int(rng.integers(170, 215)))
    cv2.circle(img, (x, y), int(22 * scale), skin, -1)                                  # head
    cv2.rectangle(img, (x - int(26 * scale), y + int(24 * scale)), (x + int(26 * scale), y + int(110 * scale)), colour, -1)  # body
    cv2.rectangle(img, (x - int(20 * scale), y + int(110 * scale)), (x - int(4 * scale), y + int(175 * scale)), (50, 50, 60), -1)
    cv2.rectangle(img, (x + int(4 * scale), y + int(110 * scale)), (x + int(20 * scale), y + int(175 * scale)), (50, 50, 60), -1)


def render(title, subtitle, lines, people=6, seed=0, view="front"):
    rng = np.random.default_rng(seed)
    img = np.zeros((H, W, 3), np.uint8)
    for yy in range(H):  # sky → ground gradient
        t = yy / H
        img[yy] = (235 - 60 * t, 215 - 40 * t, 180 - 20 * t) if yy < H * 0.55 else (120, 150, 165)
    if view == "front":
        cv2.rectangle(img, (90, 330), (870, 760), (170, 200, 225), -1)          # building
        cv2.rectangle(img, (90, 330), (870, 760), (90, 110, 130), 4)
        for r in range(2):
            for c in range(5):
                if r == 1 and c == 2:
                    continue  # the door is here
                x0, y0 = 140 + c * 150, 400 + r * 150
                cv2.rectangle(img, (x0, y0), (x0 + 90, y0 + 90), (120, 90, 60), -1)
                cv2.rectangle(img, (x0 + 6, y0 + 6), (x0 + 84, y0 + 84), (230, 220, 190), -1)
        cv2.rectangle(img, (420, 620), (540, 760), (60, 70, 110), -1)          # door
        cv2.rectangle(img, (140, 200), (820, 300), (40, 90, 20), -1)           # signboard
        cv2.putText(img, title[:34], (160, 245), cv2.FONT_HERSHEY_DUPLEX, 1.0, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(img, subtitle[:48], (160, 282), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (230, 240, 230), 1, cv2.LINE_AA)
    else:  # indoor hall
        img[:] = (200, 215, 225)
        cv2.rectangle(img, (0, 820), (W, H), (140, 160, 170), -1)
        cv2.rectangle(img, (120, 200), (840, 330), (60, 60, 120), -1)
        cv2.putText(img, "BENEFICIARY REGISTER / HALL", (150, 280), cv2.FONT_HERSHEY_DUPLEX, 1.0, (255, 255, 255), 2, cv2.LINE_AA)
    for i in range(people):
        x = int(120 + (i % 8) * 95 + rng.integers(-15, 15))
        y = int(790 + (i // 8) * 70 + rng.integers(-10, 10))
        _person(img, x, y, 0.9 + rng.random() * 0.2, rng)
    img = cv2.GaussianBlur(img, (3, 3), 0)
    img = np.clip(img.astype(np.int16) + rng.integers(-6, 7, img.shape), 0, 255).astype(np.uint8)  # sensor noise

    band_h = 34 + 30 * len(lines)
    overlay = img.copy()
    cv2.rectangle(overlay, (0, H - band_h), (W, H), (58, 29, 11), -1)          # navy caption band
    img = cv2.addWeighted(overlay, 0.75, img, 0.25, 0)
    for k, colour in enumerate([(51, 153, 255), (255, 255, 255), (8, 136, 19)]):  # tricolour strip (BGR)
        cv2.rectangle(img, (k * W // 3, H - band_h), ((k + 1) * W // 3, H - band_h + 8), colour, -1)
    for i, line in enumerate(lines):
        cv2.putText(img, line[:80], (18, H - band_h + 40 + i * 30), cv2.FONT_HERSHEY_SIMPLEX, 0.62 if i else 0.7,
                    (255, 255, 255), 2 if i == 0 else 1, cv2.LINE_AA)
    ok, jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return jpg.tobytes()
