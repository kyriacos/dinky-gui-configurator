# Dinky config preview

A preview for [dinky](https://dinky.rodeo/configuration/). Each setting restages empty windows on a Mac desktop, so you can see the layout before saving.

## Run

```bash
python3 server.py
```

Open http://127.0.0.1:8766. Python 3 is enough. Nothing to install.

The page reads `~/.config/dinky/dinky.toml`. **Write config** asks first, then changes only the keys you edited. Comments and the rest of the file stay. The current file is copied beside it before the write. dinky reloads on save. **Copy config** and **Download** leave the file alone.
