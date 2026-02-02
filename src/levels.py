"""Level wall definitions."""

from .constants import GRID_W, GRID_H


def build_border_walls() -> set[tuple[int, int]]:
    walls = set()
    for x in range(GRID_W):
        walls.add((x, 0))
        walls.add((x, GRID_H - 1))
    for y in range(GRID_H):
        walls.add((0, y))
        walls.add((GRID_W - 1, y))
    return walls


def build_level_walls(level: int) -> set[tuple[int, int]]:
    walls = build_border_walls()

    if level == 1:
        pass

    elif level == 2:
        cx, cy = GRID_W // 2, GRID_H // 2
        for i in range(-4, 5):
            walls.add((cx + i, cy))
            walls.add((cx, cy + i))

    elif level == 3:
        positions = [(10, 8), (27, 8), (10, 19), (27, 19)]
        for px, py in positions:
            for dx in range(3):
                for dy in range(3):
                    walls.add((px + dx, py + dy))

    elif level == 4:
        for x in range(5, 35):
            if x not in (18, 19, 20):
                walls.add((x, 10))
                walls.add((x, 20))

    elif level == 5:
        for x in range(1, 18):
            walls.add((x, 8))
        for x in range(22, GRID_W - 1):
            walls.add((x, 14))
        for x in range(1, 18):
            walls.add((x, 20))

    elif level == 6:
        for x in range(5, 35):
            walls.add((x, 5))
        for x in range(5, 35):
            if x != 20:
                walls.add((x, 24))
        for y in range(5, 25):
            walls.add((5, y))
        for y in range(5, 25):
            if y != 10:
                walls.add((34, y))
        for x in range(10, 30):
            if x != 15:
                walls.add((x, 10))
        for x in range(10, 30):
            walls.add((x, 19))
        for y in range(10, 20):
            walls.add((29, y))
        for y in range(10, 20):
            if y != 16:
                walls.add((10, y))

    elif level == 7:
        cx, cy = GRID_W // 2, GRID_H // 2
        for x in range(1, GRID_W - 1):
            if abs(x - cx) > 2:
                walls.add((x, cy))
        for y in range(1, GRID_H - 1):
            if abs(y - cy) > 2:
                walls.add((cx, y))

    elif level == 8:
        segments = [
            ((4, 4), (4, 8)), ((8, 4), (14, 4)), ((8, 8), (8, 12)),
            ((12, 7), (12, 11)), ((16, 4), (16, 10)), ((20, 3), (20, 8)),
            ((24, 4), (28, 4)), ((24, 8), (24, 14)), ((28, 7), (34, 7)),
            ((32, 4), (32, 10)), ((36, 4), (36, 9)),
            ((4, 13), (10, 13)), ((4, 17), (4, 22)), ((8, 17), (14, 17)),
            ((12, 14), (12, 17)), ((16, 14), (22, 14)), ((18, 17), (18, 22)),
            ((22, 18), (28, 18)), ((26, 11), (26, 16)), ((30, 12), (30, 17)),
            ((32, 14), (36, 14)), ((34, 17), (34, 22)),
            ((4, 25), (10, 25)), ((8, 21), (8, 25)), ((12, 22), (18, 22)),
            ((14, 25), (20, 25)), ((22, 22), (22, 26)), ((26, 22), (32, 22)),
            ((28, 25), (34, 25)), ((36, 18), (36, 24)),
        ]
        for (x1, y1), (x2, y2) in segments:
            if x1 == x2:
                for y in range(min(y1, y2), max(y1, y2) + 1):
                    walls.add((x1, y))
            else:
                for x in range(min(x1, x2), max(x1, x2) + 1):
                    walls.add((x, y1))

    return walls
