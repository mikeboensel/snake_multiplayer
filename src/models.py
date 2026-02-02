"""Data models."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from .constants import MAX_LIVES


class PlayerLocation(Enum):
    LOBBY = "lobby"
    PLAYING = "playing"
    SPECTATING = "spectating"


@dataclass
class PlayerState:
    pid: str
    name: str
    color: str
    head_avatar: str = "angel"
    custom_head: Optional[str] = None
    segments: list = field(default_factory=list)
    direction: str = "right"
    next_direction: str = "right"
    score: int = 0
    lives: int = MAX_LIVES
    alive: bool = True
    game_over: bool = False
    respawn_at: Optional[float] = None
    is_ai: bool = False
    ai_decision_at: float = 0.0
    location: PlayerLocation = PlayerLocation.LOBBY

    def head(self):
        return self.segments[0] if self.segments else None
