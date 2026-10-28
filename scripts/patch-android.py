import re, pathlib, sys

manifest = pathlib.Path(sys.argv[1])
s = manifest.read_text(encoding='utf-8')

# 1. Add permissions before </manifest>
perms = '''    <!-- Permissions -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.VIBRATE" />
'''
# Remove existing permissions block if present
s = re.sub(r'    <!-- Permissions -->\n(?:    <uses-permission[^>]* />\n)*', '', s)
s = s.replace('</manifest>', perms + '</manifest>', 1)

# 2. Add deep link intent-filter after LAUNCHER intent-filter
deep = '''            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="strumio" android:host="callback" />
            </intent-filter>
'''
if 'android:scheme="strumio"' not in s:
    s = s.replace(
        '            </intent-filter>\n\n        </activity>',
        '            </intent-filter>\n\n' + deep + '        </activity>',
        1
    )

manifest.write_text(s, encoding='utf-8')
print('patched', manifest)