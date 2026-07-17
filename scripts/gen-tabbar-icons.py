#!/usr/bin/env python3
"""Generate light, antialiased TabBar icons without third-party packages."""

import math
import os
import struct
import zlib

SIZE = 81
SCALE = 4
CANVAS = SIZE * SCALE
STROKE = 4 * SCALE


def create_png(width, height, rgba_data):
    def chunk(chunk_type, data):
        payload = chunk_type + data
        crc = zlib.crc32(payload) & 0xFFFFFFFF
        return struct.pack('>I', len(data)) + payload + struct.pack('>I', crc)

    raw = bytearray()
    for y in range(height):
        raw.append(0)
        start = y * width * 4
        raw.extend(rgba_data[start:start + width * 4])
    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    return header + ihdr + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')


def blank():
    return [0] * (CANVAS * CANVAS * 4)


def dot(pixels, x, y, radius, color):
    left = max(0, int(x - radius))
    right = min(CANVAS - 1, int(x + radius))
    top = max(0, int(y - radius))
    bottom = min(CANVAS - 1, int(y + radius))
    rr = radius * radius
    for py in range(top, bottom + 1):
        for px in range(left, right + 1):
            if (px - x) ** 2 + (py - y) ** 2 <= rr:
                idx = (py * CANVAS + px) * 4
                pixels[idx:idx + 4] = [color[0], color[1], color[2], 255]


def line(pixels, x1, y1, x2, y2, color, width=STROKE):
    dx = x2 - x1
    dy = y2 - y1
    steps = max(1, int(max(abs(dx), abs(dy))))
    for i in range(steps + 1):
        t = i / steps
        dot(pixels, x1 + dx * t, y1 + dy * t, width / 2, color)


def circle(pixels, cx, cy, radius, color, width=STROKE, start=0.0, end=math.tau):
    steps = max(48, int(radius * (end - start)))
    previous = None
    for i in range(steps + 1):
        a = start + (end - start) * i / steps
        point = (cx + math.cos(a) * radius, cy + math.sin(a) * radius)
        if previous is not None:
            line(pixels, previous[0], previous[1], point[0], point[1], color, width)
        previous = point


def downsample(pixels):
    out = [0] * (SIZE * SIZE * 4)
    samples = SCALE * SCALE
    for y in range(SIZE):
        for x in range(SIZE):
            alpha = 0
            red = green = blue = 0
            for sy in range(SCALE):
                for sx in range(SCALE):
                    src = (((y * SCALE + sy) * CANVAS) + x * SCALE + sx) * 4
                    a = pixels[src + 3]
                    alpha += a
                    red += pixels[src] * a
                    green += pixels[src + 1] * a
                    blue += pixels[src + 2] * a
            dst = (y * SIZE + x) * 4
            out[dst + 3] = alpha // samples
            if alpha:
                out[dst] = red // alpha
                out[dst + 1] = green // alpha
                out[dst + 2] = blue // alpha
    return out


def draw_home(color):
    p = blank()
    s = SCALE
    points = [(13*s, 40*s), (40.5*s, 16*s), (68*s, 40*s), (61*s, 40*s),
              (61*s, 67*s), (49*s, 67*s), (49*s, 49*s), (32*s, 49*s),
              (32*s, 67*s), (20*s, 67*s), (20*s, 40*s), (13*s, 40*s)]
    for a, b in zip(points, points[1:]):
        line(p, a[0], a[1], b[0], b[1], color)
    return downsample(p)


def draw_compass(color):
    p = blank()
    s = SCALE
    circle(p, 40.5*s, 40.5*s, 28*s, color)
    line(p, 32*s, 49*s, 48*s, 32*s, color)
    line(p, 48*s, 32*s, 44*s, 44*s, color)
    line(p, 44*s, 44*s, 32*s, 49*s, color)
    return downsample(p)


def draw_sparkle(color):
    p = blank()
    s = SCALE
    line(p, 40.5*s, 12*s, 40.5*s, 69*s, color)
    line(p, 12*s, 40.5*s, 69*s, 40.5*s, color)
    line(p, 23*s, 23*s, 58*s, 58*s, color, 3*SCALE)
    line(p, 58*s, 23*s, 23*s, 58*s, color, 3*SCALE)
    circle(p, 40.5*s, 40.5*s, 7*s, color, 3*SCALE)
    return downsample(p)


def draw_heart(color):
    p = blank()
    s = SCALE
    points = []
    for i in range(121):
        t = math.tau * i / 120
        x = 40.5 + 1.32 * 16 * math.sin(t) ** 3
        y = 39 - 1.18 * (13 * math.cos(t) - 5 * math.cos(2*t) - 2 * math.cos(3*t) - math.cos(4*t))
        points.append((x*s, y*s))
    for a, b in zip(points, points[1:]):
        line(p, a[0], a[1], b[0], b[1], color)
    return downsample(p)


def draw_user(color):
    p = blank()
    s = SCALE
    circle(p, 40.5*s, 27*s, 12*s, color)
    circle(p, 40.5*s, 70*s, 25*s, color, start=math.pi, end=math.tau)
    line(p, 15.5*s, 70*s, 65.5*s, 70*s, color)
    return downsample(p)


grey = (132, 129, 131)
pink = (214, 83, 120)
drawers = {
    'tab-home': draw_home,
    'tab-discover': draw_compass,
    'tab-ai': draw_sparkle,
    'tab-fav': draw_heart,
    'tab-profile': draw_user,
}

os.makedirs('static/tabbar', exist_ok=True)
for name, drawer in drawers.items():
    for suffix, color in [('', grey), ('-active', pink)]:
        path = f'static/tabbar/{name}{suffix}.png'
        with open(path, 'wb') as handle:
            handle.write(create_png(SIZE, SIZE, drawer(color)))
        print(f'Created {path}')
