# Bowlie

Bowlie is a cross-platform interactive desktop pet built with Vue 3, TypeScript, and Tauri 2. It provides two emotional-release interactions:

- **Singing bowl**: tap the bowl to generate a ripple layer and a synthesized bowl sound.
- **Golden hoop**: tap the character to increase pressure, hear the apology, and release gradually.

## Status

Bowlie is in early development (`0.1.2`). The apology uses the operating system's Chinese text-to-speech voice when available and falls back to in-app synthesized audio. No third-party voice recordings are bundled. macOS Apple Silicon, macOS Intel, and Windows x64 build support is included.

## Requirements

- Node.js 24+
- Rust stable toolchain
- Platform dependencies from the [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/)

## Development

```bash
cd app
npm install
npm run dev
```

## Verification

```bash
npm run test
npm run build
cd src-tauri && cargo fmt --check
```

## Release Build

```bash
npm run tauri build
```

GitHub Actions builds macOS arm64, macOS x64, and Windows x64 artifacts on every push to `main` and on pull requests. The macOS x64 artifact is cross-compiled on an arm64 runner.
Tag pushes starting with `v` create a GitHub Release with the same three-platform artifacts and a SHA256SUMS file.

## Security

Release artifacts are currently unsigned; macOS builds are not notarized and Windows SmartScreen may warn. See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

MIT © 2026 heangping
