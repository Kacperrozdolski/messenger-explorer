# CLIP Model Files

Place the following files in this directory for AI Search to work:

1. **clip-visual.onnx** — CLIP visual encoder (image → embedding)
2. **clip-textual.onnx** — CLIP text encoder (text → embedding)
3. **tokenizer.json** — HuggingFace tokenizer config for CLIP

## Recommended: CLIP ViT-B/32 (quantized INT8)

You can export these from HuggingFace's `openai/clip-vit-base-patch32` model:

```python
# Install dependencies
pip install transformers optimum onnx onnxruntime

# Export visual encoder
from transformers import CLIPModel, CLIPProcessor
from optimum.onnxruntime import ORTModelForCustomTasks
import torch

model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

# Export visual encoder
dummy_image = torch.randn(1, 3, 224, 224)
torch.onnx.export(
    model.vision_model,
    dummy_image,
    "clip-visual.onnx",
    input_names=["pixel_values"],
    output_names=["image_embeds"],
    dynamic_axes={"pixel_values": {0: "batch"}},
    opset_version=14,
)

# Export text encoder
dummy_ids = torch.zeros(1, 77, dtype=torch.long)
torch.onnx.export(
    model.text_model,
    dummy_ids,
    "clip-textual.onnx",
    input_names=["input_ids"],
    output_names=["text_embeds"],
    dynamic_axes={"input_ids": {0: "batch"}},
    opset_version=14,
)

# Save tokenizer
processor.tokenizer.save_pretrained(".")
# This creates tokenizer.json
```

Alternatively, use `optimum-cli` to export:
```bash
optimum-cli export onnx --model openai/clip-vit-base-patch32 --task feature-extraction clip-onnx/
```

## Quantization (optional, reduces size ~4x)

```python
from onnxruntime.quantization import quantize_dynamic, QuantType

quantize_dynamic("clip-visual.onnx", "clip-visual.onnx", weight_type=QuantType.QInt8)
quantize_dynamic("clip-textual.onnx", "clip-textual.onnx", weight_type=QuantType.QInt8)
```
