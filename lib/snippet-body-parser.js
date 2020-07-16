const syntax = atom.config.get("snippets.snippetSyntax");
const parserName = syntax === "LSP" ? "snippet-body" : "snippet-body-old";

let parser
try {
  parser = require(`./${parserName}`)
} catch (error) {
  const {allowUnsafeEval} = require('loophole')
  const fs = require('fs-plus')
  const PEG = require('pegjs')

  const grammarSrc = fs.readFileSync(require.resolve(`./${parserName}.pegjs`), 'utf8')
  parser = null
  allowUnsafeEval(() => parser = PEG.buildParser(grammarSrc))
}

module.exports = parser
