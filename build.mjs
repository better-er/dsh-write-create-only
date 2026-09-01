/**
 * 构建脚本：TS 源码 -> 可部署产物。
 *
 * 本插件是纯 host 端插件，无 client 半身，因此只产出一个 lib/index.js，
 * 由 dsh Node 进程通过 exports["."] / main 加载。
 *
 * 前置：`npm install` 拉 esbuild 到 ./node_modules。
 */
import { build, context } from 'esbuild';
import { fileURLToPath } from 'node:url';

const watch = process.argv.includes('--watch');

const nodePaths = [fileURLToPath(new URL('./node_modules', import.meta.url))];

const hostOptions = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  nodePaths,
  outfile: 'lib/index.js',
  sourcemap: true,
  logLevel: 'info',
  // 保留 UTF-8 源码字符，默认 ascii 会把中文注释/字符串转成 \uXXXX，产物难读
  charset: 'utf8',
};

if (watch) {
  await (await context(hostOptions)).watch();
  console.log('[build] watching src/ for changes...');
} else {
  await build(hostOptions);
}
