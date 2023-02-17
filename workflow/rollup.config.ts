import path from 'path';

import commonjs from '@rollup/plugin-commonjs';
import jsonModule from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import { wasm } from '@rollup/plugin-wasm';
import glob from 'glob';
import { Plugin, RollupOptions, TransformResult } from 'rollup';
import nodePolyfills from 'rollup-plugin-polyfill-node';

const input = Object.fromEntries(
  glob.sync(path.resolve(__dirname, 'src/**/!(*.d).ts'))
    .map((p) => ([path.relative(path.resolve(__dirname, 'src'), p), p])),
);

const noInputTreeshake: () => Plugin = () => ({
  name: 'no-input-treeshake',
  transform: (code, id) => {
    const res: TransformResult = {
      code,
      map: null, // keep original sourcemap
    };
    if (Object.values(input).includes(id)) {
      res.moduleSideEffects = 'no-treeshake';
    }
    return res;
  },
});

const rollupOptions: RollupOptions = {
  input,
  output: {
    dir: 'dist',
    entryFileNames: (entry) => entry.name.replace(/\.ts$/, '.js'),
    chunkFileNames: (chunk) => `libs/${chunk.name}.js`,
    format: 'esm',
    sourcemap: true,
    sourcemapExcludeSources: true,
    sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
      const absoluteSourcePath = path.resolve(sourcemapPath, relativeSourcePath);
      return path
        .relative(__dirname, absoluteSourcePath)
        .replace(/^dist\//, '');
    },
    globals: {
      self: 'this',
    },
  },
  treeshake: false,
  plugins: [
    replace({
      include: [
        'src/libs/wasmdoom/websockets-doom.js',
      ],
      delimiters: ['', ''],
      values: {
        'Date.now = dateNow;': 'var DoomDate = { now: dateNow };',
        'Date.now()': 'DoomDate.now()',
      },
    }),
    jsonModule(),
    nodeResolve({
      preferBuiltins: false,
    }),
    wasm(),
    commonjs({
      dynamicRequireTargets: [
        'node_modules/h264-mp4-encoder/embuild/dist/*.js',
      ],
    }),
    nodePolyfills(),
    typescript(),
    noInputTreeshake(),
  ],
};

export default rollupOptions;
