#!/usr/bin/env python3
"""Build the data behind the homepage portrait figure.

The hero figure cuts the portrait into a GRID x GRID patch grid and can
rearrange those patches by where a vision model puts them in feature space.
This script produces both inputs the page needs:

  images/portrait.webp          square crop used as the photo and the WebGL texture
  assets/data/patch-field.json  one 3-D coordinate per patch (row-major order)

Usage (needs torch, torchvision, scikit-learn, numpy, pillow):

  python tools/build_patch_field.py
  python tools/build_patch_field.py --backbone resnet50 --weights path/to/resnet50.pth

The default backbone is DINOv2 ViT-S/14, a self-supervised vision transformer
loaded through torch.hub (the first run downloads its code and ~85 MB of
weights); patch features are its final patch tokens. `--backbone resnet50`
uses the layer-3 activations of a torchvision ResNet-50 instead. Features are
embedded in three dimensions with t-SNE (or PCA with --projection pca). The
page prints the model and projection in the figure caption, so it always
states what was run.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import torch
import torchvision
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MEAN = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1)
STD = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)


def square_crop(img: Image.Image, x_bias: float = 0.62) -> Image.Image:
    """Largest square, shifted horizontally so the subject sits near centre."""
    w, h = img.size
    side = min(w, h)
    x0 = int((w - side) * x_bias)
    y0 = int((h - side) * 0.0)
    return img.crop((x0, y0, x0 + side, y0 + side))


def to_tensor(img: Image.Image, size: int) -> torch.Tensor:
    x = np.asarray(img.resize((size, size), Image.BICUBIC), dtype=np.float32) / 255.0
    return (torch.from_numpy(x.copy()).permute(2, 0, 1)[None] - MEAN) / STD


def dinov2_features(img: Image.Image, grid: int, weights: Path | None) -> np.ndarray:
    """Final patch tokens of DINOv2 ViT-S/14, as a (grid*grid, C) array, row-major."""
    model = torch.hub.load("facebookresearch/dinov2", "dinov2_vits14").eval()
    with torch.no_grad():
        tokens = model.forward_features(to_tensor(img, grid * 14))["x_norm_patchtokens"]
    return tokens[0].numpy()


def resnet50_features(img: Image.Image, grid: int, weights: Path | None) -> np.ndarray:
    """Layer-3 activations (stride 16) of a ResNet-50, as a (grid*grid, C) array, row-major."""
    if weights is None:
        raise SystemExit("--backbone resnet50 needs --weights (a ResNet-50 state dict)")
    model = torchvision.models.resnet50()
    model.load_state_dict(torch.load(weights, map_location="cpu", weights_only=True))
    model.eval()
    with torch.no_grad():
        f = model.maxpool(model.relu(model.bn1(model.conv1(to_tensor(img, grid * 16)))))
        f = model.layer3(model.layer2(model.layer1(f)))
    return f[0].permute(1, 2, 0).reshape(grid * grid, -1).numpy()


BACKBONES = {"dinov2": ("DINOv2", dinov2_features), "resnet50": ("ResNet-50", resnet50_features)}


def pca3(features: np.ndarray) -> np.ndarray:
    """First three principal components, each scaled to unit variance."""
    centred = features - features.mean(axis=0)
    u, s, _ = np.linalg.svd(centred, full_matrices=False)
    coords = u[:, :3] * s[:3]
    return coords / coords.std(axis=0)


def tsne3(features: np.ndarray, seed: int = 0) -> np.ndarray:
    """3-D t-SNE of the features (after a 50-component PCA, as usual)."""
    from sklearn.decomposition import PCA
    from sklearn.manifold import TSNE

    reduced = PCA(n_components=50, random_state=seed).fit_transform(features)
    coords = TSNE(n_components=3, perplexity=30, init="pca", random_state=seed).fit_transform(reduced)
    return coords - coords.mean(axis=0)


PROJECTIONS = {"tsne": ("t-SNE", tsne3), "pca": ("PCA", pca3)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=ROOT / "images" / "me3.jpeg")
    parser.add_argument("--backbone", choices=sorted(BACKBONES), default="dinov2")
    parser.add_argument("--weights", type=Path, help="ResNet-50 state dict (.pth), for --backbone resnet50")
    parser.add_argument("--grid", type=int, default=20, help="patches per side")
    parser.add_argument("--projection", choices=sorted(PROJECTIONS), default="tsne")
    parser.add_argument("--texture-size", type=int, default=1024)
    args = parser.parse_args()

    crop = square_crop(Image.open(args.source).convert("RGB"))
    texture = crop.resize((args.texture_size, args.texture_size), Image.LANCZOS)
    texture.save(ROOT / "images" / "portrait.webp", quality=84, method=6)

    label, project = PROJECTIONS[args.projection]
    model_label, features = BACKBONES[args.backbone]
    coords = project(features(crop, args.grid, args.weights))
    # Centre the cloud on its bulk and fit it in a unit ball. Percentiles keep
    # a few outliers from shifting or shrinking everything else.
    low, high = np.percentile(coords, [2, 98], axis=0)
    coords = coords - (low + high) / 2
    coords = coords / np.percentile(np.linalg.norm(coords, axis=1), 98)

    out = {
        "grid": args.grid,
        "model": model_label,
        "projection": label,
        "points": [[round(float(v), 3) for v in row] for row in coords],
    }
    target = ROOT / "assets" / "data" / "patch-field.json"
    target.write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(f"{args.grid}x{args.grid} patches -> {target.relative_to(ROOT)}, images/portrait.webp")


if __name__ == "__main__":
    main()
