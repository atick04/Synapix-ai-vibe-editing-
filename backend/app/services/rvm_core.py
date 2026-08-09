"""
Thin re-export of Robust Video Matting (PeterL1n) model code.
Vendored under app.services.rvm_model — weights live in backend/rvm_weights/.
"""
from app.services.rvm_model import MattingNetwork

__all__ = ["MattingNetwork"]
