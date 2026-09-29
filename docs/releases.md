# Releasing notable

The Windows installer is published through GitHub Releases. The repository is configured as `Robin-Fire/notable` in `electron-builder.yml`.

1. Update the version in `package.json`.
2. Commit the change and create a tag matching the version, for example `v0.1.2`.
3. Push the commit and tag: `git push origin main --tags`.
4. GitHub Actions runs typecheck, tests, and the Windows installer build.

Installed copies check GitHub Releases for a newer version. They download it automatically and show an update action in the app when it is ready to install.
