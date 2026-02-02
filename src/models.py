"""Data models."""

from dataclasses import dataclass, field
from typing import Optional

from .constants import MAX_LIVES


@dataclass
class PlayerState:
    pid: str
    name: str
    color: str
    segments: list = field(default_factory=list)
    direction: str = "right"
    next_direction: str = "right"
    score: int = 0
    lives: int = MAX_LIVES
    alive: bool = True
    game_over: bool = False
    respawn_at: Optional[float] = None

    def head(self):
        return self.segments[0] if self.segments else None
