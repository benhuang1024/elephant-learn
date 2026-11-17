import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');

const jsToTs = {
  name: 'js-to-ts',
  setup(build) {
    build.onResolve({ filter: /\.js$/ }, (args) => {
      if (args.kind === 'entry-point') return;
      const base = path.resolve(args.resolveDir, args.path);
      const ts = base.replace(/\.js$/, '.ts');
      if (fs.existsSync(ts)) return { path: ts };
      return undefined;
    });
  }
};

const res = await esbuild.build({
  entryPoints: [path.join(HERE, 'labs-src', 'zod-entry.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'SHARED',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  outfile: path.join(ROOT, 'html', 'assets', 'labs', 'shared-bundle.js'),
  logLevel: 'warning',
  nodePaths: [path.join(HERE, 'node_modules')],
  plugins: [jsToTs],
  define: { 'process.env.NODE_ENV': '"production"' }
});
const st = fs.statSync(path.join(ROOT, 'html', 'assets', 'labs', 'shared-bundle.js'));
console.log('shared-bundle.js', (st.size / 1024).toFixed(1), 'KB', res.errors.length ? res.errors : '');