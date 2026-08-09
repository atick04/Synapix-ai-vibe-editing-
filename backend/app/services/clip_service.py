"""
CLIP Service — OpenAI CLIP (Contrastive Language-Image Pre-training) Integration.
Used for:
1. Semantic and aesthetic ranking of B-roll candidates against transcript context.
2. Visual style & color matching between speaker frames and graphic/B-roll overlays.
"""

import os
import logging
from typing import List, Dict, Any, Optional
from PIL import Image

logger = logging.getLogger(__name__)

# Lazy global model instances
_clip_model = None
_clip_processor = None
_model_failed = False


def _init_clip():
    """Lazy initialization of OpenAI CLIP model (ViT-B/32)."""
    global _clip_model, _clip_processor, _model_failed
    if _clip_model is not None or _model_failed:
        return _clip_model, _clip_processor

    try:
        from transformers import CLIPProcessor, CLIPModel
        model_id = "openai/clip-vit-base-patch32"
        logger.info(f"🧠 Loading OpenAI CLIP Model ({model_id})...")
        _clip_processor = CLIPProcessor.from_pretrained(model_id)
        _clip_model = CLIPModel.from_pretrained(model_id)
        _clip_model.eval()
        logger.info("✅ OpenAI CLIP Model successfully initialized.")
        return _clip_model, _clip_processor
    except Exception as e:
        logger.warning(f"⚠️ OpenAI CLIP Model initialization deferred/failed: {e}")
        _model_failed = True
        return None, None


def get_clip_similarity(text: str, image_path: str) -> float:
    """Calculates cosine similarity percentage (0.0 to 1.0) between text and image using OpenAI CLIP."""
    model, processor = _init_clip()
    if not model or not processor or not os.path.exists(image_path):
        return 0.5  # Fallback neutral score

    try:
        import torch
        image = Image.open(image_path).convert("RGB")
        inputs = processor(text=[text], images=image, return_tensors="pt", padding=True)
        with torch.no_grad():
            outputs = model(**inputs)
            logits_per_image = outputs.logits_per_image  # image-text similarity score
            probs = logits_per_image.softmax(dim=1)
            score = float(probs[0][0])
            return round(score, 4)
    except Exception as e:
        logger.error(f"Error calculating CLIP similarity: {e}")
        return 0.5


def rank_broll_candidates(text_prompt: str, candidate_image_paths: List[str]) -> List[Dict[str, Any]]:
    """
    Ranks B-roll candidate image frames against spoken text prompt using OpenAI CLIP embeddings.
    Returns sorted candidates with scores.
    """
    model, processor = _init_clip()
    if not model or not processor or not candidate_image_paths:
        return [{"path": p, "score": 0.5, "index": i} for i, p in enumerate(candidate_image_paths)]

    try:
        import torch
        valid_images = []
        valid_indices = []
        for idx, p in enumerate(candidate_image_paths):
            if os.path.exists(p):
                try:
                    img = Image.open(p).convert("RGB")
                    valid_images.append(img)
                    valid_indices.append(idx)
                except Exception:
                    pass

        if not valid_images:
            return [{"path": p, "score": 0.5, "index": i} for i, p in enumerate(candidate_image_paths)]

        inputs = processor(text=[text_prompt], images=valid_images, return_tensors="pt", padding=True)
        with torch.no_grad():
            outputs = model(**inputs)
            logits_per_text = outputs.logits_per_text  # text-to-image similarity
            probs = logits_per_text.softmax(dim=-1)[0]

        results = []
        for i, idx in enumerate(valid_indices):
            score = float(probs[i])
            results.append({
                "path": candidate_image_paths[idx],
                "score": round(score, 4),
                "index": idx
            })

        # Sort by similarity score descending
        results.sort(key=lambda x: x["score"], reverse=True)
        logger.info(f"✨ CLIP ranked {len(results)} B-roll candidates for query '{text_prompt[:30]}'. Top score: {results[0]['score'] if results else 0}")
        return results

    except Exception as e:
        logger.error(f"Error ranking B-roll candidates with CLIP: {e}")
        return [{"path": p, "score": 0.5, "index": i} for i, p in enumerate(candidate_image_paths)]


def compute_visual_harmony(speaker_frame_path: str, candidate_image_path: str) -> float:
    """
    Computes visual feature similarity between speaker frame and B-roll/graphic frame
    to ensure color and stylistic harmony.
    """
    model, processor = _init_clip()
    if not model or not processor or not os.path.exists(speaker_frame_path) or not os.path.exists(candidate_image_path):
        return 0.5

    try:
        import torch
        img1 = Image.open(speaker_frame_path).convert("RGB")
        img2 = Image.open(candidate_image_path).convert("RGB")
        
        inputs = processor(images=[img1, img2], return_tensors="pt", padding=True)
        with torch.no_grad():
            image_features = model.get_image_features(**inputs)
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            similarity = float(torch.mm(image_features[0:1], image_features[1:2].T)[0][0])
            return round(max(0.0, min(1.0, similarity)), 4)
    except Exception as e:
        logger.error(f"Error computing CLIP visual harmony: {e}")
        return 0.5
