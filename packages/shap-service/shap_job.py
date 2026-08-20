"""
NEST ÉLANCE — SHAP Computation Job
Deployed on Modal.com as nest-elance-shap.
Computes Shapley values for a given score snapshot.
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../packages/scoring-engine"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../scripts"))

import numpy as np
from typing import Any

_HERE = os.path.dirname(__file__)

try:
    import modal
    stub = modal.App("nest-elance-shap")
    image = (
        modal.Image.debian_slim()
        .pip_install("shap==0.45.1", "numpy", "scipy", "pyyaml", "scikit-learn")
        # engine.py/questions.py, materiality/capping/threshold YAMLs, and the
        # synthetic background-profile generator all live outside this
        # directory — Modal only ever mounts shap_job.py itself by default,
        # so without these the deployed function fails at import time with
        # "No module named 'engine'"/"'seed_synthetic_profiles'".
        .add_local_dir(os.path.join(_HERE, "../scoring-engine"), remote_path="/root/scoring_engine")
        .add_local_dir(os.path.join(_HERE, "../config"), remote_path="/root/config")
        .add_local_dir(os.path.join(_HERE, "../../scripts"), remote_path="/root/scripts")
    )
except ImportError:
    # Local dev fallback — modal not required
    stub = None
    image = None


def _predict_wrapper(responses_list: list[dict], sector_group: str) -> np.ndarray:
    """Wraps score_company for SHAP KernelExplainer."""
    from engine import score_company
    scores = []
    for resp in responses_list:
        result = score_company(resp, sector_group)
        scores.append(result.overall_score)
    return np.array(scores)


def compute_shap(
    snapshot_id: str,
    responses: dict[str, Any],
    sector_group: str,
) -> dict:
    """
    Computes SHAP values for a company's responses.

    Returns:
        {
            "snapshot_id": str,
            "baseline_score": float,
            "shap_values": {question_id: float},
            "top_drivers": [{"question_id": str, "impact": float, "direction": str}],
        }
    """
    # On Modal, dependencies were baked in under /root/* (see the Image
    # definition above) rather than living next to this file as they do
    # locally — add both so this works either way. engine.py reads
    # CONFIG_DIR at import time, so this must happen before the import.
    for remote_path in ("/root/scoring_engine", "/root/scripts"):
        if os.path.isdir(remote_path) and remote_path not in sys.path:
            sys.path.insert(0, remote_path)
    if os.path.isdir("/root/config"):
        os.environ.setdefault("CONFIG_DIR", "/root/config")

    from seed_synthetic_profiles import load_background
    from engine import score_company
    import shap

    # Load 100 synthetic background profiles
    background_profiles = load_background(sector_group, n=100)

    # Convert to feature array — use only numeric/bool question values
    question_ids = list(responses.keys())

    def to_array(profile: dict) -> list:
        return [float(profile.get(q, 0)) for q in question_ids]

    background_arr = np.array([to_array(p) for p in background_profiles])
    sample_arr = np.array([to_array(responses)])

    def predict(X: np.ndarray) -> np.ndarray:
        results = []
        for row in X:
            resp = {q: float(row[i]) for i, q in enumerate(question_ids)}
            r = score_company(resp, sector_group)
            results.append(r.overall_score)
        return np.array(results)

    # Baseline score
    baseline_score = float(np.mean(predict(background_arr)))

    # KernelExplainer
    explainer = shap.KernelExplainer(predict, background_arr)
    shap_vals = explainer.shap_values(sample_arr, nsamples=200)

    if hasattr(shap_vals, "tolist"):
        shap_flat = shap_vals[0].tolist()
    else:
        shap_flat = list(shap_vals[0])

    # Build result dict
    shap_dict = {question_ids[i]: round(float(v), 4) for i, v in enumerate(shap_flat)}

    # Top drivers sorted by absolute impact
    top_drivers = sorted(
        [{"question_id": q, "impact": abs(v), "direction": "positive" if v >= 0 else "negative"}
         for q, v in shap_dict.items()],
        key=lambda x: x["impact"],
        reverse=True,
    )[:10]

    return {
        "snapshot_id": snapshot_id,
        "baseline_score": round(baseline_score, 4),
        "shap_values": shap_dict,
        "top_drivers": top_drivers,
    }


# Modal deployment wrapper
if stub is not None:
    @stub.function(image=image, timeout=300)
    def run_shap(snapshot_id: str, responses: dict, sector_group: str) -> dict:
        return compute_shap(snapshot_id, responses, sector_group)
