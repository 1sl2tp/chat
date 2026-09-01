import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const javaDir = path.join(root, 'android/app/src/main/java/xyz/taphoa/chat')
const pluginSource = path.join(root, 'native/android/AudioRoutePlugin.java')
const pluginTarget = path.join(javaDir, 'AudioRoutePlugin.java')
const activityTarget = path.join(javaDir, 'MainActivity.java')
const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml')

await mkdir(javaDir, { recursive: true })
await copyFile(pluginSource, pluginTarget)

await writeFile(activityTarget, `package xyz.taphoa.chat;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AudioRoutePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`)

let manifest = await readFile(manifestPath, 'utf8')
const permissions = [
  '    <uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
]

for (const permission of permissions) {
  if (manifest.includes(permission)) continue
  const manifestStart = manifest.indexOf('<manifest')
  const manifestOpenEnd = manifestStart >= 0 ? manifest.indexOf('>', manifestStart) : -1
  if (manifestOpenEnd < 0) throw new Error('android_manifest_open_tag_missing')
  manifest = `${manifest.slice(0, manifestOpenEnd + 1)}\n${permission}${manifest.slice(manifestOpenEnd + 1)}`
}

await writeFile(manifestPath, manifest)
console.log('Android AudioRoute plugin registered with RECORD_AUDIO + MODIFY_AUDIO_SETTINGS')
