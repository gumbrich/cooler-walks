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
if (platform === 'ios' || platform === 'ios-archive' || platform === 'ios-archive-unsigned') {
  if (process.platform !== 'darwin') throw new Error('An iOS build requires macOS and Xcode 26+.');
  const archive = platform !== 'ios';
  const signed = platform === 'ios-archive';
  if (archive && process.env.COOLER_DEV_DOWNLOADS === '1')
    throw new Error('Development downloads cannot be archived for release.');
  if (signed && !/^[A-Z0-9]{10}$/.test(process.env.APPLE_TEAM_ID ?? ''))
    throw new Error('Set APPLE_TEAM_ID to your enrolled developer team ID.');
  run('xcodebuild', [
    '-project',
    'ios/App/App.xcodeproj',
    '-scheme',
    'App',
    '-configuration',
    archive ? 'Release' : 'Debug',
    '-sdk',
    archive ? 'iphoneos' : 'iphonesimulator',
    '-destination',
    archive ? 'generic/platform=iOS' : 'generic/platform=iOS Simulator',
    '-derivedDataPath',
    'ios/DerivedData',
    ...(archive
      ? [
          '-archivePath',
          path.resolve(
            'native-artifacts',
            signed ? 'CoolerWalks.xcarchive' : 'CoolerWalks-unsigned.xcarchive',
          ),
        ]
      : []),
    ...(signed
      ? [`DEVELOPMENT_TEAM=${process.env.APPLE_TEAM_ID}`, 'CODE_SIGN_STYLE=Automatic']
      : ['CODE_SIGNING_ALLOWED=NO']),
    'ARCHS=arm64',
    'ONLY_ACTIVE_ARCH=YES',
    archive ? 'archive' : 'build',
  ]);
} else if (['android', 'android-bundle', 'android-bundle-unsigned'].includes(platform)) {
  const studioJava = '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
  const sdk = process.env.ANDROID_HOME ?? path.join(os.homedir(), 'Library/Android/sdk');
  const java = process.env.JAVA_HOME ?? (fs.existsSync(studioJava) ? studioJava : undefined);
  if (!fs.existsSync(sdk))
    throw new Error('Install Android SDK 36 and set ANDROID_HOME to its directory.');
  run(
    process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
    [
      platform === 'android' ? ':app:assembleDebug' : ':app:bundleRelease',
      ...(platform === 'android-bundle-unsigned' ? ['-PcoolerUnsigned=true'] : []),
      '--console=plain',
    ],
    {
      cwd: 'android',
      env: { ...process.env, ANDROID_HOME: sdk, ...(java ? { JAVA_HOME: java } : {}) },
    },
  );
} else
  throw new Error(
    'Usage: native-build.mjs ios|android|ios-archive[-unsigned]|android-bundle[-unsigned]',
  );
