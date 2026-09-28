const [major, minor] = process.versions.node.split('.').map(Number);

if (major < 22 || (major === 22 && minor < 15)) {
  console.error(
    [
      `Unsupported Node.js ${process.version}.`,
      'The dev server (webpack-dev-server 6) needs Node 22.15 or newer.',
      'Use Node 22 LTS (22.15+) or Node 24 LTS, then rerun npm install.',
    ].join('\n')
  );
  process.exit(1);
}

if (major >= 25) {
  console.error(
    [
      `Unsupported Node.js ${process.version}.`,
      'Electron Forge 7 uses @electron/packager 18, whose zip extraction path is unreliable on Node 25+ and can stall or exit during macOS packaging.',
      'Use Node 22 LTS or Node 24 LTS, then rerun npm install and npm run make -- --platform darwin.',
    ].join('\n')
  );
  process.exit(1);
}
