"""
Google Colab / Cloud GPU Training Script for Sonar Debris Detection (SIH26057)
Dataset: rehan9599/drishti-sss (HuggingFace)

Instructions for Google Colab:
1. Open Google Colab (https://colab.research.google.com).
2. Set Runtime -> Change runtime type -> Hardware accelerator -> GPU (T4 or higher).
3. Paste and run this script or upload this file.
4. Download the generated 'best.pt' and 'best.onnx' from the 'runs/' folder and place into your local 'models/weights/' directory.
"""

import os
import shutil
import yaml
from huggingface_hub import snapshot_download
from ultralytics import YOLO

def main():
    print("==================================================")
    print(" 🌊 DRISHTI SSS Sonar Debris Detector Training")
    print(" Smart India Hackathon 2026 - Problem Statement 26057")
    print("==================================================")

    # 1. Download drishti-sss dataset from HuggingFace to temporary cloud storage
    dataset_dir = "/content/drishti_dataset"
    print(f"\n[Step 1/4] Pulling 'rehan9599/drishti-sss' dataset from Hugging Face into {dataset_dir}...")
    snapshot_download(
        repo_id="rehan9599/drishti-sss",
        repo_type="dataset",
        local_dir=dataset_dir,
        ignore_patterns=[".git*", "*.parquet", "*.md"]
    )
    print("✓ Dataset downloaded successfully!")

    # 2. Configure YOLO dataset YAML
    data_yaml_path = os.path.join(dataset_dir, "drishti_colab.yaml")
    dataset_cfg = {
        'path': dataset_dir,
        'train': 'train/images',
        'val': 'val/images',
        'test': 'test/images',
        'names': {
            0: 'crab_pot',  # Note: Class 0 excluded in dataset, label files use 1-4
            1: 'submarine_pipeline',
            2: 'shipwreck',
            3: 'ghost_net',
            4: 'mine_cylinder'
        }
    }
    
    with open(data_yaml_path, 'w') as f:
        yaml.dump(dataset_cfg, f, default_flow_style=False)
    print(f"\n[Step 2/4] Created dataset configuration at: {data_yaml_path}")

    # 3. Initialize & Train YOLO Model
    print("\n[Step 3/4] Initializing YOLOv8s pretrained model and starting training on GPU...")
    model = YOLO("yolov8s.pt")  # Start with pretrained YOLOv8-small

    # Train with acoustic-optimized hyperparameters
    results = model.train(
        data=data_yaml_path,
        epochs=80,             # Can be adjusted based on available Colab runtime
        imgsz=640,
        batch=16,
        mosaic=1.0,            # High mosaic for debris in varying backgrounds
        mixup=0.15,            # Acoustic highlight blending
        fliplr=0.5,            # Port/starboard swath invariance
        flipud=0.0,            # Avoid inverting acoustic shadow direction (top-to-bottom swath geometry)
        degrees=15.0,          # Seafloor heading variation
        scale=0.3,
        hsv_h=0.015,           # Minor intensity jitter (sonar is monochrome/pseudo-color)
        hsv_s=0.0,
        hsv_v=0.4,
        patience=20,
        device=0,              # Colab GPU
        name="drishti_yolov8s_run"
    )

    # 4. Validate and Export to ONNX for lightweight edge deployment
    print("\n[Step 4/4] Validating and exporting best model...")
    metrics = model.val(data=data_yaml_path, split="val")
    print(f"Validation mAP50: {metrics.box.map50:.4f}, mAP50-95: {metrics.box.map:.4f}")

    # Export to ONNX (optimized for CPU/Jetson/AUV Edge payload)
    onnx_path = model.export(format="onnx", dynamic=True, simplify=True)
    print(f"✓ Exported ONNX model to: {onnx_path}")

    best_pt_path = os.path.join(model.trainer.save_dir, "weights", "best.pt")
    print("\n🎉 Training Complete!")
    print(f"👉 Download PyTorch weights: {best_pt_path}")
    print(f"👉 Download ONNX weights: {onnx_path}")
    print("Place these weights into your local 'models/weights/' directory to use with the local Web Dashboard.")

if __name__ == "__main__":
    main()
