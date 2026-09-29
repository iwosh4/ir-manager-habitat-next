"""PNG → Y4M (I420) still video for Chromium's fake camera (--use-file-for-fake-video-capture)."""
import sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
W, H, FRAMES = 640, 480, 30
img = Image.open(src).convert('RGB')
canvas = Image.new('RGB', (W, H), (235, 235, 235))
img.thumbnail((int(H * 0.8), int(H * 0.8)))
canvas.paste(img, ((W - img.width) // 2, (H - img.height) // 2))
y, u, v = canvas.convert('YCbCr').split()
u = u.resize((W // 2, H // 2)); v = v.resize((W // 2, H // 2))
frame = y.tobytes() + u.tobytes() + v.tobytes()
with open(dst, 'wb') as f:
    f.write(f'YUV4MPEG2 W{W} H{H} F10:1 Ip A1:1 C420jpeg\n'.encode())
    for _ in range(FRAMES):
        f.write(b'FRAME\n'); f.write(frame)
