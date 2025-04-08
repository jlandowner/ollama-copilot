/* eslint-disable no-undef */
// eslint-disable-next-line @typescript-eslint/no-var-requires
import esbuild from 'esbuild';

(async () => {
  const extensionConfig = {
    bundle: true,
    entryPoints: ['src/extension.ts'],
    external: ['vscode', 'esbuild', './xhr-sync-worker.js', 'sodium-native', 'udx-native', 'b4a'],
    format: 'cjs',
    outdir: 'out',
    platform: 'node',
    sourcemap: true,
    loader: { '.node': 'file' },
    assetNames: '[name]',
  };

  const webConfig = {
    bundle: true,
    external: ['vscode'],
    entryPoints: ['src/webview/index.tsx'],
    outfile: 'out/webview/index.js',
    sourcemap: true,
    plugins: [],
  };

  const flags = process.argv.slice(2);

  if (flags.includes('--watch')) {
    const webCtx = await esbuild.context(webConfig);
    const extCtx = await esbuild.context(extensionConfig);
    await webCtx.watch();
    await extCtx.watch();
  } else {
    await esbuild.build(webConfig);
    await esbuild.build(extensionConfig);
  }
})();
