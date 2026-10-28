import sys, os, json
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else "assets/icon-1024.png"
img = Image.open(src).convert("RGBA")

# Android mipmap sizes
android_sizes = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
for dir_name, size in android_sizes.items():
    out_dir = os.path.join("android", "app", "src", "main", "res", dir_name)
    os.makedirs(out_dir, exist_ok=True)
    resized = img.resize((size, size), Image.LANCZOS)
    resized.save(os.path.join(out_dir, "ic_launcher.png"))
    resized.save(os.path.join(out_dir, "ic_launcher_round.png"))
    print(f"Android {dir_name} -> {size}x{size}")

# iOS sizes
ios_sizes = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024]
ios_dir = os.path.join("ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset")
os.makedirs(ios_dir, exist_ok=True)
for size in ios_sizes:
    resized = img.resize((size, size), Image.LANCZOS)
    resized.save(os.path.join(ios_dir, f"icon-{size}.png"))
    print(f"iOS {size}x{size}")

# Play Store 512x512
play = img.resize((512, 512), Image.LANCZOS)
play.save("assets/icon-512.png")
print("Play Store 512x512 saved")

# iOS Contents.json
contents = {"images": [], "info": {"author": "xcode", "version": 1}}
mapping = [
    (20, "iphone", "2x", "icon-40.png"),
    (20, "iphone", "3x", "icon-60.png"),
    (29, "iphone", "2x", "icon-58.png"),
    (29, "iphone", "3x", "icon-87.png"),
    (40, "iphone", "2x", "icon-80.png"),
    (40, "iphone", "3x", "icon-120.png"),
    (60, "iphone", "2x", "icon-120.png"),
    (60, "iphone", "3x", "icon-180.png"),
    (76, "ipad", "1x", "icon-76.png"),
    (76, "ipad", "2x", "icon-152.png"),
    (83.5, "ipad", "2x", "icon-167.png"),
    (1024, "ios-marketing", "1x", "icon-1024.png"),
]
for sz, idiom, scale, fname in mapping:
    contents["images"].append({"size": f"{sz}x{sz}", "idiom": idiom, "filename": fname, "scale": scale})
with open(os.path.join(ios_dir, "Contents.json"), "w") as f:
    json.dump(contents, f, indent=2)
print("Contents.json written")

img.close()
print("Done")