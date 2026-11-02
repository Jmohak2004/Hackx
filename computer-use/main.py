"""Compatibility entry point; the maintained scoring API lives in server/computer-use."""
import importlib.util
import sys
from pathlib import Path

canonical = Path(__file__).resolve().parents[1] / "server" / "computer-use"
sys.path.insert(0, str(canonical))
spec = importlib.util.spec_from_file_location("hackx_scoring_api", canonical / "main.py")
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
app = module.app
