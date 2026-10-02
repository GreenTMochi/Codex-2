const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
// Older regression files use CommonJS despite this project's ESM package.
for (const name of ['qa-offline-pipeline.js', 'qa-revert-stage.js', 'qa-account-sync.cjs', 'qa-subunit-hierarchy.cjs', 'qa-full-pass.cjs', 'qa-manual-assessment.cjs', 'qa-assessment-page.cjs', 'qa-testing-zones.cjs', 'qa-element-matrix.cjs', 'qa-blueprints.cjs', 'qa-post-assessment.cjs', 'qa-preset-assignments.cjs', 'qa-page-render.cjs', 'qa-blank-mle.cjs', 'qa-assessment-technique-usage.cjs']) {
  const filename = path.join(__dirname, name);
  const test = new Module(filename, module);
  test.filename = filename;
  test.paths = Module._nodeModulePaths(__dirname);
  test._compile(fs.readFileSync(filename, 'utf8'), filename);
}
