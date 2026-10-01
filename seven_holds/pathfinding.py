import heapq


def astar(walk, w, h, sx, sy, tx, ty):
    sx = max(0, min(w - 1, int(sx)))
    sy = max(0, min(h - 1, int(sy)))
    tx = max(0, min(w - 1, int(tx)))
    ty = max(0, min(h - 1, int(ty)))
    if not walk[sy * w + sx] or not walk[ty * w + tx]:
        return []

    start = sy * w + sx
    goal = ty * w + tx
    g = [1e9] * (w * h)
    came = [-1] * (w * h)
    closed = [False] * (w * h)
    g[start] = 0
    heap = [(heuristic(sx, sy, tx, ty), start)]
    dirs = (
        (1, 0, 1),
        (-1, 0, 1),
        (0, 1, 1),
        (0, -1, 1),
        (1, 1, 1.414),
        (1, -1, 1.414),
        (-1, 1, 1.414),
        (-1, -1, 1.414),
    )

    while heap:
        _, cur = heapq.heappop(heap)
        if closed[cur]:
            continue
        if cur == goal:
            return reconstruct(came, cur, w)
        closed[cur] = True
        cx, cy = cur % w, cur // w
        for dx, dy, cost in dirs:
            nx, ny = cx + dx, cy + dy
            if nx < 0 or ny < 0 or nx >= w or ny >= h:
                continue
            ni = ny * w + nx
            if not walk[ni] or closed[ni]:
                continue
            if dx and dy and (not walk[cy * w + nx] or not walk[ny * w + cx]):
                continue
            ng = g[cur] + cost
            if ng < g[ni]:
                g[ni] = ng
                came[ni] = cur
                heapq.heappush(heap, (ng + heuristic(nx, ny, tx, ty), ni))
    return []


def reconstruct(came, cur, w):
    path = []
    while cur != -1:
        path.append((cur % w, cur // w))
        cur = came[cur]
    path.reverse()
    return path


def heuristic(ax, ay, bx, by):
    dx, dy = abs(ax - bx), abs(ay - by)
    return dx + dy + (1.414 - 2) * min(dx, dy)
