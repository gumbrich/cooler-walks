import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const platform = process.argv[2];
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
if (platform === 'ios') {
  if (process.platform !== 'darwin') throw new Error('An iOS build requires macOS and Xcode 26+.');
  run('xcodebuild', [
    '-project',
    'ios/App/App.xcodeproj',
    '-scheme',
    'App',
    '-configuration',
    'Debug',
    '-sdk',
    'iphonesimulator',
    '-destination',
    'generic/platform=iOS Simulator',
    '-derivedDataPath',
    'ios/DerivedData',
    'CODE_SIGNING_ALLOWED=NO',
    'ARCHS=arm64',
    'ONLY_ACTIVE_ARCH=YES',
    'build',
  ]);
} else if (platform === 'android') {
  const studioJava = '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
  const sdk = process.env.ANDROID_HOME ?? path.join(os.homedir(), 'Library/Android/sdk');
  const java = process.env.JAVA_HOME ?? (fs.existsSync(studioJava) ? studioJava : undefined);
  if (!fs.existsSync(sdk))
    throw new Error('Install Android SDK 36 and set ANDROID_HOME to its directory.');
  run(
    process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
    [':app:assembleDebug', '--console=plain'],
    {
      cwd: 'android',
      env: { ...process.env, ANDROID_HOME: sdk, ...(java ? { JAVA_HOME: java } : {}) },
    },
  );
} else throw new Error('Usage: node scripts/native-build.mjs ios|android');
