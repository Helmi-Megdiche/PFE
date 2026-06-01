/**
 * Removes Eclipse/Buildship artifacts inside node_modules Android projects.
 * Those files can make Java LS import dependency folders as broken Eclipse
 * projects, which produces build-path and missing .settings errors in Cursor.
 */
const fs = require('fs');
const path = require('path');

const nodeModulesRoot = path.join(__dirname, '..', 'node_modules');
if (!fs.existsSync(nodeModulesRoot)) {
  process.exit(0);
}

const TARGET_PROJECT_DIRS = [
  '@react-native/gradle-plugin',
  '@react-native/gradle-plugin/react-native-gradle-plugin',
  '@react-native/gradle-plugin/settings-plugin',
  '@react-native-async-storage/async-storage/android',
  '@react-native-ml-kit/image-labeling/android',
  '@react-native-ml-kit/text-recognition/android',
];

function removePath(target) {
  if (!fs.existsSync(target)) {
    return;
  }
  const stats = fs.lstatSync(target);
  if (stats.isDirectory()) {
    fs.rmSync(target, { recursive: true, force: true });
    return;
  }
  fs.unlinkSync(target);
}

function cleanDir(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const name of ['bin', 'build', '.settings', '.project', '.classpath', '.factorypath']) {
    removePath(path.join(dir, name));
  }
}

for (const relativeDir of TARGET_PROJECT_DIRS) {
  cleanDir(path.join(nodeModulesRoot, relativeDir));
}
