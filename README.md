# Messenger Explorer

A desktop application for browsing, searching, and exploring media from your Facebook and Messenger data exports.

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, shadcn/ui
- **Desktop**: Tauri 2
- **Backend**: Rust, SQLite
- **Build**: Vite

## Development

```sh
# Install dependencies
npm install

# Run in development mode
npm run tauri:dev

# Build for production
npm run tauri:build
```

## Features

- Import Facebook & Messenger data exports
- Gallery view with grid/list modes
- Filter by conversation, sender, file type, and timeline
- Search through message content
- View media with surrounding chat context
- Multi-language support (8 languages)
- All data stored locally — fully offline and private
