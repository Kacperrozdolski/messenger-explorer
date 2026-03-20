# CLIP Model Files

Place the following files in this directory for AI Search to work:

1. **clip-visual.onnx** — CLIP ViT-B/32 visual encoder (image → 512-dim embedding)
2. **clip-textual.onnx** — Multilingual DistilBERT text encoder (text → 768-dim token embeddings)
3. **tokenizer.json** — HuggingFace tokenizer for the text encoder
4. **dense.safetensors** — Dense projection weights (768 → 512 dimensions)
5. **onnxruntime.dll** — ONNX Runtime shared library (Windows)

## Model: clip-ViT-B-32-multilingual-v1

This app uses the **sentence-transformers/clip-ViT-B-32-multilingual-v1** model architecture:
- Visual encoder: OpenAI CLIP ViT-B/32 (outputs 512-dim embeddings)
- Text encoder: DistilBERT multilingual (outputs 768-dim, projected to 512 via dense layer)

This allows multilingual text search over images.

## Export script

```python
# Install dependencies
pip install sentence-transformers transformers torch onnx safetensors

from sentence_transformers import SentenceTransformer
import torch
import json

model = SentenceTransformer("sentence-transformers/clip-ViT-B-32-multilingual-v1")

# 1. Export visual encoder (CLIP ViT-B/32)
visual = model[0].model.vision_model
dummy_image = torch.randn(1, 3, 224, 224)
torch.onnx.export(
    visual,
    dummy_image,
    "clip-visual.onnx",
    input_names=["pixel_values"],
    output_names=["image_embeds"],
    dynamic_axes={"pixel_values": {0: "batch_size"}},
    opset_version=14,
)

# 2. Export text encoder (DistilBERT)
textual = model[0].model.text_model  # or model[0].auto_model
dummy_ids = torch.zeros(1, 128, dtype=torch.long)
dummy_mask = torch.ones(1, 128, dtype=torch.long)
torch.onnx.export(
    textual,
    (dummy_ids, dummy_mask),
    "clip-textual.onnx",
    input_names=["input_ids", "attention_mask"],
    output_names=["last_hidden_state"],
    dynamic_axes={
        "input_ids": {0: "batch_size", 1: "sequence_length"},
        "attention_mask": {0: "batch_size", 1: "sequence_length"},
    },
    opset_version=14,
)

# 3. Save tokenizer
model.tokenizer.save_pretrained(".")

# 4. Save dense projection weights
from safetensors.torch import save_file
dense_layer = model[2]  # Dense layer in the sentence-transformer pipeline
save_file({"linear.weight": dense_layer.linear.weight.data}, "dense.safetensors")
```

## ONNX Runtime DLL

Download `onnxruntime.dll` (v1.20.x) from:
https://github.com/microsoft/onnxruntime/releases

Extract `onnxruntime.dll` from the appropriate release archive for your platform.
