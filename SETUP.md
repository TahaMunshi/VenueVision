# Setup Instructions

## Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

## Installation Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

   This will install:
   - React and React DOM
   - Three.js and TypeScript types
   - Vite and development dependencies

2. **Add a test model (optional):**
   - Place a `.glb` model file in `/public/models/sample.glb`
   - Or update the model path in `src/components/ThreeScene.tsx` (line 45)

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   - Navigate to the URL shown in the terminal (typically `http://localhost:5173`)

## Troubleshooting

### If npm install fails:
- Try deleting `node_modules` and `package-lock.json`, then run `npm install` again
- On Windows, you may need to run PowerShell as Administrator if there are permission issues

### If the model doesn't load:
- Check the browser console for errors
- Verify the model path is correct
- Ensure the `.glb` file is in the `/public/models/` directory
- The component will show a green placeholder cube if the model fails to load

### Three.js import errors:
- If you see import errors, try using `three/examples/jsm/` instead of `three/addons/` in `ThreeScene.tsx`
- This depends on your Three.js version

## Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

