from pydantic import BaseModel
from typing import List, Optional, Union, Any

# --- New Detailed Apple Aesthetic Subtitle Config Schema ---
class FontManagement(BaseModel):
    base_sans_font: str
    accent_serif_font: str
    font_size_px: int
    line_height: float
    position_y_percent: int

class ColorPalette(BaseModel):
    text_main: str
    text_muted: str
    text_accent: str
    use_bg_inversion_on_peak: bool

class SubtitleAnimation(BaseModel):
    type: str
    duration_frames: int
    easing_curve: str

class SubtitleLayout(BaseModel):
    max_words_per_screen: int
    text_case: str
    use_shadow: bool
    shadow_blur_px: int
    shadow_opacity: float

class SubtitleConfig(BaseModel):
    # Old fields (made optional for backward compatibility)
    font: Optional[str] = None
    fontSize: Optional[int] = None
    position: Optional[str] = None
    colorMap: Optional[List[str]] = None
    animation: Optional[Union[str, SubtitleAnimation]] = None
    useOutline: Optional[bool] = None
    wordsPerScreen: Optional[int] = None
    
    # New nested fields
    font_management: Optional[FontManagement] = None
    color_palette: Optional[ColorPalette] = None
    layout: Optional[SubtitleLayout] = None


# --- New Detailed Video Processing Config Schema ---
class AudioCutParameters(BaseModel):
    silence_threshold_db: float
    min_silence_duration_sec: float
    crossfade_duration_ms: int

class SmartZoom(BaseModel):
    trigger_on_emotional_peak: bool
    zoom_scale_factor: float
    animation_speed_frames: int

class BrollMatching(BaseModel):
    clip_aesthetic_score_threshold: float
    min_broll_duration_sec: float
    max_broll_duration_sec: float

class VideoProcessingConfig(BaseModel):
    audio_cut_parameters: AudioCutParameters
    smart_zoom: SmartZoom
    broll_matching: BrollMatching


# --- New Detailed Sound Design Config Schema ---
class BackgroundMusicConfig(BaseModel):
    genre_tags: List[str]
    target_bpm: int
    ducking_volume_db: int

class SfxTriggerMapItem(BaseModel):
    event: str
    sfx_file: str
    volume_scale: float

class SoundDesignConfig(BaseModel):
    background_music: BackgroundMusicConfig
    sfx_trigger_map: List[SfxTriggerMapItem]


# --- Main Template Config Schema ---
class TemplateConfig(BaseModel):
    id: str
    name: str
    description: str
    preview_url: str
    
    subtitles: SubtitleConfig
    
    # Old configs
    editing: Optional[Any] = None
    graphics: Optional[Any] = None
    
    # New configs
    video_processing: Optional[VideoProcessingConfig] = None
    sound_design: Optional[SoundDesignConfig] = None
