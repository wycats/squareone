var Funnel = require('broccoli-funnel');
var concat = require('broccoli-sourcemap-concat');
var typescript = require('broccoli-typescript-compiler');
var transpile = require('broccoli-babel-transpiler');
var merge = require('broccoli-merge-trees');

var lib = build({ input: 'src', name: 'person', output: 'mine.js' });

var tests = new Funnel("tests", { include: ['**/*-test.ts'] });
tests = build({ input: tests, name: 'tests', output: 'tests.js' });

module.exports = merge([lib, tests, "public", "node_modules/qunitjs/qunit"]);

function build(options) {
  var input = new Funnel(options.input, {
    destDir: options.name,
    exclude: ['**/*.d.ts', '**/node_modules']
  });

  var ts = typescript(input);

  var transpiled = transpile(ts, {
    sourceMaps: 'inline',
    modules: 'amdStrict',
    moduleId: true
  });

  return concat(transpiled, {
    inputFiles: ['**/*.js'],
    outputFile: options.output
  });
}