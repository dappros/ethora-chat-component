/**
 * `pdf.worker.min.mjs` ships without typings (it is meant to be loaded as a
 * worker script, not imported). We import it as a module on purpose - see
 * helpers/pdf/loadPdfjs.ts for why - so it needs a declaration.
 */
declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs' {
  const workerModule: unknown;
  export = workerModule;
}
