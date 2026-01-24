# Tauri Linux build notes (Ubuntu 24.04)

- Ubuntu 24.04 ships WebKitGTK 4.1 only. Tauri 1.x expects `webkit2gtk-4.0` / `javascriptcoregtk-4.0` pkg-config + shared libs.
- `pkgconfig` folder in repo contains symlinks mapping 4.1 `.pc` files to 4.0 names.
- System-level compatibility symlinks were created so the linker can find `libwebkit2gtk-4.0.so` / `libjavascriptcoregtk-4.0.so`:
  - `/usr/lib/x86_64-linux-gnu/libwebkit2gtk-4.0.so -> libwebkit2gtk-4.1.so`
  - `/usr/lib/x86_64-linux-gnu/libwebkit2gtk-4.0.so.0 -> libwebkit2gtk-4.1.so.0`
  - `/usr/lib/x86_64-linux-gnu/libjavascriptcoregtk-4.0.so -> libjavascriptcoregtk-4.1.so`
  - `/usr/lib/x86_64-linux-gnu/libjavascriptcoregtk-4.0.so.0 -> libjavascriptcoregtk-4.1.so.0`
- A local `lib/` dir also has symlinks for 4.0 names pointing to the 4.1 libs, and `package.json` scripts set `LIBRARY_PATH=$PWD/lib:$LIBRARY_PATH` during builds (works without sudo).
- `package.json` scripts set `PKG_CONFIG_PATH=$PWD/pkgconfig:/usr/lib/x86_64-linux-gnu/pkgconfig` and `WEBKIT2GTK_4_1=1` for builds.
- Tauri scripts are currently disabled (heavy). `npm run tauri:dev` / `tauri:build` just echo; use `tauri:dev:orig` / `tauri:build:orig` to run the real commands.
- Japanese UI font: Noto Sans JP regular/bold are bundled under `frontend/public/fonts` and loaded via `@font-face` in `globals.css`.
- If you remove the symlinks or upgrade WebKit, adjust accordingly. Ideally upgrade Tauri/GTK bindings once 4.1+ is officially supported.
