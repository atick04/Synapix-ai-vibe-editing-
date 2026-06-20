import os
import dotenv

_orig_load_dotenv = dotenv.load_dotenv

def custom_load_dotenv(*args, **kwargs):
    # Check if a custom path is already provided
    if not args and "dotenv_path" not in kwargs:
        # Search for .env.local traversing up from the current directory
        current_dir = os.path.abspath(os.path.dirname(__file__))
        for _ in range(5):
            candidate = os.path.join(current_dir, ".env.local")
            if os.path.exists(candidate):
                kwargs["dotenv_path"] = candidate
                break
            
            # Workspace root detection check
            if os.path.exists(os.path.join(current_dir, "backend")) and os.path.exists(os.path.join(current_dir, "frontend")):
                local_be = os.path.join(current_dir, "backend", ".env.local")
                if os.path.exists(local_be):
                    kwargs["dotenv_path"] = local_be
                    break
                local_root = os.path.join(current_dir, ".env.local")
                if os.path.exists(local_root):
                    kwargs["dotenv_path"] = local_root
                    break
            
            parent = os.path.dirname(current_dir)
            if parent == current_dir:
                break
            current_dir = parent
            
    return _orig_load_dotenv(*args, **kwargs)

# Apply the patch globally
dotenv.load_dotenv = custom_load_dotenv
