# Migration Guide for Ethora Chat Component

This guide helps you migrate your application to the latest version of the Ethora Chat Component, which includes major version updates of several dependencies.

## Prerequisites

### Node.js Requirements
- **Required**: Node.js version 18 or higher
- **Action Required**: 
  ```bash
  # Check your Node.js version
  node --version
  
  # Update Node.js if needed
  # Using nvm (recommended):
  nvm install 18
  nvm use 18
  
  # Or download from nodejs.org
  ```

## Major Changes Overview

### 1. Vite Update (5.x → 6.2.0)

#### Breaking Changes
- Node.js 18+ requirement
- Module preload disabled by default
- New CSS minification defaults
- Worker imports syntax changes

#### Required Actions
1. Update Vite configuration:
   ```typescript
   // vite.config.ts
   export default defineConfig({
     build: {
       // Enable if you need module preload
       modulePreload: true,
       
       // Use esbuild for CSS if preferred over lightningcss
       cssMinify: 'esbuild'
     },
     
     // Configure strict filesystem if needed
     server: {
       fs: {
         strict: false // disable if you need broader file access
       }
     }
   })
   ```

2. Update worker imports:
   ```typescript
   // Old format
   new Worker('worker.js')
   
   // New format
   new Worker(new URL('./worker.js', import.meta.url))
   ```

### 2. Firebase Update (10.x → 11.4.0)

#### Breaking Changes
- Node.js version requirements
- Authentication flow changes
- Firestore API updates
- Storage and Functions changes

#### Required Actions
1. Update Authentication:
   ```typescript
   // Review and update phone authentication
   const auth = getAuth();
   
   // Old format
   await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
   
   // New format - check for new parameters/options
   await signInWithPhoneNumber(auth, phoneNumber, appVerifier, {
     // New options here
   });
   ```

2. Update Firestore Queries:
   ```typescript
   // Update docChanges usage
   // Old
   querySnapshot.docChanges()
   
   // New
   querySnapshot.docChanges
   
   // Review orderBy queries with startAt/endAt
   const q = query(
     collection(db, 'collection'),
     orderBy('field'),
     startAt(value)
   );
   ```

3. Review Storage Operations:
   ```typescript
   // Check file metadata handling
   const storageRef = ref(storage, 'path/to/file');
   const metadata = {
     contentType: 'image/jpeg',
     // Review other metadata properties
   };
   ```

### 3. vite-plugin-dts Update (3.x → 4.5.3)

#### Breaking Changes
- Type declaration generation changes
- Path alias handling updates
- Plugin lifecycle changes

#### Required Actions
1. Update Plugin Configuration:
   ```typescript
   // vite.config.ts
   import dts from 'vite-plugin-dts'
   
   export default defineConfig({
     plugins: [
       dts({
         // New v4 configuration
         insertTypesEntry: true,
         include: ['src/**/*.ts', 'src/**/*.tsx'],
         exclude: ['src/**/*.spec.ts'],
         
         // Add any specific options needed
         rollupTypes: true,
         staticImport: true,
         
         // Path alias handling
         pathsToAliases: true
       })
     ]
   })
   ```

2. Review TypeScript Configuration:
   ```json
   // tsconfig.json
   {
     "compilerOptions": {
       // Ensure path aliases are correctly configured
       "paths": {
         "@/*": ["./src/*"]
       },
       // Other required options
       "types": ["vite/client"]
     }
   }
   ```

## Testing Your Migration

1. Clean Installation
   ```bash
   # Remove old dependencies
   rm -rf node_modules
   rm package-lock.json
   
   # Fresh install
   npm install
   ```

2. Build Verification
   ```bash
   # Build the project
   npm run build
   
   # Check for type generation
   npm run build:lib
   ```

3. Runtime Verification
   ```bash
   # Start development server
   npm run dev
   
   # Preview production build
   npm run preview
   ```

## Common Issues and Solutions

### Vite Build Issues
- **Issue**: Module preload errors
  - **Solution**: Enable modulePreload in Vite config if needed
  
- **Issue**: CSS minification differences
  - **Solution**: Switch back to esbuild for CSS if lightningcss causes issues

### Firebase Issues
- **Issue**: Authentication flow breaks
  - **Solution**: Review and update auth state persistence settings
  
- **Issue**: Firestore query errors
  - **Solution**: Update query syntax and check for deprecated method usage

### Type Generation Issues
- **Issue**: Missing type declarations
  - **Solution**: Check dts plugin configuration and include paths
  
- **Issue**: Path alias resolution fails
  - **Solution**: Verify tsconfig.json paths and plugin pathsToAliases setting

## Need Help?

If you encounter issues during migration:
1. Check our [GitHub Issues](https://github.com/dappros/ethora-chat-component/issues)
2. Join our [Discord Community](https://discord.gg/Sm6bAHA3ZC)
3. Review the detailed documentation for each package:
   - [Vite Documentation](https://vitejs.dev/)
   - [Firebase Documentation](https://firebase.google.com/docs)
   - [vite-plugin-dts Documentation](https://github.com/qmhc/vite-plugin-dts) 