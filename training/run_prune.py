from pathlib import Path

from train_nsfw import count_images, prepare_data_dir, prune_invalid_images

p = Path("/mnt/c/Users/helmi/OneDrive/Bureau/PFE-Docs/data/nsfw_scraper/raw_data")
d = prepare_data_dir(p)
prune_invalid_images(d)
print("valid:", count_images(d))
