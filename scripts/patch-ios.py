import plistlib, pathlib, sys

plist_path = pathlib.Path(sys.argv[1])
with open(plist_path, 'rb') as f:
    pl = plistlib.load(f)

# Add microphone permission
pl['NSMicrophoneUsageDescription'] = 'Strumio necesita el micrófono para el afinador.'

# Add photo library permission (for profile photo)
pl['NSPhotoLibraryUsageDescription'] = 'Strumio necesita acceso a fotos para tu foto de perfil.'
pl['NSCameraUsageDescription'] = 'Strumio necesita la cámara para tu foto de perfil.'

# Add deep link URL scheme
if 'CFBundleURLTypes' not in pl:
    pl['CFBundleURLTypes'] = []
# Check if strumio scheme already exists
exists = False
for entry in pl['CFBundleURLTypes']:
    if 'strumio' in entry.get('CFBundleURLSchemes', []):
        exists = True
        break
if not exists:
    pl['CFBundleURLTypes'].append({
        'CFBundleURLName': 'com.strumio.app',
        'CFBundleURLSchemes': ['strumio']
    })

with open(plist_path, 'wb') as f:
    plistlib.dump(pl, f)
print('patched', plist_path)